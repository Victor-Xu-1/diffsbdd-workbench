"""HTTP integration against a real isolated Uvicorn process and RDKit parser."""

import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from urllib.error import HTTPError
from urllib.request import build_opener, ProxyHandler, Request

from rdkit import Chem

PACKAGE = Path(__file__).resolve().parents[1]
JOB = "a" * 32


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory()
        cls.data = Path(cls.temporary.name)
        result = cls.data / "web" / JOB / "results" / "fixture"
        result.mkdir(parents=True)
        fixture = PACKAGE / "tests/fixtures/generated_3rfm.sdf"
        (result / "molecules.sdf").write_bytes(fixture.read_bytes())
        cls.molecule = Chem.SDMolSupplier(str(fixture))[0]
        (result / "report.json").write_text(
            json.dumps(
                {"molecules": [{"smiles": Chem.MolToSmiles(cls.molecule)}], "valid": 1}
            )
        )
        (result.parent.parent / "job.json").write_text(
            json.dumps({"id": JOB, "status": "completed", "count": 1})
        )
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            cls.port = listener.getsockname()[1]
        cls.base = f"http://127.0.0.1:{cls.port}"
        environment = dict(
            os.environ,
            DIFFSBDD_DATA_DIR=str(cls.data),
            DIFFSBDD_PORT=str(cls.port),
            PYTHONDONTWRITEBYTECODE="1",
        )
        cls.log = (cls.data / "server.log").open("w")
        cls.process = subprocess.Popen(
            [sys.executable, "-m", "local_diffsbdd.web"],
            cwd=PACKAGE,
            env=environment,
            stdout=cls.log,
            stderr=cls.log,
        )
        cls.client = build_opener(ProxyHandler({}))
        for _ in range(100):
            try:
                cls.client.open(cls.base, timeout=1).close()
                return
            except OSError:
                if cls.process.poll() is not None:
                    break
                time.sleep(0.1)
        cls.tearDownClass()
        raise RuntimeError("Test server failed to start")

    @classmethod
    def tearDownClass(cls):
        cls.process.terminate()
        try:
            cls.process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            cls.process.kill()
            cls.process.wait(timeout=5)
        cls.log.close()
        cls.temporary.cleanup()

    def request(self, path, payload=None, headers=None):
        data = None if payload is None else json.dumps(payload).encode()
        request = Request(
            self.base + path,
            data=data,
            headers={
                "Content-Type": "application/json",
                "X-DiffSBDD-Client": "local-ui",
                **(headers or {}),
            },
        )
        try:
            with self.client.open(request, timeout=15) as response:
                return response.status, response.read(), response.headers
        except HTTPError as error:
            return error.code, error.read(), error.headers

    def test_real_page_models_and_persistent_result_download(self):
        status, body, headers = self.request("/")
        self.assertEqual(status, 200)
        self.assertIn("药物设计工作台", body.decode("utf-8"))
        self.assertIn("frame-ancestors 'none'", headers["Content-Security-Policy"])
        status, body, _ = self.request("/api/health")
        self.assertEqual(len(json.loads(body)["models"]), 8)
        status, body, _ = self.request(f"/api/jobs/{JOB}/files/molecules.sdf")
        self.assertEqual(status, 200)
        self.assertIsNotNone(Chem.MolFromMolBlock(body.decode().split("$$$$")[0]))

    def test_untrusted_origin_invalid_parameters_and_missing_inputs(self):
        self.assertEqual(
            self.request("/api/jobs", {}, {"Origin": "https://untrusted.example"})[0],
            403,
        )
        self.assertEqual(
            self.request("/api/jobs", {}, {"X-DiffSBDD-Client": ""})[0], 403
        )
        self.assertEqual(self.request("/api/jobs", {"options": {"count": 101}})[0], 422)
        self.assertEqual(
            self.request("/api/jobs", {"options": {"model": "../../untrusted"}})[0], 422
        )
        self.assertEqual(
            self.request(
                "/api/jobs",
                {"mode": "custom", "protein_text": "not a PDB", "reference": "A:1"},
            )[0],
            422,
        )

    def test_rejected_requests_deliver_the_error_body_reliably(self):
        for _ in range(20):
            status, body, _ = self.request(
                "/api/jobs",
                {"untrusted": "x" * 2048},
                {"Origin": "https://untrusted.example"},
            )
            self.assertEqual(status, 403)
            self.assertIn("同源", json.loads(body)["detail"])

    def test_pocket_preview_matches_validated_generation_inputs(self):
        from local_diffsbdd.inputs import validate_pocket

        _, residues, _ = validate_pocket(PACKAGE / "examples/3rfm.pdb", "A:330")
        status, body, _ = self.request("/api/pockets/inspect", {"mode": "demo"})
        self.assertEqual(status, 200)
        preview = json.loads(body)
        self.assertEqual(preview["residues"], residues)
        self.assertIn("HETATM", preview["reference"])
        self.assertGreater(len(preview["inventory"]), len(residues))
        payload = {
            "mode": "custom",
            "protein_text": preview["protein"],
            "residues": residues[:3],
        }
        status, body, _ = self.request("/api/pockets/inspect", payload)
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["residue_count"], 3)
        self.assertEqual(
            self.request("/api/pockets/inspect", dict(payload, residues=["Z:9999"]))[0],
            422,
        )

    def test_download_cannot_escape_the_job_directory(self):
        for path in [
            f"/api/jobs/{JOB}/files/.env",
            "/api/jobs/not-a-job",
            f"/api/jobs/{JOB}/molecules/-1.mol",
        ]:
            self.assertEqual(self.request(path)[0], 404)

    def test_graphical_edit_validation_and_concurrent_feedback_persistence(self):
        payload = {
            "index": 0,
            "molblock": Chem.MolToMolBlock(self.molecule),
            "notes": "<script>literal feedback</script>",
            "rating": 4,
        }
        with ThreadPoolExecutor(max_workers=3) as pool:
            responses = list(
                pool.map(
                    lambda _: self.request(f"/api/jobs/{JOB}/edits", payload), range(3)
                )
            )
        self.assertTrue(all(status == 201 for status, _, _ in responses))
        edits = json.loads(self.request(f"/api/jobs/{JOB}")[1])["edits"]
        self.assertEqual(len(edits), 3)
        self.assertEqual(len({entry["id"] for entry in edits}), 3)
        self.assertEqual(edits[0]["notes"], payload["notes"])
        self.assertEqual(
            self.request(f"/api/jobs/{JOB}/edits/{edits[0]['id']}.sdf")[0], 200
        )
        self.assertEqual(
            self.request(
                f"/api/jobs/{JOB}/edits",
                dict(payload, molblock="invalid molecule input"),
            )[0],
            422,
        )

    def test_pose_inspection_uses_real_chemical_parser(self):
        payload = {"sdf": (PACKAGE / "tests/fixtures/generated_3rfm.sdf").read_text()}
        status, body, _ = self.request("/api/poses/inspect", payload)
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["atoms"], self.molecule.GetNumAtoms())
        self.assertEqual(
            self.request("/api/poses/inspect", {"sdf": "invalid structure document"})[
                0
            ],
            422,
        )


if __name__ == "__main__":
    unittest.main()
