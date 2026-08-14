# KCU 학사일정

고려사이버대학교 공식 홈페이지(cuk.edu)에 공개된 학사일정 데이터를
자동으로 가져와, 학교 홈페이지보다 보기 편한 웹페이지와 캘린더
구독(.ics) 피드로 제공합니다.

이 프로젝트는 학생이 개인적으로 만든 비공식 도구이며 고려사이버대학교와
무관합니다. 실제 학사일정은 항상 학교 공식 홈페이지가 기준입니다.

## 웹페이지

**https://kcu-hub.github.io/kcu-schedule/**

- 다가오는 일정 목록, 월별 캘린더, 검색을 한 페이지에서 제공
- 날짜를 클릭하면 그날의 일정을 모두 볼 수 있음
- 라이트/다크 모드, 모바일 화면 대응

## 캘린더 구독 (선택)

캘린더 앱에 한 번 등록해두면 일정이 바뀔 때마다 자동으로 반영됩니다.
구독 URL과 기기별(안드로이드 · 아이폰 · 윈도우) 등록 방법은 웹페이지의
"캘린더 구독하기" 버튼에 안내되어 있습니다.

```
https://kcu-hub.github.io/kcu-schedule/kcu-schedule.ics
```

## 데이터 출처

`https://www.cuk.edu/ajaxf/FrScheduleSvc/ScheduleListData.do`

학교 홈페이지 학사일정 페이지(`/cms/FrCon/index.do?MENU_ID=590`)가
내부적으로 호출하는 공개 JSON 엔드포인트로, 로그인이 필요 없습니다.

## 자동 갱신

GitHub Actions(`.github/workflows/update-calendar.yml`)가 매주 1회
(월요일 KST 06:00) 최신 데이터를 조회해 `docs/kcu-schedule.ics`(캘린더
구독용)와 `docs/kcu-schedule.json`(웹페이지용)을 갱신하고, 변경이 있을
때만 커밋합니다. 학사일정은 연/학기 단위로 미리 확정 공고되므로 더 잦은
조회는 의미가 없습니다. 즉시 갱신이 필요하면 Actions 탭에서
`workflow_dispatch`로 수동 실행할 수 있습니다.

GitHub Pages가 `main` 브랜치의 `/docs` 폴더로 설정되어 있어 위 웹페이지와
구독 URL이 그대로 동작합니다.

## 로컬 실행

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python fetch_schedule.py
```

`docs/kcu-schedule.ics`, `docs/kcu-schedule.json` 파일이 생성/갱신됩니다.
