"""Identify the installed workbench separately from the upstream model revision."""

from functools import lru_cache
import subprocess
from .config import PACKAGE


@lru_cache(maxsize=1)
def build_identity():
    try:
        revision = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=PACKAGE,
            capture_output=True,
            text=True,
            timeout=3,
            check=True,
        ).stdout.strip()
        status = subprocess.run(
            ["git", "status", "--porcelain", "--untracked-files=normal"],
            cwd=PACKAGE,
            capture_output=True,
            text=True,
            timeout=3,
            check=True,
        ).stdout.strip()
        return {"workbench_commit": revision, "workbench_dirty": bool(status)}
    except (OSError, subprocess.SubprocessError):
        return {"workbench_commit": None, "workbench_dirty": None}
