const { chromium } = require("playwright");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
(async () => {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "kcu-extension-profile-"),
  );
  const ext = path.resolve(__dirname, "../extension");
  const context = await chromium.launchPersistentContext(dir, {
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
    ignoreDefaultArgs: ["--disable-extensions"],
  });
  try {
    const page = await context.newPage();
    await page.route("https://portal.koreacu.ac.kr/**", (route) =>
      route.fulfill(
        new URL(route.request().url()).pathname.startsWith("/api/")
          ? { json: { todos: [], exam: [], attendance: [] } }
          : {
              contentType: "text/html; charset=utf-8",
              body: '<!doctype html><title>Portal fixture</title><button>load</button><script>document.querySelector("button").onclick=()=>fetch("/api/widgets/todoList")</script>',
            },
      ),
    );
    await page.goto("https://portal.koreacu.ac.kr/ko/dashboard");
    await page.getByRole("button", { name: "load" }).click();
    await page.waitForFunction(
      () =>
        window[Symbol.for("kcu.schedule.snapshot.v1")]?.schema ===
        "kcu-school-schedule",
      {},
      { timeout: 5000 },
    );
    console.log(
      "PASS: installed MV3 extension captures portal response at document_start",
    );
    const manager = await context.newPage();
    await manager.goto("chrome://extensions");
    const item = manager
      .locator("extensions-item")
      .filter({ hasText: "KCU 일정 가져오기" });
    const id = await item.getAttribute("id");
    console.log("Extension loaded:", !!id);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await page.bringToFront();
    await popup.locator("#export").evaluate((button) => button.click());

    await popup
      .locator("#download")
      .waitFor({ state: "visible", timeout: 5000 });
    const downloaded = popup.waitForEvent("download");
    await popup.locator("#download").click();
    const file = await downloaded;
    const snapshot = JSON.parse(await fs.readFile(await file.path(), "utf8"));
    assert.equal(snapshot.schema, "kcu-school-schedule");
    assert.equal(snapshot.events.length, 0);
    console.log(
      "PASS: actual extension popup exports a validated portable file",
    );
  } finally {
    await context.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
