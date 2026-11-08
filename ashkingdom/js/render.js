// 렌더링 — Canvas 2D. 이동 중엔 가벼운 '필드 모드'(야생소년 수준),
// [자세히 보기]/이벤트 때는 같은 레이어 데이터로 그린 '디테일 모드'(그림자·하이라이트·얼굴)를 쓴다.
// 실서비스 권장: Spine 2D 스켈레톤 + 옷 슬롯 교체(기획서 §10) — 이 파일의 레이어 순서가 그대로 슬롯 순서다.
import { ITEMS, ANIMALS, VEHICLES, BUILDINGS, BASE_LEVELS } from "./data.js";
import { TILE, WORLD_W, WORLD_H, TILE_INFO, T, NODE_TYPES } from "./world.js";

const SKIN_SHADE = (hex, amt) => {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt;
  r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
  return `rgb(${r},${g},${b})`;
};

// ---------------- 지형: 청크 단위 오프스크린 캐시(성능) ----------------
const CHUNK = 16;
const chunkCache = new Map();
export function clearTerrainCache() { chunkCache.clear(); }

function drawChunk(world, cx, cy) {
  const c = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(CHUNK * TILE, CHUNK * TILE) : Object.assign(document.createElement("canvas"), { width: CHUNK * TILE, height: CHUNK * TILE });
  const g = c.getContext("2d");
  for (let y = 0; y < CHUNK; y++) for (let x = 0; x < CHUNK; x++) {
    const tx = cx * CHUNK + x, ty = cy * CHUNK + y;
    if (tx >= WORLD_W || ty >= WORLD_H) continue;
    const t = world.tiles[ty * WORLD_W + tx];
    g.fillStyle = TILE_INFO[t].color;
    g.fillRect(x * TILE, y * TILE, TILE, TILE);
    // 결 표현(노이즈 점)
    const h = (tx * 73856093) ^ (ty * 19349663);
    g.fillStyle = "rgba(0,0,0,0.08)";
    for (let k = 0; k < 3; k++) {
      const px = ((h >> (k * 4)) & 31), py = ((h >> (k * 4 + 12)) & 31);
      g.fillRect(x * TILE + px, y * TILE + py, 2, 2);
    }
    if (t === T.WATER) { g.fillStyle = "rgba(160,200,220,0.15)"; g.fillRect(x * TILE + (h & 15), y * TILE + ((h >> 5) & 15) + 6, 10, 2); }
    if (t === T.STREAM) { g.fillStyle = "rgba(190,225,235,0.28)"; g.fillRect(x * TILE + (h & 15), y * TILE + 8, 12, 2); g.fillRect(x * TILE + ((h >> 4) & 15), y * TILE + 20, 9, 2); g.fillStyle = "rgba(120,110,90,0.35)"; g.fillRect(x * TILE + ((h >> 8) & 23), y * TILE + ((h >> 12) & 23), 5, 4); }
    if (t === T.BRIDGE) { g.fillStyle = "#8a6a44"; g.fillRect(x * TILE, y * TILE, TILE, TILE); g.fillStyle = "#5e4630"; for (let k = 0; k < 4; k++) g.fillRect(x * TILE, y * TILE + k * 8 + 6, TILE, 2); g.fillStyle = "#3e2e20"; g.fillRect(x * TILE, y * TILE, TILE, 3); g.fillRect(x * TILE, y * TILE + TILE - 3, TILE, 3); }
    if (t === T.ROAD) { g.fillStyle = "rgba(220,200,90,0.35)"; if ((tx + ty) % 3 === 0) g.fillRect(x * TILE + 14, y * TILE + 14, 4, 4); }
    if (t === T.RUIN && (h & 7) === 0) { g.fillStyle = "#47474b"; g.fillRect(x * TILE + 4, y * TILE + 6, 18, 14); g.fillStyle = "#3a3a3d"; g.fillRect(x * TILE + 6, y * TILE + 8, 4, 4); }
    if (t === T.RAD) { g.fillStyle = "rgba(160,255,80,0.10)"; g.fillRect(x * TILE, y * TILE, TILE, TILE); }
  }
  return c;
}

export function drawTerrain(ctx, world, cam, vw, vh) {
  const x0 = Math.floor(cam.x / (CHUNK * TILE)), y0 = Math.floor(cam.y / (CHUNK * TILE));
  const x1 = Math.floor((cam.x + vw) / (CHUNK * TILE)), y1 = Math.floor((cam.y + vh) / (CHUNK * TILE));
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    if (cx < 0 || cy < 0 || cx * CHUNK >= WORLD_W || cy * CHUNK >= WORLD_H) continue;
    const k = cx + "," + cy;
    let c = chunkCache.get(k);
    if (!c) { c = drawChunk(world, cx, cy); chunkCache.set(k, c); }
    ctx.drawImage(c, Math.round(cx * CHUNK * TILE - cam.x), Math.round(cy * CHUNK * TILE - cam.y));
  }
}

// ---------------- 이모지 스프라이트 캐시 ----------------
const emojiCache = new Map();
export function emoji(ctx, ch, x, y, size) {
  const key = ch + size;
  let c = emojiCache.get(key);
  if (!c) {
    c = document.createElement("canvas");
    c.width = c.height = Math.ceil(size * 1.4);
    const g = c.getContext("2d");
    g.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(ch, c.width / 2, c.height / 2 + size * 0.05);
    emojiCache.set(key, c);
  }
  ctx.drawImage(c, Math.round(x - c.width / 2), Math.round(y - c.height / 2));
}

