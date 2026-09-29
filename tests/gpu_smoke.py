"""Real CUDA inference regression. Run when the workbench has no active task."""

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time

from local_diffsbdd.registry import CATALOG

PACKAGE = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--all-models", action="store_true")
    parser.add_argument("--case", action="append", help="Run selected named cases only")
    parser.add_argument("--output", type=Path, default=PACKAGE / "verification/gpu")
    args = parser.parse_args()
    output = args.output.resolve() / str(time.time_ns())
    output.mkdir(parents=True)
    models = (
        CATALOG
        if args.all_models
        else [m for m in CATALOG if m["id"] == "crossdocked_fullatom_cond"]
    )
    cases = [(m["id"], {"model": m["id"], "count": 1, "atoms": 24}) for m in models]
    cases += [
        ("diversify", {"task": "diversify", "count": 2, "change_steps": 100}),
        (
            "growth",
            {
                "task": "inpaint",
                "count": 3,
                "fixed_atoms": [5, 16],
                "added_atoms": 16,
                "fragment_policy": "all",
                "preserve_bonds": True,
            },
        ),
        (
            "linking",
            {
                "task": "inpaint",
                "count": 3,
                "fixed_atoms": [5, 16, 6, 22],
                "added_atoms": 16,
                "fragment_policy": "all",
                "preserve_bonds": False,
                "resamplings": 2,
            },
        ),
        (
            "sa",
            {
                "task": "optimize",
                "objective": "sa",
                "population": 3,
                "rounds": 2,
                "survivors": 2,
            },
        ),
        (
            "automatic-size",
            {
                "size_mode": "sample",
                "size_bias": -2,
                "minimum_atoms": 16,
                "count": 2,
                "relaxation": 100,
            },
        ),
    ]
    if args.case:
        missing = set(args.case) - {name for name, _ in cases}
        if missing:
            parser.error(f"Unknown cases: {sorted(missing)}")
        cases = [case for case in cases if case[0] in args.case]
    evidence = []
    for name, settings in cases:
        config = output / (name + ".json")
        config.write_text(json.dumps(settings))
        command = [
            sys.executable,
            "-m",
            "local_diffsbdd",
            settings.get("task", "generate"),
            "--protein",
            str(PACKAGE / "examples/3rfm.pdb"),
            "--reference",
            "A:330",
            "--settings",
            str(config),
            "--output",
            str(output / name),
        ]
        if settings.get("task") in {"inpaint", "optimize", "diversify"}:
            command += [
                "--initial-ligand",
                str(PACKAGE / "tests/fixtures/generated_3rfm.sdf"),
            ]
        process = subprocess.run(
            command,
            cwd=PACKAGE,
            env=dict(os.environ, PYTHONDONTWRITEBYTECODE="1"),
            capture_output=True,
            text=True,
            timeout=600,
        )
        reports = list((output / name).glob("*/report.json"))
        if not reports:
            raise AssertionError(process.stderr[-3000:])
        report = json.loads(reports[0].read_text())
        record = {
            "case": name,
            "exit_code": process.returncode,
            "status": report["status"],
            "valid": report["valid"],
            "attempted": report["attempted"],
            "seconds": report["elapsed_seconds"],
            "error": report.get("error"),
            "connected": sum(m.get("fragments", 1) == 1 for m in report["molecules"]),
        }
        evidence.append(record)
        (output / "summary.json").write_text(json.dumps(evidence, indent=2))
        print(json.dumps(record), flush=True)
        if process.returncode != 0 or report["valid"] < 1:
            raise AssertionError(f"{name}: {report.get('error', report['rejected'])}")
    print(f"Evidence: {output}", flush=True)


if __name__ == "__main__":
    main()
