import { $ } from "./controls.js";
import { api } from "./api.js";
export function saveDownload(content, name, type = "application/octet-stream") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function exportSelection(selection, format) {
  const response = await fetch("/api/library/export", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-DiffSBDD-Client": "local-ui",
    },
    body: JSON.stringify({ selection, format }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "导出失败，请重试。");
  }
  saveDownload(await response.blob(), `selected-molecules.${format}`);
}
export const run = (fn, onError) => async () => {
  try {
    await fn();
  } catch (error) {
    onError(error.message);
  }
};
export function table(headers, rows) {
  const node = document.createElement("table");
  node.className = "model-table";
  const head = document.createElement("tr");
  for (const title of headers) {
    const cell = document.createElement("th");
    cell.textContent = title;
    head.append(cell);
  }
  node.append(head);
  for (const values of rows) {
    const row = document.createElement("tr");
    for (const value of values) {
      const cell = document.createElement("td");
      cell.textContent = value ?? "—";
      row.append(cell);
    }
    node.append(row);
  }
  return node;
}
export { $, api };
