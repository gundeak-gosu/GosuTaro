// 월드 생성 — 시드로부터 결정적으로 생성하므로 저장 파일에는 '고갈된 자원 노드'만 저장한다.
// (저장 용량 최소화 + 서버 저장 비용 최소화)
import { makeRng, valueNoise2D, hashStr } from "./rng.js";
import { POIS, POI_RULES, BIOMES } from "./data.js";

export const TILE = 32;
export const WORLD_W = 128;
export const WORLD_H = 128;

export const T = { ASH: 0, GRASS: 1, RUIN: 2, WATER: 3, RAD: 4, ROCK: 5, BASE: 6, ROAD: 7, SAND: 8, SNOW: 9, STREAM: 10, BRIDGE: 11 };
export const TILE_INFO = {
  0: { name: "잿빛 황무지", color: "#6f6a60" },
  1: { name: "되살아난 숲", color: "#4f6b3a" },
  2: { name: "폐허", color: "#5a5a5e" },
  3: { name: "물", color: "#2f4f63", block: true },
  4: { name: "방사능 지대", color: "#5c7a2e", rad: 1 },
  5: { name: "바위 지대", color: "#57504a" },
  6: { name: "기지", color: "#7a6a52" },
  7: { name: "옛 도로", color: "#3d3b39" },
  8: { name: "모래", color: "#c8b07a" },
  9: { name: "눈밭", color: "#e3e7ea" },
  10: { name: "얕은 샛강", color: "#4d7a8c", slow: 0.45 }, // 지나갈 수 있지만 느리다
  11: { name: "다리", color: "#7a5a3a" },
};

export const NODE_TYPES = {
  tree: { name: "죽은 나무", icon: "🌲", hp: 3, respawnH: 36 },
  rock: { name: "바위", icon: "🪨", hp: 4, respawnH: 48 },
  scrap: { name: "고철 더미", icon: "🗑️", hp: 3, respawnH: 60 },
  bush: { name: "덤불", icon: "🌿", hp: 1, respawnH: 24 },
  herb: { name: "약초", icon: "🌱", hp: 1, respawnH: 30 },
  crate: { name: "보급 상자", icon: "📦", hp: 1, respawnH: 96 },
  car: { name: "버려진 차", icon: "🚗", hp: 5, respawnH: 120 },
};

