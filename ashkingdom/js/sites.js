// 들어갈 수 있는 건물(장소): 아파트·고층 빌딩·쇼핑몰·체육관·방송국·발전소·지하철·공항·병원·방공호
// 건물 안은 필드와 같은 엔진으로 돌아가는 작은 지도(방·복도·벽). 층마다 계단, 마지막 층(또는 가장 깊은 곳)에 방사능 보스.
// 보스를 이기면 큰 재료 + 그 지역 미션 완료(이웃 지역이 열림). 방공호·대피소는 적이 없고 방사능 폭풍을 피할 수 있다.
import { makeRng } from "./rng.js";
import { T, WORLD_W, WORLD_H } from "./world.js";

export const SITES = {
  apartment: { name: "무너진 아파트", icon: "🏢", floors: 3, enemies: ["rad_rat", "mutant", "raider"], loot: ["crate", "scrap", "crate"], boss: { name: "302호의 변이 거주자", hp: 520, atk: 16 }, reward: [["cloth", 12], ["canned_food", 6], ["electronics", 3], ["bottle", 3]] },
  highrise: { name: "고층 빌딩", icon: "🏙️", floors: 5, enemies: ["mutant", "raider", "rad_rat"], loot: ["scrap", "crate", "car"], boss: { name: "옥상의 방사능 거미", hp: 950, atk: 22 }, reward: [["steel", 6], ["electronics", 8], ["book_firearms2", 1]] },
  mall: { name: "쇼핑몰", icon: "🛍️", floors: 2, enemies: ["raider", "rad_rat", "feral_dog"], loot: ["crate", "crate", "scrap"], boss: { name: "푸드코트의 거대 변이체", hp: 700, atk: 18 }, reward: [["canned_food", 12], ["backpack", 1], ["leather_jacket", 1], ["instant_noodle", 8]] },
  gym: { name: "체육관", icon: "🏟️", floors: 1, enemies: ["mutant", "feral_dog"], loot: ["crate", "scrap"], boss: { name: "근육 변이체 '챔피언'", hp: 600, atk: 20 }, reward: [["leather", 10], ["medkit", 2], ["book_blade1", 1]] },
  broadcast: { name: "방송국", icon: "📺", floors: 3, enemies: ["raider", "mutant"], loot: ["scrap", "crate", "scrap"], boss: { name: "전파에 미친 앵커", hp: 760, atk: 19 }, reward: [["electronics", 14], ["fuel", 4], ["notebook", 1]] },
  power: { name: "발전소", icon: "⚡", floors: 2, enemies: ["mutant", "rad_rat"], loot: ["scrap", "scrap", "crate"], boss: { name: "노심의 빛나는 감시자", hp: 1100, atk: 26 }, reward: [["fuel", 12], ["electronics", 10], ["steel", 4], ["radaway", 2]], rad: true },
  subway: { name: "지하철역", icon: "🚇", floors: 3, under: true, long: true, enemies: ["rad_rat", "mutant", "feral_dog"], loot: ["crate", "scrap", "car"], boss: { name: "선로 끝의 굴착 변이체", hp: 880, atk: 22 }, reward: [["iron", 12], ["scrap", 20], ["iron_ore", 10]] },
  airport: { name: "공항", icon: "✈️", floors: 2, enemies: ["raider", "mutant", "ash_knight"], loot: ["crate", "car", "crate"], boss: { name: "격납고의 강철 기사", hp: 1300, atk: 28 }, reward: [["steel", 10], ["fuel", 10], ["electronics", 12], ["quiver_l", 1]] },
  hospital: { name: "병원", icon: "🏥", floors: 3, enemies: ["mutant", "rad_rat"], loot: ["crate", "crate", "scrap"], boss: { name: "수술실의 감염체", hp: 680, atk: 18 }, reward: [["medkit", 4], ["radaway", 4], ["revive_kit", 1], ["herb", 10]] },
  bunker: { name: "방공호", icon: "🛖", floors: 1, under: true, safe: true, enemies: [], loot: ["crate"], reward: [] },
};

