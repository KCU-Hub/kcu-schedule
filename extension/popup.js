import { validateSchoolSnapshot } from "./core/school-schedule.js";
const status = document.querySelector("#status");
const download = document.querySelector("#download");
let objectUrl;
document.querySelector("#export").addEventListener("click", async () => {
  download.hidden = true;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab?.url || new URL(tab.url).origin !== "https://portal.koreacu.ac.kr")
      throw Error("학교 포털 탭을 선택하고 다시 눌러 주세요.");
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: () => window[Symbol.for("kcu.schedule.snapshot.v1")] ?? null,
    });
    if (!result?.result)
      throw Error(
        "포털을 새로고침하고 ‘해야 할 일’이 표시된 뒤 다시 눌러 주세요. 로그인 화면이면 먼저 로그인해 주세요.",
      );
    const snapshot = validateSchoolSnapshot(result.result);
    objectUrl = URL.createObjectURL(
      new Blob([JSON.stringify(snapshot, null, 2)], {
        type: "application/json",
      }),
    );
    download.href = objectUrl;
    download.download = "kcu-school-schedule.json";
    download.hidden = false;
    status.textContent = `${snapshot.events.length}개 일정을 준비했습니다. 아래 파일을 내려받으세요.`;
  } catch (error) {
    status.textContent = error.message || "일정을 가져오지 못했습니다.";
  }
});
