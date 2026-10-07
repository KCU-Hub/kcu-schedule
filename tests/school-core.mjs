import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizePortal,
  validateSchoolSnapshot,
  schoolCalendarEvents,
  schoolTime,
} from "../docs/core/school-schedule.js";
const item = {
  courseId: 101,
  courseName: "테스트 과목",
  cmId: 201,
  moduleType: "quiz",
  week: 5,
  startTime: "2026-09-28 12:00:00",
  endTime: "2026-10-12 23:59:00",
  isCompleted: "N",
  userId: "PRIVATE",
  token: "SECRET",
};
const payload = (overrides) => ({
  todos: [item],
  exam: [],
  attendance: [],
  ...overrides,
});
test("API timestamps and privacy allowlist survive a portable roundtrip", () => {
  const snapshot = normalizePortal(payload());
  assert.equal(snapshot.events[0].endsAt, "2026-10-12T14:59:00.000Z");
  assert.equal(snapshot.events[0].title, "5주차 퀴즈");
  assert.equal(schoolCalendarEvents(snapshot)[0].end, "2026-10-12");
  assert.doesNotMatch(JSON.stringify(snapshot), /PRIVATE|SECRET|userId|token/);
  assert.deepEqual(
    validateSchoolSnapshot(JSON.parse(JSON.stringify(snapshot))),
    snapshot,
  );
  assert.equal(schoolTime(1791817140), "2026-10-12T14:59:00.000Z");
});
test("same activity deduplicates and updates completion and deadline", () => {
  const result = normalizePortal(
    payload({
      todos: [
        item,
        { ...item, endTime: "2026-10-13T23:59:00+09:00", isCompleted: "Y" },
      ],
    }),
  );
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].completed, true);
  assert.equal(schoolCalendarEvents(result)[0].start, "2026-10-13");
});
test("exam and attendance keep their identity and Korean end date", () => {
  const result = normalizePortal(
    payload({
      todos: [],
      exam: [{ ...item, examTerm: "midtest" }],
      attendance: [
        {
          ...item,
          cmId: 0,
          moduleType: "vod",
          endTime: "2026-10-13T00:00:00+09:00",
        },
      ],
    }),
  );
  assert.equal(result.events[0].title, "중간고사");
  assert.equal(schoolCalendarEvents(result)[1].start, "2026-10-13");
});
test("unknown schemas, malformed dates, partial failures and unsafe URLs fail closed", () => {
  for (const raw of [
    {},
    { todos: [], exam: [] },
    payload({ todos: [{ ...item, endTime: "garbage" }] }),
    payload({ todos: [{ ...item, endTime: "2026-02-30 12:00:00" }] }),
    payload({ todos: [{ ...item, startTime: "2026-12-01 12:00:00" }] }),
  ])
    assert.throws(() => normalizePortal(raw));
  const snapshot = normalizePortal(payload());
  for (const url of [
    "javascript:alert(1)",
    "https://evil.example/course/view.php?id=1",
    "https://lms.koreacu.ac.kr/login/logout.php?id=1",
    "https://lms.koreacu.ac.kr/course/view.php?id=1&token=secret",
  ])
    assert.throws(() =>
      validateSchoolSnapshot({
        ...snapshot,
        events: [{ ...snapshot.events[0], url }],
      }),
    );
  assert.throws(() =>
    validateSchoolSnapshot({
      ...snapshot,
      events: [snapshot.events[0], snapshot.events[0]],
    }),
  );
});
test("empty authenticated snapshots are valid, malformed collections are not", () => {
  assert.equal(
    normalizePortal({ todos: [], exam: [], attendance: [] }).events.length,
    0,
  );
  assert.throws(() =>
    normalizePortal({ todos: [], exam: null, attendance: [] }),
  );
});