// 지역 테마별로 어떤 건물이 생기는지(고향은 대피소·아파트·방송국, 도시는 빌딩이 많다)
const BY_THEME = {
  home: ["bunker", "apartment", "broadcast", "gym"],
  city: ["highrise", "mall", "apartment", "subway", "hospital", "bunker", "gym"],
  plains: ["airport", "bunker", "apartment"],
  desert: ["airport", "bunker", "power"],
  mountain: ["power", "bunker", "subway"],
  rad: ["power", "hospital", "bunker", "highrise"],
  forest: ["bunker", "apartment", "gym"], jungle: ["bunker", "hospital"], snow: ["bunker", "power"], taiga: ["bunker", "apartment"],
  swamp: ["bunker", "hospital"], savanna: ["airport", "bunker"],
};

// 지역 지도 위에 건물 위치를 정한다(지형을 조금 고쳐 입구가 막히지 않게)
export function placeSites(world, theme, seed) {
  const rng = makeRng((seed ^ 0x51735) >>> 0);
  const kinds = BY_THEME[theme] || ["bunker"];
  const n = Math.min(kinds.length, theme === "city" ? 6 : 3);
  const out = [];
  for (let i = 0; i < n; i++) {
    const kind = kinds[i];
    for (let tries = 0; tries < 80; tries++) {
      const tx = rng.int(10, WORLD_W - 11), ty = rng.int(10, WORLD_H - 11);
      if (world.home && Math.hypot(tx - world.cx, ty - world.cy) < 14) continue;
      if (out.some((o) => Math.hypot(o.tx - tx, o.ty - ty) < 16)) continue;
      // 입구 주변 3x3 은 걸을 수 있는 땅으로
      for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) { const k = (ty + y) * WORLD_W + tx + x; const t = world.tiles[k]; if (t === T.WATER || t === T.ROCK || t === T.STREAM) world.tiles[k] = T.RUIN; }
      out.push({ id: i, kind, tx, ty });
      break;
    }
  }
  return out;
}

