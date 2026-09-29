import {
  $,
  api,
  run,
  exportSelection,
  saveDownload,
  table,
} from "./workspace-utils.js";
import { labels } from "./api.js";
let callbacks,
  items = [],
  page = 0,
  comparison = [];
const selection = new Map(),
  pageSize = 20;
const key = (item) => `${item.job_id}:${item.index}`;
function picked() {
  $("library-selection").textContent = `已选 ${selection.size} 个分子`;
  $("library-sdf").disabled = !selection.size;
  $("library-csv").disabled = !selection.size;
}
function visible() {
  const query = $("library-search").value.trim().toLowerCase();
  return items.filter(
    (item) =>
      (!query ||
        `${item.job_id} ${item.smiles}`.toLowerCase().includes(query)) &&
      ($("library-filter").value !== "connected" || item.fragments === 1),
  );
}
function render() {
  const filtered = visible();
  page = Math.min(page, Math.max(0, Math.ceil(filtered.length / pageSize) - 1));
  const subset = filtered.slice(page * pageSize, (page + 1) * pageSize);
  $("library-content").replaceChildren();
  for (const item of subset) {
    const card = document.createElement("div");
    card.className = "library-card";
    const label = document.createElement("label"),
      check = document.createElement("input");
    check.type = "checkbox";
    check.checked = selection.has(key(item));
    check.addEventListener("change", () => {
      if (check.checked && selection.size >= 100) {
        check.checked = false;
        callbacks.onError("每次最多导出 100 个分子。");
        return;
      }
      check.checked
        ? selection.set(key(item), { job_id: item.job_id, index: item.index })
        : selection.delete(key(item));
      picked();
    });
    label.append(check, `分子 ${item.index + 1}`);
    const open = document.createElement("button");
    open.className = "molecule";
    const image = document.createElement("img");
    image.src = `/api/jobs/${item.job_id}/molecules/${item.index}.svg`;
    image.alt = `候选 ${item.index + 1}`;
    const p = document.createElement("p");
    p.textContent = `QED ${item.qed ?? "—"} · SA ${item.sa ?? "—"} · ${item.job_id.slice(0, 8)}`;
    open.append(image, p);
    open.addEventListener(
      "click",
      run(
        () => callbacks.openResult(item.job_id, item.index),
        callbacks.onError,
      ),
    );
    card.append(label, open);
    $("library-content").append(card);
  }
  if (!filtered.length)
    $("library-content").textContent =
      "没有符合条件的候选。完成计算后，真实结构会出现在这里。";
  $("library-description").textContent =
    `最近 100 个任务 · 共 ${filtered.length} 个符合条件的候选 · 第 ${page + 1}/${Math.max(1, Math.ceil(filtered.length / pageSize))} 页`;
  $("library-pages").replaceChildren();
  for (const [title, delta, disabled] of [
    ["上一页", -1, page === 0],
    ["下一页", 1, (page + 1) * pageSize >= filtered.length],
  ]) {
    const button = document.createElement("button");
    button.textContent = title;
    button.disabled = disabled;
    button.addEventListener("click", () => {
      page += delta;
      render();
    });
    $("library-pages").append(button);
  }
  picked();
}
export async function refreshLibrary() {
  const jobs = await api("/api/jobs?limit=100");
  items = jobs.flatMap((job) =>
    (job.report?.molecules || []).map((m, index) => ({
      ...m,
      index,
      job_id: job.id,
    })),
  );
  render();
}
export async function refreshComparison() {
  const jobs = await api("/api/jobs?limit=100");
  $("compare-jobs").replaceChildren();
  for (const job of jobs) {
    const label = document.createElement("label"),
      input = document.createElement("input");
    input.type = "checkbox";
    input.value = job.id;
    label.append(
      input,
      `${new Date(job.created_at).toLocaleString()} · ${labels[job.status]} · 有效分子 ${job.report?.valid || 0} · ${job.id.slice(0, 8)}`,
    );
    $("compare-jobs").append(label);
  }
  if (!jobs.length)
    $("compare-jobs").textContent = "暂无任务。完成一次真实计算后再比较。";
}
const fields = [
  "id",
  "status",
  "attempted",
  "valid",
  "valid_fraction",
  "unique",
  "mean_qed",
  "mean_sa",
  "elapsed_seconds",
];
const headings = [
  "任务",
  "状态",
  "已尝试",
  "有效分子",
  "有效比例",
  "不重复结构",
  "平均 QED",
  "平均 SA",
  "计算时间（秒）",
];
function values(row) {
  return fields.map((field) =>
    field === "status"
      ? labels[row[field]]
      : typeof row[field] === "number"
        ? Number(row[field].toFixed(3))
        : row[field],
  );
}
export function setupCollections(handlers) {
  callbacks = handlers;
  for (const id of ["library-search", "library-filter"])
    $(id).addEventListener("input", () => {
      page = 0;
      render();
    });
  $("library-refresh").addEventListener(
    "click",
    run(refreshLibrary, callbacks.onError),
  );
  $("library-select-page").addEventListener("click", () => {
    for (const item of visible().slice(
      page * pageSize,
      (page + 1) * pageSize,
    )) {
      if (selection.size >= 100) break;
      selection.set(key(item), { job_id: item.job_id, index: item.index });
    }
    render();
  });
  $("library-clear").addEventListener("click", () => {
    selection.clear();
    render();
  });
  for (const format of ["sdf", "csv"])
    $(`library-${format}`).addEventListener(
      "click",
      run(
        () => exportSelection([...selection.values()], format),
        callbacks.onError,
      ),
    );
  $("compare-run").addEventListener(
    "click",
    run(async () => {
      const jobs = [...$("compare-jobs").querySelectorAll("input:checked")].map(
        (input) => input.value,
      );
      if (!jobs.length || jobs.length > 20)
        throw new Error("请选择 1–20 个任务。");
      comparison = await api("/api/jobs/compare", {
        method: "POST",
        body: JSON.stringify({ jobs }),
      });
      $("compare-output").replaceChildren(
        table(headings, comparison.map(values)),
      );
      $("compare-download").disabled = false;
    }, callbacks.onError),
  );
  $("compare-download").addEventListener("click", () => {
    const csv = [headings, ...comparison.map(values)]
      .map((row) =>
        row
          .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\n");
    saveDownload("\ufeff" + csv, "task-comparison.csv", "text/csv");
  });
}
