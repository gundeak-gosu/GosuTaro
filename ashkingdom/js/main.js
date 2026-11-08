// 메인 — 타이틀/캐릭터 생성/게임 루프/입력/필드 엔티티.
import * as S from "./systems.js";
import * as UI from "./ui.js";
import * as MG from "./minigames.js";
import { JOBS, DIFFICULTY, ANIMALS, ENEMIES, CHAPTERS, ITEMS, TIME, BUILDINGS, DUNGEONS } from "./data.js";
import { Field3D, webglAvailable, mountViewer, preloadHeroes } from "./r3d.js";
import { randomSpawn } from "./earth.js";
import * as Net from "./net.js";
import * as Sync from "./sync.js";
import * as Sfx from "./sfx.js";
import * as Bgm from "./bgm.js";
import { TUTORIAL, tutorialStep } from "./tutorial.js";
import { BIOMES } from "./data.js";
import { SPECIALS, SCOUT, RAIDER_BANDS, HEROINES, TALENTS } from "./data.js";
// 영웅 그림이 있으면 SD 그림으로 그린다(포즈는 상황에 따라)
function heroArt(c) { const h = c.hero && HEROINES[c.hero]; return h?.art || null; }
import { generateWorld, TILE, WORLD_W, WORLD_H, tileAt, isBlocked, nearWater, T, NODE_TYPES, applyBridges, isSlow } from "./world.js";
import * as Reg from "./regions.js";
import * as Sites from "./sites.js";
import * as Meta from "./meta.js";
import * as AAI from "./animalai.js";
import * as Relics from "./relics.js";
import { claimGrowthFund } from "./shop.js";
import * as R from "./render.js";
import { loadAccount, saveAccount, loadGame, saveGame, deleteGame, listSlots, setSlot, activeSlot, loadSlot, deleteSlot } from "./storage.js";
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
// 기본은 '빠른 2D' 필드(렉 없음). 3D 필드는 설정에서 고른 사람만. 이야기 장면·자세히 보기는 WebGL 이 되면 항상 3D.
// 실사 3D(캐릭터 생성·이야기 장면·자세히 보기)는 '고화질 3D'·'픽셀 3D'를 고른 경우에만 — 기본은 가벼운 2등신 2D(휴대폰 렉 방지)
const g3pick = G.acc.settings?.gfx;
G.hasGL = webglAvailable() && !/[?&]2d\b/.test(location.search) && (g3pick === "hd" || g3pick === "pixel" || /[?&]3d\b/.test(location.search));
if (G.hasGL) {
  UI.setViewer(mountViewer);
  const g3 = G.acc.settings?.gfx;
  if (g3 === "hd" || g3 === "pixel" || /[?&]3d\b/.test(location.search)) {
    try { G.r3d = new Field3D(document.getElementById("gl")); document.body.classList.add("three"); }
    catch (e) { console.warn("3D 초기화 실패 → 2D", e); G.r3d = null; }
  }
}

// ================= 타이틀 / 캐릭터 생성 =================
// 시작 시 다른 기기와 진행 맞추기(서버·로그인 있을 때만)
G.syncOnStart = async (reload = false) => {
  try {
    const local = loadGame();
    const r = await Sync.onStart(!!local);
    if (r.action === "pull" || (r.action === "conflict" && (await UI.syncConflict(local, r.remote)) === "remote")) {
      const o = await Sync.pull();
      if (o) { saveGame(o.st); saveAccount(o.acc); UI.toast("다른 기기의 진행을 불러왔습니다", "good"); location.reload(); return; }
    } else if (r.action === "conflict") await Sync.keepLocal(local, G.acc, r.remote.rev);
    else if (r.action === "push" && local) await Sync.push(local, G.acc, { force: true });
    if (reload) location.reload();
  } catch (e) { console.warn("sync", e); }
};

async function title() {
  if (Sync.loggedIn()) await G.syncOnStart();
  const el = document.getElementById("title");
  el.hidden = false;
  document.getElementById("hud").hidden = true;
  document.getElementById("controls").hidden = true;
  const slots = listSlots();
  const card = ({ n, d }) => {
    if (!d) return `<button class="slot-card empty" data-new="${n}"><b>새로 하기</b><small>슬롯 ${n + 1}</small></button>`;
    const p = d.player, dead = !!d.ended, dif = DIFFICULTY[d.difficulty] || DIFFICULTY.normal;
    return `<div class="slot-card ${dead ? "dead" : ""}" data-n="${n}">
      <span class="dif dif-${d.difficulty}">${dif.name}</span>
      <span class="skull">💀${d.stats?.deaths || 0}</span>
      <button class="slot-del" data-del="${n}" aria-label="슬롯 ${n + 1} 지우기">🗑</button>
      <b>${JOBS[p.job].name} <small>LV${p.level ?? 1}</small></b>
      <canvas class="por" data-por="${n}" width="120" height="130"></canvas>
      <small>${esc(p.name)} · ${dead ? "생애 종료" : S.day(d) + "일 생존"}</small></div>`;
  };
  const RS0 = Relics.relicState(G.acc);
  el.innerHTML = `<div class="t-wrap"><h1>잿빛 왕국</h1><h3>ASHEN KINGDOM · 마지막 생존자</h3>
    <div class="tbar"><span>💎 ${G.acc.gems}</span><span>☥ 부활권 ${G.acc.reviveTokens ?? 0}</span><span>🗝️ 금고 열쇠 ${RS0.keys}</span><span>👑 VIP ${Meta.vipLevel(G.acc.vip?.pts || 0)}</span></div>
    <div class="slots">${slots.map(card).join("")}</div>
    <div class="hub"><button class="btn" id="hChar">🧬<span>캐릭터·유물</span></button><button class="btn" id="hVault">🗃️<span>구세계 금고</span></button><button class="btn" id="hRec">📜<span>생존 기록</span></button></div>
    <p class="muted small">생애 ${G.acc.runs}회 · 엔딩 ${G.acc.endings.length}/16 · 캐릭터마다 따로 이어서 할 수 있습니다</p></div>`;
  // 슬롯 초상화: 귀여운 2등신 + 장착한 장비
  el.querySelectorAll("[data-por]").forEach((c) => { const d = slots[+c.dataset.por].d; const g = c.getContext("2d"); R.drawCharacter(g, 60, 118, d.player.look, d.player.equip, 1, 0, { scale: 2.6, gender: d.player.gender }); });
  el.querySelector("#hChar").onclick = () => UI.openCharacters(title);
  el.querySelector("#hVault").onclick = () => UI.openVaults(title);
  el.querySelector("#hRec").onclick = () => UI.openRecords();
  el.querySelectorAll("[data-n]").forEach((c) => (c.onclick = (e) => {
    if (e.target.closest("[data-del]")) return;
    const n = +c.dataset.n, d = loadSlot(n);
    setSlot(n);
    if (d.ended) { create(); return; } // 끝난 생애 → 같은 슬롯에서 새로 시작
    el.hidden = true; startGame(d);
  }));
  el.querySelectorAll("[data-new]").forEach((c) => (c.onclick = () => { setSlot(+c.dataset.new); create(); }));
  el.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => {
    const n = +b.dataset.del, d = loadSlot(n);
    if (!confirm(`슬롯 ${n + 1}의 ${d?.player?.name ?? ""} 생애를 지울까요? (혈통 경험치는 보존)`)) return;
    if (d) { S.bankLegacy(d, G.acc); saveAccount(G.acc); }
    deleteSlot(n); if (/[?&]debug\b/.test(location.search)) window.__G = G; // 테스트용
title();
  }));
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

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
    if (G.hasGL) { preloadHeroes(sel.gender); } if (G.hasGL) mountViewer(el.querySelector("#pv"), () => ({ look, equip: startEq, gender: sel.gender }), { spin: true });
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
  G.regions = Reg.buildRegions(st.seed, st.geo?.biome || "temperate");
  const R0 = Reg.regionState(st);
  if (!G.regions.some((r) => r.id === R0.cur)) R0.cur = 0;
  loadRegion(R0.cur);
  if (G.hasGL && G.st?.player) preloadHeroes(G.st.player.gender || "M"); // 이야기 장면용 3D 모델(내 성별만)
  G.r3d?.setWorld(G.world);
  G.mobs = []; G.shots = []; G.fx = []; G.trail = []; G.drops = []; G.specCd = 0;
  G.paused = 0;
  st.passActive = passActive(G.acc);
  if (st.player.x == null || !st.player.x) respawnAtBase();
  document.getElementById("hud").hidden = false;
  document.getElementById("controls").hidden = false;
  if (!isNew && st.lastSaved) {
    const off = S.applyOffline(st, Date.now() - st.lastSaved, Meta.vipPerk(G.acc).offH || 0);
    if (off && off.gameDays > 0) UI.toast(`쉬는 동안 ${off.gameDays}일이 지났습니다. 기지는 계속 돌아갔습니다.`, "good");
  }
  const g = claimPassDaily(G.acc);
  if (g) UI.toast(`월정액 보상 💎${g}`, "good");
  if (st.__tampered) UI.toast("저장 데이터 변조가 감지되어 온라인 경쟁 기능이 제한됩니다", "bad");
  UI.renderHud();
  if (st.tut === undefined) st.tut = isNew ? 0 : 99; // 옛 세이브는 튜토리얼 생략
  G.applySettings();
  if (isNew) {
    await UI.cinematic(CHAPTERS[0].title, CHAPTERS[0].text, { palette: ["#0e0e14", "#3a2e2e", "#d0753a"], voice: "assets/voice/ch0.mp3" });
    await UI.spawnReveal();
  }
  G.tutStart = { x: st.player.x, y: st.player.y };
  G.save();
  if (!G.running) { G.running = true; requestAnimationFrame(frame); }
}

// ================= 지역(끝없는 탐험) =================
// 지역마다 지형을 시드로 새로 만든다(저장은 다리·안개·미션 진행만). entry: 들어온 방향(반대편 가장자리에 선다)
function loadRegion(rid, entry = null) {
  const st = G.st, RS = Reg.regionState(st);
  if (G.siteOuter) { G.world = G.siteOuter.world; G.fog = G.siteOuter.fog; G.siteOuter = null; } // 건물 안에서 이동하면 먼저 밖으로
  if (G.fog && G.world) Reg.rs(st, G.world.rid).fog = Reg.fogSave(G.fog); // 떠나는 지역의 안개 저장
  const reg = G.regions.find((r) => r.id === rid) || G.regions[0];
  RS.cur = reg.id;
  const home = reg.id === 0;
  G.world = generateWorld(home ? st.seed : (st.seed ^ (reg.id * 0x9e3779b1)) >>> 0, home ? st.geo?.biome || "temperate" : reg.biome, { home, rid: reg.id, tier: reg.tier, theme: Reg.THEMES[reg.theme] });
  G.world.region = reg;
  G.world.sites = Sites.placeSites(G.world, reg.theme, (st.seed ^ (reg.id * 7919)) >>> 0);
  applyBridges(G.world, RS.bridges[reg.id]);
  G.fog = Reg.fogLoad(Reg.rs(st, reg.id).fog, WORLD_W * WORLD_H); G.fogPctV = Reg.fogPct(G.fog);
  R.clearTerrainCache(); miniCache = null;
  G.r3d?.setWorld(G.world);
  G.mobs = []; G.shots = []; G.drops = [];
  if (entry) {
    const p = st.player, m = 4 * TILE;
    if (entry === "동") { p.x = m; p.y = (G.world.cy + 0.5) * TILE; }
    if (entry === "서") { p.x = (WORLD_W * TILE) - m; p.y = (G.world.cy + 0.5) * TILE; }
    if (entry === "남") { p.y = m; p.x = (G.world.cx + 0.5) * TILE; }
    if (entry === "북") { p.y = (WORLD_H * TILE) - m; p.x = (G.world.cx + 0.5) * TILE; }
  }
  G.lastRevealT = -1;
}
G.loadRegion = loadRegion;
S.setOverflowHook((id, n) => { if (G.st && G.drops) { const p = G.st.player; dropItem(p.x + (Math.random() - 0.5) * 20, p.y + 10, id, n); if (G.t - (G.fullToastT || -9) > 4) { G.fullToastT = G.t; UI.toast("🎒 가방이 가득 차 발밑에 떨어뜨렸습니다", "warn"); } } else return false; });
// 가장자리로 걸어가면: 열린 이웃이면 넘어가고, 잠겨 있으면 무슨 미션을 깨야 하는지 알려 주고 막는다
function edgeCheck() {
  if (G.world.site) return;
  const p = G.st.player, W = WORLD_W * TILE, H = WORLD_H * TILE, e = TILE * 1.2;
  const dir = p.x < e ? "서" : p.x > W - e ? "동" : p.y < e ? "북" : p.y > H - e ? "남" : null;
  if (!dir) return;
  const reg = G.world.region, to = reg.links[dir];
  const back = () => { p.x = Math.max(e + 4, Math.min(W - e - 4, p.x)); p.y = Math.max(e + 4, Math.min(H - e - 4, p.y)); };
  if (to === undefined) { back(); if (G.t - (G.edgeToastT || -9) > 3) { G.edgeToastT = G.t; UI.toast(`${dir}쪽은 끝없는 잿빛 바다… 다른 방향을 찾아보자`); } return; }
  if (!Reg.isUnlocked(G.st, G.regions, to)) {
    back();
    if (G.t - (G.edgeToastT || -9) > 3) { G.edgeToastT = G.t; UI.toast(`🔒 ${G.regions.find((r) => r.id === to).name} — ${Reg.lockReason(G.st, G.regions, to)}`, "warn"); }
    return;
  }
  const opp = { 동: "동", 서: "서", 남: "남", 북: "북" }[dir]; // 들어간 방향 = 새 지역에서 반대편 가장자리에 선다
  loadRegion(to, opp);
  const nr = G.world.region;
  UI.toast(`🧭 ${nr.name} (위험도 ${"★".repeat(Math.min(5, nr.tier))})${Reg.missionDone(G.st, G.regions, nr.id) ? "" : " · 미션: " + Reg.missionText(nr)}`, "good");
  G.save();
}

// 지역 미션 완료 → 이웃 지역이 열린다(탐험 범위 확장)
function regionCleared() {
  const st = G.st, reg = G.world.region;
  const opened = Object.values(reg.links).map((o) => G.regions.find((r) => r.id === o)).filter(Boolean);
  S.gainXp(st, 60 + reg.tier * 40); st.gold += 40 + reg.tier * 30;
  Sfx.play("levelup");
  UI.toast(`🏁 「${reg.name}」 미션 완료! 새 길이 열렸다: ${opened.map((r) => r.name).join(", ")}`, "good");
  G.save();
}
// 고향 미션(이야기 2장)은 이야기 진행 때 확인
G.checkHomeMission = () => { if (G.st.story.chapter >= 2 && !G.st.regions?.s?.[0]?.done) { Reg.rs(G.st, 0).done = true; UI.toast("🗺️ 주변 지역으로 가는 길이 열렸다! [M] 지역 지도", "good"); } };

