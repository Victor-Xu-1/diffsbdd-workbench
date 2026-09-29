import { installRendererProbe } from "./renderer-probe.mjs";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHANNEL
    ? { channel: process.env.PLAYWRIGHT_CHANNEL }
    : {}),
});
const page = await browser.newPage({ viewport: { width: 1536, height: 1024 } }),
  errors = [];
await installRendererProbe(page);
page.on("pageerror", (error) => errors.push(error.message));
try {
  await mkdir("test-results/workspaces", { recursive: true });
  await page.goto(process.env.DIFFSBDD_TEST_URL || "http://127.0.0.1:17865", {
    waitUntil: "networkidle",
  });
  await page.locator("#load-example").click();
  await page.waitForFunction(
    () =>
      document.querySelector("#pocket-confirm-title").textContent ===
      "口袋已确认",
  );
  assert.equal(await page.locator("#advanced-settings").isVisible(), false);
  const count = await page.locator("#count").inputValue();
  await page.locator("#experience-mode").selectOption("expert");
  assert.equal(await page.locator("#advanced-settings").isVisible(), true);
  await page.locator("#steps").fill("250");
  await page.locator("#experience-mode").selectOption("simple");
  assert.equal(await page.locator("#advanced-settings").isVisible(), false);
  assert.equal(await page.locator("#count").inputValue(), count);
  await page.locator("#experience-mode").selectOption("expert");
  assert.equal(await page.locator("#steps").inputValue(), "250");
  await page.locator("#steps").fill("99999");
  await page.locator("#experience-mode").selectOption("simple");
  assert.equal(
    await page.locator("#experience-mode").inputValue(),
    "expert",
    "Invalid hidden parameters must remain visible for correction",
  );
  await page.locator("#steps").fill("500");
  await page.locator("#experience-mode").selectOption("simple");
  for (const [view, selector] of [
    ["inspect", "[data-view=inspect]"],
    ["results", "#nav-results"],
    ["editor", "#nav-editor"],
    ["library", "#nav-library"],
    ["compare", "[data-view=compare]"],
    ["designs", "[data-view=designs].nav-item"],
  ]) {
    await page.locator(selector).click();
    await page.waitForFunction(
      (expected) => document.body.dataset.view === expected,
      view,
    );
    if (view === "inspect")
      await page.locator("#pocket-interactions summary").waitFor();
    if (view === "library")
      await page.locator("#library-content input").first().waitFor();
    if (view === "compare")
      await page.locator("#compare-jobs input").first().waitFor();
    if (view === "designs") await page.locator("#saved-designs").waitFor();
    assert.equal(await page.evaluate(() => document.body.dataset.view), view);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    assert.equal(await page.locator(".nav-item.active").count(), 1);
    if (view === "inspect") {
      assert.equal(await page.locator("#generation-panel").isVisible(), false);
      assert.equal(await page.locator("#action-bar").isVisible(), false);
      const rect = await page.locator("#pocket-viewer").boundingBox();
      assert.ok(rect.width > 850 && rect.height > 500);
    }
    if (view === "results") {
      await page.waitForFunction(
        () => !document.querySelector("#save-edit").disabled,
      );
      assert.equal(await page.locator("#editor").isVisible(), false);
      const rect = await page.locator("#viewer").boundingBox();
      assert.ok(rect.width > 1150 && rect.height > 500);
    }
    if (view === "editor") {
      await page.waitForFunction(
        () =>
          document.querySelector("#editor").getAttribute("aria-busy") ===
          "false",
      );
      assert.equal(await page.locator("#editor").isVisible(), true);
      assert.equal(await page.locator("#viewer").isVisible(), true);
      assert.equal(
        await page.locator("#results-title").innerText(),
        "结构编辑与设计反馈",
      );
      await page.waitForFunction(() => {
        const viewer = window.testViewers.viewer,
          canvas = viewer.getCanvas();
        const points = viewer.modelToScreen(
          viewer.getModel(1).selectedAtoms({}),
        );
        const width =
          Math.max(...points.map((p) => p.x)) -
          Math.min(...points.map((p) => p.x));
        return width > canvas.clientWidth * 0.32;
      });
      const cameraBefore = await page.evaluate(() =>
        window.testViewers.viewer.getView().slice(4),
      );
      const smilesBefore = await page.evaluate(() =>
        document.querySelector("#editor").contentWindow.ketcher.getSmiles(),
      );
      await page.locator("#nav-results").click();
      await page.locator("#nav-editor").click();
      await page.waitForFunction(
        () =>
          document.querySelector("#editor").getAttribute("aria-busy") ===
          "false",
      );
      assert.equal(
        await page.evaluate(() =>
          document.querySelector("#editor").contentWindow.ketcher.getSmiles(),
        ),
        smilesBefore,
      );
      assert.deepEqual(
        await page.evaluate(() => window.testViewers.viewer.getView().slice(4)),
        cameraBefore,
        "Changing layout must preserve the user rotation",
      );
      const drawing = await page.evaluate(() => {
        const win = document.querySelector("#editor").contentWindow;
        return [...win.document.querySelectorAll("svg text")]
          .filter((node) => /^[NOFSH]/.test(node.textContent))
          .map((node) => {
            const r = node.getBoundingClientRect();
            return {
              text: node.textContent,
              x: r.x,
              right: r.right,
              width: r.width,
              view: win.innerWidth,
            };
          });
      });
      assert.ok(drawing.length > 0);
      assert.ok(
        drawing.every(
          (item) =>
            item.width > 3 && item.x > 35 && item.right < item.view - 35,
        ),
        "Chemical atom labels must be readable and clear of side toolbars",
      );
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `test-results/workspaces/${view}.png`,
      fullPage: true,
    });
  }
  assert.deepEqual(errors, []);
  console.log(
    "Passed: every sidebar workspace, enlarged previews, shared editor state, simple/expert parameter preservation and invalid-field recovery",
  );
} finally {
  await browser.close();
}
