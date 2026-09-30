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
  assert.equal(
    await page.locator('[data-view="inspect"]').count(),
    0,
    "Standalone preview must not duplicate the design workspace",
  );
  const taskHeadings = new Set();
  for (const task of ["generate", "inpaint", "diversify", "optimize"]) {
    await page.locator(`[data-task="${task}"]`).click();
    taskHeadings.add(await page.locator("#generation-heading").innerText());
    assert.equal(
      await page.locator("#task-source").isVisible(),
      task !== "generate",
    );
    assert.equal(
      await page.locator("#inpaint-controls").isVisible(),
      task === "inpaint",
    );
    assert.equal(
      await page.locator("#objective").isVisible(),
      task === "optimize",
    );
    assert.equal(
      await page.locator("#change_steps").isVisible(),
      ["diversify", "optimize"].includes(task),
    );
    assert.equal(
      await page.locator("#rounds").isVisible(),
      task === "optimize",
    );
    const settings = await page.locator("#generation-panel").boundingBox();
    const shared = await page.locator(".design-top").boundingBox();
    assert.ok(
      settings.y < shared.y,
      "Task operations must precede shared protein context",
    );
  }
  assert.equal(taskHeadings.size, 4, "Each task needs its own operation panel");
  await page.locator('[data-task="generate"]').click();
  await page.locator("#size_mode").selectOption("fixed");
  assert.ok(
    await page.locator("#atoms").isVisible(),
    "Custom size is editable in simple mode",
  );
  await page.locator("#atoms").fill("32");
  const options = await page.evaluate(async () =>
    (await import("/assets/controls.js")).readOptions(),
  );
  assert.equal(options.atoms, 32);
  assert.equal(options.task, "generate");
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
    if (view === "results") {
      assert.ok(await page.locator(".status-panel").isVisible());
      await page.waitForFunction(
        () => !document.querySelector("#save-edit").disabled,
      );
      assert.equal(await page.locator("#editor").isVisible(), false);
      const rect = await page.locator("#viewer").boundingBox();
      assert.ok(rect.width > 1150 && rect.height > 500);
    }
    if (view === "editor") {
      assert.equal(await page.locator(".status-panel").isVisible(), false);
      await page.evaluate(() => {
        const ketcher = document.querySelector("#editor").contentWindow.ketcher;
        const layout = ketcher.layout.bind(ketcher);
        ketcher.layout = async () => {
          ketcher.layout = layout;
          await new Promise((resolve) => {
            window.releaseEditorLayout = resolve;
          });
          return layout();
        };
      });
      await page
        .locator("#history")
        .selectOption(await page.locator("#history").inputValue());
      await page.waitForFunction(() => !!window.releaseEditorLayout);
      assert.equal(
        await page.locator("#editor").getAttribute("aria-busy"),
        "true",
      );
      assert.equal(
        await page
          .locator("#editor")
          .evaluate((frame) => getComputedStyle(frame).pointerEvents),
        "none",
      );
      assert.ok(await page.locator("#save-edit").isDisabled());
      await page.evaluate(() => window.releaseEditorLayout());
      await page.waitForFunction(
        () => !document.querySelector("#save-edit").disabled,
      );
      await page.waitForFunction(
        () =>
          document.querySelector("#editor").getAttribute("aria-busy") ===
          "false",
      );
      assert.equal(await page.locator("#editor").isVisible(), true);
      assert.equal(await page.locator("#viewer").isVisible(), true);
      assert.ok(
        await page.evaluate(() =>
          [
            ...document
              .querySelector("#editor")
              .contentWindow.ketcher.editor.struct()
              .atoms.values(),
          ].every((atom) => Math.abs(atom.pp.z || 0) < 1e-6),
        ),
        "The sketcher must use a real 2D layout, not projected 3D coordinates",
      );
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
        "Chemical atom labels must be readable and clear of side toolbars: " +
          JSON.stringify(drawing),
      );
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `test-results/workspaces/${view}.png`,
      fullPage: true,
    });
  }
  for (const task of ["generate", "inpaint", "diversify", "optimize"]) {
    await page.locator(`[data-task="${task}"]`).click();
    if (task === "inpaint")
      await page
        .locator("#initial-sdf")
        .setInputFiles("tests/fixtures/generated_3rfm.sdf");
    await page.waitForFunction(
      () =>
        document.querySelector("#pocket-confirm-title").textContent ===
        "口袋已确认",
    );
    await page.locator("#experience-mode").selectOption("simple");
    if (task === "inpaint") {
      await page.locator("#keep-scaffold").click();
      assert.ok((await page.locator("#fixed-atoms").inputValue()).length > 0);
    }
    if (task === "diversify" || task === "optimize") {
      await page.locator("[data-preset=explore]").click();
      assert.equal(await page.locator("#change_steps").inputValue(), "150");
      await page.locator("#change_steps").fill("80");
    }
    if (task === "optimize") {
      await page.locator("#objective").selectOption("sa");
      await page.locator("#rounds").fill("4");
    }
    const requestOptions = await page.evaluate(async () =>
      (await import("/assets/controls.js")).readOptions(),
    );
    assert.equal(requestOptions.task, task);
    assert.equal("objective" in requestOptions, task === "optimize");
    assert.equal("fixed_atoms" in requestOptions, task === "inpaint");
    if (task === "diversify" || task === "optimize")
      assert.equal(requestOptions.change_steps, 80);
    if (task === "optimize") {
      assert.equal(requestOptions.objective, "sa");
      assert.equal(requestOptions.rounds, 4);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `test-results/workspaces/${task}-simple.png`,
      fullPage: true,
    });
    await page.locator("#experience-mode").selectOption("expert");
    assert.deepEqual(
      await page.evaluate(async () =>
        (await import("/assets/controls.js")).readOptions(),
      ),
      requestOptions,
    );
    const canvas = await page.locator("#pocket-viewer").boundingBox();
    assert.ok(
      canvas.width > 850 && canvas.height > 500,
      `Large preview required for ${task}`,
    );
    assert.ok(await page.locator("#advanced-settings").isVisible());
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `test-results/workspaces/${task}-expert.png`,
      fullPage: true,
    });
  }
  await page.locator('[data-task="diversify"]').click();
  await page.locator("#choose-result-source").click();
  assert.equal(
    await page.evaluate(() => document.body.dataset.view),
    "results",
  );
  assert.ok(
    await page.locator("#use-original").isVisible(),
    "Selecting a source must not require opening the editor",
  );
  await page.locator("#use-original:enabled").waitFor();
  assert.equal(await page.locator("#continue-task").inputValue(), "diversify");
  await page.route("**/api/poses/inspect", (route) =>
    route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({ detail: "起始结构校验失败，请重新选择候选。" }),
    }),
  );
  await page.locator("#use-original").click();
  await page.locator("#error").waitFor({ state: "visible" });
  assert.equal(
    await page.evaluate(() => document.body.dataset.view),
    "results",
    "Invalid source must not enter the design workflow",
  );
  assert.ok(await page.locator("#use-original").isDisabled());
  await page.unroute("**/api/poses/inspect");
  await page.locator("#molecules button").first().click();
  await page.locator("#use-original:enabled").waitFor();
  await page.locator("#use-original").click();
  await page.waitForFunction(
    () =>
      document.body.dataset.view === "design" &&
      document.querySelector("#pocket-confirm-title").textContent ===
        "口袋已确认",
  );
  assert.equal(await page.locator("#task").inputValue(), "diversify");
  assert.ok(await page.locator("#result-source").isVisible());
  assert.equal(await page.locator("#initial-input").isVisible(), false);
  assert.ok(
    await page.locator("#choose-result-source").isVisible(),
    "The selected source must remain replaceable",
  );
  assert.equal(
    await page.locator("#generation-heading").innerText(),
    "结构变体与改动幅度",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Passed: every sidebar workspace, enlarged previews, shared editor state, simple/expert parameter preservation and invalid-field recovery",
  );
} finally {
  await browser.close();
}
