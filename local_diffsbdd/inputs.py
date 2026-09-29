"""Validate local PDB/SDF data before loading the GPU model."""

from pathlib import Path
import re

import numpy as np
from Bio.PDB import PDBParser
from Bio.PDB.Polypeptide import is_aa
from rdkit import Chem

RESIDUE = re.compile(r"^[A-Za-z0-9]:-?\d+$")
MAX_FILE_BYTES = 50 * 1024 * 1024
MAX_POCKET_ATOMS = 1000
SUPPORTED_ELEMENTS = {"B", "C", "N", "O", "F", "P", "S", "CL", "BR", "I"}


def input_file(value, suffix):
    path = Path(value).expanduser().resolve()
    if not path.is_file() or path.suffix.lower() != suffix:
        raise ValueError(f"Expected an existing {suffix} file: {path}")
    if not 0 < path.stat().st_size <= MAX_FILE_BYTES:
        raise ValueError("Input file must be nonempty and at most 50 MiB.")
    return path


def validate_pocket(protein, reference=None, residue_ids=None):
    pdb = input_file(protein, ".pdb")
    if bool(reference) == bool(residue_ids):
        raise ValueError("Specify exactly one reference ligand or residue list.")
    structure = PDBParser(QUIET=True).get_structure("input", str(pdb))
    models = list(structure.get_models())
    if not models:
        raise ValueError("PDB contains no atoms/models.")
    model = models[0]
    if residue_ids:
        residues = []
        for key in dict.fromkeys(residue_ids):
            if not RESIDUE.fullmatch(key):
                raise ValueError(f"Invalid residue identifier {key!r}; use A:123.")
            chain, number = key.split(":")
            try:
                residues.append(model[chain][(" ", int(number), " ")])
            except KeyError as exc:
                raise ValueError(f"Residue not found: {key}") from exc
    else:
        if str(reference).lower().endswith(".sdf"):
            ligand_path = input_file(reference, ".sdf")
            supplier = Chem.SDMolSupplier(str(ligand_path))
            if len(supplier) != 1 or supplier[0] is None:
                raise ValueError(
                    "Reference SDF must contain exactly one valid molecule."
                )
            ligand = supplier[0]
            if ligand.GetNumConformers() != 1 or not ligand.GetConformer().Is3D():
                raise ValueError(
                    "Reference ligand must have 3D coordinates aligned with the protein."
                )
            coords = ligand.GetConformer().GetPositions()
        else:
            if not RESIDUE.fullmatch(str(reference)):
                raise ValueError("Reference must be A:330 or a 3D SDF file.")
            chain, number = str(reference).split(":")
            matches = [
                r
                for r in model.get_residues()
                if r.parent.id == chain and r.id[1] == int(number)
            ]
            if len(matches) != 1:
                raise ValueError(
                    f"Reference ligand is missing or ambiguous: {reference}"
                )
            if is_aa(matches[0], standard=True) or matches[0].id[0] == "W":
                raise ValueError(
                    "Reference identifier points to an amino acid or water, not a ligand."
                )
            coords = np.asarray([a.coord for a in matches[0].get_atoms()])
        if not len(coords) or not np.isfinite(coords).all():
            raise ValueError("Reference coordinates are empty or non-finite.")
        residues = []
        for residue in model.get_residues():
            if not is_aa(residue, standard=True):
                continue
            atom_coords = np.asarray([a.coord for a in residue.get_atoms()])
            # Match the official 8 Angstrom pocket definition using all atoms.
            distances = np.linalg.norm(
                atom_coords[:, None, :] - coords[None, :, :], axis=-1
            )
            if distances.min() < 8.0:
                residues.append(residue)
    if not residues:
        raise ValueError("No protein pocket residues found within 8 Angstroms.")
    atoms = []
    identifiers = []
    for residue in residues:
        if not is_aa(residue, standard=True) or residue.id[2] != " ":
            raise ValueError(
                "This launcher supports standard amino acids without insertion codes."
            )
        identifiers.append(f"{residue.parent.id}:{residue.id[1]}")
        for atom in residue.get_atoms():
            if atom.element.upper() == "H":
                continue
            if atom.element.upper() not in SUPPORTED_ELEMENTS:
                raise ValueError(f"Unsupported pocket element: {atom.element}")
            atoms.append(atom.coord)
    if not atoms or len(atoms) > MAX_POCKET_ATOMS:
        raise ValueError(
            f"Pocket has {len(atoms)} heavy atoms; supported range is 1–{MAX_POCKET_ATOMS}."
        )
    if not np.isfinite(atoms).all():
        raise ValueError("Protein pocket contains non-finite coordinates.")
    return pdb, identifiers, np.asarray(atoms)
