import tempfile
import unittest
from pathlib import Path

import numpy as np
from rdkit import Chem
from rdkit.Chem import AllChem

from local_diffsbdd.inputs import validate_pocket
from local_diffsbdd.results import assess_molecule, write_report

PROTEIN = Path(__file__).resolve().parents[1] / "examples/3rfm.pdb"


class InputTests(unittest.TestCase):
    def test_real_pdb_reference_resolves_to_nonempty_pocket(self):
        _, residues, atoms = validate_pocket(PROTEIN, "A:330")
        self.assertGreater(len(residues), 5)
        self.assertGreater(len(atoms), 20)
        self.assertTrue(np.isfinite(atoms).all())

    def test_residue_input_matches_reference_pocket(self):
        _, identifiers, reference_atoms = validate_pocket(PROTEIN, "A:330")
        _, explicit, atoms = validate_pocket(PROTEIN, residue_ids=identifiers)
        self.assertEqual(explicit, identifiers)
        np.testing.assert_allclose(atoms, reference_atoms)

    def test_missing_ligand_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "missing or ambiguous"):
            validate_pocket(PROTEIN, "Z:99999")

    def test_conflicting_conditions_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "exactly one"):
            validate_pocket(PROTEIN, "A:330", ["A:1"])

    def test_malformed_residue_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Invalid residue"):
            validate_pocket(PROTEIN, residue_ids=["A:1;touch injected"])

    def test_empty_file_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "empty.pdb"
            path.touch()
            with self.assertRaisesRegex(ValueError, "nonempty"):
                validate_pocket(path, "A:330")

    def test_reference_needs_3d_coordinates(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "reference.sdf"
            molecule = Chem.MolFromSmiles("CCO")
            AllChem.Compute2DCoords(molecule)
            with Chem.SDWriter(str(path)) as writer:
                writer.write(molecule)
            with self.assertRaisesRegex(ValueError, "3D coordinates"):
                validate_pocket(PROTEIN, str(path))


class ResultTests(unittest.TestCase):
    def test_real_chemical_parser_rejects_invalid_valence(self):
        molecule = Chem.MolFromSmiles("C(C)(C)(C)(C)C", sanitize=False)
        molecule.AddConformer(Chem.Conformer(molecule.GetNumAtoms()))
        valid, result = assess_molecule(molecule, np.asarray([[10.0, 0.0, 0.0]]))
        self.assertIsNone(valid)
        self.assertIn("sanitization", result["reason"])

    def test_nan_coordinates_are_rejected(self):
        molecule = Chem.MolFromSmiles("CCO")
        conformer = Chem.Conformer(3)
        conformer.SetAtomPosition(0, (float("nan"), 0.0, 0.0))
        molecule.AddConformer(conformer)
        valid, result = assess_molecule(molecule, np.asarray([[10.0, 0.0, 0.0]]))
        self.assertIsNone(valid)
        self.assertIn("Non-finite", result["reason"])

    def test_valid_molecule_reports_real_descriptors(self):
        molecule = Chem.AddHs(Chem.MolFromSmiles("CCO"))
        self.assertEqual(AllChem.EmbedMolecule(molecule, randomSeed=5), 0)
        molecule = Chem.RemoveHs(molecule)
        valid, result = assess_molecule(molecule, np.asarray([[10.0, 0.0, 0.0]]))
        self.assertIsNotNone(valid)
        self.assertEqual(result["smiles"], "CCO")
        self.assertEqual(result["heavy_atoms"], 3)
        self.assertEqual(result["pocket_atom_pairs_under_1_2_angstrom"], 0)

    def test_report_updates_leave_no_partial_json(self):
        import json

        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "report.json"
            write_report(path, {"status": "running"})
            write_report(path, {"status": "completed", "valid": 2})
            self.assertEqual(json.loads(path.read_text())["valid"], 2)
            self.assertEqual(list(path.parent.iterdir()), [path])


if __name__ == "__main__":
    unittest.main()
