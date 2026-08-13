# KCU 학사일정 캘린더 구독 피드

고려사이버대학교 공식 홈페이지(cuk.edu)에 공개된 학사일정 데이터를
매일 자동으로 가져와 표준 iCalendar(.ics) 형식으로 변환해 제공합니다.
구글 캘린더 · 애플 캘린더 · 아웃룩 등에서 "캘린더 구독" 기능으로
한 번만 등록하면, 이후 학사일정이 바뀔 때마다 자동으로 반영됩니다.

이 프로젝트는 학생이 개인적으로 만든 비공식 도구이며 고려사이버대학교와
무관합니다. 실제 학사일정은 항상 학교 공식 홈페이지가 기준입니다.

## 구독 방법

1. 구독 URL을 복사합니다. (`docs/index.html` 참고 — 배포 후 확정)
   ```
   https://<username>.github.io/<repo>/kcu-schedule.ics
   ```
2. 구글 캘린더: 설정 → 캘린더 추가 → URL로 추가
   애플 캘린더: 파일(또는 설정) → 캘린더 구독
   아웃룩: 캘린더 추가 → 인터넷에서 구독

## 데이터 출처

`https://www.cuk.edu/ajaxf/FrScheduleSvc/ScheduleListData.do`

학교 홈페이지 학사일정 페이지(`/cms/FrCon/index.do?MENU_ID=590`)가
내부적으로 호출하는 공개 JSON 엔드포인트로, 로그인이 필요 없습니다.

## 자동 갱신

GitHub Actions(`.github/workflows/update-calendar.yml`)가 매일 1회
(KST 06:00) 최신 데이터를 조회해 `docs/kcu-schedule.ics`를 갱신하고
변경이 있을 때만 커밋합니다. GitHub Pages를 `main` 브랜치의 `/docs`
폴더로 설정하면 위 구독 URL이 그대로 동작합니다.

## 로컬 실행

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python fetch_schedule.py
```

`docs/kcu-schedule.ics` 파일이 생성/갱신됩니다.
