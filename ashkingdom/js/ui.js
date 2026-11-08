// UI — DOM 패널/모달. 게임 상태 변경은 전부 systems.js 함수를 통해서만 한다.
import * as S from "./systems.js";
import * as O from "./olympics.js";
import * as Shop from "./shop.js";
import * as MG from "./minigames.js";
import {
  ITEMS, RECIPES, BUILDINGS, BASE_LEVELS, RESEARCH, ANIMALS, VEHICLES, ROLES, JOBS, DIFFICULTY,
  CHAPTERS, ERAS, OLYMPIC_EVENTS, OLYMPICS, SHOP, STATS, ENDINGS, QUALITY, AFFIXES, BIOMES, WEATHER, SPECIALS, WSKILLS, SCOUT, RAIDER_BANDS, HEROINES, TALENTS,
} from "./data.js";
import { drawCharacter, drawCinematic } from "./render.js";
import { makeRng } from "./rng.js";
import { exportAll, importAll, saveGame, saveAccount } from "./storage.js";
import * as Net from "./net.js";
import * as Sync from "./sync.js";
import * as Sfx from "./sfx.js";
import * as Reg from "./regions.js";
import * as Meta from "./meta.js";
import * as Relics from "./relics.js";
import * as Ic from "./icons.js";
import * as Earth from "./earth.js";
import * as MM from "./matchmaking.js";
import { heroAvailable as heroReady } from "./r3d.js";

let G = null;
export function bindUI(g) { G = g; }
let viewer3d = null; // r3d.mountViewer (WebGL 가능 시)
export function setViewer(fn) { viewer3d = fn; }
const companionLook = (c) => ({ look: { skin: "#c9956d", hair: c.gender === "F" ? "long" : "short", hairColor: "#1b1410" }, gender: c.gender, equip: { body: { id: c.role === "soldier" ? "combat_vest" : "leather_jacket" }, legs: { id: "leather_pants" }, feet: { id: "boots" } } });
const mountOf = (p) => (p.mount ? (p.mount.type === "animal" ? { kind: p.mount.kind } : { id: p.mount.id }) : null);

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const icon = (id, sz = 20) => Ic.icon(id, sz, ITEMS[id]?.icon ?? "?");
const bicon = (id, sz = 30) => Ic.icon("b." + id, sz, BUILDINGS[id]?.icon);
const costStr = (c) => Object.entries(c).map(([k, v]) => `${icon(k)}${v}`).join(" ");
// 필요 재료 칸: 아이콘 크게 + 가진 수/필요 수 (부족하면 빨강)
const needTiles = (c) => `<div class="needs">${Object.entries(c).map(([k, v]) => { const h = S.countAll(G.st, k); return `<span class="need ${h >= v ? "ok" : "no"}" title="${esc(ITEMS[k]?.name ?? k)} ${h}/${v}">${icon(k, 32)}<b>${h}/${v}</b><small>${esc(ITEMS[k]?.name ?? k)}</small></span>`; }).join("")}</div>`;
const costHave = (c) => Object.entries(c).map(([k, v]) => { const h = S.countAll(G.st, k); return `<span class="${h >= v ? "ok" : "no"}">${icon(k)}${h}/${v}</span>`; }).join(" ");

// ---------------- 공용 ----------------
let lastToast = { msg: "", t: 0 };
export function toast(msg, kind = "info") {
  if (msg === lastToast.msg && performance.now() - lastToast.t < 1500) return;
  lastToast = { msg, t: performance.now() };
  const box = $("#toasts");
  const d = document.createElement("div");
  d.className = "toast " + kind;
  d.textContent = msg;
  box.appendChild(d);
  setTimeout(() => d.classList.add("out"), 2600);
  setTimeout(() => d.remove(), 3200);
}

export function modal(html, { onClose, wide, noClose } = {}) {
  G.paused++;
  const el = document.createElement("div");
  el.className = "modal-bg";
  el.innerHTML = `<div class="modal ${wide ? "wide" : ""}">${noClose ? "" : '<button class="x" aria-label="닫기">✕</button>'}<div class="mbody">${html}</div></div>`;
  document.body.appendChild(el);
  const close = () => { if (!el.isConnected) return; el.remove(); G.paused = Math.max(0, G.paused - 1); onClose && onClose(); G.refreshHud?.(); };
  el.close = close;
  el.querySelector(".x")?.addEventListener("click", close);
  el.addEventListener("click", (e) => { if (e.target === el && !noClose) close(); });
  return el;
}

export function choice(title, text, options, opts = {}) {
  return new Promise((resolve) => {
    const m = modal(`<h2>${title}</h2><p class="story">${text}</p><div class="choices">${options.map((o, i) => `<button class="btn ${o.cls || ""}" data-i="${i}" ${o.disabled ? "disabled" : ""}>${o.label}</button>`).join("")}</div>`, { noClose: !opts.closable, onClose: () => resolve(null) });
    m.querySelectorAll("[data-i]").forEach((b) => (b.onclick = () => { resolve(options[+b.dataset.i].value); m.close(); })); // resolve 먼저(닫기 콜백의 null 보다 앞서야 함)
  });
}

// 시네마틱: 대형 디테일 렌더 + 타자기 텍스트
export function cinematic(title, text, scene = {}) {
  return new Promise((resolve) => {
    G.paused++;
    const el = document.createElement("div");
    el.className = "cine";
    el.innerHTML = `<canvas></canvas><div class="cine-text"><h1>${esc(title)}</h1><p></p><button class="btn primary">계속</button></div>`;
    document.body.appendChild(el);
    const cv = el.querySelector("canvas");
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (!viewer3d) { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; cv.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0); }
    let t = 0, run = true, last = performance.now();
    if (viewer3d) {
      const p = G.st.player;
      const comps = G.st.companions.filter((c) => c.story || c.spouse).slice(0, 2).map(companionLook);
      viewer3d(cv, () => ({ look: p.look, gender: p.gender, equip: scene.crown ? { ...p.equip, head: { id: "crown" }, back: { id: "royal_robe" } } : p.equip, companions: comps }), { cinematic: true, palette: scene.palette });
    } else {
      const ctx = cv.getContext("2d");
      const frame = (now) => { if (!run) return; t += (now - last) / 1000; last = now; drawCinematic(ctx, innerWidth, innerHeight, G.st, t, scene); requestAnimationFrame(frame); };
      requestAnimationFrame(frame);
    }
    // 성우 내레이션(일레븐랩스 음성) — 설정에서 끌 수 있고, 파일이 없으면 조용히 넘어간다
    let vo = null;
    if (scene.voice && G.acc.settings.voice !== false) { try { vo = new Audio(scene.voice); vo.volume = 0.95; vo.play().catch(() => {}); } catch { vo = null; } }
    const p = el.querySelector("p");
    let i = 0;
    const iv = setInterval(() => { p.textContent = text.slice(0, ++i); if (i >= text.length) clearInterval(iv); }, 28);
    el.querySelector("button").onclick = () => { if (i < text.length) { i = text.length; p.textContent = text; return; } run = false; clearInterval(iv); if (vo) { vo.pause(); vo = null; } el.remove(); G.paused = Math.max(0, G.paused - 1); resolve(); };
  });
}

function itemTip(s) {
  const it = ITEMS[s.id];
  const bits = [];
  if (it.desc) bits.push(esc(it.desc));
  if (it.raw) bits.push('<span class="no">⚠ 날것: 그냥 먹으면 병에 걸릴 수 있음 — 모닥불에서 익히거나 끓이세요</span>');
  if (it.tool) bits.push("채집: " + Object.keys(it.tool).map((k) => ({ wood: "나무", stone: "돌·광석", scrap: "고철", fiber: "섬유", fish: "낚시" })[k]).join("·") + " 빠르게");
  if (it.atk) bits.push(`공격 ${S.itemStat(s, "atk")}`);
  if (it.twoHand) bits.push("양손 무기(왼손 사용 불가)");
  if (it.req) bits.push(`<span class="${S.canWield(G.st, s.id).ok ? "ok" : "no"}">필요: ${Object.entries(it.req).map(([k, v]) => `${WSKILLS[k].name} ${v}`).join(", ")}</span>`);
  if (it.arrow) bits.push(`화살 공격 +${it.arrow.atk} · 회수율 약 ${Math.round(it.arrow.recover * 100)}%`);
  if (it.throw) bits.push(`던지기 공격 ${it.throw.atk} · 회수율 약 ${Math.round(it.throw.recover * 100)}%`);
  if (it.cap) bits.push(`화살 ${it.cap}발`);
  if (SPECIALS[s.id]) bits.push(`필살기: ${SPECIALS[s.id].name} — ${SPECIALS[s.id].desc}`);
  if (it.def || AFFIXES[s.af]?.defAdd) bits.push(`방어 ${S.itemStat(s, "def")}`);
  if (it.warm) bits.push(`보온 ${S.itemStat(s, "warm")}`);
  if (s.af) bits.push(`<span class="${AFFIXES[s.af].good ? "ok" : "no"}">특성: ${AFFIXES[s.af].name} (${AFFIXES[s.af].desc})</span>`);
  if (it.rad) bits.push(`방사능 차단 ${Math.round(it.rad * 100)}%`);
  if (it.bag) bits.push(`가방 +${it.bag}`);
  if (it.food) bits.push(Object.entries(it.food).map(([k, v]) => ({ hunger: "포만", thirst: "수분", hp: "체력", rad: "방사능", sick: "식중독" })[k] + (k === "sick" ? ` ${Math.round(v * 100)}%` : ` ${v > 0 ? "+" : ""}${v}`)).join(" "));
  if (it.med) bits.push(Object.keys(it.med).map((k) => ({ hp: `체력+${it.med.hp}`, rad: `방사능${it.med.rad}`, cure: "질병 치료", warm: "보온", revive: "사망 시 소생" })[k]).join(" "));
  if (it.spoil) bits.push(`상온 ${Math.round(it.spoil / 24 * 10) / 10}일이면 상함`);
  if (it.spoil === 0 && it.type === "food") bits.push("썩지 않음");
  return bits.join(" · ");
}