function respawnAtBase() {
  if (G.world?.rid || G.world?.site) loadRegion(0); // 고향 기지로(건물 안이었어도 밖으로)
  G.st.player.x = (G.world.cx + 0.5) * TILE;
  G.st.player.y = (G.world.cy + 2.5) * TILE;
}
G.respawnAtBase = respawnAtBase;
// 부활: 쓰러진 자리에서(체력 절반) — 주변 적은 조금 밀려나고 2초간 무적
G.reviveHere = () => {
  const p = G.st.player;
  for (const m of G.mobs) { const d = Math.hypot(m.x - p.x, m.y - p.y) || 1; if (d < 220 && m.kind === "enemy") { const nx = m.x + ((m.x - p.x) / d) * 160, ny = m.y + ((m.y - p.y) / d) * 160; if (!isBlocked(G.world, nx, ny)) { m.x = nx; m.y = ny; } m.cd = 2; m.windup = 0; m.burst = 0; } }
  G.shots = G.shots.filter((s) => !s.foe);
  G.iframe = 2; G.stamina = 50;
  UI.toast("💫 그 자리에서 다시 일어났다 (체력 절반)", "good");
};
// 사건 인물이 필드에도 잠시 나타난다
G.eventNpcs = [];
G.showEventNpcs = (pic) => { const p = G.st.player; G.eventNpcs = pic.who.map((w, i) => ({ ...w, x: p.x + 46 + i * 26, y: p.y + 6, until: G.t + 25 })); if (pic.animal) G.eventNpcs.push({ animal: pic.animal, x: p.x + 46 + pic.who.length * 26, y: p.y + 10, until: G.t + 25 }); };
UI.setAnimalDrawer((g, type, x, y, ph, mv, f) => R.drawAnimal(g, type, x, y, ph, mv, f));

G.newLife = () => {
  deleteGame();
  document.querySelectorAll(".modal-bg,.cine,.mg").forEach((e) => e.remove());
  G.paused = 0;
  G.st = null;
  create();
};

G.save = () => {
  if (!G.st) return;
  (G.acc.maxDays ||= {})[G.st.player.job] = Math.max(G.acc.maxDays[G.st.player.job] || 0, S.day(G.st)); // 직업별 최대 생존 기록(유물 칸 해금)
  const outer = G.siteOuter;
  if (G.world) Reg.rs(G.st, G.world.rid).fog = Reg.fogSave(outer ? outer.fog : G.fog);
  if (outer) { const p = G.st.player, sx = p.x, sy = p.y; p.x = outer.x; p.y = outer.y + TILE; S.flushLegacy(G.st, G.acc); if (!G.st.ended) saveGame(G.st); saveAccount(G.acc); p.x = sx; p.y = sy; G.lastSave = performance.now(); return; }
  S.flushLegacy(G.st, G.acc);
  if (!G.st.ended) saveGame(G.st);
  saveAccount(G.acc);
  G.lastSave = performance.now();
  if (Sync.loggedIn()) { Sync.markDirty(); Sync.push(G.st, G.acc).catch(() => {}); } // 10분 간격·바뀐 경우만
};
const flushSync = () => { G.save(); if (G.st && Sync.loggedIn() && Sync.state().dirty) Sync.push(G.st, G.acc, { force: true, keepalive: true }).catch(() => {}); };
addEventListener("visibilitychange", () => { if (document.hidden) flushSync(); });
addEventListener("pagehide", flushSync);

// 설정 적용: 그래픽(픽셀/고화질)·소리·조이스틱 위치
G.applySettings = () => {
  const s = G.acc.settings;
  Sfx.setEnabled(s.sound !== false);
  Bgm.setEnabled(s.music !== false);
  G.r3d?.setPixel(s.gfx === "pixel");
  document.body.classList.toggle("joy-right", !!s.joyRight);
  saveAccount(G.acc);
};

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

// 잠자기: 체력은 잠을 자야만 회복된다. kind: bed(침대, 기지) · bag(침낭) · ground(맨땅)
// 기지 밖에서 자면 짐승·약탈자에게 습격당할 수 있다(침낭이 맨땅보다 덜 위험)
G.sleep = (kind = "bed") => {
  const st = G.st;
  const outside = !G.atBase && !(G.world.site && Sites.SITES[G.world.site.kind].safe);
  const mul = { bed: 1, bag: 0.7, ground: 0.4 }[kind] ?? 0.4;
  const risk = outside ? (kind === "bag" ? 0.18 : 0.32) * (S.isNight(st) ? 1.3 : 1) : 0;
  const h = S.hourOf(st);
  const mins = ((24 + 6 - h) % 24 || 24) * 60 - (st.time.min % 60);
  const hp0 = st.player.hp;
  let ambushed = false;
  for (let m = 0; m < mins; m += 30) {
    const evs = S.tick(st, 30, { atBase: !outside, nearFire: !outside && S.hasBuilding(st, "campfire"), sleeping: true, sleepMul: mul });
    if (handleEvents(evs)) break;
    if (risk && !ambushed && Math.random() < risk / (mins / 30)) { ambushed = true; break; }
  }
  if (ambushed) {
    // 자다가 습격: 피해를 입고 깨어나며, 근처에 적이 나타난다
    S.damagePlayer(st, 8 + st.story.chapter * 2);
    const p = st.player, a = Math.random() * Math.PI * 2;
    G.mobs.push(mobAt(S.isNight(st) ? "mutant" : "feral_dog", "enemy", p.x + Math.cos(a) * 90, p.y + Math.sin(a) * 90));
    UI.toast("⚠️ 자다가 습격당했다! 일어나 싸우세요", "bad");
  } else UI.toast(`아침이 밝았습니다 ☀️ 체력 +${Math.max(0, Math.round(st.player.hp - hp0))}`, "good");
  G.afterAction();
};

// ================= 입력 =================
const keys = new Set();
addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || document.querySelector(".mg")) return;
  const k = e.key.toLowerCase();
  keys.add(k);
  if (G.st && !G.paused && G.placing) { if (k === "e" || k === " " || k === "enter") { e.preventDefault(); placeConfirm(); return; } if (k === "escape") { placeCancel(); return; } }
  if (G.st && !G.paused) {
    if (k === "e" || k === " ") { G.input.action = true; e.preventDefault(); }
    if (k === "shift" || k === "q") dodge();
    if (k === "i" || k === "b") UI.openBag();
    if (k === "c") UI.openCraft();
    if (k === "m") UI.openRegionMap();
    if (k === "=" || k === "+") G.setZoom((G.zoom || 1.7) + 0.2);
    if (k === "-" || k === "_") G.setZoom((G.zoom || 1.7) - 0.2);
    if (k === "r") G.throwNow();
    if (k === "x") G.toggleSneak();
    if (k === "f") G.special();
    if (k === "t") { const a = S.cycleArrow(G.st); if (a) UI.toast(`화살: ${ITEMS[a].name}`); UI.renderHud(); }
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
document.getElementById("dodge").addEventListener("pointerdown", (e) => { e.preventDefault(); dodge(); });
G.toggleSneak = () => { G.sneak = !G.sneak; document.getElementById("sneakBtn")?.classList.toggle("on", G.sneak); UI.toast(G.sneak ? "🥷 숨어 걷기: 느리지만 적이 잘 못 알아챈다. 알아채지 못한 적을 치면 기습(2.5배)" : "숨어 걷기 해제"); };
document.getElementById("sneakBtn").addEventListener("pointerdown", (e) => { e.preventDefault(); G.toggleSneak(); });
document.getElementById("throwBtn").addEventListener("pointerdown", (e) => { e.preventDefault(); G.throwNow(); });
document.getElementById("specBtn").addEventListener("pointerdown", (e) => { e.preventDefault(); G.special(); });
document.getElementById("ammoBox").addEventListener("pointerdown", (e) => { e.preventDefault(); const a = S.cycleArrow(G.st); if (a) UI.toast(`화살: ${ITEMS[a].name}`); UI.renderHud(); });
// 메뉴/행동 버튼 아이콘을 통일된 SVG 세트로
const MENU_IC = { bag: "ui.bag", craft: "ui.craft", base: "ui.base", people: "ui.people", animals: "ui.animals", story: "ui.story", olympics: "ui.olympics", shop: "ui.shop", menu: "ui.menu" };
document.querySelectorAll("[data-open]").forEach((b) => { const lab = b.querySelector("span").outerHTML; b.innerHTML = Ic.icon(MENU_IC[b.dataset.open], 34) + lab; });
const PC = matchMedia("(hover: hover) and (pointer: fine)").matches;
document.getElementById("dodge").innerHTML = `🌀<span>구르기${PC ? " (Shift)" : ""}</span>`;
document.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => {
  if (!G.st || G.paused) return;
  if (b.dataset.lock) { UI.toast("🔒 " + b.dataset.lock, "warn"); return; }
  ({ bag: UI.openBag, craft: UI.openCraft, base: () => UI.openBase(), people: UI.openPeople, animals: UI.openAnimals, story: UI.openStory, olympics: UI.openOlympics, shop: UI.openShop, menu: UI.openMenu })[b.dataset.open]();
}));

// ================= 필드 엔티티 =================
function mobAt(type, kind, x, y) {
  const def = kind === "enemy" ? ENEMIES[type] : ANIMALS[type];
  const hp = Math.round(def.hp * (kind === "enemy" ? S.diff(G.st).enemy : 1));
  const m = { kind, type, x, y, vx: 0, vy: 0, hp, maxHp: hp, cd: 1, phase: Math.random() * 6, wander: 0, facing: 1 };
  // 정예 몬스터: 밤·후반 장일수록 자주. 체력 2.5배·공격 1.5배·전리품과 경험치 3배
  if (kind === "enemy" && Math.random() < 0.05 + (S.isNight(G.st) ? 0.05 : 0) + G.st.story.chapter * 0.006) { m.elite = true; m.hp = m.maxHp = Math.round(hp * 2.5); }
  return m;
}

function spawnMobs(dt) {
  G.spawnT -= dt;
  if (G.spawnT > 0) return;
  G.spawnT = 1.2;
  if (G.world.site) return; // 건물 안: 정해진 적만
  const st = G.st, p = st.player;
  // 멀어진 것 제거
  G.mobs = G.mobs.filter((m) => Math.hypot(m.x - p.x, m.y - p.y) < 1400);
  const cap = 10 + st.story.chapter;
  if (G.mobs.length >= cap) return;
  const a = Math.random() * Math.PI * 2, d = 520 + Math.random() * 380;
  const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
  if (x < TILE * 3 || y < TILE * 3 || x > (WORLD_W - 3) * TILE || y > (WORLD_H - 3) * TILE || isBlocked(G.world, x, y)) return;
  // 기지 안에는 생성 안 함(고향만)
  if (G.world.home && Math.hypot(x - (G.world.cx + 0.5) * TILE, y - (G.world.cy + 0.5) * TILE) < 10 * TILE) return;
  const t = tileAt(G.world, x, y);
  const night = S.isNight(st);
  const ch = st.story.chapter;
  const poiR = (id) => { const q = G.world.pois[id]; return !!q && Math.hypot(x - q.tx * TILE, y - q.ty * TILE) < 14 * TILE; };
  let pick;
  if (poiR("ash_fortress")) pick = ["enemy", ch >= 9 ? "ash_knight" : "raider"];
  else if (poiR("raider_camp")) pick = ["enemy", "raider"];
  else if (t === T.RAD) pick = ["enemy", Math.random() < 0.5 ? "mutant" : "rad_rat"];
  else if (night && Math.random() < 0.55) pick = ["enemy", Math.random() < 0.6 ? "mutant" : "feral_dog"];
  else if (G.world.rid && G.world.region.tier >= 2 && Math.random() < 0.12 + G.world.region.tier * 0.03) pick = ["enemy", G.world.region.tier >= 4 && Math.random() < 0.3 ? "ash_knight" : "raider"]; // 먼 지역일수록 약탈자 무리
  else if (t === T.RUIN) pick = Math.random() < 0.5 ? ["enemy", "rad_rat"] : Math.random() < 0.5 + ch * 0.03 ? ["enemy", "raider"] : ["animal", "dog"];
  else if (t === T.GRASS || t === T.SAND || t === T.SNOW || Math.random() < 0.5) {
    // 지역 야생동물: 그 땅에 사는 동물만 나타난다(사막엔 염소·개, 툰드라엔 늑대·사슴…)
    const list = (BIOMES[G.world.biome] || BIOMES.temperate).animals.filter((a) => ch >= 3 || a !== "wolf");
    pick = ["animal", list[Math.floor(Math.random() * list.length)]];
  } else pick = ["enemy", Math.random() < 0.6 ? "rad_rat" : "feral_dog"];
  if (pick[1] === "raider" && ch < 2) pick = ["enemy", "rad_rat"];
  const mob = mobAt(pick[1], pick[0], x, y);
  // 동물은 무리로 나타난다(사슴 2~4, 닭 3~5, 늑대 2~4 …)
  if (mob.kind === "animal") {
    const n = AAI.herdSize(mob.type), hid = "h" + Math.random().toString(36).slice(2, 7);
    mob.herd = hid;
    for (let i = 1; i < n && G.mobs.length < cap + 4; i++) { const ox = x + (Math.random() - 0.5) * 90, oy = y + (Math.random() - 0.5) * 90; if (!isBlocked(G.world, ox, oy)) { const o = mobAt(pick[1], "animal", ox, oy); o.herd = hid; G.mobs.push(o); } }
  }
  // 먼 지역(단계)일수록 적이 강하다
  if (mob.kind === "enemy" && G.world.rid) { const k = 1 + G.world.region.tier * 0.3; mob.hp = mob.maxHp = Math.round(mob.hp * k); mob.atkMul = k; }
  G.mobs.push(mob);
}

