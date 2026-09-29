import { configureContract, getContract } from "./contract.js";
import { setupExperience } from "./experience.js";
import { setupHelp } from "./help.js";
import { setupDesigns, refreshDesigns } from "./designs-ui.js";
import { setupPreparation } from "./preparation-ui.js";
import { setupCollections } from "./collections-ui.js";
import { setupFigures } from "./figure-panel.js";
import { setupShell, setView, notice, applyPreset } from "./shell.js";
import {
  setupPocketUI,
  readPocketInputs,
  inspectPocket,
  loadExample,
  readInitialPose,
  restorePocketInputs,
  loadProtein,
  currentProtein,
  hasInitialPose,
  clearInputs,
} from "./pocket-ui.js";
import { exportEditor } from "./editor-bridge.js";
import {
  $,
  mountControls,
  readOptions,
  restoreOptions,
  syncControls,
} from "./controls.js";
import { api, link, labels, friendlyError } from "./api.js";
import {
  renderStatus,
  renderMolecules,
  renderDetail,
  renderEditedDetail,
} from "./results-ui.js";
import { showMolecule, showEdited, setupPreview } from "./preview.js";
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
  jobRevision: 0,
  pendingJob: null,
  saving: false,
};
function error(message = "") {
  $("error").hidden = !message;
  $("error").textContent = friendlyError(message);
}
function buttonState() {
  $("history").disabled = state.saving;
  const needsSource = $("task").value !== "generate";
  const sourceReady = !needsSource || hasInitialPose();
  const fragmentReady =
    $("task").value !== "inpaint" ||
    (Boolean($("fixed-atoms").value.trim()) &&
      $("fixed-atoms").checkValidity());
  $("action-bar").classList.toggle(
    "is-ready",
    state.pocketReady && sourceReady && fragmentReady,
  );
  $("ready-label").textContent = !state.pocketReady
    ? "请先确认口袋"
    : !sourceReady
      ? "请载入起始分子"
      : !fragmentReady
        ? "请在预览中选择保留片段"
        : "结构与口袋已就绪";
  $("generate").disabled =
    state.busy ||
    state.loadingSource ||
    !state.ready ||
    !getContract().models.find((model) => model.id === $("model").value)
      ?.installed ||
    !state.pocketReady ||
    !sourceReady ||
    !fragmentReady;
  $("save-draft").disabled =
    state.loadingSource || !state.pocketReady || !sourceReady || !fragmentReady;
  for (const id of ["save-edit", "optimize", "use-original"])
    $(id).disabled =
      state.busy || state.loadingSource || state.saving || state.selected < 0;
  for (const button of document.querySelectorAll(".edit-row button"))
    button.disabled = state.loadingSource || state.saving;
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
  else if (state.pendingJob || state.job) {
    const id = state.pendingJob || state.job.id;
    if (![...$("history").options].some((option) => option.value === id))
      $("history").add(new Option(`已选任务 ${id.slice(0, 8)}`, id));
    $("history").value = id;
  }
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
    const revision = state.jobRevision;
    try {
      await history();
      if (revision !== state.jobRevision) return;
      if (state.job) {
        const updated = await api(`/api/jobs/${state.job.id}`);
        if (revision !== state.jobRevision) return;
        state.job = updated;
        await render();
      }
      schedule();
    } catch (e) {
      error(e.message);
    }
  }, 2000);
}
async function selectJob(id, navigate = true) {
  if (!id || state.saving) return;
  const token = ++state.jobRevision;
  state.pendingJob = id;
  ++state.loadRevision;
  state.loadingSource = true;
  buttonState();
  if (navigate && !["results", "editor"].includes(document.body.dataset.view))
    setView("results");
  clearTimeout(state.timer);
  error();
  state.selected = -1;
  state.fingerprint = "";
  state.source = null;
  let job;
  try {
    job = await api(`/api/jobs/${id}`);
  } catch (error) {
    if (token !== state.jobRevision) return;
    state.pendingJob = null;
    state.loadingSource = false;
    buttonState();
    throw error;
  }
  if (token !== state.jobRevision) return;
  state.job = job;
  state.pendingJob = null;
  state.loadingSource = false;
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
  if (state.saving) return;
  const job = state.job;
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
    await showMolecule(job, index);
    if (token !== state.loadRevision || state.job.id !== job.id) return;
    updateSource();
  } catch (e) {
    if (token === state.loadRevision) {
      state.selected = -1;
      state.source = null;
      error(e.message);
    }
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
    use.disabled = state.loadingSource || state.saving;
    use.addEventListener("click", () => selectEdit(edit));
    row.append(
      text,
      link("编辑版 SDF", `/api/jobs/${state.job.id}/edits/${edit.id}.sdf`),
      use,
    );
    $("edit-history").append(row);
  }
}
async function selectEdit(edit) {
  if (state.saving || state.loadingSource) return;
  const job = state.job,
    token = ++state.loadRevision;
  state.loadingSource = true;
  buttonState();
  error();
  try {
    if (
      !(await showEdited(job, edit)) ||
      token !== state.loadRevision ||
      state.job.id !== job.id
    )
      return;
    state.selected = edit.parent_index;
    state.source = {
      parent_job: job.id,
      molecule_index: edit.parent_index,
      edit_id: edit.id,
    };
    $("selected-label").textContent =
      `编辑版 · 来源分子 ${edit.parent_index + 1}`;
    $("edit-message").textContent =
      "已载入保存的编辑版，可以继续编辑或用于下一轮设计。";
    $("feedback").value = edit.notes || "";
    $("rating").value = String(edit.rating || 0);
    renderEditedDetail(job, edit);
    $("mode").value = "result";
    updateSource();
    syncControls();
  } catch (e) {
    if (token === state.loadRevision) error(e.message);
  } finally {
    if (token === state.loadRevision) {
      state.loadingSource = false;
      buttonState();
    }
  }
}
async function payload() {
  const result = { ...(await readPocketInputs()), options: readOptions() };
  if (result.options.task !== "generate" && result.mode !== "result")
    result.initial_sdf = await readInitialPose();
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
  if (!state.job || state.selected < 0 || state.saving) return;
  state.saving = true;
  buttonState();
  const notes = $("feedback").value,
    rating = Number($("rating").value);
  error();
  $("save-edit").disabled = true;
  $("optimize").disabled = true;
  $("edit-message").textContent = "正在校验结构并对齐三维起始构象…";
  let saved = null;
  try {
    saved = await api(`/api/jobs/${state.job.id}/edits`, {
      method: "POST",
      body: JSON.stringify({
        index: state.selected,
        molblock: await exportEditor(),
        notes,
        rating,
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
    await showEdited(state.job, saved);
    renderEditedDetail(state.job, saved);
    if (next) {
      $("mode").value = "result";
      $("task").value = $("continue-task").value;
      updateSource();
      syncControls();
      $("task").dispatchEvent(new Event("change"));
      applyPreset();
      setView("design");
      await inspectPocket();
      $("generate-form").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  } catch (e) {
    error(e.message);
    $("edit-message").textContent = saved
      ? "编辑版已保存，但后续预览未完成。请在编辑记录中重新打开。"
      : "未保存，请按提示修改结构后重试。";
  } finally {
    state.saving = false;
    buttonState();
  }
}
$("save-edit").addEventListener("click", () => saveEdit(false));
$("optimize").addEventListener("click", () => saveEdit(true));
$("use-original").addEventListener("click", async () => {
  await selectMolecule(state.selected);
  $("mode").value = "result";
  $("task").value = $("continue-task").value;
  $("task").dispatchEvent(new Event("change"));
  applyPreset();
  syncControls();
  setView("design");
  await inspectPocket();
});
$("history").addEventListener("change", () =>
  selectJob($("history").value).catch((e) => error(e.message)),
);
for (const id of ["sort", "filter"])
  $(id).addEventListener("change", () => {
    if (state.job) renderMolecules(state.job, state.selected, selectMolecule);
  });
try {
  const capabilities = await api("/api/capabilities");
  configureContract(capabilities);
  setupFigures();
  mountControls();
  setupExperience();
  setupPreview();
  setupPocketUI({
    getSource: () => state.source,
    onError: error,
    onReady: (ready) => {
      state.pocketReady = ready;
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
      const requested = state.jobRevision;
      await history();
      if (!state.job && requested === state.jobRevision) {
        const jobs = await api("/api/jobs");
        const latest = jobs.find((job) => job.report?.valid > 0) || jobs[0];
        if (latest && requested === state.jobRevision)
          await selectJob(latest.id, false);
      }
    },
  });

  $("fixed-atoms").addEventListener("change", buttonState);
  $("model").addEventListener("change", buttonState);
  setupHelp();
  setupDesigns({
    payload,
    onError: error,
    notice,
    restore: async (request) => {
      state.source = null;
      restoreOptions(request.options);
      setView("design");
      if (!(await restorePocketInputs(request)))
        throw new Error("未能恢复设计口袋，请检查服务后重新打开该设计。");
      restoreOptions(request.options);
      $("fixed-atoms").dispatchEvent(new Event("change"));
      $("task").dispatchEvent(new Event("change"));
    },
    newDesign: async () => {
      state.source = null;
      const config = getContract();
      restoreOptions({
        ...Object.fromEntries(
          Object.entries(config.fields).map(([name, field]) => [
            name,
            field.default ?? [],
          ]),
        ),
        task: config.default_task,
        model: config.default_model,
      });
      $("task").dispatchEvent(new Event("change"));
      applyPreset();
      setView("design");
      clearInputs();
    },
  });
  setupPreparation({
    onError: error,
    readInputs: async () => ({ protein_text: await currentProtein() }),
    useProtein: async (text, name) => {
      state.source = null;
      setView("design");
      await loadProtein(text, name);
    },
  });
  setupCollections({
    onError: error,
    openResult: async (id, index) => {
      await selectJob(id);
      await selectMolecule(index);
    },
  });

  const health = await api("/api/health");
  state.ready = health.ready;
  $("health").textContent = health.ready
    ? "本机显卡已就绪 · 数据保存在本地"
    : "计算环境未就绪，请运行环境检查";
  await history(false);
  await refreshDesigns();
  clearInputs();
  buttonState();
  schedule();
} catch (e) {
  state.ready = false;
  $("generate").disabled = true;
  $("save-draft").disabled = true;
  $("health").textContent = "工作台初始化失败，请刷新重试。";
  error(e.message);
}
