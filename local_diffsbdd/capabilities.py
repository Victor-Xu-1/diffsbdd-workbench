"""Single UI capability authority, derived from the actual inference contract.

Presentation annotations do not redefine validation ranges or enum values.
Task conditions describe the options consumed by the native adapters.
"""

from .options import DesignOptions
from .registry import available_models

TASKS = {
    "generate": {
        "icon": "flask",
        "label": "从头生成",
        "title": "新建设计任务",
        "help": "根据蛋白口袋探索全新的分子结构。",
        "settings_title": "生成新分子",
        "source_label": None,
        "source_help": "",
    },
    "inpaint": {
        "icon": "atom",
        "label": "局部结构设计",
        "title": "局部结构设计",
        "help": "保留关键片段，在口袋中重新设计其余结构。",
        "settings_title": "保留片段与生长设置",
        "source_label": "要保留片段的起始分子",
        "source_help": "载入与蛋白同一坐标系的三维 SDF，再在下方结构中点选要保留的环或原子。其余部分由模型重新设计。",
        "forced": {"relaxation": 0, "fragment_policy": "all"},
    },
    "diversify": {
        "icon": "schema",
        "label": "分子多样化",
        "title": "探索相似分子",
        "help": "从三维起始分子生成结构变体，不按性质筛选。",
        "settings_title": "结构变体与改动幅度",
        "source_label": "用于衍生变体的起始分子",
        "source_help": "载入三维 SDF 或选择已有结果。小幅改造偏向相似结构；扩大变化会探索更多结构差异，不保证保留原骨架。",
    },
    "optimize": {
        "icon": "chart-bar",
        "label": "性质优化",
        "title": "性质优化任务",
        "help": "逐轮探索并按 QED 或 SA 筛选，不代表结合活性改善。",
        "settings_title": "优化目标与逐轮筛选",
        "source_label": "需要优化的起始分子",
        "source_help": "载入三维 SDF 或选择已有结果，再选择优化目标。每轮保留评分更好的候选继续探索。",
    },
}

# name, label, section, task applicability, additional condition
FIELDS = [
    ("count", "生成数量", "sampling-fields", ["generate", "inpaint", "diversify"], {}),
    ("size_mode", "分子大小", "sampling-fields", ["generate", "inpaint"], {}),
    (
        "atoms",
        "目标大小（重原子数）",
        "sampling-fields",
        ["generate"],
        {"size_mode": ["fixed"]},
    ),
    (
        "added_atoms",
        "新增重原子数",
        "inpaint-controls",
        ["inpaint"],
        {"size_mode": ["fixed"]},
    ),
    ("fixed_atoms", "保留原子编号（从 1 开始）", "advanced-fields", ["inpaint"], {}),
    ("preserve_bonds", "保留方式", "inpaint-controls", ["inpaint"], {}),
    ("center", "新原子的初始探索区域", "inpaint-controls", ["inpaint"], {}),
    (
        "trajectory",
        "保存扩散中间态（单个候选，诊断用）",
        "advanced-fields",
        ["inpaint"],
        {},
    ),
    ("objective", "优化目标", "optimization-fields", ["optimize"], {}),
    ("population", "每轮探索候选数", "optimization-fields", ["optimize"], {}),
    ("rounds", "优化轮数", "optimization-fields", ["optimize"], {}),
    ("survivors", "每轮保留候选数", "advanced-fields", ["optimize"], {}),
    (
        "change_steps",
        "结构改动幅度",
        "variation-fields",
        ["optimize", "diversify"],
        {},
    ),
    ("steps", "构象探索步数", "advanced-fields", ["generate", "inpaint"], {}),
    ("resamplings", "每步重复探索次数", "advanced-fields", ["inpaint"], {}),
    (
        "jump_length",
        "重新探索跨度",
        "advanced-fields",
        ["generate"],
        {"strategy": ["joint"]},
    ),
    (
        "minimum_atoms",
        "自动大小的最少重原子数",
        "advanced-fields",
        ["generate", "inpaint"],
        {"size_mode": ["sample"]},
    ),
    (
        "size_bias",
        "自动大小的重原子数调整",
        "advanced-fields",
        ["generate", "inpaint"],
        {"size_mode": ["sample"]},
    ),
    (
        "relaxation",
        "自由构象松弛次数（0 为关闭）",
        "advanced-fields",
        ["generate", "diversify", "optimize"],
        {},
    ),
    (
        "fragment_policy",
        "不相连片段的处理",
        "advanced-fields",
        ["generate", "diversify", "optimize"],
        {},
    ),
    ("seed", "复现实验编号（随机种子）", "advanced-fields", list(TASKS), {}),
]
CHOICES = {
    "size_mode": ["指定大小", "按口袋自动选择"],
    "center": ["保留片段周围", "口袋中心周围"],
    "fragment_policy": ["只保留最大片段", "保留所有片段并标明未连接"],
    "objective": ["提高类药性（QED）", "降低合成难度（SA）"],
}