function updateMobs(dt) {
  const st = G.st, p = st.player;
  const baseX = (G.world.cx + 0.5) * TILE, baseY = (G.world.cy + 0.5) * TILE;
  const followers = st.companions.filter((c) => c.task === "follow" && S.isAdult(c)).length + st.animals.filter((a) => a.task === "follow").length;
  // 서로 밀어내기(겹쳐 서지 않음)
  for (let i = 0; i < G.mobs.length; i++) for (let j = i + 1; j < G.mobs.length; j++) {
    const a = G.mobs[i], b = G.mobs[j], ddx = b.x - a.x, ddy = b.y - a.y, dd = Math.hypot(ddx, ddy);
    if (dd > 0 && dd < 26) { const k = (26 - dd) / 2 / dd; if (!isBlocked(G.world, a.x - ddx * k, a.y - ddy * k)) { a.x -= ddx * k; a.y -= ddy * k; } if (!isBlocked(G.world, b.x + ddx * k, b.y + ddy * k)) { b.x += ddx * k; b.y += ddy * k; } }
  }
  // 무리(herd) 정보: 중심·공황·공격 여부
  const herds = {};
  for (const m of G.mobs) if (m.herd) { const h = (herds[m.herd] ||= { x: 0, y: 0, n: 0, panic: false, aggro: false }); h.x += m.x; h.y += m.y; h.n++; if (m.state === "flee" && m.hp > 0) h.panic = true; if (m.state === "attack" || m.state === "charge") h.aggro = true; }
  const night = S.isNight(st);
  for (const m of G.mobs) {
    const dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy) || 1;
    m.phase += dt * 8;
    let sp = 0, tx = 0, ty = 0, hostile;
    let ai = null;
    if (m.kind === "animal") {
      if (m.hurtT > 0) m.hurtT -= dt;
      const h = m.herd && herds[m.herd];
      ai = AAI.stepAnimal(m, { d: d * (G.sneak ? 2 : 1), dx, dy, dt, night, hurt: m.hurtT > 0, herdPanic: h?.panic, packAggro: h?.aggro && d < 300, bait: S.count(st.inv, ANIMALS[m.type].food) > 0, herdDx: h && h.n > 1 ? h.x / h.n - m.x : undefined, herdDy: h && h.n > 1 ? h.y / h.n - m.y : undefined });
      hostile = ai.hostile || (m.aggro && m.state === "attack");
      m.emote = ai.emote;
    } else hostile = !(m.calm && !m.aggro && d > 70);
    // 기지 안으로는 들어오지 않음(성벽)
    const inBase = Math.hypot(m.x - baseX, m.y - baseY) < (2 + st.base.lv) * TILE;
    const detect = (m.kind === "enemy" ? 260 : 200) * (G.sneak && !m.aware ? 0.45 : 1);
    if (hostile && d < detect && !G.atBase) {
      if (!m.aware) { m.aware = true; if (G.sneak) m.cd = Math.max(m.cd, 0.8); } // 들켰다
      const def = m.kind === "enemy" ? ENEMIES[m.type] : null;
      sp = def ? def.speed : ai.sp;
      tx = dx / d; ty = dy / d;
      m.cd -= dt;
      const atk = (def ? def.atk : ANIMALS[m.type].combat || 5) * (m.elite ? 1.5 : 1) * (m.atkMul || 1);
      if (def?.ranged) {
        // 총잡이: 거리를 150 안팎으로 유지하며 옆으로 돌고(가만히 서 있지 않음), 2~3발씩 불규칙하게 연사
        m.strafeT = (m.strafeT || 0) - dt;
        if (m.strafeT <= 0) { m.strafeT = 0.8 + Math.random() * 1.6; m.strafe = Math.random() < 0.5 ? -1 : 1; }
        const want = d > 210 ? 1 : d < 120 ? -1 : 0;
        tx = (dx / d) * want + (-dy / d) * m.strafe * 0.8; ty = (dy / d) * want + (dx / d) * m.strafe * 0.8;
        const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
        sp = def.speed * (want ? 1 : 0.6);
        if (m.burst > 0) {
          m.burstT -= dt;
          if (m.burstT <= 0) {
            m.burst--; m.burstT = 0.12 + Math.random() * 0.12;
            const a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.22; // 조금씩 빗나감
            G.shots.push({ x: m.x, y: m.y - 16, vx: Math.cos(a) * 280, vy: Math.sin(a) * 280, dmg: atk * 0.7, foe: true, life: 1.1 });
            Sfx.play("shoot");
          }
        } else if (m.windup > 0) { m.windup -= dt; sp *= 0.3; if (m.windup <= 0) { m.burst = 2 + (Math.random() < 0.5 ? 1 : 0); m.burstT = 0; } }
        else if (d < 260 && m.cd <= 0) { m.cd = 1.4 + Math.random() * 1.8; m.windup = 0.3; } // 다음 연사까지 1.4~3.2초(불규칙)
      } else {
        // 옆 칸(STAND)까지만 다가와 멈추고(겹치지 않음), 너무 붙으면 반 걸음 물러난다
        if (d <= STAND) { sp = d < STAND - 8 ? sp * 0.5 : 0; if (d < STAND - 8) { tx = -tx; ty = -ty; } }
        const reach = STAND + 14;
        // 공격 예고 0.45초(붉은 원) → 그때 아직 옆에 있으면 맞는다. 구르기·물러나기로 피할 수 있다. 공격은 1턴(1초)에 한 번
        if (m.windup > 0) { m.windup -= dt; sp = 0; if (m.windup <= 0 && d < reach + 6) hurtPlayer(atk); }
        else if (d < reach && m.cd <= 0) { m.cd = TURN; m.windup = 0.45; }
      }
    } else if (ai) { sp = ai.sp; tx = ai.tx; ty = ai.ty; }
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
  m.aggro = true; m.hurtT = 5; // 동물: 맞으면 5초간 도망(초식) 또는 반격(육식·방어형)
  m.hitFlash = true;
  fxText(m.x, m.y - 40, String(dmg), color);
  Sfx.play("hit");
  if (m.hp <= 0) {
    if (m.kind === "enemy" && Reg.addProgress(G.st, G.regions, "kill", 1)) regionCleared();
    if (m.kind === "enemy") Meta.addActivity(G.st, m.boss ? "boss" : "kill");
    if (m.boss && G.world.site) {
      const W = G.world.site, D = Sites.SITES[W.kind], ss = siteState(W.sid);
      ss.cleared = true;
      for (const [i, n] of D.reward) S.giveItem(G.st, i, n);
      Relics.relicState(G.acc).keys++; // 보스 → 구세계 금고 열쇠
      S.gainXp(G.st, 150 + (G.world.region?.tier || 0) * 60); G.st.gold += 120;
      UI.toast(`☢️ ${D.boss.name} 격파! ${D.reward.map(([i, n]) => ITEMS[i].name + " ×" + n).join(", ")} + 🗝️ 금고 열쇠`, "good");
      // 보스를 이기면 그 지역 미션도 완료 → 다음 지역이 열린다
      const rsx = Reg.rs(G.st, G.world.rid);
      if (G.world.rid && !rsx.done) { rsx.done = true; regionCleared(); }
    }
    if (m.kind === "enemy") {
      // 전리품은 바닥에 떨어진다 → 걸어가서 줍기
      const drops = S.onKill(G.st, m.type, makeRng(Date.now()), false);
      if (m.carry) drops.push(m.carry);
      if (m.elite) { S.gainXp(G.st, ENEMIES[m.type].xp * 2); for (let i = 0; i < 2; i++) drops.push(...S.onKill(G.st, m.type, makeRng(Date.now() + i + 1), false)); G.st.gold += 30; UI.toast("정예 처치! 전리품이 떨어졌다", "good"); }
      scatterDrops(m.x, m.y, drops.map((id) => [id, 1]));
    } else {
      const a = ANIMALS[m.type];
      const loot = [["raw_meat", a.meat], ["bone", 1]]; if (a.meat >= 3) loot.push(["leather", Math.ceil(a.meat / 3)]);
      scatterDrops(m.x, m.y, loot);
      S.gainXp(G.st, 10);
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
  if (best && best.guard && best.calm && best.carry && bd < 60 && !best.stealTried) {
    best.stealTried = true;
    const chance = Math.min(0.92, 0.2 + S.eff(st, "agi") * 0.05 + (G.sneak ? 0.2 : 0));
    UI.choice("👮 보안 담당자", `졸린 눈으로 경계를 서고 있다. 허리춤에 카드키가 보인다.`, [{ label: `🤏 몰래 빼앗기 (성공 ${Math.round(chance * 100)}%)`, value: "steal", cls: "primary" }, { label: "⚔️ 공격한다", value: "fight", cls: "danger" }], { closable: true }).then((v) => {
      if (v === "steal" && Math.random() < chance) { best.carry = null; best.leader = "👮"; S.giveItem(st, "keycard", 1); UI.toast("💳 카드키를 슬쩍했다!", "good"); }
      else if (v === "steal") { best.calm = false; best.aggro = true; best.atkMul = (best.atkMul || 1) * 1.3; UI.toast("들켰다! 담당자가 덤벼든다", "bad"); }
      else if (v === "fight") { best.calm = false; attack(best); }
      G.afterAction();
    });
    return;
  }
  if (best && bd < atk && G.attackCd <= 0 && (best.kind === "enemy" || best.aggro)) { best.calm = false; return attack(best); }
  if (best && bd < 56 && best.kind === "animal") return animalChoice(best);
  // 1.5) 건물: 입구/출구/계단/사건(자원보다 먼저)
  if (siteInteract()) return;
  // 2) 자원
  let node = null; bd = 1e9;
  for (const n of visibleNodes()) { const nx = (n.tx + 0.5) * TILE, ny = (n.ty + 0.5) * TILE; const d = Math.hypot(nx - p.x, ny - p.y); if (d < bd) { bd = d; node = n; } }
  if (node && bd < 50) return gatherNode(node);
  // 3) 장소
  for (const q of Object.values(G.world.pois)) if (Math.hypot((q.tx + 0.5) * TILE - p.x, (q.ty + 0.5) * TILE - p.y) < 2.5 * TILE) return visitPoi(q);
  // 4) 기지 중앙
  const cs = cookStationNear();
  if (cs) return UI.openCook(Math.max(BUILDINGS[cs.b.id].cookTier, 1) && S.cookTier(st));
  if (G.world.home && Math.hypot((G.world.cx + 0.5) * TILE - p.x, (G.world.cy + 0.5) * TILE - p.y) < 2.2 * TILE) return UI.openBase();
  // 5) 물
  // 바라보는 쪽이 깊은 물이고 나무가 있으면 다리를 놓을 수 있다
  const bt = bridgeTarget();
  if (bt != null && S.countAll(st, "wood") >= 4) {
    UI.choice("🌉 물가", "깊은 강은 건널 수 없습니다. 나무 4개로 한 칸씩 다리를 놓을 수 있습니다(땅이나 이미 놓은 다리에 이어서만).", [{ label: "🌉 다리 놓기 (위치 고르기)", value: "b", cls: "primary" }, { label: "🫗 물 뜨기 / 낚시", value: "w" }, { label: "취소", value: 0 }], { closable: true }).then((v) => {
      if (v === "b") G.startPlacing({ kind: "bridge" });
      else if (v === "w") waterAction();
    });
    return;
  }
  if (nearWater(G.world, p.x, p.y)) return waterAction();
  // 6) 근처 적이 있지만 사거리 밖
  if (best && bd < 120 && best.kind === "enemy") UI.toast("더 가까이 가세요");
}
// ---------- 건물 ----------
function nearTile(t, r = 1.3) {
  const p = G.st.player, tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
  for (let y = ty - 1; y <= ty + 1; y++) for (let x = tx - 1; x <= tx + 1; x++) if (G.world.tiles[y * WORLD_W + x] === t && Math.hypot((x + 0.5) * TILE - p.x, (y + 0.5) * TILE - p.y) < r * TILE) return true;
  return false;
}
function siteNear() {
  const p = G.st.player;
  return (G.world.sites || []).find((q) => Math.hypot((q.tx + 0.5) * TILE - p.x, (q.ty + 0.5) * TILE - p.y) < 2 * TILE);
}
function siteState(sid) { const st = G.st; st.sites ||= {}; return (st.sites[Sites.siteKey(G.world.rid, sid)] ||= { cleared: false, best: 0 }); }
function siteInteract() {
  const st = G.st, p = st.player;
  if (G.world.site) {
    const W = G.world.site;
    const ev = (G.world.events || []).find((e) => !e.done && Math.hypot((e.tx + 0.5) * TILE - p.x, (e.ty + 0.5) * TILE - p.y) < 1.6 * TILE);
    if (ev) { siteEvent(ev); return true; }
    const door = doorNear();
    if (door) { doorInteract(door); return true; }
    if (nearTile(T.EXIT)) { leaveSite(); return true; }
    if (nearTile(T.STAIRS)) { enterSite(W.sid, W.floor + 1); return true; }
    return false;
  }
  const q = siteNear();
  if (!q) return false;
  const D = Sites.SITES[q.kind], ss = siteState(q.id);
  UI.choice(`${D.icon} ${D.name}`, D.safe ? "튼튼한 지하 대피소. 안에서는 방사능 폭풍과 날씨를 피하고 안전하게 잘 수 있다." : `${D.under ? "지하" : ""}${D.floors}층. 폐허 곳곳에 물건이 남아 있지만, ${D.under ? "가장 깊은 곳" : "꼭대기"}에는 방사능 보스 <b>${D.boss.name}</b>가 산다.${ss.cleared ? '<br><span class="ok">✔ 보스 처치함 — 다시 들어가 남은 물건을 뒤질 수 있다</span>' : ""}`,
    [{ label: D.safe ? "🛖 들어가 피한다" : "🚪 들어간다", value: 1, cls: "primary" }, { label: "그만둔다", value: 0 }], { closable: true }).then((v) => { if (v) enterSite(q.id, 0); });
  return true;
}
// 건물 한 층으로 들어간다(필드와 같은 엔진, 정해진 적·보스)
function enterSite(sid, floor) {
  const st = G.st, p = st.player;
  const outer = G.world.site ? G.siteOuter : { world: G.world, x: p.x, y: p.y, fog: G.fog };
  const q = outer.world.sites.find((o) => o.id === sid);
  const D = Sites.SITES[q.kind];
  const seed = (st.seed ^ (outer.world.rid * 7919) ^ (sid * 104729)) >>> 0;
  const f = Sites.generateFloor(seed, q.kind, floor, { rid: outer.world.rid, sid });
  G.siteOuter = outer;
  G.world = { seed: seed + floor, tiles: f.tiles, nodes: f.nodes, pois: {}, cx: 64, cy: 64, biome: outer.world.biome, home: false, rid: outer.world.rid, region: outer.world.region, sites: [], events: f.events, doors: f.doors, site: { sid, kind: q.kind, floor, isTop: f.isTop, name: D.name } };
  G.fog = new Uint8Array(WORLD_W * WORLD_H); G.fogPctV = 0; G.lastRevealT = -1;
  R.clearTerrainCache(); miniCache = null; G.r3d?.setWorld(G.world);
  G.mobs = []; G.shots = []; G.drops = [];
  p.x = (f.entry.tx + 0.5) * TILE; p.y = (f.entry.ty + 0.5) * TILE;
  const tier = outer.world.region?.tier || 0, k = 1 + tier * 0.25 + floor * 0.12;
  for (const sp of f.spawns) for (let i = 0; i < sp.n; i++) {
    const m = mobAt(sp.type, "enemy", (sp.tx + 0.5 + i) * TILE, (sp.ty + 0.5) * TILE); m.hp = m.maxHp = Math.round(m.hp * k); m.atkMul = k; m.aggro = false;
    if (sp.guard) { m.guard = true; m.carry = "keycard"; m.leader = "👮 보안 담당자"; m.calm = true; }
    G.mobs.push(m);
  }
  // 열쇠 문: 이 층의 적 하나가 열쇠를 지닌다(머리 위에 🗝️ 표시)
  if (f.doors.some((d) => d.kind === "key")) { const c = G.mobs.filter((m) => !m.guard); const m = c[Math.floor(Math.random() * c.length)]; if (m) { m.carry = "rusty_key"; m.leader = "🗝️"; } else f.doors.forEach((d) => d.kind === "key" && (d.kind = "wood")); }
  const ss = siteState(sid);
  const hk = !D.safe && floor === 0 ? S.heroineFor(st, q.kind) : null;
  if (hk && Math.random() < 0.55) { const r = f.events.length ? f.events[0] : null; G.world.events.push({ kind: "heroine", key: hk, tx: (r ? r.tx : f.entry.tx + 3), ty: (r ? r.ty + 2 : f.entry.ty) }); }
  if (f.boss && !ss.cleared) {
    const b = mobAt(q.kind === "airport" ? "ash_knight" : "mutant", "enemy", (f.boss.tx + 0.5) * TILE, (f.boss.ty + 0.5) * TILE);
    const bk = 1 + tier * 0.3 + st.story.chapter * 0.06;
    b.hp = b.maxHp = Math.round(D.boss.hp * bk * S.diff(st).enemy); b.atkMul = (D.boss.atk / ENEMIES[b.type].atk) * bk; b.boss = true; b.elite = true; b.leader = "☢️ " + D.boss.name; b.scale = 1.6;
    G.mobs.push(b);
  }
  ss.best = Math.max(ss.best, floor + 1);
  Meta.addActivity(st, "site");
  UI.toast(`${D.icon} ${D.name} ${D.under ? "지하 " + (floor + 1) + "층" : floor + 1 + "층"}${f.isTop && !D.safe ? (ss.cleared ? "" : " — 보스가 있다!") : ""}`, f.isTop && !ss.cleared && !D.safe ? "warn" : "good");
}
// ---------- 잠긴 문 ----------
function doorNear() {
  const p = G.st.player, tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
  return (G.world.doors || []).find((d) => !d.open && d.tiles.some((i) => Math.abs((i % WORLD_W) - tx) <= 1 && Math.abs(Math.floor(i / WORLD_W) - ty) <= 1));
}
function openDoor(d, msg) {
  d.open = true; for (const i of d.tiles) G.world.tiles[i] = T.FLOOR;
  R.clearTerrainCache(); miniCache = null; G.r3d?.setWorld(G.world);
  Sfx.play("build"); UI.toast("🚪 " + msg, "good");
}
function doorInteract(d) {
  const st = G.st;
  if (d.kind === "wood") {
    // 부수기: 도끼·망치·곡괭이면 3번, 맨손이면 8번 정도. 시끄러워서 근처 적이 몰려온다
    const tool = ITEMS[st.player.equip.hand?.id]?.tool;
    d.prog += tool && (tool.wood || tool.stone || tool.scrap) ? 0.34 : 0.13;
    G.swing = 0.25; G.swingStart = true; G.attackCd = 0.4; Sfx.play("chop");
    for (const m of G.mobs) if (m.kind === "enemy" && Math.hypot(m.x - st.player.x, m.y - st.player.y) < 420) m.aggro = true;
    fxText(st.player.x, st.player.y - 50, `쾅! ${Math.min(100, Math.round(d.prog * 100))}%`, "#ffd36b");
    if (d.prog >= 1) openDoor(d, "문을 부쉈다!");
    else if (!d.warned) { d.warned = true; UI.toast(tool ? "문을 부수는 중… (소리에 적이 몰려온다)" : "맨손으로는 오래 걸린다 — 도끼·망치가 있으면 빠르다", "warn"); }
    return;
  }
  if (d.kind === "key") { if (S.count(st.inv, "rusty_key")) { S.removeFrom(st.inv, "rusty_key", 1); openDoor(d, "녹슨 열쇠로 문을 열었다"); } else UI.toast("🔒 잠겨 있다. 녹슨 열쇠가 필요하다 — 🗝️ 표시가 붙은 적이 갖고 있다", "warn"); return; }
  if (d.kind === "card") { if (S.count(st.inv, "keycard")) { S.removeFrom(st.inv, "keycard", 1); openDoor(d, "카드키를 대자 보안문이 열렸다"); } else UI.toast("💳 보안문. 카드키가 필요하다 — 👮 보안 담당자가 갖고 있다(쓰러뜨리거나 몰래 빼앗기)", "warn"); return; }
  if (d.kind === "code") {
    UI.askCode(`🔢 비밀번호 잠금장치${G.world.noteSeen ? " (쪽지에서 본 번호를 떠올려 보자)" : " — 어딘가에 비밀번호 쪽지가 있을지도"}`, d.tries).then((v) => {
      if (v == null) return;
      if (v === d.code) openDoor(d, "삑— 비밀번호가 맞았다!");
      else {
        d.tries++; Sfx.play("bad");
        if (d.tries >= 3) { d.tries = 0; UI.toast("🚨 경보! 경비들이 몰려온다", "bad"); const p = G.st.player; for (let i = 0; i < 2; i++) { const m = mobAt("raider", "enemy", p.x + (i ? 120 : -120), p.y + 40); if (!isBlocked(G.world, m.x, m.y)) { m.aggro = true; G.mobs.push(m); } } }
        else UI.toast(`틀렸다 (${d.tries}/3 — 3번 틀리면 경보)`, "warn");
      }
    });
  }
}

function leaveSite() {
  const o = G.siteOuter; if (!o) return;
  G.world = o.world; G.fog = o.fog; G.fogPctV = Reg.fogPct(G.fog); G.siteOuter = null;
  R.clearTerrainCache(); miniCache = null; G.r3d?.setWorld(G.world);
  G.mobs = []; G.shots = []; G.drops = [];
  G.st.player.x = o.x; G.st.player.y = o.y + TILE;
  UI.toast("밖으로 나왔다");
  G.save();
}
G.leaveSite = leaveSite;
// 건물 안 사건: 생존자 구조·일기·숨겨진 보급품·함정
function siteEvent(ev) {
  const st = G.st; ev.done = true;
  if (ev.kind === "note") { G.world.noteSeen = true; UI.choice("📝 구겨진 쪽지", `<div class="notepaper">"보안실 비번 바꿈. 잊지 말 것 —<br><b style="font-size:28px;letter-spacing:6px">${ev.code}</b>"</div><small class="muted">잘 기억해 두세요(문 앞에서 입력).</small>`, [{ label: "기억했다", value: 1, cls: "primary" }]); G.afterAction(); return; }
  if (ev.kind === "heroine") {
    const h = HEROINES[ev.key];
    UI.choice(`⭐ ${h.name} — ${h.title}`, `${h.art ? `<div class="heroface"><img src="${h.art}face_smile.png" alt=""><img src="${h.art}full_survivor.png" alt="" class="full"></div>` : ""}${h.bio}<br>특기 <b>${TALENTS[h.talent].name}</b>: ${TALENTS[h.talent].desc}<br><small class="muted">매력 ${h.req} 이상이면 마음을 연다 (내 매력 ${S.eff(st, "cha")})</small>`, [{ label: "함께 가자고 한다", value: 1, cls: "primary" }, { label: "그냥 지나간다", value: 0 }], { closable: true }).then((v) => {
      if (!v) { ev.done = false; return; }
      const r = S.recruitHeroine(st, ev.key);
      if (r.ok) UI.toast(`⭐ ${h.name}이(가) 동료가 되었다! (동료 메뉴에서 호감을 쌓으면 청혼할 수 있다)`, "good");
      else { UI.toast(r.why, "warn"); if (r.soft) ev.done = false; }
      G.afterAction();
    });
    return;
  }
  if (ev.kind === "survivor") {
    const sv = S.randomSurvivor(makeRng(Date.now()));
    UI.choice("🙋 갇힌 생존자", `무너진 방 안에 ${sv.name}(${sv.role ? "" : ""}${({ cook: "요리사", researcher: "연구자", doctor: "의사", soldier: "군인", jobless: "백수", politician: "정치인", engineer: "기술자", farmer: "농부", hunter: "사냥꾼" })[sv.role] || "생존자"})이(가) 갇혀 있다. 구해 줄까?`, [{ label: "구해서 기지로 데려간다", value: 1, cls: "primary" }, { label: "물과 음식만 주고 간다", value: 2 }], { closable: true }).then((v) => {
      if (v === 1) { const r = S.recruit(st, sv); UI.toast(r.ok ? `${sv.name} 합류!` : r.why, r.ok ? "good" : "bad"); if (r.ok) st.karma += 1; }
      if (v === 2) { st.karma += 1; S.gainXp(st, 20); UI.toast("고맙다는 말을 남기고 떠났다", "good"); }
      G.afterAction();
    });
  } else if (ev.kind === "diary") { S.gainXp(st, 35); UI.toast("📓 낡은 일기: \"그날 사이렌이 울렸을 때, 우리는 지하로 내려가지 않았다…\" (경험치 +35)"); }
  else if (ev.kind === "stash") { for (const [i, n] of [["canned_food", 2], ["bandage", 2], ["ammo", 6], ["bottle", 1]]) S.giveItem(st, i, n); UI.toast("📦 숨겨진 보급품을 찾았다!", "good"); }
  else if (ev.kind === "trap") { S.damagePlayer(st, 12); S.giveItem(st, "electronics", 2); UI.toast("💥 함정! 다쳤지만 전자부품을 챙겼다", "bad"); }
  G.afterAction();
}

// 기지의 불·화덕·주방 바로 옆인지
function cookStationNear() {
  if (!G.world.home) return null;
  const p = G.st.player;
  return R.baseLayout(G.st, G.world).out.find((o) => BUILDINGS[o.b.id]?.cookTier && Math.hypot(o.x - p.x, o.y - p.y) < 40) || null;
}
// ================= 배치 모드(건물 위치·다리) =================
// 목표 지점: PC 는 마우스, 폰은 캐릭터 앞(화면을 탭하면 그 자리)
G.mouse = null;
addEventListener("mousemove", (e) => { G.mouse = { x: e.clientX, y: e.clientY }; });
function screenToWorld(sx, sy) { const Z = G.zoom || 1.7; return { x: G.cam.x + sx / Z, y: G.cam.y + sy / Z }; }
G.startPlacing = (o) => {
  G.placing = { ...o, tap: null };
  const bar = document.getElementById("placeBar") || document.body.appendChild(Object.assign(document.createElement("div"), { id: "placeBar" }));
  bar.innerHTML = `<span>${o.kind === "bridge" ? "🌉 초록 칸에만 다리를 놓을 수 있습니다 (나무 4)" : `🏗️ ${BUILDINGS[o.id].name} 지을 자리를 고르세요 (초록=가능)`}</span><button class="btn primary" id="plOk">✔ 여기에</button><button class="btn" id="plNo">✖ 끝내기</button>`;
  bar.hidden = false;
  bar.querySelector("#plOk").onclick = () => placeConfirm();
  bar.querySelector("#plNo").onclick = () => placeCancel();
};
function placeCancel() { G.placing = null; const b = document.getElementById("placeBar"); if (b) b.hidden = true; }
function aimPoint() {
  const p = G.st.player;
  if (G.placing?.tap) return G.placing.tap;
  if (G.mouse && matchMedia("(hover: hover)").matches) return screenToWorld(G.mouse.x, G.mouse.y);
  return { x: p.x + Math.sin(G.moveYaw ?? 0) * 56, y: p.y + Math.cos(G.moveYaw ?? 0) * 56 };
}
// 다리를 놓을 수 있는 칸: 깊은 물·샛강 중 땅이나 다리에 붙어 있는 칸(플레이어 7칸 안)
function bridgeCells() {
  const p = G.st.player, tx0 = Math.floor(p.x / TILE), ty0 = Math.floor(p.y / TILE), out = [];
  const land = (t) => t !== T.WATER && t !== T.STREAM && t !== T.WALL && t !== undefined;
  for (let y = ty0 - 7; y <= ty0 + 7; y++) for (let x = tx0 - 7; x <= tx0 + 7; x++) {
    if (x < 1 || y < 1 || x >= WORLD_W - 1 || y >= WORLD_H - 1) continue;
    const t = G.world.tiles[y * WORLD_W + x];
    if (t !== T.WATER && t !== T.STREAM) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => land(G.world.tiles[(y + dy) * WORLD_W + x + dx]))) out.push(y * WORLD_W + x);
  }
  return out;
}
function placeTarget() {
  const a = aimPoint();
  if (G.placing.kind === "bridge") {
    const cells = bridgeCells(); let best = null, bd = 1e9;
    for (const i of cells) { const d = Math.hypot((i % WORLD_W + 0.5) * TILE - a.x, (Math.floor(i / WORLD_W) + 0.5) * TILE - a.y); if (d < bd) { bd = d; best = i; } }
    return { cells, cell: bd < TILE * 2.5 ? best : null };
  }
  const st = G.st, L = R.baseLayout(st, G.world);
  const dx = a.x - L.cx, dy = (a.y - L.cy) / 0.8, inWall = Math.hypot(dx, dy) < L.wallR * 0.9;
  const free = L.out.every((o) => Math.hypot(o.x - a.x, o.y - a.y) > 40) && Math.hypot(a.x - L.cx, a.y - L.cy) > 36 && !isBlocked(G.world, a.x, a.y);
  return { pos: a, ok: G.world.home && inWall && free };
}
function placeConfirm() {
  const st = G.st, pl = G.placing; if (!pl) return;
  const t = placeTarget();
  if (pl.kind === "bridge") {
    if (t.cell == null) return UI.toast("초록 칸(땅·다리에 붙은 물)을 고르세요", "warn");
    if (!S.pay(st, { wood: 4 })) { placeCancel(); return UI.toast("나무가 부족합니다 (4개)", "bad"); }
    const RS = Reg.regionState(st); (RS.bridges[G.world.rid] ||= []).push(t.cell); applyBridges(G.world, [t.cell]);
    R.clearTerrainCache(); miniCache = null; G.r3d?.setWorld(G.world); Sfx.play("craft"); G.placing.tap = null;
    UI.toast(`다리 한 칸! (나무 ${S.countAll(st, "wood")} 남음)`, "good"); G.save();
    if (S.countAll(st, "wood") < 4) placeCancel();
    return;
  }
  if (!t.ok) return UI.toast("기지 성벽 안, 다른 시설과 겹치지 않는 곳을 고르세요", "warn");
  const r = S.build(st, pl.id, t.pos);
  Sfx.play(r.ok ? "build" : "bad"); UI.toast(r.ok ? `${BUILDINGS[pl.id].name} 건설 완료!` : r.why, r.ok ? "good" : "bad");
  placeCancel(); G.afterAction(); G.save();
}
// 배치 모드 그리기(월드 좌표, 줌 안에서)
function drawPlacing(cam) {
  const pl = G.placing; if (!pl) return;
  const t = placeTarget();
  if (pl.kind === "bridge") {
    for (const i of t.cells) { ctx.fillStyle = i === t.cell ? "rgba(120,255,120,.55)" : "rgba(120,255,120,.2)"; ctx.fillRect((i % WORLD_W) * TILE - cam.x + 2, Math.floor(i / WORLD_W) * TILE - cam.y + 2, TILE - 4, TILE - 4); }
    if (t.cell != null) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.strokeRect((t.cell % WORLD_W) * TILE - cam.x + 1, Math.floor(t.cell / WORLD_W) * TILE - cam.y + 1, TILE - 2, TILE - 2); }
    return;
  }
  const L = R.baseLayout(G.st, G.world);
  ctx.strokeStyle = "rgba(120,255,120,.35)"; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.ellipse(L.cx - cam.x, L.cy - cam.y, L.wallR * 0.9, L.wallR * 0.72, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  ctx.globalAlpha = 0.75; ctx.fillStyle = t.ok ? "rgba(90,220,90,.35)" : "rgba(230,70,60,.4)";
  ctx.beginPath(); ctx.ellipse(t.pos.x - cam.x, t.pos.y - cam.y + 10, 22, 10, 0, 0, Math.PI * 2); ctx.fill();
  R.emoji(ctx, BUILDINGS[pl.id].icon, t.pos.x - cam.x, t.pos.y - cam.y - 6, 34); ctx.globalAlpha = 1;
}
// 적을 클릭/탭하면 그 적을 공격(사거리 밖이면 알림). 쿨타임 중이면 턴이 오자마자 친다
addEventListener("pointerdown", (e) => {
  if (G.placing || !G.st || G.paused || e.target.closest("button,.modal-bg,#menu,#joy,#hud,#placeBar,#ammoBox,#zoomBox")) return;
  const w = screenToWorld(e.clientX, e.clientY), p = G.st.player;
  let m = null, bd = 30;
  for (const o of G.mobs) { if (o.hp <= 0) continue; const d = Math.hypot(o.x - w.x, o.y - 14 - w.y); if (d < bd) { bd = d; m = o; } }
  if (!m) return;
  const hand = p.equip.hand && ITEMS[p.equip.hand.id];
  const range = hand?.ranged && (hand.ranged === "arrow" ? S.quiverCount(G.st) + S.ARROW_IDS().reduce((a, k) => a + S.count(G.st.inv, k), 0) : S.count(G.st.inv, hand.ranged)) > 0 ? 230 : STAND + 18;
  if (Math.hypot(m.x - p.x, m.y - p.y) > range) return UI.toast(hand?.ranged ? "사거리 밖입니다" : "옆 칸까지 다가가세요");
  if (m.kind === "animal" && !m.aggro && !m.hurtT) return animalChoice(m);
  G.queued = m;
});

