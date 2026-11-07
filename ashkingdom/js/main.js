// 메인 — 타이틀/캐릭터 생성/게임 루프/입력/필드 엔티티.
import * as S from "./systems.js";
import * as UI from "./ui.js";
import * as MG from "./minigames.js";
import { JOBS, DIFFICULTY, ANIMALS, ENEMIES, CHAPTERS, ITEMS, TIME, BUILDINGS, DUNGEONS } from "./data.js";
import { Field3D, webglAvailable, mountViewer } from "./r3d.js";
import { randomSpawn } from "./earth.js";
import * as Net from "./net.js";
import { BIOMES } from "./data.js";
import { generateWorld, TILE, WORLD_W, WORLD_H, tileAt, isBlocked, nearWater, T, NODE_TYPES } from "./world.js";
import * as R from "./render.js";
import { loadAccount, saveAccount, loadGame, saveGame, deleteGame } from "./storage.js";
import { passActive, claimPassDaily, watchAd as accWatchAd, adsLeft } from "./shop.js";
import { makeRng } from "./rng.js";
import * as Ic from "./icons.js";

const G = {
  st: null, acc: loadAccount(), world: null, paused: 0,
  cam: { x: 0, y: 0 }, mobs: [], shots: [], fx: [], trail: [],
  input: { x: 0, y: 0, action: false }, atBase: false, nearFire: false,
  facing: 1, phase: 0, moving: false, lastSave: 0, encounterT: 120, spawnT: 0, attackCd: 0, t: 0,
};
window.__G = G; // 디버그용
UI.bindUI(G);

const cv = document.getElementById("game");
const ctx = cv.getContext("2d");
let VW = 0, VH = 0;
function resize() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  VW = innerWidth; VH = innerHeight;
  cv.width = VW * dpr; cv.height = VH * dpr;
  cv.style.width = VW + "px"; cv.style.height = VH + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  G.particles = R.makeParticles(70, VW, VH);
}
addEventListener("resize", () => { resize(); G.r3d?.resize(); });
resize();
// 3D 렌더러(WebGL 불가 기기는 기존 2D로 자동 대체)
if (webglAvailable() && !/[?&]2d\b/.test(location.search)) {
  try { G.r3d = new Field3D(document.getElementById("gl")); document.body.classList.add("three"); UI.setViewer(mountViewer); }
  catch (e) { console.warn("3D 초기화 실패 → 2D", e); G.r3d = null; }
}

