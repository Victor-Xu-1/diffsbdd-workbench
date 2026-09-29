"""Public local API inputs. Never accept server paths or executable arguments."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .options import DesignOptions


class GenerationInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mode: Literal["demo", "custom", "result"] = "demo"
    options: DesignOptions = Field(default_factory=DesignOptions)
    protein_text: str = Field(default="", max_length=5_000_000)
    reference: str | None = Field(default=None, max_length=30)
    reference_sdf: str = Field(default="", max_length=1_000_000)
    residues: list[str] = Field(default_factory=list, max_length=250)
    initial_sdf: str = Field(default="", max_length=1_000_000)
    parent_job: str | None = Field(default=None, pattern=r"^[0-9a-f]{32}$")
    molecule_index: int = Field(default=0, ge=0, le=99)
    edit_id: str | None = Field(default=None, pattern=r"^[0-9a-f]{32}$")

    @model_validator(mode="after")
    def input_combination(self):
        if self.mode == "custom":
            if not self.protein_text:
                raise ValueError("请上传蛋白 PDB 文件。")
            if (
                sum(
                    bool(v) for v in (self.reference, self.reference_sdf, self.residues)
                )
                != 1
            ):
                raise ValueError("请指定一种口袋定义：配体编号、参考 SDF 或残基列表。")
        if self.mode == "result" and not self.parent_job:
            raise ValueError("请先选择一个历史任务及起始分子。")
        if (
            self.options.task != "generate"
            and self.mode != "result"
            and not self.initial_sdf
        ):
            raise ValueError("固定片段设计或性质优化需要上传三维起始分子。")
        return self


class EditInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    index: int = Field(ge=0, le=99)
    molblock: str = Field(min_length=20, max_length=100_000)
    notes: str = Field(default="", max_length=3000)
    rating: int = Field(default=0, ge=0, le=5)
