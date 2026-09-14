// Personal data stays in this browser. Backup format is shared with the local app.
const stores = ["favorites", "notes", "tags", "personal", "meta"];
let database;
const requestValue = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
const transactionDone = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onabort = tx.onerror = () =>
      reject(tx.error || new Error("저장에 실패했습니다."));
  });
export const eventId = (event) =>
  (event.uid || event.id).replace(/@kcu-schedule$/, "");
export const validDate = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
const color = (value) =>
  /^#[0-9a-f]{6}$/i.test(value || "") ? value : "#317d6c";
export async function openData() {
  const request = indexedDB.open("kcu-pages-data", 1);
  request.onupgradeneeded = () =>
    stores.forEach((name) =>
      request.result.createObjectStore(name, { keyPath: "id" }),
    );
  database = await requestValue(request);
  database.onversionchange = () => {
    database.close();
    database = null;
  };
  const migrated = await requestValue(
    database.transaction("meta").objectStore("meta").get("notes-migrated"),
  );
  if (!migrated) {
    // Keep the old database intact; copy its notes once, atomically with the migration marker.
    const old = await requestValue(indexedDB.open("kcu-pages-notes"));
    try {
      const previous = old.objectStoreNames.contains("notes")
        ? await requestValue(
            old.transaction("notes").objectStore("notes").getAll(),
          )
        : [];
      const tx = database.transaction(["notes", "meta"], "readwrite");
      const done = transactionDone(tx);
      previous.forEach((note) => {
        if (typeof note.id === "string" && typeof note.content === "string")
          tx.objectStore("notes").put({
            id: note.id.replace(/@kcu-schedule$/, ""),
            content: note.content,
            updatedAt: Date.now(),
          });
      });
      tx.objectStore("meta").put({ id: "notes-migrated" });
      await done;
    } finally {
      old.close();
    }
  }
  return readData();
}
export async function readData() {
  if (!database) throw new Error("브라우저 저장소를 사용할 수 없습니다.");
  const tx = database.transaction(stores.slice(0, 4));
  const results = await Promise.all(
    stores
      .slice(0, 4)
      .map((name) => requestValue(tx.objectStore(name).getAll())),
  );
  return {
    favorites: new Set(results[0].map((record) => record.id)),
    notes: new Map(results[1].map((record) => [record.id, record])),
    tags: new Map(results[2].map((record) => [record.id, record])),
    personal: results[3],
  };
}
async function mutate(names, action) {
  if (!database) throw new Error("브라우저 저장소를 사용할 수 없습니다.");
  const tx = database.transaction(names, "readwrite");
  const done = transactionDone(tx);
  action(tx);
  await done;
}
export const setFavorite = (id, saved) =>
  mutate(["favorites"], (tx) =>
    saved
      ? tx.objectStore("favorites").put({ id })
      : tx.objectStore("favorites").delete(id),
  );
export const setNote = (id, content) =>
  mutate(["notes"], (tx) =>
    content.trim()
      ? tx
          .objectStore("notes")
          .put({
            id,
            content: content.trim().slice(0, 5000),
            updatedAt: Date.now(),
          })
      : tx.objectStore("notes").delete(id),
  );
export const setTag = (id, label, nextColor) =>
  mutate(["tags"], (tx) =>
    label.trim()
      ? tx
          .objectStore("tags")
          .put({
            id,
            label: label.trim().slice(0, 24),
            color: color(nextColor),
            updatedAt: Date.now(),
          })
      : tx.objectStore("tags").delete(id),
  );
