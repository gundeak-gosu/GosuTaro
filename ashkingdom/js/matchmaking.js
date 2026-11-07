// =====================================================================
// 국가 등급 · 전쟁 매칭 · 올림픽 조 편성 — 순수 로직(서버 SQL 과 같은 규칙, Node 테스트 가능)
//  - 나라급: 거점 Lv4 + 주민 5명 이상이면 '국가'로 선포 → 올림픽·전쟁 참가 가능
//  - 급수(1~7): 국력으로 결정. 모든 매칭과 순위는 급수 단위
//  - 전쟁: 가까운 같은 급수 → 반경 확대 → ±1급 → ±2급 → 근처 봇
//  - 올림픽: 64개국 조. 대륙 비율 할당량을 같은 급수로 채우고, 부족하면 ±1급 → ±2급 → 봇
// =====================================================================
import { makeRng, hashStr } from "./rng.js";
import { SURVIVOR_NAMES } from "./data.js";

export const NATION_REQ = { baseLv: 4, residents: 5 };
export const GRADES = [
  { g: 1, name: "부족국가", min: 0 },
  { g: 2, name: "도시국가", min: 700 },
  { g: 3, name: "영주국", min: 1200 },
  { g: 4, name: "공국", min: 1900 },
  { g: 5, name: "왕국", min: 2800 },
  { g: 6, name: "대왕국", min: 4000 },
  { g: 7, name: "제국", min: 5600 },
];
export const CONTINENTS = { asia: "아시아", europe: "유럽", africa: "아프리카", namerica: "북아메리카", samerica: "남아메리카", oceania: "오세아니아" };
// 64개국 조의 대륙 할당(실제 인구·육지 비중을 반영한 고정 비율)
export const QUOTA = { asia: 20, europe: 12, africa: 10, namerica: 10, samerica: 7, oceania: 5 };
export const GROUP_SIZE = 64;

export function continentOf(region) {
  if (["동아시아", "동남아시아", "남아시아", "중동", "시베리아·중앙아시아", "중앙아시아"].includes(region)) return "asia";
  if (region === "유럽") return "europe";
  if (region === "아프리카") return "africa";
  if (["북아메리카", "중앙아메리카", "그린란드"].includes(region)) return "namerica";
  if (region === "남아메리카") return "samerica";
  return "oceania"; // 오세아니아, 외딴 섬
}

// ---------- 국가 ----------
export function isNation(st) { return st.base.lv >= NATION_REQ.baseLv && st.companions.length >= NATION_REQ.residents; }
// 국력 = 전투력 + 인구 + 성 규모 + 시설 + 세계 재건 기여
export function nationPower(st, combatPower) {
  return Math.round(combatPower + st.companions.length * 20 + st.base.lv * 60 + st.base.buildings.length * 6 + (st.story.restore || 0) * 12);
}
export function gradeOf(power) { let g = GRADES[0]; for (const x of GRADES) if (power >= x.min) g = x; return g; }
export function nextGrade(power) { return GRADES.find((x) => x.min > power) || null; }

// 내 국가 카드(서버에 올리는 '결과 한 줄'): 위치는 0.5° 칸 중심으로 뭉개서 개인 위치를 보호
export function kingdomCard(st, combatPower, name) {
  const power = nationPower(st, combatPower);
  const geo = st.geo;
  return {
    name: name || st.player.name,
    lat: Math.round(geo.lat * 2) / 2, lon: Math.round(geo.lon * 2) / 2,
    continent: continentOf(geo.region), region: geo.region,
    grade: gradeOf(power).g, power, level: st.player.level,
  };
}