// 탭/클릭: 배치 모드면 위치 지정(PC 는 바로 확정)
addEventListener("pointerdown", (e) => {
  if (!G.placing || e.target.closest("button,.modal-bg,#placeBar,#menu,#joy")) return;
  G.placing.tap = screenToWorld(e.clientX, e.clientY);
  if (matchMedia("(hover: hover)").matches) placeConfirm();
});

function bridgeTarget() {
  const p = G.st.player;
  const dx = Math.round(Math.sin(G.moveYaw ?? 0)), dy = Math.round(Math.cos(G.moveYaw ?? 0));
  for (const k of [1, 2]) {
    const tx = Math.floor(p.x / TILE) + dx * k, ty = Math.floor(p.y / TILE) + dy * k;
    if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) return null;
    const t = G.world.tiles[ty * WORLD_W + tx];
    if (t === T.WATER) return ty * WORLD_W + tx;
    if (t !== T.BRIDGE) return null;
  }
  return null;
}
function waterAction() {
  const st = G.st, p = st.player;
  if (p.equip.hand?.id === "fishing_rod") { const r = S.gather(st, "fish", makeRng(Date.now())); UI.toast(r.length ? "🐟 물고기를 낚았다!" : "놓쳤다…"); }
  else if (S.count(st.inv, "bottle") < 1) UI.toast("물을 담을 빈 물병이 없습니다 — 물을 마시면 병이 남고, 가죽·고철로 만들 수 있어요", "warn");
  else { S.gather(st, "water", makeRng(Date.now())); UI.toast(`더러운 물을 떴습니다 (빈 병 ${S.count(st.inv, "bottle")}개 남음 · 모닥불에서 끓이세요)`); }
}

