// =====================================================================
// 지구 — 모든 플레이어가 공유하는 하나의 세계
// 게임을 시작하면 지구의 무작위 육지 한 구역(약 0.87km 크기)에 떨어진다.
// 0.5° 격자(720×360) 안의 육지 칸 하나를 다시 64×64 구역으로 나누면 육지 구역이 약 2.5억 개 →
// 1억 명이 각자 시작해도 겹칠 확률은 낮다. 같은 좌표 = 같은 시드 = 같은 지형(마인크래프트의 시드처럼).
// 위치에 따라 기온·지형·날씨·낮 길이가 달라지지만, 난이도 흐름은 BIOMES 의 보정치로 맞춘다.
// =====================================================================
import { LAND_W, LAND_H, LAND_B64 } from "./earth-data.js";
import { BIOMES } from "./data.js";
import { makeRng, hashStr } from "./rng.js";

let bits = null;
function decode() {
  if (bits) return bits;
  if (typeof atob === "function") { const s = atob(LAND_B64); bits = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) bits[i] = s.charCodeAt(i); }
  else bits = new Uint8Array(Buffer.from(LAND_B64, "base64"));
  return bits;
}
export const SUB = 64; // 0.5° 칸 하나를 64×64 구역으로

export function cellOf(lat, lon) {
  const row = Math.max(0, Math.min(LAND_H - 1, Math.floor((90 - lat) / (180 / LAND_H))));
  const col = ((Math.floor((lon + 180) / (360 / LAND_W)) % LAND_W) + LAND_W) % LAND_W;
  return [row, col];
}
export function landAt(row, col) {
  if (row < 0 || row >= LAND_H) return false;
  col = ((col % LAND_W) + LAND_W) % LAND_W;
  const i = row * LAND_W + col;
  return !!(decode()[i >> 3] & (1 << (i & 7)));
}
export function isLand(lat, lon) { const [r, c] = cellOf(lat, lon); return landAt(r, c); }

// 대륙성(주변 ±6° 안 육지 비율): 내륙일수록 일교차·연교차 큼, 건조
export function continentality(lat, lon) {
  const [r, c] = cellOf(lat, lon);
  let n = 0, t = 0;
  for (let dr = -12; dr <= 12; dr += 3) for (let dc = -12; dc <= 12; dc += 3) { t++; if (landAt(r + dr, c + dc)) n++; }
  return n / t;
}

