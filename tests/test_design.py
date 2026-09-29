from pathlib import Path
import tempfile
import unittest

import numpy as np
from pydantic import ValidationError
from rdkit import Chem

from local_diffsbdd.contracts import GenerationInput
from local_diffsbdd.options import DesignOptions
from local_diffsbdd.registry import CATALOG, model_spec
from local_diffsbdd.results import process_candidate
from local_diffsbdd.sampling import Sampler, read_pose

FIXTURE = Path(__file__).parent / "fixtures/generated_3rfm.sdf"


class DesignContractTests(unittest.TestCase):
    def test_all_eight_published_checkpoints_have_unique_hashes(self):
        self.assertEqual(len(CATALOG), 8)
        self.assertEqual(len({model_spec(m["id"])["sha256"] for m in CATALOG}), 8)

    def test_unknown_checkpoint_cannot_be_selected(self):
        with self.assertRaises(ValidationError):
            DesignOptions(model="../../untrusted.ckpt")

    def test_invalid_combinations_are_rejected(self):
        cases = [
            dict(task="inpaint"),
            dict(task="inpaint", fixed_atoms=[0, 0]),
            dict(task="inpaint", fixed_atoms=[0], model="moad_ca_joint"),
            dict(trajectory=True),
            dict(task="optimize", population=3, survivors=4),
            dict(task="optimize", population=100, rounds=2),
        ]
        for case in cases:
            with self.subTest(case=case), self.assertRaises(ValidationError):
                DesignOptions(**case)

    def test_result_source_requires_a_real_job_identifier(self):
        with self.assertRaises(ValidationError):
            GenerationInput(mode="result")

    def test_custom_source_requires_exactly_one_pocket_definition(self):
        with self.assertRaises(ValidationError):
            GenerationInput(
                mode="custom", protein_text="ATOM", reference="A:1", residues=["A:2"]
            )

    def test_optimization_attempt_count_uses_rounds_and_population(self):
        self.assertEqual(
            DesignOptions(task="optimize", population=5, rounds=3).attempts, 15
        )


class RealChemistryDesignTests(unittest.TestCase):
    def test_multiple_posed_fragments_are_combined_without_moving_atoms(self):
        original = read_pose(FIXTURE)
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "two.sdf"
            with Chem.SDWriter(str(path)) as writer:
                writer.write(original)
                writer.write(original)
            combined = read_pose(path)
            self.assertEqual(combined.GetNumAtoms(), original.GetNumAtoms() * 2)
            np.testing.assert_allclose(
                combined.GetConformer().GetPositions()[: original.GetNumAtoms()],
                original.GetConformer().GetPositions(),
            )

    def test_fixed_atoms_require_both_chemistry_and_spatial_agreement(self):
        original = read_pose(FIXTURE)
        sampler = object.__new__(Sampler)
        sampler.initial = original
        sampler.options = DesignOptions(
            task="inpaint",
            fixed_atoms=list(range(original.GetNumAtoms())),
            fragment_policy="all",
        )
        self.assertIsNone(sampler.check_fixed(original))
        moved = Chem.Mol(original)
        moved.GetConformer().SetAtomPosition(
            0, tuple(original.GetConformer().GetPositions()[0] + 4)
        )
        self.assertIsNotNone(sampler.check_fixed(moved))

    def test_all_fragment_policy_keeps_and_labels_disconnected_outputs(self):
        original = read_pose(FIXTURE)
        combined = Chem.CombineMols(original, original)
        pocket = np.array([[100.0, 100.0, 100.0]])
        mol, values = process_candidate(
            combined, DesignOptions(fragment_policy="all"), pocket
        )
        self.assertIsNotNone(mol)
        self.assertEqual(values["fragments"], 2)
        mol, values = process_candidate(combined, DesignOptions(), pocket)
        self.assertEqual(values["fragments"], 1)

    def test_relaxation_returns_real_finite_geometry_and_convergence_status(self):
        molecule, values = process_candidate(
            read_pose(FIXTURE),
            DesignOptions(relaxation=50),
            np.array([[100.0, 100.0, 100.0]]),
        )
        self.assertIsNotNone(molecule)
        self.assertTrue(np.isfinite(molecule.GetConformer().GetPositions()).all())
        self.assertIsInstance(values["relaxation_converged"], bool)


if __name__ == "__main__":
    unittest.main()