// ================= 타이틀 / 캐릭터 생성 =================
function title() {
  const has = loadGame();
  const el = document.getElementById("title");
  el.hidden = false;
  document.getElementById("hud").hidden = true;
  document.getElementById("controls").hidden = true;
  el.innerHTML = `<div class="t-wrap"><h1>잿빛 왕국</h1><h3>ASHEN KINGDOM · 마지막 생존자</h3>
    <p class="muted">핵전쟁 이후, 당신은 살아남았다. 사람들을 모아 새로운 나라를 세워라.</p>
    <div class="choices">${has && !has.ended ? `<button class="btn primary" id="cont">이어하기 <small>${esc(has.player.name)} · ${JOBS[has.player.job].name} · ${S.day(has)}일차</small></button>` : ""}
    <button class="btn ${has && !has.ended ? "" : "primary"}" id="newg">새 생애 시작</button></div>
    <p class="muted small">💎${G.acc.gems} · 생애 ${G.acc.runs}회 · 엔딩 ${G.acc.endings.length}/16</p></div>`;
  el.querySelector("#cont")?.addEventListener("click", () => { el.hidden = true; startGame(has); });
  el.querySelector("#newg").onclick = () => (has && !has.ended ? confirmNew() : create());
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function confirmNew() {
  if (confirm("진행 중인 세계를 포기하고 새로 시작할까요? (혈통 경험치는 보존)")) {
    const old = loadGame();
    if (old) { S.bankLegacy(old, G.acc); saveAccount(G.acc); }
    deleteGame(); create();
  }
}

function create() {
  const el = document.getElementById("title");
  el.hidden = false;
  const sel = { gender: "M", job: "soldier", difficulty: "normal", name: "" };
  const draw = () => {
    el.innerHTML = `<div class="t-wrap create"><h2>새로운 생존자</h2>
      <div class="create-top"><canvas id="pv" width="160" height="200"></canvas>
        <div><input id="nm" maxlength="10" placeholder="이름 (최대 10자)" value="${esc(sel.name)}">
        <div class="seg">${[["M", "남자"], ["F", "여자"]].map(([g, n]) => `<button class="btn ${sel.gender === g ? "on" : ""}" data-g="${g}">${n}</button>`).join("")}</div>
        <small class="muted">성별은 외형만 다르며 능력치는 같습니다.</small></div></div>
      <h3>직업</h3><div class="jobs">${Object.entries(JOBS).map(([id, j]) => { const l = S.legacyOf(G.acc, id); return `<button class="job ${sel.job === id ? "on" : ""}" data-j="${id}"><span class="ic">${Ic.icon("job." + id, 40, j.icon)}</span><b>${j.name}</b>${l.level ? `<span class="badge">혈통 ${l.level}</span>` : ""}<small>${j.desc}</small></button>`; }).join("")}</div>
      <h3>난이도</h3><div class="diffs">${Object.values(DIFFICULTY).map((d) => `<button class="job ${sel.difficulty === d.id ? "on" : ""}" data-d="${d.id}"><b>${d.name}</b><small>${d.desc}</small></button>`).join("")}</div>
      <button class="btn primary big" id="go">대피소 문을 연다</button></div>`;
    const look = { skin: "#d9a982", hair: sel.gender === "F" ? "long" : "short", hairColor: "#2b211b" };
    const startEq = { body: { id: "rag_shirt" }, legs: { id: "rag_pants" }, hand: { id: JOBS[sel.job].start.find(([i]) => ITEMS[i].slot === "hand")?.[0] || "knife" } };
    if (G.r3d) mountViewer(el.querySelector("#pv"), () => ({ look, equip: startEq, gender: sel.gender }), { spin: true });
    else {
      const pv = el.querySelector("#pv").getContext("2d");
      let t = 0;
      const loopPv = () => { if (!el.querySelector("#pv")) return; t += 0.05; pv.clearRect(0, 0, 160, 200); R.drawCharacter(pv, 80, 185, look, { body: null, legs: null }, 1, t, { scale: 4, detail: true, gender: sel.gender }); requestAnimationFrame(loopPv); };
      loopPv();
    }
    el.querySelector("#nm").oninput = (e) => (sel.name = e.target.value);
    el.querySelectorAll("[data-g]").forEach((b) => (b.onclick = () => { sel.gender = b.dataset.g; draw(); }));
    el.querySelectorAll("[data-j]").forEach((b) => (b.onclick = () => { sel.job = b.dataset.j; draw(); }));
    el.querySelectorAll("[data-d]").forEach((b) => (b.onclick = () => { sel.difficulty = b.dataset.d; draw(); }));
    el.querySelector("#go").onclick = async () => {
      // 지구 어딘가에 떨어진다 — 어디일지는 아무도 모른다(서버가 있으면 빈 구역을 예약)
      const sp = await Net.claimSpawn(() => randomSpawn(Math.floor(Math.random() * 2 ** 31)));
      const st = S.newGame({ ...sel, name: sel.name.trim().slice(0, 10), account: G.acc, look, seed: sp.seed, geo: sp });
      el.hidden = true;
      await startGame(st, true);
    };
  };
  draw();
}

// ================= 게임 시작 =================
async function startGame(st, isNew = false) {
  G.st = st;
  G.world = generateWorld(st.seed, st.geo?.biome || "temperate");
  R.clearTerrainCache();
  G.r3d?.setWorld(G.world);
  G.mobs = []; G.shots = []; G.fx = []; G.trail = [];
  G.paused = 0;
  st.passActive = passActive(G.acc);
  if (st.player.x == null || !st.player.x) respawnAtBase();
  document.getElementById("hud").hidden = false;
  document.getElementById("controls").hidden = false;
  if (!isNew && st.lastSaved) {
    const off = S.applyOffline(st, Date.now() - st.lastSaved);
    if (off && off.gameDays > 0) UI.toast(`쉬는 동안 ${off.gameDays}일이 지났습니다. 기지는 계속 돌아갔습니다.`, "good");
  }
  const g = claimPassDaily(G.acc);
  if (g) UI.toast(`월정액 보상 💎${g}`, "good");
  if (st.__tampered) UI.toast("저장 데이터 변조가 감지되어 온라인 경쟁 기능이 제한됩니다", "bad");
  UI.renderHud();
  if (isNew) {
    await UI.cinematic(CHAPTERS[0].title, CHAPTERS[0].text, { palette: ["#0e0e14", "#3a2e2e", "#d0753a"] });
    await UI.spawnReveal();
    UI.toast("💡 나무·돌·섬유를 모아 [제작]에서 돌도끼를 만드세요", "info");
  }
  G.save();
  if (!G.running) { G.running = true; requestAnimationFrame(frame); }
}

function respawnAtBase() {
  G.st.player.x = (G.world.cx + 0.5) * TILE;
  G.st.player.y = (G.world.cy + 2.5) * TILE;
}
G.respawnAtBase = respawnAtBase;

G.newLife = () => {
  deleteGame();
  document.querySelectorAll(".modal-bg,.cine,.mg").forEach((e) => e.remove());
  G.paused = 0;
  G.st = null;
  create();
};

G.save = () => {
  if (!G.st) return;
  S.flushLegacy(G.st, G.acc);
  if (!G.st.ended) saveGame(G.st);
  saveAccount(G.acc);
  G.lastSave = performance.now();
};
addEventListener("visibilitychange", () => { if (document.hidden) G.save(); });
addEventListener("pagehide", () => G.save());

G.refreshHud = () => G.st && UI.renderHud();
G.afterAction = () => { if (!G.st) return; handleStory(); UI.renderHud(); };

G.watchAd = (forRevive = false) => new Promise((resolve) => {
  if (passActive(G.acc)) { resolve(true); return; }
  if (!forRevive && adsLeft(G.acc) <= 0) { UI.toast("오늘 광고 보상을 모두 받았습니다", "bad"); resolve(false); return; }
  const m = UI.modal(`<h3>📺 광고 (시뮬레이션)</h3><p>실서비스: AdMob 보상형 광고 SDK</p><h1 id="adc">3</h1>`, { noClose: true });
  let n = 3;
  const iv = setInterval(() => { n--; const el = m.querySelector("#adc"); if (el) el.textContent = n; if (n <= 0) { clearInterval(iv); if (!forRevive) accWatchAd(G.acc); m.close(); resolve(true); } }, 1000);
});

// 사격전 공통: 전투력 비율로 난이도 보정
G.playShooter = async (o, enemyPower) => {
  const st = G.st, p = st.player;
  const atk = S.playerAttack({ ...st, player: { ...p, equip: { ...p.equip, hand: p.equip.hand ? { ...p.equip.hand } : null } }, inv: [...st.inv.map((s) => ({ ...s }))] });
  const ratio = Math.max(0.4, Math.min(2.5, S.combatPower(st) / Math.max(1, enemyPower)));
  const r = await MG.shooter({
    ...o, look: p.look, equip: p.equip, gender: p.gender,
    playerHp: Math.round(p.maxHp * (0.8 + ratio * 0.4)),
    playerDmg: Math.max(6, Math.round(atk.dmg * (0.7 + ratio * 0.5))),
    fireRate: 2.5 + Math.min(2, ratio),
    enemyHp: Math.round(o.enemyHp / Math.sqrt(ratio)),
  });
  if (r.kills) st.stats.kills += r.kills;
  S.gainXp(st, r.kills * 8);
  return r;
};

G.sleep = () => {
  const st = G.st;
  const h = S.hourOf(st);
  const mins = ((24 + 6 - h) % 24 || 24) * 60 - (st.time.min % 60);
  for (let m = 0; m < mins; m += 30) {
    const evs = S.tick(st, 30, { atBase: true, nearFire: S.hasBuilding(st, "campfire"), sleeping: true });
    if (handleEvents(evs)) break;
  }
  UI.toast("아침이 밝았습니다 ☀️", "good");
  G.afterAction();
};

// ================= 입력 =================
const keys = new Set();
addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || document.querySelector(".mg")) return;
  const k = e.key.toLowerCase();
  keys.add(k);
  if (G.st && !G.paused) {
    if (k === "e" || k === " ") { G.input.action = true; e.preventDefault(); }
    if (k === "i" || k === "b") UI.openBag();
    if (k === "c") UI.openCraft();
    if (k === "escape") UI.openMenu();
  }
});
addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

