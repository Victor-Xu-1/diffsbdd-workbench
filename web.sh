#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
runtime="${DIFFSBDD_HOME:-/opt/diffsbdd}"
export PYTHONDONTWRITEBYTECODE=1 MPLBACKEND=Agg WANDB_MODE=disabled
exec "$runtime/venv/bin/python" -m local_diffsbdd.web
