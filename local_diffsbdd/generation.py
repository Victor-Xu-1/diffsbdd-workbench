"""Sequential, full-step GPU generation using the unchanged upstream model."""

from contextlib import contextmanager, redirect_stdout
import csv
from dataclasses import dataclass
from datetime import datetime, timezone
import fcntl
import hashlib
import json
from pathlib import Path
import resource
import random
import shutil
import time
from uuid import uuid4

import numpy as np
from rdkit import Chem

from .pockets import save_pocket
from .inputs import validate_pocket
from .results import process_candidate, write_report
from .runtime import COMMIT, ROOT, load_model
from .options import DesignOptions
from .registry import model_spec
from .sampling import Sampler


@dataclass(frozen=True)
class Request:
    protein: Path
    output: Path
    count: int = 3
    atoms: int = 32
    seed: int = 2026
    reference: str | None = None
    residues: tuple[str, ...] = ()
    initial_ligand: Path | None = None
    objective: str = "qed"
    settings: DesignOptions | None = None

    def validate(self):
        if not 1 <= self.count <= 100:
            raise ValueError("Count must be between 1 and 100 attempts.")
        if not 8 <= self.atoms <= 80:
            raise ValueError("Atoms must be between 8 and 80.")
        if not 0 <= self.seed <= 2147483647:
            raise ValueError("Seed must be between 0 and 2147483647.")
        if self.objective not in {"qed", "sa"}:
            raise ValueError("Optimization objective must be qed or sa.")


@contextmanager
def inference_lock():
    with (ROOT / "inference.lock").open("a") as stream:
        try:
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise ValueError(
                "Another DiffSBDD generation is running; wait for it to finish."
            ) from exc
        try:
            yield
        finally:
            fcntl.flock(stream, fcntl.LOCK_UN)