// 등급 0~4: 조악/보통/우수/명품/전설. 제작품은 품질, 그 외는 시대(era)로
export function gradeOf(s) { const it = ITEMS[s.id] || {}; return s.q !== undefined ? s.q : Math.min(4, 1 + (it.era || 0)); }
function slotHtml(s, idx, extra = "") {
  const it = ITEMS[s.id];
  const durPct = s.dur !== undefined ? Math.max(0, s.dur / s.maxDur) : null;
  const fr = s.fresh;
  // 테두리 색 = 등급(제작 품질, 없으면 시대), 모양 = 종류(무기·도구·옷·음식·의료·재료)
  const g = gradeOf(s);
  return `<button class="slot t-${it.type} g${g} ${fr !== undefined ? (fr > 0.7 ? "f-good" : fr > 0.3 ? "f-mid" : "f-bad") : ""}" data-idx="${idx}" ${extra} title="${esc(S.itemLabel(s))}">
    <span class="ic">${icon(s.id, 44)}</span><span class="nm">${esc(it.name)}</span>${s.qty > 1 ? `<span class="q">${s.qty}</span>` : ""}
    ${durPct !== null ? `<span class="bar"><i style="width:${durPct * 100}%;background:${durPct > 0.5 ? "#7ed957" : durPct > 0.2 ? "#f2c14e" : "#e5534b"}"></i></span>` : ""}
    ${fr !== undefined ? `<span class="bar fresh"><i style="width:${Math.max(0, fr) * 100}%"></i></span>` : ""}
  </button>`;
}

// ---------------- 가방 + 장비 + 능력치 ----------------
export function openBag() {
  const st = G.st;
  const p = st.player;
  const slots = ["head", "body", "legs", "feet", "back", "quiver", "hand", "off"];
  const two = ITEMS[p.equip.hand?.id]?.twoHand;
  const slotName = { head: "머리", body: "몸", legs: "다리", feet: "발", back: "등", quiver: "활통(등)", hand: two ? "양손" : "오른손", off: two ? "왼손 (양손 무기 사용 중)" : "왼손" };
  const m = modal(`
    <h2>${Ic.icon("ui.bag", 26)} 가방 <small>${st.inv.length}/${S.bagSize(st)}칸</small></h2>
    <div class="bag-top">
      <div class="doll-wrap"><canvas id="doll" width="180" height="220"></canvas><button class="btn sm" id="detailBtn">🔍 자세히 보기·꾸미기</button></div>
      <div class="equip">${slots.map((sl) => { const e = p.equip[sl]; return `<div class="eq" data-slot="${sl}"><small>${slotName[sl]}</small>${e ? `${slotHtml(e, -1, `data-eq="${sl}"`)}<span class="nm" style="color:${QUALITY[e.q ?? 1].color}">${esc(S.itemLabel(e))}</span>` : `<span class="empty">비어 있음</span>`}</div>`; }).join("")}</div>
    </div>
    ${p.equip.quiver ? `<div class="card qcard">${icon(p.equip.quiver.id, 22)} <b>${esc(ITEMS[p.equip.quiver.id].name)}</b> ${S.quiverCount(st)}/${ITEMS[p.equip.quiver.id].cap}발 · ${Object.entries(p.equip.quiver.ammo || {}).filter(([, n]) => n > 0).map(([k, n]) => `<button class="btn sm ${k === p.equip.quiver.sel ? "on" : ""}" data-arrow="${k}">${esc(ITEMS[k].name)} ${n}</button>`).join(" ") || '<span class="muted">비어 있음</span>'} <button class="btn sm primary" id="fillQ">가방의 화살 채우기</button></div>` : ""}
    <div class="card small">무기 기술: ${Object.entries(WSKILLS).map(([k, w]) => `${w.name} <b>${p.wskills?.[k] || 0}</b>/${w.max}`).join(" · ")} <span class="muted">— 총·고급 무기는 기술이 있어야 쓸 수 있습니다(교본·훈련소)</span></div>
    <div class="stats">
      <div>Lv.${p.level} <small>(경험치 ${p.xp}/${xpNeed()})</small> · 혈통 Lv.${p.legacyLevel} · 전투력 <b>${S.combatPower(st)}</b> ${p.statPoints ? `<span class="badge">포인트 ${p.statPoints}</span>` : ""}</div>
      <div class="statrow">${STATS.map((s) => `<span>${s.name} <b>${p.stats[s.id]}</b>${p.statPoints ? `<button class="plus" data-stat="${s.id}">＋</button>` : ""}</span>`).join("")}</div>
      <div class="muted">방어 ${S.equipStat(st, "def")} · 보온 ${S.equipStat(st, "warm")} · 체감온도 ${Math.round(p.warmth)}℃ · 방사능 차단 ${Math.round(S.equipStat(st, "rad") * 100)}%</div>
    </div>
    <div class="grid">${st.inv.map((s, i) => slotHtml(s, i)).join("") || '<p class="muted">비어 있음</p>'}</div>
    <div id="itemInfo" class="iteminfo muted">아이템을 누르면 정보와 사용 버튼이 나옵니다. 막대: 초록=내구도, 파랑=신선도</div>
    ${G.atBase ? '<button class="btn" id="depositAll">📦 재료·음식 전부 기지 창고에 넣기</button>' : ""}
  `, { wide: true });
  let run = true;
  if (viewer3d) viewer3d(m.querySelector("#doll"), () => ({ look: p.look, equip: p.equip, gender: p.gender }), { spin: false });
  else {
    const doll = m.querySelector("#doll").getContext("2d");
    let t = 0;
    const anim = () => { if (!run || !m.isConnected) return; t += 0.05; doll.clearRect(0, 0, 180, 220); drawCharacter(doll, 90, 200, p.look, p.equip, 1, t, { scale: 4.2, detail: true, gender: p.gender, mount: null }); requestAnimationFrame(anim); };
    anim();
  }
  m.querySelectorAll("[data-stat]").forEach((b) => (b.onclick = () => { S.spendStat(st, b.dataset.stat); run = false; m.close(); openBag(); }));
  m.querySelector("#detailBtn").onclick = () => { run = false; m.close(); openDetail(); };
  m.querySelector("#depositAll")?.addEventListener("click", () => { const n = S.depositAll(st, (s) => ["res", "food"].includes(ITEMS[s.id].type) && s.id !== "water_clean"); toast(`${n}개를 창고에 넣었습니다`); run = false; m.close(); openBag(); });
  const info = m.querySelector("#itemInfo");
  m.querySelectorAll(".grid .slot").forEach((b) => (b.onclick = () => {
    const i = +b.dataset.idx, s = st.inv[i], it = ITEMS[s.id];
    const acts = [];
    if (it.slot) {
      const cw = S.canWield(st, s.id);
      if (!cw.ok) acts.push([`🔒 ${cw.why}`, () => toast(cw.why, "warn")]);
      else {
        acts.push([it.slot === "hand" ? (it.twoHand ? "양손으로 들기" : "오른손에 들기") : "장착", () => S.equipFromInv(st, i)]);
        if (it.slot === "hand" && !it.twoHand) acts.push(["왼손에 들기", () => S.equipFromInv(st, i, true)]);
      }
    }
    if (it.book) acts.push(["📖 읽기 (기술 배우기)", () => { const r = S.readBook(st, s.id); toast(r.ok ? `${WSKILLS[r.skill].name} ${r.lv}단계를 익혔다!` : r.why, r.ok ? "good" : "warn"); }]);
    if (it.throw || s.id === "stone") acts.push(["던질 무기로 고르기 (R)", () => { G.throwSel = s.id; toast(`던지기: ${it.name}`); }]);
    if (s.id === "sleeping_bag") acts.push(["침낭 펴고 자기", () => { m.close(); G.sleep(G.atBase && S.hasBuilding(st, "bed") ? "bed" : "bag"); }]);
    if (it.type === "food" || it.type === "med" || s.id === "rotten_food") acts.push([it.type === "food" ? "먹기/마시기" : "사용", () => { const r = S.useItem(st, i); if (r.sick) toast("배탈이 났습니다! 🤢", "bad"); if (r.why) toast(r.why); }]);
    if (s.dur !== undefined && s.dur < s.maxDur && S.hasStation(st, "workbench") && G.atBase) acts.push([`수리 (${costStr(S.repairCost(s.id))}, 최대내구 -10%)`, () => { if (!S.repair(st, s)) toast("재료 또는 작업대가 없습니다", "bad"); }]);
    if (G.atBase && S.allStorage(st).length) acts.push(["창고에 보관", () => { if (s.dur !== undefined) { const b2 = S.allStorage(st).find((x) => x.storage.length < BUILDINGS[x.id].storage.slots); if (b2) { b2.storage.push(s); st.inv.splice(i, 1); } } else { const n = S.storeToBase(st, s.id, s.qty, s.fresh ?? 1); s.qty -= n; if (s.qty <= 0) st.inv.splice(st.inv.indexOf(s), 1); } }]);
    acts.push(["버리기", () => st.inv.splice(i, 1)]);
    info.innerHTML = `<b style="color:${QUALITY[s.q ?? 1].color}">${icon(s.id, 22)} ${esc(S.itemLabel(s))}</b> ${s.qty > 1 ? "×" + s.qty : ""} ${s.dur !== undefined ? `· 내구도 ${Math.ceil(s.dur)}/${s.maxDur}` : ""} ${s.fresh !== undefined ? `· ${S.freshLabel(s.fresh)} (${Math.round(s.fresh * 100)}%)` : ""}<br><small>${itemTip(s)}</small><div class="acts">${acts.map((a, k) => `<button class="btn sm" data-a="${k}">${a[0]}</button>`).join("")}</div>`;
    info.querySelectorAll("[data-a]").forEach((x) => (x.onclick = () => { acts[+x.dataset.a][1](); run = false; m.close(); openBag(); }));
  }));
  // 장착한 것을 누르면: 특성이 있으면 숫돌로 지울지, 아니면 벗기
  m.querySelectorAll("[data-eq]").forEach((b) => (b.onclick = async () => {
    const sl = b.dataset.eq, e = p.equip[sl];
    if (e?.af && S.count(st.inv, "whetstone") > 0) {
      const v = await choice("장비", `${esc(S.itemLabel(e))} — 특성: ${AFFIXES[e.af].name} (${AFFIXES[e.af].desc})`, [{ label: "🪨 정화 숫돌로 특성 지우기", value: "w", cls: "primary" }, { label: "벗기", value: "u" }, { label: "취소", value: 0 }], { closable: true });
      if (v === "w") { const r = S.removeAffix(st, sl); toast(r.ok ? `'${r.name}' 특성을 지웠다` : r.why, r.ok ? "good" : "bad"); }
      else if (v === "u" && !S.unequip(st, sl)) toast("가방이 가득 찼습니다", "bad");
    } else if (!S.unequip(st, sl)) toast("가방이 가득 찼습니다", "bad");
    run = false; m.close(); G.afterAction(); openBag();
  }));
  m.querySelector("#fillQ")?.addEventListener("click", () => { const n = S.loadQuiver(st); toast(n ? `화살 ${n}발을 활통에 담았다` : "담을 화살이 없거나 활통이 가득 찼습니다", n ? "good" : "warn"); run = false; m.close(); G.afterAction(); openBag(); });
  m.querySelectorAll("[data-arrow]").forEach((b) => (b.onclick = () => { p.equip.quiver.sel = b.dataset.arrow; run = false; m.close(); G.afterAction(); openBag(); }));
  function xpNeed() { return Math.floor(100 * Math.pow(p.level, 1.5)); }
}

// 자세히 보기 + 꾸미기 (외형은 능력치에 영향 없음)
export function openDetail() {
  const p = G.st.player;
  const skins = ["#f1c9a5", "#d9a982", "#b98c6a", "#8d5e3c", "#5c3b25"];
  const hairs = p.gender === "F" ? ["long", "pony", "short", "mohawk"] : ["short", "beard", "mohawk", "long", "pony"];
  const hairNames = { short: "짧은 머리", long: "긴 머리", pony: "묶은 머리", mohawk: "모히칸", beard: "수염" };
  const colors = ["#2b211b", "#111111", "#6b4a2b", "#b08850", "#d8d0c0", "#8a2b2b"];
  const m = modal(`<h2>🔍 ${esc(p.name)}</h2>
    <canvas id="big" width="300" height="360" class="bigdoll"></canvas>
    ${G.r3d && heroReady(p.gender) ? `<p class="muted small">실사 3D 모델(힉스필드 생성)로 표시 중입니다. 피부·머리는 모델에 새겨져 있어 바꿀 수 없고, 아래 설정은 실사 모델이 없는 기기의 기본 캐릭터에 적용됩니다.</p>` : ""}
    <div class="pick"><small>피부</small>${skins.map((c) => `<button class="sw" style="background:${c}" data-skin="${c}"></button>`).join("")}</div>
    <div class="pick"><small>머리</small>${hairs.map((h) => `<button class="btn sm" data-hair="${h}">${hairNames[h]}</button>`).join("")}</div>
    <div class="pick"><small>머리색</small>${colors.map((c) => `<button class="sw" style="background:${c}" data-hc="${c}"></button>`).join("")}</div>
    <p class="muted">드래그해서 돌려 보세요. 옷·무기·탈것은 장착하면 그대로 모습에 반영됩니다. 맨몸(기본 속옷)에서 시작해 입는 옷에 따라 실루엣이 바뀝니다.</p>`, { wide: true });
  const mountObj = mountOf(p);
  if (viewer3d) { viewer3d(m.querySelector("#big"), () => ({ look: p.look, equip: p.equip, gender: p.gender, mount: mountObj }), { spin: true }); }
  const ctx = viewer3d ? null : m.querySelector("#big").getContext("2d");
  let t = 0;
  const draw = () => {
    if (!ctx) return;
    if (!m.isConnected) return;
    t += 0.04;
    const g = ctx.createLinearGradient(0, 0, 0, 360); g.addColorStop(0, "#2a2420"); g.addColorStop(1, "#4b3a2c");
    ctx.fillStyle = g; ctx.fillRect(0, 0, 300, 360);
    drawCharacter(ctx, 150, 330, p.look, p.equip, 1, t, { scale: mountObj ? 5 : 7.5, detail: true, gender: p.gender, mount: mountObj });
    requestAnimationFrame(draw);
  };
  draw();
  m.querySelectorAll("[data-skin]").forEach((b) => (b.onclick = () => (p.look.skin = b.dataset.skin)));
  m.querySelectorAll("[data-hair]").forEach((b) => (b.onclick = () => (p.look.hair = b.dataset.hair)));
  m.querySelectorAll("[data-hc]").forEach((b) => (b.onclick = () => (p.look.hairColor = b.dataset.hc)));
}

// ---------------- 제작 ----------------
export function openCraft() {
  const st = G.st;
  const groups = { null: "맨손", campfire: "모닥불", workbench: "작업대", forge: "대장간", kitchen: "주방", smokehouse: "훈제실", lab: "연구소" };
  const list = RECIPES.filter((r) => S.researched(st, r.research));
  const qo = S.qualityOdds(st, "workbench"), ao = S.affixOdds(st, "workbench");
  const m = modal(`<h2>${Ic.icon("ui.craft", 26)} 제작</h2><p class="muted">시설이 필요한 제작은 기지 안에서만 가능합니다. 기지 창고의 재료도 자동으로 사용됩니다.</p>
    <div class="card"><b>🎲 제작 품질 확률</b> <small class="muted">(손재주 ${st.player.stats.cra}${JOBS[st.player.job].perks.luck ? " · 행운" : ""} · 혈통 ${st.player.legacyLevel} · 작업대 기준, 대장간은 더 좋음)</small><br>
    ${QUALITY.map((q, i) => `<span style="color:${q.color}">${q.name || "보통"} ${(qo[i] * 100).toFixed(1)}%</span>`).join(" · ")}<br>
    <small>좋은 특성 <span class="ok">${(ao.good * 100).toFixed(0)}%</span> · 나쁜 특성 <span class="no">${(ao.bad * 100).toFixed(0)}%</span> — 손재주를 올리면 좋은 결과가 늘고 나쁜 결과가 줄어듭니다. 소모품은 솜씨에 따라 '대성공'으로 1개 더.</small></div>
    ${Object.entries(groups).map(([k, name]) => {
      const rs = list.filter((r) => String(r.station) === k);
      if (!rs.length) return "";
      const has = k === "null" || S.hasStation(st, k);
      return `<h3>${name} ${has ? "" : '<small class="no">(미건설)</small>'}</h3><div class="rlist">${rs.map((r) => {
        const can = has && S.canAfford(st, r.in) && (k === "null" || G.atBase);
        return `<div class="recipe ${can ? "" : "dim"}"><span class="ic slot t-${ITEMS[r.out[0]].type} g${gradeOf({ id: r.out[0] })}">${icon(r.out[0], 44)}</span><div class="rinfo"><b>${ITEMS[r.out[0]].name}${r.out[1] > 1 ? " ×" + r.out[1] : ""}</b><small class="muted">${itemTip({ id: r.out[0] })}</small></div>${needTiles(r.in)}<button class="btn sm" data-r="${r.id}" ${can ? "" : "disabled"}>제작</button></div>`;
      }).join("")}</div>`;
    }).join("")}
    <h3>탈것</h3><div class="rlist">${Object.entries(VEHICLES).map(([id, v]) => `<div class="recipe"><span class="ic slot">${Ic.icon("v." + id, 44, v.icon)}</span><div class="rinfo"><b>${v.name}</b><small class="muted">이동 ×${v.mount} · 연구: ${RESEARCH.find((r) => r.id === v.research).name}</small></div>${needTiles(v.cost)}<button class="btn sm" data-v="${id}" ${st.vehicles.includes(id) ? "disabled" : ""}>${st.vehicles.includes(id) ? "보유" : "제작"}</button></div>`).join("")}</div>`, { wide: true });
  m.querySelectorAll("[data-r]").forEach((b) => (b.onclick = () => { const r = S.craft(st, b.dataset.r, { atBase: G.atBase }); if (r.ok) Meta.addActivity(st, "craft"); Sfx.play(r.ok ? "craft" : "bad"); toast(!r.ok ? r.why : r.quality?.label ? `${r.quality.q >= 3 ? "🌟 " : ""}${r.quality.label} 제작!${r.quality.af ? (AFFIXES[r.quality.af].good ? " (좋은 특성!)" : " (나쁜 특성…)") : ""}` : r.quality?.bonus ? `대성공! ${ITEMS[r.id].name} ×${r.q}` : `${ITEMS[r.id].name} ×${r.q} 제작!`, !r.ok ? "bad" : r.quality?.q === 0 || (r.quality?.af && !AFFIXES[r.quality.af].good) ? "warn" : "good"); m.close(); G.afterAction(); openCraft(); }));
  m.querySelectorAll("[data-v]").forEach((b) => (b.onclick = () => { const r = S.buildVehicle(st, b.dataset.v); toast(r.ok ? "제작 완료!" : r.why, r.ok ? "good" : "bad"); m.close(); openCraft(); }));
}

// ---------------- 기지 ----------------
export function openBase(tab = "build") {
  const st = G.st;
  const L = BASE_LEVELS[st.base.lv - 1], next = BASE_LEVELS[st.base.lv];
  const why = S.canUpgradeBase(st);
  const tabs = { build: "건설", quest: "의뢰", storage: "창고", research: "연구", train: "훈련", defense: "방어·원정", life: "생활" };
  let body = "";
  if (tab === "build") {
    body = `<div class="card"><b>🏰 ${L.name} (Lv.${st.base.lv})</b> · 부지 ${st.base.buildings.length}/${L.slots} · 주민 ${st.companions.length}/${S.residentCap(st)}
      ${Meta.buildState(st) ? buildCard(st) : next ? `<div>다음: <b>${next.name}</b> <small class="muted">공사 ${fmtMin(Meta.BUILD_MIN[st.base.lv + 1])}</small></div>${needTiles(S.baseUpgradeCost(st))}<button class="btn primary" id="upg" ${why ? "disabled" : ""}>거점 확장</button> ${why ? `<small class="no">${why}</small>` : ""}` : "<div>최대 레벨 — 새 수도</div>"}</div>
      <h3>건설된 시설</h3><div class="chips">${st.base.buildings.map((b) => `<span class="chip">${bicon(b.id, 20)} ${BUILDINGS[b.id].name}${b.id === "generator" ? (b.fueled ? " ⚡" : " ⛽없음") : ""}<button class="mini" data-demo="${b.uid}" title="철거(재료 절반 회수)">✕</button></span>`).join("") || '<span class="muted">아직 없음</span>'}</div>
      <h3>건설 가능</h3><div class="rlist">${Object.entries(BUILDINGS).filter(([, d]) => d.baseLv <= st.base.lv + 1).map(([id, d]) => {
        const w = S.canBuild(st, id);
        return `<div class="recipe ${w ? "dim" : ""}"><span class="ic slot g1">${bicon(id, 44)}</span><div class="rinfo"><b>${d.name}</b> <small>${S.countB(st, id)}/${d.max}</small><small class="muted">${buildingDesc(d)}${w ? ` — <span class="no">${w}</span>` : ""}</small></div>${needTiles(S.buildCost(st, id))}<button class="btn sm" data-b="${id}" ${w ? "disabled" : ""}>건설</button></div>`;
      }).join("")}</div>`;
  } else if (tab === "quest") {
    const qs = S.questBoard(st);
    body = `<p class="muted">주민들의 부탁입니다. 매일(게임 하루) 새로 3개가 올라옵니다. 채집 의뢰는 물건을 건네면 완료됩니다.</p>
      <div class="rlist">${qs.map((q) => { const pr = S.questProgress(st, q); const ok = pr >= q.n && !q.done; return `<div class="recipe ${q.done ? "dim" : ""}"><span class="ic">${q.kind === "gather" ? icon(q.item, 30) : q.kind === "kill" ? "⚔️" : q.kind === "tame" ? "🐾" : "🛠️"}</span><div><b>${esc(q.title)}</b> <small class="muted">— ${esc(q.from)}</small><small>${q.kind === "gather" ? `${ITEMS[q.item].name} ${pr}/${q.n}개 건네기` : q.kind === "kill" ? `적 ${pr}/${q.n} 처치` : q.kind === "tame" ? `동물 ${pr}/${q.n} 길들이기` : `제작 ${pr}/${q.n}회`}</small><small class="muted">보상: 금화 ${q.reward.gold || 0} · 경험치 ${q.reward.xp || 0}${q.reward.item ? ` · ${ITEMS[q.reward.item[0]].name}×${q.reward.item[1]}` : ""}</small></div><button class="btn sm ${ok ? "primary" : ""}" data-q="${q.id}" ${ok ? "" : "disabled"}>${q.done ? "완료" : "보상"}</button></div>`; }).join("")}</div>`;
  } else if (tab === "storage") {
    const stores = S.allStorage(st);
    body = stores.length ? stores.map((b) => `<div class="card"><b>${bicon(b.id, 22)} ${BUILDINGS[b.id].name}</b> <small>${b.storage.length}/${BUILDINGS[b.id].storage.slots}칸 · 부패 속도 ×${S.storageMult(st, b).toFixed(2)}${BUILDINGS[b.id].storage.needPower && !S.hasPower(st) ? ' <span class="no">정전!</span>' : ""}</small>
      <div class="grid">${b.storage.map((s, i) => slotHtml(s, i, `data-b="${b.uid}"`)).join("") || '<span class="muted">비어 있음</span>'}</div></div>`).join("") + `<p class="muted">보관 방식에 따라 썩는 속도가 다릅니다: 가방 ×1 · 상자 ×0.8 · 지하저장고 ×0.4 · 냉장고 ×0.15(전력 필요). 요리사 주민은 기지 음식 부패를 더 늦춥니다. 주민은 하루 1개씩 가장 상하기 직전인 음식부터 먹습니다.</p>`
      : `<p>창고가 없습니다. 나무 상자를 먼저 지으세요.</p>`;
  } else if (tab === "research") {
    const cur = st.base.research.current;
    const era = S.currentEra(st);
    body = `<div class="card">시대: <b>${ERAS[era].name}</b> — ${ERAS[era].desc}<br>연구 포인트 <b>${Math.floor(st.base.research.points)}</b> <small class="muted">(연구자 주민 +6/일, 연구소 +3/일)</small>
      ${cur ? `<div>진행 중: <b>${RESEARCH.find((r) => r.id === cur).name}</b> <button class="btn sm" id="speed">💎${Shop.researchSpeedupCost(st)} 즉시 완료</button></div>` : ""}</div>
      <div class="rlist">${RESEARCH.map((r) => { const done = st.base.research.done.includes(r.id); const lock = r.era > era + 1; return `<div class="recipe ${done || lock ? "dim" : ""}"><span class="ic">${done ? "✅" : lock ? "🔒" : "🔬"}</span><div><b>${r.name}</b> <small>${r.cost}pt · ${ERAS[r.era].name}</small><small class="muted">${r.desc}</small></div>${done ? "" : `<button class="btn sm" data-res="${r.id}" ${lock || cur === r.id ? "disabled" : ""}>${cur === r.id ? "진행 중" : "연구"}</button>`}</div>`; }).join("")}</div>`;
  } else if (tab === "defense") {
    const raidIn = st.nextRaidDay - S.day(st);
    body = `<div class="card">🛡️ 기지 방어력 <b>${S.baseDefense(st)}</b> · 전투력 <b>${S.combatPower(st)}</b><br>다음 습격: <b>${raidIn <= 0 ? "오늘 밤" : raidIn + "일 후"}</b> (예상 병력 ${S.raidStrength(st, st.nextRaidDay)})</div>
      ${st.story.chapter >= 12 ? `<div class="card"><b>🌍 세계 재건 원정</b> — 복구율 ${st.story.restore}%<br>필요 전투력 ${S.expeditionReq(st)} (현재 ${S.combatPower(st)})<br><button class="btn primary" id="exped">원정대 파견</button></div>` : '<p class="muted">에필로그(왕국 선포 이후)부터 세계 재건 원정이 열립니다.</p>'}`;
  } else if (tab === "train") {
    const mx = S.trainMaxLv(st);
    body = `<div class="card">🎯 <b>훈련소</b> — 총·고급 무기는 기술이 있어야 다룰 수 있습니다. 교본(약탈자·재의 기사가 떨어뜨림)을 읽거나 여기서 금화로 배웁니다.<br>
      ${mx ? `이 훈련소는 <b>${mx}단계</b>까지 가르칩니다${mx < 2 ? " (기지 Lv5 석조 성채가 되면 2단계)" : ""}.` : '<span class="no">훈련소가 없습니다 — [건설]에서 훈련소(기지 Lv3)를 지으세요.</span>'}</div>
      <div class="rlist">${Object.entries(WSKILLS).map(([k, w]) => { const cur = st.player.wskills?.[k] || 0; const cost = w.gold[cur]; const r = cur >= w.max ? "최고 단계" : cur + 1 > mx ? "훈련소 단계 부족" : st.gold < cost ? `금화 ${cost} 필요` : "";
        return `<div class="recipe"><span class="ic slot">${k === "firearms" ? icon("rifle", 40) : icon("machete", 40)}</span><div class="rinfo"><b>${w.name} ${cur}/${w.max}</b><small class="muted">${k === "firearms" ? "1: 파이프 권총 · 2: 소총" : "1: 마체테 · 2: 왕검"}</small></div><span></span><button class="btn sm" data-train="${k}" ${r ? "disabled" : ""}>${r || `배우기 (금화 ${cost})`}</button></div>`; }).join("")}</div>`;
  } else if (tab === "life") {
    const bed = S.hasBuilding(st, "bed");
    body = `<div class="card">🛏️ 잠자기: 다음 날 아침까지 시간을 보내며 체력을 회복합니다. ${bed ? `<button class="btn" id="sleep">잠자기</button>` : '<span class="no">침대 필요</span>'}</div>
      <div class="card">🔥 모닥불 근처에선 따뜻합니다. 핵겨울엔 기지 밖 체감온도가 영하로 떨어집니다.</div>
      <div class="card">⛽ 발전기 연료: 기지 창고에 연료(🛢️)가 있으면 하루 1개씩 자동 소비. 꺼지면 냉장고가 멈춥니다.</div>`;
  }
  const m = modal(`<h2>${Ic.icon("ui.base", 26)} 기지</h2><div class="tabs">${Object.entries(tabs).map(([k, v]) => `<button class="tab ${k === tab ? "on" : ""}" data-tab="${k}">${v}</button>`).join("")}</div>${body}`, { wide: true });
  const re = (t = tab) => { m.close(); G.afterAction(); openBase(t); };
  m.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => re(b.dataset.tab)));
  m.querySelectorAll("[data-train]").forEach((b) => (b.onclick = () => { const r = S.train(st, b.dataset.train); toast(r.ok ? `${WSKILLS[b.dataset.train].name} ${r.lv}단계를 익혔다!` : r.why, r.ok ? "good" : "bad"); re("train"); }));
  m.querySelectorAll("[data-speed]").forEach((b) => (b.onclick = () => { speedUse(st, b.dataset.speed); re(); }));
  m.querySelector("#upg")?.addEventListener("click", async () => { const r0 = Meta.startBuild(st, S); if (r0.ok) { Meta.addActivity(st, "build"); toast(`🔨 확장 공사 시작 (${fmtMin(r0.minutes)}) — 오프라인에도 진행됩니다`, "good"); re(); return; } const r = { ok: false, why: r0.why }; if (r.ok) { m.close(); G.afterAction(); await cinematic(`🏰 ${BASE_LEVELS[st.base.lv - 1].name}`, `기지가 커졌다. 성벽은 높아지고, 사람들의 목소리도 커졌다. 이제 ${BASE_LEVELS[st.base.lv - 1].slots}개의 시설을 세울 수 있다.`, { palette: ["#1d2433", "#4a4a5e", "#b7884f"] }); openBase(); } else toast(r.why, "bad"); });
  m.querySelectorAll("[data-b]").forEach((b) => {
    if (tab === "build") b.onclick = () => { const r = S.build(st, b.dataset.b); Sfx.play(r.ok ? "build" : "bad"); toast(r.ok ? "건설 완료!" : r.why, r.ok ? "good" : "bad"); re(); };
  });
  if (tab === "storage") m.querySelectorAll(".slot[data-b]").forEach((b) => (b.onclick = () => { const bb = st.base.buildings.find((x) => x.uid === b.dataset.b); if (!S.withdraw(st, bb, +b.dataset.idx)) toast("가방이 가득 찼습니다", "bad"); re(); }));
  m.querySelectorAll("[data-demo]").forEach((b) => (b.onclick = async () => { if (await choice("철거", "이 시설을 철거하고 재료 절반을 돌려받을까요?", [{ label: "철거", value: 1, cls: "danger" }, { label: "취소", value: 0 }], { closable: true })) { if (!S.demolish(st, b.dataset.demo)) toast("창고가 비어 있어야 철거할 수 있습니다", "bad"); } re(); }));
  m.querySelectorAll("[data-res]").forEach((b) => (b.onclick = () => { S.startResearch(st, b.dataset.res); re(); }));
  m.querySelectorAll("[data-q]").forEach((b) => (b.onclick = () => { const r = S.claimQuest(st, b.dataset.q); if (r) { Sfx.play("good"); toast(`의뢰 완료! 금화 +${r.gold || 0}`, "good"); } re("quest"); }));
  m.querySelector("#speed")?.addEventListener("click", () => { if (Shop.speedupResearch(G.acc, st)) { toast("연구 가속! 오늘 자정에 완료됩니다", "good"); } else toast("보석이 부족합니다", "bad"); re(); });
  m.querySelector("#exped")?.addEventListener("click", async () => {
    m.close();
    const r = await G.playShooter({ title: "세계 재건 원정", enemyCount: 18, enemyHp: 60, enemyAtk: 12, duration: 40 }, S.expeditionReq(st));
    const rr = S.expedition(st, makeRng(Date.now()));
    const win = r.win || rr.win;
    if (win && !rr.win) { st.story.restore = Math.min(100, st.story.restore + 2); }
    toast(win ? `🌍 지역 복구 성공! 세계 복구율 ${st.story.restore}%` : "원정 실패… 전력을 키워 다시 도전하세요", win ? "good" : "bad");
    G.afterAction();
  });
  m.querySelector("#sleep")?.addEventListener("click", () => { m.close(); G.sleep(); });
}

function buildingDesc(d) {
  const b = [];
  if (d.station) b.push("제작 시설");
  if (d.storage) b.push(`보관 ${d.storage.slots}칸, 부패 ×${d.storage.spoil}${d.storage.needPower ? "(전력)" : ""}`);
  if (d.defense) b.push(`방어 +${d.defense}`);
  if (d.prod) b.push("매일 " + Object.entries(d.prod).map(([k, v]) => `${icon(k)}${v}`).join(" "));
  if (d.housing) b.push(`주민 +${d.housing}`);
  if (d.animals) b.push(`동물 ${d.animals}마리`);
  if (d.heal) b.push("동료 치료");
  if (d.power) b.push(`전력 ${d.power}`);
  if (d.olympics) b.push("올림픽 개최");
  if (d.rest) b.push("잠자기·결혼");
  if (d.warm) b.push("보온");
  return b.join(" · ");
}

// ---------------- 동료/가족 ----------------
export function openPeople() {
  const st = G.st;
  const m = modal(`<h2>${Ic.icon("ui.people", 26)} 동료·주민 <small>${st.companions.length}/${S.residentCap(st)}</small></h2>
    <p class="muted">동행(최대 2명)은 함께 싸우고, 기지에 있으면 역할을 수행합니다. 매일 말을 걸거나 선물하면 호감도가 오르고, 100이 되면 청혼할 수 있습니다(결혼 반지 필요). 아이는 28일(게임) 후 어른이 되어 동료·후계자가 됩니다.</p>
    <div class="card">💍 배우자 <b>${S.spouses(st).length}/${S.maxSpouses(st)}</b> <small class="muted">(매력 ${S.eff(st, "cha")} — 매력 5마다 한 명 더) · 자녀 ${st.family.children.length}명 · 배우자 1명당 자녀 최대 2명</small></div>
    <h3>⭐ 여성 영웅 도감 ${(st.heroinesMet || []).length}/${Object.keys(HEROINES).length}</h3>
    <div class="chips">${Object.entries(HEROINES).map(([k, h]) => (st.heroinesMet || []).includes(k) ? `<span class="chip">⭐ ${h.name} <small>${h.title} · ${TALENTS[h.talent].name}</small></span>` : `<span class="chip muted">❔ ??? <small>만나는 곳: ${h.meet.map((m) => ({ apartment: "아파트", highrise: "고층 빌딩", mall: "쇼핑몰", gym: "체육관", broadcast: "방송국", power: "발전소", subway: "지하철", airport: "공항", hospital: "병원" })[m]).join("·")} · 매력 ${h.req}+</small></span>`).join("")}</div>
    <h3>동료</h3>
    ${st.companions.map((c) => {
      const r = ROLES[c.role];
      const adult = S.isAdult(c);
      return `<div class="person"><div class="pp">${c.gender === "F" ? "👩" : "👨"}${c.child && !adult ? "🍼" : ""}</div><div class="pi">
        <b>${esc(c.name)}</b> ${c.story || c.hero ? "⭐" : ""} ${c.spouse ? "💍" : ""} ${c.talent ? `<span class="badge">${TALENTS[c.talent].name}</span>` : ""} <small>${r?.icon} ${r?.name}${c.child ? ` · ${c.age || 0}일차${adult ? " (성인)" : ""}` : ""}</small>
        <small class="muted">${r?.effect}${c.bio ? " · " + esc(c.bio) : ""}</small>
        ${c.parent ? `<small class="muted">어머니: ${esc(st.companions.find((x) => x.uid === c.parent)?.name || "?")}${c.talent ? ` · 물려받은 특기 ${TALENTS[c.talent].name}(${TALENTS[c.talent].desc})` : ""}</small>` : c.talent ? `<small class="muted">특기 ${TALENTS[c.talent].name}: ${TALENTS[c.talent].desc}</small>` : ""}
        <small>호감 ${c.affinity ?? 0} · 사기 ${Math.round(c.morale ?? 70)} · ${c.task === "follow" ? "🚶 동행 중" : "🏠 기지"} · 힘${c.stats.str} 민${c.stats.agi} 체${c.stats.vit} 지${c.stats.int}</small>
        <div class="acts">
          <button class="btn sm" data-talk="${c.uid}">대화</button>
          <button class="btn sm" data-gift="${c.uid}">선물</button>
          ${adult ? `<button class="btn sm" data-task="${c.uid}">${c.task === "follow" ? "기지로" : "동행"}</button>` : ""}
          ${(c.role === "jobless" || c.child) ? `<select data-role="${c.uid}"><option value="">역할 지정…</option>${Object.entries(ROLES).map(([k, v]) => `<option value="${k}">${v.icon} ${v.name}</option>`).join("")}</select>` : ""}
          ${!c.spouse && !c.family && adult && c.gender !== st.player.gender ? `<button class="btn sm pink" data-marry="${c.uid}">💍 청혼 (${Math.round(S.proposeChance(st, c) * 100)}%)</button>` : ""}
        </div></div></div>`;
    }).join("") || '<p class="muted">아직 동료가 없습니다. 이야기를 진행하거나 기지(판잣집 이상)에 찾아오는 생존자를 받아들이세요.</p>'}`, { wide: true });
  const re = () => { m.close(); openPeople(); };
  m.querySelectorAll("[data-talk]").forEach((b) => (b.onclick = () => { const g = S.talk(st, b.dataset.talk); toast(g ? `호감도 +${g}` : "오늘은 이미 대화했습니다"); re(); }));
  m.querySelectorAll("[data-task]").forEach((b) => (b.onclick = () => { const c = st.companions.find((x) => x.uid === b.dataset.task); if (!S.assign(st, c.uid, c.task === "follow" ? "base" : "follow")) toast("동행은 최대 2명입니다", "bad"); re(); }));
  m.querySelectorAll("[data-role]").forEach((s) => (s.onchange = () => { if (s.value) S.setRole(st, s.dataset.role, s.value); re(); }));
  m.querySelectorAll("[data-marry]").forEach((b) => (b.onclick = async () => {
    const r = S.propose(st, b.dataset.marry);
    if (!r.ok) { toast(r.why, r.refused ? "warn" : "bad"); if (r.refused) re(); return; }
    m.close();
    const c = st.companions.find((x) => x.uid === b.dataset.marry);
    await cinematic("💍 결혼식", `잿빛 하늘 아래, 살아남은 이들이 모였다. ${G.st.player.name}와(과) ${c.name}은(는) 서로에게 남은 생을 약속했다. 세상이 끝났어도, 삶은 다시 시작된다.`, { palette: ["#2b2338", "#7a4b5e", "#e8b07a"] });
  }));
  m.querySelectorAll("[data-gift]").forEach((b) => (b.onclick = () => {
    const opts = st.inv.map((s, i) => [s, i]).filter(([s]) => ["food", "cloth", "misc"].includes(ITEMS[s.id].type));
    if (!opts.length) return toast("선물할 물건이 없습니다 (음식/옷/귀중품)", "bad");
    const mm = modal(`<h3>무엇을 선물할까요?</h3><div class="grid">${opts.map(([s, i]) => slotHtml(s, i)).join("")}</div>`);
    mm.querySelectorAll(".slot").forEach((x) => (x.onclick = () => { const g = S.gift(st, b.dataset.gift, +x.dataset.idx); toast(`호감도 +${g} ❤️`, "good"); mm.close(); re(); }));
  }));
}

// ---------------- 동물/탈것 ----------------
export function openAnimals() {
  const st = G.st;
  const m = modal(`<h2>${Ic.icon("ui.animals", 26)} 동물·탈것 <small>${st.animals.length}/${S.penCapacity(st)}</small></h2>
    <p class="muted">야생 동물에게 먹이를 들고 다가가 [행동]을 누르면 길들이기 미니게임. 우리에 있으면 매일 먹이를 먹고 생산(달걀·우유)하며, 같은 종 2마리 이상이면 번식합니다. 말은 '승마' 연구 후 탈 수 있습니다.</p>
    ${st.animals.map((a) => { const d = ANIMALS[a.type]; return `<div class="person"><div class="pp">${Ic.icon("a." + a.type, 40, d.icon)}</div><div class="pi"><b>${esc(a.name)}</b> <small>${a.task === "follow" ? "🚶 동행" : "🏠 우리"}${a.fed === false ? ' · <span class="no">굶주림</span>' : ""}</small>
      <small class="muted">${d.prod ? "생산 " + Object.entries(d.prod).map(([k, v]) => icon(k) + v).join(" ") + " · " : ""}${d.combat ? "전투 " + d.combat + " · " : ""}${d.mount ? "탈것 ×" + d.mount + " · " : ""}먹이 ${icon(d.food)}</small>
      <div class="acts"><button class="btn sm" data-at="${a.uid}">${a.task === "follow" ? "우리로" : "데리고 다니기"}</button>${d.mount ? `<button class="btn sm" data-ride="${a.uid}">${st.player.mount?.uid === a.uid ? "내리기" : "타기"}</button>` : ""}<button class="btn sm danger" data-sl="${a.uid}">도축</button></div></div></div>`; }).join("") || '<p class="muted">아직 길들인 동물이 없습니다.</p>'}
    <h3>🔍 동물 탐색</h3>${scoutCard(st)}
    <h3>길들일 수 있는 동물 (내 레벨 Lv.${st.player.level})</h3>
    <div class="rlist">${Object.entries(ANIMALS).sort((x, y) => (x[1].lv || 1) - (y[1].lv || 1)).map(([id, d]) => { const c = S.tameCheck(st, id); const where = Object.entries(BIOMES).filter(([, bb]) => bb.animals.includes(id)).map(([, bb]) => bb.name).slice(0, 4).join("·");
      return `<div class="recipe ${c.ok ? "" : "dim"}"><span class="ic slot">${Ic.icon("a." + id, 40, d.icon)}</span><div class="rinfo"><b>${d.name} <small class="${c.ok ? "ok" : "no"}">${c.ok ? "✅ 길들이기 가능" : "🔒 " + c.why}</small></b><small class="muted">먹이 ${icon(d.food, 16)}${ITEMS[d.food].name} · ${d.prod ? "생산 " + Object.entries(d.prod).map(([k, v]) => ITEMS[k].name + v).join(" ") : d.mount ? "탈것 ×" + d.mount : d.combat ? "전투 " + d.combat : "고기 " + d.meat} · 사는 곳: ${where || "여러 곳"}</small></div><span></span><span class="badge">Lv.${d.lv || 1}</span></div>`; }).join("")}</div>
    <h3>탈것</h3>${st.vehicles.map((v) => `<button class="btn" data-veh="${v}">${Ic.icon("v." + v, 22)} ${VEHICLES[v].name} ${st.player.mount?.id === v ? "(내리기)" : "타기"}</button>`).join(" ") || '<p class="muted">제작 메뉴에서 자전거·오토바이를 만들 수 있습니다.</p>'}`, { wide: true });
  const re = () => { m.close(); openAnimals(); };
  m.querySelectorAll("[data-at]").forEach((b) => (b.onclick = () => { const a = st.animals.find((x) => x.uid === b.dataset.at); if (a.task === "follow") a.task = "pen"; else if (st.animals.filter((x) => x.task === "follow").length < 1) a.task = "follow"; else toast("동물 동행은 1마리까지", "bad"); re(); }));
  m.querySelectorAll("[data-ride]").forEach((b) => (b.onclick = () => { if (st.player.mount?.uid === b.dataset.ride) S.mount(st, null); else if (!S.mount(st, { type: "animal", uid: b.dataset.ride })) toast("'승마' 연구가 필요합니다", "bad"); re(); }));
  m.querySelectorAll("[data-veh]").forEach((b) => (b.onclick = () => { if (st.player.mount?.id === b.dataset.veh) S.mount(st, null); else S.mount(st, { type: "vehicle", id: b.dataset.veh }); re(); }));
  m.querySelectorAll("[data-sl]").forEach((b) => (b.onclick = async () => { const a = st.animals.find((x) => x.uid === b.dataset.sl); if (await choice("도축", `${a.name}을(를) 도축해 고기 ${ANIMALS[a.type].meat}개를 얻을까요? 주민 사기가 조금 떨어집니다.`, [{ label: "도축", value: 1, cls: "danger" }, { label: "취소", value: 0 }], { closable: true })) S.slaughter(st, a.uid); re(); }));
}

// 동물 탐색 카드: 충전 수·다음 충전까지·보석/미끼로 바로 쓰기
function scoutCard(st) {
  const c = S.scoutCharges(st);
  const mins = Math.ceil(c.nextMs / 60000);
  return `<div class="card">지금 있는 지역의 야생동물 위치를 ${Math.round(SCOUT.revealSec / 60)}분 동안 미니맵에 표시합니다. 충전 <b>${c.charges}/${SCOUT.maxCharges}</b>${c.nextMs ? ` · 다음 충전까지 ${Math.floor(mins / 60)}시간 ${mins % 60}분` : ""} <small class="muted">(실제 3시간마다 1회)</small><br>
    <button class="btn sm primary" data-scout="charge" ${c.charges ? "" : "disabled"}>탐색하기</button>
    <button class="btn sm" data-scout="gem">💎${SCOUT.gemCost}로 바로</button>
    <button class="btn sm" data-scout="lure" ${S.count(st.inv, "scent_lure") ? "" : "disabled"}>🍖 냄새 미끼 (${S.count(st.inv, "scent_lure")})</button></div>`;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest?.("[data-scout]");
  if (!b || !G.st) return;
  const r = S.useScout(G.st, G.acc, b.dataset.scout);
  if (!r.ok) return toast(r.why, "bad");
  b.closest(".modal-bg")?.close?.();
  G.scoutNow();
});

// ---------------- 이야기/혈통 ----------------
export function openStory() {
  const st = G.st, acc = G.acc;
  const ch = S.chapter(st);
  const parts = S.goalProgress(st);
  const jobs = Object.entries(JOBS);
  const m = modal(`<h2>📖 ${ch.title}</h2><p class="story">${ch.text}</p>
    <div class="card"><b>목표</b>${parts.map(([t, ok]) => `<div class="${ok ? "ok" : ""}">${ok ? "✅" : "⬜"} ${t}</div>`).join("")}<small class="muted">💡 ${ch.hint}</small></div>
    <h3>지난 이야기</h3><div class="chips">${CHAPTERS.slice(0, st.story.chapter).map((c) => `<span class="chip">✔ ${c.title}</span>`).join("")}</div>
    <h3>🧬 혈통 (직업별, 죽어도 유지)</h3><div class="rlist">${jobs.map(([id, j]) => { const l = S.legacyOf(acc, id); return `<div class="recipe"><span class="ic">${Ic.icon("job." + id, 34, j.icon)}</span><div><b>${j.name} 혈통 Lv.${l.level}</b><small class="muted">누적 ${l.xp.toLocaleString()} XP · ${l.runs}번의 생애 · 최고 ${l.bestChapter}장</small><small>${j.skills.map((s) => `<span class="${s.lv <= l.level ? "ok" : "muted"}">${s.name}(Lv${s.lv})</span>`).join(" · ")}</small></div></div>`; }).join("")}</div>
    <h3>🏆 엔딩 도감 ${acc.endings.length}/16</h3><div class="chips">${jobs.map(([id, j]) => ["mercy", "tyrant"].map((pth) => { const got = acc.endings.includes(`${j.ending}:${pth}`); return `<span class="chip ${got ? "" : "dim"}">${got ? ENDINGS[j.ending][pth][0] : "???"} <small>${j.name}·${pth === "mercy" ? "자비" : "강압"}</small></span>`; }).join("")).join("")}</div>
    <p class="muted">업보(선택의 무게): ${st.karma >= 0 ? "자비로운" : "강압적인"} 지도자 (${st.karma}) — 엔딩이 달라집니다. · ${st.generation}대째 · 생존 ${st.stats.daysSurvived}일</p>
    <h3>최근 기록</h3><div class="log">${st.log.slice(-14).reverse().map((l) => `<div class="${l.kind}">${esc(l.msg)}</div>`).join("")}</div>`, { wide: true });
  return m;
}

// ---------------- 재건 올림픽 + 영토 전쟁 ----------------
const CONT_LABEL = MM.CONTINENTS;
const gradeName = (g) => MM.GRADES[g - 1]?.name || "-";
function nationHeader(st) {
  const cp = S.combatPower(st), np = MM.nationPower(st, cp), gr = MM.gradeOf(np), nx = MM.nextGrade(np);
  return { cp, np, gr, nx, html: `<div class="card"><b>🏳️ ${gr.name}</b> <small>${gr.g}급 · 국력 ${np.toLocaleString()}${nx ? ` · 다음 ${nx.name}까지 ${(nx.min - np).toLocaleString()}` : " · 최고 등급"}</small><br><small class="muted">${esc(S.geoOf(st).region)}${CONT_LABEL[MM.continentOf(S.geoOf(st).region)] !== S.geoOf(st).region ? ` (${CONT_LABEL[MM.continentOf(S.geoOf(st).region)]})` : ""} · 전투력 ${cp} · 주민 ${st.companions.length} · 성 Lv.${st.base.lv}</small></div>` };
}

// 올림픽·전쟁·급별 순위 — 나라급부터
export function openOlympics(tab = "olympics") {
  const st = G.st, acc = G.acc;
  if (!MM.isNation(st)) {
    const ok1 = st.base.lv >= MM.NATION_REQ.baseLv, ok2 = st.companions.length >= MM.NATION_REQ.residents;
    return modal(`<h2>${Ic.icon("ui.olympics", 26)} 나라가 되면 열립니다</h2>
      <p>세계 곳곳의 왕국과 겨루려면 먼저 '나라'로 인정받아야 합니다.</p>
      <div class="card"><div class="${ok1 ? "ok" : ""}">${ok1 ? "✅" : "⬜"} 거점 목책 요새(Lv.${MM.NATION_REQ.baseLv}) — 현재 Lv.${st.base.lv}</div><div class="${ok2 ? "ok" : ""}">${ok2 ? "✅" : "⬜"} 주민 ${MM.NATION_REQ.residents}명 — 현재 ${st.companions.length}명</div></div>
      <p class="muted small">나라가 되면 국력에 따라 ${MM.GRADES.map((g) => g.name).join(" → ")} 7개 급수로 나뉘고, 같은 급수끼리 올림픽·전쟁·순위를 겨룹니다.</p>`);
  }
  const sid = O.rollSeason(acc);
  const today = S.todayStr();
  const H = nationHeader(st);
  const g = S.geoOf(st);
  const me = { id: "me", name: st.player.name, lat: Math.round(g.lat * 2) / 2, lon: Math.round(g.lon * 2) / 2, continent: MM.continentOf(g.region), grade: H.gr.g, power: H.np, level: st.player.level };
  const card = MM.kingdomCard(st, H.cp);
  if (!st.__tampered) Net.publishKingdom(card).catch(() => {}); // 화면을 열 때만, 바뀐 경우 1시간 1회
  const left = Math.ceil((O.seasonEndsAt() - Date.now()) / 86400000);
  const last = O.unclaimedSeason(acc);
  const tabs = { olympics: "🏟️ 올림픽", war: "⚔️ 전쟁", rank: "🏆 급별 순위" };
  const m = modal(`<h2>${Ic.icon("ui.olympics", 26)} 세계 무대 <small>시즌 ${sid.slice(1)} · ${left}일 남음</small></h2>${H.html}
    ${last ? `<div class="card gold">지난 시즌 보상이 있습니다! <button class="btn primary" id="claimS">받기</button></div>` : ""}
    <div class="tabs">${Object.entries(tabs).map(([k, v]) => `<button class="tab ${k === tab ? "on" : ""}" data-tab="${k}">${v}</button>`).join("")}</div>
    <div id="pane"><p class="muted">불러오는 중…</p></div>
    <p class="muted small" id="netNote">${Net.enabled() ? "서버 연결: 기록은 이 화면을 열 때만, 1시간에 한 번 갱신됩니다." : "오프라인 모드: 같은 급수의 봇 국가들과 겨룹니다(서버 연결 시 실제 국가로 대체)."}</p>`, { wide: true });
  const pane = m.querySelector("#pane");
  const re = (t = tab) => { m.close(); G.afterAction(); openOlympics(t); };
  m.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => re(b.dataset.tab)));
  m.querySelector("#claimS")?.addEventListener("click", () => { const r = O.claimSeason(acc, H.gr.g, JOBS[st.player.job].perks.prize || 0); if (r) { st.gold += r.gold; toast(`시즌 조 ${r.rank}위! 💎${r.gems} 금화 ${r.gold}`, "good"); if (r.item) S.giveItem(st, r.item, 1); } re(); });
  const fail = (e) => {
    if (e?.authOff || Net.isAuthOff()) { m.close(); toast("서버 로그인 준비 전이라 오프라인(봇) 모드로 진행합니다", "warn"); openOlympics(tab); return; }
    pane.innerHTML = `<p class="no">연결 실패: ${esc(e.message || e)}</p>`;
  };
  const row = (k, extra = "") => `<div class="krow ${k.me ? "me" : ""}"><span>${extra}</span><b>${esc(k.name)}</b>${k.bot ? ' <span class="badge bot">봇</span>' : ""} <small class="muted">${CONT_LABEL[k.continent] || ""} · ${gradeName(k.grade)} · Lv.${k.level ?? "-"} · 국력 ${(k.power ?? 0).toLocaleString()}</small></div>`;

  if (tab === "olympics") (async () => {
    // 1) 조 편성: 서버(시즌당 1회) 또는 오프라인 규칙. 같은 급 → ±1급 → ±2급 → 봇
    let members, scores = {}, how;
    if (Net.enabled() && !st.__tampered) {
      const gid = await Net.joinOlympics(sid);
      const grp = await Net.fetchGroup(sid, gid);
      const myUid = Net.myId();
      const real = grp.members.map((x) => (x.id === myUid ? { ...me } : x));
      if (!real.some((x) => x.me || x.id === "me")) real.push(me);
      members = MM.fillGroupWithBots({ id: "G" + gid, grade: me.grade }, real, sid);
      scores = grp.scores; how = `실제 국가 ${real.length - 1} + 봇 ${members.length - real.length}`;
    } else {
      const pool = MM.simulatedPool(sid, me.grade);
      members = MM.composeGroupOffline(me, pool, sid);
      how = "오프라인 — 같은 급수 봇 국가";
    }
    const stn = O.groupStandings(sid, members, "me", acc.olympics.entries, scores);
    acc.olympics.rank = stn.myRank; acc.olympics.grade = me.grade;
    const contCount = Object.keys(MM.QUOTA).map((c) => `${CONT_LABEL[c]} ${members.filter((x) => x.continent === c).length}`).join(" · ");
    const dgCount = members.filter((x) => !x.bot && x.grade !== me.grade && x.id !== "me").length;
    const ents = O.entrantList(st);
    const played = OLYMPIC_EVENTS.some((ev) => acc.olympics.entries[ev.id]?.best);
    pane.innerHTML = `<div class="card"><b>${played ? `내 조 순위 ${stn.myRank}위` : "아직 출전 전"}</b> / ${members.length}개국 <small class="muted">(${how}${dgCount ? ` · 다른 급수 ${dgCount}` : ""})</small><br><small>${contCount}</small><br>
      <small class="muted">1위 💎${O.rewardFor(1).gems}+${ITEMS.royal_robe.name} · 3위 내 💎${O.rewardFor(3).gems} · 10위 내 💎${O.rewardFor(10).gems}. 종목당 하루 ${O.TRIES_PER_DAY}회, 최고 기록만 반영.</small></div>
      <label class="muted">출전 선수: <select id="ent">${ents.map((e) => `<option value="${e.uid}">${esc(e.name)}</option>`).join("")}</select></label>
      <div class="rlist">${OLYMPIC_EVENTS.map((ev) => { const r = stn.myEv[ev.id]; return `<div class="recipe"><span class="ic">${ev.icon}</span><div><b>${ev.name}</b> <small>${r ? `최고 ${r.best}점 · 조 ${r.rank}위` : "미참가"} · 오늘 ${O.triesLeft(acc, ev.id, today)}회</small><small class="muted">${Object.entries(ev.w).map(([k, w]) => STATS.find((x) => x.id === k).name + Math.round(w * 100) + "%").join(" ")}${ev.needAnimal ? " · 말 필요" : ""}</small></div>
        <div class="acts"><button class="btn sm" data-auto="${ev.id}">맡기기</button><button class="btn sm primary" data-man="${ev.id}">직접</button></div></div>`; }).join("")}</div>
      <h3>조 순위표</h3><div class="klist">${stn.rows.slice(0, 10).map((k, i) => row(k, `${i + 1}`)).join("")}${stn.myRank > 10 ? `<div class="muted">…</div>${row(stn.rows[stn.myRank - 1], String(stn.myRank))}` : ""}</div>`;
    const entrant = () => ents.find((e) => e.uid === pane.querySelector("#ent").value);
    const recs = () => OLYMPIC_EVENTS.filter((ev) => acc.olympics.entries[ev.id]?.best).map((ev) => ({ kind: ev.id, score: acc.olympics.entries[ev.id].best }));
    if (Net.enabled() && !st.__tampered && recs().length) Net.openRanking(recs(), sid, me.grade).catch(() => {});
    pane.querySelectorAll("[data-auto]").forEach((b) => (b.onclick = () => {
      const ev = OLYMPIC_EVENTS.find((e) => e.id === b.dataset.auto);
      const e = entrant(); const extra = O.eventExtra(st, ev);
      if (extra < 0) return toast("말이 있어야 출전할 수 있습니다", "bad");
      const sc = O.autoScore(sid + today, ev, e, extra);
      const r = O.submit(acc, st, ev.id, e.uid, sc, today);
      toast(r.ok ? `${ev.name}: ${sc}점${r.improved ? " 신기록!" : ""}` : r.why, r.ok ? "good" : "bad");
      re("olympics");
    }));
    pane.querySelectorAll("[data-man]").forEach((b) => (b.onclick = async () => {
      const ev = OLYMPIC_EVENTS.find((e) => e.id === b.dataset.man);
      const e = entrant(); const extra = O.eventExtra(st, ev);
      if (extra < 0) return toast("말이 있어야 출전할 수 있습니다", "bad");
      if (O.triesLeft(acc, ev.id, today) <= 0) return toast("오늘 도전 횟수를 모두 썼습니다", "bad");
      m.close();
      const p = st.player;
      let res;
      if (ev.minigame === "shooter") res = await MG.shooter({ title: "🎯 사격 종목", enemyCount: 16, enemyHp: 20, enemyAtk: 4, playerHp: 100, playerDmg: 12, fireRate: 3.5, duration: 30, look: p.look, equip: p.equip, gender: p.gender });
      else if (ev.minigame === "race") res = await MG.race({ title: ev.name, look: p.look, equip: p.equip, gender: p.gender, mount: ev.needAnimal ? { kind: "horse" } : null });
      else if (ev.id === "quiz") res = await MG.quiz({ title: "📚 구세계 퀴즈" });
      else res = await MG.timing({ title: `${ev.icon} ${ev.name}`, labels: ev.id === "cooking" ? ["손질", "불 조절", "플레이팅"] : ev.id === "build" ? ["기초", "골조", "지붕"] : ["샅바", "들배지기", "마무리"] });
      const sc = O.manualScore(ev, e, res.perf, extra);
      const r = O.submit(acc, st, ev.id, e.uid, sc, today);
      toast(r.ok ? `${ev.name}: ${sc}점${r.improved ? " 신기록!" : ""}` : r.why, "good");
      G.afterAction(); openOlympics("olympics");
    }));
  })().catch(fail);

  if (tab === "war") (async () => {
    // 2) 전쟁: 주위의 비슷한 급수 → 반경 확대 → ±1급 → ±2급 → 근처 봇
    const pool = Net.enabled() && !st.__tampered ? (await Net.fetchNeighbors(card)) || [] : MM.nearbyBotPool(me, sid);
    if (acc.war?.season !== sid) acc.war = { date: "", n: 0, score: 0, season: sid };
    if (acc.war.date !== today) Object.assign(acc.war, { date: today, n: 0 });
    const found = MM.findWarOpponents(me, pool, `${sid}|${today}|${acc.war.n}`);
    pane.innerHTML = `<div class="card">⚔️ 오늘 남은 출정 <b>${3 - acc.war.n}</b>회 · 시즌 영토 점수 <b>${acc.war.score}</b><br><small class="muted">상대 탐색: ${found.step}. 상대가 접속해 있을 필요는 없습니다(방어 기록과 싸움).</small></div>
      <div class="klist">${found.list.map((k, i) => `<div class="krow"><span>${i + 1}</span><b>${esc(k.name)}</b>${k.bot ? ' <span class="badge bot">봇</span>' : ""} <small class="muted">${k.dir}쪽 ${k.km.toLocaleString()}km · ${gradeName(k.grade)} · 국력 ${k.power.toLocaleString()}</small> <button class="btn sm danger" data-foe="${i}" ${acc.war.n >= 3 ? "disabled" : ""}>출정</button></div>`).join("")}</div>`;
    pane.querySelectorAll("[data-foe]").forEach((b) => (b.onclick = async () => {
      const foe = found.list[+b.dataset.foe];
      const go = await choice("⚔️ 출정", `<b>${esc(foe.name)}</b> (${gradeName(foe.grade)}, 국력 ${foe.power})<br>${foe.dir}쪽 ${foe.km}km<br>직접 지휘(사격전)하거나 자동 전투를 맡길 수 있습니다.`, [{ label: "직접 지휘", value: "man", cls: "primary" }, { label: "자동 전투", value: "auto" }, { label: "취소", value: null }], { closable: true });
      if (!go) return;
      acc.war.n++;
      m.close();
      const foeCombat = Math.round(foe.power * (H.cp / Math.max(1, H.np)));
      let win;
      if (go === "man") { const r = await G.playShooter({ title: `⚔️ vs ${foe.name}`, enemyCount: 14, enemyHp: 40, enemyAtk: 9, duration: 35 }, foeCombat); win = r.win; }
      else win = makeRng(`${sid}|${today}|${acc.war.n}|auto`).next() < Math.max(0.05, Math.min(0.95, 0.5 + (H.np / Math.max(1, foe.power) - 1) * 2));
      if (win) { const gold = Math.round(foe.power * 0.5); st.gold += gold; acc.war.score += 10 + Math.max(0, foe.grade - me.grade) * 5; toast(`승리! 금화 +${gold}, 영토 점수 ${acc.war.score}`, "good"); }
      else toast("패배… 방어선을 보강하세요", "bad");
      G.afterAction(); openOlympics("war");
    }));
  })().catch(fail);

  if (tab === "rank") (async () => {
    // 3) 급별 순위: 같은 급수 안에서의 국력 순위와 레벨
    const board = Net.enabled() && !st.__tampered ? ((await Net.fetchGradeBoard(me.grade)) || []).filter((k) => k.id !== Net.myId()) : MM.simulatedPool(sid, me.grade).filter((k) => k.grade === me.grade);
    const rk = MM.gradeRanking(me, board);
    const byGrade = MM.GRADES.map((x) => `<span class="chip ${x.g === me.grade ? "" : "dim"}">${x.g}급 ${x.name} <small>${x.min.toLocaleString()}+</small></span>`).join("");
    pane.innerHTML = `<div class="card"><b>${gradeName(me.grade)} 안에서 ${rk.rank}위</b> / ${rk.total}개국 · 내 레벨 Lv.${me.level} · 국력 ${me.power.toLocaleString()}</div>
      <div class="chips">${byGrade}</div>
      <h3>${gradeName(me.grade)} 상위 국가</h3><div class="klist">${rk.top.slice(0, 20).map((k, i) => row(k, String(i + 1))).join("")}${rk.rank > 20 ? `<div class="muted">…</div>${row(rk.top[rk.rank - 1] || { ...me, me: true }, String(rk.rank))}` : ""}</div>`;
  })().catch(fail);
}

// ---------------- 상점 ----------------
export function openShop() {
  const st = G.st, acc = G.acc;
  const daily = Shop.dailyState(acc, st);
  const pass = Shop.passActive(acc);
  const m = modal(`<h2>${Ic.icon("ui.shop", 26)} 상점 <small>보유 💎${acc.gems} · 부활권 ${acc.reviveTokens} · 금화 ${Math.floor(st.gold)}</small></h2>
    <div class="card warn">⚠️ 프로토타입: 아래 결제는 <b>테스트 결제</b>입니다(실제 청구 없음). 실서비스는 서버 검증 후 지급합니다.</div>
    <h3>📅 일일 미션 (무과금 보석)</h3><div class="rlist">${daily.map((d) => `<div class="recipe"><span class="ic">${d.claimed ? "✅" : "🎯"}</span><div><b>${d.name}</b><small>${d.prog}/${d.n} · 💎${d.gems}</small></div><button class="btn sm" data-daily="${d.id}" ${d.done && !d.claimed ? "" : "disabled"}>${d.claimed ? "완료" : "받기"}</button></div>`).join("")}</div>
    ${pass ? `<div class="card gold">🎖️ 생존자 월정액 이용 중 (${Math.ceil((acc.passUntil - Date.now()) / 86400000)}일 남음) <button class="btn sm" id="passDaily">오늘 💎120 받기</button></div>` : ""}
    <h3>상품</h3><div class="rlist">${SHOP.products.map((p) => `<div class="recipe"><span class="ic">${p.gems ? "💎" : p.monthly ? "🎖️" : "🎁"}</span><div><b>${p.name}</b> ${p.tag ? `<span class="badge">${p.tag}</span>` : ""}<small>${p.gems ? `💎${p.gems.toLocaleString()}` : p.desc}</small></div><button class="btn sm primary" data-buy="${p.id}" ${p.once && acc.purchases.includes(p.id) ? "disabled" : ""}>₩${p.price.toLocaleString()}</button></div>`).join("")}</div>
    <h3>보석 사용</h3><div class="rlist">
      <div class="recipe"><span class="ic">📘</span><div><b>훈련 교본</b><small>실제 1시간 동안 경험치 +50% ${st.buffs.xp ? `<span class="ok">(남은 ${Math.ceil(st.buffs.xp / 240)}분)</span>` : ""}</small></div><button class="btn sm" id="xpb">💎150</button></div>
      <div class="recipe"><span class="ic">🪂</span><div><b>보급 투하</b><small>3회 추첨 · 확률: ${Shop.SUPPLY_TABLE.map((e) => `${ITEMS[e.id].name}×${e.q} ${Math.round(e.p * 100)}%`).join(", ")}</small></div><button class="btn sm" id="supply">💎120</button></div>
    </div>
    <h3>📺 광고 보상 <small>${pass ? "월정액: 광고 없이 즉시" : `오늘 ${Shop.adsLeft(acc)}회 남음`}</small></h3>
    <div class="acts"><button class="btn" id="adSupply">광고 보고 보급 상자</button><button class="btn" id="adGems">광고 보고 💎20</button></div>
    <details><summary>과금 원칙</summary><ul>${SHOP.rules.map((r) => `<li>${r}</li>`).join("")}</ul></details>`, { wide: true });
  const re = () => { m.close(); G.afterAction(); openShop(); };
  m.querySelectorAll("[data-daily]").forEach((b) => (b.onclick = () => { const g = Shop.claimDaily(acc, st, b.dataset.daily); if (g) toast(`💎+${g}`, "good"); re(); }));
  m.querySelector("#passDaily")?.addEventListener("click", () => { const g = Shop.claimPassDaily(acc); toast(g ? `💎+${g}` : "오늘은 이미 받았습니다"); re(); });
  m.querySelectorAll("[data-buy]").forEach((b) => (b.onclick = async () => {
    const p = SHOP.products.find((x) => x.id === b.dataset.buy);
    const ok = await choice("테스트 결제", `<b>${p.name}</b> ₩${p.price.toLocaleString()}<br><small>실제 결제는 발생하지 않습니다. 실서비스는 토스페이먼츠 결제 승인 후 서버가 지급합니다.</small>`, [{ label: "결제(테스트)", value: 1, cls: "primary" }, { label: "취소", value: 0 }], { closable: true });
    if (ok) { const r = Shop.purchase(acc, st, p.id); toast(r.ok ? "구매 완료!" : r.why, r.ok ? "good" : "bad"); st.passActive = Shop.passActive(acc); }
    re();
  }));
  m.querySelector("#xpb").onclick = () => { toast(Shop.buyXpBoost(acc, st) ? "📘 훈련 교본 사용! 경험치 +50%" : "보석이 부족합니다", "good"); re(); };
  m.querySelector("#supply").onclick = () => { if (!Shop.supplyDrop(acc, st)) toast("보석이 부족합니다", "bad"); re(); };
  const ad = async (fn) => { if (!(await G.watchAd())) return; fn(); re(); };
  m.querySelector("#adSupply").onclick = () => ad(() => { const n = S.gather(st, "crate", makeRng(Date.now())); toast("보급 상자: " + n.map(([i, q]) => ITEMS[i].name + "×" + q).join(", "), "good"); });
  m.querySelector("#adGems").onclick = () => ad(() => { acc.gems += 20; toast("💎+20", "good"); });
}

// ---------------- 메뉴 ----------------
export function openMenu() {
  const st = G.st;
  const m = modal(`<h2>${Ic.icon("ui.menu", 26)} 메뉴</h2>
    <div class="card">${DIFFICULTY[st.difficulty].name} · ${JOBS[st.player.job].icon} ${JOBS[st.player.job].name} · ${esc(st.player.name)} · ${S.day(st)}일차</div>
    <div class="choices">
      <button class="btn" id="rmapb">🗺️ 지역 지도 (M)</button>
      <button class="btn" id="zz">😴 잠자기 (체력은 잠을 자야만 회복)</button>
      <button class="btn" id="save">💾 지금 저장</button>
      <button class="btn" id="exp">📤 저장 코드 내보내기 (기기 변경)</button>
      <button class="btn" id="imp">📥 저장 코드 가져오기</button>
      <button class="btn" id="cloud">☁️ 기기 연결 (PC·휴대폰 이어하기)</button>
      <button class="btn" id="settings">⚙️ 설정 (그래픽·소리)</button>
      <button class="btn" id="globe">🌍 세계 지도 · 내 위치</button>
      <button class="btn" id="news">📢 공지 · 🏛️ 명예의 전당</button>
      <button class="btn" id="rename">✏️ 랭킹 이름 변경 (하루 1회)</button>
      <button class="btn" id="help">❓ 조작법·도움말</button>
      <button class="btn" id="totitle">👥 캐릭터 선택 (저장하고 나가기)</button>
      <button class="btn danger" id="newg">🆕 새 생애 시작 (현재 세계 포기)</button>
    </div>`);
  m.querySelector("#save").onclick = () => { G.save(); toast("저장했습니다", "good"); };
  m.querySelector("#exp").onclick = () => { const code = exportAll(st, G.acc); m.close(); const mm = modal(`<h3>저장 코드</h3><textarea readonly class="code">${code}</textarea><p class="muted">다른 기기에서 [가져오기]에 붙여넣으세요.</p>`); mm.querySelector("textarea").select(); };
  m.querySelector("#imp").onclick = () => { m.close(); const mm = modal(`<h3>저장 코드 붙여넣기</h3><textarea class="code" id="code"></textarea><button class="btn primary" id="go">불러오기</button>`); mm.querySelector("#go").onclick = () => { const o = importAll(mm.querySelector("#code").value); if (!o) return toast("올바르지 않은 코드", "bad"); saveGame(o.st); saveAccount(o.acc); location.reload(); }; };
  m.querySelector("#help").onclick = () => { m.close(); help(); };
  m.querySelector("#globe").onclick = () => { m.close(); openWorldMap(); };
  m.querySelector("#cloud").onclick = () => { m.close(); openSync(); };
  m.querySelector("#settings").onclick = () => { m.close(); openSettings(); };
  m.querySelector("#news").onclick = async () => {
    m.close();
    const [ns, hof] = await Promise.all([Net.notices().catch(() => []), Net.hallOfFame().catch(() => [])]);
    modal(`<h2>📢 공지</h2>${ns.length ? ns.map((n) => `<div class="card"><b>${esc(n.title)}</b><br><small>${esc(n.body)}</small></div>`).join("") : '<p class="muted">공지가 없습니다(오프라인이거나 1시간 내 확인함).</p>'}
      <h2>🏛️ 명예의 전당</h2><p class="muted small">주간 1위는 영원히 기록됩니다. 한 번 받은 기록은 기기에 저장되고, 새 주의 1위만 주 1회 받아옵니다.</p>
      ${hof.length ? hof.slice().reverse().map((h) => `<div>${h.week}주차 · ${esc(h.kind)} · <b>${esc(h.name)}</b> ${h.score}</div>`).join("") : '<p class="muted">아직 기록이 없습니다.</p>'}`);
  };
  m.querySelector("#rename").onclick = async () => {
    m.close();
    const mm = modal(`<h3>랭킹 이름</h3><input id="rn" maxlength="10" class="code" style="height:auto;padding:10px" value="${esc(st.player.name)}"><button class="btn primary" id="ok">변경</button><p class="muted small">${Net.canRename() ? "하루에 한 번 바꿀 수 있습니다." : "오늘은 이미 바꿨습니다."}</p>`);
    mm.querySelector("#ok").onclick = async () => { try { const r = await Net.rename(mm.querySelector("#rn").value); toast(r.ok ? "변경했습니다" : r.why, r.ok ? "good" : "bad"); if (r.ok) mm.close(); } catch (e) { toast("연결 실패: " + e.message, "bad"); } };
  };
  m.querySelector("#rmapb").onclick = () => { m.close(); openRegionMap(); };
  m.querySelector("#zz").onclick = async () => {
    const bed = G.atBase && S.hasBuilding(st, "bed"), bag = S.count(st.inv, "sleeping_bag") > 0;
    const v = await choice("😴 잠자기", `아침까지 잡니다. 체력 회복: 침대 100% · 침낭 70% · 맨땅 40%.<br>${G.atBase ? "기지 안이라 안전합니다." : '<span class="no">기지 밖입니다 — 자는 동안 습격당할 수 있습니다.</span>'}`,
      [bed && { label: "🛏️ 침대에서 자기", value: "bed", cls: "primary" }, bag && { label: "🛌 침낭에서 자기", value: "bag" }, { label: "맨땅에서 자기", value: "ground" }, { label: "취소", value: 0 }].filter(Boolean), { closable: true });
    if (v) { m.close(); G.sleep(v); }
  };
  m.querySelector("#totitle").onclick = () => { G.save(); location.reload(); };
  m.querySelector("#newg").onclick = async () => { m.close(); if (await choice("새 생애", "현재 세계를 포기하고 처음부터 시작합니다. 혈통 경험치는 보존됩니다.", [{ label: "새로 시작", value: 1, cls: "danger" }, { label: "취소", value: 0 }], { closable: true })) { S.bankLegacy(st, G.acc); saveAccount(G.acc); G.newLife(); } };
}

export function help() {
  modal(`<h2>❓ 도움말</h2><ul class="help">
  <li><b>이동</b>: WASD/방향키 · 모바일은 왼쪽 아래 조이스틱</li>
  <li><b>행동</b>: E/스페이스 · 오른쪽 아래 버튼 — 가까운 자원 채집, 적 공격, 동물(길들이기/사냥), 장소 조사, 물가에서 물 뜨기(낚싯대 장착 시 낚시), 기지 중앙에서 기지 메뉴</li>
  <li><b>생존</b>: ❤️체력 🍗포만 💧수분 🌡️체온 ☢️방사능. 더러운 물은 모닥불에서 끓이세요. 상한 음식은 배탈을 일으킵니다.</li>
  <li><b>부패</b>: 음식마다 썩는 속도가 다르고(생고기 1일, 육포 25일, 통조림 무기한), 보관 장소(가방/상자/지하저장고/냉장고)와 계절에 따라 달라집니다. 썩은 음식은 퇴비가 됩니다.</li>
  <li><b>내구도</b>: 도구·무기·옷은 쓸수록 닳아 부서집니다. 작업대에서 수리하면 최대 내구도가 조금씩 줄어듭니다.</li>
  <li><b>죽음</b>: 목숨은 하나. 부활 수단이 없으면 세계가 초기화되지만 <b>혈통 경험치</b>는 남아 다음 생애가 더 강해집니다. 성인이 된 자녀가 있다면 왕국을 계승할 수 있습니다.</li>
  <li><b>꺼져 있는 동안</b>: 캐릭터는 기지에서 쉬고(굶지 않음), 기지는 최대 8시간분 생산·부패가 진행됩니다.</li></ul>`);
}

// ---------------- 지구: 낙하 지점 / 세계 지도 ----------------
function geoCard(g) {
  const temps = [0, 1, 2, 3].map((i) => Math.round(S.seasonTemp(g, i)));
  return `<div class="card"><b>${Ic.icon("ui.globe", 20)} ${esc(g.region)} · ${BIOMES[g.biome].name}</b><br>
    <small>${Earth.fmtCoord(g.lat, g.lon)} · 옛 ${esc(g.city.name)}에서 ${g.city.km.toLocaleString()}km${g.coast ? " · 해안" : " · 내륙"}${g.south ? " · 남반구" : ""}</small><br>
    <small class="muted">계절 기온(핵겨울 포함): ${temps.map((t, i) => `${["봄", "여름", "가을", "겨울"][i]} ${t}℃`).join(" · ")} · 강수 ${g.P > 0.8 ? "매우 많음" : g.P > 0.45 ? "보통" : g.P > 0.22 ? "적음" : "거의 없음"}</small></div>`;
}
export function spawnReveal() {
  const g = S.geoOf(G.st);
  return new Promise((resolve) => {
    const m = modal(`<h2>${Ic.icon("ui.globe", 26)} 낙하 지점</h2>
      <canvas id="earth" class="earthmap" width="720" height="360"></canvas>
      ${geoCard(g)}
      <p class="story">수많은 생존자가 지구 곳곳에서 눈을 떴다. 당신이 깨어난 곳은 <b>${esc(g.region)}</b>의 ${BIOMES[g.biome].name}. 땅과 날씨는 다르지만, 살아남아 나라를 세워야 한다는 사실은 모두에게 같다.</p>
      <button class="btn primary big" id="ok">이곳에서 살아남는다</button>`, { wide: true, noClose: true, onClose: resolve });
    const ctx = m.querySelector("#earth").getContext("2d");
    let t = 0;
    const anim = () => { if (!m.isConnected) return; t += 1; Earth.drawEarthMap(ctx, 720, 360, [{ lat: g.lat, lon: g.lon, r: 6 + Math.abs(Math.sin(t / 15)) * 10 }]); if (t < 600) requestAnimationFrame(anim); };
    anim();
    m.querySelector("#ok").onclick = () => m.close();
  });
}
// ---------------- 기지 공사 · 가속 ----------------
const fmtMin = (m) => (m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? " " + (m % 60) + "분" : ""}` : `${Math.ceil(m)}분`);
function buildCard(st) {
  const b = Meta.buildState(st), left = Math.ceil(b.left / 60000), pct = Math.round((1 - b.left / b.total) * 100);
  const items = Object.entries(Meta.SPEED_ITEMS).filter(([k]) => S.count(st.inv, k) > 0);
  const free = Meta.vipPerk(G.acc).speed, freeUsed = G.acc.vipSpeedDay === Math.floor(Date.now() / 86400e3);
  return `<div>🔨 <b>${BASE_LEVELS[b.to - 1].name}</b>(으)로 확장 공사 중 · 남은 시간 <b>${fmtMin(left)}</b></div>
    <div class="hb th" style="height:10px;margin:6px 0"><i style="width:${pct}%"></i></div>
    <div class="acts">${items.map(([k, mm]) => `<button class="btn sm" data-speed="${k}">${ITEMS[k].icon} ${ITEMS[k].name} (${S.count(st.inv, k)})</button>`).join("")}
    ${free && !freeUsed ? `<button class="btn sm" data-speed="vip">👑 VIP 무료 가속 ${free}분</button>` : ""}
    <button class="btn sm" data-speed="ad">📺 광고 보고 30분</button>
    <button class="btn sm primary" data-speed="gem">💎${Meta.gemsToFinish(st)} 즉시 완료</button></div>
    <small class="muted">기다리면 무료(오프라인에도 진행). 가속은 출석·활동 상자·보스에서도 얻습니다.</small>`;
}
function speedUse(st, k) {
  if (Meta.SPEED_ITEMS[k]) { if (S.count(st.inv, k) < 1) return; S.removeFrom(st.inv, k, 1); Meta.speedBuild(st, Meta.SPEED_ITEMS[k]); }
  else if (k === "vip") { G.acc.vipSpeedDay = Math.floor(Date.now() / 86400e3); Meta.speedBuild(st, Meta.vipPerk(G.acc).speed); }
  else if (k === "ad") { if (!Shop.watchAd(G.acc)) return toast("오늘 광고 보상을 다 받았습니다", "warn"); Meta.speedBuild(st, 30); }
  else if (k === "gem") { const g = Meta.gemsToFinish(st); if (G.acc.gems < g) return toast(`보석 ${g} 필요`, "bad"); G.acc.gems -= g; Meta.speedBuild(st, 1e7); }
  Meta.finishBuildIfDone(st, S);
  G.save(); G.afterAction();
}