// ---------- 봇 국가 ----------
const BOT_PREFIX = ["북부", "강변", "철의", "푸른", "잿빛", "남쪽", "붉은", "새벽", "바람의", "돌산"];
const BOT_SUFFIX = ["연합", "자치령", "공국", "왕국", "부족", "도시", "수호국"];
const CONT_BOX = { asia: [[10, 55], [70, 140]], europe: [[40, 60], [-5, 35]], africa: [[-25, 15], [10, 40]], namerica: [[30, 55], [-120, -75]], samerica: [[-35, 0], [-70, -45]], oceania: [[-35, -20], [118, 150]] };
export function makeBot(seedStr, grade, near = null, continent = null) {
  const r = makeRng(seedStr);
  const g = GRADES[Math.max(0, Math.min(6, grade - 1))];
  const hi = (GRADES[grade] || { min: g.min * 1.4 + 500 }).min;
  const power = Math.round(r.range(g.min, Math.max(g.min + 50, hi - 1)));
  let lat, lon, cont = continent;
  if (near) { lat = near.lat + r.range(-6, 6); lon = near.lon + r.range(-8, 8); cont = cont || near.continent; }
  else { const b = CONT_BOX[cont || "asia"]; lat = r.range(b[0][0], b[0][1]); lon = r.range(b[1][0], b[1][1]); }
  return {
    id: "bot:" + seedStr, bot: true,
    name: `${r.pick(BOT_PREFIX)} ${r.pick(BOT_SUFFIX)}`, ruler: r.pick(SURVIVOR_NAMES[r.chance(0.5) ? "M" : "F"]),
    lat: Math.round(lat * 2) / 2, lon: Math.round(lon * 2) / 2, continent: cont || "asia", grade, power, level: Math.round(8 + grade * 7 * r.range(0.8, 1.2)),
  };
}

// ---------- 거리 ----------
const toRad = (d) => (d * Math.PI) / 180;
export function km(a, b) {
  const dA = toRad(b.lat - a.lat), dO = toRad(b.lon - a.lon);
  const h = Math.sin(dA / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dO / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function bearing(a, b) {
  const y = Math.sin(toRad(b.lon - a.lon)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lon - a.lon));
  const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return ["북", "북동", "동", "남동", "남", "남서", "서", "북서"][Math.round(deg / 45) % 8];
}

// ---------- 전쟁 매칭 ----------
// 단계: (같은 급, 500km) → (같은 급, 1500km) → (같은 급, 4000km) → (±1급, 4000km) → (±2급, 전세계) → 봇
export const WAR_STEPS = [
  { dg: 0, r: 500, label: "근처의 같은 급" }, { dg: 0, r: 1500, label: "같은 급(지역)" }, { dg: 0, r: 4000, label: "같은 급(대륙권)" },
  { dg: 1, r: 4000, label: "한 급 위·아래" }, { dg: 2, r: 20040, label: "두 급 위·아래(전세계)" },
];
export function findWarOpponents(me, pool, seedStr, want = 3) {
  const rng = makeRng(seedStr);
  const cands = pool.filter((k) => k.id !== me.id);
  for (const step of WAR_STEPS) {
    const ok = cands.filter((k) => Math.abs(k.grade - me.grade) <= step.dg && km(me, k) <= step.r);
    if (ok.length >= Math.min(want, 1)) {
      // 가까운 순 상위 10곳 중에서 무작위 — '주위의 비슷한 상대가 랜덤으로'
      const near = ok.sort((a, b) => km(me, a) - km(me, b)).slice(0, 10);
      const picked = [];
      while (picked.length < want && near.length) picked.push(near.splice(Math.floor(rng.next() * near.length), 1)[0]);
      if (picked.length < want) for (let i = picked.length; i < want; i++) picked.push(makeBot(`${seedStr}|fill${i}`, me.grade, me));
      return { step: step.label, list: picked.map((k) => ({ ...k, km: Math.round(km(me, k)), dir: bearing(me, k) })) };
    }
  }
  const bots = Array.from({ length: want }, (_, i) => makeBot(`${seedStr}|b${i}`, me.grade, me));
  return { step: "주변에 상대 국가가 없어 봇", list: bots.map((k) => ({ ...k, km: Math.round(km(me, k)), dir: bearing(me, k) })) };
}

// ---------- 올림픽 조 편성 ----------
// groups: [{ id, grade, members: [{id, continent, grade}] }]  — 서버 RPC ashk_join_olympics 와 같은 규칙
export function assignGroup(me, groups) {
  const room = (gr) => gr.members.length < GROUP_SIZE && gr.members.filter((m) => m.continent === me.continent).length < QUOTA[me.continent];
  for (const dg of [0, 1, 2]) {
    const g = groups.find((gr) => Math.abs(gr.grade - me.grade) === dg && room(gr) && !gr.members.some((m) => m.id === me.id));
    if (g) { g.members.push({ id: me.id, continent: me.continent, grade: me.grade }); return { group: g, dg }; }
  }
  const g = { id: `G${me.grade}-${groups.length + 1}`, grade: me.grade, members: [{ id: me.id, continent: me.continent, grade: me.grade }] };
  groups.push(g);
  return { group: g, dg: 0 };
}

// 조의 빈 대륙 슬롯을 봇으로 채워 항상 64개국 · 대륙 비율을 맞춘다
export function fillGroupWithBots(group, members, seasonId) {
  const out = [...members];
  for (const [cont, q] of Object.entries(QUOTA)) {
    const have = out.filter((m) => m.continent === cont).length;
    for (let i = have; i < q; i++) out.push(makeBot(`${seasonId}|${group.id}|${cont}|${i}`, group.grade, null, cont));
  }
  return out.slice(0, GROUP_SIZE);
}

// 오프라인/서버 없는 환경: 같은 급의 '가상 세계 인구'를 결정적으로 만든다(시즌마다 동일)
export function simulatedPool(seasonId, grade, n = 240) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const cont = Object.keys(QUOTA)[i % 6];
    const gg = Math.max(1, Math.min(7, grade + [0, 0, 0, 1, -1, 2, -2][i % 7]));
    out.push(makeBot(`${seasonId}|pool|${i}`, gg, null, cont));
  }
  return out;
}

