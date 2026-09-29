"""Serve a labelled real generated fixture for CPU-only browser integration.

This does not simulate GPU generation. Full inference uses tests/browser.mjs
without --ui-only against a real installed GPU workbench.
"""

import os
import signal
from pathlib import Path
import subprocess
import sys
import tempfile

from local_diffsbdd.inputs import validate_pocket
from local_diffsbdd.pockets import save_pocket
from local_diffsbdd.results import assess_molecule, write_report
from rdkit import Chem


def main():
    package = Path(__file__).resolve().parents[1]
    with tempfile.TemporaryDirectory(prefix="diffsbdd-ui-test-") as temporary:
        directory = Path(temporary) / "web" / ("f" * 32)
        result = directory / "results" / "fixture"
        result.mkdir(parents=True)
        protein, residues, coords = validate_pocket(
            package / "examples/3rfm.pdb", "A:330"
        )
        fixture = package / "tests/fixtures/generated_3rfm.sdf"
        (result / "molecules.sdf").write_bytes(fixture.read_bytes())
        (result / "protein.pdb").write_bytes(protein.read_bytes())
        save_pocket(protein, residues, result / "pocket.pdb")
        _, values = assess_molecule(Chem.SDMolSupplier(str(fixture))[0], coords)
        write_report(
            result / "report.json",
            {
                "status": "completed",
                "mode": "generate",
                "valid": 1,
                "attempted": 1,
                "molecules": [values],
                "pocket_residues": residues,
            },
        )
        write_report(
            directory / "job.json",
            {
                "id": "f" * 32,
                "status": "completed",
                "task": "generate",
                "count": 1,
                "created_at": "2026-09-29T00:00:00Z",
                "fixture": "Real generated molecule; UI test fixture, not a new inference run.",
            },
        )
        environment = dict(
            os.environ, DIFFSBDD_DATA_DIR=temporary, DIFFSBDD_PORT="17865"
        )
        process = subprocess.Popen(
            [sys.executable, "-m", "local_diffsbdd.web"], cwd=package, env=environment
        )
        signal.signal(signal.SIGTERM, lambda *_: process.terminate())
        try:
            process.wait()
        finally:
            process.terminate()
            process.wait(timeout=20)


if __name__ == "__main__":
    main()
