import { installRendererProbe } from "./renderer-probe.mjs";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, readFile } from "node:fs/promises";
const base = process.env.DIFFSBDD_TEST_URL || "http://127.0.0.1:7865";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHANNEL
    ? { channel: process.env.PLAYWRIGHT_CHANNEL }
    : {}),
});
const page = await browser.newPage({ viewport: { width: 1536, height: 1024 } });
await installRendererProbe(page);
try {
  await page.goto(base, { waitUntil: "networkidle" });
  const jobs = await (await page.request.get(base + "/api/jobs")).json();
  let candidate;
  for (const item of jobs.filter((job) => job.status === "completed")) {
    const job = await (
      await page.request.get(`${base}/api/jobs/${item.id}`)
    ).json();
    if (job.report?.valid && job.report?.settings?.trajectory) {
      candidate = job;
      break;
    }
  }
  assert.ok(
    candidate,
    "Need a labelled trajectory fixture or completed trajectory job",
  );
  await page.locator("#nav-results").click();
  await page.locator("#history").selectOption(candidate.id);
  await page.waitForFunction(
    () => !document.getElementById("save-edit").disabled,
  );
  const mol = await (
    await page.request.get(`${base}/api/jobs/${candidate.id}/molecules/0.mol`)
  ).text();
  const counts = mol.split(/\r?\n/)[3];
  const expected = {
    atoms: Number(counts.slice(0, 3)),
    bonds: Number(counts.slice(3, 6)),
  };
  const actual = () =>
    page.evaluate(() => {
      const atoms = window.testViewers.viewer.getModel(1).selectedAtoms({});
      return {
        atoms: atoms.length,
        bonds: atoms.reduce((sum, a) => sum + a.bonds.length, 0) / 2,
      };
    });
  assert.deepEqual(await actual(), expected);
  if (await page.locator("#trajectory-play").count()) {
    await page.locator("#trajectory-play").click();
    await page.waitForFunction(
      () => Number(document.getElementById("trajectory-frame").value) > 1,
    );
  }
  assert.deepEqual(
    await actual(),
    expected,
    "Final molecular graph must never be replaced by an unbonded diffusion cloud",
  );
  assert.equal(await page.locator("#trajectory-play").count(), 0);
  console.log(
    "Passed: complete final molecule remains in result viewer; diffusion cloud has no preview entrypoint",
  );
  await page.locator("[data-task=generate]").click();
  const loaded = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/pockets/inspect") &&
      response.request().method() === "POST",
  );
  await page.locator("#load-example").click();
  const reference = await (await loaded).json();
  await page.waitForFunction(() =>
    document
      .querySelector("#pocket-interactions summary")
      ?.textContent.includes("氢键候选 1"),
  );
  const graph = await page.evaluate(() => {
    const atoms = window.testViewers["pocket-viewer"]
      .getModel(1)
      .selectedAtoms({});
    return {
      atoms: atoms.length,
      bonds: atoms.reduce((sum, a) => sum + a.bonds.length, 0) / 2,
      double:
        atoms.reduce(
          (sum, a) => sum + a.bondOrder.filter((order) => order === 2).length,
          0,
        ) / 2,
    };
  });
  assert.deepEqual(
    graph,
    { atoms: 14, bonds: 15, double: 4 },
    "Caffeine must retain complete CCD bonds in the actual renderer",
  );
  const framing = await page.evaluate(() => {
    const v = window.testViewers["pocket-viewer"],
      points = v.modelToScreen(v.getModel(1).selectedAtoms({})),
      offset = v.canvasOffset(),
      canvas = v.getCanvas();
    return {
      width:
        Math.max(...points.map((p) => p.x)) -
        Math.min(...points.map((p) => p.x)),
      canvasWidth: canvas.clientWidth,
      inside: points.every(
        (p) =>
          p.x > offset.left + 10 &&
          p.x < offset.left + canvas.clientWidth - 10 &&
          p.y > offset.top + 10 &&
          p.y < offset.top + canvas.clientHeight - 10,
      ),
    };
  });
  assert.ok(
    framing.inside,
    "Every ligand atom must remain inside the actual canvas",
  );
  assert.ok(
    framing.width > framing.canvasWidth * 0.18,
    "The intact ligand must be large enough to read, not a tiny centered thumbnail",
  );
  assert.equal(
    await page.evaluate(
      () =>
        window.testViewers["pocket-viewer"]
          .getModel(0)
          .selectedAtoms({ hetflag: true }).length,
    ),
    0,
  );
  await page.locator("#pocket-interactions summary").click();
  assert.match(
    await page.locator("#pocket-interactions").innerText(),
    /ASN A:253/,
  );
  assert.match(
    await page.locator("#pocket-interactions").innerText(),
    /PHE A:168/,
  );
  const download = page.waitForEvent("download");
  await page
    .locator("#pocket-interactions")
    .getByRole("button", { name: "下载相互作用记录" })
    .click();
  const report = JSON.parse(
    await readFile(await (await download).path(), "utf8"),
  );
  assert.equal(report.engine, "ProLIF 2.2.2");
  assert.ok(
    report.interactions.every(
      (item) => item.distance > 0 && item.start.length === 3,
    ),
  );
  await page.locator("#pocket-interactions summary").click();
  await mkdir("test-results/molecular", { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page
    .locator("#pocket-viewer canvas")
    .screenshot({ path: "test-results/molecular/verified-site.png" });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/molecular/workbench.png",
    fullPage: true,
  });
  const sceneAtoms = () =>
    page.evaluate(() =>
      window.testViewers["pocket-viewer"]
        .getModel(1)
        .selectedAtoms({})
        .map((a) => [a.elem, a.x, a.y, a.z, a.bonds, a.bondOrder]),
    );
  const canonicalScene = await sceneAtoms();
  for (const preset of ["contacts", "surface", "protein", "site"]) {
    await page.locator('[data-figure-preset="pocket"]').selectOption(preset);
    await page.waitForFunction(
      () => document.querySelector("#pocket-viewer").dataset.ready === "true",
    );
    assert.deepEqual(
      await sceneAtoms(),
      canonicalScene,
      "Display changes must preserve every ligand atom, bond and coordinate",
    );
    const hasCartoon = await page.evaluate(() =>
      window.testViewers["pocket-viewer"]
        .getModel(0)
        .selectedAtoms({})
        .some((a) => a.style?.cartoon),
    );
    assert.equal(hasCartoon, ["protein", "site"].includes(preset));
    const surface = await page.evaluate(() =>
      Object.values(window.testViewers["pocket-viewer"].surfaces).flatMap(
        (parts) =>
          Array.from(parts, (part) => ({
            finished: part.finished,
            vertices: part.geo.geometryGroups.reduce(
              (sum, group) => sum + group.vertices,
              0,
            ),
          })),
      ),
    );
    if (preset === "surface") {
      assert.ok(
        surface.length > 0 &&
          surface.every((part) => part.finished && part.vertices > 0),
        "Surface preset must produce finished native molecular surface geometry",
      );
    } else assert.equal(surface.length, 0);
    await page
      .locator("#pocket-viewer")
      .evaluate((el) =>
        window.scrollBy(0, el.getBoundingClientRect().top - 90),
      );
    await page
      .locator("#pocket-viewer canvas")
      .screenshot({ path: `test-results/molecular/preset-${preset}.png` });
  }
  const pdb = (await readFile("examples/3rfm.pdb", "utf8")).replaceAll(
    "CFF",
    "ZZZ",
  );
  await page.locator("#protein").setInputFiles({
    name: "unknown-ligand.pdb",
    mimeType: "chemical/x-pdb",
    buffer: Buffer.from(pdb),
  });
  await page.waitForFunction(
    () => document.querySelector("#fetch-component").hidden === false,
  );
  assert.equal(await page.locator("#generate").isDisabled(), true);
  assert.equal(
    await page.evaluate(
      () =>
        window.testViewers["pocket-viewer"].getModel(1).selectedAtoms({})
          .length,
    ),
    0,
  );
  await page.locator("#reference-sdf").setInputFiles({
    name: "complete-ligand.sdf",
    mimeType: "chemical/x-mdl-sdfile",
    buffer: Buffer.from(reference.reference + "\n$$$$\n"),
  });
  await page.waitForFunction(
    () =>
      document.querySelector("#pocket-confirm-title").textContent ===
      "口袋已确认",
  );
  assert.equal(
    await page.evaluate(
      () =>
        window.testViewers["pocket-viewer"].getModel(1).selectedAtoms({})
          .length,
    ),
    14,
  );
  console.log(
    "Passed: actual CCD bond orders, distinct protein/ligand objects, typed interactions/export, unknown-component gate and SDF recovery",
  );
} catch (error) {
  await mkdir("test-results/molecular", { recursive: true });
  await page.screenshot({ path: "test-results/molecular/failure.png" });
  throw error;
} finally {
  await browser.close();
}
