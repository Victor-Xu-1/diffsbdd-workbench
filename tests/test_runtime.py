import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from local_diffsbdd import runtime


class ProvenanceTests(unittest.TestCase):
    def test_altered_checkpoint_is_rejected_before_unpickling(self):
        with tempfile.TemporaryDirectory() as temporary:
            fake = Path(temporary) / "wrong.ckpt"
            fake.write_bytes(b"not-an-approved-checkpoint")
            with patch.object(runtime, "CHECKPOINT", fake):
                with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
                    runtime.verify_installation()

    @unittest.skipUnless(os.name == "posix", "POSIX file lock required")
    def test_second_process_is_rejected_while_inference_lock_is_held(self):
        from local_diffsbdd.generation import inference_lock

        with (
            tempfile.TemporaryDirectory() as temporary,
            patch("local_diffsbdd.generation.ROOT", Path(temporary)),
            inference_lock(),
        ):
            target = Path(temporary) / "runs"
            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "local_diffsbdd",
                    "generate",
                    "--protein",
                    str(Path(__file__).resolve().parents[1] / "examples/3rfm.pdb"),
                    "--reference",
                    "A:330",
                    "--count",
                    "1",
                    "--output",
                    str(target),
                ],
                env=dict(os.environ, DIFFSBDD_HOME=temporary),
                capture_output=True,
                text=True,
                timeout=20,
                cwd=Path(__file__).resolve().parents[1],
            )
            self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
            self.assertIn("Another DiffSBDD generation is running", result.stderr)
            self.assertFalse(target.exists())


if __name__ == "__main__":
    unittest.main()