// ---------------- 일일·VIP·원정 ----------------
export function openDaily(tab = "attend") {
  const st = G.st, acc = G.acc;
  const tabs = { attend: "출석", activity: "활동 상자", vip: "VIP", exp: "원정 채집" };
  let body = "";
  if (tab === "attend") {
    const a = Meta.attendState(acc);
    body = `<p class="muted">매일 접속하면 받습니다(7일 순환). 연속 접속할수록 VIP 점수도 더 많이 오릅니다. 연속 ${a.streak}일 · 누적 ${a.total}일</p>
      <div class="grid">${Meta.ATTEND.map((r, i) => `<div class="slot g${i === 6 ? 4 : 1} ${i < a.dayIndex || (i === a.dayIndex && !a.canClaim) ? "dim" : ""}" style="${i === a.dayIndex && a.canClaim ? "outline:2px solid var(--accent)" : ""}"><span class="ic">${r.item ? icon(r.item[0], 36) : r.key ? "🗝️" : Ic.icon("ui.gem", 36)}</span><span class="nm">${i + 1}일 · ${r.gems ? "💎" + r.gems : ""}${r.item ? " " + ITEMS[r.item[0]].name + "×" + r.item[1] : ""}${r.key ? " 금고 열쇠" : ""}</span></div>`).join("")}</div>
      <button class="btn primary big" id="att" ${a.canClaim ? "" : "disabled"}>${a.canClaim ? "오늘 출석 보상 받기" : "내일 다시 오세요"}</button>`;
  } else if (tab === "activity") {
    const a = Meta.activity(st);
    body = `<p class="muted">채집·전투·제작·건물 탐험·공사·원정으로 활동 점수를 모으면 상자가 열립니다(매일 초기화).</p>
      <div class="card">오늘 활동 점수 <b>${a.pts}</b> · ${Object.entries(Meta.ACTIVITY.pts).map(([k, v]) => `${({ gather: "채집", kill: "처치", craft: "제작", site: "건물 층", boss: "보스", build: "공사", expedition: "원정" })[k]} +${v}`).join(" · ")}</div>
      <div class="hb th" style="height:12px"><i style="width:${Math.min(100, a.pts / 1.2)}%"></i></div>
      <div class="rlist">${Meta.ACTIVITY.chests.map((c, i) => `<div class="recipe ${a.pts < c.at ? "dim" : ""}"><span class="ic slot g${i + 2}">🎁</span><div class="rinfo"><b>${c.at}점 상자</b><small>💎${c.gems} + ${ITEMS[c.item[0]].name}×${c.item[1]}</small></div><span></span><button class="btn sm" data-chest="${i}" ${a.pts >= c.at && !a.got.includes(i) ? "" : "disabled"}>${a.got.includes(i) ? "받음" : "열기"}</button></div>`).join("")}</div>`;
  } else if (tab === "vip") {
    const pts = acc.vip?.pts || 0, lv = Meta.vipLevel(pts), nx = Meta.VIP.levels[lv + 1];
    body = `<div class="card">👑 <b>VIP ${lv}</b> · 점수 ${pts}${nx ? ` / 다음 ${nx}` : " (최고)"}<div class="hb th" style="height:10px;margin-top:6px"><i style="width:${nx ? Math.min(100, ((pts - Meta.VIP.levels[lv]) / (nx - Meta.VIP.levels[lv])) * 100) : 100}%"></i></div>
      <small class="muted">매일 접속만 해도 20~90점(연속 접속 보너스). 결제하면 1,000원당 100점. VIP 는 '편의'만 줍니다 — 전투력은 팔지 않습니다.</small></div>
      <div class="rlist">${Meta.VIP.perks.map((p, i) => `<div class="recipe ${i > lv ? "dim" : ""}"><span class="ic slot g${Math.min(4, Math.ceil(i / 2))}">👑${i}</span><div class="rinfo"><b>VIP ${i}</b> <small class="muted">${Meta.VIP.levels[i]}점</small><small>${[p.offH && `오프라인 상한 +${p.offH}시간`, p.speed && `매일 무료 가속 ${p.speed}분`, p.scout && `동물 탐색 +${p.scout}회`, p.exp && `원정 슬롯 +${p.exp}`, p.gold && `금화 +${p.gold}%`, p.pick && `줍기 반경 +${p.pick}`].filter(Boolean).join(" · ") || "기본"}</small></div><span></span>${i === lv ? '<span class="badge">현재</span>' : ""}</div>`).join("")}</div>`;
  } else if (tab === "exp") {
    const slots = Meta.expSlots(acc), ex = st.expeditions || [];
    const opened = (G.regions || []).filter((r) => Reg.isUnlocked(st, G.regions, r.id));
    const idle = st.companions.filter((c) => c.task === "base" && S.isAdult(c));
    body = `<p class="muted">기지의 동료를 열린 지역에 보내 자원을 모아 옵니다(실제 시간, 오프라인에도 진행). 먼 지역·힘센 동료일수록 많이. 슬롯 ${ex.length}/${slots} (VIP로 늘어남)</p>
      ${ex.map((e) => { const c = st.companions.find((x) => x.uid === e.uid); const left = Math.max(0, Math.ceil((e.end - Date.now()) / 60000)); return `<div class="card">🧭 ${esc(c?.name ?? "?")} → ${esc(G.regions.find((r) => r.id === e.rid)?.name ?? "")} · ${e.hours}시간 · ${left ? "남은 " + fmtMin(left) : "귀환 중"} · 예상: ${Meta.expeditionLoot(e, c).map(([i, n]) => ITEMS[i].name + " " + n).join(", ")}</div>`; }).join("")}
      ${ex.length < slots ? `<div class="card"><label>동료 <select id="exC">${idle.map((c) => `<option value="${c.uid}">${esc(c.name)} (힘${c.stats.str} 지${c.stats.int})</option>`).join("") || '<option value="">보낼 동료 없음</option>'}</select></label>
        <label>지역 <select id="exR">${opened.map((r) => `<option value="${r.id}">${esc(r.name)} ★${r.tier}</option>`).join("")}</select></label>
        <div class="acts">${Meta.EXPEDITION.hours.map((h) => `<button class="btn sm" data-exh="${h}">${h}시간 보내기</button>`).join("")}</div></div>` : ""}`;
  }
  const m = modal(`<h2>🎁 일일 · VIP · 원정</h2><div class="tabs">${Object.entries(tabs).map(([k, v]) => `<button class="tab ${k === tab ? "on" : ""}" data-tab="${k}">${v}</button>`).join("")}</div>${body}`, { wide: true });
  const re = (t = tab) => { m.close(); G.afterAction(); openDaily(t); };
  m.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => re(b.dataset.tab)));
  m.querySelector("#att")?.addEventListener("click", () => { const r = Meta.claimAttend(acc, st, S.giveItem); toast(r.ok ? `출석 보상! (연속 ${r.streak}일)` : r.why, r.ok ? "good" : "warn"); G.save(); re(); });
  m.querySelectorAll("[data-chest]").forEach((b) => (b.onclick = () => { if (Meta.claimChest(acc, st, +b.dataset.chest, S.giveItem)) toast("🎁 상자를 열었다!", "good"); G.save(); re(); }));
  m.querySelectorAll("[data-exh]").forEach((b) => (b.onclick = () => {
    const cu = m.querySelector("#exC")?.value, rid = +m.querySelector("#exR")?.value;
    const r = Meta.startExpedition(st, acc, cu, G.regions.find((x) => x.id === rid), +b.dataset.exh);
    if (r.ok) { Meta.addActivity(st, "expedition"); toast("🧭 원정을 보냈다", "good"); } else toast(r.why, "bad");
    G.save(); re("exp");
  }));
}
export function dailyBadge() { const st = G.st; if (!st) return false; const a = Meta.activity(st); return Meta.attendState(G.acc).canClaim || Meta.ACTIVITY.chests.some((c, i) => a.pts >= c.at && !a.got.includes(i)) || (st.expeditions || []).some((e) => Date.now() >= e.end); }

