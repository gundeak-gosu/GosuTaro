// =====================================================================
// 게임 규칙 엔진 — DOM/Canvas 를 전혀 쓰지 않는 순수 로직.
// 브라우저와 Node(테스트·밸런스 시뮬레이터)에서 똑같이 돌아간다.
// =====================================================================
import {
  VERSION, TIME, DIFFICULTY, JOBS, ITEMS, RECIPES, BUILDINGS, BASE_LEVELS, RESEARCH, ANIMALS,
  VEHICLES, ROLES, STORY_COMPANIONS, SURVIVOR_NAMES, CHAPTERS, ENDINGS, XP_CURVE, ENEMIES,
} from "./data.js";
import { makeRng } from "./rng.js";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
let uidCounter = 0;
export const uid = (p = "u") => `${p}${Date.now().toString(36)}${(uidCounter++).toString(36)}`;

// =========================== 계정(혈통/보석) ===========================
// 보석·부활권·혈통은 '계정'에 귀속된다 — 캐릭터가 죽어도 사라지지 않음(과금 보호).
export function newAccount() {
  return {
    v: VERSION, gems: 200, reviveTokens: 1, lastFreeRevive: 0,
    passUntil: 0, ads: { date: "", count: 0, freeRevive: false },
    jobs: {}, endings: [], purchases: [], runs: 0,
    olympics: { season: "", entries: {}, history: [] },
    settings: { sound: true, autoStats: true },
  };
}

export function legacyOf(account, job) {
  const j = account.jobs[job] || { xp: 0, runs: 0, bestChapter: 0 };
  return { ...j, level: XP_CURVE.legacyLevel(j.xp) };
}

export function addLegacyXp(account, job, xp) {
  account.jobs[job] = account.jobs[job] || { xp: 0, runs: 0, bestChapter: 0 };
  account.jobs[job].xp += Math.floor(xp);
}

export function unlockedSkills(account, job) {
  const lv = legacyOf(account, job).level;
  return JOBS[job].skills.filter((s) => s.lv <= lv);
}
export function hasSkill(state, id) {
  return (state.player.skills || []).includes(id);
}

// =========================== 새 게임 ===========================
export function newGame({ name, gender, job, difficulty, seed, account, look }) {
  if (!JOBS[job]) throw new Error("unknown job " + job);
  if (!DIFFICULTY[difficulty]) throw new Error("unknown difficulty " + difficulty);
  const jd = JOBS[job];
  const leg = legacyOf(account, job);
  const legacyBonus = Math.floor(leg.level / 2); // 혈통 2레벨마다 전 능력치 +1
  const stats = {};
  for (const k of Object.keys(jd.stats)) stats[k] = jd.stats[k] + legacyBonus;
  const st = {
    v: VERSION,
    seed: seed ?? Math.floor(Math.random() * 2 ** 31),
    createdAt: Date.now(),
    lastSaved: Date.now(),
    difficulty,
    player: {
      name: name || (gender === "F" ? "이름 없는 여인" : "이름 없는 사내"),
      gender, job, look: look || { skin: "#d9a982", hair: gender === "F" ? "long" : "short", hairColor: "#2b211b" },
      level: 1, xp: 0, stats, statPoints: 0, legacyLevel: leg.level,
      skills: unlockedSkills(account, job).map((s) => s.id),
      hp: 0, maxHp: 0, hunger: 85, thirst: 85, warmth: 0, rad: 0, sick: 0,
      x: 0, y: 0, equip: { head: null, body: null, legs: null, feet: null, back: null, hand: null },
      mount: null, selfRevives: 0,
    },
    inv: [],
    time: { min: 7 * 60 }, // 1일차 07:00
    base: { lv: 1, buildings: [], research: { done: [], points: 0, current: null } },
    companions: [],
    animals: [],
    vehicles: [],
    story: { chapter: 0, visited: {}, crafted: {}, built: {}, raidWon: 0, tamed: 0, olympics: 0, bossDefeated: false, restore: 0, seen: [0] },
    karma: 0,
    revive: { usedThisChapter: 0 },
    gold: 0,
    world: { depleted: {} },
    stats: { kills: 0, crafted: 0, gathered: 0, daysSurvived: 0, xpEarned: 0 },
    nextRaidDay: DIFFICULTY[difficulty].raidEveryDays + 2,
    family: { spouse: null, children: [] },
    buffs: {},
    log: [],
    dead: false,
    ended: null,
    generation: 1,
  };
  st.player.maxHp = maxHp(st);
  st.player.hp = st.player.maxHp;
  // 기본 속옷 상태(맨몸) → 시작 옷: 누더기 셔츠·바지
  for (const [id, q] of jd.start) addItem(st, st.inv, id, q);
  addItem(st, st.inv, "rag_shirt", 1); equipFromInv(st, "rag_shirt");
  addItem(st, st.inv, "rag_pants", 1); equipFromInv(st, "rag_pants");
  log(st, `${DIFFICULTY[difficulty].name} 난이도 · ${jd.name} ${st.player.name}의 생존이 시작됩니다.`);
  if (leg.level > 0) log(st, `혈통 Lv.${leg.level} — 선대의 경험이 능력치 +${legacyBonus}로 이어집니다.`);
  return st;
}

export function log(st, msg, kind = "info") {
  st.log.push({ t: st.time.min, msg, kind });
  if (st.log.length > 80) st.log.splice(0, st.log.length - 80);
}

