from pathlib import Path
import unittest

import numpy as np
from rdkit import Chem
from rdkit.Chem import AllChem

from local_diffsbdd.editing import aligned_edit

FIXTURE = Path(__file__).parent / "fixtures/generated_3rfm.sdf"


class EditingTests(unittest.TestCase):
    def setUp(self):
        self.original = Chem.SDMolSupplier(str(FIXTURE))[0]

    def test_atom_replacement_preserves_a_usable_aligned_pose(self):
        edited = Chem.RWMol(self.original)
        atom = next(
            a for a in edited.GetAtoms() if a.GetAtomicNum() == 8 and a.GetDegree() == 1
        )
        atom.SetAtomicNum(9)
        atom.SetNumExplicitHs(0)
        edited = edited.GetMol()
        Chem.SanitizeMol(edited)
        AllChem.Compute2DCoords(edited)
        result, metadata = aligned_edit(Chem.MolToMolBlock(edited), self.original)
        self.assertIn("F", Chem.MolToSmiles(result))
        self.assertTrue(metadata["changed"])
        self.assertLess(metadata["alignment_rmsd"], 2)
        self.assertIn("coordinate transfer", metadata["placement"])
        self.assertTrue(result.GetConformer().Is3D())
        self.assertTrue(np.isfinite(result.GetConformer().GetPositions()).all())

    def test_bond_order_edit_survives_real_three_dimensional_alignment(self):
        editable = Chem.RWMol(self.original)
        bond = next(
            b
            for b in editable.GetBonds()
            if not b.IsInRing() and b.GetBondType() == Chem.BondType.DOUBLE
        )
        ends = (bond.GetBeginAtomIdx(), bond.GetEndAtomIdx())
        bond.SetBondType(Chem.BondType.SINGLE)
        edited = editable.GetMol()
        Chem.SanitizeMol(edited)
        AllChem.Compute2DCoords(edited)
        result, metadata = aligned_edit(Chem.MolToMolBlock(edited), self.original)
        self.assertTrue(metadata["changed"])
        self.assertEqual(
            result.GetBondBetweenAtoms(*ends).GetBondType(), Chem.BondType.SINGLE
        )
        self.assertTrue(result.GetConformer().Is3D())
        self.assertTrue(np.isfinite(result.GetConformer().GetPositions()).all())

    def test_unchanged_graph_preserves_original_pose(self):
        result, metadata = aligned_edit(
            Chem.MolToMolBlock(self.original), self.original
        )
        self.assertFalse(metadata["changed"])
        np.testing.assert_allclose(
            result.GetConformer().GetPositions(),
            self.original.GetConformer().GetPositions(),
        )

    def test_invalid_editor_document_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "化学检查"):
            aligned_edit("invalid molfile", self.original)


if __name__ == "__main__":
    unittest.main()
