"""Validated, self-contained saved designs with optimistic concurrency."""

from datetime import datetime, timezone
import json
from pathlib import Path
import re
import threading
from uuid import uuid4
from pydantic import BaseModel, ConfigDict, Field, field_validator
from .contracts import GenerationInput
from .pockets import prepare_input
from .results import write_report


class SaveDesign(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=80)
    revision: int = Field(default=0, ge=0)
    request: GenerationInput

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        value = value.strip()
        if not value or any(ord(c) < 32 for c in value):
            raise ValueError("请输入有效的设计名称。")
        return value


class RevisionConflict(ValueError):
    pass


class DesignStore:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()

    def path(self, identifier):
        if not re.fullmatch("[0-9a-f]{32}", identifier):
            raise ValueError("找不到保存的设计。")
        path = (self.root / f"{identifier}.json").resolve()
        if not path.is_relative_to(self.root):
            raise ValueError("设计路径无效。")
        return path

    def get(self, identifier):
        with self.lock:
            path = self.path(identifier)
            if not path.is_file():
                raise ValueError("找不到保存的设计。")
            return json.loads(path.read_text())

    def list(self):
        with self.lock:
            records = []
            for path in self.root.glob("*.json"):
                record = self.get(path.stem)
                records.append(
                    {
                        key: record[key]
                        for key in ("id", "name", "revision", "updated_at")
                    }
                )
            return [
                {k: r[k] for k in ("id", "name", "revision", "updated_at")}
                for r in sorted(records, key=lambda r: r["updated_at"], reverse=True)
            ]

    def save(self, payload, manager, identifier=None):
        # Snapshot result-derived inputs now so reopening never depends on a
        # browser File object, temporary path or a previous selection.
        with prepare_input(payload.request, manager) as prepared:
            data = {
                "mode": "custom",
                "protein_text": prepared.protein.read_text(),
                "options": payload.request.options.model_dump(),
            }
            if prepared.reference:
                if prepared.reference.endswith(".sdf"):
                    data["reference_sdf"] = Path(prepared.reference).read_text()
                else:
                    data["reference"] = prepared.reference
            else:
                data["residues"] = prepared.residues
            if prepared.initial:
                data["initial_sdf"] = prepared.initial.read_text()
        portable = GenerationInput.model_validate(data).model_dump()
        with self.lock:
            if identifier:
                previous = self.get(identifier)
                if payload.revision != previous["revision"]:
                    raise RevisionConflict(
                        "此设计已在另一个页面更新，请重新打开后再保存。"
                    )
                revision = previous["revision"] + 1
            else:
                if len(list(self.root.glob("*.json"))) >= 500:
                    raise ValueError("已达到 500 个保存设计的上限，请更新现有设计。")
                identifier = uuid4().hex
                revision = 1
            record = {
                "schema": 1,
                "id": identifier,
                "name": payload.name,
                "revision": revision,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "request": portable,
            }
            write_report(self.path(identifier), record)
            return record
