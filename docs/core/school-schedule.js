// Platform-independent contract shared by the website, extension and app adapters.
export const SCHOOL_SCHEMA = "kcu-school-schedule";
export const SCHOOL_ORIGIN = "https://portal.koreacu.ac.kr";
const MAX_EVENTS = 3000;
const invalid = () =>
  new Error("학교 일정 형식이 올바르지 않습니다. 포털에서 다시 가져와 주세요.");
const text = (value, max = 200) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const identifier = (value) =>
  /^[a-zA-Z0-9_-]{1,80}$/.test(String(value ?? "")) ? String(value) : "";

export function schoolTime(value) {
  if (value == null || value === "") return null;
  let input = value;
  if (typeof value === "number" || /^\d{10,13}$/.test(value)) {
    const number = Number(value);
    input = number < 1e12 ? number * 1000 : number;
  } else if (typeof value === "string") {
    const calendar =
      /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(value);
    if (
      !calendar ||
      new Date(Date.UTC(+calendar[1], +calendar[2] - 1, +calendar[3]))
        .toISOString()
        .slice(0, 10) !== value.slice(0, 10) ||
      +calendar[4] > 23 ||
      +calendar[5] > 59 ||
      +(calendar[6] || 0) > 59
    )
      throw invalid();
    // Portal wall-clock timestamps are Korean time, regardless of device timezone.
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(value))
      input = value.replace(" ", "T") + "+09:00";
    else if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(
        value,
      )
    )
      throw invalid();
  } else throw invalid();
  const date = new Date(input);
  if (
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() < 2000 ||
    date.getUTCFullYear() > 2100
  )
    throw invalid();
  return date.toISOString();
}
export const schoolDay = (time) =>
  new Date(new Date(time).getTime() + 9 * 3600000).toISOString().slice(0, 10);
export const formatSchoolTime = (time) =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(time));

export function normalizePortal(
  payload,
  capturedAt = new Date().toISOString(),
) {
  if (
    !payload ||
    !["todos", "exam", "attendance"].every((key) => Array.isArray(payload[key]))
  )
    throw invalid();
  if (
    payload.todos.length + payload.exam.length + payload.attendance.length >
    MAX_EVENTS
  )
    throw invalid();
  const events = new Map();
  for (const [collection, kind] of [
    ["todos", "activity"],
    ["exam", "exam"],
    ["attendance", "attendance"],
  ]) {
    for (const item of payload[collection]) {
      if (!item || typeof item !== "object") throw invalid();
      const courseId = identifier(item.courseId),
        cmId = identifier(item.cmId);
      const moduleType = identifier(item.moduleType)?.toLowerCase();
      const courseName = text(item.courseName);
      const startsAt = schoolTime(item.startTime),
        endsAt = schoolTime(item.endTime);
      if (
        !courseId ||
        !courseName ||
        !endsAt ||
        (startsAt && startsAt > endsAt)
      )
        throw invalid();
      const week = identifier(item.week);
      const title =
        kind === "exam"
          ? { midtest: "중간고사", finaltest: "기말고사" }[item.examTerm] ||
            "시험"
          : kind === "attendance"
            ? `${week ? week + "주차 " : ""}출석`
            : `${week ? week + "주차 " : ""}${{ assign: "과제", quiz: "퀴즈", forum: "토론" }[moduleType] || "학습활동"}`;
      const activityId =
        cmId && cmId !== "0"
          ? cmId
          : identifier(item.idx) ||
            `${moduleType}-${week}-${identifier(item.examTerm)}`;
      if (!activityId || activityId === "--") throw invalid();
      const id = `school:${kind}:${courseId}:${activityId}`;
      const url =
        ["assign", "quiz", "forum"].includes(moduleType) && cmId && cmId !== "0"
          ? `https://lms.koreacu.ac.kr/mod/${moduleType}/view.php?id=${cmId}`
          : `https://lms.koreacu.ac.kr/course/view.php?id=${courseId}`;
      const completed =
        item.isCompleted === "Y" || item.isCompleted === true
          ? true
          : item.isCompleted === "N" || item.isCompleted === false
            ? false
            : null;
      // Explicit allowlist: never retain userId, profile, cookies, tokens or raw response.
      events.set(id, {
        id,
        courseName,
        title,
        kind,
        startsAt,
        endsAt,
        completed,
        url,
      });
    }
  }
  return validateSchoolSnapshot({
    schema: SCHOOL_SCHEMA,
    version: 1,
    capturedAt,
    events: [...events.values()],
  });
}

export function validateSchoolSnapshot(input) {
  if (
    input?.schema !== SCHOOL_SCHEMA ||
    input.version !== 1 ||
    !Array.isArray(input.events) ||
    input.events.length > MAX_EVENTS
  )
    throw invalid();
  const capturedAt = schoolTime(input.capturedAt);
  if (!capturedAt || Date.parse(capturedAt) > Date.now() + 300000)
    throw invalid();
  const ids = new Set();
  const events = input.events.map((event) => {
    if (
      !event ||
      !/^school:(activity|exam|attendance):[\w-]+:[\w-]+$/.test(event.id) ||
      ids.has(event.id)
    )
      throw invalid();
    ids.add(event.id);
    if (
      !["activity", "exam", "attendance"].includes(event.kind) ||
      (event.completed !== null && typeof event.completed !== "boolean")
    )
      throw invalid();
    const startsAt = schoolTime(event.startsAt),
      endsAt = schoolTime(event.endsAt);
    const courseName = text(event.courseName),
      title = text(event.title);
    if (!courseName || !title || !endsAt || (startsAt && startsAt > endsAt))
      throw invalid();
    let url;
    try {
      url = new URL(event.url);
    } catch {
      throw invalid();
    }
    if (
      url.origin !== "https://lms.koreacu.ac.kr" ||
      url.username ||
      url.password ||
      url.hash ||
      !/^\/(course|mod\/(assign|quiz|forum))\/view\.php$/.test(url.pathname) ||
      !/^\?id=[\w-]+$/.test(url.search)
    )
      throw invalid();
    return {
      id: event.id,
      courseName,
      title,
      kind: event.kind,
      startsAt,
      endsAt,
      completed: event.completed,
      url: url.href,
    };
  });
  return {
    schema: SCHOOL_SCHEMA,
    version: 1,
    capturedAt,
    events: events.sort(
      (a, b) => a.endsAt.localeCompare(b.endsAt) || a.id.localeCompare(b.id),
    ),
  };
}

export function schoolCalendarEvents(snapshot) {
  if (!snapshot) return [];
  return snapshot.events.map((event) => ({
    ...event,
    uid: event.id,
    subject: `${event.courseName} · ${event.title}`,
    // Deadlines appear on their due date; the full availability window is in details.
    start: schoolDay(event.endsAt),
    end: schoolDay(event.endsAt),
    type: "school",
    type_label: { activity: "학습활동", exam: "시험", attendance: "출석" }[
      event.kind
    ],
    description: `${event.startsAt ? formatSchoolTime(event.startsAt) + " ~ " : ""}${formatSchoolTime(event.endsAt)} (한국시간) · ${event.completed === null ? "완료 상태 확인 필요" : event.completed ? "완료" : "미완료"}`,
  }));
}
export function combineCalendarEvents(official, personal, schoolSnapshot) {
  return [
    ...official,
    ...personal.map((event) => ({
      ...event,
      uid: event.id,
      subject: event.title,
      type: "personal",
      type_label: "개인",
      end: event.end || event.start,
    })),
    ...schoolCalendarEvents(schoolSnapshot),
  ];
}