def run(request: Request):
    request.validate()
    options = request.settings or DesignOptions(
        count=request.count,
        atoms=request.atoms,
        seed=request.seed,
        task="optimize" if request.initial_ligand else "generate",
        objective=request.objective,
        population=request.count,
        rounds=1,
        survivors=1,
    )
    if options.task != "generate" and request.initial_ligand is None:
        raise ValueError("此设计任务需要上传或选择起始三维分子。")
    protein, residues, pocket_coords = validate_pocket(
        request.protein, request.reference, request.residues
    )
    with inference_lock():
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        directory = request.output.resolve() / f"{stamp}_{uuid4().hex[:8]}"
        directory.mkdir(parents=True, exist_ok=False)
        shutil.copyfile(protein, directory / "protein.pdb")
        save_pocket(protein, residues, directory / "pocket.pdb")
        report = {
            "status": "running",
            "source_commit": COMMIT,
            "checkpoint_sha256": model_spec(options.model)["sha256"],
            "model": options.model,
            "protein_sha256": hashlib.sha256(protein.read_bytes()).hexdigest(),
            "requested_attempts": options.attempts,
            "attempted": 0,
            "valid": 0,
            "target_atoms": options.atoms,
            "seed": options.seed,
            "batch_size": 1,
            "settings": options.model_dump(),
            "pocket_heavy_atoms": len(pocket_coords),
            "pocket_residues": residues,
            "rejected": [],
            "molecules": [],
            "notes": "Chemical validity is not binding activity. No docking, affinity prediction or experimental validation was performed.",
        }
        report_path = directory / "report.json"
        write_report(report_path, report)
        print(f"Output directory: {directory}", flush=True)
        started = time.monotonic()
        try:
            with (directory / "model.log").open("w") as log, redirect_stdout(log):
                model = load_model(options.model)
            import torch

            torch.manual_seed(options.seed)
            np.random.seed(options.seed)
            random.seed(options.seed)
            torch.cuda.reset_peak_memory_stats()
            report.update(
                gpu=torch.cuda.get_device_name(),
                steps=options.steps,
                parameters=sum(p.numel() for p in model.parameters()),
            )
            optimizer = None
            if request.initial_ligand:
                shutil.copyfile(request.initial_ligand, directory / "edited_input.sdf")
            sampler = None
            if options.task == "optimize":
                from .optimization import Optimizer

                optimizer = Optimizer(
                    model, protein, residues, request.initial_ligand, options
                )
                report.update(
                    mode="optimization",
                    steps=options.change_steps,
                    optimization=optimizer.summary(),
                )
            else:
                sampler = Sampler(
                    model, protein, residues, options, request.initial_ligand
                )
                report["mode"] = options.task
                if options.task == "inpaint":
                    report["bond_reconstruction"] = (
                        "保留输入片段的内部键型；新增键根据模型生成的坐标构建，并重新检查价态。"
                        if options.preserve_bonds
                        else "官方原子约束：固定元素和位置，内部键型可能改变。"
                    )
            fields = [
                "attempt",
                "smiles",
                "heavy_atoms",
                "molecular_weight",
                "qed",
                "logp",
                "minimum_pocket_distance_angstrom",
                "pocket_atom_pairs_under_1_2_angstrom",
                "sa",
                "hbd",
                "hba",
                "tpsa",
                "rotatable_bonds",
                "fragments",
                "relaxation_converged",
            ]
            if optimizer:
                fields.extend(["objective_score", "improved_over_input", "round"])
            with (
                Chem.SDWriter(str(directory / "molecules.sdf")) as writer,
                Chem.SDWriter(str(directory / "raw_molecules.sdf")) as raw_writer,
                (directory / "molecules.csv").open("w", newline="") as stream,
            ):
                raw_writer.SetKekulize(False)
                table = csv.DictWriter(stream, fieldnames=fields)
                table.writeheader()
                for attempt in range(1, options.attempts + 1):
                    with torch.inference_mode():
                        molecules = (
                            optimizer.sample((attempt - 1) % options.population)
                            if optimizer
                            else sampler.sample(directory)
                        )
                    report["attempted"] = attempt
                    if not molecules:
                        report["rejected"].append(
                            {
                                "attempt": attempt,
                                "reason": "Upstream returned no molecule",
                            }
                        )
                    for molecule in molecules:
                        molecule.SetProp("_Name", f"DiffSBDD_{attempt:04d}")
                        molecule.SetIntProp("generation_attempt", attempt)
                        raw_writer.write(molecule)
                        if sampler:
                            molecule = sampler.restore_fixed_bonds(molecule)
                        valid, measurements = process_candidate(
                            molecule, options, pocket_coords
                        )
                        if valid is not None and sampler:
                            reason = sampler.check_fixed(valid)
                            if reason:
                                valid, measurements = None, {"reason": reason}
                        measurements["attempt"] = attempt
                        if valid is None:
                            report["rejected"].append(measurements)
                        else:
                            if optimizer:
                                score, improved = optimizer.consider(valid)
                                measurements.update(
                                    objective_score=score,
                                    improved_over_input=improved,
                                    round=optimizer.round,
                                )
                                report["optimization"] = optimizer.summary()
                            writer.write(valid)
                            table.writerow(measurements)
                            report["molecules"].append(measurements)
                            report["valid"] += 1
                    if optimizer and attempt % options.population == 0:
                        optimizer.finish_round()
                        report["optimization"] = optimizer.summary()
                    writer.flush()
                    raw_writer.flush()
                    stream.flush()
                    write_report(report_path, report)
                    print(
                        f"Attempt {attempt}/{options.attempts}; valid molecules: {report['valid']}",
                        flush=True,
                    )
                    if time.monotonic() - started > 3600:
                        raise TimeoutError(
                            "One-hour run limit reached; partial results have been saved."
                        )
            torch.cuda.synchronize()
            if optimizer:
                with Chem.SDWriter(str(directory / "best.sdf")) as best_writer:
                    best_writer.write(optimizer.best)
            report.update(
                status="completed" if report["valid"] else "no_valid_molecules",
                elapsed_seconds=round(time.monotonic() - started, 3),
                peak_gpu_allocated_mib=round(
                    torch.cuda.max_memory_allocated() / 2**20, 1
                ),
                peak_gpu_reserved_mib=round(
                    torch.cuda.max_memory_reserved() / 2**20, 1
                ),
                peak_process_rss_mib=round(
                    resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1
                ),
            )
        except BaseException as exc:
            report.update(
                status="cancelled" if isinstance(exc, KeyboardInterrupt) else "failed",
                error=str(exc),
                elapsed_seconds=round(time.monotonic() - started, 3),
            )
            write_report(report_path, report)
            raise
        write_report(report_path, report)
        print(
            json.dumps(
                {
                    k: v
                    for k, v in report.items()
                    if k
                    in {
                        "status",
                        "attempted",
                        "valid",
                        "elapsed_seconds",
                        "peak_gpu_allocated_mib",
                        "peak_gpu_reserved_mib",
                    }
                },
                indent=2,
            )
        )
        return directory, report
