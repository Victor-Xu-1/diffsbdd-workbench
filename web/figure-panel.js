import { scaleFigureLabels } from "./figure-labels.js";
/** Figure controls, reproducible camera recipes and native WebGL PNG export. */
import {
  FIGURE_DEFAULTS,
  FIGURE_PRESETS,
  validateFigureSettings,
  validateViewRecipe,
} from "./molecular-style.js";
const views = new Map();
let active = null;
const $ = (id) => document.getElementById(id);
export function registerFigure(id, adapter) {
  views.set(id, { ...adapter, settings: { ...FIGURE_DEFAULTS }, saved: null });
  return views.get(id).settings;
}
export function openFigure(id) {
  active = views.get(id);
  if (!active?.viewer()) return;
  for (const [key, value] of Object.entries(active.settings)) {
    const field = $(`figure-${key}`);
    if (field)
      field.type === "checkbox"
        ? (field.checked = value)
        : (field.value = value);
  }
  $("figure-message").textContent =
    "元素配色：氮蓝、氧红、硫黄；表面为几何形状，不代表静电势。";
  $("figure-dialog").showModal();
}
function download(data, name) {
  const a = document.createElement("a");
  a.href = data;
  a.download = name;
  a.click();
}
async function png() {
  const view = active,
    viewer = view.viewer(),
    width = Number($("figure-width").value),
    box = {
      width: view.element().offsetWidth,
      height: view.element().offsetHeight,
    };
  if (!box.width || !box.height) throw new Error("请先打开要导出的三维视图。");
  await view.ready();
  const ratio = viewer.getCanvas().width / box.width,
    height = Math.round((width * box.height) / box.width);
  try {
    scaleFigureLabels(viewer, width / viewer.getCanvas().width);
    viewer.setWidth(width / ratio);
    viewer.setHeight(height / ratio);
    viewer.setBackgroundColor(
      view.settings.background,
      $("figure-transparent").checked ? 0 : 1,
    );
    viewer.render();
    const uri = viewer.pngURI();
    download(uri, "diffsbdd-structure.png");
    $("figure-message").textContent =
      `已导出 ${viewer.getCanvas().width} × ${viewer.getCanvas().height} 像素 PNG。用于排版时请按期刊要求设置最终物理尺寸。`;
  } finally {
    scaleFigureLabels(viewer, 1);
    viewer.setBackgroundColor(view.settings.background, 1);
    viewer.resize();
    viewer.render();
  }
}
export function setupFigures() {
  for (const control of document.querySelectorAll("[data-figure-preset]")) {
    control.replaceChildren(
      ...Object.entries(FIGURE_PRESETS).map(
        ([id, preset]) => new Option(preset.label, id),
      ),
      new Option("自定义", "custom"),
    );
    control.value = "site";
    control.addEventListener("change", async () => {
      const view = views.get(control.dataset.figurePreset),
        preset = FIGURE_PRESETS[control.value];
      if (!view?.viewer() || !preset) return;
      try {
        Object.assign(view.settings, preset.settings);
        await view.redraw();
        view.focus?.(preset.focus);
      } catch (error) {
        document.getElementById("error").hidden = false;
        document.getElementById("error").textContent = error.message;
      }
    });
  }
  for (const button of document.querySelectorAll("[data-figure]"))
    button.addEventListener("click", () => openFigure(button.dataset.figure));
  $("figure-import").addEventListener("click", () =>
    $("figure-import-file").click(),
  );
  $("figure-import-file").addEventListener("change", async () => {
    try {
      const file = $("figure-import-file").files[0];
      if (!file || file.size > 100000)
        throw new Error("请选择小于 100 KB 的视图设置 JSON。");
      const recipe = validateViewRecipe(JSON.parse(await file.text()));
      Object.assign(active.settings, recipe.settings);
      document.querySelector(
        `[data-figure-preset="${[...views].find(([, v]) => v === active)[0]}"]`,
      ).value = "custom";
      await active.redraw();
      active.viewer().setView(recipe.camera);
      openFigure([...views].find(([, view]) => view === active)[0]);
      $("figure-message").textContent =
        "视图已恢复。请使用与设置文件相同的蛋白和配体坐标。";
    } catch (error) {
      $("figure-message").textContent = error.message;
    } finally {
      $("figure-import-file").value = "";
    }
  });
  $("figure-apply").addEventListener("click", async () => {
    try {
      const proposed = { ...active.settings };
      for (const [key, value] of Object.entries(proposed)) {
        const field = $(`figure-${key}`);
        if (field)
          proposed[key] =
            field.type === "checkbox"
              ? field.checked
              : typeof value === "number"
                ? Number(field.value)
                : field.value;
      }
      Object.assign(active.settings, validateFigureSettings(proposed));
      document.querySelector(
        `[data-figure-preset="${[...views].find(([, v]) => v === active)[0]}"]`,
      ).value = "custom";
      await active.redraw();
      $("figure-message").textContent =
        "显示设置已应用，可关闭窗口旋转结构后导出。";
    } catch (error) {
      $("figure-message").textContent = error.message;
    }
  });
  $("figure-png").addEventListener("click", async () => {
    try {
      await png();
    } catch (error) {
      $("figure-message").textContent = `导出失败：${error.message}`;
    }
  });
  $("figure-save-view").addEventListener("click", () => {
    active.saved = active.viewer().getView();
    $("figure-message").textContent = "当前视角已保存，可在本次页面会话恢复。";
  });
  $("figure-restore-view").addEventListener("click", () => {
    if (active.saved) {
      active.viewer().setView(active.saved);
      active.viewer().render();
    } else $("figure-message").textContent = "请先保存一个视角。";
  });
  $("figure-recipe").addEventListener("click", () => {
    const recipe = {
      schema: 1,
      renderer: "3Dmol.js 2.5.5",
      settings: active.settings,
      camera: active.viewer().getView(),
      note: "Pair this view recipe with the original protein and ligand coordinates; camera and styles do not modify coordinates.",
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(recipe, null, 2)], { type: "application/json" }),
    );
    download(url, "diffsbdd-view.json");
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}