// 플레이어 피격: 구르는 중(무적)이면 무시
function hurtPlayer(raw) {
  if (G.iframe > 0) { fxText(G.st.player.x, G.st.player.y - 40, "회피!", "#9fd3ff"); return false; }
  S.damagePlayer(G.st, raw);
  fxText(G.st.player.x, G.st.player.y - 40, "-" + Math.round(raw * S.diff(G.st).enemy), "#ff6b5b");
  return true;
}

// 구르기: 기력 30, 0.3초 무적 + 빠른 이동
function dodge() {
  const st = G.st;
  if (!st || G.paused || G.stamina < 30 || G.rollT > 0) return;
  G.stamina -= 30; G.rollT = 0.3; G.iframe = 0.35;
  let ix = G.input.x, iy = G.input.y;
  if (keys.has("a") || keys.has("arrowleft")) ix = -1; if (keys.has("d") || keys.has("arrowright")) ix = 1;
  if (keys.has("w") || keys.has("arrowup")) iy = -1; if (keys.has("s") || keys.has("arrowdown")) iy = 1;
  const L = Math.hypot(ix, iy);
  G.rollDir = L > 0.1 ? [ix / L, iy / L] : [Math.sin(G.moveYaw || 0), Math.cos(G.moveYaw || 0)];
  Sfx.play("gather");
}
G.dodge = dodge;

// 가장 가까운 적(사거리 안). 없으면 null
function nearestFoe(range) {
  const p = G.st.player; let best = null, bd = range;
  for (const m of G.mobs) { if (m.hp <= 0 || !(m.kind === "enemy" || m.aggro)) continue; const d = Math.hypot(m.x - p.x, m.y - p.y); if (d < bd) { bd = d; best = m; } }
  return best;
}
function aimVec(m) {
  const p = G.st.player;
  if (m) { const d = Math.hypot(m.x - p.x, m.y - 14 - p.y + 20) || 1; return [(m.x - p.x) / d, (m.y - 14 - p.y + 20) / d]; }
  return [Math.sin(G.moveYaw ?? 0), Math.cos(G.moveYaw ?? 0)];
}
// 던지기(R): 투척 단검 > 표창 > 돌. 던진 것은 대부분 다시 주울 수 있다
G.throwNow = () => {
  const st = G.st;
  if (!st || G.paused || G.attackCd > 0) return;
  const id = S.throwPick(st, G.throwSel);
  if (!id) return UI.toast("던질 것이 없습니다 (돌·표창·투척 단검)", "warn");
  const t = S.throwItem(st, id);
  const [vx, vy] = aimVec(nearestFoe(320));
  G.shots.push({ x: st.player.x, y: st.player.y - 20, vx: vx * 460, vy: vy * 460, dmg: t.dmg, life: 0.7, item: id, thrown: true });
  G.attackCd = 0.45; G.swing = 0.2; G.swingStart = true; Sfx.play("hit");
  UI.renderHud();
};
// 필살기(F): 손에 든 무기의 고유 기술
G.special = () => {
  const st = G.st, p = st?.player;
  if (!st || G.paused) return;
  const id = p.equip.hand?.id, sp = id && SPECIALS[id];
  if (!sp) return UI.toast("이 무기에는 필살기가 없습니다", "warn");
  if (G.specCd > 0) return UI.toast(`필살기 준비 중… ${Math.ceil(G.specCd)}초`);
  const target = nearestFoe(sp.kind === "snipe" ? 520 : sp.kind === "volley" ? 340 : 120);
  const base = S.playerAttack(st);
  if (sp.kind === "volley") {
    // 부채꼴 연사: 화살·탄이 있어야 한다(첫 발은 위에서 이미 소모)
    if (!base.ranged) return UI.toast("화살·탄약이 없습니다", "warn");
    const [vx, vy] = aimVec(target), a0 = Math.atan2(vy, vx);
    for (let i = 0; i < sp.n; i++) {
      const extra = i === 0 ? base : S.playerAttack(st); if (!extra.ranged) break;
      const a = a0 + (i - (sp.n - 1) / 2) * 0.18;
      G.shots.push({ x: p.x, y: p.y - 20, vx: Math.cos(a) * 540, vy: Math.sin(a) * 540, dmg: extra.dmg, life: 0.65, item: extra.arrow, burn: extra.burn });
    }
    Sfx.play("shoot");
  } else if (sp.kind === "snipe") {
    const [vx, vy] = aimVec(target);
    G.shots.push({ x: p.x, y: p.y - 20, vx: vx * 900, vy: vy * 900, dmg: Math.round(base.dmg * sp.mult), life: 0.7, item: base.arrow, pierce: true });
    Sfx.play("shoot");
  } else if (sp.kind === "dash") {
    const [vx, vy] = aimVec(target);
    G.rollT = 0.22; G.rollDir = [vx, vy]; G.iframe = 0.25;
    G.shots.push({ x: p.x, y: p.y - 16, vx: vx * 700, vy: vy * 700, dmg: Math.round(base.dmg * sp.mult), life: 0.22, pierce: true });
  } else if (sp.kind === "spin") {
    let n = 0; for (const o of G.mobs) if (o.hp > 0 && (o.kind === "enemy" || o.aggro) && Math.hypot(o.x - p.x, o.y - p.y) < 90) { hitMob(o, Math.round(base.dmg * sp.mult), "#ffd36b"); n++; }
    if (!n) fxText(p.x, p.y - 50, "휘익!", "#ccc");
  } else if (sp.kind === "pierce") {
    if (!target) return UI.toast("가까운 적이 없습니다");
    hitMob(target, Math.round(base.dmg * sp.mult), "#ffd36b"); fxText(target.x, target.y - 56, sp.name + "!", "#ffd36b");
  }
  G.specCd = sp.cd; G.swing = 0.3; G.swingStart = true; G.attackCd = 0.4;
  fxText(p.x, p.y - 64, sp.name, "#9fd3ff");
  UI.renderHud();
};
// 동물 탐색: 이 지역 동물 몇 마리를 주변에 두고, 일정 시간 미니맵·화면 가장자리에 위치를 보여 준다
G.scoutNow = () => {
  const st = G.st, p = st.player;
  const list = (BIOMES[G.world.biome] || BIOMES.temperate).animals;
  let n = 0;
  for (let i = 0; i < 40 && n < 5; i++) {
    const a = Math.random() * Math.PI * 2, d = (12 + Math.random() * 22) * TILE;
    const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
    if (x < TILE || y < TILE || x > (WORLD_W - 1) * TILE || y > (WORLD_H - 1) * TILE || isBlocked(G.world, x, y)) continue;
    const mob = mobAt(list[Math.floor(Math.random() * list.length)], "animal", x, y);
    mob.scouted = true; G.mobs.push(mob); n++;
  }
  G.scoutUntil = G.t + SCOUT.revealSec;
  UI.toast(`🔍 동물 ${n}마리를 찾았다! 미니맵의 노란 점을 따라가세요`, "good");
  G.save();
};
// 약탈자 무리(NPC): 우두머리와 부하들이 길을 막는다 — 싸우거나, 통행료를 내거나, 말로 설득
async function raiderBand() {
  const st = G.st, p = st.player;
  const band = RAIDER_BANDS[Math.floor(Math.random() * RAIDER_BANDS.length)];
  const k = 1 + (G.world.region?.tier || 0) * 0.3 + st.story.chapter * 0.05;
  const a0 = Math.random() * Math.PI * 2, gang = [];
  for (let i = 0; i < 3 + Math.min(3, Math.floor(st.story.chapter / 3)); i++) {
    const a = a0 + (i - 1) * 0.35, d = 220 + i * 18;
    const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
    if (isBlocked(G.world, x, y)) continue;
    const m = mobAt("raider", "enemy", x, y);
    m.hp = m.maxHp = Math.round(m.hp * k * (i === 0 ? 2.2 : 1)); m.atkMul = k * (i === 0 ? 1.4 : 1); m.band = band.id;
    if (i === 0) { m.elite = true; m.leader = band.leader; }
    gang.push(m);
  }
  if (!gang.length) return;
  G.mobs.push(...gang);
  const toll = Math.round((40 + st.story.chapter * 25 + (G.world.region?.tier || 0) * 30) * (S.talentOn(st, "merchant") ? 0.6 : 1));
  const cha = S.eff(st, "cha"), persuade = Math.min(0.85, 0.15 + cha * 0.05 + (JOBS[p.job].perks.recruit || 0) * 0.3);
  st.stats.bands = (st.stats.bands || 0) + 1;
  const v = await UI.choice(`🏴 약탈자 무리 「${band.name}」`, `우두머리 <b>${band.leader}</b>와 부하 ${gang.length - 1}명이 길을 막았다.<br>"여기 지나가려면 값을 치러야지."`, [
    { label: "⚔️ 싸운다", value: "fight", cls: "danger" },
    { label: `💰 통행료를 낸다 (금화 ${toll})`, value: "pay", disabled: st.gold < toll },
    { label: `🗣️ 설득한다 (성공 ${Math.round(persuade * 100)}%)`, value: "talk" },
  ]);
  const leave = () => { G.mobs = G.mobs.filter((m) => !gang.includes(m)); };
  if (v === "pay") { st.gold -= toll; leave(); UI.toast(`「${band.name}」이(가) 금화를 챙겨 사라졌다`, "warn"); }
  else if (v === "talk" && Math.random() < persuade) { leave(); S.gainXp(st, 30); S.giveItem(st, "ammo", 4); UI.toast(`"…말이 통하는 놈이군." 「${band.name}」이(가) 탄약 몇 발을 던져 주고 물러났다`, "good"); }
  else { for (const m of gang) m.aggro = true; UI.toast(v === "talk" ? "설득 실패! 덤벼든다" : `「${band.name}」과(와) 전투!`, "bad"); }
  G.afterAction();
}

