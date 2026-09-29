import { presetOptions } from "./presets.js";
import { refreshLibrary, refreshComparison } from "./collections-ui.js";
import { refreshDesigns } from "./designs-ui.js";
/** Navigation and view composition; molecular data and model calls live elsewhere. */
import { $, syncControls, restoreOptions } from "./controls.js";
import { api } from "./api.js";
let callbacks;
const safely =
  (action) =>
  (...args) =>
    Promise.resolve()
      .then(() => action(...args))
      .catch((error) => callbacks.onError(error.message));

export function notice(message) {
  $("notice").hidden = !message;
  $("notice").textContent = message || "";
}
export function setView(view) {
  document.body.classList.remove("navigation-open");
  $("mobile-menu")?.setAttribute("aria-expanded", "false");
  document
    .querySelectorAll(".app-view")
    .forEach((element) => (element.hidden = element.id !== `${view}-view`));
  $("action-bar").hidden = view !== "design";
  document
    .querySelectorAll(".nav-item[data-view]")
    .forEach((button) =>
      button.classList.toggle("active", button.dataset.view === view),
    );
  document
    .querySelectorAll(".nav-item[data-task]")
    .forEach((button) =>
      button.classList.toggle(
        "active",
        view === "design" && button.dataset.task === $("task").value,
      ),
    );
  window.dispatchEvent(new Event("resize"));
}
export function setStage(number) {
  document.querySelectorAll("[data-step]").forEach((button) => {
    const step = Number(button.dataset.step);
    button.classList.toggle("active", step === number);
    button.classList.toggle("complete", step < number);
  });
}
function info(title, paragraphs) {
  $("info-title").textContent = title;
  $("info-body").replaceChildren();
  for (const text of paragraphs) {
    const p = document.createElement("p");
    p.textContent = text;
    $("info-body").append(p);
  }
  $("info-dialog").showModal();
}
function taskHeading() {
  const presetLabels = {
    quick: "快速试跑",
    standard: "常规设计",
    explore: "更多探索",
  };
  for (const button of document.querySelectorAll("[data-preset]")) {
    const options = presetOptions($("task").value, button.dataset.preset);
    const attempts = options.population
      ? options.population * options.rounds
      : options.count;
    button.textContent = `${presetLabels[button.dataset.preset]} · ${attempts} 个`;
    button.title =
      $("task").value === "optimize"
        ? `每轮 ${options.population} 个，进行 ${options.rounds} 轮，保留 ${options.survivors} 个继续探索。`
        : `尝试 ${attempts} 个候选。${$("task").value === "diversify" ? `改动幅度 ${options.change_steps}。` : `采样 ${options.steps} 步。`}有效结构数量取决于化学检查。`;
  }

  const task = $("task").value;
  $("page-title").textContent = {
    generate: "新建设计任务",
    inpaint: "局部结构设计",
    diversify: "探索相似分子",
    optimize: "性质优化任务",
  }[task];
  $("page-subtitle").textContent = {
    generate: "选定蛋白口袋，即可开始生成候选分子。",
    inpaint: "保留关键片段，在口袋中探索其余结构。",
    diversify: "从一个三维起点生成结构变体，不按性质筛选。",
    optimize: "逐轮探索与筛选，记录每一轮性质变化。",
  }[task];
  $("generation-heading").textContent =
    task === "optimize"
      ? "优化设置"
      : task === "inpaint"
        ? "局部设计设置"
        : "生成设置";
  $("task-help").hidden = task === "generate";
  updateCount();
}
export function updateCount() {
  const total =
    $("task").value === "optimize"
      ? Number($("population").value) * Number($("rounds").value)
      : Number($("count").value);
  $("target-label").textContent = `目标探索 ${total} 个候选`;
  $("generate-label").textContent =
    $("task").value === "optimize"
      ? `开始优化 ${total} 个候选`
      : `开始生成 ${total} 个分子`;
}
export function syncModelSelectors() {
  const [dataset, representation, strategy] = $("model").value.split("_");
  if (dataset) {
    $("model-dataset").value = dataset;
    $("model-representation").value = representation;
    $("model-strategy").value = strategy;
  }
  if ($("model-family"))
    $("model-family").textContent =
      dataset === "moad" ? "Binding MOAD" : "CrossDocked";
}
export function renderModels(models) {
  const table = document.createElement("table");
  table.className = "model-table";
  const head = document.createElement("tr");
  ["训练数据", "口袋表示", "方法", "状态", "选择"].forEach((text) => {
    const th = document.createElement("th");
    th.textContent = text;
    head.append(th);
  });
  table.append(head);
  for (const model of models) {
    const row = document.createElement("tr");
    for (const value of [
      model.dataset === "moad" ? "Binding MOAD" : "CrossDocked",
      model.representation === "ca" ? "Cα" : "全原子",
      model.strategy === "cond" ? "条件生成" : "联合分布",
      model.installed ? "已安装" : "未安装",
    ]) {
      const td = document.createElement("td");
      td.textContent = value;
      row.append(td);
    }
    const td = document.createElement("td"),
      button = document.createElement("button");
    button.textContent = "使用此模型";
    button.disabled = !model.installed;
    button.addEventListener("click", () => {
      if ($("task").value !== "generate" && model.strategy === "joint") {
        notice("当前设计任务需要条件模型，请选择条件生成权重。");
        return;
      }
      $("model").value = model.id;
      syncControls();
      syncModelSelectors();
      setView("design");
    });
    const verify = document.createElement("button");
    verify.textContent = "检查模型完整性";
    verify.disabled = !model.installed;
    verify.dataset.verifyModel = model.id;
    verify.addEventListener(
      "click",
      safely(async () => {
        verify.disabled = true;
        try {
          const result = await api(`/api/models/${model.id}/verify`, {
            method: "POST",
            body: "{}",
          });
          $("model-verification").textContent = result.valid
            ? "模型文件完整，可用于计算。"
            : "模型文件与官方版本不一致，请重新安装。";
        } finally {
          verify.disabled = !model.installed;
        }
      }),
    );
    td.append(button, verify);
    row.append(td);
    table.append(row);
  }
  $("model-content").replaceChildren(table);
  const attribution = document.createElement("p");
  attribution.className = "hint";
  attribution.textContent =
    "仅加载经过 SHA-256 校验的官方权重。模型结构和权重保持原样；来源和校验值保存在模型清单中。";
  $("model-content").append(attribution);
}
function applyPreset(level, announce = false) {
  const fixed = $("fixed-atoms").value;
  restoreOptions({
    ...presetOptions($("task").value, level),
    task: $("task").value,
  });
  $("fixed-atoms").value = fixed;
  $("fixed-atoms").dispatchEvent(new Event("change"));
  document
    .querySelectorAll("[data-preset]")
    .forEach((node) =>
      node.classList.toggle("selected", node.dataset.preset === level),
    );
  updateCount();
  if (announce)
    notice(
      level === "quick"
        ? "快速试跑：先少量验证输入，正式探索建议选择常规设计。"
        : "已应用预设，可以直接开始；专业模式可进一步调整。",
    );
}
export function setupShell(handlers) {
  callbacks = handlers;
  for (const button of document.querySelectorAll("[data-preset]"))
    button.addEventListener("click", () =>
      applyPreset(button.dataset.preset, true),
    );
  $("mobile-menu").addEventListener("click", () => {
    const expanded = document.body.classList.toggle("navigation-open");
    $("mobile-menu").setAttribute("aria-expanded", String(expanded));
  });
  document.querySelectorAll("[data-task]").forEach((button) =>
    button.addEventListener("click", () => {
      $("task").value = button.dataset.task;
      $("task").dispatchEvent(new Event("change"));
      applyPreset("standard");
      setView("design");
      if (button.dataset.task !== "generate")
        notice("请上传起始结构，或在“任务与结果”中选择分子继续设计。");
      else notice("");
    }),
  );
  $("task").addEventListener("change", () => {
    taskHeading();
    document
      .querySelectorAll("[data-preset]")
      .forEach((node) => node.classList.remove("selected"));
    syncModelSelectors();
  });
  document.querySelectorAll("[data-view]").forEach((button) =>
    button.addEventListener(
      "click",
      safely(async () => {
        const view = button.dataset.view;
        setView(view);
        if (view === "results") await callbacks.openResults();
        if (view === "library") await refreshLibrary();
        if (view === "designs") await refreshDesigns();
        if (view === "compare") await refreshComparison();
      }),
    ),
  );
  for (const id of ["help-button", "settings-help"])
    $(id).addEventListener("click", () =>
      info("设置与帮助", [
        "本机计算：结构、结果和反馈保存在本地，无需登录或云端模型 API。",
        "RDKit 负责化学解析与二维结构，3Dmol.js 负责三维口袋，Ketcher 负责图形编辑。",
        "QED 衡量类药性；SA 估计合成难度。二者不能替代结合活性、选择性或实际合成验证。",
        "图形编辑后点击保存，再确认下一轮设计参数。文字反馈用于记录，不会自动训练模型。",
      ]),
    );
  document
    .querySelectorAll(".dialog-close")
    .forEach((button) =>
      button.addEventListener("click", () => button.closest("dialog").close()),
    );
  $("guided-mode").addEventListener("click", () => {
    document.body.classList.remove("expert");
    $("advanced-settings").open = false;
    $("guided-mode").classList.add("selected");
    $("expert-mode").classList.remove("selected");
    $("breadcrumb").textContent = "01 / 引导模式";
  });
  $("expert-mode").addEventListener("click", () => {
    document.body.classList.add("expert");
    $("advanced-settings").open = true;
    $("expert-mode").classList.add("selected");
    $("guided-mode").classList.remove("selected");
    $("breadcrumb").textContent = "01 / 专业模式";
  });
  $("collapse-input").addEventListener(
    "click",
    () => ($("input-body").hidden = !$("input-body").hidden),
  );
  $("collapse-settings").addEventListener(
    "click",
    () => ($("settings-body").hidden = !$("settings-body").hidden),
  );
  $("load-example").addEventListener(
    "click",
    safely(async () => {
      setView("design");
      await callbacks.loadExample();
    }),
  );
  for (const id of ["count", "population", "rounds"])
    $(id).addEventListener("input", updateCount);
  for (const id of ["model-dataset", "model-strategy", "model-representation"])
    $(id).addEventListener("change", () => {
      $("model").value =
        `${$("model-dataset").value}_${$("model-representation").value}_${$("model-strategy").value}`;
      syncControls();
      syncModelSelectors();
    });
  $("inspect-models").addEventListener("click", () => setView("models"));
  $("choose-result-source").addEventListener(
    "click",
    safely(async () => {
      setView("results");
      await callbacks.openResults();
    }),
  );
  document.querySelectorAll("[data-step]").forEach((button) =>
    button.addEventListener(
      "click",
      safely(async () => {
        const step = Number(button.dataset.step);
        if (step === 4) {
          setView("results");
          await callbacks.openResults();
        } else {
          $(step === 3 ? "generation-panel" : "input-body").scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }
      }),
    ),
  );
  syncModelSelectors();
  taskHeading();
  applyPreset("standard");
}
