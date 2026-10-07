// Isolated fixtures: no real school account, cookies or private data are used.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const url = process.env.PAGES_TEST_URL || "http://127.0.0.1:3012";
const fixture = {
  todos: [
    {
      courseId: 101,
      courseName: "테스트 과목",
      cmId: 201,
      moduleType: "quiz",
      week: 5,
      startTime: "2026-10-01 12:00:00",
      endTime: "2026-10-12 23:59:00",
      isCompleted: "N",
      userId: "PRIVATE-STUDENT",
    },
  ],
  exam: [],
  attendance: [],
};
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.clock.install({ time: new Date("2026-10-07T12:00:00+09:00") });
    await page.goto(url);
    await page.locator(".day-cell").first().waitFor();
    const snapshot = await page.evaluate(
      async (raw) =>
        (await import("./core/school-schedule.js")).normalizePortal(raw),
      fixture,
    );
    await page
      .getByRole("button", { name: "학교 일정 가져오기", exact: true })
      .click();
    await page
      .getByLabel("학교 일정 파일")
      .setInputFiles({
        name: "school.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(snapshot)),
      });
    await page
      .getByRole("button", { name: "학교 일정 반영", exact: true })
      .click();
    await page
      .getByText("1개 학교 일정을 반영했습니다.", { exact: true })
      .waitFor();
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "학교 개인 일정", exact: true })
      .click();
    await page.getByRole("tab", { name: "목록", exact: true }).click();
    await page
      .locator("#event-list")
      .getByRole("button")
      .filter({ hasText: "테스트 과목" })
      .click();
    await page.getByText(/23:59.*한국시간/).waitFor();
    assert.equal(
      await page
        .getByRole("link", { name: "학교 강의실에서 확인" })
        .getAttribute("href"),
      "https://lms.koreacu.ac.kr/mod/quiz/view.php?id=201",
    );
    await page
      .getByRole("button", { name: "☆ 일정 저장", exact: true })
      .click();
    await page.getByRole("button", { name: "★ 저장됨", exact: true }).waitFor();
    await page.keyboard.press("Escape");
    await page.reload();
    await page.getByText(/학교 일정 1개 · 마지막 가져오기/).waitFor();
    await page.evaluate(async () => {
      const store = await import("./user-data.js");
      const data = await store.readData();
      await store.savePersonal({
        title: "유지할 개인 일정",
        start: "2026-10-14",
      });
      const updated = structuredClone(data.school);
      updated.events[0].endsAt = "2026-10-13T14:59:00.000Z";
      updated.events[0].completed = true;
      await store.saveSchoolSnapshot(updated);
      const after = await store.readData();
      if (
        after.school.events.length !== 1 ||
        after.school.events[0].endsAt !== updated.events[0].endsAt
      )
        throw Error("Resync did not replace");
      try {
        await store.saveSchoolSnapshot({ schema: "wrong" });
        throw Error("Invalid accepted");
      } catch (e) {
        if (e.message === "Invalid accepted") throw e;
      }
      if ((await store.readData()).school.events.length !== 1)
        throw Error("Invalid import cleared data");
    });
    const backup = await page.evaluate(async () =>
      (await import("./user-data.js")).makeBackup("test-password"),
    );
    const second = await browser.newPage();
    await second.goto(url);
    await second.locator(".day-cell").first().waitFor();
    await second.evaluate(async (backup) => {
      const store = await import("./user-data.js");
      await store.importBackup(
        JSON.stringify(backup),
        "test-password",
        new Set(),
      );
      const data = await store.readData();
      if (
        !data.school.events[0].completed ||
        !data.favorites.has(data.school.events[0].id)
      )
        throw Error("School backup lost state");
      await store.clearSchoolSnapshot();
      const cleared = await store.readData();
      if (
        cleared.school ||
        [...cleared.favorites].some((id) => id.startsWith("school:")) ||
        cleared.personal.length !== 1
      )
        throw Error("School disconnect damaged personal data");
    }, backup);
    await page.reload();
    await page
      .getByRole("button", { name: "학교 일정 가져오기", exact: true })
      .click();
    await page
      .getByLabel("학교 일정 파일")
      .setInputFiles({
        name: "bad.json",
        mimeType: "application/json",
        buffer: Buffer.from("{}"),
      });
    await page.getByText(/학교 일정 형식이 올바르지/).waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "학교 일정 반영", exact: true })
        .isDisabled(),
      true,
    );
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "학교 개인 일정", exact: true })
      .click();
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      if (process.env.QA_OUTPUT_DIR) {
        await fs.mkdir(process.env.QA_OUTPUT_DIR, { recursive: true });
        await page.screenshot({
          path: path.join(process.env.QA_OUTPUT_DIR, `school-${width}.png`),
          fullPage: true,
        });
      }
    }
    assert.deepEqual(errors, []);
    // Exercise the same generated document_start capture in a separate school fixture origin.
    const portal = await browser.newPage();
    await portal.addInitScript({
      path: path.resolve(__dirname, "../extension/capture.js"),
    });
    await portal.route("https://portal.koreacu.ac.kr/**", (route) => {
      if (new URL(route.request().url()).pathname === "/api/widgets/todoList")
        return route.fulfill({ json: fixture });
      return route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: '<!doctype html><title>School fixture</title><button id="load">조회</button><script>document.querySelector("button").onclick=()=>fetch("/api/widgets/todoList",{headers:{Authorization:"Bearer SECRET"}})</script>',
      });
    });
    await portal.goto("https://portal.koreacu.ac.kr/ko/dashboard");
    await portal.getByRole("button", { name: "조회" }).click();
    await portal.waitForFunction(
      () => window[Symbol.for("kcu.schedule.snapshot.v1")]?.events.length === 1,
    );
    const captured = await portal.evaluate(
      () => window[Symbol.for("kcu.schedule.snapshot.v1")],
    );
    assert.doesNotMatch(
      JSON.stringify(captured),
      /PRIVATE|SECRET|Bearer|userId/,
    );
    await portal.route(
      "https://portal.koreacu.ac.kr/api/widgets/todoList",
      (route) => route.fulfill({ status: 401, body: "Unauthorized" }),
    );
    await portal.getByRole("button", { name: "조회" }).click();
    assert.equal(
      await portal.evaluate(
        () => window[Symbol.for("kcu.schedule.snapshot.v1")],
      ),
      null,
    );
    console.log(
      "PASS: import, deadline, persistence, replacement, invalid input, encrypted portability, disconnect, responsive UI, capture and expired session",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
