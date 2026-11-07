// =====================================================================
// 3D 렌더러 (Three.js) — 필드 / 캐릭터 뷰어(자세히 보기) / 시네마틱
// 1 타일 = 1m. 게임 규칙은 2D 좌표(px)를 쓰고, 여기서 (x/32, 높이, y/32)로 옮겨 그린다.
// 캐릭터는 관절 계층(엉덩이→척추→가슴→목→머리, 어깨→위팔→팔꿈치→아래팔→손, 허벅지→무릎→정강이→발)을 가진
// 절차적 휴머노이드이며, 옷은 신체 부위 위에 겹쳐 입는 '레이어 메시'다.
// assets/models/*.glb 가 있으면 전문 3D 모델로 교체할 수 있게 loadCustomModel() 훅을 둔다(기획서 §15).
// =====================================================================
import * as THREE from "three";
import { ITEMS, ANIMALS, VEHICLES, BUILDINGS, BASE_LEVELS, BIOMES, WEATHER } from "./data.js";
import { TILE, WORLD_W, WORLD_H, T } from "./world.js";
import { baseLayout } from "./render.js";
import * as Ic from "./icons.js";

export function webglAvailable() {
  try { const c = document.createElement("canvas"); return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl"))); } catch { return false; }
}

const LOW = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);

// ---------------- 공용 캐시 ----------------
const matCache = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: opts.r ?? 0.85, metalness: opts.m ?? 0, emissive: new THREE.Color(opts.e || 0x000000), emissiveIntensity: opts.ei ?? 1, flatShading: !!opts.flat, transparent: opts.o !== undefined, opacity: opts.o ?? 1, side: opts.ds ? THREE.DoubleSide : THREE.FrontSide });
    matCache.set(key, m);
  }
  return m;
}
const geoCache = new Map();
function geo(key, make) { let g = geoCache.get(key); if (!g) { g = make(); geoCache.set(key, g); } return g; }
const capsule = (r, l, seg = LOW ? 8 : 14) => geo(`cap${r}|${l}|${seg}`, () => new THREE.CapsuleGeometry(r, l, 4, seg));
const sphere = (r, w = LOW ? 12 : 20, h = LOW ? 8 : 14) => geo(`sph${r}|${w}`, () => new THREE.SphereGeometry(r, w, h));
const box = (x, y, z) => geo(`box${x}|${y}|${z}`, () => new THREE.BoxGeometry(x, y, z));
const cyl = (a, b, h, s = 12) => geo(`cyl${a}|${b}|${h}|${s}`, () => new THREE.CylinderGeometry(a, b, h, s));
const cone = (r, h, s = 12) => geo(`cone${r}|${h}|${s}`, () => new THREE.ConeGeometry(r, h, s));

function mesh(g, m, x = 0, y = 0, z = 0, shadow = true) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = shadow; o.receiveShadow = shadow;
  return o;
}
function put(parent, child) { parent.add(child); return child; }
function shade(hex, f) { const c = new THREE.Color(hex); c.multiplyScalar(f); return "#" + c.getHexString(); }

