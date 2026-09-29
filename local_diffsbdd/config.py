"""Process-level settings; secrets and user data are never source configuration."""

import os
from pathlib import Path

PACKAGE = Path(__file__).resolve().parents[1]
RUNTIME = Path(os.environ.get("DIFFSBDD_HOME", "/opt/diffsbdd")).expanduser().resolve()
DATA = (
    Path(os.environ.get("DIFFSBDD_DATA_DIR", str(PACKAGE / "runs")))
    .expanduser()
    .resolve()
)
PORT = int(os.environ.get("DIFFSBDD_PORT", "7865"))
if not 1024 <= PORT <= 65535:
    raise ValueError("DIFFSBDD_PORT must be between 1024 and 65535.")
