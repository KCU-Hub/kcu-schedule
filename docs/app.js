import * as storage from "./user-data.js";

const TYPE_CLASS = { R0201: "academic", R0203: "event" };
const state = {
  events: [],
  viewYear: null,
  viewMonth: null,
  activeTab: "calendar",
  scope: "all",
  category: "all",
  tag: "",
  includePast: false,
  weekDate: new Date(),
}; // viewMonth: 0-based

let notesDB = false;
let userData = {
  favorites: new Set(),
  notes: new Map(),
  tags: new Map(),
  personal: [],
};
let schoolEvents = [];
const notes = new Map();
const noteKey = storage.eventId;
async function refreshData() {
  userData = await storage.readData();
  notes.clear();
  userData.notes.forEach((record, id) => notes.set(id, record.content));
  state.events = [
    ...schoolEvents,
    ...userData.personal.map((event) => ({
      ...event,
      uid: event.id,
      subject: event.title,
      type: "personal",
      type_label: "개인",
      end: event.end || event.start,
    })),
  ];
}
async function loadNotes() {
  try {
    await storage.openData();
    await refreshData();
    notesDB = true;
  } catch {
    document.getElementById("storage-status").textContent =
      "브라우저 저장소를 사용할 수 없어 개인 기능이 제한됩니다. 학사일정은 계속 확인할 수 있습니다.";
  }
  document
    .querySelectorAll("[data-needs-storage]")
    .forEach((el) => (el.disabled = !notesDB));
}
async function writeNote(id, content) {
  await storage.setNote(id, content);
  await refreshData();
}
function attachNoteEditor(container, ev) {
  const id = noteKey(ev);
  const editor = document.createElement("div");
  editor.className = "note-editor";
  const label = document.createElement("label");
  const input = document.createElement("textarea");
  input.id = `event-note-${document.querySelectorAll(".note-editor").length}`;
  label.htmlFor = input.id;
  label.textContent = "내 메모";
  input.value = notes.get(id) || "";
  input.maxLength = 5000;
  input.placeholder = "준비할 것, 제출할 서류 등을 적어두세요.";
  const help = document.createElement("p");
  help.className = "note-help";
  help.textContent =
    "이 기기의 브라우저에만 저장됩니다. 다른 기기와 동기화되지 않으며, 브라우저 데이터를 지우면 삭제됩니다.";
  const actions = document.createElement("div");
  actions.className = "note-actions";
  const save = document.createElement("button");
  save.type = "button";
  save.className = "note-save";
  save.textContent = "메모 저장";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "삭제";
  const status = document.createElement("span");
  status.className = "note-status";
  status.setAttribute("role", "status");
  function controls() {
    input.disabled = !notesDB;
    save.disabled = !notesDB;
    remove.disabled = !notesDB || !notes.has(id);
  }
  controls();
  if (!notesDB)
    status.textContent =
      "메모 저장소를 열 수 없습니다. 브라우저 저장 설정을 확인해 주세요.";
  input.addEventListener("input", () => {
    status.textContent = "저장하지 않은 변경사항";
  });
  async function persist(content) {
    save.disabled = remove.disabled = input.disabled = true;
    status.textContent = "저장 중…";
    try {
      await writeNote(id, content);
      input.value = content;
      status.textContent = content ? "저장했습니다." : "메모를 삭제했습니다.";
      renderAll();
    } catch {
      status.textContent =
        "저장하지 못했습니다. 내용을 복사해 보관하고 다시 시도해 주세요.";
    } finally {
      controls();
    }
  }
  save.addEventListener("click", () => persist(input.value.trim()));
  remove.addEventListener("click", () => persist(""));
  actions.append(save, remove, status);
  editor.append(label, input, help, actions);
  container.appendChild(editor);
}

const pad2 = (n) => String(n).padStart(2, "0");
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const parseISO = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const fmtISO = (d) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fmtDateKR = (iso) => iso.split("-").join(".");
const fmtRangeKR = (ev) =>
  ev.start === ev.end
    ? fmtDateKR(ev.start)
    : `${fmtDateKR(ev.start)} ~ ${fmtDateKR(ev.end)}`;
const fmtDateFull = (d) => {
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
};
// 셀 안에서는 폭이 좁아 앞부분만 보이는데, 거의 모든 일정이 "2026학년도"·"2026년"으로
// 시작해 그대로 두면 전부 똑같이 잘려 구분이 안 된다. 연도는 달력이 이미 알려주므로 뗀다.
const shortLabel = (subject) =>
  subject.replace(/^\s*\d{4}\s*(학년도|년)\s*/, "");

