// UI — DOM 패널/모달. 게임 상태 변경은 전부 systems.js 함수를 통해서만 한다.
import * as S from "./systems.js";
import * as O from "./olympics.js";
import * as Shop from "./shop.js";
import * as MG from "./minigames.js";
import {
  ITEMS, RECIPES, BUILDINGS, BASE_LEVELS, RESEARCH, ANIMALS, VEHICLES, ROLES, JOBS, DIFFICULTY,
  CHAPTERS, ERAS, OLYMPIC_EVENTS, OLYMPICS, SHOP, STATS, ENDINGS, QUALITY, AFFIXES,
} from "./data.js";
import { drawCharacter, drawCinematic } from "./render.js";
import { makeRng } from "./rng.js";
import { exportAll, importAll, saveGame, saveAccount } from "./storage.js";
import * as Net from "./net.js";

let G = null;
export function bindUI(g) { G = g; }
let viewer3d = null; // r3d.mountViewer (WebGL 가능 시)
export function setViewer(fn) { viewer3d = fn; }
const companionLook = (c) => ({ look: { skin: "#c9956d", hair: c.gender === "F" ? "long" : "short", hairColor: "#1b1410" }, gender: c.gender, equip: { body: { id: c.role === "soldier" ? "combat_vest" : "leather_jacket" }, legs: { id: "leather_pants" }, feet: { id: "boots" } } });
const mountOf = (p) => (p.mount ? (p.mount.type === "animal" ? { kind: p.mount.kind } : { id: p.mount.id }) : null);

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const icon = (id) => ITEMS[id]?.icon ?? "❔";
const costStr = (c) => Object.entries(c).map(([k, v]) => `${icon(k)}${v}`).join(" ");
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
    const p = el.querySelector("p");
    let i = 0;
    const iv = setInterval(() => { p.textContent = text.slice(0, ++i); if (i >= text.length) clearInterval(iv); }, 28);
    el.querySelector("button").onclick = () => { if (i < text.length) { i = text.length; p.textContent = text; return; } run = false; clearInterval(iv); el.remove(); G.paused = Math.max(0, G.paused - 1); resolve(); };
  });
}

