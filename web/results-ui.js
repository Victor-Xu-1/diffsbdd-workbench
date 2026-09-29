import { $ } from "./controls.js";
import { getContract, fieldActive } from "./contract.js";
import { friendlyError, link, labels } from "./api.js";

export function orderedMolecules(molecules, sort = "original", filter = "all") {
  let list = molecules.map((mol, index) => ({ mol, index }));
  if (filter === "connected")
    list = list.filter(({ mol }) => (mol.fragments ?? 1) === 1);
  if (filter === "no-clashes")
    list = list.filter(
      ({ mol }) => mol.pocket_atom_pairs_under_1_2_angstrom === 0,
    );
  const key = {
    qed: "qed",
    sa: "sa",
    clashes: "pocket_atom_pairs_under_1_2_angstrom",
  }[sort];
  if (key)
    list.sort(
      (a, b) =>
        ((a.mol[key] ?? Infinity) - (b.mol[key] ?? Infinity)) *
        (sort === "qed" ? -1 : 1),
    );
  return list;
}
export function renderMolecules(job, selected, onSelect) {
  $("molecules").replaceChildren();
  const list = orderedMolecules(
    job.report?.molecules || [],
    $("sort").value,
    $("filter").value,
  );
  if (!list.length) {
    const empty = document.createElement("p");
    empty.textContent = "当前条件下没有候选。可以更改筛选条件。";
    $("molecules").append(empty);
  }
  for (const { mol, index } of list) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `molecule${index === selected ? " selected" : ""}`;
    card.dataset.index = index;
    card.setAttribute("aria-label", `预览并编辑分子 ${index + 1}`);
    card.setAttribute("aria-pressed", index === selected);
    const image = document.createElement("img");
    image.src = `/api/jobs/${job.id}/molecules/${index}.svg`;
    image.alt = `分子 ${index + 1} 的二维结构`;
    const title = document.createElement("strong");
    title.textContent = `分子 ${index + 1}`;
    const facts = document.createElement("p");
    facts.textContent = `类药性 ${mol.qed} · 分子量 ${mol.molecular_weight}`;
    const collision = document.createElement("p");
    collision.textContent = `近距离接触 ${mol.pocket_atom_pairs_under_1_2_angstrom} 对 · ${mol.fragments ?? 1} 个片段`;
    card.append(image, title, facts, collision);
    card.addEventListener("click", () => onSelect(index));
    $("molecules").append(card);
  }
}
export function renderDetail(job, index) {
  const mol = job.report?.molecules?.[index];
  $("molecule-detail").replaceChildren();
  if (!mol) return;
  const table = document.createElement("dl");
  table.className = "properties";
  for (const [title, value] of [
    ["类药性 QED", mol.qed],
    ["合成难度 SA", mol.sa],
    ["分子量", mol.molecular_weight],
    ["脂溶性 logP", mol.logp],
    ["极性表面积 Å²", mol.tpsa],
    ["氢键供体 / 受体", `${mol.hbd ?? "—"} / ${mol.hba ?? "—"}`],
    ["可旋转键", mol.rotatable_bonds],
    ["重原子数", mol.heavy_atoms],
    ["最近蛋白距离 Å", mol.minimum_pocket_distance_angstrom],
  ]) {
    const pair = document.createElement("div"),
      term = document.createElement("dt"),
      definition = document.createElement("dd");
    term.textContent = title;
    definition.textContent = value ?? "历史记录未计算";
    pair.append(term, definition);
    table.append(pair);
  }
  const smiles = document.createElement("p");
  smiles.className = "smiles";
  smiles.textContent = `SMILES：${mol.smiles}`;
  const pose = link(
    "下载所选分子 MOL",
    `/api/jobs/${job.id}/molecules/${index}.mol`,
  );
  pose.download = `molecule_${index + 1}.mol`;
  $("molecule-detail").append(table, smiles, pose);
}
export function renderStatus(job, error) {
  const report = job.report || {},
    running = job.status === "running",
    total = report.requested_attempts || job.count;
  $("state").textContent = labels[job.status] || job.status;
  $("summary").textContent =
    `${report.valid || 0} 个化学有效结构 / ${total} 次探索`;
  let detail = `已完成 ${report.attempted || 0} 次${report.elapsed_seconds ? ` · 耗时 ${report.elapsed_seconds.toFixed(1)} 秒` : ""}`;
  if (report.optimization) {
    const opt = report.optimization;
    detail += ` · ${opt.objective === "qed" ? "类药性 QED" : "合成难度 SA"}：${opt.initial_score.toFixed(3)} → ${opt.best_score.toFixed(3)}（含起始分子的最佳值）`;
  }
  $("progress-text").textContent = detail;
  $("cancel").hidden = !running;
  $("progress").hidden = !running;
  $("progress").value = ((report.attempted || 0) / total) * 100;
  $("downloads").replaceChildren();
  $("downloads").hidden = false;
  if (report.valid > 0) {
    for (const [text, name] of [
      ["三维结构 SDF", "molecules.sdf"],
      ["分子性质 CSV", "molecules.csv"],
      ["蛋白口袋 PDB", "pocket.pdb"],
    ])
      $("downloads").append(link(text, `/api/jobs/${job.id}/files/${name}`));
  }
  if (report.optimization && job.status === "completed")
    $("downloads").append(
      link("最佳候选 SDF", `/api/jobs/${job.id}/files/best.sdf`),
    );
  $("run-details").hidden = false;
  $("run-settings").replaceChildren();
  const settings = report.settings || job.settings || {};
  if (report.bond_reconstruction) {
    const line = document.createElement("p");
    line.textContent = report.bond_reconstruction;
    $("run-settings").append(line);
  }
  const contract = getContract(),
    model = contract.models.find((model) => model.id === settings.model);
  const context = {
    ...settings,
    task: settings.task || job.task,
    strategy: model?.strategy,
  };
  const entries = [
    ["model", { label: "模型" }],
    ...Object.entries(contract.fields).filter(([, field]) =>
      fieldActive(field, context),
    ),
  ];
  for (const [key, field] of entries)
    if (settings[key] !== undefined) {
      const line = document.createElement("span");
      line.className = "setting";
      const raw = settings[key];
      const value =
        key === "model"
          ? model?.label || raw
          : (field.choices?.find((choice) => choice.value === raw)?.label ??
            (Array.isArray(raw)
              ? raw.map((index) => index + 1).join(", ")
              : typeof raw === "boolean"
                ? raw
                  ? "开启"
                  : "关闭"
                : raw));
      line.textContent = `${field.label}：${value}`;
      $("run-settings").append(line);
    }
  $("rejections").replaceChildren();
  for (const rejected of report.rejected || []) {
    const li = document.createElement("li");
    li.textContent = `第 ${rejected.attempt} 次：${friendlyError(rejected.reason)}`;
    $("rejections").append(li);
  }
  $("diagnostics").replaceChildren();
  if (report.attempted)
    $("diagnostics").append(
      link(
        "原始结构（含未通过检查的候选）",
        `/api/jobs/${job.id}/files/raw_molecules.sdf`,
      ),
    );
  if (job.settings)
    $("diagnostics").append(
      link("可复用的实验设置", `/api/jobs/${job.id}/files/settings.json`),
    );
  if (report.status)
    $("diagnostics").append(
      link("完整计算记录", `/api/jobs/${job.id}/files/report.json`),
    );
  const support = document.createElement("details"),
    caption = document.createElement("summary");
  caption.textContent = "开发维护用诊断";
  support.append(
    caption,
    link("技术日志", `/api/jobs/${job.id}/files/process.log`),
  );
  $("diagnostics").append(support);
  if (["failed", "interrupted"].includes(job.status))
    error(
      friendlyError(
        report.error || job.error || "任务未完成，请检查输入；诊断记录已保存。",
      ),
    );
  if (job.status === "no_valid_molecules")
    error(
      "本轮未得到符合要求的结构。可更换复现实验编号，调整分子大小或保留片段后重试。",
    );
}
