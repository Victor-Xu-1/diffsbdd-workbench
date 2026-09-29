"""Shared, bounded inference contract used by the API, CLI and worker."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class DesignOptions(BaseModel):
    model_config = ConfigDict(extra="forbid", validate_default=True)
    task: Literal["generate", "inpaint", "optimize", "diversify"] = "generate"
    model: str = "crossdocked_fullatom_cond"
    count: int = Field(default=3, ge=1, le=100)
    atoms: int = Field(default=32, ge=8, le=80)
    size_mode: Literal["fixed", "sample"] = "fixed"
    size_bias: int = Field(default=0, ge=-30, le=30)
    minimum_atoms: int = Field(default=8, ge=8, le=80)
    seed: int = Field(default=2026, ge=0, le=2147483647)
    steps: int = Field(default=500, ge=10, le=500)
    resamplings: int = Field(default=1, ge=1, le=20)
    jump_length: int = Field(default=1, ge=1, le=50)
    fragment_policy: Literal["largest", "all"] = "largest"
    relaxation: int = Field(default=0, ge=0, le=1000)
    fixed_atoms: list[int] = Field(default_factory=list, max_length=80)
    preserve_bonds: bool = True
    added_atoms: int = Field(default=10, ge=0, le=79)
    center: Literal["ligand", "pocket"] = "ligand"
    trajectory: bool = False
    objective: Literal["qed", "sa"] = "qed"
    population: int = Field(default=10, ge=1, le=100)
    rounds: int = Field(default=2, ge=1, le=20)
    survivors: int = Field(default=3, ge=1, le=100)
    change_steps: int = Field(default=100, ge=1, le=500)

    @model_validator(mode="after")
    def supported_combination(self):
        from .registry import model_spec

        spec = model_spec(self.model)
        if self.task != "generate" and spec["strategy"] != "cond":
            raise ValueError("固定片段设计和性质优化需要选择条件模型。")
        if (
            self.task == "generate"
            and spec["strategy"] == "joint"
            and self.jump_length > self.steps
        ):
            raise ValueError("重新探索跨度不能超过构象探索步数。")
        if self.trajectory and (self.task != "inpaint" or self.count != 1):
            raise ValueError("生成过程预览适用于固定片段设计，且每次生成 1 个候选。")
        if self.task == "inpaint":
            if (
                not self.fixed_atoms
                or min(self.fixed_atoms) < 0
                or len(set(self.fixed_atoms)) != len(self.fixed_atoms)
            ):
                raise ValueError("请至少选择一个保留原子，编号不得重复。")
            if self.relaxation:
                raise ValueError("保留片段设计不能使用自由构象松弛，以免移动固定原子。")
            if self.fragment_policy != "all":
                raise ValueError("固定片段设计需保留全部片段，再检查它们是否成功连接。")
        if self.task == "optimize":
            if self.survivors > self.population:
                raise ValueError("每轮保留数不能超过每轮候选数。")
            if self.population * self.rounds > 100:
                raise ValueError(
                    "本机每个优化任务最多探索 100 个候选，请减小轮数或候选数。"
                )
        return self

    @property
    def attempts(self):
        return self.population * self.rounds if self.task == "optimize" else self.count
