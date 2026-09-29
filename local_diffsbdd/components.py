"""Coordinate-preserving ligand topology from wwPDB chemical-component records."""

import hashlib
import os
import re
import tempfile
from pathlib import Path
from threading import BoundedSemaphore
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, build_opener

import gemmi
from rdkit import Chem

from .config import DATA

COMPONENT = re.compile(r"^[A-Z0-9]{1,5}$")
MAX_CIF = 1_000_000
_downloads = BoundedSemaphore(2)
_BUNDLED = Path(__file__).parent / "data" / "components"


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def component_id(value):
    if not COMPONENT.fullmatch(value):
        raise ValueError("化学组分编号需为 1–5 位大写字母或数字。")
    return value


def parse_definition(text, identifier):
    component_id(identifier)
    try:
        block = gemmi.cif.read_string(text).sole_block()
        if gemmi.cif.as_string(block.find_value("_chem_comp.id")) != identifier:
            raise ValueError("化学组分编号与定义不一致。")

        def values(key):
            return [gemmi.cif.as_string(v) for v in block.find_values(key)]

        names = values("_chem_comp_atom.atom_id")
        elements = values("_chem_comp_atom.type_symbol")
        charges = values("_chem_comp_atom.charge")
        if (
            not names
            or len(names) > 1000
            or len(names) != len(set(names))
            or not (len(names) == len(elements) == len(charges))
        ):
            raise ValueError("化学组分的原子定义不完整。")
        atoms = {
            name: (element, int(charge))
            for name, element, charge in zip(names, elements, charges)
            if element not in {"H", "D"}
        }
        begin = values("_chem_comp_bond.atom_id_1")
        end = values("_chem_comp_bond.atom_id_2")
        order = values("_chem_comp_bond.value_order")
        if not (len(begin) == len(end) == len(order)):
            raise ValueError("化学组分的键定义不完整。")
        if any(a not in names or b not in names for a, b in zip(begin, end)):
            raise ValueError("化学组分的键引用了不存在的原子。")
        bonds = [
            (a, b, kind)
            for a, b, kind in zip(begin, end, order)
            if a in atoms and b in atoms
        ]
        return {
            "id": identifier,
            "atoms": atoms,
            "bonds": bonds,
            "sha256": hashlib.sha256(text.encode()).hexdigest(),
        }
    except (RuntimeError, TypeError, KeyError) as exc:
        raise ValueError("无法读取标准化学组分定义，请上传有正确键型的 SDF。") from exc


def load_definition(identifier):
    component_id(identifier)
    for directory in (_BUNDLED, DATA / "components"):
        path = directory / f"{identifier}.cif"
        if path.is_file():
            if not 0 < path.stat().st_size <= MAX_CIF:
                raise ValueError("本地化学组分定义大小异常。")
            return parse_definition(path.read_text(), identifier)
    return None


def download_definition(identifier):
    """Only an explicit UI action requests this public identifier; no coordinates leave."""
    component_id(identifier)
    existing = load_definition(identifier)
    if existing:
        return {"id": identifier, "source": "local", "sha256": existing["sha256"]}
    if not _downloads.acquire(blocking=False):
        raise ValueError("其他化学组分正在下载，请稍后重试。")
    try:
        url = f"https://files.rcsb.org/ligands/download/{identifier}.cif"
        with build_opener(_NoRedirect()).open(url, timeout=15) as response:
            if not response.url.startswith("https://files.rcsb.org/"):
                raise ValueError("化学组分来源发生变化，已停止下载。")
            content = response.read(MAX_CIF + 1)
        if not 0 < len(content) <= MAX_CIF:
            raise ValueError("化学组分定义大小异常。")
        definition = parse_definition(content.decode("utf-8"), identifier)
        directory = DATA / "components"
        directory.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            dir=directory, suffix=".tmp", delete=False
        ) as temporary:
            path = Path(temporary.name)
            temporary.write(content)
        try:
            os.replace(path, directory / f"{identifier}.cif")
        finally:
            path.unlink(missing_ok=True)
        return {"id": identifier, "source": url, "sha256": definition["sha256"]}
    except HTTPError as exc:
        raise ValueError("公开化学组分库未返回可用定义，请上传配体 SDF。") from exc
    except (URLError, TimeoutError, UnicodeError) as exc:
        raise ValueError("无法下载化学组分定义，请检查网络或上传配体 SDF。") from exc
    finally:
        _downloads.release()


def ligand_from_residue(residue):
    identifier = component_id(residue.resname.strip())
    definition = load_definition(identifier)
    if definition is None:
        return None, {
            "state": "needs_definition",
            "component": identifier,
            "message": f"{identifier} 缺少可靠键型。请获取标准定义或上传三维 SDF；当前不绘制猜测配体。",
        }
    coordinates = {
        a.name: a for a in residue.get_atoms() if a.element not in {"H", "D"}
    }
    expected = definition["atoms"]
    if set(coordinates) != set(expected):
        missing = sorted(set(expected) - set(coordinates))
        extra = sorted(set(coordinates) - set(expected))
        detail = (f"缺失 {', '.join(missing[:8])}" if missing else "") + (
            f"；额外 {', '.join(extra[:8])}" if extra else ""
        )
        return None, {
            "state": "incomplete",
            "component": identifier,
            "message": f"{identifier} 坐标与标准完整分子不匹配（{detail}）。请提供完整且对齐的 SDF。",
        }
    molecule = Chem.RWMol()
    names = list(expected)
    indices = {name: i for i, name in enumerate(names)}
    conformer = Chem.Conformer(len(names))
    conformer.Set3D(True)
    for name, (element, charge) in expected.items():
        if coordinates[name].element.upper() != element.upper():
            raise ValueError("配体原子元素与标准定义不一致。")
        atom = Chem.Atom(element)
        atom.SetFormalCharge(charge)
        molecule.AddAtom(atom)
        conformer.SetAtomPosition(
            indices[name], [float(x) for x in coordinates[name].coord]
        )
    orders = {
        "SING": Chem.BondType.SINGLE,
        "DOUB": Chem.BondType.DOUBLE,
        "TRIP": Chem.BondType.TRIPLE,
        "AROM": Chem.BondType.AROMATIC,
    }
    for a, b, kind in definition["bonds"]:
        if kind not in orders:
            raise ValueError("该配体含当前不支持的键型，请上传 SDF。")
        molecule.AddBond(indices[a], indices[b], orders[kind])
    molecule = molecule.GetMol()
    molecule.AddConformer(conformer)
    Chem.SanitizeMol(molecule)
    Chem.AssignStereochemistryFrom3D(molecule)
    return molecule, {
        "state": "verified",
        "component": identifier,
        "source": "wwPDB CCD",
        "sha256": definition["sha256"],
        "message": f"{identifier} 已按标准原子名称与键型校验，保留原始三维坐标。",
    }
