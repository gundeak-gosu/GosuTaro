// 결정적(시드 기반) 난수 — 같은 시드면 같은 월드/같은 올림픽 결과가 나와야
// 서버가 클라이언트 결과를 재계산해 검증할 수 있다.
export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const r = mulberry32(typeof seed === "string" ? hashStr(seed) : seed);
  return {
    next: r,
    int: (lo, hi) => lo + Math.floor(r() * (hi - lo + 1)),
    range: (lo, hi) => lo + r() * (hi - lo),
    pick: (arr) => arr[Math.floor(r() * arr.length)],
    chance: (p) => r() < p,
  };
}

// 2D value noise (부드러운 지형 생성용)
export function valueNoise2D(seed) {
  const perm = new Uint8Array(512);
  const r = mulberry32(seed);
  const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grad = (ix, iy) => perm[(perm[ix & 255] + iy) & 255] / 255;
  const fade = (t) => t * t * (3 - 2 * t);
  return function (x, y) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = fade(x - x0), fy = fade(y - y0);
    const a = grad(x0, y0), b = grad(x0 + 1, y0), c = grad(x0, y0 + 1), d = grad(x0 + 1, y0 + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}