function normalizePersonal(input) {
  if (
    !input ||
    typeof input.title !== "string" ||
    !input.title.trim() ||
    !validDate(input.start) ||
    (input.end && (!validDate(input.end) || input.end < input.start))
  )
    throw new Error("제목과 올바른 시작일·종료일을 입력해 주세요.");
  if (input.tagLabel != null && typeof input.tagLabel !== "string")
    throw new Error("개인 분류 형식이 올바르지 않습니다.");
  return {
    id: input.id || `personal-${crypto.randomUUID()}`,
    title: input.title.trim().slice(0, 80),
    start: input.start,
    end: input.end || input.start,
    description:
      typeof input.description === "string"
        ? input.description.slice(0, 2000)
        : "",
    tagLabel: (input.tagLabel || "").trim().slice(0, 24),
    tagColor: color(input.tagColor),
    createdAt: Number(input.createdAt) || Date.now(),
    updatedAt: Date.now(),
  };
}
export async function savePersonal(input) {
  const record = normalizePersonal(input);
  await mutate(["personal"], (tx) => tx.objectStore("personal").put(record));
  return record;
}
export const deletePersonal = (id) =>
  mutate(["personal", "favorites", "notes", "tags"], (tx) =>
    ["personal", "favorites", "notes", "tags"].forEach((name) =>
      tx.objectStore(name).delete(id),
    ),
  );
export async function changeCategory(label, nextLabel, nextColor) {
  const data = await readData();
  await mutate(["tags", "personal"], (tx) => {
    data.tags.forEach((tag) => {
      if (tag.label === label) {
        if (nextLabel)
          tx.objectStore("tags").put({
            ...tag,
            label: nextLabel.trim().slice(0, 24),
            color: color(nextColor),
          });
        else tx.objectStore("tags").delete(tag.id);
      }
    });
    data.personal
      .filter((event) => event.tagLabel === label)
      .forEach((event) =>
        tx
          .objectStore("personal")
          .put({
            ...event,
            tagLabel: nextLabel.trim().slice(0, 24),
            tagColor: color(nextColor),
          }),
      );
  });
}
const encode = new TextEncoder();
const base64 = (bytes) =>
  btoa(Array.from(bytes, (n) => String.fromCharCode(n)).join(""));
const unbase64 = (value) =>
  Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
const keyFor = async (password, salt, usage) =>
  crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 180000, hash: "SHA-256" },
    await crypto.subtle.importKey(
      "raw",
      encode.encode(password),
      "PBKDF2",
      false,
      ["deriveKey"],
    ),
    { name: "AES-GCM", length: 256 },
    false,
    [usage],
  );