// biome: 낙하 지점의 생물군계. 같은 좌표(시드)+같은 군계 = 같은 지형.
// opts: { home: 고향(기지·이야기 장소 있음), rid: 지역 번호(노드 id 구분), theme: THEMES 항목(지형 보정) }
export function generateWorld(seed, biome = "temperate", opts = {}) {
  const home = opts.home !== false;
  const B = BIOMES[biome] || BIOMES.temperate;
  const M = opts.theme?.mod || {};
  const TL = { ...B.tiles }, NM = { ...B.nodes };
  // 지형 테마 보정: 물↑, 바위 문턱↓(=바위↑), 폐허↑, 방사능 문턱↓(=방사능↑), 풀 문턱, 모래·눈
  TL.water += M.water || 0; TL.rock += M.rock || 0; TL.ruin += M.ruin || 0; TL.grass += M.grass || 0;
  if (M.sand) TL.sand = (TL.sand || 0) + M.sand; if (M.snow) TL.snow = (TL.snow || 0) + M.snow;
  if (M.tree) NM.tree = (NM.tree ?? 1) * M.tree;
  if (opts.theme?.ore) NM.rock = (NM.rock ?? 1) * opts.theme.ore;
  if (opts.theme?.scrap) NM.scrap = (NM.scrap ?? 1) * opts.theme.scrap;
  const radTh = 0.74 + (M.rad || 0);
  const s = typeof seed === "string" ? hashStr(seed) : seed;
  const n1 = valueNoise2D(s), n2 = valueNoise2D(s ^ 0x9e3779b9), n3 = valueNoise2D(s ^ 0x85ebca6b);
  const rng = makeRng(s ^ 0x1234567);
  const tiles = new Uint8Array(WORLD_W * WORLD_H);
  const cx = WORLD_W / 2, cy = WORLD_H / 2;

  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      const e = n1(x / 14, y / 14) * 0.7 + n1(x / 5, y / 5) * 0.3;
      const m = n2(x / 18, y / 18);
      const r = n3(x / 11, y / 11);
      let t = T.ASH;
      const n4 = n3(x / 7 + 50, y / 7 + 50);
      if (e < TL.water) t = T.WATER;
      else if (e > TL.rock) t = T.ROCK;
      else if (r > radTh) t = T.RAD;
      else if (TL.snow && n4 < TL.snow) t = T.SNOW;
      else if (TL.sand && n4 < TL.sand) t = T.SAND;
      else if (m > TL.grass) t = T.GRASS;
      else if (m < TL.ruin) t = T.RUIN;
      tiles[y * WORLD_W + x] = t;
    }
  }
  // 강: 지도를 가로지르는 깊은 강(건널 수 없음) + 군데군데 얕은 여울(느리게 건넘). 다리를 놓으면 어디서든 건넌다
  const vert = rng.chance(0.5), off = rng.range(0.25, 0.75) * WORLD_W, fords = [rng.range(0.15, 0.4), rng.range(0.6, 0.85)].map((f) => Math.round(f * WORLD_W));
  for (let i = 0; i < WORLD_W; i++) {
    const c = Math.round(off + (n2(i / 16, 7.7) - 0.5) * 40);
    const ford = fords.some((f) => Math.abs(f - i) <= 1);
    for (let w = -1; w <= 1; w++) {
      const [x, y] = vert ? [c + w, i] : [i, c + w];
      if (home && Math.abs(x - cx) < 9 && Math.abs(y - cy) < 9) continue; // 기지는 피해서
      setT(tiles, x, y, ford ? T.STREAM : T.WATER);
    }
  }
  // 샛강: 얕은 물줄기 몇 개(늪지는 많이)
  const nStream = 2 + Math.round((M.stream || 0) * 20);
  for (let k = 0; k < nStream; k++) {
    let x = rng.int(4, WORLD_W - 5), y = rng.int(4, WORLD_H - 5), a = rng.range(0, Math.PI * 2);
    for (let step = 0; step < 50; step++) {
      a += (n3(step / 5, k * 3.1) - 0.5) * 0.9;
      x += Math.round(Math.cos(a)); y += Math.round(Math.sin(a));
      if (!inside(x, y) || (home && Math.abs(x - cx) < 8 && Math.abs(y - cy) < 8)) break;
      if (tiles[y * WORLD_W + x] !== T.WATER) setT(tiles, x, y, T.STREAM);
    }
  }
  // 네 방향 가장자리 가운데는 옆 지역으로 가는 길목 — 막히지 않게 비워 둔다
  for (const [ex, ey, dx, dy] of [[WORLD_W - 1, cy, -1, 0], [0, cy, 1, 0], [cx, WORLD_H - 1, 0, -1], [cx, 0, 0, 1]]) {
    for (let i = 0; i < 8; i++) for (let w = -2; w <= 2; w++) {
      const x = ex + dx * i + (dy ? w : 0), y = ey + dy * i + (dx ? w : 0);
      const t = tiles[y * WORLD_W + x];
      if (t === T.WATER || t === T.ROCK || t === T.STREAM) setT(tiles, x, y, T.ASH);
    }
  }
  if (!home) return finishRegion(s, tiles, rng, NM, biome, opts, cx, cy);
  // 옛 도로 (십자형)
  for (let i = 4; i < WORLD_W - 4; i++) {
    const wob = Math.round((n2(i / 9, 3) - 0.5) * 6);
    setT(tiles, i, cy + wob, T.ROAD);
    setT(tiles, cx + wob, i, T.ROAD);
  }
  // 기지 부지
  for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) {
    if (x * x + y * y <= 40) setT(tiles, cx + x, cy + y, x * x + y * y <= 12 ? T.BASE : T.ASH);
  }
  // POI 주변은 지나갈 수 있도록
  const pois = {};
  // 장소 위치: 시드마다 방향이 바뀐다(거리 규칙은 같아서 난이도 동선은 유지). 서로 최소 거리 보장.
  const placed = [];
  const prng = makeRng(s ^ 0x51ed27);
  for (const [id, p] of Object.entries(POIS)) {
    const [d0, d1] = POI_RULES[id] || [0.3, 0.6];
    let px = 0, py = 0;
    for (let tries = 0; tries < 200; tries++) {
      const a = prng.range(0, Math.PI * 2), d = prng.range(d0, d1) * (WORLD_W / 2 - 6);
      px = Math.round(cx + Math.cos(a) * d); py = Math.round(cy + Math.sin(a) * d);
      if (px < 6 || py < 6 || px > WORLD_W - 7 || py > WORLD_H - 7) continue;
      if (placed.every(([qx, qy]) => Math.hypot(qx - px, qy - py) > 18)) break;
    }
    placed.push([px, py]);
    for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
      const tt = id === "rad_river" ? T.RAD : id === "iron_city" ? T.RUIN : T.ASH;
      setT(tiles, px + x, py + y, tt);
    }
    pois[id] = { ...p, id, tx: px, ty: py };
  }
  // 방사능 강 주변 물길
  const rr = pois.rad_river;
  for (let i = -20; i <= 20; i++) {
    const yy = rr.ty + 5 + Math.round(Math.sin(i / 4) * 2);
    if (inside(rr.tx + i, yy)) setT(tiles, rr.tx + i, yy, T.WATER);
  }

  // 기지 → 각 장소로 옛 도로(물 위는 다리)를 낸다: 무작위 배치여도 항상 도달 가능
  for (const q of Object.values(pois)) {
    let x = cx, y = cy, guard = 0;
    while ((x !== q.tx || y !== q.ty) && guard++ < 400) {
      if (Math.abs(q.tx - x) > Math.abs(q.ty - y) || (Math.abs(q.tx - x) === Math.abs(q.ty - y) && prng.chance(0.5))) x += Math.sign(q.tx - x); else y += Math.sign(q.ty - y);
      const t = tiles[y * WORLD_W + x];
      if (t === T.WATER || t === T.STREAM) setT(tiles, x, y, T.BRIDGE); // 물 위는 옛 다리
      else if (t !== T.BASE && t !== T.RAD && t !== T.BRIDGE) setT(tiles, x, y, T.ROAD);
    }
  }

  // 자원 노드
  const nodes = [];
  let nid = 0;
  for (let y = 3; y < WORLD_H - 3; y++) {
    for (let x = 3; x < WORLD_W - 3; x++) {
      const t = tiles[y * WORLD_W + x];
      if (t === T.WATER || t === T.BASE || t === T.ROAD || t === T.STREAM || t === T.BRIDGE) continue;
      if (Math.abs(x - cx) < 4 && Math.abs(y - cy) < 4) continue;
      const roll = rng.next();
      let type = null;
      const k = (base, key) => base * (NM[key] ?? 1);
      // 누적 확률표: 군계별 배율(나무 많은 숲, 고철 많은 사막…)
      const pick = (list) => { let acc = 0; for (const [ty, p] of list) { acc += p; if (roll < acc) return ty; } return null; };
      if (t === T.GRASS) type = pick([["tree", k(0.12, "tree")], ["bush", k(0.05, "bush")], ["herb", k(0.03, "herb")]]);
      else if (t === T.ASH) type = pick([["tree", k(0.035, "tree")], ["rock", k(0.025, "rock")], ["bush", k(0.015, "bush")], ["crate", 0.003]]);
      else if (t === T.RUIN) type = pick([["scrap", k(0.045, "scrap")], ["crate", 0.007], ["car", k(0.008, "scrap")]]);
      else if (t === T.ROCK) type = pick([["rock", k(0.12, "rock")]]);
      else if (t === T.RAD) type = pick([["herb", k(0.05, "herb")], ["scrap", k(0.03, "scrap")], ["crate", 0.01]]);
      else if (t === T.SAND) type = pick([["rock", k(0.02, "rock")], ["scrap", k(0.015, "scrap")], ["bush", k(0.01, "bush")], ["car", 0.004]]);
      else if (t === T.SNOW) type = pick([["tree", k(0.03, "tree")], ["rock", k(0.03, "rock")], ["bush", k(0.008, "bush")], ["crate", 0.003]]);
      if (type) nodes.push({ id: nid++, type, tx: x, ty: y });
    }
  }
  // 기지 근처 초반 자원 보장 (초반 이탈 방지: 첫 5분 안에 돌도끼를 만들 수 있어야 함)
  const guarantee = [["tree", 5, 3], ["tree", -5, 4], ["rock", 4, -5], ["rock", -4, -5], ["bush", 6, 0], ["bush", -6, -1], ["scrap", 0, 7], ["crate", 1, -7], ["tree", 7, -3], ["herb", -7, 2]];
  for (const [type, dx, dy] of guarantee) nodes.push({ id: nid++, type, tx: cx + dx, ty: cy + dy });

  // 어느 지역이든 기지 근처에 물웅덩이 보장(사막의 오아시스 등) — 초반 흐름을 같게
  let hasWater = false;
  for (let y = -11; y <= 11 && !hasWater; y++) for (let x = -11; x <= 11; x++) if (tiles[(cy + y) * WORLD_W + cx + x] === T.WATER) { hasWater = true; break; }
  if (!hasWater) for (let y = -1; y <= 1; y++) for (let x = -2; x <= 2; x++) setT(tiles, cx + 9 + x, cy - 3 + y, T.WATER);

  return { seed: s, tiles, nodes, pois, cx, cy, biome, home: true, rid: 0 };
}

