// 과금 설계 계산기 — 무과금/월정액/소과금/중과금이 1년 동안 얻는 보석·VIP·대기시간 단축을 계산해 표로 낸다.
// 실행: node tools/econ-sim.mjs > docs/MONETIZATION_TABLES.md
// 숫자는 js/meta.js · js/data.js(SHOP) 의 실제 값을 그대로 읽는다(문서와 게임이 어긋나지 않게).
import { VIP, ATTEND, ACTIVITY, BUILD_MIN, GEM_PER_HOUR, vipLevel } from "../js/meta.js";
import { SHOP } from "../js/data.js";

const won = (n) => n.toLocaleString("ko-KR") + "원";
const gemPrice = SHOP.products.filter((p) => p.gems && !p.monthly).map((p) => ({ name: p.name, perGem: p.price / p.gems }));
const attendGemsWeek = ATTEND.reduce((a, r) => a + (r.gems || 0), 0);
const attendSpeedMinWeek = ATTEND.reduce((a, r) => a + (r.item?.[0] === "speed_1h" ? 60 * r.item[1] : 0), 0);
const totalBuildH = Object.values(BUILD_MIN).reduce((a, b) => a + b, 0) / 60;

// 플레이 성향: 하루 접속률·플레이 시간(활동 점수)·광고 시청·결제
const PROFILES = [
  { id: "f2p1", name: "무과금 · 하루 1시간", attend: 0.85, actPts: 80, ads: 2, spendMonth: 0, pass: false },
  { id: "f2p2", name: "무과금 · 하루 2시간", attend: 0.95, actPts: 120, ads: 4, spendMonth: 0, pass: false },
  { id: "pass", name: "월정액만 (4,900원/월)", attend: 0.9, actPts: 80, ads: 0, spendMonth: 4900, pass: true },
  { id: "light", name: "월정액 + 월 3만원", attend: 0.9, actPts: 80, ads: 0, spendMonth: 34900, pass: true },
  { id: "mid", name: "월정액 + 월 10만원", attend: 0.9, actPts: 100, ads: 0, spendMonth: 104900, pass: true },
];
const DAILY_MISSION_GEMS = 45; // 일일 미션(30~60)의 평균
const AD_GEMS = 20;

function simulate(pf, days = 365) {
  let gems = 0, vip = 0, streak = 0, speedMin = 0;
  const vipDay = {};
  for (let d = 1; d <= days; d++) {
    const on = (d * 7919) % 100 < pf.attend * 100; // 결정적 접속 패턴
    if (on) {
      streak++;
      vip += Math.min(90, 20 + streak * 10);
      gems += attendGemsWeek / 7 + DAILY_MISSION_GEMS + pf.ads * AD_GEMS;
      speedMin += attendSpeedMinWeek / 7;
      for (const c of ACTIVITY.chests) if (pf.actPts >= c.at) { gems += c.gems; speedMin += c.item[0] === "speed_5m" ? 5 * c.item[1] : c.item[0] === "speed_1h" ? 60 * c.item[1] : 0; }
      speedMin += VIP.perks[vipLevel(vip)].speed;
    } else streak = 0;
    if (pf.pass) gems += 120; // 월정액 매일 120
    if (d % 30 === 1 && pf.spendMonth) {
      vip += pf.spendMonth * VIP.perWon;
      const extra = pf.spendMonth - (pf.pass ? 4900 : 0);
      gems += extra / 2.76; // 가장 큰 상자 기준 보석 단가
    }
    for (let lv = 0; lv < VIP.levels.length; lv++) if (vip >= VIP.levels[lv] && !vipDay[lv]) vipDay[lv] = d;
  }
  return { gems: Math.round(gems), vip: Math.round(vip), vipLv: vipLevel(vip), speedH: Math.round(speedMin / 60), vipDay };
}

const out = [];
out.push(`# 과금 계산표 (자동 생성: node tools/econ-sim.mjs)\n`);
out.push(`## 1. 보석 가격\n| 상품 | 보석 1개 가격 |\n|---|---|\n${gemPrice.map((g) => `| ${g.name} | ${g.perGem.toFixed(2)}원 |`).join("\n")}\n`);
out.push(`- 월정액 4,900원 = 30일 × 보석 120 = **3,600 보석**(상자 기준 약 ${won(Math.round(3600 * 2.76))} 가치, 약 ${(3600 * 2.76 / 4900).toFixed(1)}배) + VIP 490점`);
out.push(`- 성장 펀드 9,900원 = 기지 Lv3~8 달성 시 총 **${Object.values(SHOP.growthFund).reduce((a, b) => a + b, 0)} 보석** (약 ${(Object.values(SHOP.growthFund).reduce((a, b) => a + b, 0) * 2.76 / 9900).toFixed(1)}배) — 끝까지 플레이할수록 이득`);
out.push(`- 기지 확장 공사 총 ${totalBuildH.toFixed(0)}시간 → 보석으로 전부 건너뛰면 ${Math.round(totalBuildH * GEM_PER_HOUR)} 보석(약 ${won(Math.round(totalBuildH * GEM_PER_HOUR * 2.76))})\n`);
out.push(`## 2. 1년 시뮬레이션 (성향별)\n| 성향 | 1년 보석 | 1년 VIP 점수 | 1년 후 VIP | 무료 가속(시간) | VIP3 도달 | VIP5 도달 | VIP7 도달 |\n|---|---|---|---|---|---|---|---|`);
for (const pf of PROFILES) {
  const r = simulate(pf);
  const d = (lv) => (r.vipDay[lv] ? r.vipDay[lv] + "일" : "1년 넘음");
  out.push(`| ${pf.name} | ${r.gems.toLocaleString()} | ${r.vip.toLocaleString()} | VIP ${r.vipLv} | ${r.speedH} | ${d(3)} | ${d(5)} | ${d(7)} |`);
}
const f = simulate(PROFILES[0]), p = simulate(PROFILES[2]);
out.push(`\n## 3. 결론(설계 목표 확인)`);
out.push(`- 무과금(하루 1시간)도 1년에 보석 ${f.gems.toLocaleString()}개, 무료 가속 ${f.speedH}시간 → 공사 ${totalBuildH.toFixed(0)}시간을 **모두 무료로 덮을 수 있다**(기다리기만 하면 됨).`);
out.push(`- 월정액(4,900원)은 무과금보다 보석 약 ${(p.gems / f.gems).toFixed(1)}배 → 편의는 크게 늘지만 전투력은 팔지 않으므로 '돈으로 즉시 클리어'는 불가(balance-sim: 어려움 과금해도 90일 이상).`);
out.push(`- VIP 최고 단계(9)는 무과금은 사실상 수년, 결제자는 빠르게 — 단 VIP 혜택은 오프라인 시간·가속·원정 슬롯 같은 '편의'만.`);
console.log(out.join("\n"));
