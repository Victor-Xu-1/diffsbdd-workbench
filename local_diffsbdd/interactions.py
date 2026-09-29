"""Typed, coordinate-preserving ProLIF analysis; never infer activity from contacts."""

from functools import lru_cache
from pathlib import Path
import tempfile
from threading import Lock
import warnings

import numpy as np
from pydantic import BaseModel, ConfigDict, Field
from rdkit import Chem

from .preparation import PreparationInput, prepare_structure
from .sampling import read_pose


class InteractionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    protein_text: str = Field(min_length=20, max_length=5_000_000)
    sdf: str = Field(min_length=20, max_length=1_000_000)


_analysis_lock = Lock()
KINDS = {
    "ImplicitHBDonor": ("hydrogen_bond", "配体供氢"),
    "ImplicitHBAcceptor": ("hydrogen_bond", "配体受氢"),
    "PiStacking": ("pi_stacking", "芳环堆积"),
    "Anionic": ("salt_bridge", "配体带负电"),
    "Cationic": ("salt_bridge", "配体带正电"),
    "Hydrophobic": ("hydrophobic", "疏水接触"),
}


@lru_cache(maxsize=4)
def _protein(text):
    from prolif.io import MoleculeStandardizer

    prepared = prepare_structure(
        PreparationInput(
            protein_text=text,
            remove_water=True,
            keep_ligands=False,
            remove_hydrogens=True,
        )
    )
    molecule = Chem.MolFromPDBBlock(prepared["protein"], sanitize=False, removeHs=True)
    if molecule is None or not 1 <= molecule.GetNumAtoms() <= 20000:
        raise ValueError("相互作用分析需要含 1–20000 个原子的蛋白结构。")
    with warnings.catch_warnings(record=True) as notices:
        warnings.simplefilter("always", UserWarning)
        molecule = MoleculeStandardizer()(molecule)
    incomplete = [
        str(notice.message)
        for notice in notices
        if "different number of heavy atoms" in str(notice.message)
    ]
    return molecule, len(incomplete)


def _position(molecule, indices):
    coords = molecule.GetConformer().GetPositions()[list(indices)]
    return [float(value) for value in coords.mean(axis=0)]


def inspect_interactions(payload):
    import prolif as plf

    # Aborting a superseded browser request does not stop its chemistry thread.
    # Allow the next view to wait briefly instead of reporting valid input as bad.
    if not _analysis_lock.acquire(timeout=10):
        raise ValueError("正在分析另一份结构，请稍后重试。")
    try:
        protein, incomplete = _protein(payload.protein_text)
        if incomplete:
            raise ValueError(
                f"蛋白有 {incomplete} 个残基缺少完整重原子；请先补全结构再分析相互作用。三维预览仍可使用。"
            )
        with tempfile.TemporaryDirectory(prefix="diffsbdd-interactions-") as directory:
            path = Path(directory) / "ligand.sdf"
            path.write_text(payload.sdf)
            ligand = plf.Molecule.from_rdkit(read_pose(path))
        fingerprint = plf.Fingerprint(
            [
                "HBDonor",
                "HBAcceptor",
                "PiStacking",
                "Anionic",
                "Cationic",
                "Hydrophobic",
            ],
            implicit_hydrogens=True,
            count=True,
        )
        pairs = fingerprint.generate(ligand, protein, metadata=True)
        records = []
        for (_, residue), kinds in pairs.items():
            for detected, entries in kinds.items():
                kind, label = KINDS[detected]
                # One shortest representative per residue and chemical interaction;
                # every actual detected pair remains counted in the report.
                closest = min(entries, key=lambda item: item["distance"])
                indices = closest["parent_indices"]
                protein_atoms = [protein.GetAtomWithIdx(i) for i in indices["protein"]]
                record = {
                    "kind": kind,
                    "label": label,
                    "detector": detected,
                    "residue": {
                        "chain": residue.chain or "",
                        "number": residue.number,
                        "name": residue.name,
                    },
                    "ligand_atoms": list(indices["ligand"]),
                    "protein_atoms": [
                        atom.GetPDBResidueInfo().GetName().strip()
                        for atom in protein_atoms
                    ],
                    "start": _position(
                        ligand,
                        indices["ligand"][:1]
                        if kind != "pi_stacking"
                        else indices["ligand"],
                    ),
                    "end": _position(
                        protein,
                        indices["protein"][:1]
                        if kind != "pi_stacking"
                        else indices["protein"],
                    ),
                    "distance": float(closest["distance"]),
                    "occurrences": len(entries),
                    "geometry": {
                        key: float(value)
                        for key, value in closest.items()
                        if key not in {"indices", "parent_indices"}
                        and isinstance(value, (int, float, np.number))
                    },
                }
                records.append(record)
        records.sort(key=lambda item: (item["kind"], item["distance"]))
        return {
            "engine": f"ProLIF {plf.__version__}",
            "method": "implicit_hydrogens",
            "note": "按标准氨基酸模板及隐式氢几何规则识别候选相互作用；不含水桥、金属配位和共价作用，未进行 pH 质子化计算、对接或能量评价。距离为重原子距离，芳环堆积为环心距离。",
            "criteria_source": "https://prolif.readthedocs.io/en/stable/_modules/prolif/interactions/interactions.html",
            "interactions": records,
            "summary": {
                kind: sum(item["kind"] == kind for item in records)
                for kind in (
                    "hydrogen_bond",
                    "pi_stacking",
                    "salt_bridge",
                    "hydrophobic",
                )
            },
        }
    except (KeyError, RuntimeError) as exc:
        raise ValueError(
            "当前结构无法完成化学标准化，请检查非标准残基、键型和缺失原子。"
        ) from exc
    finally:
        _analysis_lock.release()
