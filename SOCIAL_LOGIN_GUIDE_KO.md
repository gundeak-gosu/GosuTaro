# 실제 소셜 로그인(카카오·네이버·구글) 연동 가이드

## 지금 상태

`index.html`의 `AUTH_CONFIG` 값이 비어있는 동안은 로그인 버튼을 눌러도 가짜 사용자로 로그인되는 **데모 모드**로 동작합니다.
아래 값을 채우면 실제 OAuth 로그인으로 자동 전환됩니다. 코드를 더 손댈 필요는 없고, 각 플랫폼에서 앱을 등록하고 발급받은 값만 넣으면 됩니다.

```js
const AUTH_CONFIG={
  googleClientId:"",   // ← Google Cloud Console에서 발급
  kakaoJsKey:"",       // ← Kakao Developers에서 발급
  naverClientId:"",    // ← Naver Developers에서 발급
};
```

Netlify 환경변수도 함께 설정해야 합니다 (서버 함수가 토큰을 검증할 때 사용):

| 환경변수 | 용도 |
|---|---|
| `GOOGLE_CLIENT_ID` | Google 로그인 토큰 검증 (`netlify/functions/auth-google.js`) |
| `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` | 네이버 인가코드 → 토큰 교환 (`netlify/functions/auth-naver-callback.js`) |

카카오는 별도 서버 시크릿이 필요 없습니다 (JS 키만으로 로그인하고, 서버는 발급된 액세스 토큰으로 카카오에 프로필을 직접 조회해 검증을 대신합니다).

배포 도메인이 아직 없다면 우선 Netlify가 기본 제공하는 `https://내사이트이름.netlify.app` 주소로 등록해두고, 나중에 커스텀 도메인을 연결하면 각 플랫폼 설정에서 도메인만 추가하면 됩니다.

---

## 1. 카카오 로그인

1. [Kakao Developers](https://developers.kakao.com) 접속 → 로그인 → `내 애플리케이션` → `애플리케이션 추가하기`.
2. 앱 이름/사업자명을 입력하고 생성합니다.
3. 왼쪽 메뉴 `앱 설정 → 요약 정보`에서 **JavaScript 키**를 복사 → `index.html`의 `AUTH_CONFIG.kakaoJsKey`에 붙여넣기.
4. `제품 설정 → 카카오 로그인`에서 활성화 스위치를 켭니다.
5. `제품 설정 → 카카오 로그인 → 플랫폼`에서 `Web 플랫폼 등록` → 사이트 도메인(예: `https://내사이트이름.netlify.app`)을 추가합니다.
6. `동의항목`에서 최소 `닉네임`, `카카오계정(이메일)`을 요청 항목으로 설정합니다(이메일은 검수가 필요할 수 있음 — 없어도 로그인 자체는 동작합니다).
7. 저장 후 사이트 재배포. 카카오 버튼을 누르면 실제 로그인 팝업이 뜹니다.

## 2. 네이버 로그인

1. [Naver Developers](https://developers.naver.com/apps) 접속 → 로그인 → `Application → 애플리케이션 등록`.
2. 사용 API에서 `네이버 로그인`을 선택합니다.
3. 제공 정보 선택에서 최소 `이름`, `이메일`을 체크합니다.
4. 서비스 URL에 사이트 주소, **Callback URL(로그인 후 리다이렉트 URI)에는 반드시 아래 주소를 등록**합니다.
   ```
   https://내사이트도메인/.netlify/functions/auth-naver-callback
   ```
5. 등록 완료 후 발급된 **Client ID**, **Client Secret**을 확인합니다.
6. `index.html`의 `AUTH_CONFIG.naverClientId`에 Client ID를 넣습니다.
7. Netlify 사이트 설정 → `Environment variables`에 `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`을 추가합니다.
8. 재배포 후 네이버 버튼을 누르면 네이버 로그인 페이지로 이동했다가 자동으로 앱으로 돌아옵니다.

> 네이버는 카카오/구글과 달리 클라이언트 시크릿이 필요해서, 브라우저가 아니라 `netlify/functions/auth-naver-callback.js`(서버)가 코드-토큰 교환을 대신합니다. 이 흐름은 이미 구현되어 있어 위 설정만 하면 됩니다.

## 3. 구글 로그인

1. [Google Cloud Console](https://console.cloud.google.com) 접속 → 프로젝트 생성(또는 선택).
2. `API 및 서비스 → OAuth 동의 화면`에서 앱 정보(이름, 지원 이메일 등)를 채우고 게시(테스트 단계에서는 테스트 사용자만 로그인 가능).
3. `API 및 서비스 → 사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID`.
4. 애플리케이션 유형: **웹 애플리케이션**.
5. `승인된 자바스크립트 원본`에 사이트 주소를 추가합니다. 예: `https://내사이트이름.netlify.app`
   (구글 로그인은 리다이렉트가 아니라 팝업/One Tap 방식이라 별도 리다이렉트 URI 등록은 필요 없습니다.)
6. 생성된 **클라이언트 ID**를 `index.html`의 `AUTH_CONFIG.googleClientId`와 Netlify 환경변수 `GOOGLE_CLIENT_ID`에 동일하게 넣습니다.
7. 재배포 후 구글 버튼을 누르면 One Tap/팝업 로그인이 뜹니다.

---

## 동작 원리 (요약)

- **카카오/구글**: 브라우저에서 로그인 후 받은 토큰을 각각 `netlify/functions/auth-kakao.js`, `netlify/functions/auth-google.js`로 보내 서버에서 진짜인지 검증한 뒤 이름/이메일만 돌려받습니다.
- **네이버**: 브라우저가 네이버 로그인 페이지로 직접 이동 → 로그인 후 네이버가 `netlify/functions/auth-naver-callback.js`로 인가코드를 보냄 → 서버가 클라이언트 시크릿으로 토큰 교환 + 프로필 조회 → 결과를 담아 다시 앱 주소로 리다이렉트.
- 로그인에 성공하면 `{name, email, provider}`를 브라우저 `localStorage`에 저장해 새로고침해도 로그인이 유지됩니다.

## 한계 (알아두어야 할 것)

- 지금은 **기기(브라우저)에 저장된 로컬 세션**입니다. 다른 기기·다른 브라우저에서는 다시 로그인해야 하고, 여러 기기 간 리딩 기록 동기화도 되지 않습니다.
- 진짜 회원 데이터베이스(여러 기기 동기화, 관리자 페이지에서 회원 조회 등)가 필요해지면 Supabase, Firebase, PlanetScale 같은 백엔드를 추가로 붙여야 합니다 — 지금 범위 밖입니다.