// 근접전 턴: 나와 적 모두 1초에 한 번 공격(공정한 주고받기)
const TURN = 1.0, STAND = 36; // STAND: 적이 멈춰 서는 거리(옆 칸)
function dropItem(x, y, id, qty) {
  // 같은 자리 근처의 같은 물건은 한 무더기로
  const near = G.drops.find((d) => d.id === id && Math.hypot(d.x - x, d.y - y) < 20);
  if (near) { near.qty += qty; near.t = G.t; return; }
  G.drops.push({ x, y, id, qty, t: G.t });
}
function scatterDrops(x, y, list) { list.forEach(([id, q], i) => { const a = (i / Math.max(1, list.length)) * Math.PI * 2 + Math.random(); dropItem(x + Math.cos(a) * 18, y + Math.sin(a) * 12 + 6, id, q); }); }
function attack(m) {
  const st = G.st, p = st.player;
  // 왼손에 무기가 있으면 콤보 2타째는 왼손으로(양손 쓰기)
  const off = p.equip.off, offWeapon = off && ITEMS[off.id].atk && !ITEMS[p.equip.hand?.id]?.ranged;
  const now0 = performance.now() / 1000, nextCombo = now0 - (G.lastHitT || 0) < TURN + 0.4 ? (G.combo % 3) + 1 : 1;
  const r = S.playerAttack(st, offWeapon && nextCombo === 2 ? "off" : "hand");
  G.target = m;
  // 3연타 콤보(0.9초 안에 이어 치기, 3타는 1.6배) + 치명타(민첩 기반)
  const now = performance.now() / 1000;
  G.combo = now - (G.lastHitT || 0) < TURN + 0.4 ? (G.combo % 3) + 1 : 1;
  G.lastHitT = now;
  const crit = Math.random() < 0.05 + S.eff(st, "agi") * 0.005;
  // 기습: 나를 알아채지 못한 적을 치면 2.5배
  if (m.kind === "enemy" && !m.aware) { r.dmg = Math.round(r.dmg * 2.5); fxText(m.x, m.y - 70, "기습!", "#ff9a3c"); m.aware = true; }
  r.dmg = Math.round(r.dmg * (crit ? 1.8 : 1) * (!r.ranged && G.combo === 3 ? 1.6 : 1));
  if (crit) fxText(m.x, m.y - 56, "치명!", "#ffd36b");
  G.attackCd = r.ranged ? TURN * 0.8 : TURN; // 적과 같은 공격 턴
  G.swing = 0.2; G.swingStart = true;
  G.moveYaw = Math.atan2(m.x - p.x, m.y - p.y);
  if (r.ranged) { Sfx.play("shoot"); const d = Math.hypot(m.x - p.x, m.y - p.y) || 1; G.shots.push({ x: p.x, y: p.y - 20, vx: ((m.x - p.x) / d) * 520, vy: ((m.y - 14 - p.y + 20) / d) * 520, dmg: r.dmg, life: 0.6, item: r.arrow, burn: r.burn }); }
  else {
    hitMob(m, r.dmg, crit ? "#ffd36b" : "#fff");
    // 3타째: 주변 적까지 휩쓸고 밀쳐낸다
    if (G.combo === 3) for (const o of G.mobs) if (o !== m && o.hp > 0 && (o.kind === "enemy" || o.aggro) && Math.hypot(o.x - p.x, o.y - p.y) < 70) { hitMob(o, Math.round(r.dmg * 0.6)); const d = Math.hypot(o.x - p.x, o.y - p.y) || 1; o.x += ((o.x - p.x) / d) * 20; o.y += ((o.y - p.y) / d) * 20; }
  }
  G.facing = m.x < p.x ? -1 : 1;
}