export function drawShadow(ctx, x, y, w) {
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath(); ctx.ellipse(x, y, w, w * 0.38, 0, 0, Math.PI * 2); ctx.fill();
}

// ---------------- 캐릭터(페이퍼돌) ----------------
// look: {skin, hair, hairColor}, equip: {head, body, legs, feet, back, hand} (스택 또는 null)
// facing: 1(오른쪽) | -1, phase: 걷기 위상, opts: {detail, scale, mount, gender}
export function drawCharacter(ctx, x, y, look, equip, facing, phase, opts = {}) {
  const s = opts.scale || 1;
  const detail = !!opts.detail;
  const moving = opts.moving;
  const bob = moving ? Math.abs(Math.sin(phase)) * 1.6 * s : Math.sin(phase * 0.4) * 0.4 * s;
  const leg = moving ? Math.sin(phase) * 4 * s : 0;
  const arm = moving ? -Math.sin(phase) * 3.5 * s : 0;
  const L = (id) => (id && ITEMS[id.id]?.look) || null;
  const skin = look.skin || "#d9a982";
  const female = opts.gender === "F";

  ctx.save();
  ctx.translate(x, y);
  if (facing < 0) ctx.scale(-1, 1);

  let riding = 0;
  if (opts.mount) { riding = drawMount(ctx, opts.mount, s, phase, moving, detail); }

  ctx.translate(0, -riding - bob);
  if (!opts.mount) drawShadowLocal(ctx, s);

  const grad = (c, light = 22, dark = -28, w = 10 * s) => {
    if (!detail) return c;
    const g = ctx.createLinearGradient(-w, 0, w, 0);
    g.addColorStop(0, SKIN_SHADE(toHex(c), light)); g.addColorStop(0.55, c); g.addColorStop(1, SKIN_SHADE(toHex(c), dark));
    return g;
  };

  // 1) 등(망토/배낭)
  const back = L(equip.back);
  if (back) {
    ctx.fillStyle = grad(back.color);
    if (back.style === "cape") { ctx.beginPath(); ctx.moveTo(-6 * s, -24 * s); ctx.quadraticCurveTo(-11 * s - leg * 0.3, -6 * s, -9 * s, 2 * s); ctx.lineTo(7 * s, 2 * s); ctx.lineTo(6 * s, -24 * s); ctx.fill(); }
    else { roundRect(ctx, -10 * s, -22 * s, 7 * s, 11 * s, 2 * s); ctx.fill(); }
  }

  // 2) 다리 (맨다리 → 바지 → 신발)
  const legs = L(equip.legs);
  for (const side of [-1, 1]) {
    const lx = side * 2.6 * s, sw = side * leg;
    ctx.fillStyle = grad(legs ? legs.color : skin, 15, -20, 3 * s);
    roundRect(ctx, lx - 1.8 * s + sw * 0.3, -11 * s, 3.6 * s, 11 * s, 1.5 * s); ctx.fill();
    if (!legs) { ctx.fillStyle = "#3b3b4a"; roundRect(ctx, lx - 1.9 * s, -11 * s, 3.8 * s, 3 * s, 1 * s); ctx.fill(); } // 기본 속옷(반바지)
    const feet = L(equip.feet);
    ctx.fillStyle = feet ? feet.color : SKIN_SHADE(toHex(skin), -25);
    roundRect(ctx, lx - 2.2 * s + sw * 0.3, -1.5 * s, 5 * s, 2.6 * s, 1.2 * s); ctx.fill();
  }

  // 3) 몸통 (맨몸+기본 속옷 → 상의)
  const body = L(equip.body);
  const tw = female ? 6.2 : 7;
  ctx.fillStyle = grad(skin);
  roundRect(ctx, -tw * s, -24 * s, tw * 2 * s, 14 * s, 3 * s); ctx.fill();
  if (!body) { ctx.fillStyle = "#3b3b4a"; if (female) { roundRect(ctx, -tw * s, -21 * s, tw * 2 * s, 4 * s, 1.5 * s); ctx.fill(); } }
  if (body) {
    ctx.fillStyle = grad(body.color);
    roundRect(ctx, -(tw + 0.6) * s, -24.5 * s, (tw + 0.6) * 2 * s, 15 * s, 3 * s); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 0.8 * s;
    if (body.style === "rag") { ctx.beginPath(); ctx.moveTo(-5 * s, -10 * s); ctx.lineTo(-3 * s, -12 * s); ctx.lineTo(-1 * s, -10 * s); ctx.lineTo(2 * s, -12 * s); ctx.lineTo(5 * s, -10 * s); ctx.stroke(); }
    if (body.style === "jacket") { ctx.beginPath(); ctx.moveTo(0, -24 * s); ctx.lineTo(0, -10 * s); ctx.stroke(); ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.fillRect(-6 * s, -23 * s, 2 * s, 12 * s); }
    if (body.style === "fur") { ctx.fillStyle = "#cbb89a"; roundRect(ctx, -8 * s, -25.5 * s, 16 * s, 4 * s, 2 * s); ctx.fill(); }
    if (body.style === "hazmat") { ctx.fillStyle = "#2d2d2d"; ctx.fillRect(-7.6 * s, -16 * s, 15.2 * s, 1.6 * s); }
    if (body.style === "vest") { ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(-5 * s, -21 * s, 3 * s, 3 * s); ctx.fillRect(2 * s, -21 * s, 3 * s, 3 * s); ctx.fillRect(-5 * s, -16 * s, 10 * s, 3 * s); }
  }

  // 4) 팔 + 손 무기
  for (const side of [-1, 1]) {
    const ax = side * (tw + 1.6) * s, sw = side * arm;
    ctx.fillStyle = body && body.style !== "vest" ? grad(body.color, 15, -20, 3 * s) : grad(skin, 15, -20, 3 * s);
    roundRect(ctx, ax - 1.7 * s, -23 * s + sw * 0.2, 3.4 * s, 11 * s, 1.6 * s); ctx.fill();
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(ax, -11.5 * s + sw * 0.2, 1.8 * s, 0, Math.PI * 2); ctx.fill();
  }
  if (equip.hand) drawHeld(ctx, equip.hand.id, (tw + 1.6) * s, -11.5 * s - arm * 0.2, s);

  // 5) 머리
  const hy = -31 * s;
  ctx.fillStyle = grad(skin, 18, -22, 6 * s);
  ctx.beginPath(); ctx.arc(0, hy, 6.3 * s, 0, Math.PI * 2); ctx.fill();
  // 얼굴
  ctx.fillStyle = "#1e1a17";
  ctx.beginPath(); ctx.arc(2.6 * s, hy - 0.4 * s, 0.85 * s, 0, Math.PI * 2); ctx.fill();
  if (detail) {
    ctx.beginPath(); ctx.arc(-1.2 * s, hy - 0.4 * s, 0.8 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(2.9 * s, hy - 0.7 * s, 0.3 * s, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = SKIN_SHADE(toHex(skin), -55); ctx.lineWidth = 0.5 * s;
    ctx.beginPath(); ctx.moveTo(0.3 * s, hy + 2.8 * s); ctx.quadraticCurveTo(1.6 * s, hy + 3.4 * s, 2.8 * s, hy + 2.6 * s); ctx.stroke();
    ctx.fillStyle = "rgba(220,110,100,0.25)"; ctx.beginPath(); ctx.arc(3.2 * s, hy + 1.4 * s, 1.3 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(60,50,40,0.25)"; ctx.fillRect(-2 * s, hy + 4.5 * s, 4 * s, 0.6 * s); // 먼지 자국 — 종말 분위기
  }
  // 머리카락
  const head = L(equip.head);
  const hideHair = head && (head.style === "helmet" || head.style === "hazmat");
  if (!hideHair) {
    ctx.fillStyle = look.hairColor || "#2b211b";
    ctx.beginPath(); ctx.arc(-0.6 * s, hy - 1.6 * s, 6.4 * s, Math.PI * 0.95, Math.PI * 2.08); ctx.fill();
    if (look.hair === "long") { roundRect(ctx, -6.6 * s, hy - 2 * s, 4.2 * s, 12 * s, 2 * s); ctx.fill(); }
    if (look.hair === "pony") { ctx.beginPath(); ctx.ellipse(-7 * s, hy + 1 * s, 2 * s, 5 * s, 0.3, 0, Math.PI * 2); ctx.fill(); }
    if (look.hair === "mohawk") { ctx.fillRect(-2 * s, hy - 10 * s, 3 * s, 5 * s); }
    if (look.hair === "beard") { ctx.beginPath(); ctx.arc(1.2 * s, hy + 3.2 * s, 3.4 * s, 0, Math.PI); ctx.fill(); }
  }
  if (head) {
    ctx.fillStyle = grad(head.color, 25, -25, 6 * s);
    if (head.style === "helmet") { ctx.beginPath(); ctx.arc(0, hy - 1.2 * s, 7 * s, Math.PI, Math.PI * 2); ctx.fill(); ctx.fillRect(-7.6 * s, hy - 1.6 * s, 15.2 * s, 1.8 * s); }
    if (head.style === "mask") { roundRect(ctx, 0.5 * s, hy - 2.2 * s, 6 * s, 6.5 * s, 2.5 * s); ctx.fill(); ctx.fillStyle = "#9ad0e0"; ctx.beginPath(); ctx.arc(3.2 * s, hy - 0.3 * s, 1.4 * s, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#222"; ctx.beginPath(); ctx.arc(4.3 * s, hy + 3 * s, 1.5 * s, 0, Math.PI * 2); ctx.fill(); }
    if (head.style === "crown") {
      ctx.fillStyle = detail ? goldGrad(ctx, s, hy) : head.color;
      ctx.beginPath(); ctx.moveTo(-5 * s, hy - 5 * s); ctx.lineTo(-5 * s, hy - 10 * s); ctx.lineTo(-2.5 * s, hy - 7 * s); ctx.lineTo(0, hy - 11 * s); ctx.lineTo(2.5 * s, hy - 7 * s); ctx.lineTo(5 * s, hy - 10 * s); ctx.lineTo(5 * s, hy - 5 * s); ctx.fill();
      ctx.fillStyle = "#c0273b"; ctx.beginPath(); ctx.arc(0, hy - 6.5 * s, 0.9 * s, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

function goldGrad(ctx, s, hy) {
  const g = ctx.createLinearGradient(0, hy - 11 * s, 0, hy - 5 * s);
  g.addColorStop(0, "#fff3b0"); g.addColorStop(0.5, "#d4af37"); g.addColorStop(1, "#8a6d1d");
  return g;
}

function drawShadowLocal(ctx, s) {
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath(); ctx.ellipse(0, 1 * s, 8 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill();
}

function drawHeld(ctx, id, hx, hy, s) {
  const it = ITEMS[id];
  ctx.save();
  ctx.translate(hx, hy);
  if (it.ranged) {
    ctx.fillStyle = "#2a2a2a";
    if (id === "bow") { ctx.strokeStyle = "#6b4a2a"; ctx.lineWidth = 1.4 * s; ctx.beginPath(); ctx.arc(2 * s, 0, 7 * s, -1.2, 1.2); ctx.stroke(); ctx.strokeStyle = "#ddd"; ctx.lineWidth = 0.4 * s; ctx.beginPath(); ctx.moveTo(2 * s + 7 * s * Math.cos(-1.2), 7 * s * Math.sin(-1.2)); ctx.lineTo(2 * s + 7 * s * Math.cos(1.2), 7 * s * Math.sin(1.2)); ctx.stroke(); }
    else { ctx.fillRect(0, -1.5 * s, (id === "rifle" ? 14 : 8) * s, 2.6 * s); ctx.fillStyle = "#5a3d22"; ctx.fillRect(-1 * s, -0.5 * s, 2.5 * s, 4 * s); }
  } else {
    ctx.rotate(-0.6);
    ctx.fillStyle = "#5a3d22"; ctx.fillRect(-0.8 * s, -10 * s, 1.6 * s, 12 * s);
    ctx.fillStyle = id.includes("axe") ? "#8d8d8d" : id.includes("pick") ? "#7d7d7d" : id === "royal_blade" ? "#e8e1c0" : "#b8b8b8";
    if (id.includes("axe")) { ctx.beginPath(); ctx.moveTo(0, -10 * s); ctx.lineTo(4.5 * s, -11 * s); ctx.lineTo(4.5 * s, -6 * s); ctx.lineTo(0, -7 * s); ctx.fill(); }
    else if (id.includes("pick")) { ctx.beginPath(); ctx.moveTo(-5 * s, -9 * s); ctx.quadraticCurveTo(0, -12 * s, 5 * s, -9 * s); ctx.lineTo(0, -10 * s); ctx.fill(); }
    else if (id.includes("hammer")) { ctx.fillRect(-2.5 * s, -11 * s, 5 * s, 3 * s); }
    else if (id === "fishing_rod") { ctx.strokeStyle = "#ccc"; ctx.lineWidth = 0.3 * s; ctx.beginPath(); ctx.moveTo(0, -10 * s); ctx.lineTo(6 * s, 2 * s); ctx.stroke(); }
    else { ctx.beginPath(); ctx.moveTo(-1.2 * s, -9 * s); ctx.lineTo(0, -18 * s); ctx.lineTo(1.2 * s, -9 * s); ctx.fill(); }
  }
  ctx.restore();
}

// 탈것: 반환값 = 캐릭터를 올려야 하는 높이
function drawMount(ctx, mount, s, phase, moving, detail) {
  const g = moving ? Math.sin(phase * 1.3) * 2 * s : 0;
  if (mount.kind) {
    const a = ANIMALS[mount.kind];
    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(0, 1 * s, 14 * s, 4 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = a.color;
    for (const lx of [-9, -5, 6, 10]) { roundRect(ctx, lx * s, -10 * s + (lx < 0 ? g : -g) * 0.3, 2.6 * s, 11 * s, 1 * s); ctx.fill(); }
    roundRect(ctx, -12 * s, -18 * s, 25 * s, 10 * s, 5 * s); ctx.fill();
    ctx.save(); ctx.translate(12 * s, -18 * s); ctx.rotate(-0.7); roundRect(ctx, -2 * s, -9 * s, 6 * s, 12 * s, 2.5 * s); ctx.fill(); ctx.restore();
    ctx.fillStyle = "#2b1d12"; ctx.fillRect(-13 * s, -18 * s, 3 * s, 8 * s); // 꼬리
    ctx.fillStyle = "#6b2b1f"; roundRect(ctx, -4 * s, -19 * s, 9 * s, 3 * s, 1 * s); ctx.fill(); // 안장
    return 14 * s;
  }
  const v = VEHICLES[mount.id];
  ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(0, 1 * s, 13 * s, 3.5 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#1c1c1c"; ctx.lineWidth = 2 * s;
  for (const wx of [-9, 9]) { ctx.beginPath(); ctx.arc(wx * s, -4 * s, 4.2 * s, 0, Math.PI * 2); ctx.stroke(); }
  ctx.strokeStyle = mount.id === "motorbike" ? "#8a1f1f" : "#2f5d7a"; ctx.lineWidth = 2 * s;
  ctx.beginPath(); ctx.moveTo(-9 * s, -4 * s); ctx.lineTo(-1 * s, -12 * s); ctx.lineTo(9 * s, -4 * s); ctx.moveTo(-1 * s, -12 * s); ctx.lineTo(7 * s, -14 * s); ctx.stroke();
  if (mount.id === "motorbike") { ctx.fillStyle = "#8a1f1f"; roundRect(ctx, -6 * s, -14 * s, 12 * s, 6 * s, 2 * s); ctx.fill(); }
  return 6 * s;
}

function toHex(c) {
  if (c.startsWith("#")) return c.length === 4 ? "#" + [...c.slice(1)].map((x) => x + x).join("") : c;
  return "#808080";
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ---------------- 동물/적 ----------------
export function drawAnimal(ctx, type, x, y, phase, moving, facing = 1, tamed = false) {
  const a = ANIMALS[type];
  const big = { horse: 1.3, cow: 1.25, boar: 1.0, wolf: 1.0, dog: 0.85, deer: 1.05, goat: 0.8, chicken: 0.5 }[type] || 1;
  const s = big;
  const g = moving ? Math.sin(phase * 1.4) * 2 : 0;
  ctx.save(); ctx.translate(x, y); if (facing < 0) ctx.scale(-1, 1);
  ctx.fillStyle = "rgba(0,0,0,0.28)"; ctx.beginPath(); ctx.ellipse(0, 1, 12 * s, 3.5 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = a.color;
  if (type === "chicken") {
    ctx.beginPath(); ctx.ellipse(0, -7, 6, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(5, -12, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#d33"; ctx.fillRect(4, -16, 2, 2); ctx.fillStyle = "#e9a020"; ctx.fillRect(8, -12, 2.5, 1.5);
    ctx.fillStyle = "#e9a020"; ctx.fillRect(-1 + g * 0.3, -2, 1, 3); ctx.fillRect(2 - g * 0.3, -2, 1, 3);
  } else {
    for (const lx of [-8, -4, 5, 9]) { ctx.fillRect(lx * s, -8 * s + (lx < 0 ? g : -g) * 0.3, 2.2 * s, 8.5 * s); }
    roundRect(ctx, -11 * s, -15 * s, 22 * s, 9 * s, 4.5 * s); ctx.fill();
    ctx.beginPath(); ctx.ellipse(12 * s, -15 * s, 4.5 * s, 3.6 * s, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(13.5 * s, -16 * s, 0.9, 0, Math.PI * 2); ctx.fill();
    if (type === "deer") { ctx.strokeStyle = "#5a4024"; ctx.lineWidth = 1.2; for (const o of [-1, 1]) { ctx.beginPath(); ctx.moveTo(11 * s, -18 * s); ctx.lineTo((11 + o * 2) * s, -25 * s); ctx.lineTo((13 + o * 2) * s, -27 * s); ctx.stroke(); } ctx.fillStyle = a.color; ctx.beginPath(); ctx.ellipse(8 * s, -21 * s, 3, 2.6, 0, 0, Math.PI * 2); ctx.fill(); }
    if (type === "goat" || type === "cow") { ctx.strokeStyle = "#e8e0c8"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(11 * s, -19 * s, 3, Math.PI, Math.PI * 1.8); ctx.stroke(); }
    if (type === "cow") { ctx.fillStyle = "#3a3a3a"; ctx.beginPath(); ctx.ellipse(-3 * s, -11 * s, 4, 3, 0, 0, Math.PI * 2); ctx.fill(); }
    if (type === "boar") { ctx.fillStyle = "#eee"; ctx.fillRect(15 * s, -14 * s, 2.5, 1.2); }
    if (type === "horse") { ctx.fillStyle = "#2b1d12"; ctx.fillRect(7 * s, -20 * s, 3 * s, 7 * s); ctx.fillRect(-13 * s, -14 * s, 3, 8); }
    if (type === "wolf" || type === "dog") { ctx.fillStyle = a.color; ctx.beginPath(); ctx.moveTo(10 * s, -18 * s); ctx.lineTo(11 * s, -22 * s); ctx.lineTo(13 * s, -18 * s); ctx.fill(); ctx.fillRect(-14 * s, -14 * s, 4, 2); }
  }
  if (tamed) { ctx.fillStyle = "#ff6b8a"; ctx.font = "9px sans-serif"; ctx.fillText("♥", -3, -24 * s); }
  ctx.restore();
}

export function drawEnemy(ctx, e, def, phase) {
  ctx.save(); ctx.translate(e.x, e.y);
  ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(0, 1, def.r, def.r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
  const bob = Math.sin(phase) * 1.5;
  if (e.type === "raider" || e.type === "ash_knight") {
    // 인간형 적: 플레이어와 같은 페이퍼돌을 재사용
    ctx.restore();
    const eq = e.type === "raider" ? { body: { id: "leather_jacket" }, legs: { id: "rag_pants" }, head: { id: "gas_mask" }, hand: { id: "pipe_pistol" } } : { body: { id: "combat_vest" }, legs: { id: "leather_pants" }, head: { id: "helmet" }, hand: { id: "machete" }, back: { id: "royal_robe" } };
    drawCharacter(ctx, e.x, e.y, { skin: "#b98c6a", hair: "short", hairColor: "#111" }, eq, e.vx < 0 ? -1 : 1, phase, { moving: true, scale: e.type === "ash_knight" ? 1.3 : 1 });
    hpBar(ctx, e.x, e.y - 50, e.hp / e.maxHp);
    return;
  }
  ctx.fillStyle = def.color;
  if (e.type === "rad_rat") { ctx.beginPath(); ctx.ellipse(0, -4 + bob, 8, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = def.color; ctx.beginPath(); ctx.moveTo(-8, -4); ctx.quadraticCurveTo(-14, -10, -16, -3); ctx.stroke(); ctx.fillStyle = "#cf3"; ctx.fillRect(5, -6 + bob, 2, 2); }
  else if (e.type === "feral_dog") { ctx.restore(); drawAnimal(ctx, "dog", e.x, e.y, phase, true, e.vx < 0 ? -1 : 1); ctx.save(); ctx.translate(e.x, e.y); ctx.fillStyle = "#f33"; ctx.fillRect(10, -17, 2, 2); }
  else { // mutant
    ctx.beginPath(); ctx.ellipse(0, -14 + bob, 9, 13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(2, -30 + bob, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#cfff6a"; ctx.beginPath(); ctx.arc(4, -31 + bob, 1.8, 0, Math.PI * 2); ctx.arc(-1, -31 + bob, 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(170,255,90,0.25)"; ctx.beginPath(); ctx.arc(0, -18, 16, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  hpBar(ctx, e.x, e.y - 40, e.hp / e.maxHp);
}

export function hpBar(ctx, x, y, f) {
  if (f >= 1) return;
  ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(x - 13, y, 26, 4);
  ctx.fillStyle = f > 0.5 ? "#7ed957" : f > 0.25 ? "#f2c14e" : "#e5534b"; ctx.fillRect(x - 12, y + 1, 24 * Math.max(0, f), 2);
}

// ---------------- 기지 ----------------
export function baseLayout(st, world) {
  const cx = (world.cx + 0.5) * TILE, cy = (world.cy + 0.5) * TILE;
  const L = BASE_LEVELS[st.base.lv - 1];
  const out = [];
  st.base.buildings.forEach((b, i) => {
    const ring = i < 6 ? 1 : i < 14 ? 2 : 3;
    const idxInRing = ring === 1 ? i : ring === 2 ? i - 6 : i - 14;
    const per = ring === 1 ? 6 : ring === 2 ? 8 : 10;
    const ang = (idxInRing / per) * Math.PI * 2 + ring * 0.4;
    const rad = (ring * 1.6 + 0.4) * TILE;
    out.push({ b, x: cx + Math.cos(ang) * rad, y: cy + Math.sin(ang) * rad * 0.8 });
  });
  return { cx, cy, wallR: L.wall * TILE, out };
}

export function drawBase(ctx, st, world, cam, t) {
  const { cx, cy, wallR, out } = baseLayout(st, world);
  const x = cx - cam.x, y = cy - cam.y;
  // 바닥
  ctx.fillStyle = "rgba(122,106,82,0.35)";
  ctx.beginPath(); ctx.ellipse(x, y, wallR, wallR * 0.8, 0, 0, Math.PI * 2); ctx.fill();
  // 성벽: 레벨에 따라 재질이 바뀐다 (나무 말뚝 → 돌 → 성벽 + 탑)
  const lv = st.base.lv;
  const n = 28 + lv * 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    if (Math.abs(a - Math.PI / 2) < 0.18) continue; // 남쪽 성문
    const wx = x + Math.cos(a) * wallR, wy = y + Math.sin(a) * wallR * 0.8;
    if (lv <= 1) { if (i % 3 === 0) { ctx.fillStyle = "#5c4630"; ctx.fillRect(wx - 1.5, wy - 8, 3, 8); } }
    else if (lv <= 4) { ctx.fillStyle = lv <= 2 ? "#6b5238" : "#7a5c3a"; ctx.fillRect(wx - 2.5, wy - 10 - lv * 2, 5, 10 + lv * 2); ctx.fillStyle = "#4a3828"; ctx.beginPath(); ctx.moveTo(wx - 2.5, wy - 10 - lv * 2); ctx.lineTo(wx, wy - 14 - lv * 2); ctx.lineTo(wx + 2.5, wy - 10 - lv * 2); ctx.fill(); }
    else { ctx.fillStyle = lv >= 7 ? "#9a948a" : "#86807a"; ctx.fillRect(wx - 3.5, wy - 18 - lv, 7, 18 + lv); if (i % 2 === 0) { ctx.fillStyle = "#6e6862"; ctx.fillRect(wx - 3.5, wy - 22 - lv, 3, 4); } }
  }
  if (lv >= 5) for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    const tx = x + Math.cos(a) * wallR, ty = y + Math.sin(a) * wallR * 0.8;
    ctx.fillStyle = "#77716a"; ctx.fillRect(tx - 8, ty - 40 - lv * 2, 16, 40 + lv * 2);
    ctx.fillStyle = lv >= 7 ? "#7a1f2b" : "#5d4a3a"; ctx.beginPath(); ctx.moveTo(tx - 10, ty - 40 - lv * 2); ctx.lineTo(tx, ty - 56 - lv * 2); ctx.lineTo(tx + 10, ty - 40 - lv * 2); ctx.fill();
    if (lv >= 7) { ctx.fillStyle = "#d4af37"; ctx.fillRect(tx - 0.5, ty - 70 - lv * 2, 1, 14); ctx.fillStyle = "#7a1f2b"; ctx.fillRect(tx, ty - 70 - lv * 2, 8, 5); }
  }
  // 중앙 본관(거점 레벨에 따라 커짐)
  drawKeep(ctx, x, y, lv, t);
  // 건물
  for (const o of out) {
    const def = BUILDINGS[o.b.id];
    const bx = o.x - cam.x, by = o.y - cam.y;
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(bx, by + 10, 15, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#3b3128"; roundRect(ctx, bx - 14, by - 14, 28, 26, 5); ctx.fill();
    ctx.strokeStyle = "rgba(255,220,160,0.25)"; ctx.lineWidth = 1; ctx.stroke();
    emoji(ctx, def.icon, bx, by - 1, 18);
    if (o.b.id === "campfire") drawFire(ctx, bx, by - 18, t);
    if (o.b.id === "generator" && !o.b.fueled) { ctx.fillStyle = "#e5534b"; ctx.font = "10px sans-serif"; ctx.fillText("⛽", bx + 8, by - 10); }
  }
  return { cx, cy, wallR };
}

function drawKeep(ctx, x, y, lv, t) {
  const w = 18 + lv * 6, h = 14 + lv * 7;
  if (lv === 1) { ctx.fillStyle = "#5a4a3a"; ctx.beginPath(); ctx.moveTo(x - 14, y + 6); ctx.lineTo(x, y - 16); ctx.lineTo(x + 14, y + 6); ctx.fill(); ctx.fillStyle = "#2a2018"; ctx.beginPath(); ctx.moveTo(x - 4, y + 6); ctx.lineTo(x, y - 4); ctx.lineTo(x + 4, y + 6); ctx.fill(); return; }
  const wall = lv <= 2 ? "#6b5640" : lv <= 4 ? "#7d6448" : lv <= 6 ? "#8d8780" : "#b4ada3";
  ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(x - w / 2 + 4, y + 6, w, 5);
  ctx.fillStyle = wall; ctx.fillRect(x - w / 2, y - h + 6, w, h);
  ctx.fillStyle = lv >= 5 ? "#5b2730" : "#4a3626";
  ctx.beginPath(); ctx.moveTo(x - w / 2 - 4, y - h + 6); ctx.lineTo(x, y - h - 10 - lv * 2); ctx.lineTo(x + w / 2 + 4, y - h + 6); ctx.fill();
  ctx.fillStyle = "#2a2018"; ctx.fillRect(x - 4, y - 6, 8, 12);
  const glow = 0.6 + Math.sin(t * 3) * 0.1;
  ctx.fillStyle = `rgba(255,190,90,${glow})`;
  for (let i = 0; i < Math.min(lv, 6); i++) ctx.fillRect(x - w / 2 + 5 + i * ((w - 10) / Math.max(1, Math.min(lv, 6) - 1 || 1)), y - h + 14, 3, 4);
  if (lv >= 6) { ctx.fillStyle = "#d4af37"; ctx.fillRect(x - 0.5, y - h - 26 - lv * 2, 1, 16); ctx.fillStyle = "#7a1f2b"; ctx.fillRect(x, y - h - 26 - lv * 2, 10, 6); }
}

export function drawFire(ctx, x, y, t) {
  for (let i = 0; i < 3; i++) {
    const f = Math.sin(t * 9 + i * 2) * 2;
    ctx.fillStyle = ["rgba(255,90,20,0.8)", "rgba(255,170,40,0.8)", "rgba(255,240,150,0.9)"][i];
    ctx.beginPath(); ctx.ellipse(x, y + 4 - i * 2, 6 - i * 1.6, 9 - i * 2 + f, 0, 0, Math.PI * 2); ctx.fill();
  }
}

export function drawNode(ctx, n, x, y) {
  const def = NODE_TYPES[n.type];
  ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(x, y + 8, 11, 4, 0, 0, Math.PI * 2); ctx.fill();
  if (n.type === "tree") {
    ctx.fillStyle = "#4a3726"; ctx.fillRect(x - 2.5, y - 14, 5, 22);
    ctx.strokeStyle = "#4a3726"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x - 8, y - 18); ctx.moveTo(x, y - 12); ctx.lineTo(x + 7, y - 22); ctx.stroke();
    ctx.fillStyle = "rgba(90,110,60,0.85)"; ctx.beginPath(); ctx.arc(x - 6, y - 22, 7, 0, Math.PI * 2); ctx.arc(x + 5, y - 25, 8, 0, Math.PI * 2); ctx.arc(x, y - 30, 7, 0, Math.PI * 2); ctx.fill();
  } else if (n.type === "rock") {
    ctx.fillStyle = "#7d766e"; ctx.beginPath(); ctx.moveTo(x - 12, y + 7); ctx.lineTo(x - 9, y - 6); ctx.lineTo(x + 1, y - 11); ctx.lineTo(x + 11, y - 3); ctx.lineTo(x + 12, y + 7); ctx.fill();
    ctx.fillStyle = "#958e86"; ctx.beginPath(); ctx.moveTo(x - 8, y - 5); ctx.lineTo(x + 1, y - 10); ctx.lineTo(x + 3, y - 2); ctx.fill();
  } else emoji(ctx, def.icon, x, y - 4, 22);
}

// ---------------- 조명/날씨 ----------------
export function drawLighting(ctx, vw, vh, darkness, lights) {
  if (darkness <= 0.01) return;
  const g = ctx.createRadialGradient(vw / 2, vh / 2, 0, vw / 2, vh / 2, Math.max(vw, vh));
  g.addColorStop(0, `rgba(8,10,25,${darkness * 0.75})`);
  g.addColorStop(1, `rgba(8,10,25,${darkness})`);
  ctx.save();
  ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
  ctx.globalCompositeOperation = "lighter";
  for (const L of lights) {
    const rg = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r);
    rg.addColorStop(0, `rgba(255,170,80,${0.35 * darkness})`); rg.addColorStop(1, "rgba(255,170,80,0)");
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(L.x, L.y, L.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

export function makeParticles(n, w, h) {
  return Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, s: 0.4 + Math.random() * 1.2, d: Math.random() * Math.PI * 2 }));
}
export function drawParticles(ctx, parts, vw, vh, dt, kind) {
  ctx.fillStyle = kind === "snow" ? "rgba(240,240,255,0.85)" : kind === "rad" ? "rgba(170,255,90,0.55)" : "rgba(200,195,185,0.45)";
  for (const p of parts) {
    p.y += (kind === "snow" ? 30 : 12) * p.s * dt;
    p.x += Math.sin((p.d += dt)) * 8 * dt + (kind === "snow" ? 0 : 6 * dt);
    if (p.y > vh) { p.y = -4; p.x = Math.random() * vw; }
    if (p.x > vw) p.x = 0;
    ctx.fillRect(p.x, p.y, 1.5 * p.s + (kind === "snow" ? 1 : 0), 1.5 * p.s + (kind === "snow" ? 1 : 0));
  }
}

// ---------------- 시네마틱(특별 이벤트) ----------------
// 같은 캐릭터 데이터를 대형 스케일 + 조명 + 비네팅으로 렌더 → '사실적 일러스트' 느낌.
export function drawCinematic(ctx, w, h, st, t, scene = {}) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  const palette = scene.palette || ["#1c1a24", "#5a3b2e", "#c7743b"];
  sky.addColorStop(0, palette[0]); sky.addColorStop(0.6, palette[1]); sky.addColorStop(1, palette[2]);
  ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
  // 원경: 폐허 도시 실루엣
  ctx.fillStyle = "rgba(20,16,20,0.75)";
  for (let i = 0; i < 18; i++) {
    const bw = 30 + ((i * 37) % 50), bh = 60 + ((i * 53) % 140), bx = (i * 71 + t * 4) % (w + 100) - 50;
    ctx.fillRect(bx, h * 0.62 - bh, bw, bh);
    ctx.fillStyle = "rgba(255,180,90,0.25)"; if (i % 3 === 0) ctx.fillRect(bx + 6, h * 0.62 - bh + 12, 3, 4); ctx.fillStyle = "rgba(20,16,20,0.75)";
  }
  // 지면
  ctx.fillStyle = "#231c18"; ctx.fillRect(0, h * 0.62, w, h);
  // 태양/섬광
  const sun = ctx.createRadialGradient(w * 0.72, h * 0.45, 0, w * 0.72, h * 0.45, h * 0.5);
  sun.addColorStop(0, "rgba(255,220,160,0.55)"); sun.addColorStop(1, "rgba(255,220,160,0)");
  ctx.fillStyle = sun; ctx.fillRect(0, 0, w, h);
  // 주인공 + 동료(대형, 디테일 모드)
  const sc = Math.min(h / 120, w / 60);
  const p = st.player;
  const comps = st.companions.filter((c) => c.story || c.spouse).slice(0, 2);
  comps.forEach((c, i) => drawCharacter(ctx, w * (0.5 + (i ? 0.16 : -0.16)), h * 0.64, { skin: "#c9956d", hair: c.gender === "F" ? "long" : "short", hairColor: "#1b1410" }, { body: { id: c.role === "soldier" ? "combat_vest" : c.role === "doctor" ? "rag_shirt" : "leather_jacket" }, legs: { id: "leather_pants" }, feet: { id: "boots" } }, i ? -1 : 1, t * 2, { detail: true, scale: sc * 0.8, gender: c.gender }));
  drawCharacter(ctx, w * 0.5, h * 0.67, p.look, scene.crown ? { ...p.equip, head: { id: "crown" }, back: { id: "royal_robe" } } : p.equip, 1, t * 2, { detail: true, scale: sc, gender: p.gender });
  // 재/불씨 입자
  for (let i = 0; i < 40; i++) {
    const px = (i * 97 + t * 30 * (1 + (i % 3))) % w, py = (i * 61 + t * 20) % h;
    ctx.fillStyle = i % 4 ? "rgba(220,210,200,0.35)" : "rgba(255,140,60,0.7)"; ctx.fillRect(px, py, 2, 2);
  }
  // 비네팅 + 필름 그레인
  const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.75)");
  ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(0,0,0,0.85)"; ctx.fillRect(0, 0, w, h * 0.07); ctx.fillRect(0, h * 0.93, w, h * 0.07); // 시네마 레터박스
}
