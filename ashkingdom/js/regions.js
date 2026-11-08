// 지역 지도(야생소년식 노드 지도) — 판마다 시드로 지역 배치가 달라지지만 규칙(단계·미션)은 같다.
// 세계는 끝나지 않는다: 지도 가장자리로 걸어가면 옆 지역으로 넘어간다. 단, 그 지역이 '열려' 있어야 한다.
// 지역을 여는 방법 = 이웃 지역의 미션을 깨는 것. 그래서 미션을 깰수록 탐험 범위가 넓어진다.
import { makeRng } from "./rng.js";

// 지형 테마: biome(기후·자원 표) + 지형 보정(물·바위·폐허·방사능 비율) + 이름
export const THEMES = {
  home: { name: "잿빛 고향", icon: "🏕️" },
  forest: { name: "울창한 숲", biome: "temperate", mod: { grass: -0.18, tree: 1.8 }, icon: "🌲" },
  jungle: { name: "습한 밀림", biome: "rainforest", mod: { water: 0.04, tree: 2.2 }, icon: "🌴" },
  plains: { name: "쓸쓸한 초원", biome: "steppe", mod: { grass: -0.1 }, icon: "🌾" },
  desert: { name: "메마른 사막", biome: "desert", mod: { sand: 0.1 }, icon: "🏜️" },
  snow: { name: "눈 덮인 산맥", biome: "tundra", mod: { snow: 0.15, rock: -0.06 }, icon: "🏔️" },
  taiga: { name: "얼어붙은 숲", biome: "taiga", mod: { snow: 0.1 }, icon: "🌲" },
  swamp: { name: "독기 늪지", biome: "rainforest", mod: { water: 0.1, stream: 0.25, rad: -0.06 }, icon: "🐸" },
  mountain: { name: "바위 협곡", biome: "temperate", mod: { rock: -0.2 }, icon: "⛰️", ore: 2 },
  city: { name: "무너진 도시", biome: "temperate", mod: { ruin: 0.35, grass: 0.2 }, icon: "🏙️", scrap: 2.2 },
  rad: { name: "죽음의 방사능 지대", biome: "steppe", mod: { rad: -0.18 }, icon: "☢️" },
  savanna: { name: "황금 사바나", biome: "savanna", mod: {}, icon: "🦒" },
};

// 미션 종류: 그 지역 안에서 해야 한다. n 은 단계(tier)가 높을수록 커진다.
const MISSIONS = [
  { kind: "kill", text: (n) => `이 지역의 적 ${n}마리 처치`, n: (t) => 4 + t * 3 },
  { kind: "explore", text: (n) => `이 지역을 ${n}% 탐험`, n: (t) => Math.min(60, 25 + t * 6) },
  { kind: "gather", text: (n) => `이 지역에서 자원 ${n}번 채집`, n: (t) => 12 + t * 6 },
];

const DIRS = [[1, 0, "동"], [-1, 0, "서"], [0, 1, "남"], [0, -1, "북"]];

// 격자(가로 7 × 세로 5) 위에 지역을 놓는다. 고향은 가운데. 칸이 이웃이면 길로 이어진다(일부 길은 끊어서 미로처럼).
export function buildRegions(seed, homeBiome = "temperate") {
  const rng = makeRng((seed ^ 0x7e91) >>> 0);
  const W = 7, H = 5, hx = 3, hy = 2;
  const themes = Object.keys(THEMES).filter((k) => k !== "home");
  const regions = [];
  const at = {};
  let id = 0;
  // 고향
  regions.push({ id: id++, gx: hx, gy: hy, theme: "home", biome: homeBiome, tier: 0, name: THEMES.home.name });
  at[`${hx},${hy}`] = 0;
  const count = {};
  for (let gy = 0; gy < H; gy++) for (let gx = 0; gx < W; gx++) {
    if (gx === hx && gy === hy) continue;
    if (rng.chance(0.12)) continue; // 빈칸(지도에 구멍) — 돌아가야 하는 길
    const dist = Math.abs(gx - hx) + Math.abs(gy - hy);
    // 가까운 곳은 순한 지형, 멀수록 험한 지형(방사능·설산·늪)
    const pool = dist <= 1 ? ["forest", "plains", "savanna", "jungle"] : dist <= 3 ? ["forest", "plains", "desert", "city", "mountain", "taiga", "swamp", "savanna", "jungle"] : ["snow", "rad", "swamp", "city", "mountain", "desert", "taiga"];
    const theme = rng.pick(pool);
    count[theme] = (count[theme] || 0) + 1;
    const r = { id: id++, gx, gy, theme, biome: THEMES[theme].biome, tier: dist, name: `${THEMES[theme].name}-${count[theme]}` };
    const m = MISSIONS[rng.int(0, MISSIONS.length - 1)];
    r.mission = { kind: m.kind, n: m.n(dist) };
    regions.push(r);
    at[`${gx},${gy}`] = r.id;
  }
  // 고향 미션 = 이야기 1장(모닥불·작업대) — 첫 확장은 기본 생존을 갖춘 뒤
  regions[0].mission = { kind: "chapter", n: 2 };
  // 이웃 연결(가끔 끊음, 단 고향에서 모든 지역에 닿을 수 있게)
  for (const r of regions) {
    r.links = {};
    for (const [dx, dy, dn] of DIRS) {
      const o = at[`${r.gx + dx},${r.gy + dy}`];
      if (o !== undefined) r.links[dn] = o;
    }
  }
  for (const r of regions) for (const [dn, o] of Object.entries(r.links)) {
    if (r.id < o && rng.chance(0.18)) {
      const back = { 동: "서", 서: "동", 남: "북", 북: "남" }[dn];
      delete r.links[dn]; delete regions[o].links[back];
      if (!connectedAll(regions)) { r.links[dn] = o; regions[o].links[back] = r.id; }
    }
  }
  // 고향에서 닿지 않는 섬은 버린다
  const reach = reachable(regions);
  return regions.filter((r) => reach.has(r.id)).map((r) => ({ ...r, links: Object.fromEntries(Object.entries(r.links).filter(([, o]) => reach.has(o))) }));
}
function reachable(regions) {
  const seen = new Set([0]), q = [0];
  while (q.length) { const r = regions[q.shift()]; for (const o of Object.values(r.links)) if (!seen.has(o)) { seen.add(o); q.push(o); } }
  return seen;
}
function connectedAll(regions) { return reachable(regions).size === regions.length; }

