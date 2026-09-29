"""One input-resolution path for pocket preview and actual model execution."""

from contextlib import contextmanager
from dataclasses import dataclass
from io import StringIO
from pathlib import Path
import tempfile

from Bio.PDB import PDBIO, PDBParser, Select
from Bio.PDB.Polypeptide import is_aa
from rdkit import Chem

from .config import PACKAGE
from .inputs import validate_pocket
from .sampling import read_pose


@dataclass
class PreparedInput:
    protein: Path
    residues: list[str]
    reference: str | None
    initial: Path | None


def save_pocket(protein, identifiers, destination):
    selected = set(identifiers)

    class PocketSelection(Select):
        def accept_model(self, model):
            return model.id == 0

        def accept_residue(self, residue):
            return (
                residue.id[0] == " "
                and f"{residue.parent.id}:{residue.id[1]}" in selected
            )

        def accept_atom(self, atom):
            return atom.element.upper() != "H"

    writer = PDBIO()
    writer.set_structure(PDBParser(QUIET=True).get_structure("protein", str(protein)))
    writer.save(
        destination if hasattr(destination, "write") else str(destination),
        PocketSelection(),
    )


@contextmanager
def prepare_input(request, manager=None):
    with tempfile.TemporaryDirectory(prefix="diffsbdd-input-") as temporary:
        directory = Path(temporary)
        initial = None
        if request.mode == "demo":
            protein, reference, residues = PACKAGE / "examples/3rfm.pdb", "A:330", []
        elif request.mode == "result":
            from .editing import edit_file

            if manager is None:
                raise ValueError("请先选择一个结果任务。")
            parent = manager.get(request.parent_job)
            protein = manager.result_file(request.parent_job, "protein.pdb")
            reference, residues = (
                None,
                request.residues or parent["report"]["pocket_residues"],
            )
            if request.edit_id:
                initial = edit_file(manager, request.parent_job, request.edit_id)
            else:
                supplier = Chem.SDMolSupplier(
                    str(manager.result_file(request.parent_job, "molecules.sdf"))
                )
                if (
                    request.molecule_index >= len(supplier)
                    or supplier[request.molecule_index] is None
                ):
                    raise ValueError("所选起始分子不存在。")
                initial = directory / "initial.sdf"
                with Chem.SDWriter(str(initial)) as writer:
                    writer.write(supplier[request.molecule_index])
        else:
            protein = directory / "protein.pdb"
            protein.write_text(request.protein_text, encoding="utf-8")
            reference, residues = request.reference, request.residues
            if request.reference_sdf:
                ligand = directory / "reference.sdf"
                ligand.write_text(request.reference_sdf, encoding="utf-8")
                reference = str(ligand)
        _, pocket_ids, _ = validate_pocket(protein, reference, residues)
        if request.mode != "result" and request.initial_sdf:
            initial = directory / "initial.sdf"
            initial.write_text(request.initial_sdf, encoding="utf-8")
        if request.options.task != "generate":
            if initial is None:
                raise ValueError("请选择起始三维结构。")
            pose = read_pose(initial)
            if (
                request.options.task == "inpaint"
                and max(request.options.fixed_atoms) >= pose.GetNumAtoms()
            ):
                raise ValueError("保留原子编号超出起始结构。")
        yield PreparedInput(protein, pocket_ids, reference, initial)


def preview_pocket(request, manager):
    with prepare_input(request, manager) as prepared:
        stream = StringIO()
        save_pocket(prepared.protein, prepared.residues, stream)
        protein = PDBParser(QUIET=True).get_structure("protein", str(prepared.protein))[
            0
        ]
        reference, format_name = "", "pdb"
        if prepared.reference and prepared.reference.lower().endswith(".sdf"):
            reference, format_name = Path(prepared.reference).read_text(), "sdf"
        elif prepared.reference:
            chain, number = prepared.reference.split(":")
            ligand = next(
                r
                for r in protein.get_residues()
                if r.parent.id == chain and r.id[1] == int(number)
            )
            writer, ligand_stream = PDBIO(), StringIO()
            writer.set_structure(ligand)
            writer.save(ligand_stream)
            reference = ligand_stream.getvalue()
        elif prepared.initial:
            reference, format_name = prepared.initial.read_text(), "sdf"
        return {
            "protein": prepared.protein.read_text(),
            "pocket": stream.getvalue(),
            "reference": reference,
            "reference_format": format_name,
            "residues": prepared.residues,
            "residue_count": len(prepared.residues),
            "inventory": [
                {"id": f"{r.parent.id}:{r.id[1]}", "name": r.resname}
                for r in protein.get_residues()
                if is_aa(r, standard=True) and r.id[2] == " "
            ],
        }
