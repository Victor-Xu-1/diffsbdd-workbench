"""Persist generated molecules, basic measurements, and atomic run metadata."""

import json
from pathlib import Path

import numpy as np
from rdkit import Chem
from rdkit.Chem import AllChem, Crippen, Descriptors, QED, Lipinski
from rdkit.Contrib.SA_Score.sascorer import calculateScore


def write_report(path: Path, report: dict):
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    temporary.replace(path)


def assess_molecule(molecule, pocket_coords, allow_disconnected=False):
    mol = Chem.Mol(molecule)
    if mol.GetNumAtoms() == 0 or mol.GetNumConformers() != 1:
        return None, {"reason": "Missing atoms or 3D conformer"}
    positions = mol.GetConformer().GetPositions()
    if not np.isfinite(positions).all():
        return None, {"reason": "Non-finite generated coordinates"}
    try:
        Chem.SanitizeMol(mol)
    except (ValueError, RuntimeError) as exc:
        return None, {"reason": f"RDKit sanitization: {exc}"}
    if not allow_disconnected and len(Chem.GetMolFrags(mol)) != 1:
        return None, {
            "reason": "Disconnected molecule after largest-fragment selection"
        }
    distances = np.linalg.norm(
        positions[:, None, :] - pocket_coords[None, :, :], axis=-1
    )
    return mol, {
        "smiles": Chem.MolToSmiles(mol),
        "heavy_atoms": mol.GetNumHeavyAtoms(),
        "molecular_weight": round(Descriptors.MolWt(mol), 3),
        "qed": round(QED.qed(mol), 4),
        "logp": round(Crippen.MolLogP(mol), 4),
        "sa": round(calculateScore(mol), 4),
        "hbd": Lipinski.NumHDonors(mol),
        "hba": Lipinski.NumHAcceptors(mol),
        "tpsa": round(Descriptors.TPSA(mol), 2),
        "rotatable_bonds": Lipinski.NumRotatableBonds(mol),
        "fragments": len(Chem.GetMolFrags(mol)),
        "minimum_pocket_distance_angstrom": round(float(distances.min()), 4),
        "pocket_atom_pairs_under_1_2_angstrom": int((distances < 1.2).sum()),
    }


def process_candidate(molecule, options, pocket_coords):
    mol = Chem.Mol(molecule)
    if options.fragment_policy == "largest":
        mol = max(
            Chem.GetMolFrags(mol, asMols=True, sanitizeFrags=False),
            key=lambda m: m.GetNumAtoms(),
        )
    mol, measures = assess_molecule(
        mol, pocket_coords, options.fragment_policy == "all"
    )
    if mol is None or not options.relaxation:
        return mol, measures
    with_hydrogens = Chem.AddHs(mol, addCoords=True)
    if not AllChem.UFFHasAllMoleculeParams(with_hydrogens):
        return None, {"reason": "该结构缺少 UFF 力场参数，无法完成指定的构象松弛。"}
    convergence = AllChem.UFFOptimizeMolecule(
        with_hydrogens, maxIters=options.relaxation
    )
    mol, measures = assess_molecule(
        Chem.RemoveHs(with_hydrogens), pocket_coords, options.fragment_policy == "all"
    )
    if mol:
        measures["relaxation_converged"] = convergence == 0
    return mol, measures
