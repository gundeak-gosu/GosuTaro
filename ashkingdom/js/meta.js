// 장기 성장·편의 시스템(라오킹·야생소년 벤치마킹) — 순수 함수, 시간은 now(ms)로 받는다.
// 원칙: 무과금도 시간을 들이면 전부 얻을 수 있다. 과금은 '기다림을 줄이는 편의'만 산다(전투력 직접 판매 없음).
import { BASE_LEVELS } from "./data.js";

// ---------- VIP(라오킹식): 매일 접속만 해도 오른다. 결제하면 더 빨리 ----------
// 점수: 매일 접속 20 + 연속 접속 1일당 10(최대 70) → 무과금 하루 최대 90점. 결제 1원 = 0.1점(4,900원 = 490점)
export const VIP = {
  levels: [0, 300, 900, 2000, 4000, 7500, 12000, 20000, 32000, 50000], // VIP0~9 필요 누적 점수
  perks: [
    // offH: 오프라인 진행 상한 +시간 / speed: 매일 무료 가속(분) / scout: 동물 탐색 충전 상한 + / exp: 원정 슬롯 + / gold: 금화 수입 +% / pick: 자동 줍기 반경 +
    { offH: 0, speed: 0, scout: 0, exp: 0, gold: 0, pick: 0 },
    { offH: 1, speed: 5, scout: 0, exp: 0, gold: 0, pick: 0 },
    { offH: 1, speed: 10, scout: 0, exp: 1, gold: 0, pick: 10 },
    { offH: 2, speed: 15, scout: 1, exp: 1, gold: 5, pick: 10 },
    { offH: 2, speed: 20, scout: 1, exp: 1, gold: 5, pick: 20 },
    { offH: 3, speed: 30, scout: 1, exp: 2, gold: 10, pick: 20 },
    { offH: 3, speed: 40, scout: 1, exp: 2, gold: 10, pick: 30 },
    { offH: 4, speed: 50, scout: 2, exp: 2, gold: 15, pick: 30 },
    { offH: 4, speed: 60, scout: 2, exp: 3, gold: 15, pick: 40 },
    { offH: 5, speed: 90, scout: 2, exp: 3, gold: 20, pick: 40 },
  ],
  perWon: 0.1,
};
export function vipLevel(pts) { let lv = 0; for (let i = 0; i < VIP.levels.length; i++) if (pts >= VIP.levels[i]) lv = i; return lv; }
export function vipPerk(acc) { return VIP.perks[vipLevel(acc.vip?.pts || 0)]; }
export function addVipFromPurchase(acc, won) { (acc.vip ||= { pts: 0 }).pts += Math.round(won * VIP.perWon); }

// ---------- 출석(야생소년식 7일 순환) + VIP 접속 점수 ----------
export const ATTEND = [
  { gems: 30 }, { item: ["speed_1h", 1] }, { gems: 50 }, { item: ["scent_lure", 2] }, { gems: 70 }, { item: ["speed_1h", 2] }, { gems: 150, key: 1 },
];
const dayKey = (now) => Math.floor((now + 9 * 3600e3) / 86400e3); // 한국 시간 자정 기준
export function attendState(acc, now = Date.now()) {
  const a = (acc.attend ||= { n: 0, last: -1, streak: 0 });
  return { canClaim: a.last !== dayKey(now), next: ATTEND[a.n % 7], dayIndex: a.n % 7, streak: a.streak, total: a.n };
}
export function claimAttend(acc, st, give, now = Date.now()) {
  const a = (acc.attend ||= { n: 0, last: -1, streak: 0 });
  const d = dayKey(now);
  if (a.last === d) return { ok: false, why: "오늘은 이미 받았습니다" };
  a.streak = a.last === d - 1 ? a.streak + 1 : 1;
  a.last = d;
  const r = ATTEND[a.n % 7];
  a.n++;
  if (r.gems) acc.gems += r.gems;
  if (r.item && st) give(st, r.item[0], r.item[1]);
  if (r.key) { acc.relics ||= { own: {}, load: {}, slots: {}, pts: 0, rustyAt: 0, keys: 0 }; acc.relics.keys += r.key; } // 7일차: 금고 열쇠
  // VIP 접속 점수: 20 + 연속 일수×10 (최대 90)
  (acc.vip ||= { pts: 0 }).pts += Math.min(90, 20 + a.streak * 10);
  return { ok: true, reward: r, streak: a.streak };
}

// ---------- 일일 활동도(라오킹 '활동 상자') ----------
// 행동마다 점수, 40/80/120 점에서 상자. 하루가 바뀌면 초기화
export const ACTIVITY = {
  pts: { gather: 1, kill: 2, craft: 3, site: 10, boss: 30, build: 8, expedition: 10 },
  caps: { gather: 30, kill: 30, craft: 24 },
  chests: [{ at: 40, gems: 20, item: ["speed_5m", 3] }, { at: 80, gems: 30, item: ["speed_1h", 1] }, { at: 120, gems: 50, item: ["whetstone", 1] }],
};
export function activity(st, now = Date.now()) {
  const a = (st.activity ||= { day: -1, pts: 0, by: {}, got: [] });
  if (a.day !== dayKey(now)) { a.day = dayKey(now); a.pts = 0; a.by = {}; a.got = []; }
  return a;
}
export function addActivity(st, kind, now = Date.now()) {
  const a = activity(st, now);
  const cap = ACTIVITY.caps[kind];
  const got = a.by[kind] || 0;
  const add = ACTIVITY.pts[kind] || 0;
  if (cap && got >= cap) return 0;
  a.by[kind] = got + add; a.pts += add;
  return add;
}
export function claimChest(acc, st, i, give, now = Date.now()) {
  const a = activity(st, now), c = ACTIVITY.chests[i];
  if (!c || a.pts < c.at || a.got.includes(i)) return false;
  a.got.push(i); acc.gems += c.gems; give(st, c.item[0], c.item[1]);
  return true;
}