// 가상 조이스틱
const joy = document.getElementById("joy"), knob = document.getElementById("knob");
let joyId = null, joyC = [0, 0];
joy.addEventListener("pointerdown", (e) => { joyId = e.pointerId; const r = joy.getBoundingClientRect(); joyC = [r.left + r.width / 2, r.top + r.height / 2]; joy.setPointerCapture(e.pointerId); moveJoy(e); });
joy.addEventListener("pointermove", (e) => { if (e.pointerId === joyId) moveJoy(e); });
const endJoy = () => { joyId = null; G.input.x = G.input.y = 0; knob.style.transform = ""; };
joy.addEventListener("pointerup", endJoy); joy.addEventListener("pointercancel", endJoy);
function moveJoy(e) {
  let dx = e.clientX - joyC[0], dy = e.clientY - joyC[1];
  const L = Math.hypot(dx, dy), max = 44;
  if (L > max) { dx = (dx / L) * max; dy = (dy / L) * max; }
  knob.style.transform = `translate(${dx}px,${dy}px)`;
  G.input.x = dx / max; G.input.y = dy / max;
}
document.getElementById("act").addEventListener("pointerdown", (e) => { e.preventDefault(); G.input.action = true; });
// 메뉴/행동 버튼 아이콘을 통일된 SVG 세트로
const MENU_IC = { bag: "ui.bag", craft: "ui.craft", base: "ui.base", people: "ui.people", animals: "ui.animals", story: "ui.story", olympics: "ui.olympics", shop: "ui.shop", menu: "ui.menu" };
document.querySelectorAll("[data-open]").forEach((b) => { const lab = b.querySelector("span").outerHTML; b.innerHTML = Ic.icon(MENU_IC[b.dataset.open], 26) + lab; });
document.getElementById("act").innerHTML = Ic.icon("ui.hand", 40);
document.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => {
  if (!G.st || G.paused) return;
  ({ bag: UI.openBag, craft: UI.openCraft, base: () => UI.openBase(), people: UI.openPeople, animals: UI.openAnimals, story: UI.openStory, olympics: UI.openOlympics, shop: UI.openShop, menu: UI.openMenu })[b.dataset.open]();
}));

// ================= 필드 엔티티 =================
function mobAt(type, kind, x, y) {
  const def = kind === "enemy" ? ENEMIES[type] : ANIMALS[type];
  const hp = Math.round(def.hp * (kind === "enemy" ? S.diff(G.st).enemy : 1));
  return { kind, type, x, y, vx: 0, vy: 0, hp, maxHp: hp, cd: 1, phase: Math.random() * 6, wander: 0, facing: 1 };
}

function spawnMobs(dt) {
  G.spawnT -= dt;
  if (G.spawnT > 0) return;
  G.spawnT = 1.2;
  const st = G.st, p = st.player;
  // 멀어진 것 제거
  G.mobs = G.mobs.filter((m) => Math.hypot(m.x - p.x, m.y - p.y) < 1400);
  const cap = 10 + st.story.chapter;
  if (G.mobs.length >= cap) return;
  const a = Math.random() * Math.PI * 2, d = 520 + Math.random() * 380;
  const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
  if (x < TILE * 3 || y < TILE * 3 || x > (WORLD_W - 3) * TILE || y > (WORLD_H - 3) * TILE || isBlocked(G.world, x, y)) return;
  // 기지 안에는 생성 안 함
  if (Math.hypot(x - (G.world.cx + 0.5) * TILE, y - (G.world.cy + 0.5) * TILE) < 10 * TILE) return;
  const t = tileAt(G.world, x, y);
  const night = S.isNight(st);
  const ch = st.story.chapter;
  const poiR = (id) => { const q = G.world.pois[id]; return Math.hypot(x - q.tx * TILE, y - q.ty * TILE) < 14 * TILE; };
  let pick;
  if (poiR("ash_fortress")) pick = ["enemy", ch >= 9 ? "ash_knight" : "raider"];
  else if (poiR("raider_camp")) pick = ["enemy", "raider"];
  else if (t === T.RAD) pick = ["enemy", Math.random() < 0.5 ? "mutant" : "rad_rat"];
  else if (night && Math.random() < 0.55) pick = ["enemy", Math.random() < 0.6 ? "mutant" : "feral_dog"];
  else if (t === T.RUIN) pick = Math.random() < 0.5 ? ["enemy", "rad_rat"] : Math.random() < 0.5 + ch * 0.03 ? ["enemy", "raider"] : ["animal", "dog"];
  else if (t === T.GRASS || t === T.SAND || t === T.SNOW || Math.random() < 0.5) {
    // 지역 야생동물: 그 땅에 사는 동물만 나타난다(사막엔 염소·개, 툰드라엔 늑대·사슴…)
    const list = (BIOMES[G.world.biome] || BIOMES.temperate).animals.filter((a) => ch >= 3 || a !== "wolf");
    pick = ["animal", list[Math.floor(Math.random() * list.length)]];
  } else pick = ["enemy", Math.random() < 0.6 ? "rad_rat" : "feral_dog"];
  if (pick[1] === "raider" && ch < 2) pick = ["enemy", "rad_rat"];
  G.mobs.push(mobAt(pick[1], pick[0], x, y));
}

function updateMobs(dt) {
  const st = G.st, p = st.player;
  const baseX = (G.world.cx + 0.5) * TILE, baseY = (G.world.cy + 0.5) * TILE;
  const followers = st.companions.filter((c) => c.task === "follow" && S.isAdult(c)).length + st.animals.filter((a) => a.task === "follow").length;
  for (const m of G.mobs) {
    const dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy) || 1;
    m.phase += dt * 8;
    let sp = 0, tx = 0, ty = 0;
    const hostile = m.kind === "enemy" || (ANIMALS[m.type]?.hostileWild && m.hp < m.maxHp) || (m.type === "wolf" && d < 140) || m.aggro;
    // 기지 안으로는 들어오지 않음(성벽)
    const inBase = Math.hypot(m.x - baseX, m.y - baseY) < (2 + st.base.lv) * TILE;
    if (hostile && d < (m.kind === "enemy" ? 260 : 200) && !G.atBase) {
      const def = m.kind === "enemy" ? ENEMIES[m.type] : null;
      sp = def ? def.speed : 90;
      if (def?.ranged && d < 170) sp = 0;
      tx = dx / d; ty = dy / d;
      m.cd -= dt;
      const reach = def?.ranged ? 190 : 26;
      if (d < reach && m.cd <= 0) {
        m.cd = def?.ranged ? 1.8 : 1.1;
        const atk = def ? def.atk : ANIMALS[m.type].combat || 5;
        if (def?.ranged) G.shots.push({ x: m.x, y: m.y - 16, vx: (dx / d) * 260, vy: (dy / d) * 260, dmg: atk, foe: true, life: 1.2 });
        else { S.damagePlayer(st, atk); fxText(p.x, p.y - 40, "-" + Math.round(atk * S.diff(st).enemy), "#ff6b5b"); }
      }
    } else if (ANIMALS[m.type]?.flee && d < 140) { sp = 110; tx = -dx / d; ty = -dy / d; }
    else {
      m.wander -= dt;
      if (m.wander <= 0) { m.wander = 2 + Math.random() * 3; const a = Math.random() * Math.PI * 2; m.wx = Math.cos(a); m.wy = Math.sin(a); m.still = Math.random() < 0.4; }
      if (!m.still) { sp = 30; tx = m.wx; ty = m.wy; }
    }
    const nx = m.x + tx * sp * dt, ny = m.y + ty * sp * dt;
    const willBeIn = Math.hypot(nx - baseX, ny - baseY) < (2 + st.base.lv) * TILE;
    if (!isBlocked(G.world, nx, ny) && (!willBeIn || inBase)) { m.x = nx; m.y = ny; }
    m.moving = sp > 0;
    if (sp > 0) { m.dirx = tx; m.diry = ty; }
    if (Math.abs(tx) > 0.1) m.facing = tx > 0 ? 1 : -1;
    // 동행 동료/동물의 자동 공격
    if (followers && hostile && d < 140) {
      m.allyCd = (m.allyCd || 0) - dt;
      if (m.allyCd <= 0) {
        m.allyCd = 1;
        let dmg = 0;
        for (const c of st.companions) if (c.task === "follow" && S.isAdult(c)) dmg += (c.stats.str + c.stats.agi) * 0.6 * (c.role === "soldier" ? 1.5 : 1) * (S.hasSkill(st, "command") ? 1.25 : 1);
        for (const a of st.animals) if (a.task === "follow") dmg += (ANIMALS[a.type].combat || 2) * 0.6;
        hitMob(m, Math.round(dmg), "#9fd3ff");
      }
    }
  }
  G.mobs = G.mobs.filter((m) => m.hp > 0);
}

