#!/usr/bin/env python3
"""KCU 학사일정 공개 JSON을 가져와 ICS 캘린더 + 웹페이지용 JSON으로 변환한다.

데이터 출처: https://www.cuk.edu/ajaxf/FrScheduleSvc/ScheduleListData.do
(학교 홈페이지 학사일정 페이지가 내부적으로 호출하는 공개 엔드포인트, 로그인 불필요)

실제 일정 내용이 바뀌지 않으면 출력 바이트가 항상 동일하도록 만든다
(이벤트 정렬을 고정하고, 기존 ICS 파일에 있던 UID는 DTSTAMP도 그대로 유지).
이래야 CI의 "변경된 경우에만 커밋" 로직이 매일 헛커밋을 만들지 않는다.
"""
import hashlib
import json
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import requests
from icalendar import Calendar, Event, vText

API_URL = "https://www.cuk.edu/ajaxf/FrScheduleSvc/ScheduleListData.do"
SCH_DEPT_CD = "2"  # 학사일정 페이지가 실제로 사용하는 값(학부/대학교 기준)
DOCS_DIR = Path(__file__).parent / "docs"
ICS_OUTPUT_PATH = DOCS_DIR / "kcu-schedule.ics"
JSON_OUTPUT_PATH = DOCS_DIR / "kcu-schedule.json"
CAL_NAME = "고려사이버대학교 학사일정 (비공식)"
TIMEZONE = "Asia/Seoul"

SCH_TYPE_LABEL = {
    "R0201": "학사",
    "R0203": "행사",
}


def fetch_year(year: int) -> list:
    resp = requests.post(
        API_URL,
        data={"SCH_YEAR": str(year), "SCH_DEPT_CD": SCH_DEPT_CD},
        headers={"User-Agent": "Mozilla/5.0 (compatible; kcu-schedule-sync/1.0)"},
        timeout=15,
    )
    resp.raise_for_status()
    payload = resp.json()
    return payload.get("data", [])


def to_date(y: str, m: str, d: str) -> date:
    return date(int(y), int(m), int(d))


def make_uid(item: dict) -> str:
    key = "|".join([
        item["START_Y"], item["START_M"], item["START_D"],
        item["END_Y"], item["END_M"], item["END_D"],
        item["SUBJECT"],
    ])
    digest = hashlib.sha1(key.encode("utf-8")).hexdigest()[:16]
    return f"{digest}@kcu-schedule"


def event_sort_key(uid: str, item: dict):
    start = to_date(item["START_Y"], item["START_M"], item["START_D"])
    end = to_date(item["END_Y"], item["END_M"], item["END_D"])
    return (start, end, item["SUBJECT"], uid)


def sorted_items(items_by_uid: dict):
    return sorted(items_by_uid.items(), key=lambda pair: event_sort_key(*pair))


def load_previous_dtstamps(path: Path) -> dict:
    """이전에 생성된 ICS 파일에서 UID별 DTSTAMP를 읽어온다. 없으면 빈 dict."""
    if not path.exists():
        return {}
    try:
        cal = Calendar.from_ical(path.read_bytes())
    except Exception:
        return {}
    result = {}
    for component in cal.walk():
        if component.name != "VEVENT":
            continue
        uid = component.get("uid")
        dtstamp = component.get("dtstamp")
        if uid is not None and dtstamp is not None:
            result[str(uid)] = dtstamp.dt
    return result


def collect_items(years: list) -> dict:
    """연도별로 조회한 일정을 UID 기준으로 중복 제거해 dict로 반환한다."""
    items_by_uid = {}
    for year in years:
        try:
            items = fetch_year(year)
        except Exception as exc:  # 네트워크/파싱 실패 시 해당 연도만 건너뜀
            print(f"[WARN] {year}년 데이터 조회 실패: {exc}", file=sys.stderr)
            continue

        new_count = 0
        for item in items:
            uid = make_uid(item)
            if uid not in items_by_uid:
                items_by_uid[uid] = item
                new_count += 1
        print(f"{year}년: API {len(items)}건 조회, 신규 {new_count}건 추가")

    return items_by_uid


def build_calendar(items_by_uid: dict, previous_dtstamps: dict) -> Calendar:
    cal = Calendar()
    cal.add("prodid", "-//KCU Schedule Sync (unofficial)//kcu-schedule//KO")
    cal.add("version", "2.0")
    cal.add("calscale", "GREGORIAN")
    cal.add("method", "PUBLISH")
    cal.add("x-wr-calname", CAL_NAME)
    cal.add("x-wr-timezone", TIMEZONE)
    cal.add("x-published-ttl", "P1D")

    now = datetime.now(timezone.utc)

    for uid, item in sorted_items(items_by_uid):
        start = to_date(item["START_Y"], item["START_M"], item["START_D"])
        end = to_date(item["END_Y"], item["END_M"], item["END_D"])

        event = Event()
        event.add("uid", uid)
        event.add("summary", item["SUBJECT"])
        event.add("dtstart", start)
        event.add("dtend", end + timedelta(days=1))  # RFC5545: all-day DTEND는 배타적 경계
        event.add("dtstamp", previous_dtstamps.get(uid, now))
        label = SCH_TYPE_LABEL.get(item.get("SCH_TYPE"), item.get("SCH_TYPE", ""))
        if label:
            event.add("categories", vText(label))
        dept = item.get("DEPT_TYPE", "")
        if dept:
            event.add("description", f"담당: {dept}")
        cal.add_component(event)

    print(f"총 {len(items_by_uid)}건의 일정을 캘린더에 담았습니다.")
    return cal


def build_schedule_list(items_by_uid: dict) -> list:
    """웹페이지가 fetch로 읽어들일 가벼운 JSON 배열을 만든다."""
    result = []
    for uid, item in sorted_items(items_by_uid):
        start = to_date(item["START_Y"], item["START_M"], item["START_D"])
        end = to_date(item["END_Y"], item["END_M"], item["END_D"])
        sch_type = item.get("SCH_TYPE", "")
        result.append({
            "uid": uid,
            "subject": item["SUBJECT"],
            "start": start.isoformat(),
            "end": end.isoformat(),
            "type": sch_type,
            "type_label": SCH_TYPE_LABEL.get(sch_type, sch_type),
            "dept": item.get("DEPT_TYPE", ""),
        })
    return result


def main():
    current_year = datetime.now().year
    years = list(range(current_year - 1, current_year + 3))

    items_by_uid = collect_items(years)

    previous_dtstamps = load_previous_dtstamps(ICS_OUTPUT_PATH)
    cal = build_calendar(items_by_uid, previous_dtstamps)

    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    ICS_OUTPUT_PATH.write_bytes(cal.to_ical())
    print(f"저장 완료: {ICS_OUTPUT_PATH}")

    schedule = build_schedule_list(items_by_uid)
    JSON_OUTPUT_PATH.write_text(
        json.dumps({"events": schedule}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"저장 완료: {JSON_OUTPUT_PATH}")


if __name__ == "__main__":
    main()