export async function makeBackup(password) {
  const data = await readData();
  const plain = {
    schema: "kcu-academic-calendar-user-data",
    version: 3,
    createdAt: new Date().toISOString(),
    favorites: [...data.favorites],
    notes: [...data.notes.values()],
    customTags: [...data.tags.values()],
    personalSchedules: data.personal,
  };
  if (!password) return plain;
  if (password.length < 8)
    throw new Error("백업 비밀번호는 8자 이상 입력해 주세요.");
  const salt = crypto.getRandomValues(new Uint8Array(16)),
    iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await keyFor(password, salt, "encrypt"),
    encode.encode(JSON.stringify(plain)),
  );
  return {
    schema: "kcu-academic-calendar-user-data-encrypted",
    version: 1,
    encrypted: true,
    algorithm: "AES-GCM",
    kdf: "PBKDF2-SHA-256",
    iterations: 180000,
    salt: base64(salt),
    iv: base64(iv),
    ciphertext: base64(new Uint8Array(ciphertext)),
    createdAt: plain.createdAt,
  };
}
export async function importBackup(text, password, officialIds) {
  let plain;
  try {
    plain = JSON.parse(text);
  } catch {
    throw new Error("올바른 JSON 백업 파일이 아닙니다.");
  }
  if (plain?.schema === "kcu-academic-calendar-user-data-encrypted") {
    if (!password) throw new Error("백업 비밀번호를 입력해 주세요.");
    try {
      plain = JSON.parse(
        new TextDecoder().decode(
          await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: unbase64(plain.iv) },
            await keyFor(password, unbase64(plain.salt), "decrypt"),
            unbase64(plain.ciphertext),
          ),
        ),
      );
    } catch {
      throw new Error("비밀번호가 올바르지 않거나 손상된 백업입니다.");
    }
  }
  if (
    plain?.schema !== "kcu-academic-calendar-user-data" ||
    ![1, 2, 3].includes(plain.version) ||
    !Array.isArray(plain.favorites) ||
    !Array.isArray(plain.notes) ||
    (plain.customTags != null && !Array.isArray(plain.customTags)) ||
    (plain.personalSchedules != null && !Array.isArray(plain.personalSchedules))
  )
    throw new Error("지원하지 않는 백업 형식입니다.");
  const personal = (plain.personalSchedules || []).map((input) => {
    if (typeof input?.id !== "string" || !input.id.startsWith("personal-"))
      throw new Error("개인 일정 ID가 올바르지 않습니다.");
    return normalizePersonal(input);
  });
  const existing = await readData();
  const validIds = new Set([
    ...officialIds,
    ...existing.personal.map((e) => e.id),
    ...personal.map((e) => e.id),
  ]);
  const idFor = (id) =>
    typeof id === "string" ? id.replace(/@kcu-schedule$/, "") : "";
  const favorites = plain.favorites.map(idFor).filter((id) => validIds.has(id));
  const notes = plain.notes
    .map((n) => {
      if (!n || typeof n.id !== "string" || typeof n.content !== "string")
        throw new Error("메모 형식이 올바르지 않습니다.");
      return {
        id: idFor(n.id),
        content: n.content.slice(0, 5000),
        updatedAt: Number(n.updatedAt) || Date.now(),
      };
    })
    .filter((n) => validIds.has(n.id));
  const tags = (plain.customTags || [])
    .map((t) => {
      if (!t || typeof t.id !== "string" || typeof t.label !== "string")
        throw new Error("분류 형식이 올바르지 않습니다.");
      return {
        id: idFor(t.id),
        label: t.label.trim().slice(0, 24),
        color: color(t.color),
        updatedAt: Date.now(),
      };
    })
    .filter((t) => validIds.has(t.id));
  await mutate(["personal", "favorites", "notes", "tags"], (tx) => {
    personal.forEach((e) => tx.objectStore("personal").put(e));
    favorites.forEach((id) => tx.objectStore("favorites").put({ id }));
    notes.forEach((n) => tx.objectStore("notes").put(n));
    tags.forEach((t) => tx.objectStore("tags").put(t));
  });
  return `복원했습니다. 저장 ${favorites.length}개 · 메모 ${notes.length}개 · 분류 ${tags.length}개 · 개인 일정 ${personal.length}개`;
}
export function download(content, filename, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportCalendar(events, data) {
  const escape = (value) =>
    String(value || "")
      .replace(/\\/g, "\\\\")
      .replace(/\r?\n/g, "\\n")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,");
  const fold = (line) => {
    const parts = [];
    let current = "",
      length = 0;
    for (const char of line) {
      const bytes = encode.encode(char).length;
      if (length + bytes > 75) {
        parts.push(current);
        current = " ";
        length = 1;
      }
      current += char;
      length += bytes;
    }
    return [...parts, current].join("\r\n");
  };
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Heznpc//KCU Calendar//KO",
    "CALSCALE:GREGORIAN",
  ];
  events.forEach((event) => {
    const id = eventId(event),
      end = new Date(`${event.end}T12:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    const tag = data.tags.get(id)?.label || event.tagLabel;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escape(id)}@kcu-schedule`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${event.start.replace(/-/g, "")}`,
      `DTEND;VALUE=DATE:${end.toISOString().slice(0, 10).replace(/-/g, "")}`,
      `SUMMARY:${escape(event.subject)}`,
      `DESCRIPTION:${escape([event.description || event.dept, data.notes.get(id)?.content].filter(Boolean).join("\n"))}`,
    );
    if (tag) lines.push(`CATEGORIES:${escape(tag)}`);
    lines.push("END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  download(
    lines.map(fold).join("\r\n") + "\r\n",
    "kcu-my-calendar.ics",
    "text/calendar;charset=utf-8",
  );
}
