// 구세계 유물(야생소년 '토템' 벤치마킹, 우리 세계관: 핵전쟁 전 문명의 유물)
// - 직업마다 3칸(생존·전투·기술)에 유물을 하나씩 끼우고 새 생애를 시작하면 효과를 받는다.
// - 칸은 그 직업의 최대 생존 기록(일)으로 무료 해금, 또는 보석으로 바로 오픈.
// - 유물은 '구세계 금고'에서 얻는다: 녹슨 보급함(12시간마다 무료) · 강철 금고(보석 30) · 군용 벙커 금고(보석 300 또는 금고 열쇠).
//   확률 공개 + 천장(200점이면 다음 군용 금고에서 전설 확정). 중복은 유물 강화(+1단계, 최대 5).
export const RARITY = [
  { id: 0, name: "일반", color: "#b9b2a6" }, { id: 1, name: "희귀", color: "#5ab0e0" },
  { id: 2, name: "영웅", color: "#b07ae0" }, { id: 3, name: "전설", color: "#e0a24a" },
];
export const CATS = { surv: "생존 유물", combat: "전투 유물", tech: "기술 유물" };
// fx: 시작 시 적용되는 효과(단계마다 +15%). start: 시작 아이템
export const RELICS = {
  canteen: { cat: "surv", r: 0, name: "군용 수통", icon: "🫙", desc: "깨끗한 물 +3, 빈 병 +2로 시작", start: [["water_clean", 3], ["bottle", 2]] },
  seedbox: { cat: "surv", r: 1, name: "종자 은행 상자", icon: "🌱", desc: "씨앗 6·감자 4로 시작, 배고픔 -5%", start: [["seed", 6], ["potato", 4]], fx: { hunger: -0.05 } },
  ration: { cat: "surv", r: 2, name: "전투 식량 상자", icon: "🥫", desc: "배고픔·목마름 -12%", fx: { hunger: -0.12, thirst: -0.12 }, start: [["canned_food", 4]] },
  geiger: { cat: "surv", r: 3, name: "가이거 계수기", icon: "☢️", desc: "방사능 피해 -30%, 항방사능제 2", fx: { rad: 0.3 }, start: [["radaway", 2]] },
  dogtag: { cat: "combat", r: 0, name: "녹슨 군번줄", icon: "🏷️", desc: "모든 피해 +5%", fx: { atk: 0.05 } },
  scope: { cat: "combat", r: 1, name: "깨진 조준경", icon: "🔭", desc: "원거리 피해 +12%", fx: { ranged: 0.12 } },
  plate: { cat: "combat", r: 2, name: "방탄판", icon: "🛡️", desc: "방어 +4", fx: { def: 4 } },
  banner: { cat: "combat", r: 3, name: "옛 왕국의 군기", icon: "🚩", desc: "모든 피해 +12%, 방어 +3", fx: { atk: 0.12, def: 3 } },
  toolkit: { cat: "tech", r: 0, name: "공구 가방", icon: "🧰", desc: "돌도끼·돌곡괭이를 들고 시작", start: [["stone_axe", 1], ["stone_pick", 1]] },
  manual: { cat: "tech", r: 1, name: "생존 교범", icon: "📗", desc: "손재주 +2(제작 품질↑)", fx: { cra: 2 } },
  battery: { cat: "tech", r: 2, name: "원자 전지", icon: "🔋", desc: "전자부품 4·연료 3, 경험치 +5%", fx: { xp: 0.05 }, start: [["electronics", 4], ["fuel", 3]] },
  aichip: { cat: "tech", r: 3, name: "구세계 AI 칩", icon: "💠", desc: "경험치 +15%, 연구 +20%", fx: { xp: 0.15, research: 0.2 } },
};
// 칸 해금: 그 직업 최대 생존 기록(일) 또는 보석
export const SLOT_RULE = { surv: { days: 0, gems: 0 }, combat: { days: 30, gems: 270 }, tech: { days: 60, gems: 360 } };
export const VAULTS = {
  rusty: { name: "녹슨 보급함", desc: "12시간마다 무료로 연다", cost: {}, cooldownH: 12, odds: [80, 18, 2, 0], pt: 2 },
  steel: { name: "강철 금고", desc: "보석 30", cost: { gems: 30 }, odds: [55, 35, 9, 1], pt: 6 },
  bunker: { name: "군용 벙커 금고", desc: "보석 300 또는 금고 열쇠", cost: { gems: 300, key: 1 }, odds: [0, 50, 40, 10], pt: 40 },
};
export const PITY = 200;

