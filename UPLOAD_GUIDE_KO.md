# Mystic Tarot 앱 배포 방법

## 지금 연결된 구조

- 첫 화면: `index.html`
- 디자인 규칙: [design.md](design.md)
- 카드 이미지: `assets/cards/` (라이더-웨이트 1909 퍼블릭도메인, `scripts/prepare_cards.py`로 생성)
- 서버 함수: `netlify/functions/`
  - `gemini-reading.js` — AI 해석 (`GEMINI_API_KEY`)
  - `toss-confirm.js` — 결제 승인 (`TOSS_SECRET_KEY`) — [ADS_PAYMENTS_GUIDE_KO.md](ADS_PAYMENTS_GUIDE_KO.md)
  - `auth-google.js` / `auth-kakao.js` / `auth-naver-callback.js` / `auth-email.js` — 로그인 검증 (`GOOGLE_CLIENT_ID`, `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`) — [SOCIAL_LOGIN_GUIDE_KO.md](SOCIAL_LOGIN_GUIDE_KO.md)
  - `journal-add.js` / `progress-save.js` / `session-refresh.js` / `auth-logout.js` — 회원 DB(리딩 기록/진행상태) 읽기·쓰기
  - `_lib/supabase.js` — 위 회원 DB 함수들이 공유하는 Supabase 접속 헬퍼 (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)

API 키/시크릿은 HTML에 넣지 않습니다. Netlify 환경변수에만 저장하고, 서버 함수가 각 외부 서비스를 대신 호출합니다.

## 가장 안전한 배포 방법

AI 해석까지 쓰려면 Netlify Drop보다 GitHub 연결 또는 Netlify CLI 배포가 좋습니다. 서버 함수까지 함께 배포되어야 하기 때문입니다.

### 방법 A: GitHub 연결

1. GitHub에 이 `taro` 폴더를 올립니다.
2. Netlify에서 `Add new site` > `Import an existing project`를 선택합니다.
3. GitHub 저장소를 연결합니다.
4. Build settings는 아래처럼 둡니다.
   - Base directory: `taro` 또는 저장소 루트가 `taro`라면 비워둠
   - Build command: 비워둠
   - Publish directory: `.`
   - Functions directory: `netlify/functions`
5. Netlify 사이트 설정에서 `Environment variables`로 이동합니다.
6. `GEMINI_API_KEY`를 추가하고 Gemini API 키 값을 붙여넣습니다.
   (광고/결제/소셜로그인까지 실제로 켜려면 `TOSS_SECRET_KEY`, `GOOGLE_CLIENT_ID`, `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`도 같은 방식으로 추가 — 각각 [ADS_PAYMENTS_GUIDE_KO.md](ADS_PAYMENTS_GUIDE_KO.md), [SOCIAL_LOGIN_GUIDE_KO.md](SOCIAL_LOGIN_GUIDE_KO.md) 참고. 설정하지 않아도 앱은 데모 모드로 정상 동작합니다.)
7. 다시 Deploy 합니다.

### 방법 B: Netlify CLI

개발자가 대신 해줄 수 있으면 이 방법도 가능합니다.

```bash
cd taro
netlify init
netlify env:set GEMINI_API_KEY "여기에_Gemini_API_키"
netlify deploy --prod
```

## Gemini API 키 만드는 법

1. https://aistudio.google.com/app/apikey 접속
2. Google 계정 로그인
3. `Create API key` 클릭
4. 만들어진 키를 복사
5. Netlify 환경변수 `GEMINI_API_KEY`에 저장

## 보안 주의

- Gemini API 키를 `index.html`, `.js`, 메모장, 공개 GitHub 저장소에 넣지 마세요.
- Netlify 환경변수에만 넣으세요.
- 키가 실수로 노출되면 Google AI Studio에서 즉시 삭제하고 새 키를 만드세요.
- 공개 앱은 사용자가 많아지면 비용이 생길 수 있으니 Google AI Studio 사용량 제한을 확인하세요.

## 테스트 방법

배포 후 사이트에서 아래 순서로 확인합니다.

1. `로그인 없이 체험하기`
2. 하단 `타로`
3. 질문 입력
4. `원 카드`
5. 카드 1장 선택
6. `AI 해석 받기`

해석 문장이 나오면 Gemini 연결 성공입니다.
