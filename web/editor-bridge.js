/** The sole chemical-editor boundary. Models and UI never depend on editor DOM. */
let queue = Promise.resolve();
let initialized,
  sequence = 0;

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
    if (current === sequence) await editor.setMolecule(molblock);
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
