/** Portable designs are persisted by the backend; no browser-only file handles. */
import { $, api, run } from "./workspace-utils.js";
let current = null,
  callbacks;
export async function refreshDesigns() {
  const records = await api("/api/designs");
  const selected = current?.id || "example";
  $("project").replaceChildren(new Option("当前设计", "example"));
  for (const record of records)
    $("project").add(new Option(record.name, record.id));
  $("project").value = selected;
  $("saved-designs").replaceChildren();
  if (!records.length) {
    $("saved-designs").textContent =
      "暂无保存的设计。在设计页点击“保存设计”，即可把结构与参数一起保存。";
    return;
  }
  for (const record of records) {
    const row = document.createElement("div");
    row.className = "edit-row";
    const name = document.createElement("strong");
    name.textContent = record.name;
    const detail = document.createElement("span");
    detail.textContent = `版本 ${record.revision} · ${new Date(record.updated_at).toLocaleString()}`;
    const open = document.createElement("button");
    open.textContent = "打开并继续";
    open.addEventListener(
      "click",
      run(() => openDesign(record.id), callbacks.onError),
    );
    const download = document.createElement("a");
    download.className = "download";
    download.href = `/api/designs/${record.id}/export`;
    download.textContent = "下载结构与设置";
    row.append(name, detail, open, download);
    $("saved-designs").append(row);
  }
}
async function openDesign(id) {
  const record = await api(`/api/designs/${id}`);
  await callbacks.restore(record.request);
  current = record;
  $("project").value = id;
  callbacks.notice(`已打开“${record.name}”，结构与参数均已恢复。`);
}
async function save(update) {
  $("design-save-message").textContent = "正在检查并保存结构…";
  const request = await callbacks.payload();
  const record = await api(
    update ? `/api/designs/${current.id}` : "/api/designs",
    {
      method: update ? "PUT" : "POST",
      body: JSON.stringify({
        name: $("design-name").value,
        request,
        revision: update ? current.revision : 0,
      }),
    },
  );
  current = record;
  await refreshDesigns();
  $("save-design-dialog").close();
  callbacks.notice(`已保存“${record.name}”，可从顶部列表或“已保存设计”继续。`);
}
export function setupDesigns(handlers) {
  callbacks = handlers;
  $("save-draft").addEventListener("click", () => {
    $("design-name").value = current?.name || "新分子设计";
    $("design-update").disabled = !current;
    $("design-update").hidden = !current;
    $("design-save-new").textContent = current ? "另存为新设计" : "保存设计";
    $("design-save-message").textContent = "";
    $("save-design-dialog").showModal();
  });
  const action = async (update) => {
    if ($("design-save-new").disabled) return;
    $("design-save-new").disabled = true;
    $("design-update").disabled = true;
    try {
      await save(update);
    } catch (error) {
      $("design-save-message").textContent = error.message;
    } finally {
      $("design-save-new").disabled = false;
      $("design-update").disabled = !current;
    }
  };
  $("save-design-form").addEventListener("submit", (event) => {
    event.preventDefault();
    void action(false);
  });
  $("design-update").addEventListener("click", () => void action(true));
  $("project").addEventListener(
    "change",
    run(async () => {
      if ($("project").value !== "example")
        await openDesign($("project").value);
    }, callbacks.onError),
  );
  $("new-design").addEventListener(
    "click",
    run(async () => {
      current = null;
      await callbacks.newDesign();
      $("project").value = "example";
    }, callbacks.onError),
  );
}