function hitMob(m, dmg, color = "#fff") {
  m.hp -= dmg;
  m.aggro = true;
  m.hitFlash = true;
  fxText(m.x, m.y - 40, String(dmg), color);
  if (m.hp <= 0) {
    if (m.kind === "enemy") {
      const drops = S.onKill(G.st, m.type, makeRng(Date.now()));
      if (drops.length) UI.toast("획득: " + drops.map((d) => ITEMS[d].name).join(", "));
    } else {
      const a = ANIMALS[m.type];
      S.giveItem(G.st, "raw_meat", a.meat); if (a.meat >= 3) S.giveItem(G.st, "leather", Math.ceil(a.meat / 3)); S.giveItem(G.st, "bone", 1);
      S.gainXp(G.st, 10);
      UI.toast(`${a.name} 사냥: 생고기 ×${a.meat}`);
    }
  }
}

function fxText(x, y, txt, color) { G.fx.push({ x, y, txt, color, t: 0.9 }); }

// ================= 상호작용 =================
async function interact() {
  const st = G.st, p = st.player;
  // 1) 적/동물
  const atk = p.equip.hand && ITEMS[p.equip.hand.id].ranged && S.count(st.inv, ITEMS[p.equip.hand.id].ranged) > 0 ? 230 : 52;
  let best = null, bd = 1e9;
  for (const m of G.mobs) { const d = Math.hypot(m.x - p.x, m.y - p.y); if (d < bd) { bd = d; best = m; } }
  if (best && bd < atk && G.attackCd <= 0 && (best.kind === "enemy" || best.aggro)) return attack(best);
  if (best && bd < 56 && best.kind === "animal") return animalChoice(best);
  // 2) 자원
  let node = null; bd = 1e9;
  for (const n of visibleNodes()) { const nx = (n.tx + 0.5) * TILE, ny = (n.ty + 0.5) * TILE; const d = Math.hypot(nx - p.x, ny - p.y); if (d < bd) { bd = d; node = n; } }
  if (node && bd < 50) return gatherNode(node);
  // 3) 장소
  for (const q of Object.values(G.world.pois)) if (Math.hypot((q.tx + 0.5) * TILE - p.x, (q.ty + 0.5) * TILE - p.y) < 2.5 * TILE) return visitPoi(q);
  // 4) 기지 중앙
  if (Math.hypot((G.world.cx + 0.5) * TILE - p.x, (G.world.cy + 0.5) * TILE - p.y) < 2.2 * TILE) return UI.openBase();
  // 5) 물
  if (nearWater(G.world, p.x, p.y)) {
    if (p.equip.hand?.id === "fishing_rod") { const r = S.gather(st, "fish", makeRng(Date.now())); UI.toast(r.length ? "🐟 물고기를 낚았다!" : "놓쳤다…"); }
    else { S.gather(st, "water", makeRng(Date.now())); UI.toast("더러운 물을 떴습니다 (모닥불에서 끓이세요)"); }
    return;
  }
  // 6) 근처 적이 있지만 사거리 밖
  if (best && bd < 120 && best.kind === "enemy") UI.toast("더 가까이 가세요");
}

function attack(m) {
  const st = G.st, p = st.player;
  const r = S.playerAttack(st);
  G.attackCd = r.ranged ? 0.5 : 0.42;
  G.swing = 0.2; G.swingStart = true;
  G.moveYaw = Math.atan2(m.x - p.x, m.y - p.y);
  if (r.ranged) { const d = Math.hypot(m.x - p.x, m.y - p.y) || 1; G.shots.push({ x: p.x, y: p.y - 20, vx: ((m.x - p.x) / d) * 520, vy: ((m.y - 14 - p.y + 20) / d) * 520, dmg: r.dmg, life: 0.6 }); }
  else hitMob(m, r.dmg);
  G.facing = m.x < p.x ? -1 : 1;
}

async function animalChoice(m) {
  const st = G.st;
  const a = ANIMALS[m.type];
  const food = a.food;
  const diff = S.tameDifficulty(st, m.type);
  const needRes = a.research && !S.researched(st, a.research);
  const full = st.animals.length >= S.penCapacity(st);
  const v = await UI.choice(`${a.icon} ${a.name}`, `길들이기 난이도: ${diff < 0.3 ? "쉬움" : diff < 0.6 ? "보통" : "어려움"} · 먹이 ${ITEMS[food].icon}${ITEMS[food].name} (보유 ${S.count(st.inv, food)})${needRes ? "<br><span class='no'>먼저 '승마'를 연구해야 길들일 수 있습니다.</span>" : ""}${full ? "<br><span class='no'>동물 우리가 가득 찼습니다(기지에 우리를 지으세요).</span>" : ""}`, [
    { label: "길들이기", value: "tame", cls: "primary", disabled: needRes || full || S.count(st.inv, food) < 1 },
    { label: "사냥한다", value: "hunt", cls: "danger" },
    { label: "그냥 둔다", value: null },
  ], { closable: true });
  if (v === "tame") {
    S.removeFrom(st.inv, food, 1);
    const r = await MG.taming({ name: a.name, type: m.type, difficulty: diff });
    if (r.win) { S.addTamed(st, m.type); m.hp = 0; G.mobs = G.mobs.filter((x) => x !== m); }
    else { m.aggro = !!a.hostileWild; }
    G.afterAction();
  } else if (v === "hunt") { m.aggro = true; attack(m); }
}