const escapeHTML = (s) => {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
};
const eventsOn = (iso) =>
  filteredEvents().filter((e) => e.start <= iso && iso <= e.end);

function switchTab(name) {
  state.activeTab = name;
  ["calendar", "week", "list"].forEach((tab) => {
    document
      .getElementById(`tab-${tab}`)
      .classList.toggle("active", name === tab);
    document
      .getElementById(`tab-${tab}`)
      .setAttribute("aria-selected", String(name === tab));
    document
      .getElementById(`view-${tab}`)
      .classList.toggle("active", name === tab);
  });
  try {
    localStorage.setItem("kcu-pages-view", name);
  } catch {}
  if (name === "week") renderWeek();
}

function renderList(items, emptyText) {
  const ul = document.getElementById("event-list");
  ul.innerHTML = "";
  if (!items.length) {
    const li = document.createElement("li");
    li.className = "empty-msg";
    li.textContent = emptyText;
    ul.appendChild(li);
    return;
  }
  items.forEach((ev) => {
    const li = document.createElement("li");
    li.innerHTML = `
        <span class="date">${fmtRangeKR(ev)}</span>
        <span class="subject">${escapeHTML(ev.subject)}${notes.has(noteKey(ev)) ? '<small class="note-marker">메모</small>' : ""}</span>
        <span class="tag ${TYPE_CLASS[ev.type] || "academic"}">${escapeHTML(ev.type_label || ev.type)}</span>${userData.favorites.has(noteKey(ev)) ? "<small class=note-marker>저장됨</small>" : ""}${tagMarkup(ev)}`;
    li.tabIndex = 0;
    li.setAttribute("role", "button");
    li.addEventListener("click", () => openDayModal(ev.start, [ev]));
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openDayModal(ev.start, [ev]);
      }
    });
    ul.appendChild(li);
  });
}

function updateListView() {
  const items = filteredEvents()
    .filter((e) => state.includePast || e.end >= todayISO())
    .sort((a, b) => a.start.localeCompare(b.start));
  const scopeLabel =
    state.scope === "saved"
      ? "저장한 일정"
      : state.scope === "personal"
        ? "개인 일정"
        : "다가오는 일정";
  document.getElementById("list-title").textContent =
    `${document.getElementById("search-input").value.trim() ? "검색 결과" : scopeLabel} (${items.length}건)`;
  renderList(
    items,
    state.scope === "saved"
      ? "저장한 일정이 없습니다. 일정 상세에서 저장해 보세요."
      : "조건에 맞는 일정이 없습니다. 분류를 바꾸거나 지난 일정 포함을 선택해 보세요.",
  );
}

function renderCalendar() {
  const y = state.viewYear,
    m = state.viewMonth;
  document.getElementById("month-label").textContent = `${y}년 ${m + 1}월`;

  const firstWeekday = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const today = todayISO();

  const grid = document.getElementById("cal-grid");
  grid.innerHTML = "";

  for (let i = 0; i < firstWeekday; i++) {
    const blank = document.createElement("div");
    blank.className = "day-cell empty";
    grid.appendChild(blank);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const cellDate = new Date(y, m, d);
    const iso = fmtISO(cellDate);
    const dow = cellDate.getDay();
    const dayEvents = eventsOn(iso);

    const cell = document.createElement("div");
    cell.className = [
      "day-cell",
      dow === 0 ? "sun" : "",
      dow === 6 ? "sat" : "",
      iso === today ? "today" : "",
      dayEvents.some((ev) => notes.has(noteKey(ev))) ? "has-note" : "",
      dayEvents.length ? "has-events" : "",
    ]
      .filter(Boolean)
      .join(" ");

    const num = document.createElement("div");
    num.className = "day-num";
    num.textContent = String(d);
    cell.appendChild(num);

    dayEvents.slice(0, 2).forEach((ev) => {
      const chip = document.createElement("div");
      chip.className = `chip ${TYPE_CLASS[ev.type] || "academic"}`;
      chip.textContent = shortLabel(ev.subject);
      if (notes.has(noteKey(ev))) {
        const marker = document.createElement("small");
        marker.className = "note-marker";
        marker.textContent = "메모 ";
        chip.prepend(marker);
        chip.title = "메모 있음 · " + ev.subject;
      }
      chip.title = (notes.has(noteKey(ev)) ? "메모 있음 · " : "") + ev.subject;
      cell.appendChild(chip);
    });
    if (dayEvents.length > 2) {
      const more = document.createElement("div");
      more.className = "more-chip";
      more.textContent = `+${dayEvents.length - 2}개 더`;
      cell.appendChild(more);
    }

    {
      cell.tabIndex = 0;
      cell.setAttribute("role", "button");
      cell.setAttribute("aria-label", `${d}일, 일정 ${dayEvents.length}건`);
      const openThis = () => openDayModal(iso, dayEvents);
      cell.addEventListener("click", openThis);
      cell.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openThis();
        }
      });
    }

    grid.appendChild(cell);
  }
}