// ---------------- 캐릭터·유물(직업별 장착) ----------------
const relicTile = (id, extra = "") => { const d = Relics.RELICS[id], lv = Relics.relicLv(G.acc, id); return `<button class="relic r${d.r}" ${extra} title="${esc(d.name)}: ${esc(d.desc)}"><span>${d.icon}</span><small>${esc(d.name)}${lv > 1 ? " +" + (lv - 1) : ""}</small></button>`; };
export function openCharacters(onClose, jobIdx = 0) {
  const acc = G.acc, ids = Object.keys(JOBS), job = ids[(jobIdx + ids.length) % ids.length], J = JOBS[job];
  const leg = S.legacyOf(acc, job), R = Relics.relicState(acc), L = R.load[job] || {};
  const best = acc.maxDays?.[job] || 0, ends = acc.endings.filter((e) => e.startsWith(J.ending + ":")).length;
  const row = (cat) => {
    const open = Relics.slotOpen(acc, job, cat), rule = Relics.SLOT_RULE[cat], cur = L[cat];
    const owned = Object.keys(Relics.RELICS).filter((k) => Relics.RELICS[k].cat === cat && R.own[k]);
    return `<div class="rrow"><b>${Relics.CATS[cat]}</b>
      ${open ? (cur ? relicTile(cur, `data-unrel="${cat}" class="on"`) : '<span class="relic empty">비어 있음</span>') : `<span class="relic lock">${rule.days}일<br>생존 시 오픈</span><button class="btn sm" data-buyslot="${cat}">바로 오픈 💎${rule.gems}</button>`}
      ${open ? owned.filter((k) => k !== cur).map((k) => relicTile(k, `data-rel="${k}"`)).join("") : ""}
      ${open && !owned.length ? '<small class="muted">구세계 금고에서 유물을 얻으세요</small>' : ""}</div>`;
  };
  const m = modal(`<div class="charpage"><div class="cleft"><div class="jrow"><button class="btn sm" id="prevJ">《</button><h2>${J.icon} ${J.name}</h2><button class="btn sm" id="nextJ">》</button></div>
      <div>혈통 LV ${leg.level}</div><canvas id="cpor" width="150" height="160"></canvas>
      <div class="statrow">${Object.entries(J.stats).map(([k, v]) => `<span>${({ str: "힘", agi: "민첩", vit: "체력", int: "지능", cha: "매력", cra: "손재주" })[k]} <b>${v}</b></span>`).join("")}</div>
      <small>최대 생존 기록: <b>${best}일</b> · 엔딩 ${ends}/2</small><small class="muted">${esc(J.desc)}</small></div>
    <div class="cright"><p class="muted">유물을 장착하면 새 생애를 시작할 때 효과를 받습니다. 칸은 이 직업으로 오래 살아남으면 무료로 열리고, 보석으로 바로 열 수도 있습니다.</p>
      ${Object.keys(Relics.CATS).map(row).join("")}
      <h3>스킬</h3><div class="chips">${J.skills.map((k) => `<span class="chip">Lv${k.lv} ${k.name}</span>`).join("")}</div></div></div>`, { wide: true, onClose: () => onClose?.() });
  const g = m.querySelector("#cpor").getContext("2d");
  R2draw(g, J);
  const re = (i = jobIdx) => { m.close(); openCharacters(onClose, i); };
  m.querySelector("#prevJ").onclick = () => re(jobIdx - 1);
  m.querySelector("#nextJ").onclick = () => re(jobIdx + 1);
  m.querySelectorAll("[data-rel]").forEach((b) => (b.onclick = () => { const r = Relics.equipRelic(acc, job, b.dataset.rel); if (!r.ok) toast(r.why, "bad"); saveAccount(acc); re(); }));
  m.querySelectorAll("[data-unrel]").forEach((b) => (b.onclick = () => { Relics.unequipRelic(acc, job, b.dataset.unrel); saveAccount(acc); re(); }));
  m.querySelectorAll("[data-buyslot]").forEach((b) => (b.onclick = () => { const r = Relics.buySlot(acc, job, b.dataset.buyslot); toast(r.ok ? "칸이 열렸다" : r.why, r.ok ? "good" : "bad"); saveAccount(acc); re(); }));
}
function R2draw(g, J) { drawCharacter(g, 75, 150, { skin: "#d9a982", hair: "short", hairColor: "#2b211b" }, { body: { id: "rag_shirt" }, legs: { id: "rag_pants" }, hand: { id: (J.start.find(([i]) => ITEMS[i].slot === "hand") || ["knife"])[0] } }, 1, 0, { scale: 3, gender: "M" }); }

