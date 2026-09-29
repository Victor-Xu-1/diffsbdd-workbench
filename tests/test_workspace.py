"""Operational pages must produce real data, not informational placeholders."""

import io
import tempfile
import unittest
from pathlib import Path
from pydantic import ValidationError
from rdkit import Chem
from local_diffsbdd.contracts import GenerationInput
from local_diffsbdd.designs import DesignStore, SaveDesign, RevisionConflict
from local_diffsbdd.preparation import PreparationInput, prepare_structure

PACKAGE = Path(__file__).resolve().parents[1]


class WorkspaceTests(unittest.TestCase):
    def test_saved_design_is_portable_and_survives_reopening_store(self):
        with tempfile.TemporaryDirectory() as folder:
            store = DesignStore(Path(folder))
            record = store.save(
                SaveDesign(name="可恢复的设计", request=GenerationInput()), None
            )
            self.assertIn("ATOM", record["request"]["protein_text"])
            self.assertEqual(record["request"]["mode"], "custom")
            loaded = DesignStore(Path(folder)).get(record["id"])
            self.assertEqual(loaded, record)
            self.assertEqual(store.list()[0]["name"], "可恢复的设计")
            with self.assertRaises(RevisionConflict):
                store.save(
                    SaveDesign(name="错误覆盖", request=GenerationInput(), revision=0),
                    None,
                    record["id"],
                )
            updated = store.save(
                SaveDesign(name="版本二", request=GenerationInput(), revision=1),
                None,
                record["id"],
            )
            self.assertEqual(updated["revision"], 2)
            with self.assertRaises(ValueError):
                store.get("../../private")

    def test_invalid_design_never_creates_a_success_record(self):
        with tempfile.TemporaryDirectory() as folder:
            store = DesignStore(Path(folder))
            with self.assertRaises(ValueError):
                store.save(
                    SaveDesign(
                        name="bad",
                        request=GenerationInput(
                            mode="custom", protein_text="bad", reference="A:1"
                        ),
                    ),
                    None,
                )
            self.assertEqual(store.list(), [])
            with self.assertRaises(ValidationError):
                SaveDesign(name="  ", request=GenerationInput())

    def test_saved_fragment_design_restores_coordinates_bonds_and_selection(self):
        from local_diffsbdd.pockets import preview_pocket

        sdf = (PACKAGE / "tests/fixtures/generated_3rfm.sdf").read_text()
        initial = Chem.MolFromMolBlock(sdf)
        fixed = list(initial.GetRingInfo().AtomRings()[0])
        request = GenerationInput.model_validate(
            {
                "initial_sdf": sdf,
                "options": {
                    "task": "inpaint",
                    "fixed_atoms": fixed,
                    "fragment_policy": "all",
                },
            }
        )
        with tempfile.TemporaryDirectory() as folder:
            record = DesignStore(folder).save(
                SaveDesign(name="保留环", request=request), None
            )
            restored = GenerationInput.model_validate(
                DesignStore(folder).get(record["id"])["request"]
            )
            self.assertEqual(restored.options.fixed_atoms, fixed)
            self.assertEqual(restored.initial_sdf, sdf)
            preview = preview_pocket(restored, None)
            actual = Chem.MolFromMolBlock(preview["initial"])
            self.assertEqual(Chem.MolToSmiles(actual), Chem.MolToSmiles(initial))
            self.assertTrue(
                (
                    actual.GetConformer().GetPositions()
                    == initial.GetConformer().GetPositions()
                ).all()
            )
            self.assertIn(fixed, preview["rings"])

    def test_pdb_preparation_keeps_coordinates_and_exports_real_atoms(self):
        from Bio.PDB import PDBParser

        pdb = (PACKAGE / "examples/3rfm.pdb").read_text()
        result = prepare_structure(
            PreparationInput(protein_text=pdb, remove_water=True, keep_ligands=False)
        )
        original = PDBParser(QUIET=True).get_structure("before", io.StringIO(pdb))[0]
        processed = PDBParser(QUIET=True).get_structure(
            "after", io.StringIO(result["protein"])
        )[0]
        before = {a.get_full_id()[2:]: a.coord for a in original.get_atoms()}
        self.assertTrue(result["removed_atoms"] > 0)
        for atom in processed.get_atoms():
            self.assertEqual(atom.parent.id[0], " ")
            self.assertTrue((atom.coord == before[atom.get_full_id()[2:]]).all())
        self.assertEqual(result["output_atoms"], len(list(processed.get_atoms())))
        with self.assertRaises(ValueError):
            prepare_structure(PreparationInput(protein_text=pdb, chains=["Z"]))

    def test_selected_exports_and_comparison_are_derived_from_persisted_results(self):
        from local_diffsbdd.collections import (
            MoleculeSelection,
            export_molecules,
            compare_jobs,
        )
        from local_diffsbdd.results import assess_molecule

        class FixtureJobs:
            def get(self, job):
                if job != "a" * 32:
                    raise ValueError("unknown")
                mol = Chem.SDMolSupplier(
                    str(PACKAGE / "tests/fixtures/generated_3rfm.sdf")
                )[0]
                from local_diffsbdd.inputs import validate_pocket

                _, _, coordinates = validate_pocket(
                    PACKAGE / "examples/3rfm.pdb", "A:330"
                )
                _, values = assess_molecule(mol, coordinates)
                return {
                    "id": job,
                    "status": "completed",
                    "report": {
                        "molecules": [values],
                        "valid": 1,
                        "attempted": 2,
                        "elapsed_seconds": 4,
                    },
                }

            def result_file(self, job, name):
                self.get(job)
                if name != "molecules.sdf":
                    raise ValueError("unknown")
                return PACKAGE / "tests/fixtures/generated_3rfm.sdf"

        manager = FixtureJobs()
        picks = [MoleculeSelection(job_id="a" * 32, index=0)]
        text = export_molecules(manager, picks, "sdf")
        self.assertEqual(text.count("$$$$"), 1)
        self.assertIsNotNone(Chem.MolFromMolBlock(text.split("$$$$")[0]))
        self.assertIn("smiles", export_molecules(manager, picks, "csv"))
        comparison = compare_jobs(manager, ["a" * 32])[0]
        self.assertEqual(comparison["valid_fraction"], 0.5)
        self.assertEqual(comparison["valid"], 1)
        with self.assertRaises(ValueError):
            export_molecules(
                manager, [MoleculeSelection(job_id="a" * 32, index=5)], "sdf"
            )