export function relicState(acc) { acc.relics ||= { own: {}, load: {}, slots: {}, pts: 0, rustyAt: 0, keys: 0 }; return acc.relics; }
export function relicLv(acc, id) { return relicState(acc).own[id] || 0; }
export function slotOpen(acc, job, cat) {
  const R = relicState(acc);
  return (acc.maxDays?.[job] || 0) >= SLOT_RULE[cat].days || !!R.slots[`${job}:${cat}`];
}
export function buySlot(acc, job, cat) {
  if (slotOpen(acc, job, cat)) return { ok: false, why: "이미 열림" };
  const g = SLOT_RULE[cat].gems;
  if (acc.gems < g) return { ok: false, why: `보석 ${g} 필요` };
  acc.gems -= g; relicState(acc).slots[`${job}:${cat}`] = true;
  return { ok: true };
}
export function equipRelic(acc, job, id) {
  const R = relicState(acc), d = RELICS[id];
  if (!d || !R.own[id]) return { ok: false, why: "가지고 있지 않은 유물" };
  if (!slotOpen(acc, job, d.cat)) return { ok: false, why: "칸이 잠겨 있습니다" };
  (R.load[job] ||= {})[d.cat] = id;
  return { ok: true };
}
export function unequipRelic(acc, job, cat) { const L = relicState(acc).load[job]; if (L) delete L[cat]; }

// 금고 열기: 확률표대로 등급 → 그 등급 유물 중 하나. 천장 200점이면 군용 금고에서 전설 확정
export function openVault(acc, kind, rng = Math.random, now = Date.now(), useKey = false) {
  const V = VAULTS[kind], R = relicState(acc);
  if (!V) return { ok: false };
  if (kind === "rusty") { if (now < R.rustyAt) return { ok: false, why: `다음 무료까지 ${Math.ceil((R.rustyAt - now) / 60000)}분` }; R.rustyAt = now + V.cooldownH * 3600e3; }
  else if (useKey && V.cost.key) { if (R.keys < 1) return { ok: false, why: "금고 열쇠가 없습니다" }; R.keys--; }
  else { if (acc.gems < V.cost.gems) return { ok: false, why: `보석 ${V.cost.gems} 필요` }; acc.gems -= V.cost.gems; }
  let r;
  if (kind === "bunker" && R.pts >= PITY) { r = 3; R.pts = 0; }
  else { const x = rng() * 100; let acc2 = 0; r = 0; for (let i = 0; i < 4; i++) { acc2 += V.odds[i]; if (x < acc2) { r = i; break; } } R.pts += V.pt; if (r === 3 && kind === "bunker") R.pts = 0; }
  const pool = Object.keys(RELICS).filter((k) => RELICS[k].r === r);
  const id = pool[Math.floor(rng() * pool.length)];
  const before = R.own[id] || 0;
  R.own[id] = Math.min(5, before + 1);
  return { ok: true, id, rarity: r, dup: before > 0, lv: R.own[id] };
}

// 새 생애 시작 시 효과 합계(단계마다 +15%) + 시작 아이템
export function loadoutFx(acc, job) {
  const L = relicState(acc).load[job] || {};
  const fx = {}, start = [];
  for (const cat of Object.keys(CATS)) {
    const id = L[cat]; if (!id || !slotOpen(acc, job, cat)) continue;
    const d = RELICS[id], k = 1 + 0.15 * (relicLv(acc, id) - 1);
    for (const [f, v] of Object.entries(d.fx || {})) fx[f] = (fx[f] || 0) + v * k;
    for (const s of d.start || []) start.push(s);
  }
  return { fx, start };
}