// ---------------- 구세계 금고(확률 공개 · 천장) ----------------
export function openVaults(onClose) {
  const acc = G.acc, R = Relics.relicState(acc), now = Date.now();
  const rustyLeft = Math.max(0, R.rustyAt - now);
  const card = (k) => { const V = Relics.VAULTS[k]; return `<div class="vault v-${k}"><b>${V.name}</b><div class="vicon">${{ rusty: "🧰", steel: "🗄️", bunker: "🏦" }[k]}</div>
    <small class="muted">${V.desc}</small><small>확률: ${Relics.RARITY.map((r, i) => V.odds[i] ? `<span style="color:${r.color}">${r.name} ${V.odds[i]}%</span>` : "").filter(Boolean).join(" · ")}</small>
    ${k === "rusty" ? `<button class="btn" data-v="rusty" ${rustyLeft ? "disabled" : ""}>${rustyLeft ? `${Math.floor(rustyLeft / 3600e3)}시간 ${Math.ceil((rustyLeft % 3600e3) / 60000)}분 뒤` : "무료로 열기"}</button>`
    : k === "steel" ? `<button class="btn" data-v="steel">💎30 열기</button>`
    : `<div class="acts"><button class="btn" data-v="bunker">💎300 열기</button><button class="btn" data-v="bunker" data-key="1" ${R.keys ? "" : "disabled"}>🗝️ ${R.keys}/1 열기</button></div>`}</div>`; };
  const m = modal(`<h2>🗃️ 구세계 금고</h2><p class="muted">핵전쟁 전 문명이 남긴 금고. 유물(생존·전투·기술)이 들어 있다. 같은 유물이 또 나오면 그 유물이 강해진다(+1, 최대 +4).</p>
    <div class="vaults">${["rusty", "steel", "bunker"].map(card).join("")}</div>
    <div class="card">🏅 천장 <b>${Math.min(R.pts, Relics.PITY)}/${Relics.PITY}점</b> — 다 차면 다음 <b>군용 벙커 금고</b>에서 <span style="color:#e0a24a">전설</span> 확정. (녹슨 +2 · 강철 +6 · 군용 +40점)<div class="hb th" style="height:10px;margin-top:6px"><i style="width:${Math.min(100, (R.pts / Relics.PITY) * 100)}%"></i></div></div>
    <small class="muted">보석 ${acc.gems} · 금고 열쇠는 보스 처치·출석 7일차·이벤트에서 얻습니다. 무과금도 녹슨 보급함과 생존 기록으로 모든 유물 칸을 열 수 있습니다.</small>`, { wide: true, onClose: () => onClose?.() });
  m.querySelectorAll("[data-v]").forEach((b) => (b.onclick = async () => {
    const r = Relics.openVault(acc, b.dataset.v, Math.random, Date.now(), !!b.dataset.key);
    if (!r.ok) return toast(r.why, "bad");
    saveAccount(acc); m.close();
    const d = Relics.RELICS[r.id], rr = Relics.RARITY[r.rarity];
    await choice(`${rr.name} 유물!`, `<div style="font-size:64px;text-align:center">${d.icon}</div><div style="text-align:center"><b style="color:${rr.color}">${esc(d.name)}</b> (${Relics.CATS[d.cat]})<br>${esc(d.desc)}${r.dup ? `<br><span class="ok">이미 있던 유물 → 강화 +${r.lv - 1}</span>` : ""}</div>`, [{ label: "확인", value: 1, cls: "primary" }]);
    openVaults(onClose);
  }));
}

