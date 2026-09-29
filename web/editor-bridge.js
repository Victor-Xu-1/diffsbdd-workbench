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
export function setupEditorSelection(handlers) {
  callbacks = handlers;
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
  if (frame.contentWindow?.ketcher)
    return Promise.resolve(frame.contentWindow.ketcher);
  if (initialized) return initialized;
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
      activeEditor = editor;
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
}

export async function exportEditor() {
  const editor = await ready();
  return editor.getMolfile("v2000");
}