// =========================== 시간 ===========================
export const day = (st) => Math.floor(st.time.min / 1440) + 1;
export const hourOf = (st) => Math.floor((st.time.min % 1440) / 60);
export const isNight = (st) => { const h = hourOf(st); return h >= 20 || h < 6; };
export const season = (st) => TIME.seasons[Math.floor((day(st) - 1) / TIME.daysPerSeason) % 4];
export const diff = (st) => DIFFICULTY[st.difficulty];
export const clockStr = (st) => {
  const m = Math.floor(st.time.min) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

// =========================== 인벤토리 ===========================
export function bagSize(st) {
  let n = 16;
  const back = st.player.equip.back;
  if (back && ITEMS[back.id].bag) n += ITEMS[back.id].bag;
  return n;
}

export function makeStack(id, qty) {
  const it = ITEMS[id];
  if (!it) throw new Error("unknown item " + id);
  const s = { id, qty };
  if (it.dur) { s.dur = it.dur; s.maxDur = it.dur; }
  if (it.spoil) s.fresh = 1;
  return s;
}

const stackable = (id) => !ITEMS[id].dur;

// 음식은 신선도 가중평균으로 합쳐진다(단순화). 내구도 있는 물건은 쌓이지 않는다.
export function addItem(st, inv, id, qty = 1, fresh = 1, limit = Infinity) {
  if (qty <= 0) return 0;
  if (stackable(id)) {
    const ex = inv.find((s) => s.id === id);
    if (ex) {
      if (ex.fresh !== undefined) ex.fresh = (ex.fresh * ex.qty + fresh * qty) / (ex.qty + qty);
      ex.qty += qty;
      return qty;
    }
    if (inv.length >= limit) return 0;
    const s = makeStack(id, qty);
    if (s.fresh !== undefined) s.fresh = fresh;
    inv.push(s);
    return qty;
  }
  let added = 0;
  for (let i = 0; i < qty; i++) {
    if (inv.length >= limit) break;
    inv.push(makeStack(id, 1));
    added++;
  }
  return added;
}

export function giveItem(st, id, qty = 1, fresh = 1) {
  const got = addItem(st, st.inv, id, qty, fresh, bagSize(st));
  if (got < qty) {
    // 가방이 가득 차면 기지 창고로(기지 안일 때만) — 아니면 버려짐
    const left = qty - got;
    const stored = storeToBase(st, id, left, fresh);
    if (stored < left) log(st, `가방이 가득 차 ${ITEMS[id].name} ${left - stored}개를 버렸습니다.`, "warn");
  }
  return got;
}

export function count(inv, id) {
  return inv.reduce((n, s) => (s.id === id ? n + s.qty : n), 0);
}

export function allStorage(st) {
  return st.base.buildings.filter((b) => b.storage);
}

export function countAll(st, id) {
  let n = count(st.inv, id);
  for (const b of allStorage(st)) n += count(b.storage, id);
  return n;
}

export function removeFrom(inv, id, qty) {
  let need = qty;
  // 덜 신선한 것부터 소모(선입선출)
  const stacks = inv.filter((s) => s.id === id).sort((a, b) => (a.fresh ?? 1) - (b.fresh ?? 1));
  for (const s of stacks) {
    const take = Math.min(s.qty, need);
    s.qty -= take;
    need -= take;
    if (need <= 0) break;
  }
  for (let i = inv.length - 1; i >= 0; i--) if (inv[i].qty <= 0) inv.splice(i, 1);
  return qty - need;
}

// 비용 확인/소모 — 가방 + 기지 창고(기지 안에 있을 때)
export function canAfford(st, cost, useBase = true) {
  for (const [id, q] of Object.entries(cost)) {
    const have = useBase ? countAll(st, id) : count(st.inv, id);
    if (have < q) return false;
  }
  return true;
}

export function pay(st, cost, useBase = true) {
  if (!canAfford(st, cost, useBase)) return false;
  for (const [id, q] of Object.entries(cost)) {
    let left = q - removeFrom(st.inv, id, q);
    if (useBase) for (const b of allStorage(st)) { if (left <= 0) break; left -= removeFrom(b.storage, id, left); }
  }
  return true;
}

export function missing(st, cost) {
  return Object.entries(cost).filter(([id, q]) => countAll(st, id) < q).map(([id, q]) => `${ITEMS[id]?.name ?? id} ${countAll(st, id)}/${q}`);
}

function storageCap(b) { return BUILDINGS[b.id].storage.slots; }

export function storeToBase(st, id, qty, fresh = 1) {
  let left = qty;
  // 보관 효율이 좋은 곳(부패 배율 낮은 곳)부터 — 음식이면
  const stores = allStorage(st).sort((a, b) => storageMult(st, a) - storageMult(st, b));
  for (const b of stores) {
    if (left <= 0) break;
    left -= addItem(st, b.storage, id, left, fresh, storageCap(b));
  }
  return qty - left;
}

export function depositAll(st, filter = () => true) {
  let moved = 0;
  for (let i = st.inv.length - 1; i >= 0; i--) {
    const s = st.inv[i];
    if (!filter(s)) continue;
    if (s.dur !== undefined) {
      const b = allStorage(st).find((b) => b.storage.length < storageCap(b));
      if (!b) continue;
      b.storage.push(s); st.inv.splice(i, 1); moved++;
    } else {
      const got = storeToBase(st, s.id, s.qty, s.fresh ?? 1);
      s.qty -= got; moved += got;
      if (s.qty <= 0) st.inv.splice(i, 1);
    }
  }
  return moved;
}

export function withdraw(st, building, index) {
  const s = building.storage[index];
  if (!s) return false;
  if (st.inv.length >= bagSize(st) && !(stackable(s.id) && st.inv.some((x) => x.id === s.id))) return false;
  building.storage.splice(index, 1);
  if (s.dur !== undefined) st.inv.push(s);
  else addItem(st, st.inv, s.id, s.qty, s.fresh ?? 1);
  return true;
}

// =========================== 장비/내구도 ===========================
export function equipFromInv(st, idOrIndex) {
  const idx = typeof idOrIndex === "number" ? idOrIndex : st.inv.findIndex((s) => s.id === idOrIndex);
  const s = st.inv[idx];
  if (!s) return false;
  const it = ITEMS[s.id];
  if (!it.slot) return false;
  const old = st.player.equip[it.slot];
  st.inv.splice(idx, 1);
  st.player.equip[it.slot] = s;
  if (old) st.inv.push(old);
  st.player.maxHp = maxHp(st);
  return true;
}

export function unequip(st, slot) {
  const s = st.player.equip[slot];
  if (!s) return false;
  if (st.inv.length >= bagSize(st) && slot !== "back") return false;
  st.player.equip[slot] = null;
  st.inv.push(s);
  return true;
}

// amount 만큼 닳게 한다. 기술자 패시브는 소모 -30%
export function wear(st, slot, amount = 1) {
  const s = st.player.equip[slot];
  if (!s || s.dur === undefined) return;
  const mult = 1 + (JOBS[st.player.job].perks.wear || 0);
  s.dur -= amount * mult;
  if (s.dur <= 0) {
    st.player.equip[slot] = null;
    log(st, `${ITEMS[s.id].name}이(가) 닳아서 부서졌습니다.`, "warn");
  }
}

export function repairCost(id) {
  const r = RECIPES.find((r) => r.out[0] === id);
  if (!r) return { scrap: 3 };
  const c = {};
  for (const [k, v] of Object.entries(r.in)) c[k] = Math.max(1, Math.ceil(v / 2));
  return c;
}

// 수리: 내구도 회복 대신 최대 내구도 10% 감소(현실적 마모). 기술자 '정비' 스킬은 감소 없음.
export function repair(st, stack) {
  if (!stack || stack.dur === undefined) return false;
  if (!hasStation(st, "workbench")) return false;
  if (!pay(st, repairCost(stack.id))) return false;
  if (!hasSkill(st, "repair")) stack.maxDur = Math.max(5, Math.floor(stack.maxDur * 0.9));
  stack.dur = stack.maxDur;
  return true;
}

export function equipStat(st, key) {
  let n = 0;
  for (const s of Object.values(st.player.equip)) if (s) n += ITEMS[s.id][key] || 0;
  return n;
}

export function eff(st, stat) { return st.player.stats[stat] + (hasSkill(st, "accidental") ? 5 : 0); }
export function maxHp(st) { return 80 + eff(st, "vit") * 4 + st.player.level * 2; }

// =========================== 스플(부패) ===========================
export function storageMult(st, b) {
  const def = BUILDINGS[b.id].storage;
  if (def.needPower && !hasPower(st, def.needPower)) return 1.0; // 정전된 냉장고는 그냥 상자
  let m = def.spoil;
  const cooks = st.companions.filter((c) => c.role === "cook" && c.task === "base" && isAdult(c)).length;
  m *= Math.max(0.5, 1 - 0.25 * cooks);
  return m;
}

export function bagSpoilMult(st) {
  return 1 + (JOBS[st.player.job].perks.spoil || 0);
}

function spoilInv(st, inv, hours, mult) {
  const base = diff(st).spoil * season(st).spoil * mult;
  for (let i = inv.length - 1; i >= 0; i--) {
    const s = inv[i];
    const it = ITEMS[s.id];
    if (!it.spoil || s.fresh === undefined) continue;
    s.fresh -= (hours / it.spoil) * base;
    if (s.fresh <= 0) {
      inv.splice(i, 1);
      addItem(st, inv, "rotten_food", s.qty);
    }
  }
}

export function freshLabel(f) {
  if (f === undefined) return "";
  if (f > 0.7) return "신선";
  if (f > 0.3) return "보통";
  return "상하기 직전";
}

// =========================== 전력 ===========================
export function powerSupply(st) {
  return st.base.buildings.filter((b) => b.id === "generator" && b.fueled).length * 10;
}
export function powerDemand(st) {
  return st.base.buildings.filter((b) => BUILDINGS[b.id].storage?.needPower).length * 2;
}
export function hasPower(st) { return powerSupply(st) >= powerDemand(st) && powerSupply(st) > 0; }

// =========================== 생존 수치 ===========================
export function ambientTemp(st, atBase, nearFire) {
  let t = season(st).temp;
  if (isNight(st)) t -= 8;
  if (atBase) t += 6 + st.base.lv; // 벽과 지붕
  if (nearFire) t += 15;
  return t;
}

// 게임 시간 minutes 만큼 진행. ctx: { atBase, nearFire, inRad, sleeping }
export function tick(st, minutes, ctx = {}) {
  if (st.dead || st.ended) return [];
  const events = [];
  const h = minutes / 60;
  const p = st.player;
  const d = diff(st);
  const dayBefore = day(st);
  st.time.min += minutes;
  const needMul = d.needs * (ctx.sleeping ? 0.5 : 1);

  // 배고픔/갈증
  const coldFactor = p.warmth < 0 ? 1.3 : 1;
  p.hunger = clamp(p.hunger - 3 * h * needMul * coldFactor * (p.sick > 0 ? 1.3 : 1), 0, 100);
  p.thirst = clamp(p.thirst - 4.2 * h * needMul * (season(st).id === "summer" ? 1.3 : 1), 0, 100);

  // 체온
  const amb = ambientTemp(st, ctx.atBase, ctx.nearFire) + equipStat(st, "warm") + (st.buffs.warm ? 6 : 0);
  p.warmth = amb;
  let dmg = 0;
  if (amb < 0) dmg += (-amb / 6) * h * d.needs;
  if (p.hunger <= 0) dmg += 3 * h;
  if (p.thirst <= 0) dmg += 5 * h;

  // 방사능
  if (ctx.inRad) {
    const prot = Math.min(0.95, equipStat(st, "rad") + (JOBS[p.job].perks.radRes || 0));
    p.rad = clamp(p.rad + 8 * h * (1 - prot) * d.enemy, 0, 150);
  } else p.rad = clamp(p.rad - 0.5 * h, 0, 150);
  if (p.rad >= 100) dmg += 4 * h;

  // 질병
  if (p.sick > 0) { dmg += 1 * h; p.sick = Math.max(0, p.sick - h); }

  // 자연 회복
  if (p.hunger > 50 && p.thirst > 50 && p.rad < 100 && p.sick <= 0 && amb >= 0) {
    p.hp += (ctx.sleeping ? 4 : 1.5) * h * (1 + (JOBS[p.job].perks.heal || 0) * 0.5);
  }
  p.hp = clamp(p.hp - dmg, 0, p.maxHp);

  // 옷 마모: 3시간당 1
  for (const slot of ["head", "body", "legs", "feet"]) wear(st, slot, h / 3);
  for (const k of Object.keys(st.buffs)) { st.buffs[k] -= minutes; if (st.buffs[k] <= 0) delete st.buffs[k]; }

  // 부패
  spoilInv(st, st.inv, h, bagSpoilMult(st));
  for (const b of allStorage(st)) spoilInv(st, b.storage, h, storageMult(st, b));

  // 탈것 연료
  if (p.mount?.type === "vehicle" && ctx.moving) {
    const v = VEHICLES[p.mount.id];
    if (v.fuelPerHour) {
      if (count(st.inv, "fuel") <= 0) { p.mount = null; log(st, "연료가 떨어져 오토바이에서 내렸습니다.", "warn"); }
      else { st.fuelAcc = (st.fuelAcc || 0) + v.fuelPerHour * h; if (st.fuelAcc >= 1) { removeFrom(st.inv, "fuel", 1); st.fuelAcc -= 1; } }
    }
  }

  // 하루가 넘어가면 일일 처리
  const dayAfter = day(st);
  for (let dd = dayBefore + 1; dd <= dayAfter; dd++) events.push(...dailyUpdate(st, dd));

  if (p.hp <= 0) { die(st, causeOfDeath(st)); events.push({ type: "death" }); }
  return events;
}

function causeOfDeath(st) {
  const p = st.player;
  if (p.thirst <= 0) return "갈증";
  if (p.hunger <= 0) return "굶주림";
  if (p.rad >= 100) return "방사능 피폭";
  if (p.warmth < 0) return "저체온증";
  if (p.sick > 0) return "질병";
  return "부상";
}

export function isAdult(c) { return !c.child || c.age >= 28; }

// =========================== 일일 처리 ===========================
export function dailyUpdate(st, d) {
  const events = [];
  const rng = makeRng(st.seed + d * 7919);
  st.stats.daysSurvived++;
  gainXp(st, 10);

  // 계절 알림
  if ((d - 1) % TIME.daysPerSeason === 0) log(st, `${season(st).icon} ${season(st).name}이(가) 시작되었습니다.`);

  // 발전기 연료
  for (const b of st.base.buildings.filter((b) => b.id === "generator")) {
    const need = hasSkill(st, "reactor") ? 0.5 : 1;
    b.fuelAcc = (b.fuelAcc || 0) + need;
    if (b.fuelAcc >= 1) {
      if (countAll(st, "fuel") >= 1) { pay(st, { fuel: 1 }); b.fueled = true; b.fuelAcc -= 1; }
      else { b.fueled = false; if (allStorage(st).some((s) => s.id === "fridge")) log(st, "발전기 연료가 떨어져 냉장고가 멈췄습니다!", "warn"); }
    }
  }

  // 건물 생산
  const farmers = st.companions.filter((c) => c.role === "farmer" && c.task === "base" && isAdult(c)).length;
  const cows = st.animals.filter((a) => a.type === "cow" && a.task === "pen").length;
  for (const b of st.base.buildings) {
    const def = BUILDINGS[b.id];
    if (!def.prod) continue;
    let mult = 1;
    if (b.id === "farm") {
      if (season(st).id === "winter" && !hasSkill(st, "eden")) continue;
      mult *= 1 + (JOBS[st.player.job].perks.farm || 0) + 0.5 * Math.min(farmers, countB(st, "farm")) / Math.max(1, countB(st, "farm")) + 0.25 * Math.min(cows, 2);
    }
    if (b.id === "purifier" && hasSkill(st, "purify")) mult *= 2;
    for (const [id, q] of Object.entries(def.prod)) storeToBase(st, id, Math.round(q * mult));
  }

  // 동료
  const living = st.companions;
  for (const c of living) {
    if (c.child) { c.age = (c.age || 0) + 1; if (c.age === 28) { log(st, `${c.name}이(가) 어른이 되었습니다! 이제 역할을 맡을 수 있습니다.`, "good"); events.push({ type: "adult", uid: c.uid }); } }
    if (c.task !== "base" || !isAdult(c)) continue;
    switch (c.role) {
      case "researcher": st.base.research.points += 6 * (hasBuilding(st, "lab") ? 1.5 : 1); break;
      case "hunter": storeToBase(st, "raw_meat", 2); storeToBase(st, "leather", 1); break;
      case "jobless": if (rng.chance(0.3)) { const f = rng.pick(["scrap", "cloth", "canned_food", "electronics", "seed", "salt"]); storeToBase(st, f, 1); log(st, `백수 ${c.name}이(가) 어디선가 ${ITEMS[f].name}을(를) 주워 왔습니다.`); } break;
      case "politician": st.gold += 20 * (hasSkill(st, "tax") ? 1.3 : 1); break;
      case "doctor": for (const o of living) o.hp = Math.min(100, (o.hp ?? 100) + 20); break;
      default: break;
    }
  }
  // 연구자(플레이어 직업) 기본 연구 + 연구소
  st.base.research.points += (hasBuilding(st, "lab") ? 3 : 0) * (1 + (JOBS[st.player.job].perks.research || 0));

  // 주민 식사: 1명당 하루 음식 1개(기지 창고에서, 썩기 직전 것부터)
  const mouths = living.length;
  let hungry = 0;
  for (let i = 0; i < mouths; i++) if (!eatFromBase(st)) hungry++;
  const moraleBase = (JOBS[st.player.job].perks.morale || 0) + (hasSkill(st, "feast") ? 20 : 0);
  for (const c of living) {
    c.morale = clamp((c.morale ?? 70) + (hungry > 0 ? -12 : 3) + moraleBase / 10, 0, 100);
  }
  if (hungry > 0) log(st, `식량이 부족해 주민 ${hungry}명이 굶었습니다. 사기 하락!`, "warn");
  // 사기 0 → 떠남 (스토리 동료와 가족은 떠나지 않고 부상만)
  for (let i = st.companions.length - 1; i >= 0; i--) {
    const c = st.companions[i];
    if (c.morale <= 0 && !c.story && !c.family) { log(st, `${c.name}이(가) 기지를 떠났습니다…`, "bad"); st.companions.splice(i, 1); }
  }

  // 동물: 먹이 + 생산 + 번식
  const pens = st.base.buildings.filter((b) => BUILDINGS[b.id].animals).reduce((n, b) => n + BUILDINGS[b.id].animals, 0);
  for (const a of st.animals) {
    const def = ANIMALS[a.type];
    if (a.task !== "pen") continue;
    if (countAll(st, def.food) > 0) { pay(st, { [def.food]: 1 }); a.fed = true; } else a.fed = false;
    if (a.fed && def.prod) for (const [id, q] of Object.entries(def.prod)) storeToBase(st, id, q);
  }
  const types = {};
  for (const a of st.animals) if (a.task === "pen" && a.fed) types[a.type] = (types[a.type] || 0) + 1;
  const breedMul = hasSkill(st, "breeder") ? 2 : 1;
  for (const [t, n] of Object.entries(types)) {
    if (n >= 2 && st.animals.length < pens && rng.chance(0.08 * breedMul)) {
      st.animals.push({ uid: uid("a"), type: t, name: `아기 ${ANIMALS[t].name}`, hp: ANIMALS[t].hp, task: "pen", tame: 1 });
      log(st, `우리에서 새끼 ${ANIMALS[t].name}이(가) 태어났습니다!`, "good");
    }
  }

  // 결혼 → 아이
  if (st.family.spouse && hasBuilding(st, "house") && st.family.children.length < 4 && rng.chance(0.06)) {
    const g = rng.chance(0.5) ? "M" : "F";
    const sp = st.companions.find((c) => c.uid === st.family.spouse);
    const child = {
      uid: uid("c"), name: rng.pick(SURVIVOR_NAMES[g]), gender: g, role: rng.pick([st.player.job, sp?.role || "jobless"].filter((r) => ROLES[r])) || "jobless",
      stats: mixStats(st.player.stats, sp?.stats, rng), affinity: 100, morale: 100, task: "base", child: true, age: 0, family: true, hp: 100,
    };
    st.companions.push(child);
    st.family.children.push(child.uid);
    log(st, `👶 아이가 태어났습니다! 이름은 ${child.name}.`, "good");
    events.push({ type: "birth", uid: child.uid });
  }

  // 무작위 생존자 방문 (주거 여유가 있을 때)
  if (st.companions.length < residentCap(st) && st.base.lv >= 2) {
    const chance = 0.12 * (1 + (JOBS[st.player.job].perks.recruit || 0)) + eff(st, "cha") * 0.005;
    if (rng.chance(chance)) events.push({ type: "visitor", survivor: randomSurvivor(rng) });
  }

  // 습격
  if (d >= st.nextRaidDay) {
    st.nextRaidDay = d + diff(st).raidEveryDays;
    events.push({ type: "raid", strength: raidStrength(st, d) });
  }

  // 연구 진행
  const cur = st.base.research.current;
  if (cur) {
    const r = RESEARCH.find((x) => x.id === cur);
    const cost = r.cost * (hasSkill(st, "dawn") ? 0.6 : 1);
    if (st.base.research.points >= cost) {
      st.base.research.points -= cost;
      st.base.research.done.push(cur);
      st.base.research.current = null;
      log(st, `🔬 연구 완료: ${r.name}`, "good");
      events.push({ type: "research", id: cur });
    }
  }
  return events;
}

function mixStats(a, b, rng) {
  const o = {};
  for (const k of Object.keys(a)) o[k] = Math.round(((a[k] || 5) + ((b && b[k]) || 5)) / 2) + rng.int(-1, 2);
  return o;
}

export function randomSurvivor(rng) {
  const g = rng.chance(0.5) ? "M" : "F";
  const roles = Object.keys(ROLES);
  const role = rng.pick(roles);
  const stats = {};
  for (const s of ["str", "agi", "vit", "int", "cha", "cra"]) stats[s] = rng.int(3, 8);
  return { uid: uid("s"), name: rng.pick(SURVIVOR_NAMES[g]), gender: g, role, stats, affinity: rng.int(10, 40), morale: 60, task: "base", hp: 100 };
}

function eatFromBase(st) {
  const foods = [];
  for (const b of allStorage(st)) for (const s of b.storage) if (ITEMS[s.id].type === "food" && ITEMS[s.id].food.hunger > 0) foods.push([b, s]);
  if (!foods.length) return false;
  foods.sort((x, y) => (x[1].fresh ?? 2) - (y[1].fresh ?? 2));
  const [b, s] = foods[0];
  removeFrom(b.storage, s.id, 1);
  return true;
}

export function residentCap(st) {
  const lvCap = BASE_LEVELS[st.base.lv - 1].residents;
  const houses = countB(st, "house") * BUILDINGS.house.housing;
  return Math.min(lvCap, 2 + st.base.lv + houses); // 거점 자체도 레벨당 1명 수용
}

// =========================== 경험치/레벨 ===========================
export function gainXp(st, amount) {
  const p = st.player;
  const mult = 1 + (JOBS[p.job].perks.xp || 0) + (st.buffs.xp ? 0.5 : 0) + (st.passActive ? 0.2 : 0);
  const x = Math.round(amount * mult);
  p.xp += x;
  st.stats.xpEarned += x;
  st.legacyPending = (st.legacyPending || 0) + x; // 혈통 경험치는 '살아 있는 동안에도' 계속 쌓인다
  let ups = 0;
  while (p.level < XP_CURVE.runLevelCap && p.xp >= XP_CURVE.runLevelXp(p.level)) {
    p.xp -= XP_CURVE.runLevelXp(p.level);
    p.level++;
    p.statPoints += 2;
    ups++;
  }
  if (ups) {
    p.maxHp = maxHp(st);
    p.hp = Math.min(p.maxHp, p.hp + 20);
    log(st, `⬆️ 레벨 업! Lv.${p.level} (능력치 포인트 +${ups * 2})`, "good");
  }
  return ups;
}

export function spendStat(st, stat) {
  if (st.player.statPoints <= 0 || !(stat in st.player.stats)) return false;
  st.player.stats[stat]++;
  st.player.statPoints--;
  st.player.maxHp = maxHp(st);
  return true;
}

// =========================== 제작 ===========================
export function hasBuilding(st, id) { return st.base.buildings.some((b) => b.id === id); }
export function countB(st, id) { return st.base.buildings.filter((b) => b.id === id).length; }
export function hasStation(st, station) {
  if (!station) return true;
  return st.base.buildings.some((b) => BUILDINGS[b.id].station === station);
}
export function researched(st, id) { return !id || st.base.research.done.includes(id); }

export function recipeAvailable(st, r) {
  if (r.place) return false;
  return researched(st, r.research);
}

export function craft(st, recipeId, ctx = {}) {
  const r = RECIPES.find((x) => x.id === recipeId);
  if (!r) return { ok: false, why: "레시피 없음" };
  if (!researched(st, r.research)) return { ok: false, why: "연구 필요" };
  if (r.station && !(hasStation(st, r.station) && (ctx.atBase !== false))) return { ok: false, why: `${stationName(r.station)} 필요(기지)` };
  if (!pay(st, r.in, ctx.atBase !== false)) return { ok: false, why: "재료 부족: " + missing(st, r.in).join(", ") };
  let [id, q] = r.out;
  if (hasSkill(st, "preserve") && (id === "jerky" || id === "salted_meat")) q *= 2;
  giveItem(st, id, q);
  st.story.crafted[id] = true;
  st.stats.crafted++;
  gainXp(st, 5);
  return { ok: true, id, q };
}

export function stationName(s) {
  return Object.values(BUILDINGS).find((b) => b.station === s)?.name ?? s;
}

// =========================== 건설 ===========================
export function buildCost(st, id) {
  const def = BUILDINGS[id];
  let m = 1 + (JOBS[st.player.job].perks.buildCost || 0);
  if (st.companions.some((c) => c.role === "engineer" && c.task === "base" && isAdult(c))) m -= 0.15;
  const c = {};
  for (const [k, v] of Object.entries(def.cost)) c[k] = Math.max(1, Math.ceil(v * m));
  return c;
}

export function canBuild(st, id) {
  const def = BUILDINGS[id];
  if (!def) return "없는 건물";
  if (st.base.lv < def.baseLv) return `거점 Lv.${def.baseLv} 필요`;
  if (!researched(st, def.research)) return `연구 필요: ${RESEARCH.find((r) => r.id === def.research)?.name}`;
  if (countB(st, id) >= (def.max ?? 99)) return "최대 개수";
  if (st.base.buildings.length >= BASE_LEVELS[st.base.lv - 1].slots) return "건설 부지 부족 (거점 업그레이드)";
  if (!canAfford(st, buildCost(st, id))) return "재료 부족: " + missing(st, buildCost(st, id)).join(", ");
  return null;
}

export function build(st, id) {
  const why = canBuild(st, id);
  if (why) return { ok: false, why };
  pay(st, buildCost(st, id));
  const b = { uid: uid("b"), id };
  if (BUILDINGS[id].storage) b.storage = [];
  if (id === "generator") { b.fueled = false; }
  st.base.buildings.push(b);
  st.story.built[id] = true;
  gainXp(st, 20);
  log(st, `🏗️ ${BUILDINGS[id].name} 건설 완료`, "good");
  return { ok: true };
}

export function demolish(st, buid) {
  const i = st.base.buildings.findIndex((b) => b.uid === buid);
  if (i < 0) return false;
  const b = st.base.buildings[i];
  if (b.storage?.length) return false; // 창고가 비어야 철거 가능(아이템 증발 방지)
  st.base.buildings.splice(i, 1);
  for (const [k, v] of Object.entries(BUILDINGS[b.id].cost)) storeToBase(st, k, Math.floor(v / 2)) || giveItem(st, k, Math.floor(v / 2));
  return true;
}

export function canUpgradeBase(st) {
  const next = BASE_LEVELS[st.base.lv];
  if (!next) return "최대 레벨";
  if (st.story.chapter < next.chapter) return `스토리 ${next.chapter}장 이후 가능`;
  const cost = scaledCost(st, next.cost);
  if (!canAfford(st, cost)) return "재료 부족: " + missing(st, cost).join(", ");
  return null;
}

function scaledCost(st, cost) {
  let m = 1 + (JOBS[st.player.job].perks.buildCost || 0);
  const c = {};
  for (const [k, v] of Object.entries(cost)) c[k] = Math.ceil(v * m);
  return c;
}
export function baseUpgradeCost(st) { const n = BASE_LEVELS[st.base.lv]; return n ? scaledCost(st, n.cost) : null; }

export function upgradeBase(st) {
  const why = canUpgradeBase(st);
  if (why) return { ok: false, why };
  pay(st, baseUpgradeCost(st));
  st.base.lv++;
  gainXp(st, 60 * st.base.lv);
  log(st, `🏰 거점이 「${BASE_LEVELS[st.base.lv - 1].name}」(으)로 커졌습니다!`, "good");
  return { ok: true };
}

// =========================== 연구 ===========================
export function startResearch(st, id) {
  const r = RESEARCH.find((x) => x.id === id);
  if (!r || st.base.research.done.includes(id)) return false;
  const eraNow = currentEra(st);
  if (r.era > eraNow + 1) return false;
  st.base.research.current = id;
  return true;
}

export function currentEra(st) {
  const d = st.base.research.done;
  if (d.includes("statecraft")) return 3;
  if (d.includes("electricity")) return 2;
  if (d.includes("smelting")) return 1;
  return 0;
}

// =========================== 먹기/사용 ===========================
export function useItem(st, index) {
  const s = st.inv[index];
  if (!s) return { ok: false };
  const it = ITEMS[s.id];
  const p = st.player;
  if (it.slot) return { ok: equipFromInv(st, index), equip: true };
  if (it.type === "food") {
    const f = it.food;
    const fresh = s.fresh ?? 1;
    const q = fresh > 0.3 ? 1 : 0.6;
    const nut = (1 + (JOBS[p.job].perks.food || 0)) * q;
    p.hunger = clamp(p.hunger + (f.hunger || 0) * nut, 0, 100);
    p.thirst = clamp(p.thirst + (f.thirst || 0) * (f.thirst > 0 ? nut : 1), 0, 100);
    p.hp = clamp(p.hp + (f.hp || 0) * nut, 0, p.maxHp);
    p.rad = clamp(p.rad + (f.rad || 0), 0, 150);
    const sickChance = (f.sick || 0) + (fresh <= 0.3 ? 0.35 : 0);
    let sick = false;
    if (sickChance > 0 && Math.random() < sickChance && !hasSkill(st, "vaccine")) { p.sick = Math.max(p.sick, 8); sick = true; }
    if (it.buff?.warm) st.buffs.warm = (hasSkill(st, "gourmet") ? 2 : 1) * it.buff.warm * 60;
    removeFrom(st.inv, s.id, 1);
    return { ok: true, sick };
  }
  if (it.type === "med") {
    const m = it.med;
    if (m.revive) return { ok: false, why: "사망 시 자동으로 사용됩니다" };
    const healMul = 1 + (JOBS[p.job].perks.heal || 0);
    if (m.hp) p.hp = clamp(p.hp + m.hp * healMul, 0, p.maxHp);
    if (m.rad) p.rad = clamp(p.rad + m.rad, 0, 150);
    if (m.cure) p.sick = 0;
    if (m.warm) st.buffs.warm = m.warm * 60;
    removeFrom(st.inv, s.id, 1);
    return { ok: true };
  }
  if (s.id === "rotten_food") { removeFrom(st.inv, s.id, 1); p.sick = 10; p.hunger = clamp(p.hunger + 4, 0, 100); return { ok: true, sick: true }; }
  return { ok: false, why: "사용할 수 없는 아이템" };
}

// =========================== 채집 ===========================
// node: {type}, opts: {rng}
export function gather(st, nodeType, rng = makeRng(Date.now())) {
  const hand = st.player.equip.hand;
  const tool = hand ? ITEMS[hand.id].tool || {} : {};
  const luck = 1 + (JOBS[st.player.job].perks.luck || 0);
  const loot = diff(st).loot;
  const out = [];
  const add = (id, q) => { if (q > 0) out.push([id, Math.max(1, Math.round(q))]); };
  switch (nodeType) {
    case "tree": add("wood", (1 + rng.int(0, 1)) * (tool.wood || 1) * loot); if (rng.chance(0.3)) add("fiber", 1); break;
    case "rock": add("stone", (1 + rng.int(0, 1)) * (tool.stone || 0.6) * loot); if (rng.chance(0.15 * luck)) add("scrap", 1); if (rng.chance(0.12)) add("salt", 1); break;
    case "scrap": add("scrap", (1 + rng.int(0, 2)) * Math.max(1, tool.scrap || 0.7) * loot); if (rng.chance(0.35)) add("cloth", 1); if (rng.chance(0.08 * luck * (hasSkill(st, "analyze") ? 1.5 : 1))) add("electronics", 1); break;
    case "car": add("scrap", 3 * loot); if (rng.chance(0.5)) add("fuel", 1); if (rng.chance(0.3 * luck)) add("electronics", 1); if (rng.chance(0.3)) add("cloth", 2); break;
    case "bush": add("berry", rng.int(1, 3) * loot); add("fiber", rng.int(1, 2) * (tool.fiber || 1)); if (rng.chance(0.15)) add("seed", 1); break;
    case "herb": add("herb", rng.int(1, 2)); if (rng.chance(0.4)) add("mushroom", 1); break;
    case "crate": {
      const table = ["canned_food", "cloth", "ammo", "electronics", "bandage", "seed", "fuel", "salt", "gunpowder", "water_clean", "instant_noodle", "leather"];
      const n = 2 + (rng.chance(0.3 * luck) ? 1 : 0) + (hasSkill(st, "lucky") ? 1 : 0);
      for (let i = 0; i < n; i++) add(rng.pick(table), rng.int(1, 2));
      if (st.base.lv >= 4 && rng.chance(0.2)) add("iron", 2);
      break;
    }
    case "water": add("water_dirty", 1); break;
    case "fish": if (rng.chance(0.55 + eff(st, "agi") * 0.02)) add("raw_fish", 1); break;
    default: break;
  }
  if (hand && (tool.wood || tool.stone || tool.scrap || tool.fiber || tool.fish)) wear(st, "hand", 1);
  for (const [id, q] of out) giveItem(st, id, q);
  st.stats.gathered++;
  gainXp(st, 2);
  return out;
}

// =========================== 전투 ===========================
export function playerAttack(st) {
  const hand = st.player.equip.hand;
  const it = hand ? ITEMS[hand.id] : null;
  let atk = (it?.atk || 2) + eff(st, "str") * 0.8;
  let ranged = false;
  if (it?.ranged) {
    if (count(st.inv, it.ranged) > 0) { removeFrom(st.inv, it.ranged, 1); ranged = true; atk += eff(st, "agi") * 0.6; if (hasSkill(st, "aim")) atk *= 1.15; }
    else atk = 3 + eff(st, "str") * 0.5; // 탄 없으면 개머리판
  }
  atk *= 1 + (JOBS[st.player.job].perks.dmg || 0);
  if (hasSkill(st, "warlord")) atk *= 1.15;
  if (hand) wear(st, "hand", 1);
  return { dmg: Math.round(atk), ranged, range: ranged ? 220 : 46 };
}

export function damagePlayer(st, raw) {
  const def = equipStat(st, "def") + eff(st, "vit") * 0.3;
  const dmg = raw * diff(st).enemy * (100 / (100 + def * 6));
  st.player.hp = clamp(st.player.hp - dmg, 0, st.player.maxHp);
  for (const slot of ["body", "head"]) wear(st, slot, 1);
  if (st.player.hp <= 0) die(st, "전투");
  return dmg;
}

export function onKill(st, enemyType, rng = makeRng(Date.now())) {
  const e = ENEMIES[enemyType];
  st.stats.kills++;
  gainXp(st, e.xp);
  const drops = [];
  for (const [id, p] of e.loot) if (rng.chance(p * diff(st).loot)) { giveItem(st, id, 1); drops.push(id); }
  return drops;
}

// 전투력: 보스/전쟁/올림픽 매칭에 쓰는 단일 지표
export function combatPower(st) {
  const p = st.player;
  const hand = p.equip.hand ? ITEMS[p.equip.hand.id] : null;
  const statSum = Object.values(p.stats).reduce((a, b) => a + b, 0) + (hasSkill(st, "accidental") ? 30 : 0);
  let pow = p.level * 8 + statSum * 2 + (hand?.atk || 2) * 3 + equipStat(st, "def") * 3 + p.legacyLevel * 12;
  pow *= 1 + (JOBS[p.job].perks.dmg || 0) * 0.5;
  const cmd = hasSkill(st, "command") ? 1.25 : 1;
  for (const c of st.companions) {
    if (!isAdult(c)) continue; // 아이는 전쟁에 나가지 않는다
    const cs = c.stats.str + c.stats.agi + c.stats.vit;
    if (c.task === "follow") pow += cs * 2 * cmd;
    else if (c.role === "soldier") pow += cs * 1.5 * cmd;
  }
  for (const a of st.animals) if (ANIMALS[a.type].combat) pow += ANIMALS[a.type].combat * (a.task === "follow" ? 1.5 : 0.5);
  pow += baseDefense(st) * 0.5;
  return Math.round(pow);
}

export function baseDefense(st) {
  let d = 10 * st.base.lv;
  for (const b of st.base.buildings) d += BUILDINGS[b.id].defense || 0;
  if (hasSkill(st, "fortify")) d *= 1.3;
  if (hasSkill(st, "turret")) d += countB(st, "turret") * 48;
  d += st.companions.filter((c) => c.role === "soldier" && c.task === "base" && isAdult(c)).length * 30;
  return Math.round(d);
}

export function raidStrength(st, d) {
  return Math.round((40 + d * 6 + st.base.lv * 25) * diff(st).enemy);
}

// 자동 방어 결과 (플레이어가 기지에 없거나 '자동 방어' 선택 시)
export function resolveRaid(st, strength, playerBonus = 0, rng = makeRng(Date.now())) {
  const def = baseDefense(st) + playerBonus;
  const ratio = def / strength;
  const win = rng.next() < clamp(0.5 + (ratio - 1) * 1.2, 0.05, 0.97);
  if (win) {
    st.story.raidWon++;
    const g = Math.round(strength * 0.6);
    st.gold += g;
    storeToBase(st, "scrap", Math.round(strength / 20));
    storeToBase(st, "ammo", Math.round(strength / 40));
    gainXp(st, 40 + strength / 4);
    log(st, `🛡️ 습격을 막아냈습니다! 금화 +${g}`, "good");
  } else {
    // 패배: 창고 일부 약탈 + 주민 사기 하락 (건물 파괴는 하지 않음 — 복구 부담이 이탈 원인)
    let stolen = 0;
    for (const b of allStorage(st)) for (const s of b.storage) { if (s.dur === undefined) { const t = Math.ceil(s.qty * 0.25); s.qty -= t; stolen += t; } }
    for (const b of allStorage(st)) b.storage = b.storage.filter((s) => s.qty > 0);
    for (const c of st.companions) c.morale = clamp((c.morale ?? 70) - 15, 0, 100);
    log(st, `🔥 습격에 패배했습니다. 창고 물자 ${stolen}개를 약탈당했습니다.`, "bad");
  }
  return { win, def, strength };
}

// =========================== 길들이기/탈것 ===========================
export function tameDifficulty(st, type) {
  const base = ANIMALS[type].tame;
  return clamp(base - (JOBS[st.player.job].perks.tame || 0) * 0.5 - eff(st, "cha") * 0.01, 0.05, 0.95);
}

export function addTamed(st, type, name) {
  const def = ANIMALS[type];
  const a = { uid: uid("a"), type, name: name || def.name, hp: def.hp, task: "pen", tame: 1 };
  st.animals.push(a);
  st.story.tamed++;
  gainXp(st, 30);
  log(st, `🐾 ${def.name}을(를) 길들였습니다!`, "good");
  return a;
}

export function penCapacity(st) {
  return st.base.buildings.reduce((n, b) => n + (BUILDINGS[b.id].animals || 0), 0) + 1; // +1: 플레이어 곁(동행)
}

export function slaughter(st, auid) {
  const i = st.animals.findIndex((a) => a.uid === auid);
  if (i < 0) return false;
  const a = st.animals[i];
  storeToBase(st, "raw_meat", ANIMALS[a.type].meat) || giveItem(st, "raw_meat", ANIMALS[a.type].meat);
  storeToBase(st, "leather", Math.ceil(ANIMALS[a.type].meat / 3));
  st.animals.splice(i, 1);
  if (a.mounted) st.player.mount = null;
  for (const c of st.companions) c.morale = clamp((c.morale ?? 70) - 2, 0, 100);
  return true;
}

export function mount(st, what) {
  // what: {type:'animal', uid} | {type:'vehicle', id}
  if (!what) { st.player.mount = null; return true; }
  if (what.type === "animal") {
    const a = st.animals.find((x) => x.uid === what.uid);
    if (!a || !ANIMALS[a.type].mount || !researched(st, "riding")) return false;
    st.player.mount = { type: "animal", uid: a.uid, kind: a.type };
    return true;
  }
  if (what.type === "vehicle" && st.vehicles.includes(what.id)) { st.player.mount = { type: "vehicle", id: what.id }; return true; }
  return false;
}

export function moveSpeed(st) {
  let s = 120 + eff(st, "agi") * 3;
  const m = st.player.mount;
  if (m?.type === "animal") s *= ANIMALS[m.kind].mount;
  if (m?.type === "vehicle") s *= VEHICLES[m.id].mount;
  if (st.player.hunger <= 0 || st.player.thirst <= 0) s *= 0.7;
  return s;
}

export function buildVehicle(st, id) {
  const v = VEHICLES[id];
  let rid = v.research;
  if (hasSkill(st, "vehicle") && id === "motorbike") rid = "smelting"; // 기술자: 1시대 일찍
  if (!researched(st, rid)) return { ok: false, why: "연구 필요" };
  if (id === "motorbike" && !hasBuilding(st, "garage") && !hasSkill(st, "vehicle")) return { ok: false, why: "차고 필요" };
  if (st.vehicles.includes(id)) return { ok: false, why: "이미 보유" };
  if (!pay(st, v.cost)) return { ok: false, why: "재료 부족: " + missing(st, v.cost).join(", ") };
  st.vehicles.push(id);
  log(st, `${v.icon} ${v.name} 제작 완료!`, "good");
  return { ok: true };
}

// =========================== 동료/결혼 ===========================
export function recruit(st, c) {
  if (st.companions.length >= residentCap(st) && !c.story) return { ok: false, why: "주거 공간 부족 (주민 집/거점 레벨)" };
  st.companions.push(c);
  log(st, `🤝 ${c.name}(${ROLES[c.role]?.name}) 합류!`, "good");
  return { ok: true };
}

export function recruitStory(st, key) {
  const d = STORY_COMPANIONS[key];
  if (!d || st.companions.some((c) => c.story === key)) return null;
  const c = { uid: uid("s"), story: key, name: d.name, gender: d.gender, role: d.role, stats: { ...d.stats }, affinity: 30, morale: 80, task: "base", hp: 100, bio: d.bio };
  st.companions.push(c);
  log(st, `⭐ ${d.name}(${ROLES[d.role].name})이(가) 동료가 되었습니다.`, "good");
  return c;
}

export function talk(st, cuid) {
  const c = st.companions.find((x) => x.uid === cuid);
  if (!c) return 0;
  const today = day(st);
  if (c.lastTalk === today) return 0;
  c.lastTalk = today;
  const g = 3 + Math.floor(eff(st, "cha") / 3);
  c.affinity = clamp(c.affinity + g, 0, 120);
  return g;
}

export function gift(st, cuid, invIndex) {
  const c = st.companions.find((x) => x.uid === cuid);
  const s = st.inv[invIndex];
  if (!c || !s) return 0;
  const it = ITEMS[s.id];
  let g = it.type === "food" ? 6 : it.value ? 20 : it.type === "cloth" ? 10 : 3;
  if (c.role === "cook" && it.type === "food") g *= 2;
  removeFrom(st.inv, s.id, 1);
  c.affinity = clamp(c.affinity + g, 0, 120);
  return g;
}

export function canMarry(st, cuid) {
  const c = st.companions.find((x) => x.uid === cuid);
  if (!c || c.family || !isAdult(c)) return "불가능";
  if (st.family.spouse) return "이미 배우자가 있습니다";
  if (c.affinity < 100) return `호감도 ${c.affinity}/100`;
  if (!hasBuilding(st, "bed")) return "침대 필요";
  return null;
}

export function marry(st, cuid) {
  const why = canMarry(st, cuid);
  if (why) return { ok: false, why };
  const c = st.companions.find((x) => x.uid === cuid);
  st.family.spouse = c.uid;
  c.family = true;
  c.spouse = true;
  c.morale = 100;
  gainXp(st, 100);
  log(st, `💍 ${c.name}와(과) 결혼했습니다!`, "good");
  return { ok: true };
}

export function assign(st, cuid, task) {
  const c = st.companions.find((x) => x.uid === cuid);
  if (!c) return false;
  if (task === "follow") {
    if (!isAdult(c)) return false;
    const following = st.companions.filter((x) => x.task === "follow").length;
    if (following >= 2) return false; // 동행은 최대 2명
  }
  c.task = task;
  return true;
}

export function setRole(st, cuid, role) {
  const c = st.companions.find((x) => x.uid === cuid);
  if (!c || !ROLES[role]) return false;
  if (c.role === role) return true;
  if (c.role !== "jobless" && !c.child) return false; // 백수/아이만 전직 가능
  c.role = role;
  return true;
}

// =========================== 죽음/부활/계승 ===========================
export function die(st, cause) {
  if (st.dead) return;
  st.dead = { cause, at: st.time.min };
  st.player.hp = 0;
  log(st, `💀 ${st.player.name}이(가) ${cause}(으)로 쓰러졌습니다.`, "bad");
}

export function reviveGemCost(st) {
  const arr = diff(st).reviveGemCost;
  return arr[Math.min(st.revive.usedThisChapter, arr.length - 1)];
}

export function freeReviveReady(st, account, now = Date.now()) {
  return now - account.lastFreeRevive >= diff(st).freeReviveEveryRealHours * 3600 * 1000;
}

export function reviveOptions(st, account, now = Date.now()) {
  const o = [];
  if (freeReviveReady(st, account, now)) o.push({ id: "free", label: `무료 부활 (${diff(st).freeReviveEveryRealHours}시간마다)` });
  if (account.reviveTokens > 0) o.push({ id: "token", label: `부활권 사용 (보유 ${account.reviveTokens})` });
  if (count(st.inv, "revive_kit") > 0) o.push({ id: "kit", label: "소생 키트 사용" });
  const doc = st.companions.find((c) => c.role === "doctor" && isAdult(c) && !c.usedReviveCh?.includes(st.story.chapter));
  if (doc) o.push({ id: "doctor", label: `${doc.name}의 소생술 (챕터당 1회)`, uid: doc.uid });
  const selfMax = (JOBS[st.player.job].perks.selfRevive || 0) + (hasSkill(st, "miracle") ? 1 : 0);
  if (st.player.selfRevives < selfMax) o.push({ id: "self", label: "의사의 자가 소생" });
  if (diff(st).adRevive && (!account.ads.freeRevive || account.ads.date !== todayStr(now))) o.push({ id: "ad", label: "광고 보고 부활 (하루 1회)" });
  o.push({ id: "gems", label: `보석 ${reviveGemCost(st)}개로 부활`, cost: reviveGemCost(st), disabled: account.gems < reviveGemCost(st) });
  const heir = st.companions.find((c) => c.family && c.child && isAdult(c));
  if (heir) o.push({ id: "heir", label: `자녀 ${heir.name}에게 왕국 계승`, uid: heir.uid });
  o.push({ id: "accept", label: "죽음을 받아들인다 (세계 초기화, 혈통 경험치 보존)" });
  return o;
}

export function todayStr(now = Date.now()) {
  const d = new Date(now);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function revive(st, account, method, now = Date.now()) {
  if (!st.dead) return { ok: false };
  const opts = reviveOptions(st, account, now);
  const opt = opts.find((o) => o.id === method);
  if (!opt || opt.disabled) return { ok: false, why: "사용할 수 없음" };
  switch (method) {
    case "free": account.lastFreeRevive = now; break;
    case "token": account.reviveTokens--; break;
    case "kit": removeFrom(st.inv, "revive_kit", 1); break;
    case "doctor": { const c = st.companions.find((x) => x.uid === opt.uid); c.usedReviveCh = [...(c.usedReviveCh || []), st.story.chapter]; break; }
    case "self": st.player.selfRevives++; break;
    case "ad": if (account.ads.date !== todayStr(now)) account.ads = { date: todayStr(now), count: 0, freeRevive: false }; account.ads.freeRevive = true; account.ads.count++; break;
    case "gems": account.gems -= opt.cost; st.revive.usedThisChapter++; break;
    case "heir": return { ok: true, heir: inheritHeir(st, account, opt.uid) };
    case "accept": return { ok: true, reset: acceptDeath(st, account) };
    default: return { ok: false };
  }
  // 부활 패널티: 가방의 재료 절반을 잃음(장비는 유지) — 죽음은 무겁지만 끝은 아니다
  for (const s of st.inv) if (ITEMS[s.id].type === "res") s.qty = Math.floor(s.qty / 2);
  st.inv = st.inv.filter((s) => s.qty > 0);
  st.dead = false;
  const p = st.player;
  p.hp = p.maxHp * 0.5; p.hunger = Math.max(p.hunger, 40); p.thirst = Math.max(p.thirst, 40); p.rad = Math.min(p.rad, 50); p.sick = 0;
  p.x = null; // UI가 기지로 이동시킴
  log(st, "✨ 다시 눈을 떴습니다. (가방 재료 절반 손실)", "good");
  return { ok: true };
}

// 혈통 반영: 플레이 중 주기적으로 호출(UI 자동 저장 시). 새 혈통 레벨은 즉시 현재 캐릭터에도 적용.
export function flushLegacy(st, account) {
  const j = st.player.job;
  if (st.legacyPending > 0) { addLegacyXp(account, j, st.legacyPending); st.legacyPending = 0; }
  const p = st.player;
  const lv = legacyOf(account, j).level;
  if (lv > p.legacyLevel) {
    const delta = Math.floor(lv / 2) - Math.floor(p.legacyLevel / 2);
    if (delta > 0) for (const k of Object.keys(p.stats)) p.stats[k] += delta;
    const before = new Set(p.skills);
    p.skills = unlockedSkills(account, j).map((s) => s.id);
    p.legacyLevel = lv;
    p.maxHp = maxHp(st);
    log(st, `🧬 혈통 Lv.${lv}! ${delta > 0 ? `전 능력치 +${delta}` : ""}`, "good");
    for (const sk of JOBS[j].skills) if (p.skills.includes(sk.id) && !before.has(sk.id)) log(st, `✨ 혈통 기술 해금: ${sk.name} — ${sk.desc}`, "good");
    return true;
  }
  return false;
}

// 생애 종료(죽음/계승/엔딩) 시: 남은 경험치 + 챕터 보너스를 혈통으로
export function bankLegacy(st, account) {
  const j = st.player.job;
  st.legacyPending = (st.legacyPending || 0) + st.story.chapter * 300;
  flushLegacy(st, account);
  account.jobs[j] = account.jobs[j] || { xp: 0, runs: 0, bestChapter: 0 };
  account.jobs[j].runs++;
  account.jobs[j].bestChapter = Math.max(account.jobs[j].bestChapter, st.story.chapter);
  account.runs++;
}

export function acceptDeath(st, account) {
  bankLegacy(st, account);
  st.ended = { type: "death", ending: ENDINGS.fallen, chapter: st.story.chapter };
  return true;
}

// 자녀가 플레이어가 된다: 왕국(거점·동료·창고)은 유지, 레벨은 1부터, 혈통은 이어짐
export function inheritHeir(st, account, cuid) {
  const c = st.companions.find((x) => x.uid === cuid);
  if (!c) return null;
  bankLegacy(st, account);
  const leg = legacyOf(account, st.player.job);
  const oldName = st.player.name;
  st.companions = st.companions.filter((x) => x.uid !== cuid);
  if (st.family.spouse) { const sp = st.companions.find((x) => x.uid === st.family.spouse); if (sp) sp.spouse = false; }
  st.family = { spouse: null, children: st.family.children.filter((x) => x !== cuid) };
  const p = st.player;
  p.name = c.name; p.gender = c.gender;
  p.look = { ...p.look, hair: c.gender === "F" ? "long" : "short" };
  p.level = 1; p.xp = 0; p.statPoints = 0;
  p.stats = { ...c.stats };
  for (const k of Object.keys(p.stats)) p.stats[k] += Math.floor(leg.level / 2);
  p.legacyLevel = leg.level;
  p.skills = unlockedSkills(account, p.job).map((s) => s.id);
  p.maxHp = maxHp(st); p.hp = p.maxHp; p.hunger = 80; p.thirst = 80; p.rad = 0; p.sick = 0; p.selfRevives = 0;
  st.dead = false;
  st.generation = (st.generation || 1) + 1;
  st.revive.usedThisChapter = 0;
  log(st, `👑 ${oldName}의 뒤를 이어 ${c.name}이(가) 왕국을 이끕니다. (${st.generation}대)`, "good");
  return c;
}

// =========================== 스토리 ===========================
export function chapter(st) { return CHAPTERS[Math.min(st.story.chapter, CHAPTERS.length - 1)]; }

export function goalProgress(st) {
  const g = chapter(st).goal;
  const parts = [];
  if (g.craft) parts.push([`${ITEMS[g.craft].name} 제작`, !!st.story.crafted[g.craft]]);
  for (const k of ["building", "building2"]) if (g[k]) parts.push([`${BUILDINGS[g[k]].name} 건설`, hasBuilding(st, g[k])]);
  if (g.visit) parts.push([`방문`, !!st.story.visited[g.visit]]);
  if (g.baseLv) parts.push([`거점 Lv.${g.baseLv}`, st.base.lv >= g.baseLv]);
  if (g.tamed) parts.push([`동물 길들이기 ${st.story.tamed}/${g.tamed}`, st.story.tamed >= g.tamed]);
  if (g.raidWon) parts.push([`습격 방어 ${st.story.raidWon}/${g.raidWon}`, st.story.raidWon >= g.raidWon]);
  if (g.residents) parts.push([`주민 ${st.companions.length}/${g.residents}`, st.companions.length >= g.residents]);
  if (g.research) parts.push([`연구: ${RESEARCH.find((r) => r.id === g.research).name}`, st.base.research.done.includes(g.research)]);
  if (g.olympics) parts.push([`올림픽 참가 ${st.story.olympics}/${g.olympics}`, st.story.olympics >= g.olympics]);
  if (g.boss) parts.push([`재의 군주 격파`, st.story.bossDefeated]);
  if (g.restore) parts.push([`세계 복구 ${st.story.restore}%`, st.story.restore >= g.restore]);
  return parts;
}

// 목표 달성 시 다음 장으로. 반환: 새로 열린 장 목록
export function checkStory(st) {
  const opened = [];
  for (let guard = 0; guard < 3; guard++) {
    if (st.story.chapter >= CHAPTERS.length - 1) break;
    const parts = goalProgress(st);
    if (!parts.every(([, ok]) => ok)) break;
    const done = chapter(st);
    st.story.chapter++;
    st.revive.usedThisChapter = 0;
    gainXp(st, 200);
    st.gold += 100 * st.story.chapter;
    if (done.recruit) recruitStory(st, done.recruit);
    log(st, `📖 ${done.title} 완료!`, "good");
    opened.push(st.story.chapter);
    if (st.story.chapter === 12) opened.push("ending");
  }
  return opened;
}

export function computeEnding(st) {
  const key = JOBS[st.player.job].ending;
  const path = st.karma >= 0 ? "mercy" : "tyrant";
  const [title, text] = ENDINGS[key][path];
  return { key, path, title, text };
}

export function finishMainStory(st, account) {
  const e = computeEnding(st);
  const id = `${e.key}:${e.path}`;
  if (!account.endings.includes(id)) account.endings.push(id);
  bankLegacy(st, account);
  account.gems += 500;
  return e;
}

// 에필로그: 세계 복구 원정(무한 콘텐츠). 지역마다 요구 전투력 상승
export function expeditionReq(st) { return Math.round(diff(st).bossPower * (0.6 + st.story.restore * 0.03)); }
export function expedition(st, rng = makeRng(Date.now())) {
  const req = expeditionReq(st);
  const pow = combatPower(st);
  const pWin = clamp(0.5 + (pow / req - 1) * 1.5, 0.05, 0.95);
  const win = rng.next() < pWin;
  if (win) { st.story.restore = Math.min(100, st.story.restore + 2); gainXp(st, 150); st.gold += 300; }
  else for (const c of st.companions) c.morale = clamp((c.morale ?? 70) - 5, 0, 100);
  return { win, req, pow, pWin };
}

// =========================== 오프라인 진행 ===========================
// 꺼져 있는 동안 캐릭터는 '기지에서 휴식' — 굶어 죽지 않는다. 기지 생산·부패는 진행.
export function applyOffline(st, realMs) {
  const hours = Math.min(realMs / 3600000, TIME.offlineCapHours);
  if (hours < 0.05 || st.dead) return null;
  const gameDays = Math.floor((hours * 3600 * TIME.gameMinPerRealSec) / 1440 * TIME.offlineRate);
  const before = { pts: st.base.research.points };
  const saveP = { ...st.player };
  const evs = [];
  for (let i = 0; i < gameDays; i++) {
    st.time.min += 1440;
    // 저장고만 부패 (가방은 플레이어와 함께 '정지')
    for (const b of allStorage(st)) spoilInv(st, b.storage, 24, storageMult(st, b));
    const e = dailyUpdate(st, day(st)).filter((x) => x.type !== "raid" && x.type !== "visitor");
    evs.push(...e);
  }
  Object.assign(st.player, { hunger: saveP.hunger, thirst: saveP.thirst, hp: Math.max(saveP.hp, saveP.maxHp * 0.6) });
  if (st.nextRaidDay <= day(st)) st.nextRaidDay = day(st) + 1; // 접속 직후 다음 날 습격(오프라인 중 패배 없음)
  return { hours, gameDays, research: st.base.research.points - before.pts, events: evs };
}