// ---------------- 생존 기록 ----------------
export function openRecords() {
  const acc = G.acc;
  modal(`<h2>📜 생존 기록</h2><div class="rlist">${Object.entries(JOBS).map(([id, j]) => { const l = S.legacyOf(acc, id); return `<div class="recipe"><span class="ic slot">${Ic.icon("job." + id, 40, j.icon)}</span><div class="rinfo"><b>${j.name}</b> <small>혈통 LV ${l.level}</small><small class="muted">최대 생존 ${acc.maxDays?.[id] || 0}일 · 엔딩 ${acc.endings.filter((e) => e.startsWith(j.ending + ":")).length}/2</small></div><span></span><span></span></div>`; }).join("")}</div>
    <p class="muted small">총 생애 ${acc.runs}회 · 엔딩 도감 ${acc.endings.length}/16</p>`, { wide: true });
}

// ---------------- 지역 지도(노드 지도) ----------------
// 탐험한 지역은 밝게, 갈 수 있는 곳은 색, 잠긴 곳은 회색+자물쇠, 아직 모르는 곳은 '???'
export function openRegionMap() {
  if (G.world.site) return toast("건물 안에서는 지역 지도를 볼 수 없습니다 — 먼저 밖으로 나가세요", "warn");
  const st = G.st, regs = G.regions, cur = G.world.rid;
  const W = 760, H = 520, gx0 = 70, gy0 = 70, gw = (W - 140) / 6, gh = (H - 150) / 4;
  const pos = (r) => [gx0 + r.gx * gw + ((r.id * 37) % 23) - 11, gy0 + r.gy * gh + ((r.id * 53) % 19) - 9];
  const open = (r) => Reg.isUnlocked(st, regs, r.id);
  const known = (r) => open(r) || Object.values(r.links).some((o) => open(regs.find((x) => x.id === o)));
  const m = modal(`<h2>🗺️ 지역 지도</h2><p class="muted small">지역의 미션을 깨면 이웃 지역으로 가는 길이 열립니다. 지도 가장자리(화살표)로 걸어가거나, 열린 지역을 눌러 이동하세요.</p>
    <canvas id="rmap" class="rmap" width="${W}" height="${H}"></canvas><div id="rinfo"></div>`, { wide: true });
  const cv = m.querySelector("#rmap"), g = cv.getContext("2d");
  let sel = cur;
  const draw = () => {
    // 양피지 바탕
    const bg = g.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, W * 0.7); bg.addColorStop(0, "#d8c49a"); bg.addColorStop(1, "#a88e62");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.globalAlpha = 0.12; g.fillStyle = "#5a4630";
    for (let i = 0; i < 260; i++) { const x = (i * 97) % W, y = (i * 61) % H; g.fillRect(x, y, 2 + (i % 3), 1); }
    g.globalAlpha = 1;
    // 길(점선)
    g.setLineDash([6, 6]); g.lineWidth = 2.5;
    for (const r of regs) for (const o of Object.values(r.links)) {
      if (o < r.id) continue; const q = regs.find((x) => x.id === o);
      if (!known(r) || !known(q)) continue;
      const [x1, y1] = pos(r), [x2, y2] = pos(q);
      g.strokeStyle = open(r) && open(q) ? "rgba(255,255,255,.9)" : "rgba(80,60,40,.45)";
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    }
    g.setLineDash([]);
    // 지역 칸
    g.textAlign = "center";
    for (const r of regs) {
      const [x, y] = pos(r), k = known(r), o = open(r), done = Reg.missionDone(st, regs, r.id);
      if (!k) { if (Object.values(r.links).some((o) => known(regs.find((x2) => x2.id === o)))) { g.fillStyle = "rgba(70,55,40,.45)"; g.font = "bold 16px sans-serif"; g.fillText("???", x, y + 6); } continue; }
      // 받침(아이소메트릭 느낌의 판)
      g.fillStyle = o ? (r.theme === "home" ? "#7a6a52" : "#6b7a4a") : "#8a8580";
      g.beginPath(); g.moveTo(x, y - 18); g.lineTo(x + 26, y - 4); g.lineTo(x, y + 10); g.lineTo(x - 26, y - 4); g.closePath(); g.fill();
      g.fillStyle = "rgba(0,0,0,.25)"; g.beginPath(); g.moveTo(x - 26, y - 4); g.lineTo(x, y + 10); g.lineTo(x, y + 18); g.lineTo(x - 26, y + 4); g.closePath(); g.fill();
      g.fillStyle = "rgba(0,0,0,.4)"; g.beginPath(); g.moveTo(x + 26, y - 4); g.lineTo(x, y + 10); g.lineTo(x, y + 18); g.lineTo(x + 26, y + 4); g.closePath(); g.fill();
      g.font = "22px sans-serif"; g.globalAlpha = o ? 1 : 0.5; g.fillText(Reg.THEMES[r.theme].icon, x, y + 2); g.globalAlpha = 1;
      if (!o) { g.font = "15px sans-serif"; g.fillText("🔒", x + 22, y - 14); }
      if (done && r.id) { g.font = "14px sans-serif"; g.fillText("🏁", x - 22, y - 14); }
      g.font = "bold 12px sans-serif"; g.fillStyle = "#2a2018"; g.fillText(r.name, x, y + 34);
      if (r.id === sel) { g.strokeStyle = "#fff"; g.lineWidth = 2; g.strokeRect(x - 34, y - 26, 68, 66); }
      if (r.id === cur) { g.fillStyle = "#ffd36b"; g.font = "bold 12px sans-serif"; g.fillText("▼ 현재 위치", x, y - 30); }
    }
    g.textAlign = "start";
    const r = regs.find((x) => x.id === sel), o = open(r), s2 = Reg.rs(st, r.id);
    const mi = r.mission;
    m.querySelector("#rinfo").innerHTML = `<div class="card"><b>${Reg.THEMES[r.theme].icon} ${esc(r.name)}</b> <small class="muted">위험도 ${"★".repeat(r.tier) || "안전"}${r.theme !== "home" ? " · " + esc(BIOMES[r.biome]?.name || "") : ""}</small><br>
      ${o ? `미션: ${esc(Reg.missionText(r))} — ${Reg.missionDone(st, regs, r.id) ? '<span class="ok">완료 🏁</span>' : mi.kind === "chapter" ? `진행 중 (${st.story.chapter}/2장)` : `${s2.prog}/${mi.n}`}` : `<span class="no">🔒 ${esc(Reg.lockReason(st, regs, r.id))}</span>`}
      ${o && r.id !== cur ? `<br><button class="btn primary" id="go">이 지역으로 이동 (${travelHours(r.id)}시간)</button>` : ""}</div>`;
    m.querySelector("#go")?.addEventListener("click", () => { m.close(); travelTo(r.id); });
  };
  // 열린 지역끼리 최단 경로 길이 × 2시간
  const travelHours = (to) => { const seen = new Map([[cur, 0]]), q = [cur]; while (q.length) { const a = q.shift(); for (const o of Object.values(regs.find((x) => x.id === a).links)) if (!seen.has(o) && open(regs.find((x) => x.id === o))) { seen.set(o, seen.get(a) + 1); q.push(o); } } return (seen.get(to) ?? 9) * 2; };
  const travelTo = (to) => {
    const h = travelHours(to);
    for (let i = 0; i < h * 2; i++) S.tick(st, 30, { moving: true });
    const r = regs.find((x) => x.id === to);
    G.loadRegion(to, Object.keys(r.links)[0] ? { 동: "서", 서: "동", 남: "북", 북: "남" }[Object.keys(r.links)[0]] : null);
    toast(`🧭 ${r.name}에 도착 (${h}시간 이동)`, "good"); G.save(); G.afterAction();
  };
  cv.addEventListener("click", (e) => {
    const b = cv.getBoundingClientRect(), x = ((e.clientX - b.left) / b.width) * W, y = ((e.clientY - b.top) / b.height) * H;
    let best = null, bd = 40;
    for (const r of regs) { if (!known(r)) continue; const [px, py] = pos(r); const d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = r; } }
    if (best) { sel = best.id; draw(); }
  });
  draw();
}