function visibleNodes() {
  const st = G.st, p = st.player;
  return G.world.nodes.filter((n) => {
    const nx = n.tx * TILE, ny = n.ty * TILE;
    if (Math.abs(nx - p.x) > VW || Math.abs(ny - p.y) > VH) return false;
    const dep = st.world.depleted[n.id];
    if (dep && dep > st.time.min) return false;
    return true;
  });
}

function gatherNode(n) {
  const st = G.st;
  n.hits = (n.hits || 0) + 1;
  G.swing = 0.25; G.swingStart = true;
  G.moveYaw = Math.atan2((n.tx + 0.5) * TILE - G.st.player.x, (n.ty + 0.5) * TILE - G.st.player.y);
  G.attackCd = 0.35;
  const out = S.gather(st, n.type, makeRng(Date.now() + n.id));
  for (const [id, q] of out) fxText((n.tx + 0.5) * TILE, n.ty * TILE - 10, `${ITEMS[id].icon}+${q}`, "#ffe9a8");
  if (n.hits >= NODE_TYPES[n.type].hp) {
    n.hits = 0;
    st.world.depleted[n.id] = st.time.min + NODE_TYPES[n.type].respawnH * 60;
    // 오래된 고갈 기록 정리(저장 용량)
    if (Object.keys(st.world.depleted).length > 400) for (const [k, v] of Object.entries(st.world.depleted)) if (v < st.time.min) delete st.world.depleted[k];
  }
  G.afterAction();
}

async function visitPoi(q) {
  const st = G.st;
  if (!st.story.visited[q.id]) { st.story.visited[q.id] = true; UI.toast(`📍 ${q.name} 발견!`, "good"); S.gainXp(st, 40); }
  if (q.id === "ash_fortress") {
    if (st.story.chapter < 11) return UI.toast("거대한 요새… 아직은 들어갈 수 없다 (11장)");
    if (st.story.bossDefeated) return UI.toast("재의 요새는 이제 조용하다.");
    const boss = S.diff(st).bossPower;
    const v = await UI.choice("🏯 재의 군주", `\"잿더미 위에 왕국이라니. 우습군.\"<br>보스 권장 전투력 <b>${boss}</b> · 내 전투력 <b>${S.combatPower(st)}</b>`, [{ label: "최종 결전", value: 1, cls: "danger" }, { label: "아직 준비가 안 됐다", value: 0 }], { closable: true });
    if (!v) return;
    const r = await G.playShooter({ title: "🏯 최종 결전", enemyCount: 16, enemyHp: 70, enemyAtk: 14, duration: 60, boss: { hp: 1400, name: "재의 군주" }, turrets: 0 }, boss);
    if (r.win) { st.story.bossDefeated = true; G.afterAction(); }
    else { UI.toast("재의 군주의 힘은 압도적이었다… 더 강해져서 돌아오자", "bad"); S.damagePlayer(st, st.player.maxHp * 0.6); }
    return;
  }
  const dg = DUNGEONS[q.id];
  st.story.bosses = st.story.bosses || {};
  if (dg && !dg.final && !st.story.bosses[q.id] && st.story.chapter >= dg.minChapter) {
    const pw = Math.round(dg.power * S.diff(st).enemy);
    const v = await UI.choice(`☠️ 던전 보스: ${dg.boss}`, `이곳의 주인이 기다리고 있다. 권장 전투력 <b>${pw}</b> · 내 전투력 <b>${S.combatPower(st)}</b><br><small>보스는 생애마다 같지만, 지도에서의 위치는 매번 다릅니다.</small>`, [{ label: "도전한다", value: 1, cls: "danger" }, { label: "다음에", value: 0 }], { closable: true });
    if (v) {
      const r = await G.playShooter({ title: `☠️ ${dg.boss}`, enemyCount: 10, enemyHp: 40, enemyAtk: 10, duration: 55, boss: { hp: dg.hp, name: dg.boss } }, pw);
      if (r.win) { st.story.bosses[q.id] = true; for (const [i, n] of dg.reward) S.giveItem(st, i, n); S.gainXp(st, pw); st.gold += pw; UI.toast(`☠️ ${dg.boss} 격파! 전리품 획득`, "good"); }
      else { UI.toast("보스에게 밀려났다…", "bad"); S.damagePlayer(st, st.player.maxHp * 0.5); }
      G.afterAction();
      return;
    }
  }
  if (q.id === "raider_camp") {
    const today = S.day(st);
    if (st.story.campRaid === today) return UI.toast("오늘은 이미 야영지를 습격했다");
    const v = await UI.choice("🏴 붉은 손 야영지", "약탈자들의 보급품이 쌓여 있다. 습격할까?", [{ label: "습격 (사격전)", value: 1, cls: "danger" }, { label: "물러난다", value: 0 }], { closable: true });
    if (!v) return;
    st.story.campRaid = today;
    const r = await G.playShooter({ title: "🏴 야영지 습격", enemyCount: 12, enemyHp: 45, enemyAtk: 9, duration: 40 }, 80 + st.story.chapter * 60);
    if (r.win) { for (const [i, n] of [["ammo", 12], ["scrap", 10], ["canned_food", 3], ["gunpowder", 2], ["leather", 3]]) S.giveItem(st, i, n); st.karma -= 0; UI.toast("약탈자 보급품 획득!", "good"); }
    G.afterAction();
    return;
  }
  if (q.id === "trader") {
    const v = await UI.choice("🛒 떠돌이 상인", `\"뭐든 팔고 뭐든 사지.\" 금화 ${Math.floor(st.gold)}`, [
      { label: "고철 10 → 금화 30", value: "s1" }, { label: "가죽 3 → 금화 40", value: "s2" },
      { label: "금화 80 → 철괴 4", value: "b1" }, { label: "금화 120 → 전자부품 3", value: "b2" }, { label: "금화 200 → 소생 키트", value: "b3" },
      { label: "떠난다", value: null },
    ], { closable: true });
    const tr = { s1: [{ scrap: 10 }, 30], s2: [{ leather: 3 }, 40] };
    const buy = { b1: [80, "iron", 4], b2: [120, "electronics", 3], b3: [200, "revive_kit", 1] };
    if (tr[v]) { if (S.pay(st, tr[v][0])) { st.gold += tr[v][1]; UI.toast("거래 완료", "good"); } else UI.toast("물건이 부족합니다", "bad"); }
    if (buy[v]) { if (st.gold >= buy[v][0]) { st.gold -= buy[v][0]; S.giveItem(st, buy[v][1], buy[v][2]); UI.toast("거래 완료", "good"); } else UI.toast("금화가 부족합니다", "bad"); }
    G.afterAction();
    return;
  }
  if (q.id === "iron_city" && st.story.ironLoot !== S.day(st)) { st.story.ironLoot = S.day(st); for (const [i, n] of [["scrap", 8], ["electronics", 1], ["fuel", 1]]) S.giveItem(st, i, n); UI.toast("폐공장에서 고철·전자부품·연료를 찾았다", "good"); }
  if (q.id === "radio_tower") UI.toast("📡 지지직… \"…살아 있는 사람… 응답하라…\"");
  if (q.id === "rad_river") UI.toast("☢️ 강물이 초록빛으로 빛난다. 정수 장치가 필요하다.");
  G.afterAction();
}

