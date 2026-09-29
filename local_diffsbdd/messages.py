"""Medicinal-chemistry wording at the presentation boundary."""

import re

RULES = [
    (
        r"out of memory",
        "显存不足。请关闭其他占用显卡的程序，或减小口袋和分子大小后重试。",
    ),
    (r"CUDA|GPU is unavailable", "显卡计算环境不可用，请运行环境检查后重试。"),
    (
        r"checkpoint|source revision|Source differs",
        "模型安装文件缺失或校验不符。请重新运行安装程序；不会加载未经核验的模型。",
    ),
    (
        r"No protein pocket|Residue not found|Invalid residue",
        "找不到指定口袋残基，请检查链号和残基编号，格式如 A:123。",
    ),
    (
        r"Reference.*missing|Reference.*ambiguous",
        "PDB 中没有唯一匹配的参考配体，请检查链号和配体编号。",
    ),
    (
        r"Reference.*amino acid|Reference.*water",
        "参考编号指向氨基酸或水分子，请指定实际的小分子配体。",
    ),
    (
        r"Reference.*3D|coordinates aligned",
        "参考配体需要与蛋白对齐的三维坐标；二维结构不能直接定义口袋。",
    ),
    (
        r"Reference SDF|Reference must",
        "参考 SDF 应只包含一个化学有效的三维配体，或使用 PDB 配体编号如 A:330。",
    ),
    (
        r"PDB contains no|Empty file|Input file.*nonempty",
        "结构文件为空或没有可识别的原子，请检查上传文件。",
    ),
    (r"Pocket has", "所选口袋超出本机支持范围（1–1000 个重原子），请缩小口袋范围。"),
    (
        r"Unsupported pocket|standard amino acids",
        "当前口袋输入只支持标准氨基酸、无插入码的残基及模型支持的元素。",
    ),
    (r"non-finite|Non-finite", "结构中存在无效的三维坐标，请检查输入或重新生成。"),
    (r"RDKit sanitization|valence|kekuliz", "原子价态或芳香性未通过化学检查。"),
    (r"Disconnected", "结构包含不相连的片段。"),
    (r"Another DiffSBDD", "已有模型计算在运行，请等待完成或取消当前任务。"),
    (r"One-hour", "已达到一小时计算上限。已完成结果仍保留，请减少候选数后重试。"),
    (
        r"Unknown job|not found|not ready|Unsupported download|does not exist",
        "找不到所选记录或结果尚未生成，请刷新历史任务。",
    ),
    (
        r"Server restarted",
        "服务重启使计算中断。已完成的结果仍保留，可以复用设置重新开始。",
    ),
]


def public_message(error):
    text = str(error)
    if re.search(r"[\u4e00-\u9fff]", text):
        return text
    for pattern, translation in RULES:
        if re.search(pattern, text, flags=re.I):
            return translation
    return "计算未完成，请检查输入结构与设计设置。开发维护用诊断中保留了详细原因。"


def validation_message(error):
    labels = {
        "count": "候选生成次数",
        "atoms": "重原子数",
        "steps": "构象探索步数",
        "population": "每轮候选数",
        "rounds": "优化轮数",
        "survivors": "每轮保留数",
        "fixed_atoms": "保留原子",
        "seed": "复现实验编号",
        "model": "模型",
        "protein_text": "蛋白结构",
        "initial_sdf": "起始三维结构",
        "molblock": "编辑结构",
    }
    name = labels.get(str(error["loc"][-1]), "设计输入")
    context = error.get("ctx", {})
    if error["type"] == "value_error":
        return public_message(context.get("error", error["msg"]))
    for key, phrase in [
        ("le", "不得超过"),
        ("ge", "不得小于"),
        ("max_length", "长度不得超过"),
    ]:
        if key in context:
            return f"{name}：{phrase} {context[key]}。"
    return f"{name}的格式不正确，请检查必填项、数值范围及所选选项。"
