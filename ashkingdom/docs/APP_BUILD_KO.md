# 앱으로 만들기 — 휴대폰(Android·iOS) + PC, 같은 계정으로 이어하기

게임 코드는 하나입니다. 같은 코드를 세 가지 껍데기에 담습니다.

| 플랫폼 | 방법 | 필요한 것 | 비용 |
|---|---|---|---|
| PC(윈도우·맥) | **웹/PWA 설치**: 크롬·엣지에서 게임 주소 접속 → 주소창의 '설치' 버튼 → 바탕화면 앱으로 실행 | 없음 | 0원 |
| PC(스팀 등 판매) | Electron 또는 Tauri로 포장(선택, 나중) | Node.js | 스팀 등록비 $100 |
| Android | Capacitor로 포장 → Google Play | Android Studio | 등록비 $25(1회) |
| iOS | Capacitor로 포장 → App Store | Mac + Xcode | 연 $99 |

## Android / iOS 빌드 순서 (Capacitor)
```bash
cd ashkingdom
npm i -D @capacitor/cli @capacitor/core @capacitor/android @capacitor/ios
npx cap add android          # android/ 폴더 생성
npx cap add ios              # (Mac에서만) ios/ 폴더 생성
npx cap sync                 # 게임 파일을 앱 안으로 복사
npx cap open android         # Android Studio에서 실행·서명·업로드
npx cap open ios             # Xcode에서 실행·서명·업로드
```
- 설정 파일: `capacitor.config.json` (앱 ID `com.gosutaro.ashkingdom`).
- 결제: 앱에서는 스토어 결제(Google Play Billing / Apple IAP) 플러그인이 필요합니다. 웹(PC)은 토스페이먼츠.
- 광고: AdMob 플러그인(`@capacitor-community/admob`).

## PC ↔ 휴대폰 이어하기
1. 서버(Supabase) 연결: `docs/supabase_schema.sql` 실행, Authentication → Email OTP 켜기.
2. `index.html`에 `<script>window.ASHK_CONFIG = { supabaseUrl: "...", anonKey: "..." }</script>` (anon 키는 공개용).
3. 게임 [메뉴 → ☁️ 기기 연결]에서 이메일 → 6자리 코드로 로그인. 다른 기기에서도 같은 이메일로 로그인.

동작 방식(`js/sync.js`):
- 시작할 때 서버의 '요약(리비전·일차·장·레벨)'만 먼저 받고, 다른 기기가 더 진행했으면 그때만 본문을 받습니다.
- 끌 때와 10분마다, **바뀐 경우에만** gzip 압축해서 올립니다(보통 5~15KB).
- 두 기기에서 따로 진행했다면 자동으로 덮어쓰지 않고 "어느 쪽으로 계속할지" 묻습니다.
- 서버 쪽은 리비전이 정확히 +1일 때만 저장(낙관적 잠금) → 동시에 두 기기가 서로 지우는 사고 방지.
- 비용: 계정당 세이브 1행(≤200KB, 보통 10KB대). 약 3만 명까지 Supabase 무료 저장 용량 안(추정, 요금제는 출시 전 재확인).