// ================= 스토리/이벤트 =================
let storyBusy = false;
async function handleStory() {
  if (storyBusy || !G.st) return;
  const opened = S.checkStory(G.st);
  if (!opened.length) return;
  storyBusy = true;
  for (const o of opened) {
    if (o === "ending") {
      const e = S.finishMainStory(G.st, G.acc);
      S.giveItem(G.st, "crown", 1);
      await UI.cinematic(`👑 ${e.title}`, `${e.text}\n\n— ${JOBS[G.st.player.job].name} ${G.st.player.name}의 이야기. (엔딩 보상 💎500 · 왕관 획득)\n\n그러나 세계는 아직 잿빛이다. 멸망 전의 땅을 모두 되살릴 때까지, 이야기는 계속된다.`, { crown: true, palette: ["#1a1830", "#6b3d5a", "#f0b56a"] });
      G.save();
    } else {
      const ch = CHAPTERS[o];
      await UI.cinematic(ch.title, ch.text, { palette: o % 2 ? ["#141820", "#3b3a45", "#a06a40"] : ["#1b1512", "#4a3326", "#c7743b"] });
    }
  }
  storyBusy = false;
  UI.renderHud();
  G.save();
}

let eventBusy = false;
async function handleEventsAsync(evs) {
  eventBusy = true;
  for (const e of evs) {
    if (e.type === "death") { await UI.deathModal(); break; }
    if (e.type === "raid") await UI.raidModal(e.strength);
    if (e.type === "visitor") await UI.visitorModal(e.survivor);
    if (e.type === "birth") await UI.cinematic("👶 새 생명", `잿더미 위에서 아이가 태어났다. 이름은 ${G.st.companions.find((c) => c.uid === e.uid)?.name}. 이 아이가 자라면 왕국을 이어받을 수 있다.`, { palette: ["#1f1a2a", "#5a4560", "#e0b080"] });
    if (e.type === "research") UI.toast("🔬 연구 완료!", "good");
  }
  eventBusy = false;
  G.afterAction();
}
function handleEvents(evs) {
  if (!evs.length) return false;
  handleEventsAsync(evs);
  return evs.some((e) => e.type === "death");
}

// ================= 루프 =================
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  G.t += dt;
  if (G.st && !G.st.ended) {
    if (!G.paused && !eventBusy && !document.querySelector(".mg")) update(dt);
    draw(dt);
  }
  requestAnimationFrame(frame);
}

function update(dt) {
  const st = G.st, p = st.player;
  if (st.dead) { if (!eventBusy) handleEvents([{ type: "death" }]); return; }
  // 이동
  let ix = G.input.x, iy = G.input.y;
  if (keys.has("a") || keys.has("arrowleft")) ix = -1; if (keys.has("d") || keys.has("arrowright")) ix = 1;
  if (keys.has("w") || keys.has("arrowup")) iy = -1; if (keys.has("s") || keys.has("arrowdown")) iy = 1;
  const L = Math.hypot(ix, iy);
  G.moving = L > 0.15;
  if (G.moving) {
    const sp = S.moveSpeed(st) * Math.min(1, L);
    const vx = (ix / Math.max(1, L)) * sp * dt, vy = (iy / Math.max(1, L)) * sp * dt;
    if (!isBlocked(G.world, p.x + vx, p.y)) p.x += vx;
    if (!isBlocked(G.world, p.x, p.y + vy)) p.y += vy;
    p.x = Math.max(TILE * 2, Math.min((WORLD_W - 2) * TILE, p.x));
    p.y = Math.max(TILE * 2, Math.min((WORLD_H - 2) * TILE, p.y));
    if (Math.abs(ix) > 0.1) G.facing = ix > 0 ? 1 : -1;
    G.moveYaw = Math.atan2(ix, iy);
    G.phase += dt * (p.mount ? 9 : 11) * Math.min(1, L);
    G.trail.unshift([p.x, p.y]); if (G.trail.length > 60) G.trail.pop();
  }
  // 위치 컨텍스트
  const bx = (G.world.cx + 0.5) * TILE, by = (G.world.cy + 0.5) * TILE;
  const wallR = (2 + st.base.lv) * TILE;
  G.atBase = Math.hypot(p.x - bx, p.y - by) < wallR;
  G.nearFire = G.atBase && S.hasBuilding(st, "campfire");
  const tile = tileAt(G.world, p.x, p.y);
  G.inRad = tile === T.RAD; G.seasonId = S.season(st).id;
  // 시간 진행
  const gm = dt * TIME.gameMinPerRealSec;
  const evs = S.tick(st, gm, { atBase: G.atBase, nearFire: G.nearFire, inRad: tile === T.RAD, moving: G.moving });
  handleEvents(evs);
  // 입력 행동
  G.attackCd -= dt; if (G.swing > 0) G.swing -= dt;
  if (G.input.action) { G.input.action = false; if (G.attackCd <= 0) interact(); }
  // 몹/탄
  spawnMobs(dt);
  updateMobs(dt);
  for (const s of G.shots) {
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    if (s.foe) { if (Math.hypot(s.x - p.x, s.y - (p.y - 16)) < 14) { S.damagePlayer(st, s.dmg); fxText(p.x, p.y - 40, "-" + Math.round(s.dmg), "#ff6b5b"); s.life = 0; } }
    else for (const m of G.mobs) if (Math.hypot(s.x - m.x, s.y - (m.y - 14)) < 16) { hitMob(m, s.dmg); s.life = 0; break; }
  }
  G.shots = G.shots.filter((s) => s.life > 0);
  // 무작위 조우
  if (!G.atBase) { G.encounterT -= dt; if (G.encounterT <= 0) { G.encounterT = 150 + Math.random() * 120; UI.encounterModal(); } }
  // HUD/저장
  G.hudT = (G.hudT || 0) - dt;
  if (G.hudT <= 0) { G.hudT = 0.5; UI.renderHud(); handleStory(); }
  if (performance.now() - G.lastSave > 15000) G.save();
}

