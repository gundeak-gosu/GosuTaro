// 그림 자원(OpenAI gpt-image-2 로 만든 시트를 잘라 둔 것) — 아이템·건물·오브젝트·동물·적·지형
// 그림이 없으면 null → 예전 방식(SVG 아이콘·도형)으로 그린다.
import { ART } from "./art-manifest.js";
const has = {}; for (const [d, list] of Object.entries(ART)) has[d] = new Set(list);
export function artPath(dir, id) { return has[dir]?.has(id) ? `assets/${dir}/${id}.webp` : null; }
// 아이콘 키(아이템 id, "b.건물", "a.동물") → 그림 경로
export function iconSrc(key) {
  if (key.startsWith("b.")) return artPath("objects", key.slice(2));
  if (key.startsWith("a.")) return artPath("mobs", key.slice(2));
  return artPath("items", key);
}
const cache = new Map();
let onLoad = () => {};
export function setArtLoaded(fn) { onLoad = fn; }
// 캔버스용 이미지(불러오는 중이면 null)
export function img(dir, id) {
  const k = dir + "/" + id;
  let i = cache.get(k);
  if (i === undefined) {
    const src = artPath(dir, id);
    if (!src) { cache.set(k, null); return null; }
    i = new Image(); i.onload = () => onLoad(dir, id); i.src = src; cache.set(k, i);
  }
  return i && i.complete && i.naturalWidth ? i : null;
}
// 그림을 바닥(발) 기준으로 그린다. h: 화면 높이(px), facing<0 이면 좌우 반전(그림은 오른쪽을 본다)
export function drawSprite(ctx, dir, id, x, y, h, facing = 1, bob = 0) {
  const i = img(dir, id);
  if (!i) return false;
  const w = (i.naturalWidth / i.naturalHeight) * h;
  ctx.save(); ctx.translate(x, y - bob); if (facing < 0) ctx.scale(-1, 1);
  ctx.drawImage(i, -w / 2, -h, w, h);
  ctx.restore();
  return true;
}
// 처음에 지형 텍스처를 미리 불러 둔다
export function preloadTiles() { return Promise.all(ART.tiles.map((t) => new Promise((res) => { const i = img("tiles", t); if (i) return res(); const im = cache.get("tiles/" + t); if (!im) return res(); im.addEventListener("load", res); im.addEventListener("error", res); }))); }