function openDayModal(iso, dayEvents) {
  const modal = document.getElementById("day-modal");
  document.getElementById("modal-date").textContent = fmtDateFull(
    parseISO(iso),
  );
  const container = document.getElementById("modal-events");
  container.innerHTML = "";
  if (!dayEvents.length) {
    const empty = document.createElement("p");
    empty.className = "note-help";
    empty.textContent = "이 날짜에는 표시할 일정이 없습니다.";
    container.appendChild(empty);
  }
  dayEvents.forEach((ev) => {
    const div = document.createElement("div");
    div.className = "modal-event";
    div.innerHTML = `
        <span class="tag ${TYPE_CLASS[ev.type] || "academic"}">${escapeHTML(ev.type_label || ev.type)}</span>
        <div class="subject">${escapeHTML(ev.subject)}</div>
        <div class="meta">${fmtRangeKR(ev)}${ev.dept ? " · " + escapeHTML(ev.dept) : ""}</div>`;
    container.appendChild(div);
    attachDetailTools(div, ev);
    attachNoteEditor(div, ev);
  });
  const add = button("이 날짜에 개인 일정 추가", () => openPersonal(null, iso));
  add.disabled = !notesDB;
  container.appendChild(add);
  if (!modal.open) modal.showModal();
}

function goToDate(iso) {
  const d = parseISO(iso);
  state.viewYear = d.getFullYear();
  state.viewMonth = d.getMonth();
  switchTab("calendar");
  renderCalendar();
  const dayEvents = eventsOn(iso);
  if (dayEvents.length) openDayModal(iso, dayEvents);
}

function initTabs() {
  document
    .getElementById("tab-calendar")
    .addEventListener("click", () => switchTab("calendar"));
  document
    .getElementById("tab-week")
    .addEventListener("click", () => switchTab("week"));
  document
    .getElementById("tab-list")
    .addEventListener("click", () => switchTab("list"));
}

function initCalendarNav() {
  document.getElementById("prev-month").addEventListener("click", () => {
    state.viewMonth--;
    if (state.viewMonth < 0) {
      state.viewMonth = 11;
      state.viewYear--;
    }
    renderCalendar();
  });
  document.getElementById("next-month").addEventListener("click", () => {
    state.viewMonth++;
    if (state.viewMonth > 11) {
      state.viewMonth = 0;
      state.viewYear++;
    }
    renderCalendar();
  });
  document.getElementById("today-btn").addEventListener("click", () => {
    const d = new Date();
    state.viewYear = d.getFullYear();
    state.viewMonth = d.getMonth();
    renderCalendar();
  });
  document.getElementById("modal-close").addEventListener("click", () => {
    document.getElementById("day-modal").close();
  });
  document.getElementById("day-modal").addEventListener("click", (e) => {
    if (e.target.id === "day-modal") e.target.close();
  });
}

function initSubscribeDialog() {
  const dialog = document.getElementById("subscribe-dialog");
  document.getElementById("subscribe-toggle").addEventListener("click", () => {
    if (typeof dialog.showModal === "function") dialog.showModal();
  });
  document
    .getElementById("subscribe-close")
    .addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => {
    if (e.target.id === "subscribe-dialog") dialog.close();
  });
  document.getElementById("copy-btn").addEventListener("click", () => {
    const url = document.getElementById("ics-url").textContent;
    navigator.clipboard.writeText(url).then(() => {
      const btn = document.getElementById("copy-btn");
      const original = btn.textContent;
      btn.textContent = "복사됨!";
      setTimeout(() => {
        btn.textContent = original;
      }, 1500);
    });
  });
}