// 건물 내부 한 층: 방(사각형)을 여러 개 놓고 복도로 잇는다. 입구(출구)·계단·보스방
export function generateFloor(seed, kind, floor, opts = {}) {
  const S = SITES[kind];
  const rng = makeRng((seed ^ (floor * 0x9e37) ^ 0xbeef) >>> 0);
  const tiles = new Uint8Array(WORLD_W * WORLD_H).fill(T.WALL);
  const W = S.long ? 90 : 56, H = S.long ? 30 : 44; // 지하철은 길고 좁다
  const ox = Math.floor((WORLD_W - W) / 2), oy = Math.floor((WORLD_H - H) / 2);
  const rooms = [];
  const want = S.floors === 1 ? 7 : 6 + Math.min(4, floor);
  for (let i = 0; i < 200 && rooms.length < want; i++) {
    const w = rng.int(6, S.long ? 14 : 11), h = rng.int(5, 9);
    const x = ox + rng.int(1, W - w - 2), y = oy + rng.int(1, H - h - 2);
    if (rooms.some((r) => x < r.x + r.w + 2 && x + w + 2 > r.x && y < r.y + r.h + 2 && y + h + 2 > r.y)) continue;
    rooms.push({ x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) });
  }
  rooms.sort((a, b) => a.cx - b.cx); // 왼쪽 → 오른쪽으로 진행
  const set = (x, y, t) => { if (x > 0 && y > 0 && x < WORLD_W - 1 && y < WORLD_H - 1) tiles[y * WORLD_W + x] = t; };
  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) set(x, y, T.FLOOR);
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1], b = rooms[i];
    for (let x = Math.min(a.cx, b.cx); x <= Math.max(a.cx, b.cx); x++) { set(x, a.cy, T.FLOOR); set(x, a.cy + 1, T.FLOOR); }
    for (let y = Math.min(a.cy, b.cy); y <= Math.max(a.cy, b.cy); y++) { set(b.cx, y, T.FLOOR); set(b.cx + 1, y, T.FLOOR); }
  }
  // 무너진 잔해(지나갈 수 없는 벽 조각) 조금
  for (let i = 0; i < 18; i++) { const r = rng.pick(rooms); set(r.x + rng.int(1, r.w - 2), r.y + rng.int(1, r.h - 2), T.WALL); }
  const first = rooms[0], last = rooms[rooms.length - 1];
  set(first.x + 1, first.cy, T.EXIT); // 들어온 문(나가기)
  const isTop = floor >= S.floors - 1;
  if (!isTop) set(last.x + last.w - 2, last.cy, T.STAIRS);
  // 자원(상자·고철)과 적
  const nodes = [];
  let nid = (opts.rid || 0) * 100000 + 50000 + (opts.sid || 0) * 2000 + floor * 200;
  for (const r of rooms.slice(1)) {
    const k = rng.int(1, 3);
    for (let j = 0; j < k; j++) nodes.push({ id: nid++, type: rng.pick(S.loot), tx: r.x + rng.int(1, r.w - 2), ty: r.y + rng.int(1, r.h - 2) });
  }
  const spawns = [];
  if (!S.safe) for (const r of rooms.slice(1, isTop ? -1 : undefined)) if (rng.chance(0.75)) spawns.push({ type: rng.pick(S.enemies), tx: r.cx, ty: r.cy, n: rng.int(1, 2 + Math.floor(floor / 2)) });
  const boss = !S.safe && isTop ? { tx: last.cx, ty: last.cy } : null;
  // 잠긴 문: 마지막 방(계단·보스방) 입구를 막는다. 종류: 부수기(나무문)·열쇠(적이 가짐)·카드키(보안 담당자)·비밀번호(쪽지)
  const doors = [];
  if (rooms.length >= 3 && !S.safe) {
    const hi = ["broadcast", "power", "airport", "hospital", "highrise"].includes(kind);
    const dk = rng.pick(hi ? ["card", "code", "card", "wood"] : ["wood", "key", "wood", "key", "code"]);
    const cells = [];
    for (let y = last.y - 1; y <= last.y + last.h; y++) for (let x = last.x - 1; x <= last.x + last.w; x++) {
      const inside = x >= last.x && x < last.x + last.w && y >= last.y && y < last.y + last.h;
      if (inside || (x !== last.x - 1 && x !== last.x + last.w && y !== last.y - 1 && y !== last.y + last.h)) continue;
      if (tiles[y * WORLD_W + x] === T.FLOOR) { tiles[y * WORLD_W + x] = T.DOOR; cells.push(y * WORLD_W + x); }
    }
    if (cells.length) {
      const door = { kind: dk, tiles: cells, open: false, prog: 0, tries: 0 };
      const others = rooms.slice(1, -1);
      if (dk === "code") { door.code = String(rng.int(1000, 9999)); const r = rng.pick(others.length ? others : [first]); var noteAt = { kind: "note", code: door.code, tx: r.x + r.w - 2, ty: r.y + 1 }; }
      if (dk === "card") { const r = rng.pick(others.length ? others : [first]); spawns.push({ type: "raider", tx: r.cx, ty: r.cy, n: 1, guard: true }); }
      if (dk === "key") door.keyFrom = true; // 이 층 적 하나가 열쇠를 지닌다(main.js 에서 지정)
      doors.push(door);
    }
  }
  // 이야기 사건(구조할 생존자·일기·보급실) — 층마다 하나쯤
  const events = [];
  if (!S.safe && rng.chance(0.6)) { const r = rng.pick(rooms.slice(1)); events.push({ kind: rng.pick(["survivor", "diary", "stash", "trap"]), tx: r.x + 1, ty: r.y + 1 }); }
  if (typeof noteAt !== "undefined") events.push(noteAt);
  return { tiles, nodes, spawns, boss, events, doors, entry: { tx: first.x + 2, ty: first.cy }, isTop };
}

export function siteKey(rid, sid) { return `${rid}:${sid}`; }
