import { getContract, fieldActive, projectOptions } from "./contract.js";
export const $ = (id) => document.getElementById(id);
const fields = () => Object.entries(getContract().fields);
function value(field) {
  const input = $(field.id);
  if (field.type === "boolean")
    return field.choices ? input.value === "true" : input.checked;
  if (field.type === "integer") return Number(input.value);
  return input.value;
}
function formValues() {
  const values = { task: $("task").value, model: $("model").value };
  for (const [name, field] of fields())
    if (name !== "fixed_atoms") values[name] = value(field);
  return values;
}
export function mountControls() {
  const config = getContract();
  $("task").replaceChildren(
    ...Object.entries(config.tasks).map(
      ([id, task]) => new Option(task.label, id),
    ),
  );
  $("task").value = config.default_task;
  for (const [name, field] of fields()) {
    if (!field.section) continue;
    const group = document.createElement("div");
    group.id = field.id + "-field";
    const caption = document.createElement("label");
    caption.htmlFor = field.id;
    caption.textContent = field.label;
    const input = document.createElement(field.choices ? "select" : "input");
    input.id = field.id;
    if (field.choices)
      for (const choice of field.choices)
        input.add(new Option(choice.label, String(choice.value)));
    else if (field.type === "boolean") input.type = "checkbox";
    else if (field.type === "array") input.type = "text";
    else {
      input.type = "number";
      input.required = true;
      if (field.minimum !== undefined) input.min = field.minimum;
      if (field.maximum !== undefined) input.max = field.maximum;
    }
    if (input.type === "checkbox") input.checked = field.default;
    else input.value = String(field.default ?? "");
    group.append(caption, input);
    $(field.section).append(group);
  }
  $("model").replaceChildren(
    ...config.models.map(
      (model) =>
        new Option(
          model.label + (model.installed ? "" : "（未安装）"),
          model.id,
        ),
    ),
  );
  $("model").value = config.default_model;
  $("continue-task").replaceChildren(
    ...Object.entries(config.tasks)
      .filter(([id]) => id !== config.default_task)
      .map(([id, task]) => new Option(task.label, id)),
  );
  $("continue-task").value = config.continuation_task;
  for (const id of [
    "task",
    "mode",
    "pocket-type",
    "model",
    "size_mode",
    "trajectory",
  ])
    $(id).addEventListener("change", syncControls);
  syncControls();
}
export function syncControls() {
  const config = getContract(),
    task = $("task").value,
    source = $("mode").value;
  const presentation = config.tasks[task];
  $("generation-heading").textContent = presentation.settings_title;
  $("source-label").textContent = presentation.source_label || "";
  $("source-help").textContent = presentation.source_help;
  $("task-source").hidden = !presentation.source_label;
  const available = config.models.filter((m) => m.tasks.includes(task));
  for (const option of $("model").options)
    option.disabled = !available.some((m) => m.id === option.value);
  if (!available.some((m) => m.id === $("model").value))
    $("model").value =
      (available.find((m) => m.installed) || available[0])?.id || "";
  const model = config.models.find((m) => m.id === $("model").value);
  const values = { ...formValues(), strategy: model?.strategy };
  for (const rule of config.rules) {
    if (
      Object.entries(rule.when).every(([key, allowed]) =>
        allowed.includes(values[key]),
      )
    )
      for (const [key, v] of Object.entries(rule.set)) {
        values[key] = v;
        $(config.fields[key].id).value = v;
      }
  }
  for (const [name, field] of fields()) {
    const active = fieldActive(field, values),
      input = $(field.id);
    if (field.section) $(field.id + "-field").hidden = !active;
    input.disabled = !active;
  }
  $("result-source").hidden = source !== "result";
  $("initial-input").hidden = task === "generate" || source === "result";
  $("inpaint-fields").hidden = task !== "inpaint";
  $("fragment-toolbar").hidden = task !== "inpaint";
  $("optimization-fields").hidden = task !== "optimize";
  $("variation-fields").hidden = task !== "optimize" && task !== "diversify";
  $("sampling-fields").hidden = task === "optimize";
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
  const values = formValues();
  values.fixed_atoms =
    values.task === "inpaint" ? parseAtomNumbers($("fixed-atoms").value) : [];
  for (const field of Object.values(getContract().fields)) {
    const input = $(field.id);
    if (!input.disabled && !input.checkValidity())
      throw new Error(field.label + "：请检查输入范围。");
  }
  if (values.task === "inpaint" && !values.fixed_atoms.length)
    throw new Error("请在预览中选择需要保留的原子或整环。");
  return projectOptions(values);
}
export function restoreOptions(options) {
  for (const name of ["task", "model"])
    if (options[name] !== undefined) $(name).value = options[name];
  for (const [name, field] of fields()) {
    const v = options[name];
    if (v === undefined) continue;
    const input = $(field.id);
    if (name === "fixed_atoms") input.value = v.map((i) => i + 1).join(",");
    else if (input.type === "checkbox") input.checked = v;
    else input.value = String(v);
  }
  syncControls();
}
export async function readFile(id, limit, title) {
  const file = $(id).files[0];
  if (!file || file.size > limit)
    throw new Error(
      "请选择" + title + "，文件不得超过 " + limit / 1000000 + " MB。",
    );
  return file.text();
}
export function setAtomSelection(indices) {
  $("fixed-atoms").value = [...new Set(indices)]
    .sort((a, b) => a - b)
    .map((i) => i + 1)
    .join(",");
  $("fixed-atoms").dispatchEvent(new Event("change"));
}
