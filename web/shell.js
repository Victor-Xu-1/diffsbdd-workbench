/** Navigation and view composition; molecular data and model calls live elsewhere. */
import { $, schema, syncControls } from "./controls.js";
import { api, labels } from "./api.js";
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
const guidance = {
  selectivity: [
    "选择性设计",
    "当前官方推理接口没有开箱即用的选择性预测或优化目标。本版不会将 QED、SA 或几何接触解释成选择性。",
    "可对不同蛋白口袋分别生成候选并保存记录；跨靶点亲和力比较需要另外经过验证的评分流程。",
  ],
  benchmark: [
    "批量基准测试",
    "本版提供真实模型与浏览器回归脚本；完整科研基准还需要 CrossDocked / Binding MOAD 测试集、数据划分和评估协议。",
    "仓库的 tests/gpu_smoke.py 可运行本机模型功能验证。未安装科研测试集时，不会生成或模拟论文基准分数。",
  ],
  data: [
    "数据准备",
    "蛋白：PDB，最多 5 MB。参考配体：单分子三维 SDF，坐标必须与蛋白一致。起始片段可以包含多个不相连片段。",
    "模型口袋使用标准氨基酸，默认参考配体周围 8 Å。也可在三维图和残基列表中手动指定口袋。",
    "当前输入范围为最多 1000 个口袋重原子、最多 80 个配体重原子。保留完整片段时需完整选择芳香环。",
  ],
};
function taskHeading() {
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
function saveDraft() {
  const names = [
    ...schema.map(([id]) => id),
    "task",
    "model",
    "size_mode",
    "center",
    "objective",
    "fragment_policy",
    "bond_mode",
    "fixed-atoms",
    "trajectory",
    "design-purpose",
  ];
  const fields = Object.fromEntries(
    names
      .filter((id) => $(id))
      .map((id) => [
        id,
        $(id).type === "checkbox" ? $(id).checked : $(id).value,
      ]),
  );
  try {
    localStorage.setItem(
      "diffsbdd.draft.v1",
      JSON.stringify({ version: 1, fields }),
    );
    notice(
      "草稿已保存到本机浏览器。草稿保存设计设置；上传结构请在继续时重新确认。",
    );
  } catch (error) {
    notice("浏览器无法保存草稿，请检查是否禁用了本地存储。");
  }
}
function restoreDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem("diffsbdd.draft.v1"));
    if (!saved || saved.version !== 1) throw new Error();
    for (const [id, value] of Object.entries(saved.fields)) {
      const node = $(id);
      if (node && node.closest("#generate-form") && node.type !== "file") {
        node.type === "checkbox"
          ? (node.checked = Boolean(value))
          : (node.value = value);
      }
    }
    syncControls();
    syncModelSelectors();
    taskHeading();
    setView("design");
    notice("已恢复草稿设置，请确认当前蛋白、口袋和起始结构后再开始。");
  } catch (error) {
    notice("当前没有可读取的草稿，请先保存一份设计设置。");
  }
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
    td.append(button);
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
async function renderLibrary() {
  const jobs = await api("/api/jobs?limit=100");
  $("library-content").replaceChildren();
  $("library-description").textContent =
    "最近 100 个任务中的候选结构。选择分子可查看、编辑与下载。";
  for (const job of jobs)
    for (const [index, molecule] of (job.report?.molecules || []).entries()) {
      const card = document.createElement("button");
      card.className = "molecule";
      const image = document.createElement("img");
      image.src = `/api/jobs/${job.id}/molecules/${index}.svg`;
      image.alt = `候选分子 ${index + 1}`;
      image.loading = "lazy";
      const title = document.createElement("strong");
      title.textContent = `${job.id.slice(0, 8)} · 分子 ${index + 1}`;
      const facts = document.createElement("p");
      facts.textContent = `QED ${molecule.qed} · MW ${molecule.molecular_weight} · ${labels[job.status]}`;
      card.append(image, title, facts);
      card.addEventListener(
        "click",
        safely(() => callbacks.openResult(job.id, index)),
      );
      $("library-content").append(card);
    }
  if (!$("library-content").childElementCount) {
    const p = document.createElement("p");
    p.textContent = "尚无有效候选。完成一次生成后，结构会出现在这里。";
    $("library-content").append(p);
  }
}
export function setupShell(handlers) {
  callbacks = handlers;
  $("mobile-menu").addEventListener("click", () => {
    const expanded = document.body.classList.toggle("navigation-open");
    $("mobile-menu").setAttribute("aria-expanded", String(expanded));
  });
  document.querySelectorAll("[data-task]").forEach((button) =>
    button.addEventListener("click", () => {
      $("task").value = button.dataset.task;
      $("task").dispatchEvent(new Event("change"));
      setView("design");
      if (button.dataset.task !== "generate")
        notice("请上传起始结构，或在“任务与结果”中选择分子继续设计。");
      else notice("");
    }),
  );
  $("task").addEventListener("change", () => {
    taskHeading();
    syncModelSelectors();
  });
  document.querySelectorAll("[data-view]").forEach((button) =>
    button.addEventListener(
      "click",
      safely(async () => {
        const view = button.dataset.view;
        setView(view);
        if (view === "results") await callbacks.openResults();
        if (view === "library") await renderLibrary();
      }),
    ),
  );
  // Dialog content is text-only; no uploaded or stored data becomes HTML.
  document.querySelectorAll("[data-info]").forEach((button) => {
    button.onclick = () => {
      const [title, ...paragraphs] = guidance[button.dataset.info];
      info(title, paragraphs);
    };
  });
  for (const id of ["help-button", "settings-help", "local-user"])
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
    $("advanced-settings").open = false;
    $("guided-mode").classList.add("selected");
    $("expert-mode").classList.remove("selected");
    $("breadcrumb").textContent = "01 / 引导模式";
  });
  $("expert-mode").addEventListener("click", () => {
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
  $("save-draft").addEventListener("click", saveDraft);
  $("project").addEventListener(
    "change",
    safely(async () => {
      $("project").value === "draft"
        ? restoreDraft()
        : await callbacks.loadExample();
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
          setStage(step);
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
}
