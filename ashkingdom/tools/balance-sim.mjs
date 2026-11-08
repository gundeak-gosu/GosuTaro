// 난이도/과금 밸런스 시뮬레이터 — `node tools/balance-sim.mjs`
// 실제 게임의 combatPower() 공식과 XP 곡선/부활 규칙/보스 요구 전투력을 그대로 사용해
// 플레이어 유형별로 '최종 보스(재의 군주)를 잡기까지 걸리는 실제 일수'를 몬테카를로로 추정한다.
//
// 목표(기획서 §6):
//   쉬움   무과금 하루 1시간 → 14~35일
//   보통   무과금 하루 1시간 → 45~100일
//   어려움 무과금 하루 1시간 → 240일 이상 (장기 육성자만), 무과금 2시간 → 120~300일
//          월정액+소과금(월 3만원) 1시간 → 무과금 1시간보다 확실히 빠름(≤ 70%), 단 90일 이상
import * as S from "../js/systems.js";
import { DIFFICULTY, XP_CURVE, BUILDINGS } from "../js/data.js";
import { makeRng } from "../js/rng.js";

const XP_PER_HOUR = 2400; // 채집·전투·제작·생존 평균 (플레이 로그 측정치로 교체 예정)
// 챕터별 소요 플레이 시간(보통, 시간). 0~10장. 11장 = 보스(전투력 조건)
const CH_HOURS = [0.15, 0.4, 0.8, 1.5, 2, 3.5, 4, 6, 8, 11, 15];
const PACE = { easy: 0.6, normal: 1.0, hard: 1.5 };
const DEATH_RATE = { easy: 0.015, normal: 0.04, hard: 0.11 }; // 시간당 사망 기본률(혈통 0)

const PROFILES = [
  { id: "f2p1", name: "무과금 · 하루 1시간", hours: 1, pay: 0, pass: false },
  { id: "f2p2", name: "무과금 · 하루 2시간", hours: 2, pay: 0, pass: false },
  { id: "pass", name: "월정액만 · 하루 1시간", hours: 1, pay: 0, pass: true },
  { id: "light", name: "월정액+월3만원 · 1시간", hours: 1, pay: 30000, pass: true },
  { id: "heavy", name: "월정액+월10만원 · 1시간", hours: 1, pay: 100000, pass: true },
];

// ---- 실제 combatPower 를 쓰는 전투력 추정 ----
const acc0 = S.newAccount();
const memo = new Map();
function powerAt(level, legacyLv, chapter, baseFill) {
  const key = `${level}|${legacyLv}|${chapter}|${baseFill.toFixed(1)}`;
  if (memo.has(key)) return memo.get(key);
  const st = S.newGame({ gender: "M", job: "soldier", difficulty: "normal", seed: 1, account: acc0 });
  const p = st.player;
  p.level = level; p.legacyLevel = legacyLv;
  for (const k of Object.keys(p.stats)) p.stats[k] += Math.floor(legacyLv / 2);
  // 레벨업 포인트 2/레벨 균등 분배
  const pts = (level - 1) * 2; const ks = Object.keys(p.stats);
  for (let i = 0; i < pts; i++) p.stats[ks[i % ks.length]]++;
  const weapon = chapter < 4 ? "spear" : chapter < 8 ? "pipe_pistol" : chapter < 10 ? "rifle" : "royal_blade";
  const gear = chapter < 4 ? [] : chapter < 6 ? ["leather_jacket", "boots"] : chapter < 8 ? ["leather_jacket", "boots", "helmet"] : ["combat_vest", "boots", "helmet"];
  // 무기 기술: 7장(기지 Lv5)부터 훈련소가 2단계를 가르친다 → 그 무렵 총기·검술을 익혔다고 본다
  p.wskills = { firearms: chapter >= 7 ? 2 : 1, blade: chapter >= 7 ? 2 : chapter >= 4 ? 1 : 0 };
  S.addItem(st, st.inv, weapon, 1); if (!S.equipFromInv(st, weapon)) throw new Error("sim: cannot equip " + weapon);
  for (const g of gear) { S.addItem(st, st.inv, g, 1); S.equipFromInv(st, g); }
  st.base.lv = Math.min(8, 1 + Math.floor(chapter * 0.65));
  // 방어 시설: 장(chapter)과 자원 충실도(baseFill 0~1)에 비례
  const towers = Math.min(4, Math.floor(chapter / 2));
  for (let i = 0; i < towers; i++) st.base.buildings.push({ uid: "t" + i, id: "watchtower" });
  if (chapter >= 6) st.base.buildings.push({ uid: "br", id: "barracks" }, { uid: "g", id: "wall_gate" });
  const turrets = chapter >= 9 ? Math.round(BUILDINGS.turret.max * baseFill) : 0;
  for (let i = 0; i < turrets; i++) st.base.buildings.push({ uid: "tu" + i, id: "turret" });
  // 동료: 장이 진행될수록 군인/동행 증가
  const mk = (task, role) => ({ uid: Math.random() + "", name: "x", role, task, stats: { str: 7, agi: 7, vit: 7, int: 5, cha: 5, cra: 5 } });
  if (chapter >= 2) st.companions.push(mk("follow", "doctor"));
  if (chapter >= 6) st.companions.push(mk("follow", "soldier"));
  const soldiers = Math.round(Math.max(0, chapter - 6) * baseFill);
  for (let i = 0; i < soldiers; i++) st.companions.push(mk("base", "soldier"));
  if (chapter >= 4) st.animals.push({ uid: "d", type: "dog", task: "follow" });
  if (chapter >= 9) st.animals.push({ uid: "w", type: "wolf", task: "pen" });
  const v = S.combatPower(st);
  memo.set(key, v);
  return v;
}

