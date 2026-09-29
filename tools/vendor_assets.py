"""Verify or restore pinned browser assets without extracting arbitrary paths."""

import argparse
import hashlib
import io
import json
from pathlib import Path
import tarfile
from urllib.request import urlopen
import zipfile

ROOT = Path(__file__).resolve().parents[1]
MAX_ARCHIVE = 50_000_000
MAX_MEMBER = 35_000_000


def fetch(url, expected):
    with urlopen(url, timeout=60) as response:
        data = response.read(MAX_ARCHIVE + 1)
    if len(data) > MAX_ARCHIVE or hashlib.sha256(data).hexdigest() != expected:
        raise ValueError(f"Unexpected asset size or checksum: {url}")
    return data


def asset_path(relative):
    target = (ROOT / relative).resolve()
    if not target.is_relative_to((ROOT / "web/vendor").resolve()):
        raise ValueError("Asset path escapes the vendor directory")
    return target


def save_asset(relative, content, manifest):
    if (
        len(content) > MAX_MEMBER
        or hashlib.sha256(content).hexdigest() != manifest["files"][relative]
    ):
        raise ValueError(f"Asset size or digest differs: {relative}")
    target = asset_path(relative)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)


def restore_archive(archive, manifest):
    data = fetch(archive["url"], archive["sha256"])
    if archive.get("format") == "zip":
        with zipfile.ZipFile(io.BytesIO(data)) as source:
            for member, destination in archive["files"].items():
                info = source.getinfo(member)
                if info.is_dir() or info.file_size > MAX_MEMBER:
                    raise ValueError(f"Invalid asset member: {member}")
                save_asset(destination, source.read(info), manifest)
    else:
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as source:
            for member, destination in archive["files"].items():
                info = source.getmember(member)
                if not info.isfile() or info.size > MAX_MEMBER:
                    raise ValueError(f"Invalid asset member: {member}")
                stream = source.extractfile(info)
                if stream is None:
                    raise ValueError(f"Cannot read asset: {member}")
                save_asset(destination, stream.read(), manifest)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--restore", action="store_true")
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    manifest = json.loads((ROOT / "vendor-manifest.json").read_text())
    if args.restore:
        for archive in manifest["archives"]:
            restore_archive(archive, manifest)
        for asset in manifest["supplemental"]:
            save_asset(
                asset["path"],
                fetch(asset["url"], manifest["files"][asset["path"]]),
                manifest,
            )
    for relative, expected in manifest["files"].items():
        path = asset_path(relative)
        if (
            not path.is_file()
            or hashlib.sha256(path.read_bytes()).hexdigest() != expected
        ):
            raise ValueError(f"Missing or modified vendor asset: {relative}")
    actual = {
        p.relative_to(ROOT).as_posix()
        for p in (ROOT / "web/vendor").rglob("*")
        if p.is_file()
    }
    if actual != set(manifest["files"]):
        raise ValueError(
            f"Undeclared bundled files: {sorted(actual - set(manifest['files']))}"
        )
    print(f"Verified {len(manifest['files'])} bundled files")


if __name__ == "__main__":
    main()
