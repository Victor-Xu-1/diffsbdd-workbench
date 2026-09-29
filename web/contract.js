/** Pure capability projection: no model IDs, parameter ranges or preset values. */
let contract;
export function configureContract(value) {
  if (
    value?.schema !== 1 ||
    !value.fields ||
    !value.tasks ||
    !Array.isArray(value.models)
  )
    throw new Error("界面配置读取失败，请重启工作台后刷新。");
  contract = value;
}
export function getContract() {
  if (!contract) throw new Error("工作台配置尚未就绪。");
  return contract;
}
export function matches(conditions, values) {
  return Object.entries(conditions).every(([key, allowed]) =>
    allowed.includes(values[key]),
  );
}
export function fieldActive(field, values) {
  return field.when.some((condition) => matches(condition, values));
}
export function projectOptions(values) {
  const config = getContract();
  const model = config.models.find((model) => model.id === values.model);
  if (!model || !model.tasks.includes(values.task))
    throw new Error("请选择支持当前任务的模型。");
  const context = { ...values, strategy: model.strategy };
  for (const rule of config.rules)
    if (matches(rule.when, context)) Object.assign(context, rule.set);
  const output = { task: values.task, model: values.model };
  for (const [key, field] of Object.entries(config.fields))
    if (fieldActive(field, context)) output[key] = context[key];
  return { ...output, ...config.tasks[values.task].forced };
}
export function presetOptions(task, level) {
  const preset = getContract().tasks[task]?.presets.find(
    (preset) => preset.id === level,
  );
  if (!preset) throw new Error("此任务不支持所选预设。");
  return { ...preset.options };
}