export function openWorldMap() {
  const g = S.geoOf(G.st);
  const m = modal(`<h2>${Ic.icon("ui.globe", 26)} 세계 지도</h2><canvas id="earth" class="earthmap" width="720" height="360"></canvas>${geoCard(g)}
    <p class="muted small">지구 전체가 하나의 세계입니다. 다른 생존자들도 지구 어딘가에서 왕국을 세우고 있습니다. 에필로그의 '세계 재건 원정'으로 주변 땅을 되살릴 수 있습니다(세계 복구율 ${G.st.story.restore}%).</p>`, { wide: true });
  Earth.drawEarthMap(m.querySelector("#earth").getContext("2d"), 720, 360, [{ lat: g.lat, lon: g.lon, r: 8 + G.st.story.restore / 10 }]);
}

// ---------------- 기기 연결(이어하기) ----------------
export function openSync() {
  const st = Sync.state();
  if (!Net.enabled()) {
    return modal(`<h2>☁️ 기기 연결</h2><p>PC와 휴대폰에서 같은 계정으로 로그인하면 이어서 플레이할 수 있습니다.</p>
      <div class="card warn">아직 게임 서버가 연결되지 않은 버전입니다. 서버(Supabase)를 연결하면 이 메뉴에서 이메일로 로그인할 수 있습니다.<br><small>지금은 [메뉴 → 저장 코드 내보내기/가져오기]로 기기를 옮길 수 있습니다.</small></div>`);
  }
  if (st.auth?.email) {
    const m = modal(`<h2>☁️ 기기 연결</h2><div class="card">로그인: <b>${esc(st.auth.email)}</b><br><small class="muted">서버 리비전 ${st.rev || 0} · ${st.dirty ? "올릴 진행 있음" : "최신 상태"} · 이 기기: ${esc(Sync.deviceName())}</small></div>
      <p class="muted small">게임을 시작할 때 받고, 끄거나 10분마다(바뀐 경우만) 올립니다. 두 기기에서 따로 진행했다면 시작할 때 어느 쪽을 쓸지 묻습니다.</p>
      <div class="choices"><button class="btn primary" id="now">지금 올리기</button><button class="btn danger" id="out">로그아웃</button></div>`);
    m.querySelector("#now").onclick = async () => { try { Sync.markDirty(); const r = await Sync.push(G.st, G.acc, { force: true }); toast(r === "pushed" ? "올렸습니다" : r, "good"); } catch (e) { toast("실패: " + e.message, "bad"); } m.close(); };
    m.querySelector("#out").onclick = () => { Sync.logout(); toast("로그아웃했습니다"); m.close(); };
    return m;
  }
  const m = modal(`<h2>☁️ 기기 연결</h2><p>이메일로 로그인하면 PC·휴대폰 어디서든 이어서 플레이할 수 있습니다. 비밀번호 없이 메일로 온 6자리 코드를 입력합니다.</p>
    <input id="em" type="email" placeholder="이메일" class="code" style="height:auto;padding:10px">
    <button class="btn primary" id="send">코드 받기</button>
    <div id="step2" hidden><input id="cd" inputmode="numeric" maxlength="6" placeholder="6자리 코드" class="code" style="height:auto;padding:10px"><button class="btn primary" id="ok">로그인</button></div>`);
  m.querySelector("#send").onclick = async () => { const em = m.querySelector("#em").value.trim(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return toast("이메일을 확인하세요", "bad"); try { await Sync.sendCode(em); m.querySelector("#step2").hidden = false; toast("메일로 코드를 보냈습니다", "good"); } catch (e) { toast("실패: " + e.message, "bad"); } };
  m.querySelector("#ok").onclick = async () => { try { await Sync.verifyCode(m.querySelector("#em").value.trim(), m.querySelector("#cd").value.trim()); m.close(); toast("로그인했습니다. 동기화를 확인합니다…", "good"); await G.syncOnStart(true); } catch (e) { toast("코드가 맞지 않습니다", "bad"); } };
  return m;
}

// 두 기기에서 따로 진행 → 어느 쪽을 쓸지 묻기
export function syncConflict(localSt, remote) {
  const l = Sync.summary(localSt);
  return choice("☁️ 진행 기록이 두 개입니다", `<b>이 기기</b>: ${esc(l?.name || "-")} · ${l?.day}일차 · ${l?.chapter}장 · Lv.${l?.level}<br><b>${esc(remote.device || "다른 기기")}</b>: ${remote.day}일차 · ${remote.chapter}장 · Lv.${remote.level} <small class="muted">(${new Date(remote.updated_at).toLocaleString()})</small><br><small>선택하지 않은 쪽은 사라집니다.</small>`, [
    { label: "이 기기 것으로 계속", value: "local", cls: "primary" },
    { label: `${esc(remote.device || "다른 기기")} 것으로 계속`, value: "remote" },
  ]);
}

// ---------------- 설정 ----------------
export function openSettings() {
  const s = G.acc.settings;
  const m = modal(`<h2>⚙️ 설정</h2>
    <h3>그래픽</h3><div class="seg"><button class="btn ${!s.gfx || s.gfx === "fast" ? "on" : ""}" data-gfx="fast">빠른 2D (추천)</button><button class="btn ${s.gfx === "pixel" ? "on" : ""}" data-gfx="pixel">픽셀 3D</button><button class="btn ${s.gfx === "hd" ? "on" : ""}" data-gfx="hd">고화질 3D</button></div>
    <small class="muted">빠른 2D(추천)는 모든 화면이 가벼운 2등신 그림입니다. 3D를 고르면 필드와 캐릭터 생성·이야기 장면·자세히 보기가 실사 3D로 바뀌며, 휴대폰에서는 느릴 수 있습니다.</small>
    <h3>소리</h3><div class="seg"><button class="btn ${s.sound !== false ? "on" : ""}" data-snd="1">효과음 켜기</button><button class="btn ${s.sound === false ? "on" : ""}" data-snd="0">끄기</button></div>
    <h3>이야기 음성</h3><div class="seg"><button class="btn ${s.voice !== false ? "on" : ""}" data-vo="1">켜기</button><button class="btn ${s.voice === false ? "on" : ""}" data-vo="0">끄기</button></div>
    <h3>배경음악</h3><div class="seg"><button class="btn ${s.music !== false ? "on" : ""}" data-mus="1">켜기</button><button class="btn ${s.music === false ? "on" : ""}" data-mus="0">끄기</button></div>
    <h3>조작</h3><div class="seg"><button class="btn ${s.joyRight ? "" : "on"}" data-joy="left">조이스틱 왼쪽</button><button class="btn ${s.joyRight ? "on" : ""}" data-joy="right">오른쪽</button></div>
    <h3>튜토리얼</h3><button class="btn" id="tut">처음 안내 다시 보기</button>`);
  const re = () => { m.close(); G.applySettings(); openSettings(); };
  m.querySelectorAll("[data-gfx]").forEach((b) => (b.onclick = () => { if (s.gfx === b.dataset.gfx) return; s.gfx = b.dataset.gfx; G.save?.(); saveAccount(G.acc); location.reload(); })); // 필드 렌더러 교체는 새로 불러오기
  m.querySelectorAll("[data-snd]").forEach((b) => (b.onclick = () => { s.sound = b.dataset.snd === "1"; Sfx.setEnabled(s.sound); Sfx.play("click"); re(); }));
  m.querySelectorAll("[data-vo]").forEach((b) => (b.onclick = () => { s.voice = b.dataset.vo === "1"; re(); }));
  m.querySelectorAll("[data-mus]").forEach((b) => (b.onclick = () => { s.music = b.dataset.mus === "1"; re(); }));
  m.querySelectorAll("[data-joy]").forEach((b) => (b.onclick = () => { s.joyRight = b.dataset.joy === "right"; re(); }));
  m.querySelector("#tut").onclick = () => { G.st.tut = 0; m.close(); toast("처음 안내를 다시 시작합니다", "good"); };
}

// ---------------- 이벤트 모달 ----------------
export async function deathModal() {
  const st = G.st, acc = G.acc;
  Sfx.play("death");
  const opts = S.reviveOptions(st, acc);
  const v = await choice("💀 쓰러졌다", `${esc(st.player.name)}은(는) <b>${st.dead.cause}</b>(으)로 쓰러졌습니다.<br><small>${S.day(st)}일 생존 · ${S.chapter(st).title}</small>`, opts.map((o) => ({ label: o.label, value: o.id, disabled: o.disabled, cls: o.id === "accept" ? "danger" : o.id === "heir" ? "primary" : "" })));
  if (v === "ad" && !(await G.watchAd(true))) return deathModal();
  const r = S.revive(st, acc, v);
  if (!r.ok) { toast(r.why || "불가", "bad"); return deathModal(); }
  if (r.heir) await cinematic("👑 계승", `${r.heir.name}은(는) 부모의 무덤 앞에서 맹세했다. 이 왕국은 끝나지 않는다. (${st.generation}대)`, { palette: ["#14141c", "#3a2a3a", "#8a5a3a"] });
  if (r.reset) { await cinematic(st.ended.ending[0], st.ended.ending[1], { palette: ["#0c0c10", "#2a2a30", "#4a4040"] }); saveAccount(acc); G.newLife(); return; }
  G.respawnAtBase();
  G.save();
}

export async function raidModal(strength) {
  const st = G.st;
  const def = S.baseDefense(st);
  const v = await choice("🔥 습격!", `밤이 되자 약탈자 무리(병력 ${strength})가 기지를 덮쳤습니다!<br>기지 방어력 ${def}${G.atBase ? "" : "<br><small>당신은 기지 밖에 있어 자동 방어만 가능합니다.</small>"}`, [
    { label: "직접 방어 (사격전)", value: "fight", cls: "primary", disabled: !G.atBase },
    { label: "방어 시설에 맡긴다", value: "auto" },
  ]);
  if (v === "fight") {
    const r = await G.playShooter({ title: "🔥 기지 방어전", enemyCount: Math.min(30, 8 + Math.round(strength / 25)), enemyHp: Math.round(28 * S.diff(st).enemy), enemyAtk: Math.round(7 * S.diff(st).enemy), duration: 45, turrets: S.countB(st, "turret") + S.countB(st, "watchtower") }, strength);
    S.resolveRaid(st, strength, r.win ? 1e6 : S.combatPower(st) * 0.2, makeRng(Date.now()));
  } else S.resolveRaid(st, strength, 0, makeRng(Date.now()));
  G.afterAction();
}

export async function visitorModal(sv) {
  const st = G.st;
  const r = ROLES[sv.role];
  const v = await choice("🚪 낯선 생존자", `${sv.gender === "F" ? "👩" : "👨"} <b>${sv.name}</b> (${r.icon} ${r.name})이(가) 기지 문을 두드립니다.<br><small>"${r.effect}… 그런 일을 할 수 있어요. 받아주세요."</small>`, [
    { label: "받아들인다", value: "yes", cls: "primary" },
    { label: "음식만 나눠주고 보낸다", value: "food" },
    { label: "쫓아낸다", value: "no", cls: "danger" },
  ]);
  if (v === "yes") { const res = S.recruit(st, sv); if (!res.ok) toast(res.why, "bad"); else st.karma += 1; }
  else if (v === "food") { if (S.pay(st, { canned_food: 1 }) || S.pay(st, { berry: 2 })) { st.karma += 2; toast("고맙다며 떠났습니다 (업보 +2)", "good"); } else toast("나눠줄 음식이 없었습니다"); }
  else { st.karma -= 2; toast("쫓아냈습니다 (업보 -2)", "bad"); }
}

const ENCOUNTERS = [
  { t: "굶주린 가족", d: "아이를 안은 부부가 먹을 것을 구걸합니다.", o: [["음식을 나눠준다", (st) => (S.pay(st, { canned_food: 1 }, false) || S.pay(st, { cooked_meat: 1 }, false) || S.pay(st, { berry: 3 }, false)) ? (st.karma += 3, "감사 인사를 받았습니다 (업보 +3)") : "줄 음식이 없었습니다"], ["외면한다", (st) => (st.karma -= 1, "뒤돌아섰습니다 (업보 -1)")]] },
  { t: "부상당한 약탈자", d: "'붉은 손' 문신의 약탈자가 다리를 다쳐 쓰러져 있습니다.", o: [["치료해 보내준다", (st) => (S.pay(st, { bandage: 1 }, false) ? (st.karma += 3, "그는 고개를 숙이고 떠났습니다 (업보 +3)") : (st.karma += 1, "붕대가 없어 물만 주었습니다 (업보 +1)"))], ["소지품을 빼앗는다", (st) => (st.karma -= 3, S.giveItem(st, "ammo", 6), S.giveItem(st, "scrap", 4), "탄약과 고철을 얻었습니다 (업보 -3)")]] },
  { t: "떠돌이 상인", d: "\"금화만 있으면 뭐든 팔지.\"", o: [["통조림 3개 (금화 60)", (st) => (st.gold >= 60 ? (st.gold -= 60, S.giveItem(st, "canned_food", 3), "거래 완료") : "금화가 부족합니다")], ["전자부품 2개 (금화 150)", (st) => (st.gold >= 150 ? (st.gold -= 150, S.giveItem(st, "electronics", 2), "거래 완료") : "금화가 부족합니다")], ["그냥 간다", () => "상인은 어깨를 으쓱했습니다"]] },
  { t: "방사능 폭풍 경보", d: "하늘이 초록빛으로 물듭니다. 곧 방사능 폭풍이 옵니다.", o: [["서둘러 몸을 숨긴다", (st) => (st.player.hunger = Math.max(0, st.player.hunger - 8), "폭풍을 피했지만 배가 고파졌습니다")], ["무시하고 탐색을 계속한다", (st) => (st.player.rad = Math.min(150, st.player.rad + 25 * (1 - S.equipStat(st, "rad"))), S.giveItem(st, "electronics", 1), "피폭됐지만 전자부품을 찾았습니다")]] },
  { t: "버려진 벙커", d: "녹슨 해치가 반쯤 열려 있습니다.", o: [["들어가 본다", (st) => { const r = Math.random(); if (r < 0.6) { S.giveItem(st, "canned_food", 2); S.giveItem(st, "medkit", 1); return "보급품을 찾았습니다!"; } S.damagePlayer(st, 15); return "함정이었습니다! 부상을 입었습니다"; }], ["지나친다", () => "조심하는 게 상책입니다"]] },
];
export async function encounterModal() {
  const e = ENCOUNTERS[Math.floor(Math.random() * ENCOUNTERS.length)];
  const v = await choice(`❗ ${e.t}`, e.d, e.o.map((o, i) => ({ label: o[0], value: i })));
  if (v == null) return;
  const msg = e.o[v][1](G.st);
  toast(msg);
  G.afterAction();
}

// ---------------- 튜토리얼 배너 ----------------
let lastTut = -2;
export function renderTutorial(step, idx) {
  let el = document.getElementById("tut");
  if (!step) { if (el) el.remove(); lastTut = -1; return; }
  if (idx === lastTut && el) return;
  lastTut = idx;
  if (!el) { el = document.createElement("div"); el.id = "tut"; document.body.appendChild(el); }
  el.innerHTML = `<small>처음 안내 ${idx + 1}/8</small><b>${esc(step.title)}</b><span>${esc(step.text)}</span><button class="mini" id="tutSkip">건너뛰기</button>`;
  el.querySelector("#tutSkip").onclick = () => { G.st.tut = 99; el.remove(); };
}

// ---------------- HUD ----------------
export function renderHud() {
  const st = G.st, p = st.player, acc = G.acc;
  const bar = (v, max, cls) => `<div class="hb ${cls}"><i style="width:${Math.max(0, Math.min(100, (v / max) * 100))}%"></i></div>`;
  const sea = S.season(st);
  $("#hud").innerHTML = `
    <div class="hud-l">
      <div class="who">${Ic.icon("job." + p.job, 18)} <b>${esc(p.name)}</b> Lv.${p.level} <small>혈통${p.legacyLevel}</small></div>
      <div class="bars"><span>${Ic.icon("ui.hp", 16)}</span>${bar(p.hp, p.maxHp, "hp")}<span>${Ic.icon("ui.hunger", 16)}</span>${bar(p.hunger, 100, "hu")}<span>${Ic.icon("ui.thirst", 16)}</span>${bar(p.thirst, 100, "th")}</div>
      <div class="bars sm"><span>${Ic.icon("ui.temp", 14)}${Math.round(p.warmth)}℃</span>${p.rad > 0 ? `<span class="${p.rad >= 100 ? "no" : ""}">${Ic.icon("ui.rad", 14)}${Math.round(p.rad)}</span>` : ""}${p.sick > 0 ? '<span class="no">🤢배탈</span>' : ""}${st.buffs.xp ? '<span class="ok">📘XP+50%</span>' : ""}</div>
    </div>
    <div class="hud-r">
      <div>${Ic.icon("w." + (st.weather?.id || "clear"), 18)} ${WEATHER[st.weather?.id || "clear"].name} · ${sea.name} ${S.day(st)}일차 ${S.clockStr(st)}</div>
      <div class="small muted">${Ic.icon("ui.globe", 14)} ${esc(S.geoOf(st).region)} · ${BIOMES[S.geoOf(st).biome]?.name}</div>
      <div><span title="보석">${Ic.icon("ui.gem", 16)}${acc.gems}</span> <span title="금화">${Ic.icon("ui.coin", 16)}${Math.floor(st.gold)}</span> <span title="VIP">👑${Meta.vipLevel(acc.vip?.pts || 0)}</span></div>
      <button class="btn sm" id="dailyBtn">🎁 일일·VIP·원정${dailyBadge() ? ' <i class="dot"></i>' : ""}</button>
    </div>
    <div class="goal" id="goalBox">📖 ${S.chapter(st).hint}</div>`;
  $("#goalBox").onclick = () => openStory();
  $("#dailyBtn").onclick = () => !G.paused && openDaily();
  // 행동 버튼에 지금 손에 든 것을 보여 준다(맨손이면 손)
  const held = p.equip?.hand?.id;
  const actKey = (held || "hand") + "|" + (G.actLabel || "");
  const actEl = $("#act");
  if (actEl && actEl.dataset.k !== actKey) { actEl.dataset.k = actKey; actEl.innerHTML = (held ? icon(held, 44) : Ic.icon("ui.hand", 40)) + `<span>${held ? esc(ITEMS[held].name) : "맨손"}${matchMedia("(hover: hover)").matches ? " (Space)" : ""}</span>`; }
  // 던지기·필살기 버튼과 활통 화살 수
  const pc = matchMedia("(hover: hover)").matches;
  const thr = S.throwPick(st, G.throwSel);
  const tb = $("#throwBtn");
  if (tb) { tb.hidden = !thr; if (thr) tb.innerHTML = `${icon(thr, 26)}<b>${S.count(st.inv, thr)}</b><span>던지기${pc ? " (R)" : ""}</span>`; }
  const sp = SPECIALS[p.equip.hand?.id], sb = $("#specBtn");
  if (sb) { sb.hidden = !sp; if (sp) { sb.innerHTML = `✨<span>${esc(sp.name)}${pc ? " (F)" : ""}</span>${G.specCd > 0 ? `<i class="cd">${Math.ceil(G.specCd)}</i>` : ""}`; sb.classList.toggle("cooling", G.specCd > 0); } }
  const q = p.equip.quiver, ab = $("#ammoBox"), handIt = ITEMS[p.equip.hand?.id];
  if (ab) {
    const showQ = q || handIt?.ranged;
    ab.hidden = !showQ;
    if (showQ) {
      if (handIt?.ranged === "ammo") ab.innerHTML = `${icon("ammo", 20)} 탄약 <b>${S.count(st.inv, "ammo")}</b>`;
      else if (q) ab.innerHTML = `${icon(q.id, 20)} <b>${S.quiverCount(st)}/${ITEMS[q.id].cap}</b> ${Object.entries(q.ammo || {}).filter(([, n]) => n > 0).map(([k, n]) => `<span class="${k === q.sel ? "sel" : ""}">${esc(ITEMS[k].name)} ${n}</span>`).join(" ") || '<span class="no">비었음 — 가방에서 채우기</span>'}${pc ? " <small>(T 바꾸기)</small>" : ""}`;
      else ab.innerHTML = `${icon("arrow", 20)} 화살 <b>${S.ARROW_IDS().reduce((a, k) => a + S.count(st.inv, k), 0)}</b> <small>활통이 있으면 등에 메고 다닌다</small>`;
    }
  }
  // 아래 메뉴: 아직 열리지 않은 기능은 흐리게 + 자물쇠 (눌러도 언제 열리는지만 알려 줌)
  for (const [key, why] of Object.entries(menuLocks(st))) {
    const b = document.querySelector(`#menu [data-open="${key}"]`);
    if (b) { b.classList.toggle("locked", !!why); b.dataset.lock = why || ""; }
  }
}
// 메뉴별 잠금 조건(빈 문자열 = 열림)
export function menuLocks(st) {
  const ch = st.story?.chapter ?? 0;
  return {
    base: "",
    people: st.companions.length || ch >= 2 ? "" : "2장(첫 동료)에서 열립니다",
    animals: st.animals?.length || ch >= 4 || st.player.level >= 3 ? "" : "Lv3 또는 4장에서 열립니다",
    olympics: st.base.lv >= 4 ? "" : "목책 요새(기지 Lv4)가 되면 열립니다",
  };
}
