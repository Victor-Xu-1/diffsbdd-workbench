"""PDB filtering only: preserve original coordinates and report actual changes."""

from io import StringIO
import numpy as np
from Bio.PDB import PDBIO, PDBParser, Select
from Bio.PDB.Polypeptide import is_aa
from pydantic import BaseModel, ConfigDict, Field


class PreparationInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    protein_text: str = Field(min_length=20, max_length=5_000_000)
    chains: list[str] = Field(default_factory=list, max_length=100)
    remove_water: bool = True
    keep_ligands: bool = True
    remove_hydrogens: bool = False


def prepare_structure(request):
    try:
        structure = PDBParser(QUIET=True).get_structure(
            "input", StringIO(request.protein_text)
        )
    except Exception as exc:
        raise ValueError("无法读取 PDB，请检查文件格式。") from exc
    models = list(structure.get_models())
    if not models:
        raise ValueError("PDB 中没有结构坐标。")
    model = models[0]
    chain_ids = {c.id for c in model.get_chains()}
    if set(request.chains) - chain_ids:
        raise ValueError("选定的蛋白链不存在。")
    atoms = list(model.get_atoms())
    if not atoms or not np.isfinite([a.coord for a in atoms]).all():
        raise ValueError("结构坐标为空或含非有限值。")
    selected = set(request.chains) or chain_ids

    class Selection(Select):
        def accept_model(self, m):
            return m.id == 0

        def accept_chain(self, c):
            return c.id in selected

        def accept_residue(self, r):
            if r.id[0] == "W":
                return not request.remove_water
            return request.keep_ligands or is_aa(r, standard=True)

        def accept_atom(self, a):
            return not request.remove_hydrogens or a.element.upper() != "H"

    stream = StringIO()
    writer = PDBIO()
    writer.set_structure(structure)
    writer.save(stream, Selection())
    output = stream.getvalue()
    processed = PDBParser(QUIET=True).get_structure("output", StringIO(output))
    remaining = list(processed.get_atoms())
    if not remaining:
        raise ValueError("筛选后没有可保留的原子。")
    ligands = [
        {
            "id": f"{r.parent.id}:{r.id[1]}",
            "name": r.resname,
            "atoms": len(list(r.get_atoms())),
        }
        for r in processed.get_residues()
        if r.id[0] != "W" and not is_aa(r, standard=True)
    ]
    return {
        "inventory": [
            {"id": f"{r.parent.id}:{r.id[1]}", "name": r.resname}
            for r in processed.get_residues()
            if is_aa(r, standard=True) and r.id[2] == " "
        ],
        "protein": output,
        "chains": [
            {"id": c.id, "residues": len(list(c.get_residues()))}
            for c in model.get_chains()
        ],
        "ligands": ligands,
        "input_atoms": len(atoms),
        "output_atoms": len(remaining),
        "removed_atoms": len(atoms) - len(remaining),
        "models_in_file": len(models),
    }
