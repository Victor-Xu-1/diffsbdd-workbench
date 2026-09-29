import { setupFigures } from "./figure-panel.js";
import {
  setupShell,
  setView,
  setStage,
  notice,
  syncModelSelectors,
  renderModels,
  updateCount,
} from "./shell.js";
import {
  setupPocketUI,
  readPocketInputs,
  inspectPocket,
  loadExample,
} from "./pocket-ui.js";
import { exportEditor } from "./editor-bridge.js";
import {
  $,
  mountControls,
  readOptions,
  readFile,
  restoreOptions,
  syncControls,
} from "./controls.js";
import { api, link, labels, friendlyError } from "./api.js";
import { renderStatus, renderMolecules, renderDetail } from "./results-ui.js";
import {
  showMolecule,
  showInput,
  showEdited,
  setupPreview,
} from "./preview.js";
const state = {
  job: null,
  selected: -1,
  timer: null,
  fingerprint: "",
  source: null,
  busy: false,
  ready: false,
  pocketReady: false,
  loadingSource: false,
  loadRevision: 0,
};
function error(message = "") {
  $("error").hidden = !message;
  $("error").textContent = friendlyError(message);
}
function buttonState() {
  $("generate").disabled =
    state.busy || state.loadingSource || !state.ready || !state.pocketReady;
  for (const id of ["save-edit", "optimize", "use-original"])
    $(id).disabled = state.busy || state.loadingSource || state.selected < 0;
}
async function history(selectLatest = false) {
  const jobs = await api("/api/jobs");
  state.busy = jobs.some((job) => job.status === "running");
  buttonState();
  $("history").replaceChildren();
  if (!jobs.length) {
    $("history").add(new Option("暂无任务", ""));
    return;
  }
  for (const job of jobs)
    $("history").add(
      new Option(
        `${new Date(job.created_at).toLocaleString()} · ${job.task === "inpaint" ? "片段设计" : job.task === "optimize" || job.mode === "optimize" ? "性质优化" : "新分子"} · ${labels[job.status]}`,
        job.id,
      ),
    );
  if (selectLatest) await selectJob(jobs[0].id);
  else if (state.job) $("history").value = state.job.id;
}
async function render() {
  const job = state.job,
    molecules = job.report?.molecules || [];
  renderStatus(job, error);
  const fingerprint = `${job.id}:${molecules.length}:${job.status}`;
  if (fingerprint !== state.fingerprint) {
    state.fingerprint = fingerprint;
    renderMolecules(job, state.selected, selectMolecule);
  }
  $("preview-panel").hidden = !molecules.length;
  $("editing-panel").hidden = !molecules.length;
  if (molecules.length && state.selected < 0) await selectMolecule(0);
  renderEdits();
  buttonState();
}
function schedule() {
  clearTimeout(state.timer);
  if (!state.busy) return;
  state.timer = setTimeout(async () => {
    try {
      await history();
      if (state.job) {
        state.job = await api(`/api/jobs/${state.job.id}`);
        await render();
      }
      schedule();
    } catch (e) {
      error(e.message);
    }
  }, 2000);
}
async function selectJob(id) {
  if (!id) return;
  setView("results");
  setStage(4);
  clearTimeout(state.timer);
  error();
  state.selected = -1;
  state.fingerprint = "";
  state.source = null;
  state.job = await api(`/api/jobs/${id}`);
  if (![...$("history").options].some((option) => option.value === id))
    $("history").add(
      new Option(
        `${new Date(state.job.created_at).toLocaleString()} · ${labels[state.job.status]}`,
        id,
      ),
    );
  $("history").value = id;
  await render();
  schedule();
}
async function selectMolecule(index) {
  const token = ++state.loadRevision;
  state.loadingSource = true;
  buttonState();
  try {
    state.selected = index;
    state.source = { parent_job: state.job.id, molecule_index: index };
    $("selected-label").textContent = `分子 ${index + 1}`;
    $("editing-panel").hidden = false;
    $("feedback").value = "";
    $("rating").value = "0";
    $("edit-message").textContent = "";
    renderMolecules(state.job, index, selectMolecule);
    renderDetail(state.job, index);
    await showMolecule(state.job, index);
    updateSource();
  } catch (e) {
    error(e.message);
  } finally {
    if (token === state.loadRevision) {
      state.loadingSource = false;
      buttonState();
    }
  }
}
function updateSource() {
  const source = state.source;
  $("result-source").textContent = source
    ? `起点：任务 ${source.parent_job.slice(0, 8)} · ${source.edit_id ? "已保存的编辑版" : `分子 ${source.molecule_index + 1}`}`
    : "请在右侧选择一个分子。";
}
function renderEdits() {
  $("edit-history").replaceChildren();
  for (const edit of [...(state.job?.edits || [])].reverse()) {
    const row = document.createElement("div");
    row.className = "edit-row";
    const text = document.createElement("span");
    text.textContent = `分子 ${edit.parent_index + 1} · 评价 ${edit.rating || "未评分"} · ${edit.notes || "无备注"} · 共同骨架偏移 ${edit.alignment_rmsd} Å`;
    const use = document.createElement("button");
    use.textContent = "预览并作为下一轮起点";
    use.addEventListener("click", async () => {
      try {
        state.selected = edit.parent_index;
        state.source = {
          parent_job: state.job.id,
          molecule_index: edit.parent_index,
          edit_id: edit.id,
        };
        await showEdited(state.job, edit);
        $("mode").value = "result";
        updateSource();
        syncControls();
      } catch (e) {
        error(e.message);
      }
    });
    row.append(
      text,
      link("编辑版 SDF", `/api/jobs/${state.job.id}/edits/${edit.id}.sdf`),
      use,
    );
    $("edit-history").append(row);
  }
}
async function payload() {
  const result = { ...(await readPocketInputs()), options: readOptions() };
  if (result.options.task !== "generate" && result.mode !== "result")
    result.initial_sdf = await readFile("initial-sdf", 1000000, "三维起始 SDF");
  return result;
}
$("generate-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  error();
  $("generate").disabled = true;
  try {
    const request = await payload();
    const job = await api("/api/jobs", {
      method: "POST",
      body: JSON.stringify(request),
    });
    state.busy = true;
    await history();
    await selectJob(job.id);
  } catch (e) {
    error(e.message);
    buttonState();
  }
});
$("cancel").addEventListener("click", async () => {
  $("cancel").disabled = true;
  try {
    state.job = await api(`/api/jobs/${state.job.id}/cancel`, {
      method: "POST",
      body: "{}",
    });
    await history();
    await render();
    schedule();
  } catch (e) {
    error(e.message);
  } finally {
    $("cancel").disabled = false;
  }
});
async function saveEdit(next) {
  if (!state.job || state.selected < 0) return;
  error();
  $("save-edit").disabled = true;
  $("optimize").disabled = true;
  $("edit-message").textContent = "正在校验结构并对齐三维起始构象…";
  try {
    const saved = await api(`/api/jobs/${state.job.id}/edits`, {
      method: "POST",
      body: JSON.stringify({
        index: state.selected,
        molblock: await exportEditor(),
        notes: $("feedback").value,
        rating: Number($("rating").value),
      }),
    });
    $("edit-message").textContent =
      `已保存 · 类药性 ${saved.qed} · 共同骨架偏移 ${saved.alignment_rmsd} Å。此构象是下一轮计算起点。`;
    state.source = {
      parent_job: state.job.id,
      molecule_index: state.selected,
      edit_id: saved.id,
    };
    state.job = await api(`/api/jobs/${state.job.id}`);
    renderEdits();
    if (next) {
      await showEdited(state.job, saved);
      $("mode").value = "result";
      $("task").value = "optimize";
      updateSource();
      syncControls();
      $("task").dispatchEvent(new Event("change"));
      setView("design");
      await inspectPocket();
      $("generate-form").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  } catch (e) {
    error(e.message);
    $("edit-message").textContent = "未保存，请按提示修改结构后重试。";
  } finally {
    buttonState();
  }
}
$("save-edit").addEventListener("click", () => saveEdit(false));
$("optimize").addEventListener("click", () => saveEdit(true));
$("use-original").addEventListener("click", async () => {
  await selectMolecule(state.selected);
  $("mode").value = "result";
  syncControls();
  setView("design");
  await inspectPocket();
});
$("history").addEventListener("change", () =>
  selectJob($("history").value).catch((e) => error(e.message)),
);
$("reuse").addEventListener("click", async () => {
  if (!state.job) return;
  restoreOptions(state.job.report?.settings || state.job.settings || {});
  $("mode").value = "result";
  updateSource();
  syncControls();
  $("task").dispatchEvent(new Event("change"));
  syncModelSelectors();
  setView("design");
  await inspectPocket();
  notice("已复用计算设置，请确认输入和保留原子编号，再开始设计。");
});
for (const id of ["sort", "filter"])
  $(id).addEventListener("change", () => {
    if (state.job) renderMolecules(state.job, state.selected, selectMolecule);
  });
$("inspect-pose").addEventListener("click", async () => {
  error();
  $("inspect-pose").disabled = true;
  try {
    const sdf = await readFile("initial-sdf", 1000000, "三维起始 SDF");
    const inspected = await api("/api/poses/inspect", {
      method: "POST",
      body: JSON.stringify({ sdf }),
    });
    const inputs = await readPocketInputs();
    const pdb =
      inputs.protein_text || (await (await fetch("/api/example")).text());
    setView("results");
    showInput(inspected.molblock, pdb);
    $("click-mode").value = "select";
    $("viewer-note").textContent =
      `起始结构包含 ${inspected.atoms} 个重原子、${inspected.fragments} 个片段。请点击要保留的原子，或输入编号。`;
  } catch (e) {
    error(e.message);
  } finally {
    $("inspect-pose").disabled = false;
  }
});
setupFigures();
mountControls();
setupPreview();
setupPocketUI({
  getSource: () => state.source,
  onError: error,
  onReady: (ready) => {
    state.pocketReady = ready;
    if (ready && !$("design-view").hidden) setStage(2);
    $("ready-label").textContent = ready
      ? "结构与口袋已就绪"
      : "请确认蛋白与口袋";
    buttonState();
  },
});
setupShell({
  loadExample,
  onError: error,
  openResults: async () => {
    await history();
    if (!state.job) {
      const jobs = await api("/api/jobs");
      const latest = jobs.find((job) => job.report?.valid > 0) || jobs[0];
      if (latest) await selectJob(latest.id);
    }
  },
  openResult: async (id, index) => {
    await selectJob(id);
    await selectMolecule(index);
  },
});

try {
  const health = await api("/api/health");
  state.ready = health.ready;
  $("health").textContent = health.ready
    ? "本机显卡已就绪 · 数据保存在本地"
    : "计算环境未就绪，请运行环境检查";
  for (const model of health.models) {
    const option = new Option(
      `${model.dataset === "moad" ? "Binding MOAD" : "CrossDocked"} · ${model.representation === "ca" ? "Cα" : "全原子"} · ${model.strategy === "cond" ? "条件生成" : "联合分布"}${model.installed ? "" : "（未安装）"}`,
      model.id,
    );
    option.dataset.installed = String(model.installed);
    $("model").add(option);
  }
  $("model").value = "crossdocked_fullatom_cond";
  syncControls();
  renderModels(health.models);
  syncModelSelectors();
  await history(false);
  await loadExample();
  buttonState();
  schedule();
} catch (e) {
  state.ready = false;
  buttonState();
  error(e.message);
}
