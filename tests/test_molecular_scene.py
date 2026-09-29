"""Real chemical identity and geometry checks for molecular presentation."""

import io
from pathlib import Path
import unittest

import numpy as np
from Bio.PDB import PDBParser
from rdkit import Chem
from rdkit.Chem import rdMolDescriptors

from local_diffsbdd.components import ligand_from_residue, load_definition
from local_diffsbdd.contracts import GenerationInput
from local_diffsbdd.interactions import InteractionInput, inspect_interactions
from local_diffsbdd.pockets import preview_pocket
from local_diffsbdd.preparation import PreparationInput, prepare_structure

ROOT = Path(__file__).resolve().parents[1]


class MolecularSceneTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.preview = preview_pocket(GenerationInput(), None)

    def ligand(self):
        return PDBParser(QUIET=True).get_structure(
            "example", str(ROOT / "examples/3rfm.pdb")
        )[0]["A"][("H_CFF", 330, " ")]

    def test_reference_uses_complete_ccd_topology_at_original_coordinates(self):
        preview = self.preview
        self.assertEqual(preview["reference_format"], "sdf")
        self.assertEqual(preview["ligand_status"]["state"], "verified")
        molecule = Chem.MolFromMolBlock(preview["reference"])
        self.assertEqual(rdMolDescriptors.CalcMolFormula(molecule), "C8H10N4O2")
        self.assertEqual((molecule.GetNumAtoms(), molecule.GetNumBonds()), (14, 15))
        self.assertEqual(
            Chem.MolToSmiles(molecule), Chem.CanonSmiles("Cn1c(=O)c2c(ncn2C)n(C)c1=O")
        )
        expected = self.ligand()
        for index, name in enumerate(load_definition("CFF")["atoms"]):
            np.testing.assert_allclose(
                molecule.GetConformer().GetPositions()[index],
                expected[name].coord,
                atol=0.0001,
            )

    def test_incomplete_or_unknown_component_never_produces_guessed_ligand(self):
        missing = self.ligand()
        missing.detach_child("N1")
        molecule, status = ligand_from_residue(missing)
        self.assertIsNone(molecule)
        self.assertEqual(status["state"], "incomplete")
        self.assertIn("N1", status["message"])
        unknown = self.ligand()
        unknown.resname = "ZZZZZ"
        molecule, status = ligand_from_residue(unknown)
        self.assertIsNone(molecule)
        self.assertEqual(status["state"], "needs_definition")
        with self.assertRaises(ValueError):
            load_definition("../../etc")

    def test_high_occupancy_conformer_is_unique_and_not_hidden_as_altloc_b(self):
        lines = []
        for serial, name, alt, x, occupancy in [
            (1, "N", " ", 0, 1),
            (2, "CA", "A", 1.5, 0.3),
            (3, "CA", "B", 2.5, 0.7),
            (4, "C", " ", 4, 1),
        ]:
            lines.append(
                f"ATOM  {serial:5d} {name:^4s}{alt}ALA A   1    {x:8.3f}{0:8.3f}{0:8.3f}{occupancy:6.2f}{20:6.2f}          {name[0]:>2s}  "
            )
        result = prepare_structure(
            PreparationInput(protein_text="\n".join(lines) + "\nEND\n")
        )
        atoms = list(
            PDBParser(QUIET=True)
            .get_structure("normalized", io.StringIO(result["protein"]))
            .get_atoms()
        )
        self.assertEqual(len(atoms), 3)
        self.assertEqual(next(a for a in atoms if a.name == "CA").coord[0], 2.5)
        self.assertTrue(all(a.altloc == " " for a in atoms))
        self.assertEqual(result["alternate_residues_resolved"], 1)

    def test_public_complex_has_typed_hbond_and_stacking_with_measured_endpoints(self):
        report = inspect_interactions(
            InteractionInput(
                protein_text=self.preview["protein"], sdf=self.preview["reference"]
            )
        )
        pairs = {
            (item["kind"], item["residue"]["name"], item["residue"]["number"])
            for item in report["interactions"]
        }
        self.assertIn(("hydrogen_bond", "ASN", 253), pairs)
        self.assertIn(("pi_stacking", "PHE", 168), pairs)
        for item in report["interactions"]:
            self.assertAlmostEqual(
                np.linalg.norm(np.asarray(item["start"]) - item["end"]),
                item["distance"],
                places=5,
            )
        self.assertEqual(report["method"], "implicit_hydrogens")
        self.assertTrue(report["engine"].startswith("ProLIF "))

    def test_moving_ligand_far_away_removes_interactions(self):
        ligand = Chem.MolFromMolBlock(self.preview["reference"])
        conformer = ligand.GetConformer()
        for index, point in enumerate(conformer.GetPositions()):
            conformer.SetAtomPosition(index, point + 100)
        result = inspect_interactions(
            InteractionInput(
                protein_text=self.preview["protein"], sdf=Chem.MolToMolBlock(ligand)
            )
        )
        self.assertEqual(result["interactions"], [])
        self.assertTrue(all(value == 0 for value in result["summary"].values()))

    def test_carbon_only_ligand_is_not_labeled_hydrogen_bond_despite_proximity(self):
        ligand = Chem.MolFromSmiles("CCC")
        conformer = Chem.Conformer(3)
        conformer.Set3D(True)
        for i in range(3):
            conformer.SetAtomPosition(i, (7.552 + i * 1.5, -31.908, -30.705))
        ligand.AddConformer(conformer)
        result = inspect_interactions(
            InteractionInput(
                protein_text=self.preview["protein"], sdf=Chem.MolToMolBlock(ligand)
            )
        )
        self.assertEqual(result["summary"]["hydrogen_bond"], 0)


if __name__ == "__main__":
    unittest.main()
