import assert from "node:assert/strict";
import { chromium } from "playwright";
import path from "node:path";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHANNEL
    ? { channel: process.env.PLAYWRIGHT_CHANNEL }
    : {}),
});
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  await mkdir("test-results/layout", { recursive: true });
  for (const [width, height] of [
    [1536, 1024],
    [1024, 900],
    [768, 1024],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto(process.env.DIFFSBDD_TEST_URL || "http://127.0.0.1:7865", {
      waitUntil: "networkidle",
    });
    assert.ok(
      (await page
        .locator("#pocket-confirm-title")
        .evaluate((el) => el.parentElement.clientWidth)) > 150,
      "Empty/loading status must not collapse into the hidden icon column",
    );
    await page.locator("#load-example").click();
    await page.waitForFunction(
      () => document.querySelector("#pocket-viewer").dataset.ready === "true",
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `Horizontal overflow at ${width}`,
    );
    await page.locator("#save-draft").focus();
    // The explicit sample click activates pointer modality; verify real keyboard focus.
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    assert.equal(
      await page
        .locator("#save-draft")
        .evaluate((el) => el === document.activeElement),
      true,
    );
    assert.notEqual(
      await page
        .locator("#save-draft")
        .evaluate((el) => getComputedStyle(el).outlineStyle),
      "none",
    );
    if (width === 390) {
      await page.locator("#mobile-menu").click();
      await page.locator("#nav-library").click();
      await page.locator("#library-view").waitFor({ state: "visible" });
      await page.locator("#mobile-menu").click();
      await page.locator('[data-task="generate"]').click();
      await page.waitForFunction(
        () =>
          document.querySelector("#pocket-confirm-title").textContent ===
          "口袋已确认",
      );
    }
    await page.screenshot({
      path: path.join("test-results/layout", `${width}.png`),
      fullPage: true,
    });
    console.log(`Passed: layout and navigation ${width}×${height}`);
  }
} finally {
  await browser.close();
}
