# 광고(Google AdSense) · 결제(TossPayments) 연동 가이드

## 지금 상태

- 광고: `ADSENSE_CLIENT`가 placeholder(`ca-pub-0000000000000000`)인 동안은 지금까지 보이던 하드코딩 배너가 그대로 보입니다. 실제 값으로 채우면 자동으로 진짜 AdSense 광고 슬롯으로 전환됩니다.
- 결제: `TOSS_CLIENT_KEY`가 placeholder(`test_ck_YOUR_CLIENT_KEY`)인 동안은 결제 버튼을 눌러도 "키 설정이 필요합니다" 안내만 뜨고 실제 결제는 시도되지 않습니다.
- 무료 횟수: `FREE_READINGS`(기본 3회) 만큼은 광고만 보면 바로 리딩을 볼 수 있고, 그 이후엔 "광고 보고 무료로 보기" 또는 "결제하고 광고 없이 보기" 중 선택하는 페이월이 뜹니다.

두 기능 모두 `index.html` 상단의 `수익화 설정` 블록에서 값만 바꾸면 됩니다.

```js
const FREE_READINGS=3;
const ADSENSE_CLIENT="ca-pub-0000000000000000";
const ADSENSE_SLOTS={home:"...",journal:"...",profile:"...",interstitial:"...",result1:"...",result2:"..."};
const TOSS_CLIENT_KEY="test_ck_YOUR_CLIENT_KEY";
const TOSS_PRODUCT={name:"타로 프리미엄 이용권 (광고 제거)",amount:2900};
```

---

## 1. Google AdSense 연동

### 가입 조건

- 실제 콘텐츠가 있고 어느 정도 방문자가 있어야 승인됩니다(빈 데모 페이지는 반려될 수 있어요).
- 개인정보처리방침 페이지가 있어야 합니다 — 광고/결제를 붙이는 시점에 꼭 하나 만들어 링크해두세요.
- 만 18세 이상, 본인 명의 결제수단(계좌) 등록 필요.

### 설정 순서