async function animalChoice(m) {
  const st = G.st;
  const a = ANIMALS[m.type];
  const food = a.food;
  const diff = S.tameDifficulty(st, m.type);
  const tc = S.tameCheck(st, m.type);
  const needRes = !tc.ok;
  const full = st.animals.length >= S.penCapacity(st);
  const v = await UI.choice(`${a.icon} ${a.name}`, `길들이기 난이도: ${diff < 0.3 ? "쉬움" : diff < 0.6 ? "보통" : "어려움"} · 먹이 ${ITEMS[food].icon}${ITEMS[food].name} (보유 ${S.count(st.inv, food)})${needRes ? `<br><span class='no'>${tc.why}</span>` : ""}${full ? "<br><span class='no'>동물 우리가 가득 찼습니다(기지에 우리를 지으세요).</span>" : ""}`, [
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
  G.swing = 0.25; G.swingStart = true;
  G.moveYaw = Math.atan2((n.tx + 0.5) * TILE - G.st.player.x, (n.ty + 0.5) * TILE - G.st.player.y);
  G.attackCd = 0.35;
  const nx = (n.tx + 0.5) * TILE, ny = n.ty * TILE - 10;
  Sfx.play(n.type === "tree" ? "chop" : n.type === "rock" || n.type === "scrap" || n.type === "car" ? "mine" : "gather");
  // 맞는 도구가 없으면 한 번 칠 때 진행이 아주 조금 → 여러 번 쳐야 1번 수확
  const gp = S.gatherPower(st, n.type);
  n.prog = (n.prog || 0) + gp.power;
  n.lastHit = G.t;
  if (n.prog < 1) {
    if (gp.need && !G.toolHintShown?.[n.type]) { (G.toolHintShown ||= {})[n.type] = 1; UI.toast(`맨손은 아주 느립니다 — ${gp.need}가 있으면 훨씬 빨라요`, "warn"); }
    fxText(nx, ny, gp.need ? "…" : "", "#ccc");
    return;
  }
  while (n.prog >= 1) {
    n.prog -= 1;
    n.hits = (n.hits || 0) + 1;
    const out = S.gather(st, n.type, makeRng(Date.now() + n.id + n.hits));
    if (Reg.addProgress(st, G.regions, "gather", 1)) regionCleared();
    Meta.addActivity(st, "gather");
    for (const [id, q] of out) fxText(nx, ny, `${ITEMS[id].icon}+${q}`, "#ffe9a8");
    if (n.hits >= NODE_TYPES[n.type].hp) {
      n.hits = 0; n.prog = 0;
      st.world.depleted[n.id] = st.time.min + NODE_TYPES[n.type].respawnH * 60;
      // 오래된 고갈 기록 정리(저장 용량)
      if (Object.keys(st.world.depleted).length > 400) for (const [k, v] of Object.entries(st.world.depleted)) if (v < st.time.min) delete st.world.depleted[k];
      break;
    }
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
    // 사는 것: 생존 필수품 + 화살·숫돌·요리책 / 파는 것: 남는 재료
    UI.openTrader([["scrap", 10, 30], ["leather", 3, 40], ["wood", 10, 20], ["bone", 5, 15], ["herb", 5, 25]],
      [["iron", 4, 80], ["electronics", 3, 120], ["revive_kit", 1, 200], ["bottle", 2, 30], ["arrow", 20, 60], ["whetstone", 1, 70], ["book_cook1", 1, 150], ["seed", 5, 25]]);
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
  G.checkHomeMission?.();
  // 동료 개인 이야기(호감도 40·80)
  const cs = S.pendingCompanionStories(G.st)[0];
  if (cs && !G.paused) {
    storyBusy = true;
    const ev = S.completeCompanionStory(G.st, cs.key);
    await UI.cinematic(`💬 ${ev.title}`, `${ev.text}\n\n(호감 보상: ${ev.reward.item ? ITEMS[ev.reward.item[0]].name + " ×" + ev.reward.item[1] : "금화 " + ev.reward.gold})`, { palette: ["#1d1a22", "#4a3a4a", "#c08a5a"] });
    storyBusy = false;
    return;
  }
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
      await UI.cinematic(ch.title, ch.text, { palette: o % 2 ? ["#141820", "#3b3a45", "#a06a40"] : ["#1b1512", "#4a3326", "#c7743b"], voice: `assets/voice/ch${o}.mp3` });
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
  const dt = Math.min(0.1, (now - last) / 1000); // 느린 기기(저프레임)에서도 게임 속도 유지
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
    const sp = S.moveSpeed(st) * Math.min(1, L) * isSlow(G.world, p.x, p.y) * (G.sneak ? 0.5 : 1);
    const vx = (ix / Math.max(1, L)) * sp * dt, vy = (iy / Math.max(1, L)) * sp * dt;
    const mobAt2 = (x, y) => G.mobs.some((m) => m.hp > 0 && (m.kind === "enemy" || m.aggro) && Math.hypot(m.x - x, m.y - y) < 24 && Math.hypot(m.x - x, m.y - y) < Math.hypot(m.x - p.x, m.y - p.y));
    if (!isBlocked(G.world, p.x + vx, p.y) && !mobAt2(p.x + vx, p.y)) p.x += vx;
    if (!isBlocked(G.world, p.x, p.y + vy) && !mobAt2(p.x, p.y + vy)) p.y += vy;
    p.x = Math.max(4, Math.min(WORLD_W * TILE - 4, p.x));
    p.y = Math.max(4, Math.min(WORLD_H * TILE - 4, p.y));
    edgeCheck();
    if (Math.abs(ix) > 0.1) G.facing = ix > 0 ? 1 : -1;
    G.moveYaw = Math.atan2(ix, iy);
    G.phase += dt * (p.mount ? 9 : 11) * Math.min(1, L);
    G.trail.unshift([p.x, p.y]); if (G.trail.length > 60) G.trail.pop();
  }
  // 기력 회복 · 구르기 이동
  G.stamina = Math.min(100, (G.stamina ?? 100) + dt * 28);
  if (G.iframe > 0) G.iframe -= dt;
  if (G.rollT > 0) {
    G.rollT -= dt;
    const rs = S.moveSpeed(st) * 3.2 * dt;
    const nx = p.x + G.rollDir[0] * rs, ny = p.y + G.rollDir[1] * rs;
    if (!isBlocked(G.world, nx, p.y)) p.x = nx;
    if (!isBlocked(G.world, p.x, ny)) p.y = ny;
    G.moving = true; G.phase += dt * 20;
  }
  // 위치 컨텍스트
  const bx = (G.world.cx + 0.5) * TILE, by = (G.world.cy + 0.5) * TILE;
  const wallR = (2 + st.base.lv) * TILE;
  G.atBase = G.world.home && Math.hypot(p.x - bx, p.y - by) < wallR;
  // 안개 걷기: 한 칸 움직일 때마다 주변 7칸을 밝힌다 + 탐험 미션
  const ptx = Math.floor(p.x / TILE), pty = Math.floor(p.y / TILE), pk = pty * WORLD_W + ptx;
  if (pk !== G.lastRevealT) {
    G.lastRevealT = pk;
    if (Reg.reveal(G.fog, WORLD_W, WORLD_H, ptx, pty, 7) > 0) {
      G.fogDirty = true; G.fogPctV = Reg.fogPct(G.fog);
      if (G.world.region.mission.kind === "explore" && Reg.addProgress(st, G.regions, "explore", 0, Reg.fogPct(G.fog))) regionCleared();
    }
  }
  G.nearFire = G.atBase && S.hasBuilding(st, "campfire");
  const tile = tileAt(G.world, p.x, p.y);
  G.inRad = tile === T.RAD; G.seasonId = S.season(st).id;
  // 시간 진행
  const gm = dt * TIME.gameMinPerRealSec;
  const indoors = !!G.world.site;
  const evs = S.tick(st, gm, { atBase: G.atBase, nearFire: G.nearFire, inRad: tile === T.RAD || (indoors && Sites.SITES[G.world.site.kind].rad && G.world.site.floor > 0), moving: G.moving, indoors });
  // 방사능 폭풍 경고(밖에 있을 때 한 번)
  if (st.weather?.id === "radstorm" && !indoors && !G.atBase) { if (!G.stormWarned) { G.stormWarned = true; UI.toast("☢️ 방사능 폭풍! 건물이나 방공호(🛖)로 피하세요", "bad"); } } else G.stormWarned = false;
  handleEvents(evs);
  // 입력 행동
  G.attackCd -= dt; if (G.swing > 0) G.swing -= dt;
  // 입력 버퍼: 쿨타임 중에 누른 행동은 0.35초 동안 기억했다가 바로 실행(연타·콤보가 끊기지 않게)
  if (G.input.action) { G.actBuf = 0.35; G.input.action = false; }
  if (G.actBuf > 0) { G.actBuf -= dt; if (G.attackCd <= 0) { G.actBuf = 0; interact(); } }
  if (G.queued) { const q = G.queued; if (q.hp <= 0 || !G.mobs.includes(q)) G.queued = null; else if (G.attackCd <= 0) { G.queued = null; q.calm = false; attack(q); } }
  // 몹/탄
  spawnMobs(dt);
  updateMobs(dt);
  for (const s of G.shots) {
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    if (s.foe) { if (Math.hypot(s.x - p.x, s.y - (p.y - 16)) < 14) { if (hurtPlayer(s.dmg)) s.life = 0; } }
    else for (const m of G.mobs) if (m.hp > 0 && Math.hypot(s.x - m.x, s.y - (m.y - 14)) < (s.pierce ? 22 : 16) && !(s.hitSet?.has(m))) {
      hitMob(m, s.dmg); if (s.burn) m.burn = Math.max(m.burn || 0, 3), m.burnDmg = s.burn;
      if (s.pierce) (s.hitSet ||= new Set()).add(m); else { s.life = 0; break; }
    }
    // 쏜 화살·던진 무기는 떨어진 자리에서 다시 주울 수 있다(종류·운에 따라 약 90%)
    if (s.life <= 0 && s.item && S.arrowRecovered(st, s.item)) dropItem(s.x, s.y + 14, s.item, 1);
  }
  G.shots = G.shots.filter((s) => s.life > 0);
  // 불타는 적
  for (const m of G.mobs) if (m.burn > 0 && m.hp > 0) { m.burn -= dt; m.burnT = (m.burnT || 0) - dt; if (m.burnT <= 0) { m.burnT = 1; hitMob(m, m.burnDmg || 4, "#ff9a3c"); } }
  // 바닥에 떨어진 것 줍기
  for (const d of G.drops) if (Math.hypot(d.x - p.x, d.y - p.y) < 30 + (Meta.vipPerk(G.acc).pick || 0)) {
    const n = Math.min(d.qty, S.roomFor(st, d.id));
    if (n <= 0) { if (G.t - (G.fullToastT || -9) > 4) { G.fullToastT = G.t; UI.toast("🎒 가방이 가득 찼습니다 — 버리거나 기지 창고에 넣으세요", "warn"); } continue; }
    S.addItem(st, st.inv, d.id, n, 1, S.bagSize(st)); d.qty -= n;
    fxText(d.x, d.y - 20, `${ITEMS[d.id].icon}+${n}`, "#ffe9a8"); Sfx.play("gather"); G.hudDirty = true;
  }
  G.drops = G.drops.filter((d) => d.qty > 0 && G.t - d.t < 600);
  if (G.specCd > 0) { G.specCd -= dt; G.cdHudT = (G.cdHudT || 0) - dt; if (G.cdHudT <= 0 || G.specCd <= 0) { G.cdHudT = 0.5; UI.renderHud(); } }
  // 무작위 조우
  if (!G.atBase) { G.encounterT -= dt; if (G.encounterT <= 0) { G.encounterT = 150 + Math.random() * 120; UI.encounterModal(); } }
  if (!G.atBase && S.day(st) >= 2 && !G.paused) { G.bandT = (G.bandT ?? 200 + Math.random() * 200) - dt; if (G.bandT <= 0) { G.bandT = Math.max(160, 420 - st.story.chapter * 20) + Math.random() * 240; raiderBand(); } }
  // HUD/저장
  // 배경음악 분위기: 전투(가까운 적이 공격 중) > 기지 > 겨울 > 밤 > 낮
  G.bgmT = (G.bgmT || 0) - dt;
  if (G.bgmT <= 0) {
    G.bgmT = 1;
    const fight = G.mobs.some((m) => (m.kind === "enemy" || m.aggro) && Math.hypot(m.x - p.x, m.y - p.y) < 260);
    Bgm.setMood(fight ? "combat" : G.atBase ? "base" : S.season(st).temp < 0 ? "winter" : S.isNight(st) ? "night" : "day");
  }
  // 피격·레벨업 효과음
  if (G.lastHp !== undefined && p.hp < G.lastHp - 0.5) Sfx.play("hurt");
  if (G.lastLv !== undefined && p.level > G.lastLv) Sfx.play("levelup");
  G.lastHp = p.hp; G.lastLv = p.level;
  // 튜토리얼 진행
  if (st.tut < TUTORIAL.length) {
    const step = TUTORIAL[st.tut];
    if (step.done(st, G)) { st.tut++; Sfx.play("good"); if (st.tut < TUTORIAL.length) UI.toast("✔ " + step.title, "good"); else UI.toast("기본기를 익혔습니다! 이제 이야기(📖)를 따라가세요", "good"); }
  }
  UI.renderTutorial(st.tut < TUTORIAL.length ? TUTORIAL[st.tut] : null, st.tut);
  G.hudT = (G.hudT || 0) - dt;
  if (G.hudT <= 0) { G.hudT = 0.5; UI.renderHud(); handleStory(); }
  G.metaT = (G.metaT || 0) - dt;
  if (G.metaT <= 0) {
    G.metaT = 2;
    if (Meta.finishBuildIfDone(st, S)) { UI.toast(`🏰 확장 공사 완료! 「${BUILDINGS && S.baseName ? S.baseName(st) : "기지 Lv." + st.base.lv}」`, "good"); Sfx.play("levelup"); G.afterAction(); }
    const g = claimGrowthFund(G.acc, st); if (g) UI.toast(`💰 성장 펀드 보석 +${g}`, "good");
    for (const r of Meta.collectExpeditions(st, S.giveItem)) UI.toast(`🧭 ${r.c?.name ?? "동료"} 원정 귀환: ${r.loot.map(([i, n]) => ITEMS[i].name + " " + n).join(", ")}`, "good");
  }
  if (performance.now() - G.lastSave > 15000) G.save();
}

function draw(dt) {
  if (G.r3d) return draw3D(dt);
  const st = G.st, p = st.player;
  // 줌: 세상을 Z배로 크게 그린다(한 칸이 커져 장비까지 보인다). 휠·+/−·화면 버튼으로 조절
  const Z = G.zoom || 1.7, VWz = VW / Z, VHz = VH / Z;
  G.cam.x += (p.x - VWz / 2 - G.cam.x) * Math.min(1, dt * 8);
  G.cam.y += (p.y - VHz / 2 - G.cam.y) * Math.min(1, dt * 8);
  // 지도 밖(빈 공간)이 보이지 않게 카메라를 지도 안으로
  G.cam.x = Math.max(0, Math.min(WORLD_W * TILE - VWz, G.cam.x)); G.cam.y = Math.max(0, Math.min(WORLD_H * TILE - VHz, G.cam.y));
  const cam = { x: Math.round(G.cam.x), y: Math.round(G.cam.y) };
  ctx.fillStyle = "#1a1714"; ctx.fillRect(0, 0, VW, VH);
  ctx.save(); ctx.scale(Z, Z);
  R.drawTerrain(ctx, G.world, cam, VWz, VHz);
  // 들어갈 수 있는 건물(아이콘 크게 + 이름, 보스 처치하면 깃발)
  for (const q of G.world.sites || []) {
    const x = (q.tx + 0.5) * TILE - cam.x, y = (q.ty + 0.5) * TILE - cam.y;
    if (x < -80 || y < -80 || x > VWz + 80 || y > VHz + 80) continue;
    const D = Sites.SITES[q.kind], done = st.sites?.[Sites.siteKey(G.world.rid, q.id)]?.cleared;
    ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(x, y + 20, 38, 11, 0, 0, Math.PI * 2); ctx.fill();
    R.emoji(ctx, D.icon, x, y - 8, 52);
    ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect(x - 40, y + 24, 80, 15);
    ctx.fillStyle = done ? "#9be37a" : "#fff"; ctx.fillText((done ? "🏁 " : "") + D.name, x, y + 35); ctx.textAlign = "start";
  }
  // POI
  for (const q of Object.values(G.world.pois)) {
    const x = (q.tx + 0.5) * TILE - cam.x, y = (q.ty + 0.5) * TILE - cam.y;
    if (x < -80 || y < -80 || x > VWz + 80 || y > VHz + 80) continue;
    ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(x, y + 18, 34, 10, 0, 0, Math.PI * 2); ctx.fill();
    R.emoji(ctx, q.icon, x, y - 6, 44);
    ctx.fillStyle = "#fff"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center"; ctx.fillText(q.name, x, y + 34); ctx.textAlign = "left";
  }
  if (G.world.home) R.drawBase(ctx, st, G.world, cam, G.t);
  // 정렬해서 그리기(y-정렬)
  const list = [];
  for (const n of visibleNodes()) list.push({ y: (n.ty + 0.5) * TILE + 8, f: () => {
    const sx = (n.tx + 0.5) * TILE - cam.x, sy = (n.ty + 0.5) * TILE - cam.y;
    R.drawNode(ctx, n, sx, sy);
    // 채집 진행 막대(최근 4초 안에 쳤을 때만)
    if (n.lastHit && G.t - n.lastHit < 4 && ((n.hits || 0) + (n.prog || 0)) > 0) {
      const fr = Math.min(1, ((n.hits || 0) + (n.prog || 0)) / NODE_TYPES[n.type].hp);
      ctx.fillStyle = "rgba(0,0,0,.65)"; ctx.fillRect(sx - 18, sy - 30, 36, 6);
      ctx.fillStyle = "#f2c06a"; ctx.fillRect(sx - 17, sy - 29, 34 * fr, 4);
    }
  } });
  for (const m of G.mobs) {
    const sx = m.x - cam.x, sy = m.y - cam.y;
    if (sx < -60 || sy < -60 || sx > VWz + 60 || sy > VHz + 60) continue;
    list.push({ y: m.y, f: () => { if (m.kind === "enemy") { R.drawEnemy(ctx, { ...m, x: sx, y: sy }, ENEMIES[m.type], m.phase); if (m.leader) { ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "#ff8a80"; ctx.fillText("👑 " + m.leader, sx, sy - 48); ctx.textAlign = "start"; } } else { R.drawAnimal(ctx, m.type, sx, sy, m.phase, m.moving, m.facing); if (m.hp < m.maxHp) R.hpBar(ctx, sx, sy - 34, m.hp / m.maxHp); if (m.emote) R.emoji(ctx, m.emote, sx + 10, sy - 38 + Math.sin(G.t * 6) * 1.5, 14); } } });
  }
  // 기지 주민
  const bx = (G.world.cx + 0.5) * TILE, by = (G.world.cy + 0.5) * TILE;
  st.companions.filter((c) => c.task === "base").slice(0, 10).forEach((c, i) => {
    const a = G.t * 0.15 + i * 1.7, r = (1.4 + (i % 3) * 0.6) * TILE;
    const x = bx + Math.cos(a) * r, y = by + Math.sin(a) * r * 0.7 + TILE;
    list.push({ y, f: () => { const art = heroArt(c); if (art && R.drawArtChar(ctx, art, S.isNight(st) ? "sleep" : S.hasBuilding(st, "campfire") && i % 2 ? "campfire" : "idle", x - cam.x, y - cam.y, 46, -Math.sin(a) > 0 ? 1 : -1, Math.abs(Math.sin(G.t * 6 + i)) * 1.5)) return; R.drawCharacter(ctx, x - cam.x, y - cam.y, { skin: "#c9956d", hair: c.gender === "F" ? "long" : "short", hairColor: "#1b1410" }, { body: { id: c.role === "soldier" ? "combat_vest" : c.child ? "rag_shirt" : "leather_jacket" }, legs: { id: "rag_pants" } }, -Math.sin(a) > 0 ? 1 : -1, G.t * 6 + i, { moving: true, scale: c.child && !S.isAdult(c) ? 0.65 : 0.9, gender: c.gender }); } });
  });
  // 동행 동료/동물(발자취를 따라옴)
  let k = 12;
  for (const c of st.companions.filter((c) => c.task === "follow")) {
    const tp = G.trail[Math.min(k, G.trail.length - 1)] || [p.x - 30, p.y]; k += 12;
    list.push({ y: tp[1], f: () => { const art = heroArt(c); const fight = G.mobs.some((m) => m.kind === "enemy" && m.hp > 0 && Math.hypot(m.x - tp[0], m.y - tp[1]) < 200); if (art && R.drawArtChar(ctx, art, fight ? "shoot" : G.moving ? "pack" : "idle", tp[0] - cam.x, tp[1] - cam.y, 48, G.facing, G.moving ? Math.abs(Math.sin(G.phase)) * 2 : 0)) return; R.drawCharacter(ctx, tp[0] - cam.x, tp[1] - cam.y, { skin: "#c9956d", hair: c.gender === "F" ? "long" : "short", hairColor: "#1b1410" }, { body: { id: c.role === "soldier" ? "combat_vest" : "leather_jacket" }, legs: { id: "leather_pants" }, feet: { id: "boots" }, hand: { id: c.role === "soldier" ? "rifle" : "knife" } }, G.facing, G.phase, { moving: G.moving, gender: c.gender }); } });
  }
  for (const a of st.animals.filter((a) => a.task === "follow" && st.player.mount?.uid !== a.uid)) {
    const tp = G.trail[Math.min(k, G.trail.length - 1)] || [p.x + 30, p.y]; k += 12;
    list.push({ y: tp[1], f: () => R.drawAnimal(ctx, a.type, tp[0] - cam.x, tp[1] - cam.y, G.phase, G.moving, G.facing, true) });
  }
  // 플레이어
  const mount = p.mount ? (p.mount.type === "animal" ? { kind: p.mount.kind } : { id: p.mount.id }) : null;
  list.push({ y: p.y, f: () => G.sneak ? (ctx.save(), ctx.globalAlpha = 0.6, ctx.translate(p.x - cam.x, p.y - cam.y), ctx.scale(1, 0.86), R.drawCharacter(ctx, 0, 0, p.look, p.equip, G.facing, G.phase, { moving: G.moving, gender: p.gender, scale: 1.05 }), ctx.restore()) : R.drawCharacter(ctx, p.x - cam.x, p.y - cam.y, p.look, p.equip, G.facing, G.phase + (G.swing > 0 ? 2 : 0), { moving: G.moving || G.swing > 0, gender: p.gender, mount, scale: 1.05 }) });
  list.sort((a, b) => a.y - b.y).forEach((o) => o.f());
  // 탄/효과
  ctx.fillStyle = "#ffd36b";
  for (const s of G.shots) { ctx.fillStyle = s.foe ? "#ff6b5b" : s.thrown ? "#d9d9d9" : "#ffd36b"; ctx.fillRect(s.x - cam.x - 2, s.y - cam.y - 2, s.item && !s.thrown ? 7 : 4, 4); }
  for (const e of G.world.events || []) if (!e.done) R.emoji(ctx, { survivor: "🙋", diary: "📓", stash: "📦", trap: "❓", heroine: "👩", note: "📝" }[e.kind], (e.tx + 0.5) * TILE - cam.x, (e.ty + 0.5) * TILE - cam.y - 6, 26);
  G.eventNpcs = (G.eventNpcs || []).filter((n) => n.until > G.t);
  for (const n of G.eventNpcs) {
    if (n.animal) { R.drawAnimal(ctx, n.animal, n.x - cam.x, n.y - cam.y, G.t * 4, false, -1); continue; }
    const L = { child: [{ skin: "#e3b48e", hair: "short", hairColor: "#3a2a1a" }, 0.7], adult: [{ skin: "#d1a07a", hair: "short", hairColor: "#2b211b" }, 0.95], old: [{ skin: "#d9b090", hair: "pony", hairColor: "#d8d0c0" }, 0.9], raider: [{ skin: "#c08a64", hair: "mohawk", hairColor: "#8a2b2b" }, 0.95], merchant: [{ skin: "#d1a07a", hair: "beard", hairColor: "#4a3a2a" }, 0.95] }[n.k] || [{}, 0.9];
    R.drawCharacter(ctx, n.x - cam.x, n.y - cam.y, L[0], { body: { id: n.k === "raider" || n.k === "merchant" ? "leather_jacket" : n.k === "old" ? "fur_coat" : "rag_shirt" }, legs: { id: "rag_pants" } }, -1, G.t * 2, { scale: L[1], gender: n.g });
  }
  for (const d of G.drops) {
    const dx = d.x - cam.x, dy = d.y - cam.y;
    ctx.fillStyle = "rgba(255,230,140,.25)"; ctx.beginPath(); ctx.ellipse(dx, dy + 8, 12, 4, 0, 0, Math.PI * 2); ctx.fill(); // 반짝이는 받침(눈에 띄게)
    ctx.globalAlpha = 0.85 + Math.sin(G.t * 5) * 0.15; R.emoji(ctx, ITEMS[d.id].icon, dx, dy - 2 + Math.sin(G.t * 3 + d.x) * 1.5, 18); ctx.globalAlpha = 1;
    if (d.qty > 1) { ctx.font = "bold 10px sans-serif"; ctx.fillStyle = "#fff"; ctx.strokeStyle = "#000"; ctx.lineWidth = 3; ctx.strokeText("×" + d.qty, dx + 6, dy + 10); ctx.fillText("×" + d.qty, dx + 6, dy + 10); }
  }
  for (const f of G.fx) { f.t -= dt; f.y -= 28 * dt; ctx.globalAlpha = Math.max(0, f.t); ctx.fillStyle = f.color; ctx.font = "bold 13px sans-serif"; ctx.fillText(f.txt, f.x - cam.x - 8, f.y - cam.y); }
  ctx.globalAlpha = 1;
  G.fx = G.fx.filter((f) => f.t > 0);
  // 안개: 아직 가 보지 않은 칸은 어둡게(미니맵과 같게)
  drawFieldFog(cam, VWz, VHz);
  drawPlacing(cam);
  // 지금 싸우는 적 표시(붉은 고리)
  const tg = G.queued || G.target;
  if (tg && tg.hp > 0 && G.mobs.includes(tg)) { ctx.strokeStyle = "rgba(255,90,70,.9)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(tg.x - cam.x, tg.y - cam.y + 4, 16, 6, 0, 0, Math.PI * 2); ctx.stroke(); }
  drawTutArrow();
  ctx.restore();
  // 상호작용 힌트(화면 아래 고정 — 캐릭터를 가리지 않게)
  drawHint(cam);
  // 날씨/조명
  const sea = S.season(st);
  const tileHere = tileAt(G.world, p.x, p.y);
  R.drawParticles(ctx, G.particles, VW, VH, dt, sea.id === "winter" ? "snow" : tileHere === T.RAD ? "rad" : "ash");
  const h = (st.time.min % 1440) / 60;
  const dark = h >= 21 || h < 5 ? 0.62 : h >= 19 ? (h - 19) / 2 * 0.62 : h < 7 ? (7 - h) / 2 * 0.62 : 0;
  const lights = [{ x: (p.x - cam.x) * Z, y: (p.y - cam.y - 20) * Z, r: 120 * Z }];
  if (G.world.home && S.hasBuilding(st, "campfire")) { const o = R.baseLayout(st, G.world).out.find((o) => o.b.id === "campfire"); if (o) lights.push({ x: (o.x - cam.x) * Z, y: (o.y - cam.y) * Z, r: 200 * Z }); }
  if (G.world.home) lights.push({ x: (bx - cam.x) * Z, y: (by - cam.y) * Z, r: (80 + st.base.lv * 30) * Z });
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
  // 적 공격 예고(붉은 원) · 정예 표시
  for (const m of G.mobs) {
    const g = G.r3d.project(m.x, m.y, 0.05);
    if (!g.vis) continue;
    if (m.windup > 0) {
      const k = 1 - m.windup / 0.45;
      ctx.strokeStyle = "rgba(229,83,75,.9)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(g.x, g.y, 34, 14, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = `rgba(229,83,75,${0.15 + k * 0.35})`; ctx.beginPath(); ctx.ellipse(g.x, g.y, 34 * k, 14 * k, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (m.elite) { const h = G.r3d.project(m.x, m.y, 2.6); ctx.fillStyle = "#ffd36b"; ctx.font = "bold 11px sans-serif"; ctx.fillText("★정예", h.x - 16, h.y - 8); }
  }
  // 기력(구르기) 게이지: 다 차 있지 않을 때만 캐릭터 옆에 표시
  if ((G.stamina ?? 100) < 100) {
    const g = G.r3d.project(p.x, p.y, 1.0);
    ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(g.x + 26, g.y, 9, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = G.stamina >= 30 ? "#7ed957" : "#e5534b"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(g.x + 26, g.y, 9, -Math.PI / 2, -Math.PI / 2 + (G.stamina / 100) * Math.PI * 2); ctx.stroke();
  }
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
  drawTutArrow();
  if (p.hp < p.maxHp * 0.25) { const g = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.3, VW / 2, VH / 2, VH * 0.8); g.addColorStop(0, "rgba(160,0,0,0)"); g.addColorStop(1, `rgba(160,0,0,${0.35 + Math.sin(G.t * 5) * 0.1})`); ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH); }
  drawMinimap();
}

// 튜토리얼 화살표: 지금 단계의 목표 위치를 가리킨다(화면 밖이면 가장자리에)
function drawTutArrow() {
  const st = G.st;
  if (!(st.tut < TUTORIAL.length)) return;
  const tgt = tutorialStep(st, G, visibleNodes, nearWater);
  if (!tgt) return;
  const sp = G.r3d ? G.r3d.project(tgt.x, tgt.y, 1.6) : { x: tgt.x - G.cam.x, y: tgt.y - G.cam.y - 40 };
  const me = G.r3d ? G.r3d.project(st.player.x, st.player.y, 1.0) : { x: st.player.x - G.cam.x, y: st.player.y - G.cam.y };
  const pad = 70;
  const Zt = G.r3d ? 1 : G.zoom || 1.7;
  const onScreen = sp.x > pad / Zt && sp.y > pad / Zt && sp.x < VW / Zt - pad / Zt && sp.y < VH / Zt - pad / Zt;
  const t = performance.now() / 300;
  ctx.save();
  if (onScreen) {
    const bob = Math.sin(t) * 6;
    ctx.translate(sp.x, sp.y - 30 + bob);
    ctx.fillStyle = "#e0a24a"; ctx.strokeStyle = "#1d1712"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, 18); ctx.lineTo(-13, -2); ctx.lineTo(-5, -2); ctx.lineTo(-5, -18); ctx.lineTo(5, -18); ctx.lineTo(5, -2); ctx.lineTo(13, -2); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else {
    const a = Math.atan2(sp.y - me.y, sp.x - me.x);
    const r = Math.min(VW, VH) * 0.32;
    ctx.translate(me.x + Math.cos(a) * r, me.y + Math.sin(a) * r); ctx.rotate(a);
    ctx.fillStyle = "#e0a24a"; ctx.strokeStyle = "#1d1712"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(22, 0); ctx.lineTo(0, -14); ctx.lineTo(0, -6); ctx.lineTo(-18, -6); ctx.lineTo(-18, 6); ctx.lineTo(0, 6); ctx.lineTo(0, 14); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

function drawHint(cam) {
  const st = G.st, p = st.player;
  let txt = null, hx = 0, hy = 0;
  const sq = !G.world.site && siteNear();
  if (sq) txt = `${Sites.SITES[sq.kind].name} 들어가기`;
  if (!txt) for (const n of visibleNodes()) { const nx = (n.tx + 0.5) * TILE, ny = (n.ty + 0.5) * TILE; if (Math.hypot(nx - p.x, ny - p.y) < 50) { const gp = S.gatherPower(G.st, n.type); txt = `${NODE_TYPES[n.type].name} 채집${gp.need ? ` · ${gp.need} 없음(아주 느림)` : ""}`; hx = nx; hy = ny - 36; break; } }
  for (const m of G.mobs) if (Math.hypot(m.x - p.x, m.y - p.y) < 56) { txt = m.kind === "enemy" ? `${ENEMIES[m.type].name} 공격` : `${ANIMALS[m.type].name} (길들이기/사냥)`; hx = m.x; hy = m.y - 50; break; }
  if (!txt && cookStationNear()) { txt = `${BUILDINGS[cookStationNear().b.id].name}에서 요리하기`; }
  if (!txt && G.world.home && Math.hypot((G.world.cx + 0.5) * TILE - p.x, (G.world.cy + 0.5) * TILE - p.y) < 2.2 * TILE) { txt = "기지 관리"; hx = p.x; hy = p.y - 60; }
  if (!txt && G.world.site) { if (nearTile(T.EXIT)) txt = "밖으로 나가기"; else if (nearTile(T.STAIRS)) txt = Sites.SITES[G.world.site.kind].under ? "더 깊이 내려가기" : "위층으로 올라가기"; else { const ev = (G.world.events || []).find((e) => !e.done && Math.hypot((e.tx + 0.5) * TILE - p.x, (e.ty + 0.5) * TILE - p.y) < 1.6 * TILE); const dn = doorNear(); if (dn) txt = { wood: "문 부수기", key: "잠긴 문 (녹슨 열쇠)", card: "보안문 (카드키)", code: "비밀번호 입력" }[dn.kind]; else if (ev) txt = ev.kind === "note" ? "쪽지 읽기" : ev.kind === "heroine" ? `⭐ ${HEROINES[ev.key].name}에게 말 걸기` : { survivor: "갇힌 생존자 돕기", diary: "일기 읽기", stash: "보급품 뒤지기", trap: "수상한 상자 열기" }[ev.kind]; } }
  if (!txt) { const q = !G.world.site && siteNear(); if (q) txt = `${Sites.SITES[q.kind].name} 들어가기`; }
  if (!txt && nearWater(G.world, p.x, p.y)) { txt = p.equip.hand?.id === "fishing_rod" ? "낚시" : S.count(st.inv, "bottle") ? `물 뜨기 (빈 병 ${S.count(st.inv, "bottle")})` : "물 뜨기 — 빈 물병 필요"; hx = p.x; hy = p.y - 60; }
  if (!txt) return;
  // 화면 아래 가운데(메뉴 위)에 고정 표시 — 캐릭터 머리 위를 가리지 않는다
  ctx.font = "bold 14px sans-serif";
  const w = ctx.measureText(txt).width + 44, x = VW / 2 - w / 2, y = VH - 112;
  ctx.fillStyle = "rgba(0,0,0,.7)"; R.roundRect(ctx, x, y, w, 30, 15); ctx.fill();
  ctx.strokeStyle = "rgba(242,192,106,.6)"; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = "#ffd36b"; ctx.fillText(matchMedia("(hover: hover)").matches ? "E" : "✋", x + 12, y + 20);
  ctx.fillStyle = "#fff"; ctx.fillText(txt, x + 30, y + 20);
}
// 필드 안개: 탐험하지 않은 칸 위에 어두운 막(가장자리는 반투명으로 부드럽게)
function drawFieldFog(cam, vw, vh) {
  const fog = G.fog; if (!fog) return;
  const x0 = Math.max(0, Math.floor(cam.x / TILE)), y0 = Math.max(0, Math.floor(cam.y / TILE));
  const x1 = Math.min(WORLD_W - 1, Math.ceil((cam.x + vw) / TILE)), y1 = Math.min(WORLD_H - 1, Math.ceil((cam.y + vh) / TILE));
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (fog[ty * WORLD_W + tx]) continue;
    // 옆 칸이 밝혀졌으면 반투명(경계), 아니면 거의 검게
    const edge = (tx > 0 && fog[ty * WORLD_W + tx - 1]) || (tx < WORLD_W - 1 && fog[ty * WORLD_W + tx + 1]) || (ty > 0 && fog[(ty - 1) * WORLD_W + tx]) || (ty < WORLD_H - 1 && fog[(ty + 1) * WORLD_W + tx]);
    ctx.fillStyle = edge ? "rgba(12,10,9,.62)" : "rgba(12,10,9,.94)";
    ctx.fillRect(tx * TILE - cam.x, ty * TILE - cam.y, TILE + 0.5, TILE + 0.5);
  }
}

const poiImgs = {};
function poiImg(id) { if (!poiImgs[id]) { poiImgs[id] = new Image(); poiImgs[id].src = Ic.dataURI("poi." + id, 32); } return poiImgs[id]; }
// 미니맵 (저해상도 캐시)
let miniCache = null;
function drawMinimap() {
  const size = Math.min(120, VW * 0.26);
  // 안개: 탐험한 칸만 지형색, 나머지는 어둡게. 새로 밝힌 곳이 있으면 0.4초마다 다시 그림
  if (!miniCache || miniCache.seed !== G.world.seed || miniCache.biome !== G.world.biome || (G.fogDirty && G.t - miniCache.t > 0.4)) {
    const c = miniCache?.c?.width === WORLD_W ? miniCache.c : document.createElement("canvas"); c.width = c.height = WORLD_W;
    const g = c.getContext("2d"); const img = g.createImageData(WORLD_W, WORLD_H);
    const cols = { 0: [111, 106, 96], 1: [79, 107, 58], 2: [90, 90, 94], 3: [47, 79, 99], 4: [92, 122, 46], 5: [87, 80, 74], 6: [122, 106, 82], 7: [61, 59, 57], 8: [200, 176, 122], 9: [227, 231, 234], 10: [77, 122, 140], 11: [122, 90, 58], 12: [44, 42, 40], 13: [94, 88, 80], 14: [200, 150, 70], 15: [230, 210, 120], 16: [140, 60, 40] };
    const fog = G.fog, dark = [14, 12, 11];
    for (let i = 0; i < WORLD_W * WORLD_H; i++) { const c3 = fog && !fog[i] ? dark : cols[G.world.tiles[i]] || cols[0]; img.data[i * 4] = c3[0]; img.data[i * 4 + 1] = c3[1]; img.data[i * 4 + 2] = c3[2]; img.data[i * 4 + 3] = 255; }
    g.putImageData(img, 0, 0);
    miniCache = { seed: G.world.seed, biome: G.world.biome, c, t: G.t };
    G.fogDirty = false;
  }
  const x0 = VW - size - 10, y0 = 92;
  ctx.globalAlpha = 0.9;
  ctx.drawImage(miniCache.c, x0, y0, size, size);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(255,255,255,.4)"; ctx.strokeRect(x0, y0, size, size);
  const sc = size / (WORLD_W * TILE);
  ctx.font = "10px sans-serif";
  for (const q of Object.values(G.world.pois)) {
    if (G.fog && !G.fog[q.ty * WORLD_W + q.tx]) continue; // 아직 못 찾은 장소는 숨김
    const img = poiImg(q.id);
    if (img.complete && img.naturalWidth) ctx.drawImage(img, x0 + q.tx * TILE * sc - 8, y0 + q.ty * TILE * sc - 8, 16, 16);
  }
  for (const q of G.world.sites || []) if (!G.fog || G.fog[q.ty * WORLD_W + q.tx]) { ctx.font = "11px sans-serif"; ctx.fillText(Sites.SITES[q.kind].icon, x0 + q.tx * TILE * sc - 6, y0 + q.ty * TILE * sc + 4); }
  // 동물 탐색 결과(노란 점, 깜빡임)
  if (G.scoutUntil > G.t) { ctx.fillStyle = Math.sin(G.t * 6) > 0 ? "#ffe14d" : "#ff9a3c"; for (const m of G.mobs) if (m.scouted && m.hp > 0) { ctx.beginPath(); ctx.arc(x0 + m.x * sc, y0 + m.y * sc, 3, 0, Math.PI * 2); ctx.fill(); } }
  if (G.world.home) { ctx.fillStyle = "#ffd36b"; ctx.fillRect(x0 + G.world.cx * TILE * sc - 2, y0 + G.world.cy * TILE * sc - 2, 4, 4); }
  // 열린 이웃 지역으로 가는 길목 표시(가장자리 화살표)
  const reg = G.world.region;
  ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center";
  for (const [dn, o] of Object.entries(reg?.links || {})) {
    const open = Reg.isUnlocked(G.st, G.regions, o);
    const [ax, ay] = { 동: [x0 + size - 5, y0 + size / 2 + 4], 서: [x0 + 5, y0 + size / 2 + 4], 남: [x0 + size / 2, y0 + size - 2], 북: [x0 + size / 2, y0 + 10] }[dn];
    ctx.fillStyle = open ? "#ffd36b" : "rgba(255,255,255,.35)"; ctx.fillText(open ? "▶◀▼▲"["동서남북".indexOf(dn)] : "🔒", ax, ay);
  }
  ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x0 + G.st.player.x * sc, y0 + G.st.player.y * sc, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.font = "11px sans-serif"; ctx.fillStyle = "rgba(255,255,255,.9)";
  ctx.fillText(G.world.site ? `${G.world.site.name} ${Sites.SITES[G.world.site.kind].under ? "지하 " : ""}${G.world.site.floor + 1}층` : `${reg?.name ?? ""} · 탐험 ${Math.floor(G.fogPctV ?? 0)}%`, x0 + size / 2, y0 + size + 13);
  ctx.textAlign = "start";
  G.miniRect = [x0, y0, size, size + 16];
}

// 줌: 0.9 ~ 2.8 (설정에 저장)
G.setZoom = (z) => { G.zoom = Math.max(0.9, Math.min(2.8, Math.round(z * 10) / 10)); G.acc.settings.zoom = G.zoom; saveAccount(G.acc); };
G.zoom = G.acc.settings?.zoom || (matchMedia("(hover: hover)").matches ? 1.7 : 1.5);
addEventListener("wheel", (e) => { if (!G.st || G.paused || e.target.closest(".modal-bg")) return; G.setZoom((G.zoom || 1.7) * (e.deltaY > 0 ? 0.9 : 1.1)); }, { passive: true });
document.getElementById("zoomIn")?.addEventListener("click", () => G.setZoom((G.zoom || 1.7) + 0.25));
document.getElementById("zoomOut")?.addEventListener("click", () => G.setZoom((G.zoom || 1.7) - 0.25));
addEventListener("pointerdown", (e) => {
  const r = G.miniRect;
  if (!G.st || G.paused || !r || document.getElementById("hud").hidden) return;
  if (e.clientX >= r[0] && e.clientX <= r[0] + r[2] && e.clientY >= r[1] && e.clientY <= r[1] + r[3] && !e.target.closest("button,.modal-bg")) UI.openRegionMap();
});

// 서비스 워커(오프라인 플레이 + 재방문 로딩 0초)
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("./sw.js").catch(() => {});

title();
