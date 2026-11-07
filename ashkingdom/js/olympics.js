// 재건 올림픽 — 시즌제(실제 14일). 점수는 '능력치 기반 + 운(±15%)' 또는 '직접 조작(미니게임)'.
// 모든 난수는 (시즌, 종목, 출전자) 시드로 결정되므로 서버가 같은 결과를 재계산해 검증할 수 있다.
import { OLYMPIC_EVENTS, OLYMPICS, SURVIVOR_NAMES, JOBS } from "./data.js";
import { makeRng } from "./rng.js";

const DAY = 86400000;

export function seasonId(now = Date.now()) {
  return "S" + Math.floor(now / DAY / OLYMPICS.seasonRealDays);
}
export function seasonEndsAt(now = Date.now()) {
  const n = Math.floor(now / DAY / OLYMPICS.seasonRealDays) + 1;
  return n * OLYMPICS.seasonRealDays * DAY;
}

export function baseScore(ev, stats, level, extra = 0) {
  let s = 0;
  for (const [k, w] of Object.entries(ev.w)) s += (stats[k] || 0) * w;
  return s * 10 + level * 2 + extra;
}

export function entrantList(st) {
  const list = [{ uid: "player", name: st.player.name + " (나)", stats: st.player.stats, level: st.player.level }];
  for (const c of st.companions) {
    if (c.child && (c.age || 0) < 28) continue;
    list.push({ uid: c.uid, name: c.name, stats: c.stats, level: Math.max(1, Math.round((c.affinity || 0) / 10)) });
  }
  return list;
}

export function eventExtra(st, ev) {
  if (ev.needAnimal) {
    const has = st.animals.some((a) => a.type === ev.needAnimal);
    return has ? 40 : -9999; // 말 없으면 출전 불가
  }
  return 0;
}

// 자동 출전: 운 ±15%
export function autoScore(season, ev, entrant, extra = 0) {
  const rng = makeRng(`${season}|${ev.id}|${entrant.uid}|auto`);
  const luck = 1 + (rng.next() * 2 - 1) * OLYMPICS.luckBand;
  return Math.round(baseScore(ev, entrant.stats, entrant.level, extra) * luck);
}

// 직접 조작: 미니게임 성과 perf(0~1) → ×0.85 ~ ×1.30
export function manualScore(ev, entrant, perf, extra = 0) {
  const p = Math.max(0, Math.min(1, perf));
  return Math.round(baseScore(ev, entrant.stats, entrant.level, extra) * (0.85 + (0.15 + OLYMPICS.manualMaxBonus) * p));
}

// 같은 브래킷(거점 레벨)의 라이벌 63명 — 서버 연결 시 실제 유저 기록으로 대체
export function rivals(season, ev, bracket, n = 63) {
  const rng = makeRng(`${season}|${ev.id}|B${bracket}`);
  const out = [];
  for (let i = 0; i < n; i++) {
    const g = rng.chance(0.5) ? "M" : "F";
    const job = rng.pick(Object.keys(JOBS));
    const stats = {};
    for (const k of ["str", "agi", "vit", "int", "cha", "cra"]) stats[k] = Math.round((5 + bracket * 1.5) * rng.range(0.7, 1.35));
    const level = Math.round(bracket * 4 * rng.range(0.7, 1.3));
    const extra = ev.needAnimal ? 40 : 0;
    const score = Math.round(baseScore(ev, stats, level, extra) * (1 + (rng.next() * 2 - 1) * OLYMPICS.luckBand));
    out.push({ name: `${rng.pick(SURVIVOR_NAMES[g])} (${JOBS[job].name})`, score, rival: true });
  }
  return out;
}

export function rankOf(season, ev, bracket, myScore) {
  const rs = rivals(season, ev, bracket);
  return 1 + rs.filter((r) => r.score > myScore).length;
}

export function rollSeason(account, now = Date.now()) {
  const sid = seasonId(now);
  if (account.olympics.season !== sid) {
    if (account.olympics.season) account.olympics.history.push({ season: account.olympics.season, entries: account.olympics.entries });
    if (account.olympics.history.length > 12) account.olympics.history.shift();
    account.olympics.season = sid;
    account.olympics.entries = {};
  }
  return sid;
}

// account.olympics.entries[eventId] = { best, entrant, tries:{date:n} }
export const TRIES_PER_DAY = 3;

export function triesLeft(account, evId, dateStr) {
  const e = account.olympics.entries[evId];
  if (!e || !e.tries || e.tries.date !== dateStr) return TRIES_PER_DAY;
  return TRIES_PER_DAY - e.tries.n;
}

export function submit(account, st, evId, entrantUid, score, dateStr, now = Date.now()) {
  const sid = rollSeason(account, now);
  if (triesLeft(account, evId, dateStr) <= 0) return { ok: false, why: "오늘 도전 횟수 소진" };
  const e = account.olympics.entries[evId] || { best: 0 };
  e.tries = e.tries?.date === dateStr ? { date: dateStr, n: e.tries.n + 1 } : { date: dateStr, n: 1 };
  const improved = score > e.best;
  if (improved) { e.best = score; e.entrant = entrantUid; }
  account.olympics.entries[evId] = e;
  st.story.olympics++;
  return { ok: true, improved, best: e.best, rank: rankOf(sid, OLYMPIC_EVENTS.find((x) => x.id === evId), st.base.lv, e.best) };
}

// 종합 순위: 종목별 순위 포인트(65-순위) 합계를 라이벌 63명과 동일한 방식으로 비교
export function overall(account, bracket, now = Date.now(), forSeason = null) {
  const sid = forSeason?.season || seasonId(now);
  const entries = forSeason ? forSeason.entries : account.olympics.season === sid ? account.olympics.entries : {};
  const N = 63;
  const rivalPts = new Array(N).fill(0);
  let pts = 0;
  const per = [];
  for (const ev of OLYMPIC_EVENTS) {
    const e = entries[ev.id] || null;
    const mine = e ? e.best : -1; // 불참 = 최하위
    const rs = rivals(sid, ev, bracket, N).map((r) => r.score);
    const all = [...rs, mine];
    const rankOfScore = (sc) => 1 + all.filter((x) => x > sc).length;
    const myRank = rankOfScore(mine);
    per.push({ ev, rank: e ? myRank : null, best: e?.best || 0 });
    pts += e ? 65 - myRank : 0;
    rs.forEach((sc, i) => { rivalPts[i] += 65 - rankOfScore(sc); });
  }
  const overallRank = 1 + rivalPts.filter((x) => x > pts).length;
  return { pts, per, overallRank };
}

export function rewardFor(rank, prizeBonus = 0) {
  const r = OLYMPICS.rewards.find((x) => rank <= x.rank);
  return { ...r, gems: Math.round(r.gems * (1 + prizeBonus)), gold: Math.round(r.gold * (1 + prizeBonus)) };
}

// 지난 시즌 보상 수령 (시즌이 바뀐 뒤 1회)
export function unclaimedSeason(account) {
  const h = account.olympics.history;
  const last = h[h.length - 1];
  return last && !last.claimed && Object.keys(last.entries).length ? last : null;
}

export function claimSeason(account, bracket, prizeBonus = 0) {
  const last = unclaimedSeason(account);
  if (!last) return null;
  const { overallRank } = overall(account, bracket, Date.now(), last);
  const rw = rewardFor(overallRank, prizeBonus);
  last.claimed = true;
  account.gems += rw.gems;
  return { rank: overallRank, ...rw };
}