// ---------- 옛 도시(분위기·방사능·고철 분포) ----------
export const CITIES = [
  ["서울", 37.57, 126.98], ["부산", 35.18, 129.08], ["평양", 39.03, 125.75], ["도쿄", 35.68, 139.69], ["오사카", 34.69, 135.5], ["베이징", 39.9, 116.4], ["상하이", 31.23, 121.47],
  ["홍콩", 22.32, 114.17], ["타이베이", 25.03, 121.56], ["마닐라", 14.6, 120.98], ["하노이", 21.03, 105.85], ["방콕", 13.76, 100.5], ["싱가포르", 1.35, 103.82], ["자카르타", -6.2, 106.85],
  ["뉴델리", 28.61, 77.21], ["뭄바이", 19.08, 72.88], ["다카", 23.81, 90.41], ["카라치", 24.86, 67.0], ["테헤란", 35.69, 51.39], ["바그다드", 33.31, 44.36], ["리야드", 24.71, 46.68],
  ["두바이", 25.2, 55.27], ["이스탄불", 41.01, 28.98], ["카이로", 30.04, 31.24], ["라고스", 6.52, 3.38], ["킨샤사", -4.44, 15.27], ["나이로비", -1.29, 36.82], ["아디스아바바", 9.03, 38.74],
  ["요하네스버그", -26.2, 28.05], ["케이프타운", -33.92, 18.42], ["카사블랑카", 33.57, -7.59], ["모스크바", 55.76, 37.62], ["상트페테르부르크", 59.93, 30.36], ["노보시비르스크", 55.0, 82.93],
  ["야쿠츠크", 62.03, 129.73], ["블라디보스토크", 43.12, 131.89], ["알마티", 43.24, 76.89], ["울란바토르", 47.89, 106.91], ["키이우", 50.45, 30.52], ["바르샤바", 52.23, 21.01], ["베를린", 52.52, 13.4],
  ["파리", 48.86, 2.35], ["런던", 51.51, -0.13], ["마드리드", 40.42, -3.7], ["로마", 41.9, 12.5], ["스톡홀름", 59.33, 18.07], ["레이캬비크", 64.15, -21.94], ["뉴욕", 40.71, -74.0],
  ["워싱턴", 38.9, -77.04], ["시카고", 41.88, -87.63], ["토론토", 43.65, -79.38], ["몬트리올", 45.5, -73.57], ["로스앤젤레스", 34.05, -118.24], ["샌프란시스코", 37.77, -122.42], ["시애틀", 47.61, -122.33],
  ["덴버", 39.74, -104.99], ["휴스턴", 29.76, -95.37], ["마이애미", 25.76, -80.19], ["멕시코시티", 19.43, -99.13], ["앵커리지", 61.22, -149.9], ["아바나", 23.11, -82.37], ["보고타", 4.71, -74.07],
  ["리마", -12.05, -77.04], ["마나우스", -3.12, -60.02], ["상파울루", -23.55, -46.63], ["리우데자네이루", -22.91, -43.17], ["부에노스아이레스", -34.6, -58.38], ["산티아고", -33.45, -70.67],
  ["시드니", -33.87, 151.21], ["멜버른", -37.81, 144.96], ["퍼스", -31.95, 115.86], ["앨리스스프링스", -23.7, 133.88], ["오클랜드", -36.85, 174.76], ["누크", 64.18, -51.69],
];
const toRad = (d) => (d * Math.PI) / 180;
export function distanceKm(a1, o1, a2, o2) {
  const dA = toRad(a2 - a1), dO = toRad(o2 - o1);
  const h = Math.sin(dA / 2) ** 2 + Math.cos(toRad(a1)) * Math.cos(toRad(a2)) * Math.sin(dO / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}
export function nearestCity(lat, lon) {
  let best = null;
  for (const [name, a, o] of CITIES) { const d = distanceKm(lat, lon, a, o); if (!best || d < best.km) best = { name, km: Math.round(d) }; }
  return best;
}

export function regionName(lat, lon) {
  const box = (a0, a1, o0, o1) => lat >= a0 && lat <= a1 && lon >= o0 && lon <= o1;
  if (lat < -60) return "남극";
  if (box(59, 84, -74, -10)) return "그린란드";
  if (box(7, 23, -118, -58) || box(23, 32.5, -118, -97)) return lat > 25 && lon > -106 ? "북아메리카" : "중앙아메리카";
  if (box(-56, 13, -82, -34)) return "남아메리카";
  if (box(14, 84, -170, -50)) return "북아메리카";
  if (box(35, 72, -25, 45)) return "유럽";
  if (box(12, 42, 34, 63)) return "중동";
  if (box(-36, 37, -20, 52)) return "아프리카";
  if (box(5, 37, 60, 92)) return "남아시아";
  if (box(-11, 23, 92, 141)) return "동남아시아";
  if (box(18, 55, 92, 146)) return "동아시아";
  if (box(-50, -10, 110, 180)) return "오세아니아";
  if (lat > 42 && lon > 45) return "시베리아·중앙아시아";
  if (box(30, 50, 45, 92)) return "중앙아시아";
  return "외딴 섬";
}

// ---------- 기후 ----------
export function climate(lat, lon) {
  const c = continentality(lat, lon);
  const al = Math.abs(lat);
  const cos = Math.cos(toRad(al));
  const h = (hashStr(`${Math.round(lat * 2)}|${Math.round(lon * 2)}`) % 1000) / 1000; // 지역 편차
  const T0 = 32 * Math.pow(cos, 1.5) - 8 - (c - 0.5) * 3 + (h - 0.5) * 2; // 연평균 기온
  const A = (2 + 0.28 * al) * (0.45 + c * 0.9); // 연교차(절반)
  let P; // 강수 지수 0~1.2
  if (al < 10) P = 1.05; else if (al < 18) P = 1.05 - (al - 10) * 0.08; else if (al < 33) P = 0.35 - (al - 18) * 0.012; else if (al < 60) P = 0.17 + (al - 33) * 0.024; else P = 0.8 - (al - 60) * 0.015;
  const region = regionName(lat, lon);
  const dry = al < 12 ? 0.15 : 0.55; // 적도 내륙은 대류성 강우로 여전히 습함
  P = P * (1.25 - dry * c);
  if (["동아시아", "남아시아", "동남아시아"].includes(region) && lat > 5 && lat < 45 && !(region === "남아시아" && lon < 75 && lat > 23)) P += 0.38; // 아시아 몬순
  if (region === "북아메리카" && lon > -100 && lat < 50) P += 0.25; // 북미 동부(멕시코만 습기)
  if (region === "유럽" && lon < 30) P += 0.15; // 편서풍 해양성
  P = Math.max(0.05, P + (h - 0.5) * 0.2);
  let biome;
  if (T0 < -5) biome = "ice";
  else if (T0 < -2 || al > 67) biome = "tundra";
  else if (T0 < 6) biome = P < 0.22 ? "steppe" : "taiga";
  else if (P < 0.22 && T0 > 13) biome = "desert";
  else if (P < 0.3) biome = "steppe";
  else if (T0 > 20 && P > 0.85) biome = "rainforest";
  else if (T0 > 19) biome = "savanna";
  else biome = P > 0.42 ? "temperate" : "steppe";
  const coast = c < 0.45;
  const city = nearestCity(lat, lon);
  return { lat, lon, T0: Math.round(T0 * 10) / 10, A: Math.round(A * 10) / 10, P: Math.round(P * 100) / 100, cont: Math.round(c * 100) / 100, biome, coast, region, city, south: lat < 0 };
}

// ---------- 낙하 지점 ----------
// 무작위 육지 구역. 빙원·남극은 제외(시작 불가), 그 외는 모두 가능.
export function randomSpawn(seed) {
  const rng = makeRng(seed);
  for (let tries = 0; tries < 5000; tries++) {
    // 면적 비례 추출: 위도는 sin 균등 → 극지가 과대표집되지 않음
    const lat = (Math.asin(rng.range(-1, 1)) * 180) / Math.PI;
    const lon = rng.range(-180, 180);
    if (lat < -56 || lat > 78) continue;
    if (!isLand(lat, lon)) continue;
    const cl = climate(lat, lon);
    if (!BIOMES[cl.biome]?.spawn) continue;
    const [row, col] = cellOf(lat, lon);
    const sr = rng.int(0, SUB - 1), sc = rng.int(0, SUB - 1);
    const cellLat = 90 - (row + (sr + 0.5) / SUB) * (180 / LAND_H);
    const cellLon = -180 + (col + (sc + 0.5) / SUB) * (360 / LAND_W);
    const id = `${row}:${col}:${sr}:${sc}`;
    const fin = climate(cellLat, cellLon);
    if (!BIOMES[fin.biome]?.spawn) continue;
    return { id, seed: hashStr("earth|" + id), ...fin, lat: Math.round(cellLat * 1000) / 1000, lon: Math.round(cellLon * 1000) / 1000 };
  }
  throw new Error("spawn failed");
}

export function fmtCoord(lat, lon) {
  return `${lat >= 0 ? "북위" : "남위"} ${Math.abs(lat).toFixed(2)}° · ${lon >= 0 ? "동경" : "서경"} ${Math.abs(lon).toFixed(2)}°`;
}

// 지구 지도 이미지(등장방형) — 낙하 지점/세계 지도 화면용
export function drawEarthMap(ctx, w, h, marks = []) {
  const img = ctx.createImageData(LAND_W, LAND_H);
  for (let r = 0; r < LAND_H; r++) for (let c = 0; c < LAND_W; c++) {
    const i = (r * LAND_W + c) * 4;
    if (landAt(r, c)) { const lat = 90 - (r + 0.5) / 2; const t = Math.abs(lat) > 62 ? [200, 200, 196] : [122, 112, 92]; img.data.set([...t, 255], i); }
    else img.data.set([30, 44, 52, 255], i);
  }
  const tmp = document.createElement("canvas"); tmp.width = LAND_W; tmp.height = LAND_H;
  tmp.getContext("2d").putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(tmp, 0, 0, w, h);
  for (const m of marks) {
    const x = ((m.lon + 180) / 360) * w, y = ((90 - m.lat) / 180) * h;
    ctx.strokeStyle = m.color || "#e0a24a"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, m.r || 7, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = m.color || "#e0a24a"; ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
  }
}
