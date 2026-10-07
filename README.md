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

## 개인 기능

월간·주간·목록 보기에서 저장한 일정, 개인 일정, 일정 종류 및 개인 분류로 필터링할 수 있습니다.
일정 상세에서 저장·메모·분류를 관리하고, 빈 날짜에서도 개인 일정을 추가할 수 있습니다.
개인 일정은 수정·삭제할 수 있으며 같은 기간의 학교 일정도 확인할 수 있습니다.

`내 일정 관리`에서 개인 분류 이름·색상 변경, JSON 백업·복원, 선택적 비밀번호 암호화,
필터 결과의 ICS 내보내기 및 화면 모드·강조 색상 설정을 제공합니다.
개인 데이터는 IndexedDB에만 저장되며 서버로 전송되지 않습니다.
브라우저 데이터를 지우면 삭제되므로 다른 기기로 옮길 때는 백업을 사용하세요.

기존 Pages 메모는 처음 실행할 때 한 번 이전합니다. 로컬 버전의 백업 형식(v1–v3 및
AES-GCM 암호화 백업)과 호환되며, 로컬과 Pages는 서로 다른 주소이므로 백업 파일로 옮겨야 합니다.
복원은 기존 데이터와 합치며 같은 ID의 메모·분류는 백업 값으로 바뀝니다.

### 웹 회귀 검증

`docs`를 정적 서버로 실행한 뒤 Playwright와 Chromium이 설치된 환경에서 실행합니다.

```sh
PAGES_TEST_URL=http://127.0.0.1:3011 node tests/pages.cjs
```

검증은 격리된 브라우저와 테스트 일정으로 실행되며, 기존 메모 이전·삭제·저장·개인 일정 편집·
주간 보기·암호화 백업 복원·반응형 너비를 확인합니다.

## 학교 개인 일정 · 웹/앱 공통 데이터

웹을 그대로 유지하면서 `docs/core/school-schedule.js`에 학교 응답 변환·검증·일정 모델을
분리했습니다. 이 모듈은 DOM·IndexedDB·Chrome API에 의존하지 않으므로 앱에서도 가져올 수 있습니다.
웹은 로그인·앱 설치 없이 공통 학사일정과 개인 일정 기능을 계속 제공합니다.

학교 개인 일정은 [개발판 확장](extension/README.md)에서 가져온 파일을
‘학교 일정 가져오기’에서 미리 확인한 뒤 반영합니다. 새 파일은 기존 학교 일정 전체를
교체하고 직접 만든 개인 일정은 유지합니다. 학교에 제출·출석·완료 처리를 쓰지 않습니다.
완료 여부는 조회 당시 학교 응답이며, 최종 마감과 제출 상태는 강의실에서 확인하세요.

- 저장: 기존 IndexedDB `meta`에 버전이 있는 단일 스냅샷을 원자적으로 저장합니다.
- 날짜: 시간대 없는 포털 시각은 한국시간으로 해석하고 UTC 시각을 보존합니다. 달력에는
  마감일에 표시하고 상세에는 전체 기간·정확한 시각을 표시합니다. ICS에도 시각을 보존합니다.
- 백업: v4에 학교 스냅샷을 포함하며 v1–v3 및 기존 암호화 백업을 계속 읽습니다.
  v4를 구형 클라이언트가 읽을 수 있다는 뜻은 아닙니다. 웹/앱은 같은 모듈·버전을 사용해야 합니다.
- 기기 이동: 파일 또는 암호화 백업을 사용합니다. 서버 동기화·자동 갱신은 없습니다.
- 다른 계정: 가져오기 전에 ‘가져온 학교 데이터 지우기’로 학교 일정·관련 메모·저장 표시를
  지웁니다. 개인 일정은 보존됩니다. 계정 식별자를 보관하지 않으므로 계정 변경을 자동 감지하지 않습니다.

### 인증 검증 (2026-10-07)

학교의 공개 포털 번들에서 API 요청에 `Authorization: Bearer`를 붙이는 것을 확인했습니다.
현재 `todoList`의 외부 출처 OPTIONS 요청은 `Access-Control-Allow-Origin: http://localhost:3000`을
반환하여 GitHub Pages 출처와 일치하지 않습니다. 비인증 GET은 401을 반환합니다.
학교가 외부 OAuth 클라이언트를 제공하는지는 확인되지 않았습니다. 내부 SSO를 임의의
외부 앱 인증으로 취급하지 않습니다. 웹에서 토큰 입력을 요구하거나 CORS를 우회하지 않습니다.

확장은 포털이 정상적으로 조회한 응답만 가공하므로 인증은 학교 공식 화면에서 진행됩니다.
앱도 이 파일 형식을 읽고 동일한 코어를 사용할 수 있지만, 네이티브 앱 패키지·로그인 어댑터는
아직 구현되지 않았습니다. 이 변경은 웹을 앱으로 교체하지 않습니다.

### 검증

```sh
node scripts/build-extension.mjs
node --test tests/school-core.mjs
python3 -m http.server 3012 --directory docs --bind 127.0.0.1
# 별도 터미널; Playwright가 설치되어 있어야 합니다.
PAGES_TEST_URL=http://127.0.0.1:3012 node tests/pages.cjs
PAGES_TEST_URL=http://127.0.0.1:3012 node tests/school-browser.cjs
node tests/school-extension.cjs
```

설치된 Chromium을 쓰려면 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`를 지정합니다.
`QA_OUTPUT_DIR`을 지정하면 학교 일정 검증의 모바일·데스크톱 스크린샷을 저장합니다.
검증에는 가상 과목만 쓰며 학교 인증정보·실제 응답은 저장소에 포함하지 않습니다.
