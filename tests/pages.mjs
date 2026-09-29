import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  base = process.env.DIFFSBDD_TEST_URL || "http://127.0.0.1:17865";
await mkdir(path.join(root, "test-results/pages"), { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHANNEL
    ? { channel: process.env.PLAYWRIGHT_CHANNEL }
    : {}),
});
let page;
try {
  const context = await browser.newContext({
    viewport: { width: 1536, height: 1024 },
    acceptDownloads: true,
  });
  context.setDefaultTimeout(30000);
  page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForFunction(
    () =>
      document.querySelector("#pocket-confirm-title").textContent ===
      "口袋已确认",
  );
  assert.equal(await page.locator("[data-info]").count(), 0);
  assert.equal(
    await page.getByRole("button", { name: "选择性设计", exact: true }).count(),
    0,
  );
  await page.locator("[data-preset=quick]").click();
  assert.equal(await page.locator("#count").inputValue(), "3");
  assert.equal(await page.locator("#steps").inputValue(), "100");
  await page.locator("[data-preset=standard]").click();
  assert.equal(await page.locator("#count").inputValue(), "10");
  assert.equal(await page.locator("#steps").inputValue(), "500");
  await page.locator("label[for=count] .field-help button").hover();
  await page.locator("#help-count").waitFor({ state: "visible" });
  assert.match(await page.locator("#help-count").innerText(), /最终有效数量/);
  await page.locator("label[for=count] .field-help button").focus();
  await page.keyboard.press("Escape");
  await page.locator("#help-count").waitFor({ state: "hidden" });
  await page.locator("label[for=count] .field-help button").click();
  await page.locator("#help-count").waitFor({ state: "visible" });
  await page.locator("#save-draft").click();
  await page.locator("#help-count").waitFor({ state: "hidden" });
  await page.locator("#design-name").fill("可恢复的结构设计");
  const saving = page.waitForResponse(
    (r) => r.url() === `${base}/api/designs` && r.request().method() === "POST",
  );
  await page.locator("#design-save-new").click();
  const record = await (await saving).json();
  assert.ok(record.id);
  assert.match(record.request.protein_text, /ATOM/);
  await page.locator("#save-design-dialog").waitFor({ state: "hidden" });
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#project").selectOption(record.id);
  await page.waitForFunction(() =>
    document.querySelector("#notice").textContent.includes("均已恢复"),
  );
  assert.equal(await page.locator("#count").inputValue(), "10");
  await page.locator("[data-view=designs].nav-item").click();
  await page
    .locator("#saved-designs")
    .getByRole("button", { name: "打开并继续" })
    .first()
    .waitFor();
  await page.locator("[data-view=prepare]").click();
  await page.locator("#prepare-current").click();
  await page.waitForFunction(() =>
    document.querySelector("#prepare-status").textContent.startsWith("已处理"),
  );
  await page.locator("#prepare-ligands").uncheck();
  await page.locator("#prepare-run").click();
  await page.waitForFunction(() =>
    document.querySelector("#prepare-status").textContent.startsWith("已处理"),
  );
  const pdbDownload = page.waitForEvent("download");
  await page.locator("#prepare-download").click();
  const pdbPath = path.join(root, "test-results/pages/protein.pdb");
  await (await pdbDownload).saveAs(pdbPath);
  assert.ok(!(await readFile(pdbPath, "utf8")).includes("HETATM"));
  let completePreparation;
  const preparationFinished = new Promise((resolve) => {
    completePreparation = resolve;
  });
  await page.route("**/api/structures/prepare", async (route) => {
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({ response });
    completePreparation();
  });
  const preparing = page.waitForRequest("**/api/structures/prepare");
  await page.locator("#prepare-run").click();
  await preparing;
  await page.locator("#prepare-water").uncheck();
  await preparationFinished;
  await page.unrouteAll({ behavior: "wait" });
  assert.equal(
    await page.locator("#prepare-use").isDisabled(),
    true,
    "A stale preparation must not be applied",
  );
  await page.locator("#prepare-water").check();
  await page.locator("#prepare-run").click();
  await page.locator("#prepare-use:enabled").waitFor();
  await page.locator("#prepare-use").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#pocket-confirm-title")
      .textContent.includes("点选蛋白"),
  );
  let box = await page.locator("#pocket-viewer canvas").first().boundingBox(),
    chosen = false;
  for (let y = 0.2; y <= 0.8 && !chosen; y += 0.1)
    for (let x = 0.2; x <= 0.8 && !chosen; x += 0.1) {
      await page.mouse.click(box.x + x * box.width, box.y + y * box.height);
      chosen = Boolean(await page.locator("#reference").inputValue());
    }
  assert.ok(chosen, "Could not select a real protein residue");
  await page.waitForFunction(
    () =>
      document.querySelector("#pocket-confirm-title").textContent ===
      "口袋已确认",
  );
  console.log(
    "Passed: cleanup, presets, hover help, portable designs, real PDB filtering and canvas pocket selection",
  );
  await page.locator("#load-example").click();
  await page.waitForFunction(
    () =>
      document.querySelector("#mode").value === "demo" &&
      document.querySelector("#pocket-confirm-title").textContent ===
        "口袋已确认",
  );
  await page.locator("[data-task=inpaint]").click();
  await page
    .locator("#initial-sdf")
    .setInputFiles(path.join(root, "tests/fixtures/generated_3rfm.sdf"));
  await page.waitForFunction(
    () => !document.querySelector("#keep-scaffold").disabled,
  );
  await page.locator("#keep-scaffold").click();
  assert.ok((await page.locator("#fixed-atoms").inputValue()).length > 0);
  await page.locator("#clear-fragment").click();
  box = await page.locator("#pocket-viewer canvas").first().boundingBox();
  chosen = false;
  for (let y = 0.35; y <= 0.65 && !chosen; y += 0.035)
    for (let x = 0.35; x <= 0.65 && !chosen; x += 0.035) {
      await page.mouse.click(box.x + x * box.width, box.y + y * box.height);
      chosen = Boolean(await page.locator("#fixed-atoms").inputValue());
    }
  assert.ok(chosen, "Could not select an actual starting ligand atom/ring");
  assert.match(
    await page.locator("#fragment-count").innerText(),
    /已保留 [1-9]/,
  );
  await page.locator("[data-view=library].nav-item").click();
  await page.locator("#library-content .library-card").first().waitFor();
  await page.locator("#library-select-page").click();
  const molDownload = page.waitForEvent("download");
  await page.locator("#library-sdf").click();
  const sdfPath = path.join(root, "test-results/pages/selection.sdf");
  await (await molDownload).saveAs(sdfPath);
  assert.match(await readFile(sdfPath, "utf8"), /\$\$\$\$/);
  await page.locator("[data-view=compare]").click();
  await page.locator("#compare-jobs input").first().check();
  await page.locator("#compare-run").click();
  await page.locator("#compare-output table").waitFor();
  assert.match(await page.locator("#compare-output").innerText(), /平均 QED/);
  await page.locator("[data-view=models]").click();
  const verify = page.locator("[data-verify-model]").first();
  if (await verify.isEnabled()) {
    await verify.click();
    await page.waitForFunction(() =>
      document
        .querySelector("#model-verification")
        .textContent.includes("完整"),
    );
  }
  await page.locator("#nav-results").click();
  const jobs = await (await context.request.get(`${base}/api/jobs`)).json();
  if (jobs.length >= 2) {
    const slow = jobs[0].id,
      chosen = jobs[1].id;
    await page.route(`**/api/jobs/${slow}`, async (route) => {
      const response = await route.fetch();
      await new Promise((resolve) => setTimeout(resolve, 250));
      await route.fulfill({ response });
    });
    await page.locator("#history").selectOption(slow);
    await page.locator("#history").selectOption(chosen);
    await page.waitForFunction(
      (id) =>
        document
          .querySelector("#downloads a")
          ?.getAttribute("href")
          ?.includes(id),
      chosen,
    );
    await page.waitForLoadState("networkidle");
    assert.equal(await page.locator("#history").inputValue(), chosen);
    assert.ok(
      (
        await page.locator("#downloads a").first().getAttribute("href")
      ).includes(chosen),
    );
    await page.unrouteAll({ behavior: "wait" });
  }
  await page.locator("[data-task=generate]").click();
  await page.locator("#load-example").click();
  await page.waitForFunction(
    () =>
      document.querySelector("#pocket-confirm-title").textContent ===
      "口袋已确认",
  );
  await page.screenshot({
    path: path.join(root, "test-results/pages/desktop.png"),
  });
  assert.deepEqual(errors, []);
  console.log(
    "Passed: direct fragment/ring selection, scaffold selection, batch SDF export, actual task comparison and model page",
  );
} catch (error) {
  if (page) {
    console.error(await page.locator("#error").textContent());
    await page.screenshot({
      path: path.join(root, "test-results/pages/failure.png"),
      fullPage: true,
    });
  }
  throw error;
} finally {
  await browser.close();
}
