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
let page,
  releaseDelayedResponse = () => {};
try {
  const context = await browser.newContext({
    viewport: { width: 1536, height: 1024 },
    acceptDownloads: true,
  });
  context.setDefaultTimeout(30000);
  page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let releaseStartup;
  const startupGate = new Promise((resolve) => {
    releaseStartup = resolve;
  });
  await page.route("**/api/capabilities", async (route) => {
    await startupGate;
    await route.continue();
  });
  await page.goto(base, { waitUntil: "domcontentloaded" });
  assert.equal(
    await page.locator("#load-example").isDisabled(),
    true,
    "Input actions must wait for initialization, otherwise the late reset loses the loaded structure",
  );
  releaseStartup();
  await page.locator("#load-example:enabled").waitFor();
  await page.unroute("**/api/capabilities");
  assert.equal(await page.locator("#generate").isDisabled(), true);
  assert.equal(await page.locator("#protein-read").isVisible(), false);
  assert.equal(
    await page
      .locator(
        "#project, #models-view, #prepare-view, #settings-help, #expert-mode, #guided-mode, #reuse, #verify-model, .stepper",
      )
      .count(),
    0,
  );
  assert.deepEqual(
    await page.evaluate(() => {
      const seen = new Set();
      return [...document.querySelectorAll("[id]")]
        .map((el) => el.id)
        .filter((id) => {
          if (seen.has(id)) return true;
          seen.add(id);
          return false;
        });
    }),
    [],
  );
  await page.locator("#load-example").click();
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
  const contract = await (
    await context.request.get(`${base}/api/capabilities`)
  ).json();
  assert.equal(await page.locator("#model").count(), 1);
  assert.equal(
    await page.locator("#count").getAttribute("max"),
    String(contract.fields.count.maximum),
  );
  assert.equal(
    await page.locator("#model option").count(),
    contract.models.length,
  );
  await page.locator("#experience-mode").selectOption("expert");
  await page.locator("[data-preset=quick]").click();
  await page.locator("#atoms").fill("9999");
  await page.locator("[data-task=optimize]").click();
  assert.equal(await page.locator("#atoms").isVisible(), false);
  assert.equal(await page.locator("#atoms").isDisabled(), true);
  const projected = await page.evaluate(async () =>
    (await import("/assets/controls.js")).readOptions(),
  );
  assert.ok(
    !("atoms" in projected) &&
      !("steps" in projected) &&
      !("size_mode" in projected) &&
      !("count" in projected),
  );
  assert.equal(
    projected.population * projected.rounds,
    contract.tasks.optimize.presets.find(
      (p) => p.id === contract.default_preset,
    ).attempts,
  );
  await page.locator("[data-task=generate]").click();
  await page.locator("#experience-mode").selectOption("simple");
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
  await page.locator("[data-view=designs].nav-item").click();
  await page.route("**/api/pockets/inspect", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ detail: "口袋读取暂不可用" }),
    }),
  );
  await page.locator(`[data-design="${record.id}"]`).click();
  await page.locator("#error").waitFor({ state: "visible" });
  assert.ok(
    !(await page.locator("#notice").textContent()).includes("均已恢复"),
  );
  assert.equal(await page.locator("#save-draft").isDisabled(), true);
  await page.unrouteAll({ behavior: "wait" });
  await page.locator("[data-view=designs].nav-item").click();
  await page.locator(`[data-design="${record.id}"]`).click();
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
  await page.locator("[data-task=generate]").click();
  await page.locator("#prepare-open").click();
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
  await page.locator("#experience-mode").selectOption("expert");
  await page.locator("#fixed-atoms").fill("invalid");
  await page.locator("#fragment-pick").focus();
  assert.equal(
    await page.locator("#fixed-atoms").evaluate((el) => el.checkValidity()),
    false,
  );
  assert.equal(await page.locator("#generate").isDisabled(), true);
  await page.locator("#keep-scaffold").click();
  assert.equal(
    await page.locator("#fixed-atoms").evaluate((el) => el.checkValidity()),
    true,
  );
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
  await page.locator("[data-task=generate]").click();
  await page.locator("#nav-results").click();
  const jobs = await (await context.request.get(`${base}/api/jobs`)).json();
  if (jobs.length >= 2) {
    const slow = jobs[1].id,
      chosen = jobs[0].id;
    const gate = new Promise((resolve) => {
      releaseDelayedResponse = resolve;
    });
    const handlers = [];
    const intercepted = page.waitForRequest(
      (request) => request.url() === `${base}/api/jobs/${slow}`,
    );
    await page.route(`**/api/jobs/${slow}`, async (route) => {
      const handling = (async () => {
        const response = await route.fetch();
        await gate;
        await route.fulfill({ response });
      })();
      // Return any route failure to the main test instead of leaving a detached rejection.
      const observed = handling.then(
        () => null,
        (error) => error,
      );
      handlers.push(observed);
      await observed;
    });
    await page.locator("#history").selectOption(slow);
    await intercepted;
    await page.locator("#history").selectOption(chosen);
    await page.waitForFunction(
      (id) =>
        document
          .querySelector("#downloads a")
          ?.getAttribute("href")
          ?.includes(id),
      chosen,
    );
    releaseDelayedResponse();
    const routeFailure = (await Promise.all(handlers)).find(Boolean);
    if (routeFailure) throw routeFailure;
    await page.unrouteAll({ behavior: "wait" });
    await page.waitForLoadState("networkidle");
    assert.equal(await page.locator("#history").inputValue(), chosen);
    assert.ok(
      (
        await page.locator("#downloads a").first().getAttribute("href")
      ).includes(chosen),
    );
  }
  await page.locator("#nav-editor").click();
  await page.waitForFunction(
    () => !document.querySelector("#save-edit").disabled,
  );
  const editParent = await page.locator("#history").inputValue();
  await page.route("**/api/poses/inspect", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ detail: "预览解析暂时不可用" }),
    }),
  );
  const savedResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/jobs/${editParent}/edits`) &&
      response.request().method() === "POST",
  );
  await page.locator("#save-edit").click();
  const savedEdit = await (await savedResponse).json();
  assert.ok(savedEdit.id);
  await page.waitForFunction(() =>
    document
      .querySelector("#edit-message")
      .textContent.includes("编辑版已保存，但后续预览"),
  );
  const persistedJob = await (
    await context.request.get(`${base}/api/jobs/${editParent}`)
  ).json();
  assert.ok(persistedJob.edits.some((edit) => edit.id === savedEdit.id));
  await page.unrouteAll({ behavior: "wait" });
  await page
    .locator(".edit-row")
    .filter({ has: page.locator(`a[href$="/${savedEdit.id}.sdf"]`) })
    .getByRole("button")
    .click();
  await page.waitForFunction(() =>
    document.querySelector("#molecule-detail").textContent.includes("编辑版"),
  );
  assert.match(await page.locator("#selection-sync").innerText(), /已建立对应/);
  console.log(
    "Passed: saved edit survives preview failure and reopens from persisted history",
  );
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
  const unavailable = await context.newPage();
  await unavailable.route("**/api/capabilities", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ detail: "配置暂时无法读取" }),
    }),
  );
  await unavailable.goto(base, { waitUntil: "networkidle" });
  assert.equal(await unavailable.locator("#generate").isDisabled(), true);
  assert.equal(await unavailable.locator("#protein-read").isVisible(), false);
  assert.equal(await unavailable.locator("#error").isVisible(), true);
  await unavailable.close();
  await page.locator("[data-view=designs].nav-item").click();
  await page.locator("#new-design").click();
  assert.equal(await page.locator("#protein-name").innerText(), "尚未选择蛋白");
  assert.equal(await page.locator("#generate").isDisabled(), true);
  assert.equal(
    await page.locator("#current-design").innerText(),
    "未保存的设计",
  );
  assert.equal(
    await page.locator("#count").inputValue(),
    String(
      contract.tasks.generate.presets.find(
        (p) => p.id === contract.default_preset,
      ).options.count,
    ),
  );
  console.log(
    "Passed: direct fragment/ring selection, scaffold selection, batch SDF export, actual task comparison and model choices",
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
  releaseDelayedResponse();
  if (page) await page.unrouteAll({ behavior: "wait" });
  await browser.close();
}