function draw(dt) {
  if (G.r3d) return draw3D(dt);
  const st = G.st, p = st.player;
  G.cam.x += (p.x - VW / 2 - G.cam.x) * Math.min(1, dt * 8);
  G.cam.y += (p.y - VH / 2 - G.cam.y) * Math.min(1, dt * 8);
  const cam = { x: Math.round(G.cam.x), y: Math.round(G.cam.y) };
  ctx.fillStyle = "#1a1714"; ctx.fillRect(0, 0, VW, VH);
  R.drawTerrain(ctx, G.world, cam, VW, VH);
  // POI
  for (const q of Object.values(G.world.pois)) {
    const x = (q.tx + 0.5) * TILE - cam.x, y = (q.ty + 0.5) * TILE - cam.y;
    if (x < -80 || y < -80 || x > VW + 80 || y > VH + 80) continue;
    ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(x, y + 18, 34, 10, 0, 0, Math.PI * 2); ctx.fill();
    R.emoji(ctx, q.icon, x, y - 6, 44);
    ctx.fillStyle = "#fff"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center"; ctx.fillText(q.name, x, y + 34); ctx.textAlign = "left";
  }
  R.drawBase(ctx, st, G.world, cam, G.t);
  // 정렬해서 그리기(y-정렬)
  const list = [];
  for (const n of visibleNodes()) list.push({ y: (n.ty + 0.5) * TILE + 8, f: () => R.drawNode(ctx, n, (n.tx + 0.5) * TILE - cam.x, (n.ty + 0.5) * TILE - cam.y) });
  for (const m of G.mobs) {
    const sx = m.x - cam.x, sy = m.y - cam.y;
    if (sx < -60 || sy < -60 || sx > VW + 60 || sy > VH + 60) continue;
    list.push({ y: m.y, f: () => { if (m.kind === "enemy") R.drawEnemy(ctx, { ...m, x: sx, y: sy }, ENEMIES[m.type], m.phase); else { R.drawAnimal(ctx, m.type, sx, sy, m.phase, m.moving, m.facing); R.hpBar(ctx, sx, sy - 34, m.hp / m.maxHp); } } });
  }
  // 기지 주민
  const bx = (G.world.cx + 0.5) * TILE, by = (G.world.cy + 0.5) * TILE;
  st.companions.filter((c) => c.task === "base").slice(0, 10).forEach((c, i) => {
    const a = G.t * 0.15 + i * 1.7, r = (1.4 + (i % 3) * 0.6) * TILE;
    const x = bx + Math.cos(a) * r, y = by + Math.sin(a) * r * 0.7 + TILE;
    list.push({ y, f: () => R.drawCharacter(ctx, x - cam.x, y - cam.y, { skin: "#c9956d", hair: c.gender === "F" ? "long" : "short", hairColor: "#1b1410" }, { body: { id: c.role === "soldier" ? "combat_vest" : c.child ? "rag_shirt" : "leather_jacket" }, legs: { id: "rag_pants" } }, -Math.sin(a) > 0 ? 1 : -1, G.t * 6 + i, { moving: true, scale: c.child && !S.isAdult(c) ? 0.65 : 0.9, gender: c.gender }) });
  });
  // 동행 동료/동물(발자취를 따라옴)
  let k = 12;
  for (const c of st.companions.filter((c) => c.task === "follow")) {
    const tp = G.trail[Math.min(k, G.trail.length - 1)] || [p.x - 30, p.y]; k += 12;
    list.push({ y: tp[1], f: () => R.drawCharacter(ctx, tp[0] - cam.x, tp[1] - cam.y, { skin: "#c9956d", hair: c.gender === "F" ? "long" : "short", hairColor: "#1b1410" }, { body: { id: c.role === "soldier" ? "combat_vest" : "leather_jacket" }, legs: { id: "leather_pants" }, feet: { id: "boots" }, hand: { id: c.role === "soldier" ? "rifle" : "knife" } }, G.facing, G.phase, { moving: G.moving, gender: c.gender }) });
  }
  for (const a of st.animals.filter((a) => a.task === "follow" && st.player.mount?.uid !== a.uid)) {
    const tp = G.trail[Math.min(k, G.trail.length - 1)] || [p.x + 30, p.y]; k += 12;
    list.push({ y: tp[1], f: () => R.drawAnimal(ctx, a.type, tp[0] - cam.x, tp[1] - cam.y, G.phase, G.moving, G.facing, true) });
  }
  // 플레이어
  const mount = p.mount ? (p.mount.type === "animal" ? { kind: p.mount.kind } : { id: p.mount.id }) : null;
  list.push({ y: p.y, f: () => R.drawCharacter(ctx, p.x - cam.x, p.y - cam.y, p.look, p.equip, G.facing, G.phase + (G.swing > 0 ? 2 : 0), { moving: G.moving || G.swing > 0, gender: p.gender, mount, scale: 1.05 }) });
  list.sort((a, b) => a.y - b.y).forEach((o) => o.f());
  // 탄/효과
  ctx.fillStyle = "#ffd36b";
  for (const s of G.shots) { ctx.fillStyle = s.foe ? "#ff6b5b" : "#ffd36b"; ctx.fillRect(s.x - cam.x - 2, s.y - cam.y - 2, 4, 4); }
  for (const f of G.fx) { f.t -= dt; f.y -= 28 * dt; ctx.globalAlpha = Math.max(0, f.t); ctx.fillStyle = f.color; ctx.font = "bold 13px sans-serif"; ctx.fillText(f.txt, f.x - cam.x - 8, f.y - cam.y); }
  ctx.globalAlpha = 1;
  G.fx = G.fx.filter((f) => f.t > 0);
  // 상호작용 힌트
  drawHint(cam);
  // 날씨/조명
  const sea = S.season(st);
  const tileHere = tileAt(G.world, p.x, p.y);
  R.drawParticles(ctx, G.particles, VW, VH, dt, sea.id === "winter" ? "snow" : tileHere === T.RAD ? "rad" : "ash");
  const h = (st.time.min % 1440) / 60;
  const dark = h >= 21 || h < 5 ? 0.62 : h >= 19 ? (h - 19) / 2 * 0.62 : h < 7 ? (7 - h) / 2 * 0.62 : 0;
  const lights = [{ x: p.x - cam.x, y: p.y - cam.y - 20, r: 120 }];
  if (S.hasBuilding(st, "campfire")) { const o = R.baseLayout(st, G.world).out.find((o) => o.b.id === "campfire"); if (o) lights.push({ x: o.x - cam.x, y: o.y - cam.y, r: 200 }); }
  lights.push({ x: bx - cam.x, y: by - cam.y, r: 80 + st.base.lv * 30 });
  R.drawLighting(ctx, VW, VH, dark, lights);
  if (tileHere === T.RAD) { ctx.fillStyle = "rgba(120,255,60,0.07)"; ctx.fillRect(0, 0, VW, VH); }
  if (p.hp < p.maxHp * 0.25) { const g = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.3, VW / 2, VH / 2, VH * 0.8); g.addColorStop(0, "rgba(160,0,0,0)"); g.addColorStop(1, `rgba(160,0,0,${0.35 + Math.sin(G.t * 5) * 0.1})`); ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH); }
  drawMinimap();
}

