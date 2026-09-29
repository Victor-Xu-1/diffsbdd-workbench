"""Command line entry point; no network service or model upload is involved."""

import argparse
import json
from pathlib import Path
import signal
import sys


def parser():
    result = argparse.ArgumentParser(
        description="Local DiffSBDD GPU inference, batch size 1."
    )
    actions = result.add_subparsers(dest="action", required=True)
    actions.add_parser(
        "doctor", help="Check checkpoint, CUDA/scatter and chemistry runtime"
    )
    for name in ("demo", "generate", "optimize", "inpaint", "diversify"):
        command = actions.add_parser(name)
        command.add_argument(
            "--count",
            type=int,
            default=3,
            help="Generation attempts, not guaranteed valid count",
        )
        command.add_argument(
            "--atoms",
            type=int,
            default=32,
            help="Target atom count before largest-fragment selection",
        )
        command.add_argument("--seed", type=int, default=2026)
        command.add_argument("--output", type=Path, default=Path("runs"))
        command.add_argument(
            "--settings",
            type=Path,
            help="JSON containing the shared DesignOptions contract",
        )
        if name in {"generate", "optimize", "inpaint", "diversify"}:
            command.add_argument("--protein", type=Path, required=True)
            group = command.add_mutually_exclusive_group(required=True)
            group.add_argument(
                "--reference", help="Reference ligand A:330, or aligned 3D SDF"
            )
            group.add_argument(
                "--residue",
                action="append",
                dest="residues",
                help="Pocket residue A:123; repeat as needed",
            )
        if name in {"optimize", "inpaint", "diversify"}:
            command.add_argument("--initial-ligand", type=Path, required=True)
            command.add_argument("--objective", choices=["qed", "sa"], default="qed")
    return result


def main():
    args = parser().parse_args()
    from .runtime import SOURCE, doctor

    try:
        if args.action == "doctor":
            print(json.dumps(doctor(), indent=2))
            return 0
        from .generation import Request, run
        from .options import DesignOptions

        settings = (
            DesignOptions.model_validate_json(args.settings.read_text())
            if args.settings
            else DesignOptions(
                task="diversify", count=args.count, atoms=args.atoms, seed=args.seed
            )
            if args.action == "diversify"
            else None
        )
        if args.action == "inpaint" and settings is None:
            raise ValueError("固定片段设计需要 --settings JSON 文件指定保留原子。")
        if settings and settings.task != (
            "generate" if args.action == "demo" else args.action
        ):
            raise ValueError("命令和设置文件中的设计任务不一致。")
        if args.action == "demo":
            protein, reference, residues = SOURCE / "example/3rfm.pdb", "A:330", ()
        else:
            protein, reference, residues = (
                args.protein,
                args.reference,
                tuple(args.residues or ()),
            )
        signal.signal(signal.SIGALRM, timed_out)
        signal.alarm(3600)
        _, report = run(
            Request(
                protein=protein,
                output=args.output,
                count=args.count,
                atoms=args.atoms,
                seed=args.seed,
                reference=reference,
                residues=residues,
                initial_ligand=getattr(args, "initial_ligand", None),
                objective=getattr(args, "objective", "qed"),
                settings=settings,
            )
        )
        return 0 if report["valid"] else 3
    except KeyboardInterrupt:
        print(
            "Cancelled; any completed results remain in the output directory.",
            file=sys.stderr,
        )
        return 130
    except Exception as exc:
        print(f"DiffSBDD error: {exc}", file=sys.stderr)
        return 1
    finally:
        signal.alarm(0)


def cancelled(_signum, _frame):
    raise KeyboardInterrupt()


def timed_out(_signum, _frame):
    raise TimeoutError(
        "One-hour run limit reached; completed results remain available."
    )


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, cancelled)
    raise SystemExit(main())