function itemTip(s) {
  const it = ITEMS[s.id];
  const bits = [];
  if (it.atk) bits.push(`공격 ${S.itemStat(s, "atk")}`);
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

function slotHtml(s, idx, extra = "") {
  const it = ITEMS[s.id];
  const durPct = s.dur !== undefined ? Math.max(0, s.dur / s.maxDur) : null;
  const fr = s.fresh;
  const qc = s.q !== undefined && s.q !== 1 ? `style="box-shadow: inset 0 0 0 2px ${QUALITY[s.q].color}"` : "";
  return `<button class="slot ${fr !== undefined ? (fr > 0.7 ? "f-good" : fr > 0.3 ? "f-mid" : "f-bad") : ""}" data-idx="${idx}" ${extra} ${qc} title="${esc(S.itemLabel(s))}">
    <span class="ic">${it.icon}</span>${s.qty > 1 ? `<span class="q">${s.qty}</span>` : ""}
    ${durPct !== null ? `<span class="bar"><i style="width:${durPct * 100}%;background:${durPct > 0.5 ? "#7ed957" : durPct > 0.2 ? "#f2c14e" : "#e5534b"}"></i></span>` : ""}
    ${fr !== undefined ? `<span class="bar fresh"><i style="width:${Math.max(0, fr) * 100}%"></i></span>` : ""}
  </button>`;
}

// ---------------- 가방 + 장비 + 능력치 ----------------
export function openBag() {
  const st = G.st;
  const p = st.player;
  const slots = ["head", "body", "legs", "feet", "back", "hand"];
  const slotName = { head: "머리", body: "몸", legs: "다리", feet: "발", back: "등", hand: "손" };
  const m = modal(`
    <h2>🎒 가방 <small>${st.inv.length}/${S.bagSize(st)}칸</small></h2>
    <div class="bag-top">
      <div class="doll-wrap"><canvas id="doll" width="180" height="220"></canvas><button class="btn sm" id="detailBtn">🔍 자세히 보기·꾸미기</button></div>
      <div class="equip">${slots.map((sl) => { const e = p.equip[sl]; return `<div class="eq" data-slot="${sl}"><small>${slotName[sl]}</small>${e ? `${slotHtml(e, -1, `data-eq="${sl}"`)}<span class="nm" style="color:${QUALITY[e.q ?? 1].color}">${esc(S.itemLabel(e))}</span>` : `<span class="empty">비어 있음</span>`}</div>`; }).join("")}</div>
    </div>
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
    if (it.slot) acts.push(["장착", () => S.equipFromInv(st, i)]);
    if (it.type === "food" || it.type === "med" || s.id === "rotten_food") acts.push([it.type === "food" ? "먹기/마시기" : "사용", () => { const r = S.useItem(st, i); if (r.sick) toast("배탈이 났습니다! 🤢", "bad"); if (r.why) toast(r.why); }]);
    if (s.dur !== undefined && s.dur < s.maxDur && S.hasStation(st, "workbench") && G.atBase) acts.push([`수리 (${costStr(S.repairCost(s.id))}, 최대내구 -10%)`, () => { if (!S.repair(st, s)) toast("재료 또는 작업대가 없습니다", "bad"); }]);
    if (G.atBase && S.allStorage(st).length) acts.push(["창고에 보관", () => { if (s.dur !== undefined) { const b2 = S.allStorage(st).find((x) => x.storage.length < BUILDINGS[x.id].storage.slots); if (b2) { b2.storage.push(s); st.inv.splice(i, 1); } } else { const n = S.storeToBase(st, s.id, s.qty, s.fresh ?? 1); s.qty -= n; if (s.qty <= 0) st.inv.splice(st.inv.indexOf(s), 1); } }]);
    acts.push(["버리기", () => st.inv.splice(i, 1)]);
    info.innerHTML = `<b style="color:${QUALITY[s.q ?? 1].color}">${it.icon} ${esc(S.itemLabel(s))}</b> ${s.qty > 1 ? "×" + s.qty : ""} ${s.dur !== undefined ? `· 내구도 ${Math.ceil(s.dur)}/${s.maxDur}` : ""} ${s.fresh !== undefined ? `· ${S.freshLabel(s.fresh)} (${Math.round(s.fresh * 100)}%)` : ""}<br><small>${itemTip(s)}</small><div class="acts">${acts.map((a, k) => `<button class="btn sm" data-a="${k}">${a[0]}</button>`).join("")}</div>`;
    info.querySelectorAll("[data-a]").forEach((x) => (x.onclick = () => { acts[+x.dataset.a][1](); run = false; m.close(); openBag(); }));
  }));
  m.querySelectorAll("[data-eq]").forEach((b) => (b.onclick = () => { if (!S.unequip(st, b.dataset.eq)) toast("가방이 가득 찼습니다", "bad"); run = false; m.close(); openBag(); }));
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
  const m = modal(`<h2>🛠️ 제작</h2><p class="muted">시설이 필요한 제작은 기지 안에서만 가능합니다. 기지 창고의 재료도 자동으로 사용됩니다.</p>
    <div class="card"><b>🎲 제작 품질 확률</b> <small class="muted">(손재주 ${st.player.stats.cra}${JOBS[st.player.job].perks.luck ? " · 행운" : ""} · 혈통 ${st.player.legacyLevel} · 작업대 기준, 대장간은 더 좋음)</small><br>
    ${QUALITY.map((q, i) => `<span style="color:${q.color}">${q.name || "보통"} ${(qo[i] * 100).toFixed(1)}%</span>`).join(" · ")}<br>
    <small>좋은 특성 <span class="ok">${(ao.good * 100).toFixed(0)}%</span> · 나쁜 특성 <span class="no">${(ao.bad * 100).toFixed(0)}%</span> — 손재주를 올리면 좋은 결과가 늘고 나쁜 결과가 줄어듭니다. 소모품은 솜씨에 따라 '대성공'으로 1개 더.</small></div>
    ${Object.entries(groups).map(([k, name]) => {
      const rs = list.filter((r) => String(r.station) === k);
      if (!rs.length) return "";
      const has = k === "null" || S.hasStation(st, k);
      return `<h3>${name} ${has ? "" : '<small class="no">(미건설)</small>'}</h3><div class="rlist">${rs.map((r) => {
        const can = has && S.canAfford(st, r.in) && (k === "null" || G.atBase);
        return `<div class="recipe ${can ? "" : "dim"}"><span class="ic">${icon(r.out[0])}</span><div><b>${ITEMS[r.out[0]].name}${r.out[1] > 1 ? " ×" + r.out[1] : ""}</b><small>${costHave(r.in)}</small><small class="muted">${itemTip({ id: r.out[0] })}</small></div><button class="btn sm" data-r="${r.id}" ${can ? "" : "disabled"}>제작</button></div>`;
      }).join("")}</div>`;
    }).join("")}
    <h3>탈것</h3><div class="rlist">${Object.entries(VEHICLES).map(([id, v]) => `<div class="recipe"><span class="ic">${v.icon}</span><div><b>${v.name}</b><small>${costHave(v.cost)}</small><small class="muted">이동 ×${v.mount} · 연구: ${RESEARCH.find((r) => r.id === v.research).name}</small></div><button class="btn sm" data-v="${id}" ${st.vehicles.includes(id) ? "disabled" : ""}>${st.vehicles.includes(id) ? "보유" : "제작"}</button></div>`).join("")}</div>`, { wide: true });
  m.querySelectorAll("[data-r]").forEach((b) => (b.onclick = () => { const r = S.craft(st, b.dataset.r, { atBase: G.atBase }); toast(!r.ok ? r.why : r.quality?.label ? `${r.quality.q >= 3 ? "🌟 " : ""}${r.quality.label} 제작!${r.quality.af ? (AFFIXES[r.quality.af].good ? " (좋은 특성!)" : " (나쁜 특성…)") : ""}` : r.quality?.bonus ? `대성공! ${ITEMS[r.id].name} ×${r.q}` : `${ITEMS[r.id].name} ×${r.q} 제작!`, !r.ok ? "bad" : r.quality?.q === 0 || (r.quality?.af && !AFFIXES[r.quality.af].good) ? "warn" : "good"); m.close(); G.afterAction(); openCraft(); }));
  m.querySelectorAll("[data-v]").forEach((b) => (b.onclick = () => { const r = S.buildVehicle(st, b.dataset.v); toast(r.ok ? "제작 완료!" : r.why, r.ok ? "good" : "bad"); m.close(); openCraft(); }));
}

