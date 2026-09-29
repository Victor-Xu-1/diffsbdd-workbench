export const $ = (id) => document.getElementById(id);
export const schema = [
  ["count", "生成数量", 3, 1, 100, "sampling-fields"],
  ["atoms", "目标大小（重原子数）", 32, 8, 80, "advanced-fields"],
  ["added_atoms", "新增重原子数", 10, 0, 79, "inpaint-controls"],
  ["population", "每轮探索候选数", 10, 1, 100, "optimization-fields"],
  ["rounds", "优化轮数", 2, 1, 20, "optimization-fields"],
  ["survivors", "每轮保留候选数", 3, 1, 100, "optimization-fields"],
  ["change_steps", "结构改动幅度（1–500）", 100, 1, 500, "optimization-fields"],
  ["steps", "构象探索步数", 500, 10, 500, "advanced-fields"],
  ["resamplings", "每步重复探索次数", 1, 1, 20, "advanced-fields"],
  ["jump_length", "重新探索跨度", 1, 1, 50, "advanced-fields"],
  ["minimum_atoms", "自动大小的最少重原子数", 8, 8, 80, "advanced-fields"],
  ["size_bias", "自动大小的重原子数调整", 0, -30, 30, "advanced-fields"],
  ["relaxation", "自由构象松弛次数（0 为关闭）", 0, 0, 1000, "advanced-fields"],
  ["seed", "复现实验编号（随机种子）", 2026, 0, 2147483647, "advanced-fields"],
];
const choices = [
  [
    "size_mode",
    "分子大小",
    [
      ["fixed", "指定大小"],
      ["sample", "自动采样"],
    ],
    "sampling-fields",
  ],
  [
    "center",
    "新原子的初始探索区域",
    [
      ["ligand", "保留片段周围"],
      ["pocket", "口袋中心周围"],
    ],
    "inpaint-controls",
  ],
  [
    "bond_mode",
    "保留方式",
    [
      ["fragment", "完整片段（元素、位置、内部化学键）"],
      ["atoms", "仅元素与位置（官方原子约束）"],
    ],
    "inpaint-controls",
  ],
  [
    "objective",
    "优化目标",
    [
      ["qed", "提高类药性（QED，0–1，越高越好）"],
      ["sa", "降低合成难度（SA，1–10，越低越好）"],
    ],
    "optimization-fields",
  ],
  [
    "fragment_policy",
    "不相连片段的处理",
    [
      ["largest", "只保留最大片段"],
      ["all", "保留所有片段并标明未连接"],
    ],
    "advanced-fields",
  ],
];
export function mountControls() {
  for (const [id, label, value, min, max, target] of schema) {
    const group = document.createElement("div");
    group.id = `${id}-field`;
    const caption = document.createElement("label");
    caption.htmlFor = id;
    caption.textContent = label;
    const input = document.createElement("input");
    Object.assign(input, {
      id,
      type: "number",
      min,
      max,
      value,
      required: true,
    });
    group.append(caption, input);
    $(target).append(group);
  }
  for (const [id, label, values, target] of choices) {
    const group = document.createElement("div");
    group.id = `${id}-field`;
    const caption = document.createElement("label");
    caption.htmlFor = id;
    caption.textContent = label;
    const select = document.createElement("select");
    select.id = id;
    values.forEach(([value, text]) => select.add(new Option(text, value)));
    group.append(caption, select);
    $(target).append(group);
  }
  const label = document.createElement("label");
  label.className = "checks";
  const input = document.createElement("input");
  input.id = "trajectory";
  input.type = "checkbox";
  label.append(input, " 保存生成过程（单个候选，可播放）");
  $("inpaint-controls").append(label);
  const modelGroup = document.createElement("div"),
    modelLabel = document.createElement("label"),
    modelName = document.createElement("span");
  modelGroup.id = "model-summary";
  modelLabel.textContent = "模型";
  modelName.id = "model-family";
  modelName.className = "model-readonly";
  modelName.textContent = "CrossDocked";
  modelGroup.append(modelLabel, modelName);
  $("sampling-fields").append(modelGroup);
  for (const [id, text] of [
    ["count", "建议先生成 3–10 个试用"],
    ["size_mode", "根据口袋自动确定合适的分子大小"],
    ["model-summary", "使用官方数据集的预训练模型"],
  ]) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = text;
    $(id === "model-summary" ? id : `${id}-field`).append(p);
  }
  $("size_mode").value = "sample";

  for (const id of [
    "task",
    "mode",
    "pocket-type",
    "model",
    "size_mode",
    "trajectory",
  ])
    $(id).addEventListener("change", syncControls);
  $("design-purpose").addEventListener("change", syncControls);
  syncControls();
}
export function syncControls() {
  const task = $("task").value,
    source = $("mode").value,
    joint = $("model").value.endsWith("_joint");
  $("task-help").textContent = {
    generate: "从所选蛋白口袋出发探索全新的结构。",
    diversify: "从起始三维分子生成变体，不进行性质排序或逐轮选择。",
    inpaint:
      "固定所选片段的元素和空间位置，重建其余部分；化学键由坐标重建，再校验片段是否保留。",
    optimize: "从起始分子逐轮探索，按指定性质选择下一轮起点；不保证指标改善。",
  }[task];
  if (task === "inpaint")
    $("task-help").textContent +=
      " " +
      {
        片段生长: "保留一个核心片段，指定新增原子数以延展周边结构。",
        片段连接: "选择两个或多个片段中的保留原子，在原位尝试生成连接部分。",
        骨架跃迁: "保留关键外围基团，释放需要替换的中心骨架原子。",
        骨架修饰: "保留主体骨架，仅释放准备修改的局部原子。",
        指定原子补全: "按所选原子掩码补全其余结构，可切换为仅固定元素和位置。",
      }[$("design-purpose").value];
  $("custom-input").hidden = source === "demo";
  $("result-source").hidden = source !== "result";
  $("initial-input").hidden = task === "generate" || source === "result";
  $("inpaint-fields").hidden = task !== "inpaint";
  $("optimization-fields").hidden = task !== "optimize";
  $("diversification-fields").hidden = task !== "diversify";
  $(
    task === "diversify" ? "diversification-fields" : "optimization-fields",
  ).append($("change_steps-field"));
  $("size_mode-field").hidden = task === "diversify";
  $("model-strategy").querySelector('[value="joint"]').disabled =
    task !== "generate";

  $("sampling-fields").hidden = task === "optimize";
  $("steps-field").hidden = ["optimize", "diversify"].includes(task);
  $("resamplings-field").hidden =
    ["optimize", "diversify"].includes(task) || (task === "generate" && !joint);
  $("jump_length-field").hidden = task !== "generate" || !joint;
  $("atoms-field").hidden =
    ["inpaint", "diversify"].includes(task) ||
    $("size_mode").value === "sample";
  $("added_atoms-field").hidden = $("size_mode").value === "sample";
  $("minimum_atoms-field").hidden =
    $("size_mode").value !== "sample" ||
    ["optimize", "diversify"].includes(task);
  $("size_bias-field").hidden = $("minimum_atoms-field").hidden;
  $("relaxation").disabled = task === "inpaint";
  $("fragment_policy").disabled = task === "inpaint";
  if (task === "inpaint") {
    $("relaxation").value = 0;
    $("fragment_policy").value = "all";
  }
  for (const option of $("model").options)
    option.disabled =
      option.dataset.installed === "false" ||
      (task !== "generate" && option.value.endsWith("_joint"));
  if (task !== "generate" && joint)
    $("model").value = "crossdocked_fullatom_cond";
  if (task === "inpaint" && $("trajectory").checked) $("count").value = 1;
  const pocket = $("pocket-type").value;
  $("sdf-input").hidden = pocket !== "sdf";
  $("reference").hidden = pocket === "sdf";
  $("reference-label").hidden = pocket === "sdf";
  $("reference-label").textContent =
    pocket === "residues" ? "残基编号，用空格或逗号分隔" : "配体编号，如 A:330";
}
export function parseAtomNumbers(text) {
  if (!text.trim()) return [];
  const values = text
    .trim()
    .split(/[\s,，]+/)
    .map(Number);
  if (
    values.some((x) => !Number.isInteger(x) || x < 1) ||
    new Set(values).size !== values.length
  )
    throw new Error("原子编号必须为不重复的正整数。");
  return values.map((x) => x - 1).sort((a, b) => a - b);
}
export function readOptions() {
  const options = { task: $("task").value, model: $("model").value };
  for (const [id] of schema) options[id] = Number($(id).value);
  for (const [id] of choices) options[id] = $(id).value;
  options.preserve_bonds = options.bond_mode === "fragment";
  delete options.bond_mode;
  options.fixed_atoms =
    options.task === "inpaint" ? parseAtomNumbers($("fixed-atoms").value) : [];
  options.trajectory = options.task === "inpaint" && $("trajectory").checked;
  if (options.task === "inpaint" && !options.fixed_atoms.length)
    throw new Error("请在预览中选择保留原子，或输入原子编号。");
  if (
    options.task === "optimize" &&
    (options.population * options.rounds > 100 ||
      options.survivors > options.population)
  )
    throw new Error("优化总候选数不能超过 100，且保留数不能大于每轮候选数。");
  return options;
}
export function restoreOptions(options) {
  $("bond_mode").value =
    options.preserve_bonds === false ? "atoms" : "fragment";
  for (const [key, value] of Object.entries(options || {})) {
    if ($(key) && typeof value !== "object")
      $(key).type === "checkbox"
        ? ($(key).checked = value)
        : ($(key).value = value);
  }
  $("fixed-atoms").value = (options.fixed_atoms || [])
    .map((i) => i + 1)
    .join(",");
  syncControls();
}
export async function readFile(id, limit, title) {
  const file = $(id).files[0];
  if (!file || file.size > limit)
    throw new Error(`请选择${title}，文件不得超过 ${limit / 1000000} MB。`);
  return file.text();
}