// 3D 모드: 월드는 WebGL, 2D 캔버스는 투명 오버레이(데미지 숫자·체력바·힌트·미니맵)
function draw3D(dt) {
  const st = G.st, p = st.player;
  G.r3d.frame(G, dt);
  ctx.clearRect(0, 0, VW, VH);
  for (const m of G.mobs) {
    if (m.hp >= m.maxHp) continue;
    const s = G.r3d.project(m.x, m.y, m.kind === "enemy" && (m.type === "raider" || m.type === "ash_knight" || m.type === "mutant") ? 2.2 : 1.4);
    if (s.vis) R.hpBar(ctx, s.x, s.y, m.hp / m.maxHp);
  }
  for (const f of G.fx) {
    f.t -= dt; f.rise = (f.rise || 0) + dt * 0.9;
    const s = G.r3d.project(f.x, f.y + 40, 2.2 + f.rise);
    ctx.globalAlpha = Math.max(0, f.t); ctx.fillStyle = f.color; ctx.font = "bold 15px sans-serif"; ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = 3;
    ctx.strokeText(f.txt, s.x - 8, s.y); ctx.fillText(f.txt, s.x - 8, s.y);
  }
  ctx.globalAlpha = 1;
  G.fx = G.fx.filter((f) => f.t > 0);
  drawHint(null);
  if (p.hp < p.maxHp * 0.25) { const g = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.3, VW / 2, VH / 2, VH * 0.8); g.addColorStop(0, "rgba(160,0,0,0)"); g.addColorStop(1, `rgba(160,0,0,${0.35 + Math.sin(G.t * 5) * 0.1})`); ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH); }
  drawMinimap();
}

function drawHint(cam) {
  const st = G.st, p = st.player;
  let txt = null, hx = 0, hy = 0;
  for (const n of visibleNodes()) { const nx = (n.tx + 0.5) * TILE, ny = (n.ty + 0.5) * TILE; if (Math.hypot(nx - p.x, ny - p.y) < 50) { txt = `${NODE_TYPES[n.type].name} 채집`; hx = nx; hy = ny - 36; break; } }
  for (const m of G.mobs) if (Math.hypot(m.x - p.x, m.y - p.y) < 56) { txt = m.kind === "enemy" ? `${ENEMIES[m.type].name} 공격` : `${ANIMALS[m.type].name} (길들이기/사냥)`; hx = m.x; hy = m.y - 50; break; }
  if (!txt && Math.hypot((G.world.cx + 0.5) * TILE - p.x, (G.world.cy + 0.5) * TILE - p.y) < 2.2 * TILE) { txt = "기지 관리"; hx = p.x; hy = p.y - 60; }
  if (!txt && nearWater(G.world, p.x, p.y)) { txt = p.equip.hand?.id === "fishing_rod" ? "낚시" : "물 뜨기"; hx = p.x; hy = p.y - 60; }
  if (!txt) return;
  if (!cam) { const s = G.r3d.project(hx, hy + 40, 2.4); cam = { x: hx - s.x, y: hy - s.y }; }
  ctx.font = "12px sans-serif";
  const w = ctx.measureText(txt).width + 34;
  ctx.fillStyle = "rgba(0,0,0,.6)"; R.roundRect(ctx, hx - cam.x - w / 2, hy - cam.y - 14, w, 22, 11); ctx.fill();
  ctx.fillStyle = "#ffd36b"; ctx.fillText("E", hx - cam.x - w / 2 + 9, hy - cam.y + 1);
  ctx.fillStyle = "#fff"; ctx.fillText(txt, hx - cam.x - w / 2 + 24, hy - cam.y + 1);
}

const poiImgs = {};
function poiImg(id) { if (!poiImgs[id]) { poiImgs[id] = new Image(); poiImgs[id].src = Ic.dataURI("poi." + id, 32); } return poiImgs[id]; }
// 미니맵 (저해상도 캐시)
let miniCache = null;
function drawMinimap() {
  const size = Math.min(120, VW * 0.26);
  if (!miniCache || miniCache.seed !== G.world.seed) {
    const c = document.createElement("canvas"); c.width = c.height = WORLD_W;
    const g = c.getContext("2d"); const img = g.createImageData(WORLD_W, WORLD_H);
    const cols = { 0: [111, 106, 96], 1: [79, 107, 58], 2: [90, 90, 94], 3: [47, 79, 99], 4: [92, 122, 46], 5: [87, 80, 74], 6: [122, 106, 82], 7: [61, 59, 57] };
    for (let i = 0; i < WORLD_W * WORLD_H; i++) { const c3 = cols[G.world.tiles[i]]; img.data.set([...c3, 255], i * 4); }
    g.putImageData(img, 0, 0);
    miniCache = { seed: G.world.seed, c };
  }
  const x0 = VW - size - 10, y0 = 92;
  ctx.globalAlpha = 0.85;
  ctx.drawImage(miniCache.c, x0, y0, size, size);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(255,255,255,.4)"; ctx.strokeRect(x0, y0, size, size);
  const sc = size / (WORLD_W * TILE);
  ctx.font = "10px sans-serif";
  for (const q of Object.values(G.world.pois)) {
    const img = poiImg(q.id);
    if (img.complete && img.naturalWidth) ctx.drawImage(img, x0 + q.tx * TILE * sc - 8, y0 + q.ty * TILE * sc - 8, 16, 16);
  }
  ctx.fillStyle = "#ffd36b"; ctx.fillRect(x0 + G.world.cx * TILE * sc - 2, y0 + G.world.cy * TILE * sc - 2, 4, 4);
  ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x0 + G.st.player.x * sc, y0 + G.st.player.y * sc, 2.5, 0, Math.PI * 2); ctx.fill();
}

// 서비스 워커(오프라인 플레이 + 재방문 로딩 0초)
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("./sw.js").catch(() => {});

title();