// 노이즈 디테일 텍스처(흙·천의 미세 질감)
let noiseTex = null;
function getNoiseTex() {
  if (noiseTex) return noiseTex;
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d"); const img = g.createImageData(256, 256);
  for (let i = 0; i < 256 * 256; i++) { const v = 228 + Math.random() * 27; img.data.set([v, v, v, 255], i * 4); }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`; g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, Math.random() * 6, 0, 7); g.fill(); }
  noiseTex = new THREE.CanvasTexture(c);
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
  noiseTex.colorSpace = THREE.SRGBColorSpace;
  return noiseTex;
}

// 라벨 스프라이트: [아이콘(SVG 세트)] + 텍스트. 아이콘은 비동기 로드 후 텍스처 갱신.
function labelSprite(text, color = "#fff", scale = 1, iconKey = null) {
  const c = document.createElement("canvas");
  const g = c.getContext("2d");
  g.font = "bold 44px sans-serif";
  const iw = iconKey ? 64 : 0;
  const tw = text ? Math.ceil(g.measureText(text).width) : 0;
  const w = tw + iw + (text ? 40 : 16);
  c.width = w; c.height = 76;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const paint = (img) => {
    g.clearRect(0, 0, w, 76);
    g.fillStyle = "rgba(29,23,18,.78)"; g.beginPath(); g.roundRect(0, 6, w, 64, 32); g.fill();
    g.strokeStyle = "rgba(224,162,74,.55)"; g.lineWidth = 3; g.stroke();
    if (img) g.drawImage(img, 10, 8, 60, 60);
    g.font = "bold 44px sans-serif"; g.fillStyle = color; g.textBaseline = "middle";
    if (text) g.fillText(text, iw + 18, 40);
    t.needsUpdate = true;
  };
  paint(null);
  if (iconKey && Ic.has(iconKey)) { const img = new Image(); img.onload = () => paint(img); img.src = Ic.dataURI(iconKey, 64); }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true }));
  s.scale.set((w / 76) * 0.6 * scale, 0.6 * scale, 1);
  s.renderOrder = 10;
  return s;
}

// =====================================================================
// 휴머노이드
// =====================================================================
const SKIN_DEFAULT = "#d9a982";
export class Humanoid {
  constructor(opts = {}) {
    this.root = new THREE.Group();
    this.phase = Math.random() * 6;
    this.swing = 0;
    this.opts = opts;
    this.sig = "";
  }

  // look: {skin, hair, hairColor}, equip: {head, body, legs, feet, back, hand}, gender
  build(look, equip, gender = "M", variant = null) {
    const sig = JSON.stringify([look, Object.fromEntries(Object.entries(equip || {}).map(([k, v]) => [k, v ? v.id + (v.q ?? "") : null])), gender, variant]);
    if (sig === this.sig) return this;
    this.sig = sig;
    this.root.clear();
    const F = gender === "F";
    const mutant = variant === "mutant";
    const big = variant === "knight" ? 1.12 : variant === "child" ? 0.68 : 1;
    const skinC = mutant ? "#6b8f5e" : look?.skin || SKIN_DEFAULT;
    const skin = new THREE.MeshStandardMaterial({ color: skinC, roughness: 0.55, metalness: 0 });
    const L = (slot) => (equip?.[slot] ? ITEMS[equip[slot].id] : null);
    const cloth = (slot, fallbackColor) => {
      const it = L(slot);
      const c = it?.look?.color || fallbackColor;
      return new THREE.MeshStandardMaterial({ color: c, roughness: it?.look?.style === "hazmat" ? 0.45 : it?.look?.style === "jacket" ? 0.6 : 0.92, metalness: it?.look?.style === "helmet" ? 0.3 : 0, map: getNoiseTex() });
    };
    const shoulderW = F ? 0.165 : 0.2, hipW = F ? 0.11 : 0.1;

    // ----- 골격 -----
    const hips = new THREE.Group(); hips.position.y = 0.94; this.root.add(hips);
    const spine = new THREE.Group(); spine.position.y = 0.08; hips.add(spine);
    const chest = new THREE.Group(); chest.position.y = 0.24; spine.add(chest);
    const neck = new THREE.Group(); neck.position.y = 0.19; chest.add(neck);
    const head = new THREE.Group(); head.position.y = 0.14; head.scale.setScalar(1.08); neck.add(head);
    this.b = { hips, spine, chest, neck, head };

    // 몸통(맨몸)
    put(hips, mesh(capsule(F ? 0.15 : 0.14, 0.08), skin, 0, 0.02, 0)).scale.set(1.05, 1, 0.75);
    const waist = mesh(capsule(F ? 0.12 : 0.135, 0.14), skin, 0, 0.1, 0); waist.scale.set(1, 1, 0.72); spine.add(waist);
    const torso = mesh(capsule(F ? 0.15 : 0.175, 0.12), skin, 0, 0.02, 0); torso.scale.set(1, 1, 0.66); chest.add(torso);
    const traps = mesh(capsule(F ? 0.05 : 0.062, shoulderW * 1.7), skin, 0, 0.12, -0.005); traps.rotation.z = Math.PI / 2; traps.scale.set(1, 1, 0.8); chest.add(traps);
    if (F) for (const sx of [-1, 1]) put(chest, mesh(sphere(0.062), skin, sx * 0.065, 0.02, 0.085)).scale.set(1, 0.9, 0.8);
    put(neck, mesh(cyl(0.048, 0.055, 0.12), skin, 0, 0.0, 0));
    // 기본 속옷(맨몸 상태의 기본 레이어)
    const under = mat("#2f3240", { r: 0.9 });
    if (!L("legs")) { const u = mesh(capsule(F ? 0.155 : 0.148, 0.05), under, 0, 0.0, 0); u.scale.set(1.06, 0.9, 0.78); hips.add(u); }
    if (F && !L("body")) { const u = mesh(capsule(0.155, 0.04), under, 0, 0.03, 0); u.scale.set(1.04, 1, 0.72); chest.add(u); }

    // 머리 + 얼굴
    const skull = mesh(sphere(0.108), skin, 0, 0.02, 0); skull.scale.set(0.92, 1.08, 1); head.add(skull);
    const jaw = mesh(sphere(0.085), skin, 0, -0.045, 0.02); jaw.scale.set(F ? 0.9 : 1, 0.75, 0.95); head.add(jaw);
    const eyeW = mat("#f2efe8", { r: 0.3 }), iris = mat(mutant ? "#c8ff5a" : "#3b2a1e", { r: 0.2, e: mutant ? "#9fff40" : undefined, ei: mutant ? 2 : 1 });
    for (const sx of [-1, 1]) {
      put(head, mesh(sphere(0.017, 10, 8), eyeW, sx * 0.038, 0.025, 0.088, false));
      put(head, mesh(sphere(0.0095, 8, 6), iris, sx * 0.038, 0.025, 0.103, false));
      const brow = mesh(box(0.035, 0.008, 0.01), mat(look?.hairColor || "#2b211b"), sx * 0.04, 0.052, 0.098, false); brow.rotation.z = sx * -0.12; head.add(brow);
      put(head, mesh(sphere(0.022, 8, 6), skin, sx * 0.1, 0.01, 0.0)).scale.set(0.5, 1, 0.8); // 귀
    }
    const nose = mesh(cone(0.016, 0.045, 8), skin, 0, -0.005, 0.11, false); nose.rotation.x = Math.PI / 2; head.add(nose);
    put(head, mesh(box(0.04, 0.007, 0.01), mat(F ? "#a85a5a" : "#8a5a4a"), 0, -0.05, 0.096, false));
    if (!mutant && !F) put(head, mesh(box(0.06, 0.012, 0.01), mat("#3a2c22", { o: 0.25 }), 0, -0.075, 0.09, false)); // 수염 자국/먼지
    // 머리카락
    const hairM = new THREE.MeshStandardMaterial({ color: look?.hairColor || "#2b211b", roughness: 0.7 });
    const helm = L("head")?.look?.style;
    const hideHair = helm === "helmet" || variant === "mutant";
    if (!hideHair) {
      const hs = look?.hair || (F ? "long" : "short");
      const cap = mesh(sphere(0.115, 20, 12), hairM, 0, 0.045, -0.01); cap.scale.set(0.95, 0.85, 1.02); head.add(cap);
      const fringe = mesh(box(0.17, 0.035, 0.05), hairM, 0, 0.085, 0.07); fringe.rotation.x = -0.4; head.add(fringe);
      if (hs === "long") { const back = mesh(capsule(0.09, 0.16), hairM, 0, -0.08, -0.06); back.scale.set(1.15, 1, 0.55); head.add(back); }
      if (hs === "pony") { const tail = mesh(capsule(0.035, 0.16), hairM, 0, -0.06, -0.13); tail.rotation.x = 0.4; head.add(tail); }
      if (hs === "mohawk") { cap.scale.set(0.5, 0.7, 1); put(head, mesh(box(0.025, 0.07, 0.2), hairM, 0, 0.13, -0.01)); }
      if (hs === "beard") { const b = mesh(sphere(0.07), hairM, 0, -0.07, 0.05); b.scale.set(1, 0.8, 0.7); head.add(b); }
    }
    // 머리 장비
    if (helm === "helmet") { const h = mesh(sphere(0.13, 20, 10, 0), cloth("head"), 0, 0.04, 0); h.scale.set(1, 0.8, 1.05); head.add(h); put(head, mesh(cyl(0.15, 0.15, 0.02, 20), cloth("head"), 0, 0.02, 0)); }
    if (helm === "mask") {
      const m = mesh(capsule(0.06, 0.04), cloth("head"), 0, -0.02, 0.085); m.rotation.x = Math.PI / 2; m.scale.set(1.2, 1, 1); head.add(m);
      for (const sx of [-1, 1]) { put(head, mesh(cyl(0.022, 0.022, 0.01, 12), mat("#9ad0e0", { r: 0.1, m: 0.3 }), sx * 0.04, 0.025, 0.11)).rotation.x = Math.PI / 2; }
      const f = mesh(cyl(0.03, 0.035, 0.05, 12), mat("#222", { r: 0.5 }), 0, -0.07, 0.13); f.rotation.x = Math.PI / 2.4; head.add(f);
    }
    if (helm === "crown") {
      const gold = mat("#d4af37", { r: 0.25, m: 1 });
      put(head, mesh(cyl(0.105, 0.1, 0.04, 20), gold, 0, 0.12, 0));
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; put(head, mesh(cone(0.016, 0.05, 6), gold, Math.cos(a) * 0.1, 0.16, Math.sin(a) * 0.1)); }
      put(head, mesh(sphere(0.014, 8, 6), mat("#c0273b", { r: 0.1, m: 0.2 }), 0, 0.12, 0.105));
    }

    // ----- 팔 -----
    this.b.arm = [];
    for (const sx of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(sx * shoulderW, 0.12, 0); chest.add(sh);
      put(sh, mesh(sphere(0.055), skin, 0, 0, 0));
      const up = mesh(capsule(F ? 0.042 : 0.05, 0.22), skin, 0, -0.14, 0); sh.add(up);
      const el = new THREE.Group(); el.position.y = -0.28; sh.add(el);
      put(el, mesh(capsule(F ? 0.036 : 0.043, 0.2), skin, 0, -0.12, 0));
      const hand = new THREE.Group(); hand.position.y = -0.27; el.add(hand);
      put(hand, mesh(sphere(0.042), skin, 0, -0.02, 0)).scale.set(0.8, 1.2, 0.6);
      this.b.arm.push({ sh, el, hand });
    }
    // ----- 다리 -----
    this.b.leg = [];
    for (const sx of [-1, 1]) {
      const th = new THREE.Group(); th.position.set(sx * hipW, -0.02, 0); hips.add(th);
      put(th, mesh(capsule(F ? 0.068 : 0.072, 0.32), skin, 0, -0.2, 0));
      const kn = new THREE.Group(); kn.position.y = -0.42; th.add(kn);
      put(kn, mesh(capsule(0.052, 0.32), skin, 0, -0.2, 0));
      const ft = new THREE.Group(); ft.position.y = -0.43; kn.add(ft);
      put(ft, mesh(box(0.075, 0.05, 0.19), skin, 0, -0.025, 0.04));
      this.b.leg.push({ th, kn, ft });
    }

    // ----- 옷 레이어 -----
    const body = L("body");
    if (body) {
      const cm = cloth("body");
      const st = body.look?.style;
      const t = mesh(capsule(F ? 0.165 : 0.19, 0.13), cm, 0, 0.015, 0); t.scale.set(1, 1, 0.7); chest.add(t);
      const tr = mesh(capsule(F ? 0.062 : 0.074, shoulderW * 1.7), cm, 0, 0.12, -0.005); tr.rotation.z = Math.PI / 2; tr.scale.set(1, 1, 0.82); chest.add(tr);
      const w = mesh(capsule(F ? 0.135 : 0.15, 0.16), cm, 0, 0.1, 0); w.scale.set(1, 1, 0.75); spine.add(w);
      const longSleeve = st !== "rag" && st !== "vest";
      for (const a of this.b.arm) {
        put(a.sh, mesh(sphere(0.064), cm, 0, 0, 0));
        put(a.sh, mesh(capsule(0.06, longSleeve ? 0.22 : 0.08, 10), cm, 0, longSleeve ? -0.14 : -0.06, 0));
        if (longSleeve) put(a.el, mesh(capsule(0.05, 0.18, 10), cm, 0, -0.11, 0));
      }
      if (st === "jacket") { const col = mesh(cyl(0.075, 0.09, 0.06, 14), cm, 0, 0.17, 0.0); chest.add(col); put(chest, mesh(box(0.008, 0.3, 0.01), mat("#bbb", { m: 0.8, r: 0.3 }), 0, -0.02, 0.125, false)); }
      if (st === "fur") { const tor = mesh(geo("furTorus", () => new THREE.TorusGeometry(0.11, 0.045, 8, 18)), mat("#cbb89a", { r: 1, flat: true }), 0, 0.16, 0); tor.rotation.x = Math.PI / 2; chest.add(tor); t.scale.set(1.08, 1.05, 0.78); }
      if (st === "vest") { for (const [px, py] of [[-0.07, 0.04], [0.07, 0.04], [0, -0.06]]) put(chest, mesh(box(0.08, 0.06, 0.03), mat("#2c3426", { r: 0.8 }), px, py, 0.12)); }
      if (st === "hazmat") { put(chest, mesh(box(0.34, 0.03, 0.26), mat("#2d2d2d"), 0, -0.07, 0)); const hood = mesh(sphere(0.135, 16, 10), cm, 0, 0.03, -0.015); hood.scale.set(1, 1.05, 1.05); if (!helm) head.add(hood); }
      if (st === "rag") { for (let i = 0; i < 4; i++) { const tt = mesh(box(0.05, 0.05, 0.01), cm, -0.09 + i * 0.06, -0.08, 0.11); tt.rotation.z = 0.785; spine.add(tt); } }
    }
    const legs = L("legs");
    if (legs) {
      const lm = cloth("legs");
      const p = mesh(capsule(F ? 0.16 : 0.152, 0.07), lm, 0, 0.0, 0); p.scale.set(1.07, 1, 0.8); hips.add(p);
      for (const l of this.b.leg) { put(l.th, mesh(capsule(0.08, 0.32, 10), lm, 0, -0.2, 0)); put(l.kn, mesh(capsule(0.062, 0.3, 10), lm, 0, -0.18, 0)); }
    }
    const feet = L("feet");
    for (const l of this.b.leg) {
      if (feet) { const fm = mat(feet.look?.color || "#333", { r: 0.6 }); put(l.ft, mesh(box(0.09, feet.look ? 0.07 : 0.04, 0.22), fm, 0, -0.02, 0.04)); if (equip.feet.id === "boots") put(l.kn, mesh(cyl(0.064, 0.06, 0.16, 10), fm, 0, -0.36, 0)); }
    }
    const back = L("back");
    if (back) {
      if (back.look?.style === "cape") {
        const cg = geo("cape", () => { const g = new THREE.PlaneGeometry(0.46, 1.0, 4, 8); g.translate(0, -0.5, 0); return g; });
        const c = mesh(cg, new THREE.MeshStandardMaterial({ color: back.look.color, roughness: 0.75, side: THREE.DoubleSide, map: getNoiseTex() }), 0, 0.17, -0.13); c.rotation.x = 0.12; chest.add(c); this.b.cape = c;
        const clasp = mesh(sphere(0.02, 8, 6), mat("#d4af37", { m: 1, r: 0.3 }), 0, 0.16, 0.1); chest.add(clasp);
      } else { const bp = mesh(box(0.26, 0.32, 0.14), mat(back.look?.color || "#5b4a33", { r: 0.85 }), 0, -0.02, -0.17); chest.add(bp); put(chest, mesh(box(0.22, 0.1, 0.04), mat(shade(back.look?.color || "#5b4a33", 0.8)), 0, -0.1, -0.25)); }
    }
    // 손에 든 것
    if (equip?.hand) this.b.arm[1].hand.add(heldItem(equip.hand.id));

    this.root.scale.setScalar(big);
    if (mutant) { chest.scale.set(1.15, 1.05, 1.1); for (const a of this.b.arm) a.sh.scale.set(1.25, 1.15, 1.25); }
    this.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    return this;
  }

  // 애니메이션: moving(0~1), dt, riding, attack
  animate(dt, { moving = 0, speed = 1, riding = false, attack = false } = {}) {
    const b = this.b;
    if (!b) return;
    if (attack) this.swing = 0.35;
    this.phase += dt * (moving ? 8.5 * speed : 1.6);
    const p = this.phase;
    const s = Math.sin(p), c = Math.cos(p);
    const m = moving ? 1 : 0;
    if (riding) {
      for (const [i, l] of b.leg.entries()) { l.th.rotation.x = -1.2; l.th.rotation.z = (i ? -1 : 1) * 0.35; l.kn.rotation.x = 1.3; }
      b.hips.position.y = 0.94 + Math.abs(s) * 0.04 * m;
      for (const a of b.arm) { a.sh.rotation.x = -0.6; a.el.rotation.x = -0.6; }
    } else {
      b.leg[0].th.rotation.x = s * 0.6 * m; b.leg[1].th.rotation.x = -s * 0.6 * m;
      b.leg[0].kn.rotation.x = Math.max(0, -c) * 1.0 * m + 0.02; b.leg[1].kn.rotation.x = Math.max(0, c) * 1.0 * m + 0.02;
      b.leg[0].ft.rotation.x = -Math.max(0, s) * 0.3 * m; b.leg[1].ft.rotation.x = -Math.max(0, -s) * 0.3 * m;
      for (const l of b.leg) l.th.rotation.z = 0;
      b.hips.position.y = 0.94 + (Math.abs(c) * 0.035 - 0.02) * m;
      b.arm[0].sh.rotation.x = -s * 0.5 * m; b.arm[1].sh.rotation.x = s * 0.5 * m;
      b.arm[0].el.rotation.x = -0.25 - Math.max(0, s) * 0.4 * m; b.arm[1].el.rotation.x = -0.25 - Math.max(0, -s) * 0.4 * m;
    }
    b.arm[0].sh.rotation.z = 0.08; b.arm[1].sh.rotation.z = -0.08;
    b.spine.rotation.y = s * 0.08 * m;
    b.chest.scale.y = 1 + Math.sin(p * (moving ? 0.25 : 1)) * 0.012; // 호흡
    b.head.rotation.y = -s * 0.05 * m;
    if (this.swing > 0) {
      this.swing -= dt;
      const k = Math.sin((1 - this.swing / 0.35) * Math.PI);
      b.arm[1].sh.rotation.x = -2.2 * k; b.arm[1].el.rotation.x = -0.4; b.spine.rotation.y = -0.4 * k;
    }
    if (b.cape) b.cape.rotation.x = 0.12 + (m ? 0.35 + Math.sin(p * 2) * 0.08 : Math.sin(p) * 0.03);
  }
}

function heldItem(id) {
  const g = new THREE.Group();
  const wood = mat("#5a3d22", { r: 0.8 }), steel = mat("#b8bcc2", { r: 0.3, m: 0.9 }), dark = mat("#2a2a2a", { r: 0.4, m: 0.6 });
  const it = ITEMS[id];
  if (id === "bow") { const t = mesh(geo("bow", () => new THREE.TorusGeometry(0.32, 0.012, 6, 20, Math.PI * 0.9)), wood, 0, -0.05, 0.06); t.rotation.set(0, Math.PI / 2, Math.PI / 2 + 0.17); g.add(t); }
  else if (it?.ranged) {
    const len = id === "rifle" ? 0.75 : 0.28;
    put(g, mesh(box(0.045, 0.06, len), dark, 0, -0.03, len / 2 - 0.05));
    put(g, mesh(cyl(0.012, 0.012, len * 0.6, 8), dark, 0, 0.005, len * 0.9)).rotation.x = Math.PI / 2;
    put(g, mesh(box(0.035, 0.11, 0.05), wood, 0, -0.09, 0.0));
    if (id === "rifle") put(g, mesh(box(0.05, 0.08, 0.22), wood, 0, -0.04, -0.12));
  } else {
    const handle = id === "spear" ? 1.5 : id === "fishing_rod" ? 1.2 : 0.45;
    const h = mesh(cyl(0.016, 0.018, handle, 8), wood, 0, 0, handle / 2 - 0.12); h.rotation.x = Math.PI / 2; g.add(h);
    const tip = handle - 0.12;
    if (id.includes("axe")) put(g, mesh(box(0.02, 0.14, 0.12), steel, 0, 0.06, tip));
    else if (id.includes("pick")) { const p = mesh(box(0.025, 0.36, 0.04), steel, 0, 0, tip); g.add(p); }
    else if (id.includes("hammer")) put(g, mesh(box(0.07, 0.07, 0.14), steel, 0, 0, tip));
    else if (id === "stone_hoe") put(g, mesh(box(0.02, 0.12, 0.08), steel, 0, -0.06, tip));
    else if (id === "spear") { const c = mesh(cone(0.03, 0.16, 6), steel, 0, 0, tip + 0.08); c.rotation.x = Math.PI / 2; g.add(c); }
    else if (id === "fishing_rod") { /* 낚싯대 */ }
    else { // 칼 종류
      const blade = id === "royal_blade" ? mat("#efe6c4", { r: 0.15, m: 1, e: "#6b5a1e", ei: 0.3 }) : steel;
      const bl = id === "knife" ? 0.2 : 0.55;
      g.clear();
      put(g, mesh(cyl(0.018, 0.018, 0.13, 8), wood, 0, 0, 0)).rotation.x = Math.PI / 2;
      put(g, mesh(box(0.12, 0.02, 0.02), mat("#8a7a3a", { m: 0.8, r: 0.3 }), 0, 0, 0.07));
      put(g, mesh(box(0.012, 0.045, bl), blade, 0, 0, 0.08 + bl / 2));
    }
  }
  g.rotation.x = 0.3; // 팔을 내린 상태에서 앞쪽(살짝 아래)을 향하게 쥔다
  return g;
}

// =====================================================================
// 네발 동물 / 새 / 탈것
// =====================================================================
const ANIMAL_SHAPE = {
  horse: { L: 1.0, H: 0.85, w: 0.22, leg: 0.75, neck: 0.55, headL: 0.42 },
  cow: { L: 1.0, H: 0.65, w: 0.32, leg: 0.6, neck: 0.25, headL: 0.36 },
  boar: { L: 0.75, H: 0.45, w: 0.24, leg: 0.32, neck: 0.12, headL: 0.3 },
  wolf: { L: 0.7, H: 0.5, w: 0.16, leg: 0.48, neck: 0.25, headL: 0.26 },
  dog: { L: 0.55, H: 0.4, w: 0.13, leg: 0.38, neck: 0.2, headL: 0.22 },
  deer: { L: 0.75, H: 0.62, w: 0.15, leg: 0.68, neck: 0.42, headL: 0.26 },
  goat: { L: 0.55, H: 0.45, w: 0.16, leg: 0.42, neck: 0.25, headL: 0.22 },
  rat: { L: 0.32, H: 0.12, w: 0.1, leg: 0.1, neck: 0.05, headL: 0.12 },
};
export class Quadruped {
  constructor(type) {
    this.type = type;
    this.root = new THREE.Group();
    this.phase = Math.random() * 6;
    const S = ANIMAL_SHAPE[type];
    const color = type === "rat" ? "#8bb24a" : ANIMALS[type]?.color || "#777";
    const fur = new THREE.MeshStandardMaterial({ color, roughness: 0.95, map: getNoiseTex() });
    const dark = mat(shade(color, 0.55), { r: 0.9 });
    const body = new THREE.Group(); body.position.y = S.leg + S.H * 0.35; this.root.add(body);
    const torso = mesh(capsule(S.w, S.L, 12), fur, 0, 0, 0); torso.rotation.x = Math.PI / 2; torso.scale.set(1, 1, S.H / S.w / 2.2); body.add(torso);
    const neckG = new THREE.Group(); neckG.position.set(0, S.w * 0.4, S.L / 2 + S.w * 0.4); body.add(neckG);
    const nk = mesh(capsule(S.w * 0.55, S.neck, 10), fur, 0, S.neck / 2, 0); neckG.add(nk); neckG.rotation.x = 0.7;
    const headG = new THREE.Group(); headG.position.set(0, S.neck + S.w * 0.3, 0); neckG.add(headG);
    const hd = mesh(capsule(S.w * 0.5, S.headL, 10), fur, 0, 0, 0); hd.rotation.x = Math.PI / 2 + 0.6; hd.position.z = S.headL * 0.35; headG.add(hd);
    headG.rotation.x = -0.7;
    for (const sx of [-1, 1]) {
      put(headG, mesh(sphere(S.w * 0.12, 8, 6), mat(type === "rat" ? "#cf3" : "#111", { r: 0.2, e: type === "rat" ? "#9f3" : undefined }), sx * S.w * 0.38, S.w * 0.25, S.headL * 0.35, false));
      const ear = mesh(cone(S.w * 0.18, S.w * 0.45, 6), fur, sx * S.w * 0.3, S.w * 0.55, 0); ear.rotation.z = sx * -0.3; headG.add(ear);
    }
    if (type === "horse") { for (let i = 0; i < 6; i++) put(neckG, mesh(box(0.04, 0.12, 0.1), mat("#2b1d12"), 0, i * 0.09 + 0.05, -S.w * 0.45)); }
    if (type === "goat" || type === "cow") for (const sx of [-1, 1]) { const h = mesh(cone(0.03, 0.18, 6), mat("#e8e0c8", { r: 0.5 }), sx * 0.08, S.w * 0.7, 0); h.rotation.z = sx * -0.5; headG.add(h); }
    if (type === "deer") for (const sx of [-1, 1]) { const a = mesh(cyl(0.012, 0.018, 0.35, 5), mat("#5a4024"), sx * 0.08, S.w + 0.15, -0.02); a.rotation.z = sx * -0.5; headG.add(a); const a2 = mesh(cyl(0.01, 0.012, 0.15, 5), mat("#5a4024"), sx * 0.16, S.w + 0.3, 0.04); a2.rotation.x = 0.6; headG.add(a2); }
    if (type === "boar") for (const sx of [-1, 1]) { const t = mesh(cone(0.015, 0.09, 6), mat("#eee", { r: 0.3 }), sx * 0.06, -0.02, S.headL * 0.8); t.rotation.x = -1.2; headG.add(t); }
    if (type === "cow") put(body, mesh(sphere(S.w * 0.6, 10, 8), mat("#3a3a3a"), S.w * 0.5, S.w * 0.4, 0)).scale.set(0.5, 1, 1);
    const tail = mesh(capsule(type === "horse" ? 0.05 : S.w * 0.15, type === "horse" ? 0.5 : S.L * 0.5, 6), type === "horse" ? mat("#2b1d12") : fur, 0, 0, -S.L / 2 - S.w * 0.5); tail.rotation.x = -0.9; body.add(tail);
    this.legs = [];
    for (const [lx, lz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const hip = new THREE.Group(); hip.position.set(lx * S.w * 0.7, -S.H * 0.15, lz * S.L * 0.42); body.add(hip);
      put(hip, mesh(capsule(S.w * 0.28, S.leg * 0.45, 6), fur, 0, -S.leg * 0.25, 0));
      const knee = new THREE.Group(); knee.position.y = -S.leg * 0.5; hip.add(knee);
      put(knee, mesh(capsule(S.w * 0.18, S.leg * 0.45, 6), fur, 0, -S.leg * 0.25, 0));
      put(knee, mesh(cyl(S.w * 0.2, S.w * 0.22, 0.05, 8), dark, 0, -S.leg * 0.5 + 0.0, 0));
      this.legs.push({ hip, knee, front: lz > 0 });
    }
    this.body = body; this.headG = headG; this.tail = tail;
    this.saddleY = body.position.y + S.H * 0.45;
    this.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }
  animate(dt, moving, speed = 1) {
    this.phase += dt * (moving ? 9 * speed : 1.2);
    const p = this.phase, m = moving ? 1 : 0;
    this.legs.forEach((l, i) => {
      const off = (i === 0 || i === 3) ? 0 : Math.PI;
      l.hip.rotation.x = Math.sin(p + off) * 0.55 * m;
      l.knee.rotation.x = (l.front ? -1 : 1) * Math.max(0, Math.sin(p + off + 1)) * 0.6 * m;
    });
    this.body.position.y += 0;
    this.body.rotation.z = Math.sin(p) * 0.02 * m;
    this.headG.rotation.x = -0.7 + Math.sin(p * (m ? 1 : 0.3)) * 0.08;
    this.tail.rotation.z = Math.sin(p * 1.5) * 0.3;
  }
}

export class Bird {
  constructor() {
    this.root = new THREE.Group(); this.phase = Math.random() * 6;
    const w = mat("#e8e2d0", { r: 0.95 });
    const b = mesh(sphere(0.16, 12, 10), w, 0, 0.28, 0); b.scale.set(0.8, 0.85, 1.1); this.root.add(b);
    this.head = new THREE.Group(); this.head.position.set(0, 0.45, 0.12); this.root.add(this.head);
    put(this.head, mesh(sphere(0.08, 10, 8), w));
    put(this.head, mesh(box(0.02, 0.06, 0.05), mat("#d33"), 0, 0.08, 0));
    const beak = mesh(cone(0.025, 0.07, 6), mat("#e9a020"), 0, 0, 0.09); beak.rotation.x = Math.PI / 2; this.head.add(beak);
    this.legs = [];
    for (const sx of [-1, 1]) { const l = mesh(cyl(0.012, 0.012, 0.16, 5), mat("#e9a020"), sx * 0.05, 0.08, 0); this.root.add(l); this.legs.push(l); }
    const tail = mesh(cone(0.08, 0.16, 6), w, 0, 0.36, -0.17); tail.rotation.x = -0.8; this.root.add(tail);
    this.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }
  animate(dt, moving) { this.phase += dt * (moving ? 14 : 2); this.head.position.z = 0.12 + Math.sin(this.phase) * 0.03; this.legs[0].rotation.x = Math.sin(this.phase) * 0.5 * (moving ? 1 : 0); this.legs[1].rotation.x = -this.legs[0].rotation.x; }
}

function makeVehicle(id) {
  const g = new THREE.Group();
  const tire = mat("#141414", { r: 0.9 }), frame = mat(id === "motorbike" ? "#8a1f1f" : "#2f5d7a", { r: 0.35, m: 0.6 }), chrome = mat("#ccc", { r: 0.2, m: 1 });
  for (const z of [-0.5, 0.5]) { const w = mesh(geo("tire" + id, () => new THREE.TorusGeometry(id === "motorbike" ? 0.3 : 0.33, id === "motorbike" ? 0.08 : 0.03, 10, 24)), tire, 0, id === "motorbike" ? 0.38 : 0.36, z); w.rotation.y = Math.PI / 2; g.add(w); }
  if (id === "motorbike") {
    put(g, mesh(box(0.22, 0.25, 0.7), frame, 0, 0.6, 0));
    put(g, mesh(capsule(0.13, 0.25, 10), frame, 0, 0.78, 0.15)).rotation.x = Math.PI / 2;
    put(g, mesh(box(0.25, 0.08, 0.4), mat("#1d1d1d"), 0, 0.82, -0.18));
    put(g, mesh(cyl(0.04, 0.04, 0.6, 8), chrome, 0.15, 0.45, -0.25)).rotation.x = Math.PI / 2;
    put(g, mesh(cyl(0.015, 0.015, 0.55, 6), chrome, 0, 1.0, 0.45)).rotation.z = Math.PI / 2;
  } else {
    for (const [a, b] of [[[0, 0.36, -0.5], [0, 0.75, 0]], [[0, 0.75, 0], [0, 0.36, 0.5]], [[0, 0.75, 0], [0, 0.9, 0.42]], [[0, 0.36, -0.5], [0, 0.85, -0.15]]]) {
      const v1 = new THREE.Vector3(...a), v2 = new THREE.Vector3(...b), len = v1.distanceTo(v2);
      const c = mesh(cyl(0.018, 0.018, len, 6), frame); c.position.copy(v1).lerp(v2, 0.5); c.lookAt(v2); c.rotateX(Math.PI / 2); g.add(c);
    }
    put(g, mesh(box(0.12, 0.04, 0.22), mat("#222"), 0, 0.9, -0.15));
    put(g, mesh(cyl(0.012, 0.012, 0.45, 6), chrome, 0, 0.95, 0.42)).rotation.z = Math.PI / 2;
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.seatY = id === "motorbike" ? 0.0 : -0.04;
  return g;
}

// 탈것 포함 캐릭터 래퍼
// =====================================================================
// 전문 3D 캐릭터(GLB) — assets/characters/hero_M.glb / hero_F.glb 가 있으면 플레이어를 이 모델로 그린다.
// (사실적 이미지 → Meshy 3D 변환 + 휴머노이드 뼈대 + 걷기 애니메이션). 없으면 절차적 휴머노이드로 대체.
// =====================================================================
const HERO = { M: null, F: null };
let SkelUtils = null, heroLoading = null;
export function preloadHeroes(base = "assets/characters/") {
  if (heroLoading) return heroLoading;
  heroLoading = (async () => {
    try {
      const [{ GLTFLoader }, SU] = await Promise.all([import("../vendor/jsm/loaders/GLTFLoader.js"), import("../vendor/jsm/utils/SkeletonUtils.js")]);
      SkelUtils = SU;
      const loader = new GLTFLoader();
      await Promise.all(["M", "F"].map(async (g) => { try { HERO[g] = await loader.loadAsync(`${base}hero_${g}.glb`); } catch { HERO[g] = null; } }));
    } catch { /* 로더 실패 → 절차적 캐릭터 유지 */ }
    return { M: !!HERO.M, F: !!HERO.F };
  })();
  return heroLoading;
}
export const heroAvailable = (g) => !!HERO[g];

class GlbHuman {
  constructor(gender) {
    const gl = HERO[gender];
    this.root = new THREE.Group();
    const model = SkelUtils.clone(gl.scene);
    // 키를 실제 사람 크기(남 1.76m · 여 1.66m)로 맞추고 발을 땅(y=0)에
    // 크기 측정 전에 계층 변환(Armature 스케일 등)을 반영해야 실제 키가 나온다
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model, true);
    const h = box.max.y - box.min.y || 1;
    const k = (gender === "F" ? 1.66 : 1.76) / h;
    model.scale.multiplyScalar(k);
    model.position.y = -box.min.y * k;
    model.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
      if (o.isBone && !this.hand && /right.?hand|hand.?r$|r.?hand/i.test(o.name) && !/index|thumb|middle|ring|pinky/i.test(o.name)) this.hand = o;
    });
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    const clip = gl.animations?.[0];
    if (clip) { this.action = this.mixer.clipAction(clip); this.action.play(); this.action.timeScale = 0; }
    this.heldId = null; this.swing = 0; this.k = k;
  }
  setHeld(id) {
    if (!this.hand || id === this.heldId) return;
    if (this.held) this.hand.remove(this.held);
    this.heldId = id; this.held = null;
    if (id) { this.held = heldItem(id); this.held.scale.setScalar(1 / this.k / (this.hand.getWorldScale(new THREE.Vector3()).x / this.k || 1)); this.hand.add(this.held); }
  }
  animate(dt, { moving = 0, speed = 1, attack = false } = {}) {
    if (attack) this.swing = 0.35;
    if (this.action) {
      const want = moving ? speed : 0;
      this.action.timeScale += (want - this.action.timeScale) * Math.min(1, dt * 10);
      if (!moving && this.action.timeScale < 0.05) {
        // 멈추면 걸음이 가장 모이는 순간(클립 시작)으로 부드럽게 돌아가 선 자세 유지
        this.action.time += (0 - this.action.time) * Math.min(1, dt * 6);
      }
      this.mixer.update(dt);
    }
    if (this.swing > 0) { this.swing -= dt; this.root.rotation.z = Math.sin((1 - this.swing / 0.35) * Math.PI) * 0.06; } else this.root.rotation.z = 0;
  }
}

// 탈것 포함 캐릭터 래퍼. opts.hero: 전문 GLB 모델 사용(플레이어·뷰어)
export class Rider {
  constructor(opts = {}) { this.opts = opts; this.root = new THREE.Group(); this.human = new Humanoid(); this.root.add(this.human.root); this.mountKey = null; this.mountObj = null; this.glb = null; }
  set(look, equip, gender, mount, variant) {
    const useGlb = this.opts.hero && !variant && heroAvailable(gender || "M");
    if (useGlb && (!this.glb || this.glbGender !== gender)) {
      if (this.glb) this.root.remove(this.glb.root);
      this.root.remove(this.human.root);
      this.glb = new GlbHuman(gender || "M"); this.glbGender = gender; this.root.add(this.glb.root);
    }
    if (!useGlb && this.glb) { this.root.remove(this.glb.root); this.glb = null; this.root.add(this.human.root); }
    if (this.glb) this.glb.setHeld(equip?.hand?.id || null);
    else this.human.build(look, equip, gender, variant);
    const body = this.glb ? this.glb.root : this.human.root;
    const key = mount ? (mount.kind || mount.id) : null;
    if (key !== this.mountKey) {
      if (this.mountObj) this.root.remove(this.mountObj.root || this.mountObj);
      this.mountObj = null; this.mountKey = key;
      if (mount?.kind) { this.mountObj = new Quadruped(mount.kind); this.root.add(this.mountObj.root); }
      else if (mount?.id) { const v = makeVehicle(mount.id); this.mountObj = { root: v, animate() {} }; this.root.add(v); }
    }
    if (this.mountObj) {
      if (this.mountObj.saddleY) body.position.y = this.mountObj.saddleY - 0.55;
      else body.position.y = 0.05;
      body.position.z = mount?.kind ? -0.05 : -0.1;
    } else body.position.set(0, 0, 0);
  }
  animate(dt, moving, speed, attack) {
    if (this.glb) this.glb.animate(dt, { moving: this.mountObj ? 0 : moving, speed, attack });
    else this.human.animate(dt, { moving: this.mountObj ? 0 : moving, speed, riding: !!this.mountObj, attack });
    if (this.mountObj?.animate) this.mountObj.animate(dt, moving, speed);
  }
}

// =====================================================================
// 필드 월드
// =====================================================================
export class Field3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(LOW ? 1.5 : 2, devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x9a8f80, 22, 60);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    this.hemi = new THREE.HemisphereLight(0xcfc4b0, 0x3a3026, 0.9);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffe2b8, 2.2);
    this.sun.castShadow = true;
    const sm = LOW ? 1024 : 2048;
    this.sun.shadow.mapSize.set(sm, sm);
    Object.assign(this.sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 80 });
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);
    this.torch = new THREE.PointLight(0xffa860, 0, 9, 1.6); this.scene.add(this.torch);
    this.fire = new THREE.PointLight(0xff8a3a, 0, 14, 1.4); this.scene.add(this.fire);
    this.actors = new Map();
    this.camPos = new THREE.Vector3();
    this.parts = null;
    this.resize();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 55 : 42;
    this.camera.updateProjectionMatrix();
  }

  // ---------- 지형 ----------
  setWorld(world) {
    if (this.world === world) return;
    this.world = world;
    if (this.terrain) { this.scene.remove(this.terrain, this.water, this.nodeGroup, this.poiGroup); }
    const N = WORLD_W;
    const hgt = new Float32Array((N + 1) * (N + 1));
    const BI = BIOMES[world.biome] || BIOMES.temperate;
    const cold = world.biome === "tundra" || world.biome === "taiga";
    const colors = { 0: world.biome === "desert" ? "#a8936a" : cold ? "#7a776e" : "#77705f", 1: BI.grass, 2: "#5d5d61", 3: "#4e5a4a", 4: "#6d8a35", 5: cold ? "#78736c" : "#6a625a", 6: "#7d6a50", 7: "#3f3c39", 8: "#c8b07a", 9: "#e3e7ea" };
    const H = { 0: 0.05, 1: 0.1, 2: 0.02, 3: -0.9, 4: 0.0, 5: 0.9, 6: 0, 7: 0, 8: 0.12, 9: 0.1 };
    const tileT = (x, y) => world.tiles[Math.max(0, Math.min(N - 1, y)) * N + Math.max(0, Math.min(N - 1, x))];
    const g = new THREE.PlaneGeometry(N, N, N, N);
    g.rotateX(-Math.PI / 2);
    g.translate(N / 2, 0, N / 2);
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = Math.round(pos.getX(i)), z = Math.round(pos.getZ(i));
      // 꼭짓점 주변 4타일 평균
      let h = 0, r = 0, gg = 0, b = 0, water = 0;
      for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
        const t = tileT(x + dx, z + dz);
        h += H[t]; if (t === T.WATER) water++;
        c.set(colors[t]); r += c.r; gg += c.g; b += c.b;
      }
      const n = Math.sin(x * 1.7 + z * 0.9) * 0.5 + Math.sin(x * 0.37 - z * 1.3) * 0.5;
      const hh = h / 4 + (water ? 0 : n * 0.08) + (tileT(x, z) === T.ROCK && !water ? Math.abs(n) * 0.9 : 0);
      pos.setY(i, hh);
      hgt[z * (N + 1) + x] = hh;
      const v = 0.92 + n * 0.08;
      col[i * 3] = (r / 4) * v; col[i * 3 + 1] = (gg / 4) * v; col[i * 3 + 2] = (b / 4) * v;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    this.hgt = hgt;
    const tex = getNoiseTex().clone(); tex.needsUpdate = true; tex.repeat.set(N / 3, N / 3);
    this.terrain = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, map: tex }));
    this.terrain.receiveShadow = true;
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(N + 40, N + 40), new THREE.MeshStandardMaterial({ color: 0x2c4a58, roughness: 0.12, metalness: 0.3, transparent: true, opacity: 0.88 }));
    this.water.rotation.x = -Math.PI / 2; this.water.position.set(N / 2, -0.32, N / 2);
    this.scene.add(this.terrain, this.water);
    this.buildNodes(world);
    this.buildPois(world);
    this.baseSig = "";
  }

  heightAt(x, z) {
    const N = WORLD_W;
    if (!this.hgt || x < 0 || z < 0 || x >= N || z >= N) return 0;
    const x0 = Math.floor(x), z0 = Math.floor(z), fx = x - x0, fz = z - z0;
    const h = (a, b) => this.hgt[b * (N + 1) + a];
    return h(x0, z0) * (1 - fx) * (1 - fz) + h(x0 + 1, z0) * fx * (1 - fz) + h(x0, z0 + 1) * (1 - fx) * fz + h(x0 + 1, z0 + 1) * fx * fz;
  }

  // ---------- 자원 노드(인스턴싱) ----------
  buildNodes(world) {
    this.nodeGroup = new THREE.Group(); this.scene.add(this.nodeGroup);
    // 나무 모양은 지역마다: 침엽수(원뿔)·정글(크고 짙음)·아카시아(넓고 납작)·관목(마른 덤불)·왜성목(작음)
    const TS = { broad: [geo("canopy", () => new THREE.IcosahedronGeometry(0.9, 1)), "#5d6e3a", 2.3, 2.2],
      conifer: [geo("conifer", () => new THREE.ConeGeometry(0.8, 2.6, 7)), "#2f4a2e", 2.4, 2.0],
      jungle: [geo("jungle", () => new THREE.IcosahedronGeometry(1.3, 1)), "#2e6a2a", 3.0, 3.0],
      acacia: [geo("acacia", () => { const g = new THREE.IcosahedronGeometry(1.2, 1); g.scale(1.3, 0.35, 1.3); return g; }), "#7a8a3a", 2.4, 2.3],
      scrub: [geo("scrub", () => new THREE.IcosahedronGeometry(0.55, 0)), "#7a6a42", 0.9, 0.8],
      dwarf: [geo("dwarf", () => new THREE.IcosahedronGeometry(0.45, 0)), "#4a5a3a", 0.8, 0.7] };
    const ts = TS[(BIOMES[world.biome] || BIOMES.temperate).tree] || TS.broad;
    const parts = {
      tree: [[cyl(0.07, 0.16, ts[3], 7), mat("#4a3726", { r: 0.95, flat: true }), ts[3] / 2], [ts[0], mat(ts[1], { r: 0.95, flat: true }), ts[2]]],
      rock: [[geo("rock", () => new THREE.DodecahedronGeometry(0.55, 0)), mat("#7d766e", { r: 0.9, flat: true }), 0.25]],
      scrap: [[box(0.7, 0.35, 0.5), mat("#6e4a32", { r: 0.7, m: 0.5, flat: true }), 0.18], [cyl(0.22, 0.22, 0.6, 10), mat("#5a6a6e", { r: 0.5, m: 0.6 }), 0.3]],
      bush: [[geo("bush", () => new THREE.IcosahedronGeometry(0.45, 1)), mat("#4f6e34", { r: 1, flat: true }), 0.3]],
      herb: [[cone(0.12, 0.35, 6), mat("#7fae4a", { r: 0.9 }), 0.17]],
      crate: [[box(0.55, 0.45, 0.55), mat("#8a6a42", { r: 0.85, flat: true }), 0.22]],
      car: [[box(1.0, 0.45, 2.0), mat("#6b3a2a", { r: 0.6, m: 0.5, flat: true }), 0.35], [box(0.9, 0.35, 1.0), mat("#4a4a4a", { r: 0.4, m: 0.4 }), 0.75]],
    };
    this.nodeMeshes = {};
    const dummy = new THREE.Object3D();
    for (const [type, ps] of Object.entries(parts)) {
      const list = world.nodes.filter((n) => n.type === type);
      if (!list.length) continue;
      this.nodeMeshes[type] = { list, meshes: [] };
      for (const [g, m, y] of ps) {
        const im = new THREE.InstancedMesh(g, m, list.length);
        im.castShadow = true; im.receiveShadow = true;
        list.forEach((n, i) => {
          const h = ((n.id * 2654435761) >>> 0) / 4294967296;
          const s = 0.8 + h * 0.5;
          dummy.position.set(n.tx + 0.5, this.heightAt(n.tx + 0.5, n.ty + 0.5) + y * s, n.ty + 0.5);
          dummy.rotation.set(type === "car" ? 0 : (h - 0.5) * 0.2, h * 6.28, 0);
          dummy.scale.setScalar(s);
          dummy.updateMatrix();
          im.setMatrixAt(i, dummy.matrix);
          if (type === "tree") n._m = dummy.matrix.clone();
        });
        this.nodeMeshes[type].meshes.push({ im, base: list.map((n, i) => { const m = new THREE.Matrix4(); im.getMatrixAt(i, m); return m; }) });
        this.nodeGroup.add(im);
      }
    }
    this.hidden = new Set();
  }

  updateNodes(st) {
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const { list, meshes } of Object.values(this.nodeMeshes)) {
      list.forEach((n, i) => {
        const dep = st.world.depleted[n.id] > st.time.min;
        const was = this.hidden.has(n.id);
        if (dep === was) return;
        if (dep) this.hidden.add(n.id); else this.hidden.delete(n.id);
        for (const m of meshes) { m.im.setMatrixAt(i, dep ? zero : m.base[i]); m.im.instanceMatrix.needsUpdate = true; }
      });
    }
  }

  // ---------- 장소(POI) ----------
  buildPois(world) {
    this.poiGroup = new THREE.Group(); this.scene.add(this.poiGroup);
    for (const q of Object.values(world.pois)) {
      const g = new THREE.Group();
      g.position.set(q.tx + 0.5, this.heightAt(q.tx + 0.5, q.ty + 0.5), q.ty + 0.5);
      const steel = mat("#5c5a58", { r: 0.5, m: 0.7 }), stone = mat("#55504b", { r: 0.95, flat: true }), wood = mat("#5a4330", { r: 0.9 });
      if (q.id === "radio_tower") {
        for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) { const l = mesh(cyl(0.05, 0.08, 9, 6), steel, x * 0.6, 4.5, z * 0.6); l.rotation.set(z * 0.08, 0, -x * 0.08); g.add(l); }
        for (let y = 1; y < 9; y += 1.2) { put(g, mesh(box(1.1 - y * 0.06, 0.05, 0.05), steel, 0, y, 0.45 - y * 0.03)); put(g, mesh(box(0.05, 0.05, 1.1 - y * 0.06), steel, 0.45 - y * 0.03, y, 0)); }
        put(g, mesh(sphere(0.15, 8, 6), mat("#ff3b30", { e: "#ff2010", ei: 3 }), 0, 9.1, 0));
        put(g, mesh(box(2, 1.4, 1.6), mat("#6d6a62", { r: 0.9 }), 2.2, 0.7, 0.5));
      } else if (q.id === "iron_city") {
        for (const [x, z, w, h, d] of [[-2, -1, 3, 3.5, 2.5], [2, -1.5, 2.5, 5, 2.5], [0, 2.5, 4, 2.5, 2], [-3, 3, 1.5, 6, 1.5]]) { const b = mesh(box(w, h, d), mat("#5a5a5e", { r: 0.95, flat: true, map: true }), x, h / 2, z); g.add(b); for (let i = 0; i < 3; i++) put(g, mesh(box(0.35, 0.45, 0.02), mat("#1d1f22"), x - w / 3 + i * w / 3, h * 0.6, z + d / 2 + 0.01, false)); }
        for (const x of [1.4, 2.6]) put(g, mesh(cyl(0.3, 0.4, 8, 12), mat("#6a4e3e", { r: 0.8 }), x, 4, -3));
      } else if (q.id === "rad_river") {
        const pool = mesh(cyl(2.4, 2.4, 0.05, 32), mat("#5aff4a", { e: "#3cff20", ei: 0.9, r: 0.2, o: 0.75 }), 0, 0.05, 0, false); g.add(pool);
        put(g, mesh(cyl(0.04, 0.04, 1.6, 6), steel, 2.8, 0.8, 0));
        const sign = mesh(box(0.7, 0.6, 0.04), mat("#e0c020", { r: 0.6 }), 2.8, 1.6, 0); g.add(sign);
        const glow = new THREE.PointLight(0x7aff40, 2.5, 8, 1.5); glow.position.set(0, 1, 0); g.add(glow);
      } else if (q.id === "raider_camp") {
        for (const [x, z] of [[-2, -1], [1.8, -1.5], [0, 2]]) { put(g, mesh(cone(1.2, 1.6, 8), mat("#6b4a3a", { r: 1, flat: true, ds: true }), x, 0.8, z)); }
        for (let i = 0; i < 3; i++) { put(g, mesh(cyl(0.04, 0.04, 2.5, 5), wood, -3 + i * 3, 1.25, 3)); put(g, mesh(box(0.6, 0.4, 0.02), mat("#a0201a", { ds: true }), -2.7 + i * 3, 2.2, 3)); }
        put(g, mesh(cyl(0.35, 0.4, 0.15, 10), stone, 0, 0.08, 0));
        put(g, mesh(cone(0.25, 0.6, 8), mat("#ff7a20", { e: "#ff5a10", ei: 2.5 }), 0, 0.45, 0, false));
        const fl = new THREE.PointLight(0xff7a30, 3, 7, 1.5); fl.position.set(0, 1, 0); g.add(fl);
      } else if (q.id === "ash_fortress") {
        for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; if (i === 3) continue; const w = mesh(box(2.2, 3, 0.8), stone, Math.cos(a) * 4.5, 1.5, Math.sin(a) * 4.5); w.rotation.y = -a + Math.PI / 2; g.add(w); }
        for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; put(g, mesh(cyl(0.9, 1.1, 5, 10), stone, Math.cos(a) * 4.6, 2.5, Math.sin(a) * 4.6)); put(g, mesh(cone(1.2, 1.6, 10), mat("#1f1a1a"), Math.cos(a) * 4.6, 5.8, Math.sin(a) * 4.6)); }
        put(g, mesh(box(3, 6, 3), mat("#3a3634", { flat: true }), 0, 3, 0));
        put(g, mesh(cyl(0.03, 0.03, 3, 5), steel, 0, 7.5, 0)); put(g, mesh(box(1.2, 0.7, 0.02), mat("#111", { ds: true }), 0.6, 8.6, 0));
      } else if (q.id === "trader") {
        put(g, mesh(box(1.4, 0.5, 2), wood, 0, 0.75, 0));
        for (const z of [-0.7, 0.7]) { const w = mesh(cyl(0.45, 0.45, 0.08, 14), wood, 0.75, 0.45, z); w.rotation.z = Math.PI / 2; g.add(w); const w2 = w.clone(); w2.position.x = -0.75; g.add(w2); }
        const can = mesh(cyl(0.9, 0.9, 2.1, 14, 1, true), mat("#c9b48a", { ds: true }), 0, 1.3, 0); can.rotation.x = Math.PI / 2; can.scale.set(0.85, 1, 0.6); g.add(can);
      }
      const lb = labelSprite(q.name, "#ffe2a8", 1.4, "poi." + q.id);
      lb.position.y = q.id === "radio_tower" ? 10 : q.id === "ash_fortress" ? 9.5 : 4;
      g.add(lb);
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.poiGroup.add(g);
    }
  }

  // ---------- 기지(레벨에 따라 커지는 성) ----------
  updateBase(st) {
    const sig = st.base.lv + "|" + st.base.buildings.map((b) => b.id + (b.fueled ? "+" : "")).join(",");
    if (sig === this.baseSig) return;
    this.baseSig = sig;
    if (this.baseGroup) this.scene.remove(this.baseGroup);
    const g = new THREE.Group(); this.baseGroup = g;
    const w = this.world;
    const cx = w.cx + 0.5, cz = w.cy + 0.5;
    const lv = st.base.lv, L = BASE_LEVELS[lv - 1];
    const R = L.wall;
    const wood = mat("#6b5238", { r: 0.92, flat: true }), woodD = mat("#4a3828", { r: 0.95 }), stone = mat(lv >= 7 ? "#a39d93" : "#8a847c", { r: 0.95, flat: true }), roofR = mat(lv >= 7 ? "#7a1f2b" : "#5d4a3a", { r: 0.8, flat: true });
    const ground = mesh(cyl(R + 0.6, R + 0.6, 0.06, 40), mat("#7d6a50", { r: 1 }), cx, 0.02, cz, false); ground.receiveShadow = true; ground.scale.z = 0.8; g.add(ground);
    // 성벽
    const n = Math.round(R * 7);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      if (Math.abs(a - Math.PI / 2) < 0.22) continue; // 남쪽 성문
      const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R * 0.8;
      if (lv <= 1) { if (i % 3 === 0) put(g, mesh(cyl(0.05, 0.06, 0.8, 5), woodD, x, 0.4, z)); }
      else if (lv <= 4) { const h = 0.9 + lv * 0.35; put(g, mesh(cyl(0.1, 0.11, h, 6), wood, x, h / 2, z)); put(g, mesh(cone(0.11, 0.25, 6), woodD, x, h + 0.12, z)); }
      else { const h = 1.6 + lv * 0.25; const seg = mesh(box(0.95, h, 0.5), stone, x, h / 2, z); seg.rotation.y = -a + Math.PI / 2; g.add(seg); if (i % 2) { const m = mesh(box(0.35, 0.3, 0.5), stone, x, h + 0.15, z); m.rotation.y = seg.rotation.y; g.add(m); } }
    }
    if (lv >= 5) for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2, x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R * 0.8, h = 3 + lv * 0.4;
      put(g, mesh(cyl(0.7, 0.8, h, 12), stone, x, h / 2, z));
      put(g, mesh(cone(0.95, 1.4, 12), roofR, x, h + 0.7, z));
      if (lv >= 7) { put(g, mesh(cyl(0.02, 0.02, 1.2, 5), mat("#d4af37", { m: 1, r: 0.3 }), x, h + 1.9, z)); put(g, mesh(box(0.6, 0.35, 0.02), mat("#7a1f2b", { ds: true }), x + 0.3, h + 2.3, z)); }
    }
    // 본관
    const keep = new THREE.Group(); keep.position.set(cx, 0, cz - 1.6 - lv * 0.25); g.add(keep);
    if (lv === 1) { put(keep, mesh(cone(1.1, 1.5, 4), mat("#7a6a50", { r: 1, flat: true, ds: true }), 0, 0.75, 0)).rotation.y = Math.PI / 4; }
    else {
      const W = 1.4 + lv * 0.32, H = 1.1 + lv * 0.42, D = 1.1 + lv * 0.2;
      const wallM = lv <= 2 ? mat("#6b5640", { flat: true, r: 0.95 }) : lv <= 4 ? mat("#7d6448", { flat: true, r: 0.95 }) : stone;
      put(keep, mesh(box(W, H, D), wallM, 0, H / 2, 0));
      const roof = mesh(cone(Math.max(W, D) * 0.78, 1 + lv * 0.25, 4), roofR, 0, H + (1 + lv * 0.25) / 2, 0); roof.rotation.y = Math.PI / 4; roof.scale.z = D / W; keep.add(roof);
      put(keep, mesh(box(0.5, 0.9, 0.05), mat("#2a2018"), 0, 0.45, D / 2 + 0.02));
      for (let i = 0; i < Math.min(lv, 6); i++) put(keep, mesh(box(0.22, 0.28, 0.03), mat("#ffbf6a", { e: "#ff9a3a", ei: 1.2 }), -W / 2 + 0.35 + i * ((W - 0.7) / Math.max(1, Math.min(lv, 6) - 1)), H * 0.62, D / 2 + 0.02, false));
      if (lv >= 6) { put(keep, mesh(cyl(0.03, 0.03, 2, 6), mat("#d4af37", { m: 1 }), 0, H + 2, 0)); put(keep, mesh(box(0.9, 0.5, 0.02), mat("#7a1f2b", { ds: true }), 0.45, H + 2.7, 0)); }
    }
    // 시설
    const lay = baseLayout(st, w);
    this.fireSpot = null;
    for (const o of lay.out) {
      const x = o.x / TILE, z = o.y / TILE;
      const b = buildingModel(o.b, st);
      b.position.set(x, 0, z);
      if (o.b.id === "campfire") this.fireSpot = new THREE.Vector3(x, 0.8, z);
      g.add(b);
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.scene.add(g);
  }

  // ---------- 액터 동기화 ----------
  actor(key, make) { let a = this.actors.get(key); if (!a) { a = make(); a.seen = true; this.actors.set(key, a); this.scene.add(a.root); } a.seen = true; return a; }

  place(obj, px, py, facing, yawOverride) {
    const x = px / TILE, z = py / TILE;
    obj.position.set(x, this.heightAt(x, z), z);
    if (yawOverride !== undefined) obj.rotation.y = yawOverride;
  }

  frame(G, dt) {
    const st = G.st, p = st.player;
    for (const a of this.actors.values()) a.seen = false;
    this.updateBase(st);
    this.nodeT = (this.nodeT || 0) - dt;
    if (this.nodeT <= 0) { this.nodeT = 0.5; this.updateNodes(st); }

    // 플레이어
    const mount = p.mount ? (p.mount.type === "animal" ? { kind: p.mount.kind } : { id: p.mount.id }) : null;
    const me = this.actor("player", () => new Rider({ hero: true }));
    me.set(p.look, p.equip, p.gender, mount);
    G.yaw = lerpAngle(G.yaw ?? 0, G.moveYaw ?? 0, Math.min(1, dt * 12));
    this.place(me.root, p.x, p.y, 0, G.yaw);
    me.animate(dt, G.moving, p.mount ? 1.4 : 1, G.swingStart);
    G.swingStart = false;

    // 동행(발자취)
    let k = 14;
    for (const c of st.companions.filter((c) => c.task === "follow")) {
      const tp = G.trail[Math.min(k, G.trail.length - 1)] || [p.x - 30, p.y]; const prev = G.trail[Math.min(k + 3, G.trail.length - 1)] || tp; k += 14;
      const a = this.actor("c" + c.uid, () => new Rider());
      a.set({ skin: c.skin || "#c9956d", hair: c.gender === "F" ? "long" : "short", hairColor: "#1b1410" }, companionEquip(c), c.gender);
      this.place(a.root, tp[0], tp[1], 0, Math.atan2(tp[0] - prev[0], tp[1] - prev[1]) || a.root.rotation.y);
      a.animate(dt, G.moving, 1);
    }
    for (const an of st.animals.filter((x) => x.task === "follow" && st.player.mount?.uid !== x.uid)) {
      const tp = G.trail[Math.min(k, G.trail.length - 1)] || [p.x + 30, p.y]; const prev = G.trail[Math.min(k + 3, G.trail.length - 1)] || tp; k += 14;
      const a = this.actor("a" + an.uid, () => animalActor(an.type));
      this.place(a.root, tp[0], tp[1], 0, Math.atan2(tp[0] - prev[0], tp[1] - prev[1]) || a.root.rotation.y);
      a.animate(dt, G.moving);
    }
    // 기지 주민
    const bx = (this.world.cx + 0.5) * TILE, by = (this.world.cy + 0.5) * TILE;
    st.companions.filter((c) => c.task === "base").slice(0, 12).forEach((c, i) => {
      const ang = G.t * 0.12 + i * 1.7, r = (1.4 + (i % 3) * 0.7) * TILE;
      const x = bx + Math.cos(ang) * r, y = by + Math.sin(ang) * r * 0.75 + TILE;
      const a = this.actor("r" + c.uid, () => new Rider());
      a.set({ skin: "#c9956d", hair: c.gender === "F" ? "long" : "short", hairColor: "#1b1410" }, companionEquip(c), c.gender, null, c.child && (c.age || 0) < 28 ? "child" : null);
      this.place(a.root, x, y, 0, ang + Math.PI);
      a.animate(dt, true, 0.5);
    });
    // 우리 속 동물
    st.animals.filter((x) => x.task === "pen").slice(0, 8).forEach((an, i) => {
      const ang = -G.t * 0.08 + i * 0.8, r = (BASE_LEVELS[st.base.lv - 1].wall - 1.2) * TILE;
      const x = bx + Math.cos(ang) * r, y = by + Math.sin(ang) * r * 0.8;
      const a = this.actor("p" + an.uid, () => animalActor(an.type));
      this.place(a.root, x, y, 0, ang + Math.PI);
      a.animate(dt, true, 0.4);
    });
    // 몹
    for (const m of G.mobs) {
      if (!m._id) m._id = Math.random().toString(36).slice(2);
      const a = this.actor("m" + m._id, () => mobActor(m));
      this.place(a.root, m.x, m.y, 0, m.moving ? Math.atan2(m.dirx || m.facing, m.diry || 0) : a.root.rotation.y);
      a.animate(dt, m.moving, 1, m.hitFlash);
      m.hitFlash = false;
    }
    // 탄
    this.shotPool = this.shotPool || [];
    G.shots.forEach((s, i) => {
      let o = this.shotPool[i];
      if (!o) { o = mesh(sphere(0.06, 8, 6), mat("#ffd36b", { e: "#ffb020", ei: 3 }), 0, 0, 0, false); this.shotPool[i] = o; this.scene.add(o); }
      o.visible = true; o.material = s.foe ? mat("#ff6b5b", { e: "#ff3020", ei: 3 }) : mat("#ffd36b", { e: "#ffb020", ei: 3 });
      o.position.set(s.x / TILE, this.heightAt(s.x / TILE, s.y / TILE) + 1.1, s.y / TILE + 0.5);
    });
    for (let i = G.shots.length; i < this.shotPool.length; i++) this.shotPool[i].visible = false;
    // 사라진 액터 정리
    for (const [key, a] of this.actors) if (!a.seen) { this.scene.remove(a.root); this.actors.delete(key); }

    // ---------- 카메라 ----------
    const px = p.x / TILE, pz = p.y / TILE, py = this.heightAt(px, pz);
    const portrait = innerWidth < innerHeight;
    const want = new THREE.Vector3(px, py + (portrait ? 17 : 14.5), pz + (portrait ? 9.5 : 8.5));
    if (!this.camInit) { this.camPos.copy(want); this.camInit = true; }
    this.camPos.lerp(want, Math.min(1, dt * 5));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(px, py + 0.9, pz + 0.3);

    // ---------- 시간대 조명 ----------
    const hour = (st.time.min % 1440) / 60;
    const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const dayK = sm(4.5, 7.5, hour) * (1 - sm(18, 20.5, hour)); // 새벽·노을 전환이 있는 낮 곡선
    const wid = st.weather?.id || "clear", W = WEATHER[wid] || WEATHER.clear;
    const winter = G.seasonId === "winter" || wid === "snow" || wid === "blizzard";
    const sunCol = new THREE.Color().setHSL(0.08, 0.6, 0.55 + dayK * 0.25);
    this.sun.color.copy(sunCol);
    this.sun.intensity = 0.2 + dayK * 2.6;
    const warm = 1 - Math.min(1, Math.abs(hour - 13) / 6); // 아침·저녁엔 붉은 빛
    this.sun.color.setHSL(0.07 + warm * 0.04, 0.75 - warm * 0.35, 0.6 + warm * 0.15);
    const ang = ((hour - 6) / 14) * Math.PI;
    this.sun.position.set(px + Math.cos(ang) * 20, py + 6 + Math.max(0.2, Math.sin(ang)) * 22, pz + 12);
    this.sun.target.position.set(px, py, pz);
    this.hemi.intensity = 0.3 + dayK * 0.9;
    const skyByWeather = { storm: 0x5e646a, rain: 0x7e8488, sandstorm: 0xb8925a, ashfall: 0x7a7570, radstorm: 0x7a8a50, fog: 0xa8aaa8, heatwave: 0xd2b48a, blizzard: 0xd8dde2 };
    const fogDay = new THREE.Color(skyByWeather[wid] ?? (winter ? 0xb8bcc4 : this.world.biome === "desert" ? 0xc8b08a : this.world.biome === "rainforest" ? 0x8a9a80 : 0xa49482));
    const fogNight = new THREE.Color(0x10131c);
    const fogC = fogNight.clone().lerp(fogDay, dayK);
    if (G.inRad) fogC.lerp(new THREE.Color(0x6a8a3a), 0.35);
    this.scene.fog.color.copy(fogC);
    const fogK = 1 - (W.fog || 0) * 0.65; // 날씨 시야
    this.scene.fog.near = (18 + dayK * 8) * fogK; this.scene.fog.far = (38 + dayK * 26) * fogK + 6;
    this.sun.intensity *= wid === "storm" || wid === "blizzard" ? 0.45 : wid === "rain" || wid === "snow" || wid === "fog" ? 0.7 : 1;
    this.scene.background = fogC;
    this.torch.position.set(px, py + 1.8, pz + 0.5);
    this.torch.intensity = (1 - dayK) * 6;
    if (this.fireSpot) { this.fire.position.copy(this.fireSpot); this.fire.intensity = (0.6 + (1 - dayK) * 6) * (0.85 + Math.sin(G.t * 13) * 0.1 + Math.sin(G.t * 7.3) * 0.05); } else this.fire.intensity = 0;

    // ---------- 날씨 입자 ----------
    const kind = wid === "rain" || wid === "storm" ? "rain" : wid === "snow" ? "snow" : wid === "blizzard" ? "blizzard" : wid === "sandstorm" ? "sand" : wid === "radstorm" || G.inRad ? "rad" : wid === "ashfall" ? "ashfall" : "ash";
    this.weather(dt, px, py, pz, kind);
    this.renderer.render(this.scene, this.camera);
  }

  weather(dt, px, py, pz, kind) {
    const N = LOW ? 300 : 700;
    if (!this.parts) {
      const g = new THREE.BufferGeometry();
      const arr = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) { arr[i * 3] = (Math.random() - 0.5) * 40; arr[i * 3 + 1] = Math.random() * 14; arr[i * 3 + 2] = (Math.random() - 0.5) * 34; }
      g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
      this.parts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.08, transparent: true, opacity: 0.8, depthWrite: false }));
      this.scene.add(this.parts);
    }
    const m = this.parts.material;
    const look = { snow: [0xf2f4ff, 0.12, 1.6, 0.2], blizzard: [0xffffff, 0.14, 3.5, 9], rain: [0x9fb8c8, 0.07, 14, 0.8], sand: [0xc8a86a, 0.09, 0.4, 11], rad: [0xaaff5a, 0.07, 0.5, 0.4], ashfall: [0x8a857c, 0.1, 0.9, 0.6], ash: [0xc8c0b4, 0.05, 0.5, 0.4] }[kind];
    m.color.set(look[0]); m.size = look[1];
    m.opacity = kind === "ash" ? 0.45 : 0.85;
    const a = this.parts.geometry.attributes.position.array;
    const fall = look[2], wind = look[3];
    for (let i = 0; i < a.length; i += 3) {
      a[i + 1] -= fall * dt * (0.6 + (i % 7) / 7);
      a[i] += Math.sin(this.camPos.x + i) * dt * 0.3 + wind * dt;
      if (a[i + 1] < 0) { a[i + 1] = 14; a[i] = (Math.random() - 0.5) * 40; a[i + 2] = (Math.random() - 0.5) * 34; }
    }
    this.parts.geometry.attributes.position.needsUpdate = true;
    this.parts.position.set(px, py, pz);
  }

  // 3D → 화면 좌표(오버레이 텍스트용)
  project(px, py, h = 2) {
    const v = new THREE.Vector3(px / TILE, this.heightAt(px / TILE, py / TILE) + h, py / TILE).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, vis: v.z < 1 };
  }
}

function lerpAngle(a, b, t) { let d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI; return a + d * t; }

export function companionEquip(c) {
  const role = c.role;
  const e = { body: { id: role === "soldier" ? "combat_vest" : role === "doctor" ? "rag_shirt" : role === "cook" ? "rag_shirt" : "leather_jacket" }, legs: { id: role === "soldier" ? "leather_pants" : "rag_pants" }, feet: { id: "boots" } };
  if (role === "soldier") { e.head = { id: "helmet" }; e.hand = { id: "rifle" }; }
  if (role === "hunter") e.hand = { id: "bow" };
  if (role === "engineer") e.hand = { id: "stone_hammer" };
  if (role === "farmer") e.hand = { id: "stone_hoe" };
  if (c.spouse) e.back = null;
  return e;
}

function animalActor(type) {
  if (type === "chicken") { const b = new Bird(); return { root: b.root, animate: (dt, m) => b.animate(dt, m) }; }
  const q = new Quadruped(type); return { root: q.root, animate: (dt, m, s) => q.animate(dt, m, s) };
}

function mobActor(m) {
  if (m.kind === "animal") return animalActor(m.type);
  if (m.type === "feral_dog") return animalActor("dog");
  if (m.type === "rad_rat") { const q = new Quadruped("rat"); return { root: q.root, animate: (dt, mv) => q.animate(dt, mv, 1.6) }; }
  const r = new Rider();
  if (m.type === "raider") r.set({ skin: "#b98c6a", hair: "mohawk", hairColor: "#111" }, { body: { id: "leather_jacket" }, legs: { id: "rag_pants" }, feet: { id: "boots" }, head: { id: "gas_mask" }, hand: { id: "pipe_pistol" } }, "M");
  else if (m.type === "ash_knight") r.set({ skin: "#8d6e5a", hair: "short", hairColor: "#111" }, { body: { id: "combat_vest" }, legs: { id: "leather_pants" }, feet: { id: "boots" }, head: { id: "helmet" }, hand: { id: "machete" }, back: { id: "royal_robe" } }, "M", null, "knight");
  else r.set({ skin: "#6b8f5e" }, { legs: { id: "rag_pants" } }, "M", null, "mutant");
  return { root: r.root, animate: (dt, mv, s, atk) => r.animate(dt, mv, 0.8, atk) };
}

function buildingModel(b, st) {
  const g = new THREE.Group();
  const def = BUILDINGS[b.id];
  const wood = mat("#7a5c3a", { r: 0.9, flat: true }), dark = mat("#3d3027", { r: 0.95 }), stone = mat("#86807a", { r: 0.95, flat: true }), metal = mat("#6a6e72", { r: 0.4, m: 0.7 });
  switch (b.id) {
    case "campfire":
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; put(g, mesh(sphere(0.12, 6, 5), stone, Math.cos(a) * 0.35, 0.06, Math.sin(a) * 0.35)); }
      for (let i = 0; i < 3; i++) { const l = mesh(cyl(0.04, 0.05, 0.6, 6), dark, 0, 0.15, 0); l.rotation.set(0.9, (i / 3) * Math.PI * 2, 0); g.add(l); }
      put(g, mesh(cone(0.18, 0.5, 8), mat("#ff8a2a", { e: "#ff6a10", ei: 3 }), 0, 0.35, 0, false));
      put(g, mesh(cone(0.09, 0.32, 8), mat("#ffe08a", { e: "#ffd040", ei: 4 }), 0, 0.3, 0, false));
      break;
    case "crate": put(g, mesh(box(0.7, 0.55, 0.55), wood, 0, 0.28, 0)); put(g, mesh(box(0.72, 0.06, 0.57), dark, 0, 0.5, 0)); break;
    case "cellar": put(g, mesh(box(1.1, 0.25, 1.1), stone, 0, 0.12, 0)); put(g, mesh(box(0.7, 0.05, 0.7), dark, 0, 0.27, 0)); break;
    case "bed": put(g, mesh(box(0.8, 0.3, 1.5), wood, 0, 0.15, 0)); put(g, mesh(box(0.75, 0.12, 1.4), mat("#c9c0b0", { r: 1 }), 0, 0.36, 0)); put(g, mesh(box(0.5, 0.1, 0.3), mat("#e8e0d0"), 0, 0.45, -0.5)); break;
    case "farm": { put(g, mesh(box(1.6, 0.08, 1.2), mat("#4a3628", { r: 1 }), 0, 0.04, 0)); for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) put(g, mesh(cone(0.06, 0.25, 5), mat("#6aa040"), -0.6 + j * 0.3, 0.2, -0.45 + i * 0.3)); break; }
    case "pen": case "stable": for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; put(g, mesh(cyl(0.035, 0.035, 0.7, 5), wood, Math.cos(a) * 0.9, 0.35, Math.sin(a) * 0.9)); } put(g, mesh(geo("fenceRing", () => new THREE.TorusGeometry(0.9, 0.025, 4, 28)), wood, 0, 0.55, 0)).rotation.x = Math.PI / 2; break;
    case "watchtower": for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) put(g, mesh(cyl(0.05, 0.06, 2.6, 5), wood, x, 1.3, z)); put(g, mesh(box(1, 0.1, 1), wood, 0, 2.6, 0)); put(g, mesh(cone(0.8, 0.6, 4), dark, 0, 3.2, 0)).rotation.y = Math.PI / 4; break;
    case "turret": put(g, mesh(cyl(0.35, 0.45, 0.6, 10), metal, 0, 0.3, 0)); put(g, mesh(sphere(0.3, 12, 8), metal, 0, 0.75, 0)); put(g, mesh(cyl(0.05, 0.05, 0.8, 8), mat("#222", { m: 0.8, r: 0.3 }), 0, 0.8, 0.4)).rotation.x = Math.PI / 2; break;
    case "generator": put(g, mesh(box(0.9, 0.7, 0.6), metal, 0, 0.35, 0)); put(g, mesh(cyl(0.06, 0.06, 0.6, 8), mat("#333"), 0.3, 0.9, 0)); put(g, mesh(sphere(0.06, 8, 6), mat(b.fueled ? "#5f5" : "#f44", { e: b.fueled ? "#3f3" : "#f22", ei: 3 }), -0.3, 0.75, 0.31, false)); break;
    case "fridge": put(g, mesh(box(0.6, 1.3, 0.6), mat("#d8d8d0", { r: 0.3, m: 0.2 }), 0, 0.65, 0)); break;
    case "rain_collector": case "purifier": put(g, mesh(cyl(0.4, 0.4, 0.9, 14), b.id === "purifier" ? metal : mat("#3a5a6a", { r: 0.5 }), 0, 0.45, 0)); put(g, mesh(cone(0.6, 0.3, 14, 1), mat("#5a5a5a", { ds: true }), 0, 1.05, 0)).rotation.x = Math.PI; break;
    case "arena": put(g, mesh(cyl(1.6, 1.8, 0.8, 24, 1, true), stone, 0, 0.4, 0)); put(g, mesh(cyl(1.5, 1.5, 0.05, 24), mat("#c9a76a"), 0, 0.03, 0)); break;
    case "throne": put(g, mesh(box(1.4, 1.6, 1.2), stone, 0, 0.8, 0)); put(g, mesh(cone(1.1, 0.9, 4), mat("#7a1f2b"), 0, 2.05, 0)).rotation.y = Math.PI / 4; break;
    default: {
      const W = 1.1, H = 0.8;
      const wall = ["forge", "barracks", "wall_gate", "lab", "clinic"].includes(b.id) ? stone : wood;
      put(g, mesh(box(W, H, 0.9), wall, 0, H / 2, 0));
      const roofC = { forge: "#4a3a32", kitchen: "#7a4a2a", clinic: "#e8e2d8", lab: "#4a5a6a", house: "#6a3a2a", barracks: "#4f5a3c", smokehouse: "#3a3027", workbench: "#5a4a3a", garage: "#4a4a4a", wall_gate: "#555" }[b.id] || "#5a4a3a";
      const roof = mesh(cone(0.85, 0.55, 4), mat(roofC, { r: 0.85, flat: true }), 0, H + 0.27, 0); roof.rotation.y = Math.PI / 4; roof.scale.z = 0.8; g.add(roof);
      put(g, mesh(box(0.25, 0.45, 0.03), dark, 0, 0.23, 0.46));
      if (b.id === "forge" || b.id === "smokehouse" || b.id === "kitchen") put(g, mesh(cyl(0.08, 0.1, 0.6, 8), stone, 0.3, H + 0.4, 0));
      if (b.id === "clinic") { put(g, mesh(box(0.3, 0.08, 0.02), mat("#d22"), 0, H * 0.7, 0.46, false)); put(g, mesh(box(0.08, 0.3, 0.02), mat("#d22"), 0, H * 0.7, 0.46, false)); }
      if (b.id === "workbench") { g.clear(); put(g, mesh(box(1, 0.08, 0.6), wood, 0, 0.75, 0)); for (const [x, z] of [[-0.42, -0.24], [0.42, -0.24], [-0.42, 0.24], [0.42, 0.24]]) put(g, mesh(box(0.07, 0.75, 0.07), dark, x, 0.37, z)); put(g, mesh(box(0.25, 0.1, 0.12), metal, 0.2, 0.84, 0)); }
    }
  }
  const icon = labelSprite("", "#fff", 0.9, "b." + b.id);
  icon.position.y = b.id === "watchtower" ? 3.9 : 2.0;
  g.add(icon);
  return g;
}

// =====================================================================
// 캐릭터 뷰어 (자세히 보기 / 캐릭터 생성 / 가방) + 시네마틱
// =====================================================================
const viewers = new Set();
export function mountViewer(canvas, getState, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: !opts.cinematic, preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(opts.cinematic ? 35 : 30, 1, 0.05, 200);
  // 3점 조명 + 림 라이트(스튜디오 촬영 느낌)
  const key = new THREE.DirectionalLight(opts.cinematic ? 0xffc890 : 0xfff0dc, opts.cinematic ? 2.6 : 2.4); key.position.set(2.5, 4, 3); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3 });
  const fill = new THREE.DirectionalLight(0x9fb4ff, 0.6); fill.position.set(-3, 2, 2);
  const rim = new THREE.DirectionalLight(opts.cinematic ? 0xff9a50 : 0xffd2a0, 2.4); rim.position.set(-1.5, 2.5, -3.5);
  scene.add(key, fill, rim, new THREE.HemisphereLight(0xcfc4b0, 0x2a2018, 0.55));
  const floor = new THREE.Mesh(new THREE.CircleGeometry(opts.cinematic ? 60 : 1.6, 48), new THREE.MeshStandardMaterial({ color: opts.cinematic ? 0x2a211b : 0x3a3029, roughness: 0.95, map: getNoiseTex() }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const extras = [];
  if (opts.cinematic) {
    const pal = opts.palette || ["#1c1a24", "#5a3b2e", "#c7743b"];
    scene.background = new THREE.Color(pal[1]);
    scene.fog = new THREE.Fog(new THREE.Color(pal[2]).lerp(new THREE.Color(pal[1]), 0.5), 8, 45);
    // 무너진 도시 실루엣
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 1.2 + Math.PI * 0.9, d = 24 + (i * 37) % 22;
      const h = 3 + ((i * 53) % 12), w = 1.5 + ((i * 17) % 4);
      const b = mesh(box(w, h, w), mat(i % 3 ? "#2a2326" : "#332a2a", { r: 1, flat: true }), Math.cos(a) * d, h / 2 - 0.5, Math.sin(a) * d);
      b.rotation.set(((i % 5) - 2) * 0.04, i, ((i % 3) - 1) * 0.05); scene.add(b);
    }
    const sun = mesh(sphere(3, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(pal[2]).multiplyScalar(1.6), fog: false }), -6, 5, -40, false); scene.add(sun);
    const embers = new THREE.BufferGeometry(); const ea = new Float32Array(300 * 3);
    for (let i = 0; i < 300; i++) { ea[i * 3] = (Math.random() - 0.5) * 12; ea[i * 3 + 1] = Math.random() * 6; ea[i * 3 + 2] = (Math.random() - 0.5) * 8; }
    embers.setAttribute("position", new THREE.BufferAttribute(ea, 3));
    const ep = new THREE.Points(embers, new THREE.PointsMaterial({ color: 0xff9a50, size: 0.05, transparent: true, opacity: 0.85, depthWrite: false })); scene.add(ep); extras.push(ep);
  }
  const hero = new Rider({ hero: true }); scene.add(hero.root);
  const others = [];
  let yaw = opts.cinematic ? 0.35 : 0.5, drag = null, t = 0, run = true, last = performance.now();
  if (!opts.cinematic) {
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", (e) => { drag = e.clientX; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener("pointermove", (e) => { if (drag !== null) { yaw += (e.clientX - drag) * 0.012; drag = e.clientX; } });
    canvas.addEventListener("pointerup", () => (drag = null));
  }
  const v = { dispose() { run = false; viewers.delete(v); renderer.dispose(); renderer.forceContextLoss?.(); } };
  viewers.add(v);
  const loop = (now) => {
    if (!run) return;
    if (!canvas.isConnected) { v.dispose(); return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    const s = getState();
    hero.set(s.look, s.equip, s.gender, s.mount, s.variant);
    hero.animate(dt, opts.walk ? 1 : 0, 1, false);
    if (opts.cinematic) {
      (s.companions || []).slice(0, 2).forEach((c, i) => {
        if (!others[i]) { others[i] = new Rider(); scene.add(others[i].root); }
        others[i].set(c.look, c.equip, c.gender);
        others[i].root.position.set(i ? 1.1 : -1.1, 0, -0.6); others[i].root.rotation.y = i ? -0.35 : 0.35;
        others[i].animate(dt, 0, 1);
      });
      for (const e of extras) { const a = e.geometry.attributes.position.array; for (let i = 1; i < a.length; i += 3) { a[i] += dt * 0.4; if (a[i] > 6) a[i] = 0; } e.geometry.attributes.position.needsUpdate = true; }
    }
    hero.root.rotation.y = opts.cinematic ? 0 : yaw + (drag === null && opts.spin ? t * 0.35 : 0);
    const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) { renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
    const tall = s.mount ? 2.4 : 1.85;
    if (opts.cinematic) {
      const dolly = Math.min(1, t / 6);
      cam.position.set(Math.sin(0.4 - dolly * 0.5) * (4.8 - dolly * 1.2), 1.2 + dolly * 0.3, Math.cos(0.4 - dolly * 0.5) * (4.8 - dolly * 1.2));
      cam.lookAt(0, 1.05, 0);
    } else {
      const dist = (tall * (hero.glb ? 0.78 : 1.15)) / Math.tan((cam.fov * Math.PI) / 360) / Math.min(1, cam.aspect * 1.3);
      cam.position.set(0, tall * 0.55, dist * 0.55 + 0.4);
      cam.lookAt(0, tall * 0.5, 0);
    }
    renderer.render(scene, cam);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return v;
}

// 전문 모델로 교체할 때 쓰는 훅(GLB: 본 이름 Hips/Spine/Head/LeftArm… Mixamo 규격)
export async function loadCustomModel(url) {
  const { GLTFLoader } = await import("../vendor/jsm/loaders/GLTFLoader.js");
  return new Promise((res, rej) => new GLTFLoader().load(url, (g) => res(g), undefined, rej));
}
