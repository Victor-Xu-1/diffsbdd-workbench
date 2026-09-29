"""One local GPU job at a time, persisted metadata and bounded cancellation."""

from datetime import datetime, timezone
import json
import os
import signal
import subprocess
import sys
import threading
from uuid import uuid4

from .results import write_report
from .pockets import prepare_input
from .config import DATA, PACKAGE
from .messages import public_message

JOBS = DATA / "web"


class JobManager:
    def __init__(self):
        JOBS.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.active = None
        self.process = None
        # The server owns its subprocess and cancels it on normal shutdown.
        # Old running records after abnormal shutdown are explicitly interrupted.
        for path in JOBS.glob("*/job.json"):
            metadata = json.loads(path.read_text())
            if metadata["status"] == "running":
                metadata.update(
                    status="interrupted", error="Server restarted before completion."
                )
                write_report(path, metadata)

    def directory(self, job_id):
        if len(job_id) != 32 or any(c not in "0123456789abcdef" for c in job_id):
            raise ValueError("Unknown job.")
        directory = JOBS / job_id
        if not directory.resolve().is_relative_to(JOBS.resolve()):
            raise ValueError("Unknown job.")
        if not (directory / "job.json").is_file():
            raise ValueError("Unknown job.")
        return directory

    def refresh(self):
        if self.process is None or self.process.poll() is None:
            return
        directory = self.directory(self.active)
        meta = json.loads((directory / "job.json").read_text())
        if meta["status"] == "running":
            meta["status"] = "completed" if self.process.returncode == 0 else "failed"
            if self.process.returncode == 3:
                meta["status"] = "no_valid_molecules"
            meta["exit_code"] = self.process.returncode
            write_report(directory / "job.json", meta)
        self.process = None
        self.active = None

    def submit(self, request):
        with self.lock:
            self.refresh()
            if self.process is not None:
                raise RuntimeError("已有生成任务在运行，请等待完成或先取消。")
            with prepare_input(request, self) as prepared:
                pocket_ids = prepared.residues
                job_id = uuid4().hex
                directory = JOBS / job_id
                directory.mkdir()
                (directory / "protein.pdb").write_bytes(prepared.protein.read_bytes())
                if request.options.task != "generate":
                    (directory / "edited_input.sdf").write_bytes(
                        prepared.initial.read_bytes()
                    )
            metadata = {
                "id": job_id,
                "status": "running",
                "mode": request.mode,
                "count": request.options.attempts,
                "atoms": request.options.atoms,
                "seed": request.options.seed,
                "task": request.options.task,
                "settings": request.options.model_dump(),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            write_report(directory / "job.json", metadata)
            command = request.options.task
            write_report(directory / "settings.json", request.options.model_dump())
            args = [
                sys.executable,
                "-u",
                "-m",
                "local_diffsbdd",
                command,
                "--protein",
                str(directory / "protein.pdb"),
                "--settings",
                str(directory / "settings.json"),
                "--output",
                str(directory / "results"),
            ]
            if command != "generate":
                args.extend(["--initial-ligand", str(directory / "edited_input.sdf")])
            if request.parent_job:
                metadata.update(
                    parent_job=request.parent_job,
                    edit_id=request.edit_id,
                    molecule_index=request.molecule_index,
                )
                write_report(directory / "job.json", metadata)
            for residue in pocket_ids:
                args.extend(["--residue", residue])
            environment = os.environ.copy()
            environment.update(
                PYTHONDONTWRITEBYTECODE="1", WANDB_MODE="disabled", MPLBACKEND="Agg"
            )
            try:
                with (directory / "process.log").open("w") as log:
                    self.process = subprocess.Popen(
                        args,
                        cwd=PACKAGE,
                        env=environment,
                        stdout=log,
                        stderr=subprocess.STDOUT,
                        start_new_session=True,
                    )
            except OSError as exc:
                metadata.update(status="failed", error=str(exc))
                write_report(directory / "job.json", metadata)
                raise
            self.active = job_id
            return metadata

    def get(self, job_id):
        with self.lock:
            self.refresh()
            directory = self.directory(job_id)
            metadata = json.loads((directory / "job.json").read_text())
            reports = list((directory / "results").glob("*/report.json"))
            if reports:
                metadata["report"] = json.loads(reports[0].read_text())
                if metadata["report"].get("error"):
                    metadata["report"]["error"] = public_message(
                        metadata["report"]["error"]
                    )
                for rejected in metadata["report"].get("rejected", []):
                    rejected["reason"] = public_message(rejected.get("reason", ""))
            if metadata.get("error"):
                metadata["error"] = public_message(metadata["error"])
            if (directory / "edits.json").exists():
                metadata["edits"] = json.loads((directory / "edits.json").read_text())[
                    "edits"
                ]
            return metadata

    def history(self, offset=0, limit=20):
        with self.lock:
            self.refresh()
            paths = sorted(
                JOBS.glob("*/job.json"), key=lambda p: p.stat().st_mtime, reverse=True
            )[offset : offset + limit]
            return [self.get(path.parent.name) for path in paths]

    def cancel(self, job_id):
        with self.lock:
            self.refresh()
            directory = self.directory(job_id)
            if self.active != job_id or self.process is None:
                return self.get(job_id)
            process = self.process
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                process.wait(timeout=5)
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass  # Process exit won the cancellation race; still reap it.
                process.wait(timeout=5)
            metadata = json.loads((directory / "job.json").read_text())
            metadata["status"] = "cancelled"
            write_report(directory / "job.json", metadata)
            self.process = None
            self.active = None
            return self.get(job_id)

    def close(self):
        with self.lock:
            if self.active:
                self.cancel(self.active)

    def result_file(self, job_id, name):
        if name not in {
            "molecules.sdf",
            "raw_molecules.sdf",
            "molecules.csv",
            "report.json",
            "protein.pdb",
            "pocket.pdb",
            "process.log",
            "best.sdf",
            "edited_input.sdf",
            "edits.json",
            "trajectory.json",
            "settings.json",
        }:
            raise ValueError("Unsupported download.")
        directory = self.directory(job_id)
        if name in {"process.log", "edits.json", "settings.json"}:
            result = directory / name
        else:
            folders = list((directory / "results").glob("*/report.json"))
            if not folders:
                raise ValueError("Results are not ready yet.")
            result = folders[0].parent / name
        if not result.is_file() or not result.resolve().is_relative_to(
            directory.resolve()
        ):
            raise ValueError("Result file not found.")
        return result