function initSearch() {
  const toggle = document.getElementById("search-toggle");
  const box = document.getElementById("search-box");
  const input = document.getElementById("search-input");

  toggle.addEventListener("click", () => {
    const opening = box.hidden;
    box.hidden = !opening;
    toggle.setAttribute("aria-expanded", String(opening));
    if (opening) {
      input.focus();
    } else if (input.value) {
      input.value = "";
      renderAll();
    }
  });

  input.addEventListener("input", () => {
    renderAll();
    if (input.value.trim()) switchTab("list");
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") toggle.click();
  });
}

async function init() {
  initTabs();
  initCalendarNav();
  initSubscribeDialog();
  initSearch();
  initFeatures();

  const now = new Date();
  state.viewYear = now.getFullYear();
  state.viewMonth = now.getMonth();

  try {
    const res = await fetch("kcu-schedule.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    schoolEvents = data.events || [];
    state.events = schoolEvents;
  } catch (err) {
    document.getElementById("event-list").innerHTML =
      '<li class="status-msg">일정을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</li>';
    document.getElementById("storage-status").textContent =
      "학교 일정을 불러오지 못했습니다. 새로고침해 다시 시도해 주세요. 저장된 개인 일정은 계속 사용할 수 있습니다.";
  }

  await loadNotes();
  renderAll();
  try {
    const saved = localStorage.getItem("kcu-pages-view");
    if (["calendar", "week", "list"].includes(saved)) switchTab(saved);
  } catch {}
}

function button(text, action, className = "btn") {
  const el = document.createElement("button");
  el.type = "button";
  el.className = className;
  el.textContent = text;
  el.addEventListener("click", action);
  return el;
}
function textElement(tag, text, className = "") {
  const el = document.createElement(tag);
  el.textContent = text;
  el.className = className;
  return el;
}
function field(labelText, type, value = "", options = {}) {
  const wrap = document.createElement("label");
  wrap.className = "form-field";
  wrap.append(document.createTextNode(labelText));
  const input = document.createElement(
    type === "textarea" ? "textarea" : "input",
  );
  if (type !== "textarea") input.type = type;
  input.value = value;
  Object.assign(input, options);
  wrap.append(input);
  return { wrap, input };
}
const tagOf = (event) =>
  userData.tags.get(noteKey(event)) ||
  (event.tagLabel ? { label: event.tagLabel, color: event.tagColor } : null);
function categoryOf(event) {
  if (event.type === "personal") return "personal";
  if (/고사|시험/.test(event.subject)) return "exam";
  if (/성적/.test(event.subject)) return "notice";
  if (/신청|납부/.test(event.subject)) return "registration";
  if (/휴일|휴무|방학/.test(event.subject)) return "holiday";
  return "academic";
}
function filteredEvents() {
  const query = document
    .getElementById("search-input")
    .value.trim()
    .toLocaleLowerCase();
  return state.events.filter((event) => {
    const id = noteKey(event),
      tag = tagOf(event);
    return (
      (state.scope !== "saved" || userData.favorites.has(id)) &&
      (state.scope !== "personal" || event.type === "personal") &&
      (state.category === "all" || categoryOf(event) === state.category) &&
      (!state.tag || tag?.label === state.tag) &&
      (!query ||
        [
          event.subject,
          event.description,
          event.dept,
          notes.get(id),
          tag?.label,
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase()
          .includes(query))
    );
  });
}
function tagMarkup(event) {
  const tag = tagOf(event);
  const color = /^#[0-9a-f]{6}$/i.test(tag?.color || "")
    ? tag.color
    : "#317d6c";
  return tag
    ? `<small class="custom-tag" style="border-left:3px solid ${color}">${escapeHTML(tag.label)}</small>`
    : "";
}
function categories() {
  const groups = new Map();
  state.events.forEach((event) => {
    const tag = tagOf(event);
    if (tag)
      groups.set(tag.label, {
        ...tag,
        count: (groups.get(tag.label)?.count || 0) + 1,
      });
  });
  return [...groups.values()];
}
function renderAll() {
  if (state.tag && !categories().some((tag) => tag.label === state.tag))
    state.tag = "";
  renderCalendar();
  updateListView();
  renderWeek();
  document.getElementById("saved-count").textContent =
    userData.favorites.size || "";
  const select = document.getElementById("tag-filter");
  select.replaceChildren(
    new Option("전체", ""),
    ...categories().map(
      (tag) => new Option(`${tag.label} (${tag.count})`, tag.label),
    ),
  );
  if (state.tag && !categories().some((tag) => tag.label === state.tag))
    state.tag = "";
  select.value = state.tag;
  document.getElementById("reset-filters").hidden =
    state.scope === "all" &&
    state.category === "all" &&
    !state.tag &&
    !document.getElementById("search-input").value;
}
async function runAction(control, status, action) {
  control.disabled = true;
  status.textContent = "처리 중…";
  try {
    const message = await action();
    await refreshData();
    renderAll();
    status.textContent = message || "저장했습니다.";
  } catch (error) {
    status.textContent =
      error.message || "처리하지 못했습니다. 다시 시도해 주세요.";
  } finally {
    control.disabled = !notesDB;
  }
}
function attachDetailTools(container, event) {
  const id = noteKey(event),
    actions = textElement("div", "", "detail-actions"),
    status = textElement("p", "", "note-status");
  status.setAttribute("role", "status");
  const saved = () => userData.favorites.has(id);
  const favorite = button(saved() ? "★ 저장됨" : "☆ 일정 저장", async () => {
    await runAction(favorite, status, async () => {
      await storage.setFavorite(id, !saved());
    });
    favorite.textContent = saved() ? "★ 저장됨" : "☆ 일정 저장";
    favorite.setAttribute("aria-pressed", String(saved()));
  });
  favorite.setAttribute("aria-pressed", String(saved()));
  favorite.disabled = !notesDB;
  actions.append(favorite);
  if (event.type === "personal") {
    const edit = button("일정 수정", () =>
      openPersonal(userData.personal.find((e) => e.id === id)),
    );
    edit.disabled = !notesDB;
    actions.append(edit);
    if (event.description)
      container.append(
        textElement("p", event.description, "event-description"),
      );
    const overlaps = schoolEvents.filter(
      (e) => e.start <= event.end && e.end >= event.start,
    );
    if (overlaps.length)
      container.append(
        textElement(
          "p",
          `같은 기간 학사일정 ${overlaps.length}건: ${overlaps.map((e) => shortLabel(e.subject)).join(" · ")}`,
          "note-help",
        ),
      );
  }
  container.append(actions, status);
  const details = document.createElement("details");
  details.className = "tag-editor";
  const tag = tagOf(event);
  details.append(
    textElement("summary", tag ? `내 분류 · ${tag.label}` : "내 분류 지정"),
  );
  const name = field("분류 이름", "text", tag?.label || "", { maxLength: 24 }),
    color = field("분류 색상", "color", tag?.color || "#317d6c");
  const listId = `category-suggestions-${id}`;
  const list = document.createElement("datalist");
  list.id = listId;
  categories().forEach((t) => list.append(new Option(t.label)));
  name.input.setAttribute("list", listId);
  const save = button("분류 저장", () =>
    runAction(save, status, async () => {
      await storage.setTag(id, name.input.value, color.input.value);
      // A personal event can carry a category inside its own record too.
      if (event.type === "personal") {
        const current = userData.personal.find((e) => e.id === id);
        await storage.savePersonal({
          ...current,
          tagLabel: "",
          tagColor: color.input.value,
        });
      }
      details.querySelector("summary").textContent = name.input.value.trim()
        ? `내 분류 · ${name.input.value.trim()}`
        : "내 분류 지정";
    }),
  );
  const clear = button("분류 해제", () => {
    name.input.value = "";
    save.click();
  });
  [name.input, color.input, save, clear].forEach(
    (el) => (el.disabled = !notesDB),
  );
  details.append(name.wrap, color.wrap, list, save, clear);
  container.append(details);
}
function featureDialog(title) {
  document.getElementById("day-modal").close();
  const modal = document.getElementById("feature-dialog");
  document.getElementById("feature-title").textContent = title;
  const content = document.getElementById("feature-content");
  content.replaceChildren();
  if (!modal.open) modal.showModal();
  return content;
}
function openPersonal(record = null, date = todayISO()) {
  const content = featureDialog(record ? "개인 일정 수정" : "개인 일정 추가");
  const form = document.createElement("form");
  form.className = "personal-form";
  const title = field("제목", "text", record?.title || "", {
    required: true,
    maxLength: 80,
  });
  const start = field("시작일", "date", record?.start || date, {
    required: true,
  });
  const end = field("종료일", "date", record?.end || record?.start || date, {
    required: true,
  });
  const description = field(
    "상세 내용",
    "textarea",
    record?.description || "",
    { maxLength: 2000 },
  );
  const currentTag = record ? userData.tags.get(record.id) : null;
  const tag = field(
    "분류 이름 (선택)",
    "text",
    currentTag?.label || record?.tagLabel || "",
    { maxLength: 24 },
  );
  const color = field(
    "분류 색상",
    "color",
    currentTag?.color || record?.tagColor || "#317d6c",
  );
  const status = textElement("p", "", "note-status");
  status.setAttribute("role", "status");
  const save = button("일정 저장", () => {}, "btn primary");
  save.type = "submit";
  const hint = textElement(
    "p",
    "이 브라우저에만 저장됩니다. 기기를 옮길 때는 백업을 이용하세요.",
    "note-help",
  );
  const conflicts = textElement("p", "", "note-help");
  function updateConflicts() {
    const found = schoolEvents.filter(
      (e) => e.start <= end.input.value && e.end >= start.input.value,
    );
    conflicts.textContent = found.length
      ? `이 기간과 겹치는 학사일정 ${found.length}건이 있습니다.`
      : "";
    end.input.min = start.input.value;
  }
  start.input.addEventListener("change", updateConflicts);
  end.input.addEventListener("change", updateConflicts);
  updateConflicts();
  form.append(
    title.wrap,
    start.wrap,
    end.wrap,
    description.wrap,
    tag.wrap,
    color.wrap,
    conflicts,
    hint,
    save,
    status,
  );
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    runAction(save, status, async () => {
      const saved = await storage.savePersonal({
        ...record,
        title: title.input.value,
        start: start.input.value,
        end: end.input.value,
        description: description.input.value,
        tagLabel: tag.input.value,
        tagColor: color.input.value,
      });
      if (record) await storage.setTag(record.id, "", color.input.value);
      await refreshData();
      document.getElementById("feature-dialog").close();
      const d = parseISO(saved.start);
      state.viewYear = d.getFullYear();
      state.viewMonth = d.getMonth();
      state.weekDate = d;
      return record ? "일정을 수정했습니다." : "일정을 추가했습니다.";
    });
  });
  if (record) {
    const remove = button("일정 삭제", () => {
      remove.hidden = true;
      confirmation.hidden = false;
    });
    const confirmation = textElement("div", "", "delete-confirm");
    confirmation.hidden = true;
    const yes = button("삭제 확인", () =>
      runAction(yes, status, async () => {
        await storage.deletePersonal(record.id);
        document.getElementById("feature-dialog").close();
      }),
    );
    confirmation.append(
      textElement("p", "이 일정과 연결된 메모·저장·분류를 삭제할까요?"),
      yes,
      button("취소", () => {
        confirmation.hidden = true;
        remove.hidden = false;
      }),
    );
    form.append(remove, confirmation);
  }
  content.append(form);
  title.input.focus();
}
function openCategoryManager() {
  const content = featureDialog("개인 분류 관리");
  content.append(
    textElement(
      "p",
      "이름과 색상을 바꾸면 이 분류를 사용하는 모든 일정에 반영됩니다.",
      "note-help",
    ),
  );
  const groups = categories();
  if (!groups.length)
    content.append(
      textElement(
        "p",
        "일정 상세에서 분류를 지정하면 여기에 나타납니다.",
        "note-help",
      ),
    );
  groups.forEach((group) => {
    const row = textElement("div", "", "category-row");
    const name = field(
      `분류 이름 (${group.count}개 일정)`,
      "text",
      group.label,
      { maxLength: 24 },
    );
    const color = field("색상", "color", group.color);
    const status = textElement("p", "", "note-status");
    status.setAttribute("role", "status");
    const save = button("변경 저장", () =>
      runAction(save, status, async () => {
        if (!name.input.value.trim()) throw Error("분류 이름을 입력해 주세요.");
        await storage.changeCategory(
          group.label,
          name.input.value,
          color.input.value,
        );
        group.label = name.input.value.trim();
      }),
    );
    const remove = button("분류 삭제", () =>
      runAction(remove, status, async () => {
        await storage.changeCategory(group.label, "", group.color);
        row.remove();
      }),
    );
    row.append(name.wrap, color.wrap, save, remove, status);
    content.append(row);
  });
}
function openManager() {
  const content = featureDialog("내 일정 관리");
  content.append(
    textElement(
      "p",
      `저장 ${userData.favorites.size}개 · 메모 ${notes.size}개 · 개인 일정 ${userData.personal.length}개`,
      "note-help",
    ),
  );
  content.append(
    textElement(
      "p",
      "개인 데이터는 이 브라우저에만 보관됩니다. 다른 기기에서는 백업 파일을 가져와 이어서 사용할 수 있습니다.",
      "note-help",
    ),
  );
  const actions = textElement("div", "", "detail-actions");
  const personal = button("개인 일정 추가", () => openPersonal()),
    categories = button("개인 분류 관리", openCategoryManager);
  personal.disabled = categories.disabled = !notesDB;
  actions.append(personal, categories);
  content.append(actions);
  const transfer = textElement("section", "", "manager-section");
  transfer.append(textElement("h4", "백업 · 복원"));
  const password = field("백업 비밀번호 (선택, 8자 이상)", "password", "", {
    autocomplete: "new-password",
  });
  transfer.append(
    password.wrap,
    textElement(
      "p",
      "비밀번호를 입력하면 암호화합니다. 복원할 때도 같은 비밀번호가 필요합니다. 로컬 버전에서 만든 백업도 가져올 수 있습니다.",
      "note-help",
    ),
  );
  const status = textElement("p", "", "note-status");
  status.setAttribute("role", "status");
  const backup = button("백업 내려받기", () =>
    runAction(backup, status, async () => {
      const data = await storage.makeBackup(password.input.value);
      storage.download(
        JSON.stringify(data, null, 2),
        `kcu-calendar-${password.input.value ? "encrypted-" : ""}backup-${todayISO()}.json`,
      );
      return "백업 파일을 내려받았습니다.";
    }),
  );
  const file = field("복원할 백업 파일", "file");
  file.input.accept = ".json,application/json";
  const restore = button("백업 복원", () =>
    runAction(restore, status, async () => {
      const selected = file.input.files[0];
      if (!selected) throw Error("백업 파일을 선택해 주세요.");
      if (selected.size > 10 * 1024 * 1024)
        throw Error("10MB 이하의 백업 파일을 선택해 주세요.");
      return storage.importBackup(
        await selected.text(),
        password.input.value,
        new Set(schoolEvents.map(noteKey)),
      );
    }),
  );
  backup.disabled = restore.disabled = !notesDB;
  transfer.append(
    backup,
    file.wrap,
    textElement(
      "p",
      "기존 데이터에 합칩니다. 같은 일정의 메모·분류는 백업 내용으로 바뀝니다.",
      "note-help",
    ),
    restore,
    status,
  );
  content.append(transfer);
  const exportSection = textElement("section", "", "manager-section");
  exportSection.append(textElement("h4", "캘린더 내보내기"));
  const exporting = filteredEvents().filter(
    (e) =>
      state.activeTab !== "list" || state.includePast || e.end >= todayISO(),
  );
  exportSection.append(
    textElement(
      "p",
      `현재 필터에 맞는 ${exporting.length}개 일정과 개인 메모·분류를 내보냅니다. 월간·주간 보기에서는 다른 달의 일정도 포함합니다.`,
      "note-help",
    ),
  );
  const download = button("ICS 내려받기", () =>
    storage.exportCalendar(exporting, userData),
  );
  download.disabled = !exporting.length;
  const google = button("Google Calendar로 가져오기", () => {
    storage.exportCalendar(exporting, userData);
    window.open(
      "https://calendar.google.com/calendar/u/0/r/settings/export",
      "_blank",
      "noopener",
    );
  });
  google.disabled = !exporting.length;
  exportSection.append(download, google);
  content.append(exportSection);
  const appearance = textElement("section", "", "manager-section");
  appearance.append(textElement("h4", "화면 설정"));
  const label = textElement("label", "테마 ", "form-field"),
    select = document.createElement("select");
  select.append(
    new Option("시스템 설정", "system"),
    new Option("밝게", "light"),
    new Option("어둡게", "dark"),
  );
  select.setAttribute("aria-label", "테마");
  select.value = document.documentElement.dataset.theme || "system";
  select.addEventListener("change", () => {
    document.documentElement.dataset.theme = select.value;
    try {
      localStorage.setItem("kcu-pages-theme", select.value);
    } catch {}
  });
  label.append(select);
  appearance.append(label);
  const accentLabel = textElement("label", "강조 색상 ", "form-field");
  const accent = document.createElement("select");
  accent.append(
    new Option("버건디", "burgundy"),
    new Option("민트", "mint"),
    new Option("퍼플", "purple"),
  );
  accent.setAttribute("aria-label", "강조 색상");
  accent.value = document.documentElement.dataset.accent || "burgundy";
  accent.addEventListener("change", () => {
    document.documentElement.dataset.accent = accent.value;
    try {
      localStorage.setItem("kcu-pages-accent", accent.value);
    } catch {}
  });
  accentLabel.append(accent);
  appearance.append(accentLabel);
  content.append(appearance);
}
function renderWeek() {
  const start = new Date(state.weekDate);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  document.getElementById("week-label").textContent =
    `${start.getMonth() + 1}.${start.getDate()} – ${end.getMonth() + 1}.${end.getDate()}`;
  const container = document.getElementById("week-days");
  container.replaceChildren();
  for (let i = 0; i < 7; i++) {
    const date = new Date(start);
    date.setDate(date.getDate() + i);
    const iso = fmtISO(date),
      events = eventsOn(iso);
    const day = textElement(
      "section",
      "",
      `week-day ${iso === todayISO() ? "is-today" : ""}`,
    );
    const heading = button(
      `${date.getDate()} ${["일", "월", "화", "수", "목", "금", "토"][i]}`,
      () => openDayModal(iso, events),
      "week-date",
    );
    day.append(heading);
    const items = textElement("div", "", "week-events");
    if (!events.length)
      items.append(textElement("p", "일정 없음", "note-help"));
    events.forEach((event) => {
      const item = button("", () => openDayModal(iso, [event]), "week-event");
      item.append(
        textElement("small", fmtRangeKR(event)),
        textElement("span", shortLabel(event.subject)),
      );
      if (userData.favorites.has(noteKey(event)))
        item.append(textElement("small", "★ 저장됨"));
      if (notes.has(noteKey(event))) item.append(textElement("small", "메모"));
      const tag = tagOf(event);
      if (tag) item.append(textElement("small", tag.label, "custom-tag"));
      items.append(item);
    });
    day.append(items);
    container.append(day);
  }
}
function initFeatures() {
  document.querySelectorAll("[data-scope]").forEach((control) =>
    control.addEventListener("click", () => {
      state.scope = control.dataset.scope;
      document.querySelectorAll("[data-scope]").forEach((el) => {
        el.classList.toggle("selected", el === control);
        el.setAttribute("aria-pressed", String(el === control));
      });
      renderAll();
    }),
  );
  document.getElementById("category-filter").addEventListener("change", (e) => {
    state.category = e.target.value;
    renderAll();
  });
  document.getElementById("tag-filter").addEventListener("change", (e) => {
    state.tag = e.target.value;
    renderAll();
  });
  document.getElementById("include-past").addEventListener("change", (e) => {
    state.includePast = e.target.checked;
    updateListView();
  });
  document.getElementById("reset-filters").addEventListener("click", () => {
    state.scope = "all";
    state.category = "all";
    state.tag = "";
    document.getElementById("search-input").value = "";
    document.getElementById("category-filter").value = "all";
    document.querySelector("[data-scope=all]").click();
  });
  document
    .getElementById("personal-add")
    .addEventListener("click", () => openPersonal());
  document.getElementById("manage-open").addEventListener("click", openManager);
  document
    .getElementById("feature-close")
    .addEventListener("click", () =>
      document.getElementById("feature-dialog").close(),
    );
  document.getElementById("feature-dialog").addEventListener("click", (e) => {
    if (e.target.id === "feature-dialog") e.target.close();
  });
  document.getElementById("week-prev").addEventListener("click", () => {
    state.weekDate.setDate(state.weekDate.getDate() - 7);
    renderWeek();
  });
  document.getElementById("week-next").addEventListener("click", () => {
    state.weekDate.setDate(state.weekDate.getDate() + 7);
    renderWeek();
  });
  document.getElementById("week-today").addEventListener("click", () => {
    state.weekDate = new Date();
    renderWeek();
  });
  try {
    document.documentElement.dataset.theme =
      localStorage.getItem("kcu-pages-theme") || "system";
    document.documentElement.dataset.accent =
      localStorage.getItem("kcu-pages-accent") || "burgundy";
  } catch {}
}

init();