function levelFromXp(xp) {
  let lv = 1;
  while (lv < XP_CURVE.runLevelCap && xp >= XP_CURVE.runLevelXp(lv)) { xp -= XP_CURVE.runLevelXp(lv); lv++; }
  return lv;
}

function simulate(diffId, prof, seed, maxDays = 730) {
  const d = DIFFICULTY[diffId];
  const rng = makeRng(seed);
  let legacyXp = 0, runXp = 0, chapter = 0, chProgress = 0, gems = 200, tokens = 1;
  let lastFree = -1e9, doctorUsedCh = -1, selfUsed = 0, reviveCh = 0, resets = 0, hoursTotal = 0;
  const payGemsPerMonth = prof.pay / 1000 * 280; // 1000원 ≈ 280보석(상점 평균)
  for (let dayN = 1; dayN <= maxDays; dayN++) {
    // 일일 보석 수급: 미션(무과금) + 월정액 + 결제
    gems += 100 + (prof.pass ? 120 : 0) + payGemsPerMonth / 30;
    if (prof.pass && dayN % 7 === 0) tokens++;
    // 자원 가속(과금): 보급 투하/즉시 완료로 챕터 진행 속도 향상 — 보석 일부를 소비
    // 1순위: 훈련 교본(시간당 150보석, 경험치 +50%) — 부활용 보석은 남겨둔다
    const reserve = diffId === "hard" ? 1500 : 400;
    const boostHours = Math.min(prof.hours, Math.max(0, Math.floor((gems - reserve) / 150)));
    gems -= boostHours * 150;
    const xpMul = 1 + (prof.pass ? 0.2 : 0);
    const speedBudget = Math.max(0, gems - reserve) * 0.5;
    const pace = PACE[diffId] / (1 + Math.min(0.6, speedBudget / 4000));
    if (speedBudget > 0) gems -= speedBudget * 0.3;
    const baseFill = Math.min(1, 0.45 + (prof.pass ? 0.15 : 0) + Math.min(0.4, prof.pay / 250000) + Math.min(0.3, legacyXp / 4e6));

    for (let h = 0; h < prof.hours; h += 0.25) {
      const dt = 0.25;
      hoursTotal += dt;
      const xpH = XP_PER_HOUR * (xpMul + (h < boostHours ? 0.5 : 0));
      runXp += xpH * dt;
      legacyXp += xpH * dt; // 혈통은 살아 있는 동안에도 쌓인다
      const G = XP_CURVE.legacyLevel(legacyXp);
      // 장 진행
      if (chapter < 11) {
        chProgress += dt;
        if (chProgress >= CH_HOURS[chapter] * pace) { chProgress = 0; chapter++; reviveCh = 0; legacyXp += 300; }
      } else {
        // 보스 도전: 하루 1회
        if (h === 0) {
          const pow = powerAt(levelFromXp(runXp), G, 11, baseFill);
          const ratio = pow / d.bossPower;
          const pWin = Math.max(0, Math.min(0.95, (ratio - 0.85) / 0.3));
          if (rng.next() < pWin) return { days: dayN, resets, hours: hoursTotal, legacy: G, level: levelFromXp(runXp) };
        }
      }
      // 사망: 혈통이 높을수록, 그리고 장이 진행될수록 적도 강해짐
      const rate = DEATH_RATE[diffId] * Math.exp(-G / 22) * (0.7 + chapter * 0.05);
      if (rng.next() < rate * dt) {
        const now = dayN * 24;
        if (now - lastFree >= d.freeReviveEveryRealHours) { lastFree = now; continue; }
        if (tokens > 0) { tokens--; continue; }
        if (chapter >= 2 && doctorUsedCh !== chapter) { doctorUsedCh = chapter; continue; }
        if (d.adRevive && rng.next() < 0.8) continue; // 광고 1일 1회(대부분 사용)
        const cost = d.reviveGemCost[Math.min(reviveCh, d.reviveGemCost.length - 1)];
        if (gems >= cost && (prof.pay > 0 || prof.pass || cost <= 400)) { gems -= cost; reviveCh++; continue; }
        // 부활 실패 → 8장 이후엔 후계자(왕국 유지, 레벨 1), 그 전엔 세계 초기화
        resets++;
        legacyXp += chapter * 300;
        runXp = 0;
        if (chapter < 8) { chapter = 0; chProgress = 0; }
      }
    }
  }
  return { days: Infinity, resets, hours: hoursTotal, legacy: XP_CURVE.legacyLevel(legacyXp) };
}

