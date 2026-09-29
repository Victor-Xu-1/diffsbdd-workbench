/** Real Chrome/Chromium test. Full mode requires the installed CUDA model.
 * --ui-only uses the explicitly labelled generated fixture from serve_fixture.py.
 */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.DIFFSBDD_TEST_URL || "http://127.0.0.1:7865";
const uiOnly = process.argv.includes("--ui-only");
const output = path.join(root, "test-results", uiOnly ? "ui" : "gpu");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHANNEL
    ? { channel: process.env.PLAYWRIGHT_CHANNEL }
    : {}),
});
const evidence = {
  mode: uiOnly ? "fixture UI/API integration" : "real GPU end-to-end",
  jobs: [],
  checks: [],
};
let page;
try {
  const context = await browser.newContext({
    viewport: { width: 1536, height: 1024 },
    acceptDownloads: true,
  });
  context.setDefaultTimeout(30000);
  page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(base, { waitUntil: "networkidle" });
  await page.locator("#load-example").click();
  await page.waitForFunction(
    () => document.querySelector("#model").options.length === 8,
  );
  await page.waitForFunction(
    () =>
      document.querySelector("#pocket-confirm-title").textContent ===
      "口袋已确认",
  );
  await page.locator("#show-residues").click();
  const residues = page.locator("#residue-list input:checked");
  assert.ok((await residues.count()) > 0);
  await page.locator("#apply-residues").click();
  await page.waitForFunction(
    () =>
      document.querySelector("#pocket-confirm-title").textContent ===
      "口袋已确认",
  );
  await page.locator("#load-example").click();
  await page.waitForFunction(
    () => document.querySelector("#pocket-viewer").dataset.ready === "true",
  );
  await page.locator("#save-draft").click();
  await page.locator("#design-name").fill(`Browser design ${Date.now()}`);
  await page.locator("#design-save-new").click();
  await page.locator("#save-design-dialog").waitFor({ state: "hidden" });
  assert.match(await page.locator("#notice").innerText(), /已保存/);
  check(
    "real pocket parsing, manual residue confirmation and portable saved design",
  );
  await page.locator('[data-figure="pocket"]').click();
  await page.locator("#figure-sidechains").check();
  await page.locator("#figure-labels").check();
  await page.locator("#figure-apply").click();
  await page.waitForFunction(() =>
    document.querySelector("#figure-message").textContent.includes("已应用"),
  );
  await page.locator("#figure-save-view").click();
  await page.locator("#figure-restore-view").click();
  const recipeDownload = page.waitForEvent("download");
  await page.locator("#figure-recipe").click();
  const recipePath = path.join(output, "view.json");
  await (await recipeDownload).saveAs(recipePath);
  await page.locator("#figure-import-file").setInputFiles(recipePath);
  await page.waitForFunction(() =>
    document.querySelector("#figure-message").textContent.includes("已恢复"),
  );
  await page.locator("#figure-width").selectOption("2400");
  await page.locator("#figure-transparent").check();
  const imageDownload = page.waitForEvent("download");
  await page.locator("#figure-png").click();
  const imagePath = path.join(output, "structure.png");
  await (await imageDownload).saveAs(imagePath);
  const png = await readFile(imagePath);
  assert.equal(png.readUInt32BE(16), 2400);
  assert.ok(png.readUInt32BE(20) > 500);
  await page.locator("#figure-dialog .dialog-close").click();
  check(
    "real surface rendering, residue labels, view recipe roundtrip and 2400-pixel PNG export",
  );
  if (uiOnly) {
    await page.locator("#nav-results").click();
    // A CPU-only environment cannot run model inference. Editing and preview
    // still execute real RDKit/HTTP code; enable only those interactions.
    await page.waitForFunction(
      () => document.querySelectorAll(".molecule").length > 0,
    );
  }
  if (!uiOnly) {
    await page.locator("#count").fill("2");
    await page.locator("#size_mode").selectOption("fixed");
    if (!(await page.locator("#advanced-settings").evaluate((el) => el.open)))
      await page.locator("#advanced-settings > summary").click();
    await page.locator("#atoms").fill("24");
    const sent = page.waitForResponse(
      (r) => r.url() === `${base}/api/jobs` && r.request().method() === "POST",
    );
    await page.locator("#generate").click();
    const created = await (await sent).json();
    assert.ok(created.id, JSON.stringify(created));
    await waitJob(context, created.id);
    evidence.jobs.push(created.id);
    await page.waitForFunction(
      () => document.querySelector("#state").textContent === "已完成",
      null,
      { timeout: 30000 },
    );
  }
  await page.locator(".molecule").first().click();
  await page.locator("#editor").scrollIntoViewIfNeeded();
  const frame = page.frameLocator("#editor");
  await frame.getByTestId("F-button").click();
  const oxygen = frame.locator("svg text").filter({ hasText: /^O$/ }).first();
  await oxygen.waitFor();
  const atom = await oxygen.boundingBox();
  await page.mouse.click(atom.x + atom.width / 2, atom.y + atom.height / 2);
  const editor = page.frames().find((f) => f.url().includes("/editor/"));
  const smiles = await editor.evaluate(() => window.ketcher.getSmiles());
  assert.match(smiles, /F/);
  const note = `Browser test: graphical O→F edit ${Date.now()}`;
  await page.locator("#feedback").fill(note);
  await page.locator("#rating").selectOption("4");
  const parent = await page.locator("#history").inputValue();
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/jobs/${parent}/edits`) &&
      r.request().method() === "POST",
  );
  await page.locator("#optimize").click();
  const edit = await (await saved).json();
  assert.ok(edit.id, JSON.stringify(edit));
  await page.waitForFunction(
    () => document.querySelector("#task").value === "optimize",
  );
  check("graphical atom edit, real 3D alignment and feedback save");
  if (!uiOnly) {
    await page.locator("#population").fill("3");
    await page.locator("#rounds").fill("2");
    await page.locator("#survivors").fill("2");
    const sent = page.waitForResponse(
      (r) => r.url() === `${base}/api/jobs` && r.request().method() === "POST",
    );
    await page.locator("#generate").click();
    const created = await (await sent).json();
    assert.ok(created.id, JSON.stringify(created));
    const result = await waitJob(context, created.id);
    assert.equal(result.report.optimization.history.length, 2);
    evidence.jobs.push(created.id);
    await page.waitForFunction(
      () => document.querySelector("#state").textContent === "已完成",
      null,
      { timeout: 30000 },
    );
    const downloading = page.waitForEvent("download");
    await page.getByRole("link", { name: "三维结构 SDF", exact: true }).click();
    await (await downloading).saveAs(path.join(output, "download.sdf"));
    assert.match(
      await readFile(path.join(output, "download.sdf"), "utf8"),
      /\$\$\$\$/,
    );
    check("two optimization rounds, real result download");
  }
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#nav-results").click();
  await page.locator("#history").selectOption(parent);
  await page.getByText(note, { exact: false }).first().waitFor();
  check("feedback survives page reload");
  await page.locator("#surface").check();
  await page.locator("#protein-view").selectOption("full");
  await page.locator("#ligand-view").selectOption("sphere");
  await page.locator("#surface").uncheck();
  await page.locator("#protein-view").selectOption("pocket");
  await page.locator("#ligand-view").selectOption("stick");
  await page.locator("#click-mode").selectOption("select");
  await page.locator("#viewer").scrollIntoViewIfNeeded();
  const box = await page.locator("#viewer canvas").first().boundingBox(),
    hits = [];
  for (let y = 0.3; y <= 0.7 && hits.length < 2; y += 0.05) {
    for (let x = 0.3; x <= 0.7 && hits.length < 2; x += 0.05) {
      const before = await page.locator("#fixed-atoms").inputValue();
      await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
      const after = await page.locator("#fixed-atoms").inputValue();
      if (after && after !== before && after.split(",").length > hits.length)
        hits.push({ x: box.x + box.width * x, y: box.y + box.height * y });
    }
  }
  assert.equal(
    hits.length,
    2,
    "Could not select two actual atoms through the 3D canvas",
  );
  await page.locator("#click-mode").selectOption("measure");
  for (const point of hits) await page.mouse.click(point.x, point.y);
  assert.match(await page.locator("#viewer-note").innerText(), /几何距离/);
  check("actual canvas atom selection and distance measurement");
  await page.locator("#clear-fixed").click();
  if (!uiOnly) {
    await page.locator("#use-original").click();
    await page.waitForFunction(
      () =>
        document.querySelector("#mode").value === "result" &&
        !document.querySelector("#design-view").hidden &&
        document.querySelector("#pocket-confirm-title").textContent ===
          "口袋已确认",
    );
    await page.locator('[data-task="inpaint"]').click();
    if (!(await page.locator("#advanced-settings").evaluate((el) => el.open)))
      await page.locator("#advanced-settings > summary").click();
    await page.locator("#size_mode").selectOption("fixed");
    const data = await (
      await context.request.get(`${base}/api/jobs/${parent}`)
    ).json();
    const count = data.report.molecules[0].heavy_atoms;
    await page
      .locator("#fixed-atoms")
      .fill(Array.from({ length: count }, (_, i) => i + 1).join(","));
    await page.locator("#added_atoms").fill("0");
    await page.locator("#count").fill("1");
    await page.locator("#trajectory").check();
    const sent = page.waitForResponse(
      (r) => r.url() === `${base}/api/jobs` && r.request().method() === "POST",
    );
    await page.locator("#generate").click();
    const created = await (await sent).json();
    assert.ok(created.id, JSON.stringify(created));
    const result = await waitJob(context, created.id);
    evidence.jobs.push(created.id);
    assert.ok(result.report.valid > 0);
    await page.waitForFunction(
      () => document.querySelector("#state").textContent === "已完成",
      null,
      { timeout: 30000 },
    );
    await page.locator("#history").selectOption(created.id);
    await page.locator("#trajectory-controls").waitFor({ state: "visible" });
    await page.locator("#trajectory-play").click();
    await page.waitForFunction(
      () => Number(document.querySelector("#trajectory-frame").value) > 1,
    );
    await page.locator("#trajectory-exit").click();
    check("fixed-atom inference and real denoising trajectory playback");
    await page.locator('[data-task="generate"]').click();
    await page.locator("#load-example").click();
    await page
      .locator("#protein")
      .setInputFiles(path.join(root, "examples/3rfm.pdb"));
    await page.locator("#count").fill("1");
    const started = page.waitForResponse(
      (r) => r.url() === `${base}/api/jobs` && r.request().method() === "POST",
    );
    await page.locator("#generate").click();
    const cancellable = await (await started).json();
    assert.ok(cancellable.id);
    await page.locator("#cancel").waitFor({ state: "visible" });
    await page.locator("#cancel").click();
    await page.waitForFunction(
      () => document.querySelector("#state").textContent === "已取消",
      null,
      { timeout: 30000 },
    );
    check("custom PDB upload and bounded cancellation");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#mobile-menu").click();
  await page.locator('[data-task="generate"]').click();
  await page.screenshot({
    path: path.join(output, "mobile.png"),
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "Mobile page overflows horizontally",
  );
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.locator("#load-example").click();
  if (await page.locator("#advanced-settings").evaluate((el) => el.open))
    await page.locator("#advanced-settings > summary").click();
  await page.waitForFunction(
    () =>
      document.querySelector("#pocket-viewer").dataset.ready === "true" &&
      document.querySelector("#pocket-confirm-title").textContent ===
        "口袋已确认",
  );
  await page.screenshot({
    path: path.join(output, "desktop.png"),
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  check("desktop/mobile layout and no browser errors");
  await writeFile(
    path.join(output, "browser.json"),
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  if (page) {
    await page.screenshot({
      path: path.join(output, "failure.png"),
      fullPage: true,
    });
    console.error(await page.locator("#error").textContent());
  }
  throw error;
} finally {
  await browser.close();
}

async function waitJob(context, id) {
  const deadline = Date.now() + 240000;
  while (Date.now() < deadline) {
    const response = await context.request.get(`${base}/api/jobs/${id}`);
    const job = await response.json();
    if (job.status !== "running") {
      assert.equal(job.status, "completed", JSON.stringify(job.report));
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`GPU job ${id} exceeded browser-test time budget`);
}

function check(message) {
  evidence.checks.push(message);
  console.log(`Passed: ${message}`);
}