def task_presets(task):
    output = []
    for level, title, count, change in [
        ("quick", "快速试跑", 3, 50),
        ("standard", "常规设计", 10, 100),
        ("explore", "更多探索", 30, 150),
    ]:
        options = dict(
            count=count, steps=100 if level == "quick" else 500, relaxation=0
        )
        if task == "optimize":
            title = {
                "quick": "单轮试跑",
                "standard": "三轮筛选",
                "explore": "五轮筛选",
            }[level]
            population, rounds, survivors = {
                "quick": (3, 1, 1),
                "standard": (5, 3, 2),
                "explore": (10, 5, 3),
            }[level]
            options.update(
                population=population,
                rounds=rounds,
                survivors=survivors,
                change_steps=change,
            )
        elif task == "diversify":
            title = {
                "quick": "小幅改造",
                "standard": "适度探索",
                "explore": "扩大变化",
            }[level]
            options.update(change_steps=change)
        elif task == "inpaint":
            options.update(
                steps=500,
                resamplings=3 if level == "explore" else 1,
                fragment_policy="all",
                preserve_bonds=True,
                size_mode="sample",
                minimum_atoms=8,
                size_bias=0,
                trajectory=False,
            )
        else:
            options.update(
                atoms=24,
                size_mode="fixed" if level == "quick" else "sample",
                minimum_atoms=8,
                size_bias=0,
                fragment_policy="largest",
                resamplings=1,
                jump_length=1,
            )
        validated = DesignOptions.model_validate(
            dict(
                options,
                task=task,
                **({"fixed_atoms": [0]} if task == "inpaint" else {}),
            )
        )
        output.append(
            {
                "id": level,
                "label": title,
                "attempts": validated.attempts,
                "options": options,
            }
        )
    return output


def capabilities():
    properties = DesignOptions.model_json_schema()["properties"]
    fields = {}
    for name, label, section, tasks, conditions in FIELDS:
        field = {
            **properties[name],
            "label": label,
            "section": section,
            "when": [{"task": tasks, **conditions}],
        }
        if name in CHOICES:
            field["choices"] = [
                {"value": value, "label": label}
                for value, label in zip(field["enum"], CHOICES[name], strict=True)
            ]
        if name == "preserve_bonds":
            field["choices"] = [
                {"value": True, "label": "完整片段（元素、位置和内部键）"},
                {"value": False, "label": "仅元素与位置（官方原子约束）"},
            ]
        if name == "resamplings":
            field["when"].append({"task": ["generate"], "strategy": ["joint"]})
        field["id"] = {"fixed_atoms": "fixed-atoms", "preserve_bonds": "bond_mode"}.get(
            name, name
        )
        fields[name] = field
    models = []
    for model in available_models():
        dataset = "Binding MOAD" if model["dataset"] == "moad" else "CrossDocked"
        representation = "Cα" if model["representation"] == "ca" else "全原子"
        strategy = "条件生成" if model["strategy"] == "cond" else "联合分布"
        models.append(
            {
                **model,
                "label": f"{dataset} · {representation} · {strategy}",
                "tasks": list(TASKS) if model["strategy"] == "cond" else ["generate"],
            }
        )
    return {
        "schema": 1,
        "default_model": properties["model"]["default"],
        "default_task": properties["task"]["default"],
        "default_preset": "standard",
        "continuation_task": "optimize",
        "fields": fields,
        "tasks": {
            name: {**value, "presets": task_presets(name)}
            for name, value in TASKS.items()
        },
        "models": models,
        "rules": [
            {"when": {"task": ["inpaint"], "trajectory": [True]}, "set": {"count": 1}}
        ],
        "example": {"name": "3rfm.pdb", "reference": "A:330"},
    }
