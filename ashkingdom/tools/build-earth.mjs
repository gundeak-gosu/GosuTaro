// 실제 지구 육지 데이터(world-atlas land-50m, ISC / 원본 Natural Earth 퍼블릭 도메인)를
// 0.5° 격자(720×360) 비트맵으로 래스터화해 js/earth-data.js 로 내장한다. (런타임 네트워크 0)
// 사용: npm pack world-atlas@2.0.2 && tar xzf world-atlas-2.0.2.tgz && node tools/build-earth.mjs package/land-50m.json
import fs from "fs";
const topo = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const { scale, translate } = topo.transform;
const arcs = topo.arcs.map((a) => { let x = 0, y = 0; return a.map(([dx, dy]) => { x += dx; y += dy; return [x * scale[0] + translate[0], y * scale[1] + translate[1]]; }); });
const ring = (ids) => { const pts = []; for (const i of ids) { const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i]; pts.push(...(pts.length ? a.slice(1) : a)); } return pts; };
const rings = [];
for (const g of topo.objects.land.geometries) {
  const polys = g.type === "Polygon" ? [g.arcs] : g.arcs;
  for (const p of polys) for (const r of p) rings.push(ring(r));
}
// 날짜변경선(±180°)을 '점프'로 건너는 고리: 점프 지점을 쪽(서/동)별로 짝지어 ±180° 위의 수직 경계선을 복원
const seams = []; // [x, yLo, yHi]
for (const r of rings) {
  const side = { "-180": [], "180": [] };
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [x1, y1] = r[i], [x2, y2] = r[j];
    if (Math.abs(x2 - x1) > 180) { side[x1 < 0 ? "-180" : "180"].push(y1); side[x2 < 0 ? "-180" : "180"].push(y2); }
  }
  for (const k of ["-180", "180"]) { const ys = side[k].sort((a, b) => a - b); for (let i = 0; i + 1 < ys.length; i += 2) seams.push([+k, ys[i], ys[i + 1]]); }
}
const W = 720, H = 360;
const bits = new Uint8Array((W * H) / 8);
for (let row = 0; row < H; row++) {
  const lat = 90 - (row + 0.5) * (180 / H);
  const xs = [];
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [x1, y1] = r[i], [x2, y2] = r[j];
    if ((y1 > lat) !== (y2 > lat)) {
      if (Math.abs(x2 - x1) <= 180) xs.push(x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1));
    }
  }
  for (const [x, lo, hi] of seams) if (lat > lo && lat < hi) xs.push(x);
  xs.sort((a, b) => a - b);
  for (let k = 0; k + 1 < xs.length; k += 2) {
    for (let col = 0; col < W; col++) {
      const lon = -180 + (col + 0.5) * (360 / W);
      if (lon >= xs[k] && lon < xs[k + 1]) { const i = row * W + col; bits[i >> 3] |= 1 << (i & 7); }
    }
  }
}
let land = 0; for (let i = 0; i < W * H; i++) if (bits[i >> 3] & (1 << (i & 7))) land++;
const b64 = Buffer.from(bits).toString("base64");
fs.writeFileSync(new URL("../js/earth-data.js", import.meta.url), `// 자동 생성: tools/build-earth.mjs (Natural Earth 1:50m 육지, 0.5° 격자). 직접 수정 금지.\nexport const LAND_W = ${W}, LAND_H = ${H};\nexport const LAND_B64 = "${b64}";\n`);
console.log(`rings ${rings.length}, land cells ${land} (${((land / (W * H)) * 100).toFixed(1)}%), b64 ${b64.length} bytes`);
