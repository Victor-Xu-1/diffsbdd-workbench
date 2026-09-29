#!/usr/bin/env bash
# Run inside Ubuntu/WSL2. This only owns /opt/diffsbdd and this deployment package.
set -euo pipefail
package_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
runtime="${DIFFSBDD_HOME:-/opt/diffsbdd}"
commit=5d0d38d16c8932a0339fd2ce3f67ade98bbdff27
uv_bin="$(command -v uv || true)"
if [[ -z "$uv_bin" && -x "$HOME/.local/bin/uv" ]]; then
    uv_bin="$HOME/.local/bin/uv"
fi
if [[ -z "$uv_bin" ]]; then
    echo 'uv is required. Install it from https://docs.astral.sh/uv/ first.' >&2
    exit 1
fi
if [[ ! -d "$runtime" || ! -w "$runtime" ]]; then
    echo 'Create a writable /opt/diffsbdd directory for your WSL user first (see README).' >&2
    exit 1
fi
export UV_CACHE_DIR="$runtime/cache"
export UV_PYTHON_INSTALL_DIR="$runtime/python"
export UV_CONCURRENT_DOWNLOADS=2
export UV_CONCURRENT_INSTALLS=2

if [[ ! -e "$runtime/source" ]]; then
    git clone --filter=blob:none --no-checkout https://github.com/arneschneuing/DiffSBDD.git "$runtime/source"
    git -C "$runtime/source" sparse-checkout init --no-cone
    git -C "$runtime/source" sparse-checkout set --no-cone '/*' '!/img/' '!/colab/'
    git -C "$runtime/source" checkout --detach "$commit"
fi
[[ "$(git -C "$runtime/source" rev-parse HEAD)" == "$commit" ]] || {
    echo 'Source revision differs; refusing to overwrite an existing installation.' >&2; exit 1;
}
patch="$package_dir/patches/upstream.patch"
if git -C "$runtime/source" apply --check "$patch" 2>/dev/null; then
    git -C "$runtime/source" apply "$patch"
else
    git -C "$runtime/source" apply --reverse --check "$patch"
fi
# The doctor below verifies the complete diff equals this one reviewed patch.

if [[ ! -x "$runtime/venv/bin/python" ]]; then
    "$uv_bin" venv "$runtime/venv" --python 3.10.20
fi
"$uv_bin" pip sync "$package_dir/requirements.lock" \
    --python "$runtime/venv/bin/python" --require-hashes \
    --extra-index-url https://download.pytorch.org/whl/cu128 \
    --find-links https://data.pyg.org/whl/torch-2.7.0+cu128.html \
    --index-strategy unsafe-best-match
"$uv_bin" pip check --python "$runtime/venv/bin/python"

cd "$package_dir"
PYTHONDONTWRITEBYTECODE=1 "$runtime/venv/bin/python" -m local_diffsbdd.download_models
PYTHONDONTWRITEBYTECODE=1 "$runtime/venv/bin/python" -m local_diffsbdd doctor
