/** One primary entry per function; business choices come from the server. */
import { getContract, presetOptions } from "./contract.js";
import { refreshLibrary, refreshComparison } from "./collections-ui.js";
import { refreshDesigns } from "./designs-ui.js";
import { $, restoreOptions } from "./controls.js";
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
  document.body.dataset.view = view;
  const surface =
    view === "inspect" ? "design" : view === "editor" ? "results" : view;
  document.body.classList.remove("navigation-open");
  $("mobile-menu").setAttribute("aria-expanded", "false");
  document
    .querySelectorAll(".app-view")
    .forEach((el) => (el.hidden = el.id !== surface + "-view"));
  $("action-bar").hidden = view !== "design";
  $("generation-panel").hidden = view === "inspect";
  $("results-title").textContent =
    view === "editor" ? "结构编辑与设计反馈" : "任务与结果";
  $("results-subtitle").textContent =
    view === "editor"
      ? "在二维画布中修改结构，保存后校验并更新三维构象。"
      : "查看生成结构、下载结果，选择候选继续设计。";
  const task = getContract().tasks[$("task").value];
  $("page-title").textContent =
    view === "inspect" ? "结构预览与相互作用" : task.title;
  $("page-subtitle").textContent =
    view === "inspect"
      ? "载入蛋白和配体，检查完整结构、选择残基并查看相互作用。"
      : task.help;
  document
    .querySelectorAll(".nav-item")
    .forEach((button) =>
      button.classList.toggle(
        "active",
        button.dataset.view === view ||
          (view === "design" && button.dataset.task === $("task").value),
      ),
    );
}
export function updateCount() {
  const total =
    $("task").value === "optimize"
      ? Number($("population").value) * Number($("rounds").value)
      : Number($("count").value);
  $("target-label").textContent = "计划探索 " + total + " 个候选";
  $("generate-label").textContent =
    ($("task").value === "optimize" ? "开始优化 " : "开始生成 ") +
    total +
    " 个候选";
}
function taskHeading() {
  const spec = getContract().tasks[$("task").value];
  $("page-title").textContent = spec.title;
  $("page-subtitle").textContent = spec.help;
  $("design-presets").replaceChildren();
  for (const preset of spec.presets) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.preset = preset.id;
    button.textContent = preset.label + " · " + preset.attempts + " 个";
    button.addEventListener("click", () => applyPreset(preset.id));
    $("design-presets").append(button);
  }
  updateCount();
}
export function applyPreset(level = getContract().default_preset) {
  const options = presetOptions($("task").value, level);
  restoreOptions(options);
  $("fixed-atoms").dispatchEvent(new Event("change"));
  document
    .querySelectorAll("[data-preset]")
    .forEach((el) =>
      el.classList.toggle("selected", el.dataset.preset === level),
    );
  $("preset-summary").textContent =
    $("task").value === "optimize"
      ? "每轮 " +
        options.population +
        " 个，探索 " +
        options.rounds +
        " 轮，保留 " +
        options.survivors +
        " 个进入下一轮。"
      : $("task").value === "diversify"
        ? "结构改动幅度 " +
          options.change_steps +
          "；候选数量可能因化学检查减少。"
        : options.steps +
          " 步采样；" +
          (level === "quick"
            ? "少量检查流程，正式设计建议使用常规方案。"
            : "未通过化学检查的结构不会列为有效结果。");
  updateCount();
}
export function setupShell(handlers) {
  callbacks = handlers;
  $("mobile-menu").addEventListener("click", () =>
    $("mobile-menu").setAttribute(
      "aria-expanded",
      String(document.body.classList.toggle("navigation-open")),
    ),
  );
  const navigation = $("design-navigation");
  for (const [id, task] of Object.entries(getContract().tasks)) {
    const button = document.createElement("button");
    button.className = "nav-item";
    button.dataset.task = id;
    const icon = document.createElement("img");
    icon.className = "icon";
    icon.alt = "";
    icon.src = "/assets/vendor/tabler/" + task.icon + ".svg";
    button.append(icon, task.label);
    navigation.append(button);
  }
  document.querySelectorAll("[data-task]").forEach((button) => {
    const spec = getContract().tasks[button.dataset.task];
    if (!spec) {
      button.remove();
      return;
    }
    button.addEventListener("click", () => {
      $("task").value = button.dataset.task;
      $("task").dispatchEvent(new Event("change"));
      applyPreset();
      setView("design");
      notice("");
    });
  });
  $("task").addEventListener("change", taskHeading);
  document.querySelectorAll(".nav-item[data-view]").forEach((button) =>
    button.addEventListener(
      "click",
      safely(async () => {
        const view = button.dataset.view;
        setView(view);
        if (view === "results" || view === "editor")
          await callbacks.openResults();
        if (view === "library") await refreshLibrary();
        if (view === "designs") await refreshDesigns();
        if (view === "compare") await refreshComparison();
      }),
    ),
  );
  $("help-button").addEventListener("click", () =>
    $("info-dialog").showModal(),
  );
  document
    .querySelectorAll(".dialog-close")
    .forEach((button) =>
      button.addEventListener("click", () => button.closest("dialog").close()),
    );
  $("load-example").addEventListener(
    "click",
    safely(async () => {
      setView(document.body.dataset.view === "inspect" ? "inspect" : "design");
      await callbacks.loadExample();
    }),
  );
  $("generate-form").addEventListener("input", (event) => {
    if (event.target.closest("#settings-body")) {
      document
        .querySelectorAll("[data-preset]")
        .forEach((el) => el.classList.remove("selected"));
      $("preset-summary").textContent =
        "已自定义参数；可重新选择上方方案恢复预设。";
      updateCount();
    }
  });
  $("choose-result-source").addEventListener(
    "click",
    safely(async () => {
      setView("results");
      await callbacks.openResults();
    }),
  );
  $("edit-current").addEventListener("click", () => setView("editor"));
  setView("design");
  taskHeading();
  applyPreset();
}
