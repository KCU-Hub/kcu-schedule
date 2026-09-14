// Requires Playwright and Chromium. Serve docs, then run:
// PAGES_TEST_URL=http://127.0.0.1:3011 node tests/pages.cjs
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const url = process.env.PAGES_TEST_URL || "http://127.0.0.1:3011";
const fixture = {
  events: [
    {
      uid: "fixture@kcu-schedule",
      subject: "2026학년도 장학금 신청",
      start: "2026-09-01",
      end: "2026-09-30",
      type: "R0201",
      type_label: "학사",
      dept: "학생지원",
    },
  ],
};
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.clock.install({ time: new Date("2026-09-14T12:00:00+09:00") });
    await page.route("**/kcu-schedule.json", (route) =>
      route.fulfill({ json: fixture }),
    );
    await page.route("**/seed", (route) =>
      route.fulfill({
        body: "<!doctype html><title>seed</title>",
        contentType: "text/html",
      }),
    );
    await page.goto(`${url}/seed`);
    await page.evaluate(async () => {
      const request = indexedDB.open("kcu-pages-notes", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("notes", { keyPath: "id" });
      const db = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const tx = db.transaction("notes", "readwrite");
      tx.objectStore("notes").put({
        id: "fixture@kcu-schedule",
        content: "기존 메모",
      });
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = reject;
      });
      db.close();
    });
    await page.goto(url);
    await page.locator(".day-cell.has-events").first().click();
    assert.equal(
      await page.locator(".note-editor textarea").inputValue(),
      "기존 메모",
    );
    await page.getByRole("button", { name: "삭제", exact: true }).click();
    await page
      .locator(".note-editor .note-status")
      .filter({ hasText: "삭제했습니다." })
      .waitFor();
    await page.reload();
    await page.locator(".day-cell.has-events").first().click();
    assert.equal(await page.locator(".note-editor textarea").inputValue(), "");
    await page
      .getByRole("button", { name: "☆ 일정 저장", exact: true })
      .click();
    await page.getByRole("button", { name: "★ 저장됨", exact: true }).waitFor();
    await page
      .locator(".note-editor textarea")
      .fill("<script>메모는 텍스트</script>");
    await page.getByRole("button", { name: "메모 저장", exact: true }).click();
    await page
      .locator(".note-editor .note-status")
      .filter({ hasText: "저장했습니다." })
      .waitFor();
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "＋ 개인 일정", exact: true })
      .click();
    await page.getByLabel("제목", { exact: true }).fill("과제 제출");
    await page.getByLabel("시작일", { exact: true }).fill("2026-09-17");
    await page.getByLabel("종료일", { exact: true }).fill("2026-09-18");
    await page.getByLabel("분류 이름 (선택)", { exact: true }).fill("과제");
    await page.getByRole("button", { name: "일정 저장", exact: true }).click();
    await page.locator("#feature-dialog").waitFor({ state: "hidden" });
    await page.reload();
    await page.getByRole("tab", { name: "주간", exact: true }).click();
    await page
      .locator(".week-event")
      .filter({ hasText: "과제 제출" })
      .first()
      .click();
    await page.getByRole("button", { name: "일정 수정", exact: true }).click();
    await page.getByLabel("제목", { exact: true }).fill("수정한 과제");
    await page.getByRole("button", { name: "일정 저장", exact: true }).click();
    await page.locator("#feature-dialog").waitFor({ state: "hidden" });
    const backup = await page.evaluate(async () =>
      (await import("./user-data.js")).makeBackup("test-password"),
    );
    const other = await browser.newPage();
    await other.route("**/kcu-schedule.json", (route) =>
      route.fulfill({ json: fixture }),
    );
    await other.goto(url);
    await other.locator(".day-cell.has-events").first().waitFor();
    await other.evaluate(async (backup) => {
      const store = await import("./user-data.js");
      let rejected = false;
      try {
        await store.importBackup(
          JSON.stringify(backup),
          "wrong-password",
          new Set(["fixture"]),
        );
      } catch {
        rejected = true;
      }
      if (!rejected) throw Error("Wrong password accepted");
      await store.importBackup(
        JSON.stringify(backup),
        "test-password",
        new Set(["fixture"]),
      );
      const data = await store.readData();
      if (
        !data.favorites.has("fixture") ||
        data.notes.get("fixture")?.content !==
          "<script>메모는 텍스트</script>" ||
        data.personal[0]?.title !== "수정한 과제"
      )
        throw Error("Backup lost data");
      await store.deletePersonal(data.personal[0].id);
      if ((await store.readData()).personal.length)
        throw Error("Personal delete failed");
    }, backup);
    for (const width of [390, 828, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
    }
    assert.deepEqual(errors, []);
    console.log(
      "PASS: existing note migration, deletion, favorites, notes, personal edit, week, encrypted backup/restore, responsive layout",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