// 고향이 아닌 지역: 기지·이야기 장소 없이 자원과 적만. 단계(tier)가 높을수록 자원이 풍부하다
function finishRegion(s, tiles, rng, NM, biome, opts, cx, cy) {
  const nodes = [];
  let nid = (opts.rid || 0) * 100000;
  const rich = 1 + (opts.tier || 1) * 0.08;
  for (let y = 2; y < WORLD_H - 2; y++) for (let x = 2; x < WORLD_W - 2; x++) {
    const t = tiles[y * WORLD_W + x];
    const type = pickNode(t, rng.next() / rich, NM);
    if (type) nodes.push({ id: nid++, type, tx: x, ty: y });
  }
  return { seed: s, tiles, nodes, pois: {}, cx, cy, biome, home: false, rid: opts.rid || 0 };
}
function pickNode(t, roll, NM) {
  const k = (base, key) => base * (NM[key] ?? 1);
  const pick = (list) => { let acc = 0; for (const [ty, p] of list) { acc += p; if (roll < acc) return ty; } return null; };
  if (t === T.GRASS) return pick([["tree", k(0.12, "tree")], ["bush", k(0.05, "bush")], ["herb", k(0.03, "herb")]]);
  if (t === T.ASH) return pick([["tree", k(0.035, "tree")], ["rock", k(0.025, "rock")], ["bush", k(0.015, "bush")], ["crate", 0.003]]);
  if (t === T.RUIN) return pick([["scrap", k(0.045, "scrap")], ["crate", 0.007], ["car", k(0.008, "scrap")]]);
  if (t === T.ROCK) return pick([["rock", k(0.12, "rock")]]);
  if (t === T.RAD) return pick([["herb", k(0.05, "herb")], ["scrap", k(0.03, "scrap")], ["crate", 0.01]]);
  if (t === T.SAND) return pick([["rock", k(0.02, "rock")], ["scrap", k(0.015, "scrap")], ["bush", k(0.01, "bush")], ["car", 0.004]]);
  if (t === T.SNOW) return pick([["tree", k(0.03, "tree")], ["rock", k(0.03, "rock")], ["bush", k(0.008, "bush")], ["crate", 0.003]]);
  return null;
}
// 다리 놓기: 저장된 다리 칸을 지형에 반영
export function applyBridges(world, list = []) { for (const i of list) if (world.tiles[i] === T.WATER || world.tiles[i] === T.STREAM) world.tiles[i] = T.BRIDGE; }
export const isSlow = (world, px, py) => TILE_INFO[tileAt(world, px, py)]?.slow || 1;

function inside(x, y) { return x >= 0 && y >= 0 && x < WORLD_W && y < WORLD_H; }
function setT(tiles, x, y, t) { if (inside(x, y)) tiles[y * WORLD_W + x] = t; }

export function tileAt(world, px, py) {
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  if (!inside(tx, ty)) return T.WATER;
  return world.tiles[ty * WORLD_W + tx];
}

export function isBlocked(world, px, py) {
  return !!TILE_INFO[tileAt(world, px, py)].block;
}

export function nearWater(world, px, py) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (tileAt(world, px + dx * TILE, py + dy * TILE) === T.WATER) return true;
  }
  return false;
}

export function poiNear(world, px, py, dist = 3 * TILE) {
  for (const p of Object.values(world.pois)) {
    const dx = (p.tx + 0.5) * TILE - px, dy = (p.ty + 0.5) * TILE - py;
    if (dx * dx + dy * dy < dist * dist) return p;
  }
  return null;
}