// 오프라인(또는 조가 비었을 때) 조 구성: 대륙 할당량마다 같은 급 → ±1급 → ±2급 순으로 채우고 남으면 봇
export function composeGroupOffline(me, pool, seasonId) {
  const used = new Set([me.id]);
  const out = [me];
  for (const [cont, q] of Object.entries(QUOTA)) {
    let need = q - out.filter((m) => m.continent === cont).length;
    for (const dg of [0, 1, 2]) {
      if (need <= 0) break;
      for (const k of pool) {
        if (need <= 0) break;
        if (used.has(k.id) || k.continent !== cont || Math.abs(k.grade - me.grade) !== dg) continue;
        used.add(k.id); out.push(k); need--;
      }
    }
  }
  return fillGroupWithBots({ id: `G${me.grade}-off`, grade: me.grade }, out, seasonId);
}

// 오프라인 전쟁 후보: 내 주변(수백~수천 km)에 흩어진 다양한 급의 국가들
export function nearbyBotPool(me, seasonId, n = 30) {
  const r = makeRng(`${seasonId}|near|${me.lat}|${me.lon}`);
  return Array.from({ length: n }, (_, i) => makeBot(`${seasonId}|near|${me.lat}|${me.lon}|${i}`, Math.max(1, Math.min(7, me.grade + [0, 0, 0, 1, -1, 2, -2][i % 7])), { lat: me.lat + r.range(-15, 15), lon: me.lon + r.range(-20, 20), continent: me.continent }));
}

// 급별 순위: 같은 급 국가들 사이에서 국력 기준 내 순위
export function gradeRanking(me, pool) {
  const same = pool.filter((k) => k.grade === me.grade && k.id !== me.id).concat([{ ...me, me: true }]);
  same.sort((a, b) => b.power - a.power);
  return { rank: same.findIndex((k) => k.me) + 1, total: same.length, top: same.slice(0, 100) };
}

export function botLabel(k) { return k.bot ? "🤖" : ""; }
export const seedOf = (s) => hashStr(String(s));