function median(a) { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }
function pct(a, p) { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length * p)]; }

const RUNS = 300;
const table = {};
console.log("== 잿빛 왕국 밸런스 시뮬레이션 (실제 일수, 300회 몬테카를로) ==\n");
for (const diffId of Object.keys(DIFFICULTY)) {
  console.log(`[${DIFFICULTY[diffId].name}] 보스 권장 전투력 ${DIFFICULTY[diffId].bossPower}`);
  for (const prof of PROFILES) {
    const rs = Array.from({ length: RUNS }, (_, i) => simulate(diffId, prof, i * 7919 + 13));
    const days = rs.map((r) => r.days);
    const cleared = days.filter((x) => x < Infinity).length / RUNS;
    const med = median(days);
    table[`${diffId}:${prof.id}`] = { med, p25: pct(days, 0.25), p75: pct(days, 0.75), cleared };
    const fmt = (x) => (x === Infinity ? "  미달" : String(x).padStart(5));
    console.log(`  ${prof.name.padEnd(22)} 중앙값 ${fmt(med)}일  (25%:${fmt(pct(days, 0.25))} / 75%:${fmt(pct(days, 0.75))})  2년내 클리어 ${(cleared * 100).toFixed(0)}%  평균 리셋 ${(rs.reduce((a, r) => a + r.resets, 0) / RUNS).toFixed(1)}회`);
  }
  console.log("");
}

// ---- 목표 검증 ----
const checks = [
  ["쉬움 무과금1h 14~35일", () => inRange(table["easy:f2p1"].med, 14, 35)],
  ["보통 무과금1h 45~100일", () => inRange(table["normal:f2p1"].med, 45, 100)],
  ["어려움 무과금1h ≥ 240일 (장기 육성자만)", () => table["hard:f2p1"].med >= 240],
  ["어려움 무과금2h 120~300일 (꾸준히 키우면 무과금도 클리어)", () => inRange(table["hard:f2p2"].med, 120, 300)],
  ["어려움 소과금1h ≤ 무과금1h의 70%", () => table["hard:light"].med <= table["hard:f2p1"].med * 0.7],
  ["어려움 과금해도 90일 이상 (돈으로 즉시 클리어 불가)", () => table["hard:heavy"].med >= 90],
  ["어려움 무과금 2년 내 클리어율 ≥ 80% (무과금 엔딩 가능)", () => table["hard:f2p1"].cleared >= 0.8],
];
function inRange(x, a, b) { return x >= a && x <= b; }
let bad = 0;
console.log("== 목표 검증 ==");
for (const [name, fn] of checks) { const ok = fn(); if (!ok) bad++; console.log(`  ${ok ? "✔" : "✘"} ${name}`); }
process.exit(bad ? 1 : 0);
