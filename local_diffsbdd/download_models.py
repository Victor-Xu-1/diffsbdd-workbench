"""Download official model assets with bounded transfers and exact checksums."""

import hashlib
import time
from urllib.request import urlopen

from .registry import CATALOG
from .runtime import ROOT


def digest(path):
    with path.open("rb") as stream:
        result = hashlib.sha256()
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(chunk)
        return result.hexdigest()


def download(spec):
    directory = ROOT / "models"
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / spec["file"]
    if target.exists():
        if digest(target) != spec["sha256"]:
            raise ValueError(
                f"Existing model checksum differs: {spec['id']}; move it aside and rerun."
            )
        print(f"Verified {spec['id']}", flush=True)
        return
    temporary = target.with_suffix(".ckpt.part")
    url = f"https://zenodo.org/records/8183747/files/{spec['file']}?download=1"
    for attempt in range(3):
        try:
            started = time.monotonic()
            length = 0
            with urlopen(url, timeout=60) as response, temporary.open("wb") as stream:
                while chunk := response.read(1024 * 1024):
                    length += len(chunk)
                    if length > spec["bytes"] or time.monotonic() - started > 600:
                        raise ValueError(
                            "Download exceeded the expected size or ten-minute limit."
                        )
                    stream.write(chunk)
            if length != spec["bytes"] or digest(temporary) != spec["sha256"]:
                raise ValueError(f"Model checksum mismatch: {spec['id']}")
            temporary.replace(target)
            print(f"Installed {spec['id']}", flush=True)
            return
        except (OSError, TimeoutError):
            if attempt == 2:
                raise
            print(
                f"Download interrupted for {spec['id']}; retry {attempt + 1}/2",
                flush=True,
            )
            time.sleep(2**attempt)


if __name__ == "__main__":
    for model in CATALOG:
        download(model)
