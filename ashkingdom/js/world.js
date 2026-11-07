// 월드 생성 — 시드로부터 결정적으로 생성하므로 저장 파일에는 '고갈된 자원 노드'만 저장한다.
// (저장 용량 최소화 + 서버 저장 비용 최소화)
import { makeRng, valueNoise2D, hashStr } from "./rng.js";
import { POIS } from "./data.js";

export const TILE = 32;
export const WORLD_W = 128;
export const WORLD_H = 128;

export const T = { ASH: 0, GRASS: 1, RUIN: 2, WATER: 3, RAD: 4, ROCK: 5, BASE: 6, ROAD: 7 };
export const TILE_INFO = {
  0: { name: "잿빛 황무지", color: "#6f6a60" },
  1: { name: "되살아난 숲", color: "#4f6b3a" },
  2: { name: "폐허", color: "#5a5a5e" },
  3: { name: "물", color: "#2f4f63", block: true },
  4: { name: "방사능 지대", color: "#5c7a2e", rad: 1 },
  5: { name: "바위 지대", color: "#57504a" },
  6: { name: "기지", color: "#7a6a52" },
  7: { name: "옛 도로", color: "#3d3b39" },
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

export function generateWorld(seed) {
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
      if (e < 0.24) t = T.WATER;
      else if (e > 0.78) t = T.ROCK;
      else if (r > 0.74) t = T.RAD;
      else if (m > 0.6) t = T.GRASS;
      else if (m < 0.3) t = T.RUIN;
      // 가장자리는 물(세계의 끝 — 에필로그에서 '원정'으로 확장)
      if (x < 2 || y < 2 || x >= WORLD_W - 2 || y >= WORLD_H - 2) t = T.WATER;
      tiles[y * WORLD_W + x] = t;
    }
  }
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
  for (const [id, p] of Object.entries(POIS)) {
    const px = Math.round(p.fx * WORLD_W), py = Math.round(p.fy * WORLD_H);
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

  // 자원 노드
  const nodes = [];
  let nid = 0;
  for (let y = 3; y < WORLD_H - 3; y++) {
    for (let x = 3; x < WORLD_W - 3; x++) {
      const t = tiles[y * WORLD_W + x];
      if (t === T.WATER || t === T.BASE || t === T.ROAD) continue;
      if (Math.abs(x - cx) < 4 && Math.abs(y - cy) < 4) continue;
      const roll = rng.next();
      let type = null;
      if (t === T.GRASS) type = roll < 0.12 ? "tree" : roll < 0.17 ? "bush" : roll < 0.2 ? "herb" : null;
      else if (t === T.ASH) type = roll < 0.035 ? "tree" : roll < 0.06 ? "rock" : roll < 0.075 ? "bush" : roll < 0.078 ? "crate" : null;
      else if (t === T.RUIN) type = roll < 0.045 ? "scrap" : roll < 0.052 ? "crate" : roll < 0.06 ? "car" : null;
      else if (t === T.ROCK) type = roll < 0.12 ? "rock" : null;
      else if (t === T.RAD) type = roll < 0.05 ? "herb" : roll < 0.08 ? "scrap" : roll < 0.09 ? "crate" : null;
      if (type) nodes.push({ id: nid++, type, tx: x, ty: y });
    }
  }
  // 기지 근처 초반 자원 보장 (초반 이탈 방지: 첫 5분 안에 돌도끼를 만들 수 있어야 함)
  const guarantee = [["tree", 5, 3], ["tree", -5, 4], ["rock", 4, -5], ["rock", -4, -5], ["bush", 6, 0], ["bush", -6, -1], ["scrap", 0, 7], ["crate", 1, -7], ["tree", 7, -3], ["herb", -7, 2]];
  for (const [type, dx, dy] of guarantee) nodes.push({ id: nid++, type, tx: cx + dx, ty: cy + dy });

  return { seed: s, tiles, nodes, pois, cx, cy };
}

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