1. [Google AdSense](https://www.google.com/adsense)에서 가입 → 사이트 주소 등록.
2. 승인 대기 중 안내되는 `ads.txt` 내용을 확인하고, 프로젝트 루트의 `ads.txt` 파일 내용을 실제 발급된 값으로 교체합니다(지금은 placeholder `pub-0000000000000000`가 들어있음). Netlify는 루트의 정적 파일을 그대로 서빙하므로 별도 설정 없이 배포만 다시 하면 반영됩니다.
3. 승인되면 `광고 → 광고 단위별 광고`에서 **디스플레이 광고** 단위를 6개 만듭니다(홈 배너, 일지 배너, 프로필 배너, 전면광고, 결과화면 배너 2개) — 코드 상 슬롯 키와 매칭:
   - `home` → 홈 화면 배너
   - `journal` → 일지 화면 배너
   - `profile` → 프로필 화면 배너
   - `interstitial` → 무료 리딩 전면광고 / 페이월의 "광고 보고 보기"
   - `result1`, `result2` → 해석 결과 화면의 배너 2곳
4. 각 광고 단위 생성 시 나오는 `data-ad-client`(계정 전체 공통, `ca-pub-`로 시작)와 `data-ad-slot`(단위별로 다름) 값을 `index.html`의 `ADSENSE_CLIENT`, `ADSENSE_SLOTS`에 그대로 넣습니다.
5. `index.html` `<head>`의 로더 스크립트 URL에 있는 `ca-pub-0000000000000000`도 같은 값으로 바꿉니다.
6. 재배포 후 몇 분~몇 시간 내로 실제 광고가 뜨기 시작합니다(승인 직후엔 빈 공간으로 보일 수 있어요 — 정상입니다).

### 참고

- 이 앱의 "광고 보고 무료로 보기"는 진짜 리워드형(시청 완료 시 보상) 광고가 아니라, **일정 시간(15초) 동안 광고를 노출한 뒤 자동으로 잠금 해제**하는 방식입니다. 진짜 리워드 광고(Google Ad Manager의 H5 rewarded ads)는 별도 심사·승인이 필요한 상급 기능이라 지금 범위에는 포함하지 않았습니다. 트래픽이 늘어난 뒤 필요하면 Ad Manager 전환을 검토하세요.
- 광고 문구/버튼 배치는 [design.md](design.md) §6의 규칙(배너는 화면당 1개, `.btn-primary`와 혼동되지 않는 톤)을 따릅니다.

---

## 2. TossPayments 연동

### 준비물

- 사업자등록증(또는 개인 자격으로 테스트만 먼저 진행 가능) — 실제 결제(라이브)를 받으려면 사업자 등록 및 심사가 필요합니다. 테스트 키만으로는 개발/데모가 가능합니다.

### 설정 순서

1. [TossPayments 개발자센터](https://developers.tosspayments.com)에서 가입 → 내 상점 생성.
2. `개발자센터 → API 키`에서 **테스트 클라이언트 키**(`test_ck_...`)와 **테스트 시크릿 키**(`test_sk_...`)를 확인합니다.
3. `index.html`의 `TOSS_CLIENT_KEY`에 테스트 클라이언트 키를 넣습니다.
4. Netlify 사이트 설정 → `Environment variables`에 `TOSS_SECRET_KEY`로 테스트 시크릿 키를 등록합니다(`gemini-reading.js`가 `GEMINI_API_KEY`를 쓰는 것과 동일한 방식).
5. 재배포 후 무료 횟수를 소진하고 페이월에서 "결제하고 광고 없이 보기"를 눌러 테스트 카드로 결제가 되는지 확인합니다(테스트 키는 실제 청구가 되지 않습니다).
6. 실제 서비스로 전환할 준비가 되면 `상점 심사 신청` → 승인 후 발급되는 **라이브 키**(`live_ck_...`, `live_sk_...`)로 `TOSS_CLIENT_KEY`와 `TOSS_SECRET_KEY`를 교체합니다.

### 동작 원리 (요약)

1. 사용자가 결제 버튼을 누르면 브라우저가 TossPayments 결제창으로 이동합니다(`startTossPayment()`).
2. 결제가 끝나면 Toss가 `successUrl`(우리 사이트 주소)로 돌아오면서 `paymentKey`, `orderId`, `amount`를 붙여줍니다.
3. 브라우저는 이 값을 `netlify/functions/toss-confirm.js`로 보내고, 이 서버 함수가 **시크릿 키로 Toss 서버에 최종 승인 요청**을 보냅니다(클라이언트에서 직접 승인하면 위조 가능하므로 반드시 서버에서 처리).
4. 승인되면 `ST.premium=true`가 저장되어 이후 광고 없이 이용할 수 있습니다.
5. 결제하러 이동하기 직전에 진행 중이던 질문/스프레드/뽑은 카드를 `sessionStorage`에 잠깐 저장해두고, 결제 완료 후 돌아오면 이어서 해석을 보여줍니다(페이지 이동으로 인해 메모리 상태가 사라지기 때문).

### 가격/상품 조정

`TOSS_PRODUCT.amount`, `TOSS_PRODUCT.name`만 바꾸면 결제 금액/상품명이 바뀝니다. 지금은 "광고 제거 이용권 1회 결제(₩2,900)"로 구현되어 있습니다 — 구독형으로 바꾸려면 Toss의 정기결제(빌링) API 연동이 별도로 필요합니다(지금 범위 밖).

### 한계 (알아두어야 할 것)

- 결제 완료 여부(`premium`)는 지금 **기기 로컬(localStorage)에만** 저장됩니다. 브라우저 데이터를 지우거나 다른 기기로 접속하면 다시 결제해야 합니다.
- 여러 기기에서 결제 내역을 동기화하려면 실제 회원 DB(예: Supabase)에 결제 상태를 저장하는 구조가 필요합니다 — 지금 범위 밖입니다.