// ---------------- 기지 ----------------
export function openBase(tab = "build") {
  const st = G.st;
  const L = BASE_LEVELS[st.base.lv - 1], next = BASE_LEVELS[st.base.lv];
  const why = S.canUpgradeBase(st);
  const tabs = { build: "건설", storage: "창고", research: "연구", defense: "방어·원정", life: "생활" };
  let body = "";
  if (tab === "build") {
    body = `<div class="card"><b>🏰 ${L.name} (Lv.${st.base.lv})</b> · 부지 ${st.base.buildings.length}/${L.slots} · 주민 ${st.companions.length}/${S.residentCap(st)}
      ${next ? `<div>다음: <b>${next.name}</b> — ${costHave(S.baseUpgradeCost(st))}</div><button class="btn primary" id="upg" ${why ? "disabled" : ""}>거점 확장</button> ${why ? `<small class="no">${why}</small>` : ""}` : "<div>최대 레벨 — 새 수도</div>"}</div>
      <h3>건설된 시설</h3><div class="chips">${st.base.buildings.map((b) => `<span class="chip">${BUILDINGS[b.id].icon} ${BUILDINGS[b.id].name}${b.id === "generator" ? (b.fueled ? " ⚡" : " ⛽없음") : ""}<button class="mini" data-demo="${b.uid}" title="철거(재료 절반 회수)">✕</button></span>`).join("") || '<span class="muted">아직 없음</span>'}</div>
      <h3>건설 가능</h3><div class="rlist">${Object.entries(BUILDINGS).filter(([, d]) => d.baseLv <= st.base.lv + 1).map(([id, d]) => {
        const w = S.canBuild(st, id);
        return `<div class="recipe ${w ? "dim" : ""}"><span class="ic">${d.icon}</span><div><b>${d.name}</b> <small>${S.countB(st, id)}/${d.max}</small><small>${costHave(S.buildCost(st, id))}</small><small class="muted">${buildingDesc(d)}${w ? ` — <span class="no">${w}</span>` : ""}</small></div><button class="btn sm" data-b="${id}" ${w ? "disabled" : ""}>건설</button></div>`;
      }).join("")}</div>`;
  } else if (tab === "storage") {
    const stores = S.allStorage(st);
    body = stores.length ? stores.map((b) => `<div class="card"><b>${BUILDINGS[b.id].icon} ${BUILDINGS[b.id].name}</b> <small>${b.storage.length}/${BUILDINGS[b.id].storage.slots}칸 · 부패 속도 ×${S.storageMult(st, b).toFixed(2)}${BUILDINGS[b.id].storage.needPower && !S.hasPower(st) ? ' <span class="no">정전!</span>' : ""}</small>
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
  } else if (tab === "life") {
    const bed = S.hasBuilding(st, "bed");
    body = `<div class="card">🛏️ 잠자기: 다음 날 아침까지 시간을 보내며 체력을 회복합니다. ${bed ? `<button class="btn" id="sleep">잠자기</button>` : '<span class="no">침대 필요</span>'}</div>
      <div class="card">🔥 모닥불 근처에선 따뜻합니다. 핵겨울엔 기지 밖 체감온도가 영하로 떨어집니다.</div>
      <div class="card">⛽ 발전기 연료: 기지 창고에 연료(🛢️)가 있으면 하루 1개씩 자동 소비. 꺼지면 냉장고가 멈춥니다.</div>`;
  }
  const m = modal(`<h2>🏰 기지</h2><div class="tabs">${Object.entries(tabs).map(([k, v]) => `<button class="tab ${k === tab ? "on" : ""}" data-tab="${k}">${v}</button>`).join("")}</div>${body}`, { wide: true });
  const re = (t = tab) => { m.close(); G.afterAction(); openBase(t); };
  m.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => re(b.dataset.tab)));
  m.querySelector("#upg")?.addEventListener("click", async () => { const r = S.upgradeBase(st); if (r.ok) { m.close(); G.afterAction(); await cinematic(`🏰 ${BASE_LEVELS[st.base.lv - 1].name}`, `기지가 커졌다. 성벽은 높아지고, 사람들의 목소리도 커졌다. 이제 ${BASE_LEVELS[st.base.lv - 1].slots}개의 시설을 세울 수 있다.`, { palette: ["#1d2433", "#4a4a5e", "#b7884f"] }); openBase(); } else toast(r.why, "bad"); });
  m.querySelectorAll("[data-b]").forEach((b) => {
    if (tab === "build") b.onclick = () => { const r = S.build(st, b.dataset.b); toast(r.ok ? "건설 완료!" : r.why, r.ok ? "good" : "bad"); re(); };
  });
  if (tab === "storage") m.querySelectorAll(".slot[data-b]").forEach((b) => (b.onclick = () => { const bb = st.base.buildings.find((x) => x.uid === b.dataset.b); if (!S.withdraw(st, bb, +b.dataset.idx)) toast("가방이 가득 찼습니다", "bad"); re(); }));
  m.querySelectorAll("[data-demo]").forEach((b) => (b.onclick = async () => { if (await choice("철거", "이 시설을 철거하고 재료 절반을 돌려받을까요?", [{ label: "철거", value: 1, cls: "danger" }, { label: "취소", value: 0 }], { closable: true })) { if (!S.demolish(st, b.dataset.demo)) toast("창고가 비어 있어야 철거할 수 있습니다", "bad"); } re(); }));
  m.querySelectorAll("[data-res]").forEach((b) => (b.onclick = () => { S.startResearch(st, b.dataset.res); re(); }));
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
  const m = modal(`<h2>👥 동료·주민 <small>${st.companions.length}/${S.residentCap(st)}</small></h2>
    <p class="muted">동행(최대 2명)은 함께 싸우고, 기지에 있으면 역할을 수행합니다. 매일 말을 걸거나 선물하면 호감도가 오르고, 100이 되면 결혼할 수 있습니다. 아이는 28일(게임) 후 어른이 됩니다.</p>
    ${st.companions.map((c) => {
      const r = ROLES[c.role];
      const adult = S.isAdult(c);
      return `<div class="person"><div class="pp">${c.gender === "F" ? "👩" : "👨"}${c.child && !adult ? "🍼" : ""}</div><div class="pi">
        <b>${esc(c.name)}</b> ${c.story ? "⭐" : ""} ${c.spouse ? "💍" : ""} <small>${r?.icon} ${r?.name}${c.child ? ` · ${c.age || 0}일차${adult ? " (성인)" : ""}` : ""}</small>
        <small class="muted">${r?.effect}${c.bio ? " · " + esc(c.bio) : ""}</small>
        <small>호감 ${c.affinity ?? 0} · 사기 ${Math.round(c.morale ?? 70)} · ${c.task === "follow" ? "🚶 동행 중" : "🏠 기지"} · 힘${c.stats.str} 민${c.stats.agi} 체${c.stats.vit} 지${c.stats.int}</small>
        <div class="acts">
          <button class="btn sm" data-talk="${c.uid}">대화</button>
          <button class="btn sm" data-gift="${c.uid}">선물</button>
          ${adult ? `<button class="btn sm" data-task="${c.uid}">${c.task === "follow" ? "기지로" : "동행"}</button>` : ""}
          ${(c.role === "jobless" || c.child) ? `<select data-role="${c.uid}"><option value="">역할 지정…</option>${Object.entries(ROLES).map(([k, v]) => `<option value="${k}">${v.icon} ${v.name}</option>`).join("")}</select>` : ""}
          ${!st.family.spouse && !c.family && adult ? `<button class="btn sm pink" data-marry="${c.uid}">💍 청혼</button>` : ""}
        </div></div></div>`;
    }).join("") || '<p class="muted">아직 동료가 없습니다. 이야기를 진행하거나 기지(판잣집 이상)에 찾아오는 생존자를 받아들이세요.</p>'}`, { wide: true });
  const re = () => { m.close(); openPeople(); };
  m.querySelectorAll("[data-talk]").forEach((b) => (b.onclick = () => { const g = S.talk(st, b.dataset.talk); toast(g ? `호감도 +${g}` : "오늘은 이미 대화했습니다"); re(); }));
  m.querySelectorAll("[data-task]").forEach((b) => (b.onclick = () => { const c = st.companions.find((x) => x.uid === b.dataset.task); if (!S.assign(st, c.uid, c.task === "follow" ? "base" : "follow")) toast("동행은 최대 2명입니다", "bad"); re(); }));
  m.querySelectorAll("[data-role]").forEach((s) => (s.onchange = () => { if (s.value) S.setRole(st, s.dataset.role, s.value); re(); }));
  m.querySelectorAll("[data-marry]").forEach((b) => (b.onclick = async () => {
    const r = S.marry(st, b.dataset.marry);
    if (!r.ok) { toast(r.why, "bad"); return; }
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
  const m = modal(`<h2>🐾 동물·탈것 <small>${st.animals.length}/${S.penCapacity(st)}</small></h2>
    <p class="muted">야생 동물에게 먹이를 들고 다가가 [행동]을 누르면 길들이기 미니게임. 우리에 있으면 매일 먹이를 먹고 생산(달걀·우유)하며, 같은 종 2마리 이상이면 번식합니다. 말은 '승마' 연구 후 탈 수 있습니다.</p>
    ${st.animals.map((a) => { const d = ANIMALS[a.type]; return `<div class="person"><div class="pp">${d.icon}</div><div class="pi"><b>${esc(a.name)}</b> <small>${a.task === "follow" ? "🚶 동행" : "🏠 우리"}${a.fed === false ? ' · <span class="no">굶주림</span>' : ""}</small>
      <small class="muted">${d.prod ? "생산 " + Object.entries(d.prod).map(([k, v]) => icon(k) + v).join(" ") + " · " : ""}${d.combat ? "전투 " + d.combat + " · " : ""}${d.mount ? "탈것 ×" + d.mount + " · " : ""}먹이 ${icon(d.food)}</small>
      <div class="acts"><button class="btn sm" data-at="${a.uid}">${a.task === "follow" ? "우리로" : "데리고 다니기"}</button>${d.mount ? `<button class="btn sm" data-ride="${a.uid}">${st.player.mount?.uid === a.uid ? "내리기" : "타기"}</button>` : ""}<button class="btn sm danger" data-sl="${a.uid}">도축</button></div></div></div>`; }).join("") || '<p class="muted">아직 길들인 동물이 없습니다.</p>'}
    <h3>탈것</h3>${st.vehicles.map((v) => `<button class="btn" data-veh="${v}">${VEHICLES[v].icon} ${VEHICLES[v].name} ${st.player.mount?.id === v ? "(내리기)" : "타기"}</button>`).join(" ") || '<p class="muted">제작 메뉴에서 자전거·오토바이를 만들 수 있습니다.</p>'}`, { wide: true });
  const re = () => { m.close(); openAnimals(); };
  m.querySelectorAll("[data-at]").forEach((b) => (b.onclick = () => { const a = st.animals.find((x) => x.uid === b.dataset.at); if (a.task === "follow") a.task = "pen"; else if (st.animals.filter((x) => x.task === "follow").length < 1) a.task = "follow"; else toast("동물 동행은 1마리까지", "bad"); re(); }));
  m.querySelectorAll("[data-ride]").forEach((b) => (b.onclick = () => { if (st.player.mount?.uid === b.dataset.ride) S.mount(st, null); else if (!S.mount(st, { type: "animal", uid: b.dataset.ride })) toast("'승마' 연구가 필요합니다", "bad"); re(); }));
  m.querySelectorAll("[data-veh]").forEach((b) => (b.onclick = () => { if (st.player.mount?.id === b.dataset.veh) S.mount(st, null); else S.mount(st, { type: "vehicle", id: b.dataset.veh }); re(); }));
  m.querySelectorAll("[data-sl]").forEach((b) => (b.onclick = async () => { const a = st.animals.find((x) => x.uid === b.dataset.sl); if (await choice("도축", `${a.name}을(를) 도축해 고기 ${ANIMALS[a.type].meat}개를 얻을까요? 주민 사기가 조금 떨어집니다.`, [{ label: "도축", value: 1, cls: "danger" }, { label: "취소", value: 0 }], { closable: true })) S.slaughter(st, a.uid); re(); }));
}

// ---------------- 이야기/혈통 ----------------
export function openStory() {
  const st = G.st, acc = G.acc;
  const ch = S.chapter(st);
  const parts = S.goalProgress(st);
  const jobs = Object.entries(JOBS);
  const m = modal(`<h2>📖 ${ch.title}</h2><p class="story">${ch.text}</p>
    <div class="card"><b>목표</b>${parts.map(([t, ok]) => `<div class="${ok ? "ok" : ""}">${ok ? "✅" : "⬜"} ${t}</div>`).join("")}<small class="muted">💡 ${ch.hint}</small></div>
    <h3>지난 이야기</h3><div class="chips">${CHAPTERS.slice(0, st.story.chapter).map((c) => `<span class="chip">✔ ${c.title}</span>`).join("")}</div>
    <h3>🧬 혈통 (직업별, 죽어도 유지)</h3><div class="rlist">${jobs.map(([id, j]) => { const l = S.legacyOf(acc, id); return `<div class="recipe"><span class="ic">${j.icon}</span><div><b>${j.name} 혈통 Lv.${l.level}</b><small class="muted">누적 ${l.xp.toLocaleString()} XP · ${l.runs}번의 생애 · 최고 ${l.bestChapter}장</small><small>${j.skills.map((s) => `<span class="${s.lv <= l.level ? "ok" : "muted"}">${s.name}(Lv${s.lv})</span>`).join(" · ")}</small></div></div>`; }).join("")}</div>
    <h3>🏆 엔딩 도감 ${acc.endings.length}/16</h3><div class="chips">${jobs.map(([id, j]) => ["mercy", "tyrant"].map((pth) => { const got = acc.endings.includes(`${j.ending}:${pth}`); return `<span class="chip ${got ? "" : "dim"}">${got ? ENDINGS[j.ending][pth][0] : "???"} <small>${j.name}·${pth === "mercy" ? "자비" : "강압"}</small></span>`; }).join("")).join("")}</div>
    <p class="muted">업보(선택의 무게): ${st.karma >= 0 ? "자비로운" : "강압적인"} 지도자 (${st.karma}) — 엔딩이 달라집니다. · ${st.generation}대째 · 생존 ${st.stats.daysSurvived}일</p>
    <h3>최근 기록</h3><div class="log">${st.log.slice(-14).reverse().map((l) => `<div class="${l.kind}">${esc(l.msg)}</div>`).join("")}</div>`, { wide: true });
  return m;
}

// ---------------- 재건 올림픽 + 영토 전쟁 ----------------
export function openOlympics() {
  const st = G.st, acc = G.acc;
  const unlocked = st.base.lv >= OLYMPICS.unlockBaseLv;
  if (!unlocked) return modal(`<h2>🏟️ 재건 올림픽</h2><p>거점이 <b>목책 요새(Lv.${OLYMPICS.unlockBaseLv})</b>가 되면 비슷한 레벨의 생존자들과 겨루는 시즌제 올림픽과 영토 전쟁이 열립니다.</p><p class="muted">종목: ${OLYMPIC_EVENTS.map((e) => e.icon + e.name).join(" · ")}</p>`);
  const sid = O.rollSeason(acc);
  const today = S.todayStr();
  const ov = O.overall(acc, st.base.lv);
  const last = O.unclaimedSeason(acc);
  const ents = O.entrantList(st);
  const left = Math.ceil((O.seasonEndsAt() - Date.now()) / 86400000);
  const m = modal(`<h2>🏟️ 재건 올림픽 <small>시즌 ${sid.slice(1)} · ${left}일 남음 · 브래킷 Lv.${st.base.lv}</small></h2>
    ${last ? `<div class="card gold">지난 시즌 보상이 있습니다! <button class="btn primary" id="claimS">받기</button></div>` : ""}
    <div class="card">종합 순위 <b>${ov.overallRank}위</b> / 64 · 포인트 ${ov.pts}<br><small class="muted">1위 💎${O.rewardFor(1).gems}+${ITEMS.royal_robe.name} · 3위내 💎${O.rewardFor(3).gems} · 10위내 💎${O.rewardFor(10).gems}. 종목당 하루 ${O.TRIES_PER_DAY}회, 최고 기록만 반영.</small></div>
    <label class="muted">출전 선수: <select id="ent">${ents.map((e) => `<option value="${e.uid}">${esc(e.name)}</option>`).join("")}</select></label>
    <div class="rlist">${ov.per.map(({ ev, rank, best }) => `<div class="recipe"><span class="ic">${ev.icon}</span><div><b>${ev.name}</b> <small>${best ? `최고 ${best}점 · ${rank}위` : "미참가"} · 오늘 ${O.triesLeft(acc, ev.id, today)}회</small><small class="muted">${Object.entries(ev.w).map(([k, w]) => STATS.find((s) => s.id === k).name + Math.round(w * 100) + "%").join(" ")}${ev.needAnimal ? " · 말 필요" : ""}</small></div>
      <div class="acts"><button class="btn sm" data-auto="${ev.id}">맡기기</button><button class="btn sm primary" data-man="${ev.id}">직접</button></div></div>`).join("")}</div>
    <h3>🌐 전국 순위 <small id="netState">${Net.enabled() ? "불러오는 중…" : "오프라인 모드 — 같은 브래킷의 시뮬레이션 라이벌과 경쟁"}</small></h3>
    <div id="netBoard" class="muted small"></div>
    <h3>⚔️ 영토 전쟁 (비동기 PvP)</h3>
    <div class="card">비슷한 전투력(±15%)의 다른 왕국 방어 기록에 도전합니다. 상대는 실시간 접속이 필요 없습니다(서버 비용 최소화).<br><button class="btn" id="war">상대 찾기</button> <small class="muted">하루 3회 · 승리 시 금화·영토 점수</small></div>`, { wide: true });
  const re = () => { m.close(); G.afterAction(); openOlympics(); };
  // 랭킹 화면을 열 때만 기록을 보낸다(바뀐 것만, 종류별 1시간 1회) — 받기도 1시간 캐시·상위 100명
  if (acc.war?.season !== sid) acc.war = { date: "", n: 0, score: 0, season: sid };
  const recs = OLYMPIC_EVENTS.filter((ev) => acc.olympics.entries[ev.id]?.best).map((ev) => ({ kind: ev.id, score: acc.olympics.entries[ev.id].best }));
  if (acc.war.score) recs.push({ kind: "war", score: acc.war.score });
  if (Net.enabled() && !st.__tampered && recs.length) Net.openRanking(recs, sid, st.base.lv).then((boards) => {
    const el = m.querySelector("#netBoard"); if (!el) return;
    m.querySelector("#netState").textContent = boards.error ? `연결 실패(캐시 표시): ${boards.error}` : "1시간마다 갱신";
    el.innerHTML = recs.map((r) => { const rows = boards[r.kind] || []; const my = rows.findIndex((x) => x.score <= r.score); const ev = OLYMPIC_EVENTS.find((e) => e.id === r.kind); return `<div>${ev ? ev.icon + ev.name : "⚔️ 영토"}: 내 기록 ${r.score} · ${my >= 0 ? `약 ${my + 1}위` : rows.length >= 100 ? "100위 밖" : `${rows.length + 1}위`} / 1위 ${esc(rows[0]?.name || "-")} ${rows[0]?.score ?? ""}</div>`; }).join("");
  }).catch(() => {}); ents.find((e) => e.uid === m.querySelector("#ent").value);
  m.querySelector("#claimS")?.addEventListener("click", () => { const r = O.claimSeason(acc, st.base.lv, JOBS[st.player.job].perks.prize || 0); if (r) { st.gold += r.gold; toast(`시즌 ${r.rank}위! 💎${r.gems} 금화${r.gold}`, "good"); if (r.item) S.giveItem(st, r.item, 1); } re(); });
  m.querySelectorAll("[data-auto]").forEach((b) => (b.onclick = () => {
    const ev = OLYMPIC_EVENTS.find((e) => e.id === b.dataset.auto);
    const e = entrant(); const extra = O.eventExtra(st, ev);
    if (extra < 0) return toast("말이 있어야 출전할 수 있습니다", "bad");
    const sc = O.autoScore(sid + today, ev, e, extra);
    const r = O.submit(acc, st, ev.id, e.uid, sc, today);
    toast(r.ok ? `${ev.name}: ${sc}점 (${r.rank}위)${r.improved ? " 신기록!" : ""}` : r.why, r.ok ? "good" : "bad");
    re();
  }));
  m.querySelectorAll("[data-man]").forEach((b) => (b.onclick = async () => {
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
    toast(r.ok ? `${ev.name}: ${sc}점 (${r.rank}위)${r.improved ? " 신기록!" : ""}` : r.why, "good");
    G.afterAction(); openOlympics();
  }));
  m.querySelector("#war").onclick = async () => {
    const t = S.todayStr();
    if (acc.war.date !== t) Object.assign(acc.war, { date: t, n: 0 });
    if (acc.war.n >= 3) return toast("오늘 전쟁 횟수를 모두 썼습니다", "bad");
    const myPow = S.combatPower(st);
    const rng = makeRng(`${sid}|war|${t}|${acc.war.n}`);
    const foePow = Math.round(myPow * rng.range(0.85, 1.15));
    const foeName = `${rng.pick(["북부", "강변", "철의", "푸른", "잿빛", "남쪽"])} ${rng.pick(["왕국", "연합", "자치령", "공국"])}`;
    const go = await choice("⚔️ 영토 전쟁", `상대: <b>${foeName}</b> (전투력 ${foePow})<br>내 전투력: ${myPow}<br>직접 지휘(사격전)하거나 자동 전투를 맡길 수 있습니다.`, [{ label: "직접 지휘", value: "man", cls: "primary" }, { label: "자동 전투", value: "auto" }, { label: "취소", value: null }], { closable: true });
    if (!go) return;
    acc.war.n++;
    m.close();
    let win;
    if (go === "man") { const r = await G.playShooter({ title: `⚔️ vs ${foeName}`, enemyCount: 14, enemyHp: 40, enemyAtk: 9, duration: 35 }, foePow); win = r.win; }
    else win = rng.next() < Math.max(0.05, Math.min(0.95, 0.5 + (myPow / foePow - 1) * 2));
    if (win) { const g = Math.round(foePow * 0.8); st.gold += g; acc.war.score += 10; toast(`승리! 금화 +${g}, 영토 점수 ${acc.war.score}`, "good"); }
    else toast("패배… 방어선을 보강하세요", "bad");
    G.afterAction(); openOlympics();
  };
}

// ---------------- 상점 ----------------
export function openShop() {
  const st = G.st, acc = G.acc;
  const daily = Shop.dailyState(acc, st);
  const pass = Shop.passActive(acc);
  const m = modal(`<h2>💎 상점 <small>보유 💎${acc.gems} · 부활권 ${acc.reviveTokens} · 금화 ${Math.floor(st.gold)}</small></h2>
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
  const m = modal(`<h2>☰ 메뉴</h2>
    <div class="card">${DIFFICULTY[st.difficulty].name} · ${JOBS[st.player.job].icon} ${JOBS[st.player.job].name} · ${esc(st.player.name)} · ${S.day(st)}일차</div>
    <div class="choices">
      <button class="btn" id="save">💾 지금 저장</button>
      <button class="btn" id="exp">📤 저장 코드 내보내기 (기기 변경)</button>
      <button class="btn" id="imp">📥 저장 코드 가져오기</button>
      <button class="btn" id="news">📢 공지 · 🏛️ 명예의 전당</button>
      <button class="btn" id="rename">✏️ 랭킹 이름 변경 (하루 1회)</button>
      <button class="btn" id="help">❓ 조작법·도움말</button>
      <button class="btn danger" id="newg">🆕 새 생애 시작 (현재 세계 포기)</button>
    </div>`);
  m.querySelector("#save").onclick = () => { G.save(); toast("저장했습니다", "good"); };
  m.querySelector("#exp").onclick = () => { const code = exportAll(st, G.acc); m.close(); const mm = modal(`<h3>저장 코드</h3><textarea readonly class="code">${code}</textarea><p class="muted">다른 기기에서 [가져오기]에 붙여넣으세요.</p>`); mm.querySelector("textarea").select(); };
  m.querySelector("#imp").onclick = () => { m.close(); const mm = modal(`<h3>저장 코드 붙여넣기</h3><textarea class="code" id="code"></textarea><button class="btn primary" id="go">불러오기</button>`); mm.querySelector("#go").onclick = () => { const o = importAll(mm.querySelector("#code").value); if (!o) return toast("올바르지 않은 코드", "bad"); saveGame(o.st); saveAccount(o.acc); location.reload(); }; };
  m.querySelector("#help").onclick = () => { m.close(); help(); };
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

// ---------------- 이벤트 모달 ----------------
export async function deathModal() {
  const st = G.st, acc = G.acc;
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

// ---------------- HUD ----------------
export function renderHud() {
  const st = G.st, p = st.player, acc = G.acc;
  const bar = (v, max, cls) => `<div class="hb ${cls}"><i style="width:${Math.max(0, Math.min(100, (v / max) * 100))}%"></i></div>`;
  const sea = S.season(st);
  $("#hud").innerHTML = `
    <div class="hud-l">
      <div class="who">${JOBS[p.job].icon} <b>${esc(p.name)}</b> Lv.${p.level} <small>혈통${p.legacyLevel}</small></div>
      <div class="bars"><span>❤️</span>${bar(p.hp, p.maxHp, "hp")}<span>🍗</span>${bar(p.hunger, 100, "hu")}<span>💧</span>${bar(p.thirst, 100, "th")}</div>
      <div class="bars sm"><span>🌡️${Math.round(p.warmth)}℃</span>${p.rad > 0 ? `<span class="${p.rad >= 100 ? "no" : ""}">☢️${Math.round(p.rad)}</span>` : ""}${p.sick > 0 ? '<span class="no">🤢배탈</span>' : ""}${st.buffs.xp ? '<span class="ok">📘XP+50%</span>' : ""}</div>
    </div>
    <div class="hud-r">
      <div>${sea.icon} ${S.day(st)}일차 ${S.clockStr(st)}</div>
      <div><span title="보석">💎${acc.gems}</span> <span title="금화">🪙${Math.floor(st.gold)}</span></div>
    </div>
    <div class="goal" id="goalBox">📖 ${S.chapter(st).hint}</div>`;
  $("#goalBox").onclick = () => openStory();
}