// ---------- 기지 확장 공사(실시간) + 가속 ----------
// 공사 시간(분): Lv2 2분 … Lv8 24시간. 합계 약 52시간 — 무과금은 기다리고(오프라인에도 진행), 과금·가속으로 줄인다
export const BUILD_MIN = { 2: 2, 3: 15, 4: 60, 5: 180, 6: 480, 7: 960, 8: 1440 };
export const SPEED_ITEMS = { speed_5m: 5, speed_1h: 60, speed_8h: 480 };
export const GEM_PER_HOUR = 20; // 남은 1시간당 보석 20 (상점 표와 같다)
export function buildState(st, now = Date.now()) {
  const b = st.base.upgrading;
  if (!b) return null;
  return { to: b.to, left: Math.max(0, b.end - now), done: now >= b.end, total: BUILD_MIN[b.to] * 60e3 };
}
export function startBuild(st, S, now = Date.now()) {
  if (st.base.upgrading) return { ok: false, why: "이미 공사 중입니다" };
  const why = S.canUpgradeBase(st);
  if (why) return { ok: false, why };
  S.pay(st, S.baseUpgradeCost(st));
  const to = st.base.lv + 1;
  st.base.upgrading = { to, end: now + (BUILD_MIN[to] || 60) * 60e3 };
  return { ok: true, minutes: BUILD_MIN[to] };
}
// 끝났으면 실제로 레벨을 올린다(재료는 시작할 때 냈다)
export function finishBuildIfDone(st, S, now = Date.now()) {
  const b = buildState(st, now);
  if (!b || !b.done) return false;
  delete st.base.upgrading;
  st.base.lv = b.to;
  S.gainXp(st, 60 * st.base.lv);
  return true;
}
export function speedBuild(st, minutes) { if (st.base.upgrading) st.base.upgrading.end -= minutes * 60e3; }
export function gemsToFinish(st, now = Date.now()) { const b = buildState(st, now); return b ? Math.ceil((b.left / 3600e3) * GEM_PER_HOUR) : 0; }

// ---------- 원정 채집(라오킹 '채집 행군') ----------
// 기지의 동료를 탐험한 지역에 1/4/8시간 보낸다. 지역 단계가 높을수록, 동료 힘·지능이 높을수록 많이 가져온다
export const EXPEDITION = { hours: [1, 4, 8], baseSlots: 1, perHour: 6 };
export function expSlots(acc) { return EXPEDITION.baseSlots + (vipPerk(acc).exp || 0); }
export function startExpedition(st, acc, cuid, region, hours, now = Date.now()) {
  st.expeditions ||= [];
  if (st.expeditions.length >= expSlots(acc)) return { ok: false, why: `원정 슬롯이 가득 찼습니다(VIP로 늘어남)` };
  const c = st.companions.find((x) => x.uid === cuid);
  if (!c || c.task !== "base" || c.child) return { ok: false, why: "기지에 있는 어른 동료만 보낼 수 있습니다" };
  if (st.expeditions.some((e) => e.uid === cuid)) return { ok: false, why: "이미 원정 중" };
  c.task = "expedition";
  st.expeditions.push({ uid: cuid, rid: region.id, tier: region.tier, theme: region.theme, hours, end: now + hours * 3600e3 });
  return { ok: true };
}
// 원정 결과: 지역 테마별 주 자원 + 고철·가죽 등. 결정적(시드 없이 공식)이라 저장·검증이 쉽다
export function expeditionLoot(e, c) {
  const pow = 1 + ((c?.stats?.str || 5) + (c?.stats?.int || 5)) / 20 + (e.tier || 0) * 0.35;
  const n = Math.round(EXPEDITION.perHour * e.hours * pow);
  const main = { forest: "wood", jungle: "wood", taiga: "wood", plains: "fiber", savanna: "leather", desert: "scrap", mountain: "iron_ore", snow: "leather", city: "scrap", rad: "electronics", swamp: "herb", home: "wood" }[e.theme] || "wood";
  const out = [[main, n]];
  if (e.hours >= 4) out.push(["scrap", Math.round(n * 0.4)]);
  if (e.hours >= 8) out.push([e.tier >= 3 ? "steel" : "iron", Math.max(1, Math.round(e.tier + 1))]);
  return out;
}
export function collectExpeditions(st, give, now = Date.now()) {
  const done = [], keep = [];
  for (const e of st.expeditions || []) {
    if (now < e.end) { keep.push(e); continue; }
    const c = st.companions.find((x) => x.uid === e.uid);
    const loot = expeditionLoot(e, c);
    for (const [id, n] of loot) give(st, id, n);
    if (c) c.task = "base";
    done.push({ e, c, loot });
  }
  st.expeditions = keep;
  return done;
}
