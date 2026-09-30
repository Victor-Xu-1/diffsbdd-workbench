/** The sole chemical-editor boundary. Models and UI never depend on editor DOM. */
import { editorAtomMap } from "./molecular-selection.js";
let queue = Promise.resolve();
let initialized,
  sequence = 0;
let activeEditor = null,
  atomIds = null,
  importing = false,
  syncing = false,
  callbacks = {};
const subscribed = new WeakSet();
let layoutRevision = 0,
  resizeObserver,
  loading = false,
  fitting = false;
function updateBusy() {
  const frame = document.getElementById("editor"),
    busy = loading || fitting;
  frame.style.pointerEvents = busy ? "none" : "";
  frame.setAttribute("aria-busy", String(busy));
}
async function fitViewport() {
  const frame = document.getElementById("editor");
  if (!activeEditor || frame.getBoundingClientRect().width < 80) return;
  const revision = ++layoutRevision;
  fitting = true;
  updateBusy();
  try {
    // Wait for the iframe's native resize handler, then adjust only its viewport.
    // Re-importing here would discard undo history and unsaved chemical edits.
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    if (revision !== layoutRevision || frame.getBoundingClientRect().width < 80)
      return;
    const editor = activeEditor.editor;
    if (!editor.struct().atoms.size) return;
    // Ketcher caches canvas dimensions and text bounds while its iframe is hidden.
    // Refresh both before fitting, so the drawing and atom hit-testing agree.
    editor.render.resizeViewBox();
    editor.render.update(true);
    editor.zoom(1);
    editor.render.resizeViewBox();
    const bounds = editor.struct().getCoordBoundingBox(),
      scale = editor.render.options.microModeScale;
    const zoom = Math.max(
      0.1,
      Math.min(
        1.6,
        (frame.clientWidth - 220) /
          Math.max(1, (bounds.max.x - bounds.min.x) * scale),
        (frame.clientHeight - 200) /
          Math.max(1, (bounds.max.y - bounds.min.y) * scale),
      ),
    );
    activeEditor.setZoom(zoom);
    editor.render.resizeViewBox();
    editor.centerViewportAccordingToStruct();
    editor.render.update(true);
    editor.event.zoomChanged.dispatch();
  } finally {
    if (revision === layoutRevision) {
      fitting = false;
      updateBusy();
    }
  }
}
export function setupEditorSelection(handlers) {
  callbacks = handlers;
  resizeObserver = new ResizeObserver(
    () => void fitViewport().catch((error) => callbacks.layoutError?.(error)),
  );
  resizeObserver.observe(document.getElementById("editor"));
}
export function highlightEditorAtoms(indices) {
  if (!atomIds || !activeEditor) return false;
  if (
    indices.some(
      (index) =>
        !Number.isInteger(index) || index < 0 || index >= atomIds.length,
    )
  )
    return false;
  syncing = true;
  try {
    activeEditor.editor.selection({
      atoms: indices.map((index) => atomIds[index]),
    });
  } finally {
    syncing = false;
  }
  return true;
}
function bindSelection(editor) {
  if (subscribed.has(editor)) return;
  subscribed.add(editor);
  editor.editor.subscribe("change", () => {
    if (importing) return;
    atomIds = null;
    callbacks.changed?.();
  });
  editor.editor.subscribe("selectionChange", () => {
    if (importing || syncing) return;
    if (!atomIds) {
      callbacks.unmapped?.();
      return;
    }
    const selection = editor.editor.selection();
    const ids = new Set(selection?.atoms || []),
      struct = editor.editor.struct();
    for (const id of selection?.bonds || []) {
      const bond = struct.bonds.get(id);
      if (bond) {
        ids.add(bond.begin);
        ids.add(bond.end);
      }
    }
    const indices = [...ids].map((id) => atomIds.indexOf(id));
    if (indices.some((index) => index < 0)) {
      atomIds = null;
      callbacks.unmapped?.();
      return;
    }
    callbacks.selected?.(indices);
  });
}

function ready() {
  const frame = document.getElementById("editor");
  if (initialized) return initialized;
  if (frame.contentWindow?.ketcher)
    return Promise.resolve(frame.contentWindow.ketcher);
  initialized = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeEventListener("message", receive);
      initialized = null;
      reject(new Error("Ketcher 加载超时，请刷新页面后重试。"));
    }, 45000);
    function receive(event) {
      if (
        event.source !== frame.contentWindow ||
        event.origin !== location.origin ||
        event.data?.eventType !== "init"
      )
        return;
      clearTimeout(timeout);
      window.removeEventListener("message", receive);
      if (!frame.contentWindow.ketcher) {
        initialized = null;
        reject(new Error("Ketcher 初始化失败。"));
        return;
      }
      resolve(frame.contentWindow.ketcher);
    }
    window.addEventListener("message", receive);
    frame.src = "/editor/?disableMacromoleculesEditor=true";
  });
  return initialized;
}

export async function loadEditor(molblock) {
  const current = ++sequence;
  loading = true;
  updateBusy();
  try {
    const editor = await ready();
    if (current !== sequence) return;
    const apply = async () => {
      if (current !== sequence) return;
      bindSelection(editor);
      importing = true;
      atomIds = null;
      try {
        await editor.setMolecule(molblock);
        if (current !== sequence) return;
        // The pose belongs to the 3D viewer. Native Indigo layout produces a
        // separate, readable 2D depiction without changing its chemical identity.
        const identity = await editor.getSmiles();
        await editor.layout();
        if (current !== sequence) return;
        // Reload this newly laid-out depiction once on import. Ketcher's layout
        // retains the old 3D stereo-label anchor; a 2D import rebuilds that anchor.
        // Navigation and resizing never reimport, preserving edits and undo.
        await editor.setMolecule(await editor.getMolfile("v2000"));
        if (current !== sequence) return;
        if (identity !== (await editor.getSmiles()))
          throw new Error("二维排布未能保持分子及立体化学，请重新选择结构。");
        activeEditor = editor;
        await fitViewport();
        atomIds = editorAtomMap(molblock, editor.editor.struct());
        if (!atomIds) callbacks.unmapped?.();
        else callbacks.mapped?.();
      } finally {
        importing = false;
      }
    };
    // Each caller receives its own rejection; a failed import does not block
    // subsequent user selections, which are serialized to prevent stale edits.
    queue = queue.then(apply, apply);
    await queue;
  } finally {
    if (current === sequence) {
      loading = false;
      updateBusy();
    }
  }
}

export async function exportEditor() {
  const editor = await ready();
  return editor.getMolfile("v2000");
}