// ---------- 진행 상태(저장 파일) ----------
// st.regions = { cur: 지역 id, s: { [id]: { fog: base64 비트, done: bool, prog: 숫자 } }, bridges: { [id]: [타일 번호...] } }
export function regionState(st) {
  st.regions ||= { cur: 0, s: {}, bridges: {} };
  st.regions.s ||= {}; st.regions.bridges ||= {};
  return st.regions;
}
export function rs(st, id) { const R = regionState(st); return (R.s[id] ||= { fog: "", done: false, prog: 0 }); }

// 지역이 열려 있나: 고향은 항상. 그 외는 '미션을 깬 이웃'이 하나라도 있으면.
export function isUnlocked(st, regions, id) {
  if (id === 0) return true;
  const r = regions.find((x) => x.id === id);
  if (!r) return false;
  return Object.values(r.links).some((o) => missionDone(st, regions, o));
}
export function missionDone(st, regions, id) {
  const r = regions.find((x) => x.id === id);
  if (!r) return false;
  if (r.mission.kind === "chapter") return (st.story?.chapter ?? 0) >= r.mission.n;
  return !!rs(st, id).done;
}
export function missionText(r) {
  if (r.mission.kind === "chapter") return "이야기 2장까지 진행(모닥불·작업대 짓기)";
  return MISSIONS.find((m) => m.kind === r.mission.kind).text(r.mission.n);
}
// 왜 못 가는지(잠겨 있으면 어떤 미션을 깨야 하는지)
export function lockReason(st, regions, id) {
  const r = regions.find((x) => x.id === id);
  const nb = Object.values(r.links).map((o) => regions.find((x) => x.id === o)).filter((o) => isUnlocked(st, regions, o.id));
  if (!nb.length) return "아직 이 지역으로 가는 길을 모른다";
  return nb.map((o) => `「${o.name}」 미션: ${missionText(o)}`).join(" 또는 ");
}

// 미션 진행: kind 가 같으면 1 올리고, 목표에 닿으면 완료. 반환: 방금 완료했으면 true
export function addProgress(st, regions, kind, amt = 1, explorePct = null) {
  const R = regionState(st);
  const r = regions.find((x) => x.id === R.cur);
  if (!r || r.mission.kind !== kind) return false;
  const s = rs(st, r.id);
  if (s.done) return false;
  if (kind === "explore") s.prog = Math.max(s.prog, Math.floor(explorePct));
  else s.prog += amt;
  if (s.prog >= r.mission.n) { s.done = true; return true; }
  return false;
}

// ---------- 안개(탐험한 곳만 밝게) ----------
export function fogLoad(b64, size) {
  const a = new Uint8Array(size);
  if (!b64) return a;
  try {
    const bin = atob(b64);
    for (let i = 0; i < size; i++) a[i] = (bin.charCodeAt(i >> 3) >> (i & 7)) & 1;
  } catch { /* 깨진 데이터 → 처음부터 */ }
  return a;
}
export function fogSave(a) {
  const n = Math.ceil(a.length / 8), bytes = new Uint8Array(n);
  for (let i = 0; i < a.length; i++) if (a[i]) bytes[i >> 3] |= 1 << (i & 7);
  let s = "";
  for (let i = 0; i < n; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
// 반경 r 칸을 밝힘. 새로 밝힌 칸 수를 돌려준다
export function reveal(fog, W, H, tx, ty, r = 7) {
  let n = 0;
  for (let y = Math.max(0, ty - r); y <= Math.min(H - 1, ty + r); y++) for (let x = Math.max(0, tx - r); x <= Math.min(W - 1, tx + r); x++) {
    if ((x - tx) ** 2 + (y - ty) ** 2 > r * r) continue;
    const i = y * W + x;
    if (!fog[i]) { fog[i] = 1; n++; }
  }
  return n;
}
export function fogPct(fog) { let n = 0; for (let i = 0; i < fog.length; i++) n += fog[i]; return (n / fog.length) * 100; }
