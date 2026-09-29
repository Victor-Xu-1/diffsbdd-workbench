"""Validate graphical edits and construct a traceable, aligned 3D starting pose."""

from datetime import datetime, timezone
import json
from uuid import uuid4

import numpy as np
from rdkit import Chem
from rdkit.Chem import AllChem, QED, rdFMCS, rdMolAlign

from .inputs import SUPPORTED_ELEMENTS
from .results import write_report


def transfer_coordinates(edited, original):
    """Keep an existing pose for atom substitutions / bond-order edits."""
    if (
        edited.GetNumAtoms() != original.GetNumAtoms()
        or edited.GetNumBonds() != original.GetNumBonds()
    ):
        return None
    topology = rdFMCS.FindMCS(
        [edited, original],
        timeout=3,
        atomCompare=rdFMCS.AtomCompare.CompareAny,
        bondCompare=rdFMCS.BondCompare.CompareAny,
        ringMatchesRingOnly=True,
    )
    if (
        topology.canceled
        or topology.numAtoms != edited.GetNumAtoms()
        or topology.numBonds != edited.GetNumBonds()
    ):
        return None
    query = Chem.MolFromSmarts(topology.smartsString)
    candidates = []
    for left in edited.GetSubstructMatches(query, uniquify=False, maxMatches=32):
        for right in original.GetSubstructMatches(query, uniquify=False, maxMatches=32):
            mapping = list(zip(left, right))
            score = sum(
                edited.GetAtomWithIdx(a).GetAtomicNum()
                == original.GetAtomWithIdx(b).GetAtomicNum()
                for a, b in mapping
            )
            candidates.append((score, mapping))
    if not candidates:
        return None
    _, mapping = max(candidates, key=lambda item: item[0])
    pose = Chem.Mol(edited)
    pose.RemoveAllConformers()
    conformer = Chem.Conformer(pose.GetNumAtoms())
    conformer.Set3D(True)
    for a, b in mapping:
        conformer.SetAtomPosition(a, original.GetConformer().GetAtomPosition(b))
    pose.AddConformer(conformer)
    molecule = Chem.AddHs(pose, addCoords=True)
    if not AllChem.UFFHasAllMoleculeParams(molecule):
        raise ValueError(
            "编辑结构缺少力场参数，无法调整三维起始构象。请修改结构后重试。"
        )
    field = AllChem.UFFGetMoleculeForceField(molecule)
    for a, b in mapping:
        if (
            pose.GetAtomWithIdx(a).GetAtomicNum()
            == original.GetAtomWithIdx(b).GetAtomicNum()
        ):
            field.UFFAddPositionConstraint(a, 0.3, 100.0)
    field.Initialize()
    field.Minimize(maxIts=200)
    return Chem.RemoveHs(molecule)


def aligned_edit(molblock, original):
    edited = Chem.MolFromMolBlock(molblock, sanitize=True, removeHs=True)
    if edited is None:
        raise ValueError("编辑结构未通过化学检查，请检查价态和化学键。")
    if not 8 <= edited.GetNumHeavyAtoms() <= 80 or len(Chem.GetMolFrags(edited)) != 1:
        raise ValueError("编辑结构需为单个连通分子，含 8–80 个重原子。")
    if any(a.GetSymbol().upper() not in SUPPORTED_ELEMENTS for a in edited.GetAtoms()):
        raise ValueError("编辑结构含当前模型不支持的元素。")
    canonical = Chem.MolToSmiles(edited)
    if canonical == Chem.MolToSmiles(original):
        return Chem.Mol(original), {
            "shared_atoms": original.GetNumHeavyAtoms(),
            "alignment_rmsd": 0.0,
            "changed": False,
        }
    match = rdFMCS.FindMCS(
        [edited, original],
        timeout=3,
        ringMatchesRingOnly=True,
        bondCompare=rdFMCS.BondCompare.CompareOrderExact,
    )
    if match.canceled:
        raise ValueError("共同骨架匹配超时，请减小编辑范围后重试。")
    core = Chem.MolFromSmarts(match.smartsString)
    if core is None or core.GetNumAtoms() < max(
        3, int(edited.GetNumHeavyAtoms() * 0.25)
    ):
        raise ValueError("共享骨架不足，无法将编辑结构可靠地对齐原口袋。")
    probe_atoms, reference_atoms = (
        edited.GetSubstructMatch(core),
        original.GetSubstructMatch(core),
    )
    atom_map = list(zip(probe_atoms, reference_atoms))
    embedded = transfer_coordinates(edited, original)
    placement = "coordinate transfer with restrained UFF"
    if embedded is None:
        placement = "distance geometry with core alignment"
        edited.RemoveAllConformers()
        embedded = Chem.AddHs(edited)
        if (
            AllChem.EmbedMolecule(
                embedded, randomSeed=2026, maxAttempts=20, useRandomCoords=True
            )
            != 0
        ):
            raise ValueError("未能为编辑结构构建三维构象，请减小编辑范围。")
        if AllChem.UFFHasAllMoleculeParams(embedded):
            AllChem.UFFOptimizeMolecule(embedded, maxIters=200)
        embedded = Chem.RemoveHs(embedded)
    rmsd = rdMolAlign.AlignMol(embedded, original, atomMap=atom_map)
    if not np.isfinite(embedded.GetConformer().GetPositions()).all():
        raise ValueError("编辑后的三维坐标无效。")
    if rmsd > 2.0:
        raise ValueError(f"共同骨架偏移过大（{rmsd:.2f} Å），请减小编辑范围。")
    return embedded, {
        "shared_atoms": len(atom_map),
        "alignment_rmsd": round(rmsd, 4),
        "changed": True,
        "placement": placement,
    }


def save_edit(manager, job_id, index, molblock, notes="", rating=0):
    with manager.lock:
        directory = manager.directory(job_id)
        supplier = Chem.SDMolSupplier(str(manager.result_file(job_id, "molecules.sdf")))
        if index < 0 or index >= len(supplier) or supplier[index] is None:
            raise ValueError("原始分子不存在。")
        molecule, alignment = aligned_edit(molblock, supplier[index])
        edit_id = uuid4().hex
        edits_dir = directory / "edits"
        edits_dir.mkdir(exist_ok=True)
        sdf = edits_dir / f"{edit_id}.sdf"
        molecule.SetProp("_Name", f"Edited_{edit_id[:8]}")
        with Chem.SDWriter(str(sdf)) as writer:
            writer.write(molecule)
        entry = {
            "id": edit_id,
            "parent_index": index,
            "smiles": Chem.MolToSmiles(molecule),
            "notes": notes,
            "rating": rating,
            "qed": round(QED.qed(molecule), 4),
            "created_at": datetime.now(timezone.utc).isoformat(),
            **alignment,
            "pose_status": "Aligned starting conformer; not a validated binding pose.",
        }
        history_file = directory / "edits.json"
        history = (
            json.loads(history_file.read_text())
            if history_file.exists()
            else {"edits": []}
        )
        history["edits"].append(entry)
        write_report(history_file, history)
        return entry


def edit_file(manager, job_id, edit_id):
    directory = manager.directory(job_id)
    if len(edit_id) != 32 or any(c not in "0123456789abcdef" for c in edit_id):
        raise ValueError("编辑版本不存在。")
    path = directory / "edits" / f"{edit_id}.sdf"
    if not path.is_file():
        raise ValueError("编辑版本不存在。")
    return path
