#!/usr/bin/env python3
"""KCU 학사일정 공개 JSON을 가져와 ICS 캘린더 파일로 변환한다.

데이터 출처: https://www.cuk.edu/ajaxf/FrScheduleSvc/ScheduleListData.do
(학교 홈페이지 학사일정 페이지가 내부적으로 호출하는 공개 엔드포인트, 로그인 불필요)
"""
import hashlib
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import requests
from icalendar import Calendar, Event, vText

API_URL = "https://www.cuk.edu/ajaxf/FrScheduleSvc/ScheduleListData.do"
SCH_DEPT_CD = "2"  # 학사일정 페이지가 실제로 사용하는 값(학부/대학교 기준)
OUTPUT_PATH = Path(__file__).parent / "docs" / "kcu-schedule.ics"
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


def build_calendar(years: list) -> Calendar:
    cal = Calendar()
    cal.add("prodid", "-//KCU Schedule Sync (unofficial)//kcu-schedule//KO")
    cal.add("version", "2.0")
    cal.add("calscale", "GREGORIAN")
    cal.add("method", "PUBLISH")
    cal.add("x-wr-calname", CAL_NAME)
    cal.add("x-wr-timezone", TIMEZONE)
    cal.add("x-published-ttl", "P1D")

    seen_uids = set()
    total = 0
    for year in years:
        try:
            items = fetch_year(year)
        except Exception as exc:  # 네트워크/파싱 실패 시 해당 연도만 건너뜀
            print(f"[WARN] {year}년 데이터 조회 실패: {exc}", file=sys.stderr)
            continue

        added_this_year = 0
        for item in items:
            uid = make_uid(item)
            if uid in seen_uids:
                continue
            seen_uids.add(uid)

            start = to_date(item["START_Y"], item["START_M"], item["START_D"])
            end = to_date(item["END_Y"], item["END_M"], item["END_D"])

            event = Event()
            event.add("uid", uid)
            event.add("summary", item["SUBJECT"])
            event.add("dtstart", start)
            event.add("dtend", end + timedelta(days=1))  # RFC5545: all-day DTEND는 배타적 경계
            event.add("dtstamp", datetime.now(timezone.utc))
            label = SCH_TYPE_LABEL.get(item.get("SCH_TYPE"), item.get("SCH_TYPE", ""))
            if label:
                event.add("categories", vText(label))
            dept = item.get("DEPT_TYPE", "")
            if dept:
                event.add("description", f"담당: {dept}")
            cal.add_component(event)
            total += 1
            added_this_year += 1

        print(f"{year}년: API {len(items)}건 조회, 신규 {added_this_year}건 추가")

    print(f"총 {total}건의 일정을 캘린더에 담았습니다.")
    return cal


def main():
    current_year = datetime.now().year
    years = list(range(current_year - 1, current_year + 3))
    cal = build_calendar(years)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_bytes(cal.to_ical())
    print(f"저장 완료: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
