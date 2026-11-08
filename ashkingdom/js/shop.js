import { addVipFromPurchase } from "./meta.js";
// 상점/광고/일일미션 — 프로토타입은 '테스트 결제'. 실서비스는 결제 성공 후 서버(Netlify Function)에서
// 지급해야 한다(클라이언트 지급 금지: 변조 가능). docs/GAME_DESIGN_KO.md §9 참고.
import { SHOP, RESEARCH, ITEMS } from "./data.js";
import { todayStr, giveItem, log, reviveGemCost } from "./systems.js";
import { makeRng } from "./rng.js";

const DAY = 86400000;

export function purchase(account, st, productId, now = Date.now()) {
  const p = SHOP.products.find((x) => x.id === productId);
  if (!p) return { ok: false };
  if (p.once && account.purchases.includes(p.id)) return { ok: false, why: "1회 한정 상품" };
  account.purchases.push(p.id);
  if (p.gems) account.gems += p.gems;
  if (p.id === "pass_month") account.passUntil = Math.max(now, account.passUntil) + 30 * DAY;
  if (p.id === "season_pass") account.seasonPass = true;
  addVipFromPurchase(account, p.price); // 결제 1원 = VIP 0.1점
  if (p.id === "speed_pack" && st) { giveItem(st, "speed_1h", 10); giveItem(st, "speed_8h", 8); }
  if (p.id === "vip_pack") { account.vip.pts += 1500; account.gems += 600; }
  if (p.id === "starter") {
    account.gems += 500;
    if (st) { giveItem(st, "backpack", 1); giveItem(st, "leather_jacket", 1); giveItem(st, "canned_food", 10); }
  }
  return { ok: true, product: p };
}

// 성장 펀드: 산 뒤 기지 레벨 단계마다 보석(이미 지난 단계는 바로)
export function claimGrowthFund(account, st) {
  if (!account.purchases.includes("growth_fund") || !st) return 0;
  account.fundGot ||= [];
  let g = 0;
  for (const [lv, gems] of Object.entries(SHOP.growthFund)) if (st.base.lv >= +lv && !account.fundGot.includes(lv)) { account.fundGot.push(lv); account.gems += gems; g += gems; }
  return g;
}

export function passActive(account, now = Date.now()) { return account.passUntil > now; }

export function claimPassDaily(account, now = Date.now()) {
  if (!passActive(account, now)) return 0;
  const t = todayStr(now);
  if (account.passClaimed === t) return 0;
  account.passClaimed = t;
  account.gems += 120;
  // 주 1회 부활권
  const week = Math.floor(now / (7 * DAY));
  if (account.passWeek !== week) { account.passWeek = week; account.reviveTokens++; }
  return 120;
}

export function adsLeft(account, now = Date.now()) {
  if (passActive(account, now)) return Infinity; // 월정액 = 광고 없이 보상
  if (account.ads.date !== todayStr(now)) return SHOP.ads.dailyLimit;
  return SHOP.ads.dailyLimit - account.ads.count;
}

export function watchAd(account, now = Date.now()) {
  if (adsLeft(account, now) <= 0) return false;
  if (account.ads.date !== todayStr(now)) account.ads = { date: todayStr(now), count: 0, freeRevive: false };
  account.ads.count++;
  return true;
}

// 보급 투하: 확률 공개(게임산업법 확률 표시 의무 준수 형태)
export const SUPPLY_TABLE = [
  { id: "canned_food", q: 4, p: 0.25 },
  { id: "scrap", q: 20, p: 0.2 },
  { id: "leather", q: 6, p: 0.15 },
  { id: "electronics", q: 3, p: 0.15 },
  { id: "iron", q: 6, p: 0.1 },
  { id: "medkit", q: 2, p: 0.1 },
  { id: "fuel", q: 4, p: 0.05 },
];

export function supplyDrop(account, st, rng = makeRng(Date.now())) {
  if (account.gems < 120) return null;
  account.gems -= 120;
  const got = [];
  for (let i = 0; i < 3; i++) {
    let r = rng.next();
    for (const e of SUPPLY_TABLE) { r -= e.p; if (r <= 0) { giveItem(st, e.id, e.q); got.push([e.id, e.q]); break; } }
  }
  log(st, "🪂 보급 투하: " + got.map(([i, q]) => `${ITEMS[i].name}×${q}`).join(", "), "good");
  return got;
}

export function researchSpeedupCost(st) {
  const cur = st.base.research.current;
  if (!cur) return 0;
  const r = RESEARCH.find((x) => x.id === cur);
  return Math.max(10, Math.ceil((r.cost - st.base.research.points) * 2));
}

export function speedupResearch(account, st) {
  const c = researchSpeedupCost(st);
  if (!c || account.gems < c) return false;
  account.gems -= c;
  const r = RESEARCH.find((x) => x.id === st.base.research.current);
  st.base.research.points = Math.max(st.base.research.points, r.cost);
  return true;
}

// ----- 일일 미션(무과금 보석 수급원) -----
export const DAILY = [
  { id: "gather", name: "자원 30회 채집", key: "gathered", n: 30, gems: 30 },
  { id: "craft", name: "아이템 5개 제작", key: "crafted", n: 5, gems: 30 },
  { id: "kill", name: "적 5마리 처치", key: "kills", n: 5, gems: 40 },
  { id: "days", name: "게임 속 3일 생존", key: "daysSurvived", n: 3, gems: 40 },
];

export function dailyState(account, st, now = Date.now()) {
  const t = todayStr(now);
  if (!account.daily || account.daily.date !== t) {
    account.daily = { date: t, start: { ...st.stats }, claimed: [] };
  }
  return DAILY.map((m) => {
    const prog = Math.max(0, (st.stats[m.key] || 0) - (account.daily.start[m.key] || 0));
    return { ...m, prog: Math.min(prog, m.n), done: prog >= m.n, claimed: account.daily.claimed.includes(m.id) };
  });
}

export function claimDaily(account, st, id, now = Date.now()) {
  const m = dailyState(account, st, now).find((x) => x.id === id);
  if (!m || !m.done || m.claimed) return 0;
  account.daily.claimed.push(id);
  account.gems += m.gems;
  return m.gems;
}

export { reviveGemCost };

// 훈련 교본: 실제 1시간 = 게임 14,400분 동안 경험치 +50%
export const XP_BOOST_GAME_MIN = 3600 * 4;
export function buyXpBoost(account, st) {
  if (account.gems < 150) return false;
  account.gems -= 150;
  st.buffs.xp = (st.buffs.xp || 0) + XP_BOOST_GAME_MIN;
  return true;
}
