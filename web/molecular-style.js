import { addFigureLabel } from "./figure-labels.js";
/** Shared publication figure conventions for both real molecular viewers. */
export const FIGURE_DEFAULTS = Object.freeze({
  proteinColor: "#8fbce0",
  carbonColor: "#48a548",
  surfaceOpacity: 0.15,
  proteinOpacity: 1,
  stickRadius: 0.16,
  representation: "cartoon",
  background: "#ffffff",
  projection: "orthographic",
  labels: false,
  sidechains: false,
  surfaceType: "SES",
});
const ELEMENTS = {
  N: 0x315cc4,
  O: 0xd83c36,
  S: 0xd6b532,
  P: 0xe58b35,
  F: 0x70b657,
  Cl: 0x48a54c,
  Br: 0xa45c32,
  I: 0x82549d,
  H: 0xe4e4e4,
};
export const atomColor = (carbon) => (atom) =>
  atom.elem === "C" ? carbon : (ELEMENTS[atom.elem] ?? 0xa0a8af);
export function ligandStyle(kind, settings) {
  const colorfunc = atomColor(settings.carbonColor);
  if (kind === "sphere") return { sphere: { scale: 1, colorfunc } };
  if (kind === "line") return { line: { colorfunc, linewidth: 2 } };
  if (kind === "sticks")
    return { stick: { radius: settings.stickRadius, colorfunc } };
  return {
    stick: { radius: settings.stickRadius, colorfunc },
    sphere: { scale: 0.23, colorfunc },
  };
}
export function proteinStyle(settings) {
  const color = settings.proteinColor,
    opacity = settings.proteinOpacity;
  if (settings.representation === "line") return { line: { color, opacity } };
  if (settings.representation === "stick")
    return { stick: { color, opacity, radius: 0.1 } };
  return { cartoon: { color, opacity, thickness: 0.25, arrows: true } };
}
export function nearbyAtoms(model, points, radius) {
  const squared = radius * radius;
  return model
    .selectedAtoms({ hetflag: false })
    .filter((a) =>
      points.some(
        (b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2 < squared,
      ),
    );
}
export function residueContext(viewer, settings, points, modelId = 0) {
  const near = nearbyAtoms(viewer.getModel(modelId), points, 4);
  const ids = new Set(near.map((a) => `${a.chain}:${a.resi}`));
  const selection = {
    model: modelId,
    predicate: (a) => ids.has(`${a.chain}:${a.resi}`),
  };
  if (settings.sidechains)
    viewer.addStyle(selection, {
      stick: { radius: 0.09, colorfunc: atomColor(settings.proteinColor) },
    });
  if (settings.labels) {
    const candidates = [];
    for (const atom of near) {
      if (
        candidates.some((a) => a.chain === atom.chain && a.resi === atom.resi)
      )
        continue;
      candidates.push(atom);
    }
    candidates.sort(
      (a, b) =>
        Math.min(
          ...points.map((p) => Math.hypot(p.x - a.x, p.y - a.y, p.z - a.z)),
        ) -
        Math.min(
          ...points.map((p) => Math.hypot(p.x - b.x, p.y - b.y, p.z - b.z)),
        ),
    );
    for (const atom of candidates.slice(0, 10))
      addFigureLabel(viewer, `${atom.resn} ${atom.chain}:${atom.resi}`, {
        position: atom,
        font: "Arial",
        fontSize: 14,
        fontColor: 0x263446,
        backgroundOpacity: 0,
        inFront: false,
      });
  }
}
export function applyCamera(viewer, settings) {
  viewer.setBackgroundColor(settings.background, 1);
  viewer.setProjection(settings.projection);
  viewer.enableFog(false);
}

export function validateFigureSettings(input) {
  const result = { ...FIGURE_DEFAULTS };
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("视图设置格式无效。");
  const limits = {
    surfaceOpacity: [0, 1],
    proteinOpacity: [0.1, 1],
    stickRadius: [0.08, 0.3],
  };
  const choices = {
    representation: ["cartoon", "stick", "line"],
    projection: ["orthographic", "perspective"],
    surfaceType: ["SES", "VDW", "SAS"],
  };
  for (const [key, value] of Object.entries(input)) {
    if (!(key in FIGURE_DEFAULTS)) throw new Error("视图设置包含未知字段。");
    if (
      limits[key] &&
      (!Number.isFinite(value) ||
        value < limits[key][0] ||
        value > limits[key][1])
    )
      throw new Error("显示参数超出允许范围。");
    if (choices[key] && !choices[key].includes(value))
      throw new Error("不支持的显示方式。");
    if (
      ["proteinColor", "carbonColor", "background"].includes(key) &&
      !/^#[0-9a-f]{6}$/i.test(value)
    )
      throw new Error("颜色必须为六位十六进制值。");
    if (["labels", "sidechains"].includes(key) && typeof value !== "boolean")
      throw new Error("标注参数必须为布尔值。");
    result[key] = value;
  }
  return result;
}
export function validateViewRecipe(recipe) {
  if (
    recipe?.schema !== 1 ||
    !Array.isArray(recipe.camera) ||
    recipe.camera.length !== 8 ||
    recipe.camera.some((x) => !Number.isFinite(x) || Math.abs(x) > 100000)
  )
    throw new Error("视角文件无效或不受支持。");
  const q = recipe.camera.slice(4);
  if (Math.abs(Math.hypot(...q) - 1) > 0.01) throw new Error("视角旋转无效。");
  return {
    settings: validateFigureSettings(recipe.settings),
    camera: recipe.camera,
  };
}

export function resetCamera(viewer, model, zoom, rotation = 0) {
  viewer.zoomTo({ model });
  const view = viewer.getView();
  viewer.setView([...view.slice(0, 4), 0, 0, 0, 1]);
  viewer.zoom(zoom);
  if (rotation) viewer.rotate(rotation, "y");
  viewer.setSlab(-40, 40);
  viewer.render();
}
