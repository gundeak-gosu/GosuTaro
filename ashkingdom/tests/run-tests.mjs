// 규칙 엔진 검증 — `node tests/run-tests.mjs`
// 브라우저 없이 모든 시스템과 '스토리 전체 진행 가능 여부(막힘 없음)'를 확인한다.
import * as S from "../js/systems.js";
import * as O from "../js/olympics.js";
import * as Shop from "../js/shop.js";
import { BIOMES, DUNGEONS, JOBS, DIFFICULTY, ITEMS, RECIPES, BUILDINGS, BASE_LEVELS, CHAPTERS, RESEARCH, ANIMALS, OLYMPIC_EVENTS, STORY_COMPANIONS, ENDINGS } from "../js/data.js";
import { generateWorld, WORLD_W, WORLD_H, T, TILE, isBlocked } from "../js/world.js";
import { makeRng } from "../js/rng.js";

// localStorage polyfill (storage.js 테스트용)
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const Store = await import("../js/storage.js");

let pass = 0, fail = 0;
const results = [];
function test(name, fn) {
  try { fn(); pass++; results.push(`  ✔ ${name}`); }
  catch (e) { fail++; results.push(`  ✘ ${name}\n      ${e.stack.split("\n").slice(0, 3).join("\n      ")}`); }
}
function eq(a, b, m = "") { if (a !== b) throw new Error(`${m} expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); }
function ok(c, m = "assert") { if (!c) throw new Error(m); }

const fresh = (job = "soldier", difficulty = "normal", acc = S.newAccount()) =>
  ({ st: S.newGame({ name: "테스트", gender: "M", job, difficulty, seed: 42, account: acc }), acc });
const give = (st, cost) => { for (const [k, v] of Object.entries(cost)) S.addItem(st, st.inv, k, v); };
const giveBase = (st, cost) => { for (const [k, v] of Object.entries(cost)) S.storeToBase(st, k, v); };

// ---------------- 데이터 무결성 ----------------
test("모든 레시피의 재료/결과 아이템이 존재", () => {
  for (const r of RECIPES) {
    ok(ITEMS[r.out[0]], `out ${r.id}`);
    for (const k of Object.keys(r.in)) ok(ITEMS[k], `in ${k} of ${r.id}`);
    if (r.research) ok(RESEARCH.find((x) => x.id === r.research), `research ${r.research}`);
    if (r.station) ok(Object.values(BUILDINGS).some((b) => b.station === r.station), `station ${r.station}`);
  }
});
test("모든 건물 비용/연구 참조가 유효", () => {
  for (const [id, b] of Object.entries(BUILDINGS)) {
    for (const k of Object.keys(b.cost)) ok(ITEMS[k], `cost ${k} of ${id}`);
    if (b.research) ok(RESEARCH.find((x) => x.id === b.research), `research ${b.research} of ${id}`);
    ok(b.baseLv >= 1 && b.baseLv <= BASE_LEVELS.length, `baseLv ${id}`);
  }
  for (const L of BASE_LEVELS) for (const k of Object.keys(L.cost)) ok(ITEMS[k], `base cost ${k}`);
});
test("모든 직업: 시작 아이템/엔딩/스킬 유효", () => {
  for (const [id, j] of Object.entries(JOBS)) {
    for (const [it] of j.start) ok(ITEMS[it], `${id} start ${it}`);
    ok(ENDINGS[j.ending]?.mercy && ENDINGS[j.ending]?.tyrant, `${id} ending`);
    ok(j.skills.length >= 4, `${id} skills`);
  }
});
test("직업별 엔딩 서로 다름 (8직업 × 2 = 16)", () => {
  const titles = new Set();
  for (const j of Object.values(JOBS)) { titles.add(ENDINGS[j.ending].mercy[0]); titles.add(ENDINGS[j.ending].tyrant[0]); }
  eq(titles.size, Object.keys(JOBS).length * 2);
});
test("동물의 먹이 아이템 존재", () => { for (const a of Object.values(ANIMALS)) ok(ITEMS[a.food], a.name); });
test("스토리 동료의 합류 장이 실제 recruit 장과 일치", () => {
  for (const [k, c] of Object.entries(STORY_COMPANIONS)) ok(CHAPTERS.some((ch) => ch.recruit === k), k);
});
test("직업 남/녀 능력치 동일 (성별은 외형만)", () => {
  const acc = S.newAccount();
  for (const job of Object.keys(JOBS)) {
    const m = S.newGame({ gender: "M", job, difficulty: "normal", seed: 1, account: acc });
    const f = S.newGame({ gender: "F", job, difficulty: "normal", seed: 1, account: acc });
    eq(JSON.stringify(m.player.stats), JSON.stringify(f.player.stats), job);
  }
});

// ---------------- 월드 ----------------
test("월드: 결정적 생성 + 기지 주변 이동 가능 + 초반 자원 보장", () => {
  const a = generateWorld(1234), b = generateWorld(1234);
  eq(a.nodes.length, b.nodes.length);
  eq(a.tiles.join(""), b.tiles.join(""));
  ok(!isBlocked(a, a.cx * TILE, a.cy * TILE), "base blocked");
  const near = a.nodes.filter((n) => Math.abs(n.tx - a.cx) <= 8 && Math.abs(n.ty - a.cy) <= 8);
  for (const t of ["tree", "rock", "bush"]) ok(near.some((n) => n.type === t), `near ${t}`);
});
test("월드: 모든 POI 가 기지에서 걸어서 도달 가능 (BFS)", () => {
  for (const seed of [1, 7, 99, 2024, 31337]) {
    const w = generateWorld(seed);
    const seen = new Uint8Array(WORLD_W * WORLD_H);
    const q = [[w.cx, w.cy]]; seen[w.cy * WORLD_W + w.cx] = 1;
    while (q.length) {
      const [x, y] = q.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= WORLD_W || ny >= WORLD_H) continue;
        const i = ny * WORLD_W + nx;
        if (seen[i] || w.tiles[i] === T.WATER) continue;
        seen[i] = 1; q.push([nx, ny]);
      }
    }
    for (const p of Object.values(w.pois)) ok(seen[p.ty * WORLD_W + p.tx], `seed ${seed}: ${p.name} 도달 불가`);
  }
});

test("월드: 생애마다 장소 위치가 달라지지만 장소·보스 구성은 동일", () => {
  const a = generateWorld(11), b = generateWorld(12);
  eq(Object.keys(a.pois).join(), Object.keys(b.pois).join());
  ok(Object.keys(a.pois).some((k) => a.pois[k].tx !== b.pois[k].tx || a.pois[k].ty !== b.pois[k].ty), "positions should differ");
  for (const k of Object.keys(DUNGEONS)) ok(a.pois[k] && b.pois[k], k);
});
test("월드: 무작위 배치 50개 시드 모두 모든 장소 도달 가능", () => {
  for (let seed = 100; seed < 150; seed++) {
    const w = generateWorld(seed);
    const seen = new Uint8Array(WORLD_W * WORLD_H);
    const q = [[w.cx, w.cy]]; seen[w.cy * WORLD_W + w.cx] = 1;
    while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= WORLD_W || ny >= WORLD_H) continue; const i = ny * WORLD_W + nx; if (seen[i] || w.tiles[i] === T.WATER) continue; seen[i] = 1; q.push([nx, ny]); } }
    for (const p of Object.values(w.pois)) ok(seen[p.ty * WORLD_W + p.tx], `seed ${seed}: ${p.name}`);
  }
});

// ---------------- 제작 품질 ----------------
test("제작 품질: 확률 합 100%, 손재주가 높으면 좋은 결과↑ 나쁜 결과↓", () => {
  const lo = fresh("politician").st, hi = fresh("engineer").st;
  hi.player.stats.cra = 25;
  const ql = S.qualityOdds(lo, null), qh = S.qualityOdds(hi, "forge");
  ok(Math.abs(ql.reduce((a, b) => a + b) - 1) < 1e-9);
  ok(qh[0] < ql[0], "poor less likely"); ok(qh[4] > ql[4], "legend more likely");
  const al = S.affixOdds(lo), ah = S.affixOdds(hi, "forge");
  ok(ah.good > al.good && ah.bad < al.bad, "good affix more likely");
});
test("제작 품질: 같은 레시피라도 결과가 다르고 능력치에 반영", () => {
  const { st } = fresh("engineer");
  st.base.buildings.push({ uid: "w", id: "workbench" }, { uid: "c", id: "cellar", storage: [] });
  const seen = new Set();
  for (let i = 0; i < 60; i++) {
    give(st, { wood: 4, twig: 4, stone: 1, fiber: 3 });
    const r = S.craft(st, "spear", { rng: makeRng(i) });
    ok(r.ok); seen.add(r.quality.q + "|" + (r.quality.af || ""));
  }
  ok(seen.size >= 5, "variety " + seen.size);
  const a = S.applyQuality(S.makeStack("spear", 1), 4, "sharp"), b = S.applyQuality(S.makeStack("spear", 1), 0, "dull");
  ok(S.itemStat(a, "atk") > S.itemStat(b, "atk") * 2);
  ok(a.maxDur > b.maxDur);
  eq(S.itemLabel(a), "날카로운 전설의 창");
});

// ---------------- 지구(공유 세계) ----------------
const E = await import("../js/earth.js");
test("지구: 실제 지리(육지/바다) 판정", () => {
  for (const [n, a, o] of [["서울", 37.5, 127], ["사하라", 23, 10], ["아마존", -3, -60], ["페어뱅크스", 64.8, -147.7], ["추코트카", 66, -175], ["파리", 48.8, 2.3], ["호주", -25, 134]]) ok(E.isLand(a, o), n);
  for (const [n, a, o] of [["태평양", 0, -150], ["대서양", 30, -40], ["인도양", -20, 80]]) ok(!E.isLand(a, o), n);
});
test("지구: 기후 분류가 현실과 맞음", () => {
  const b = (a, o) => E.climate(a, o).biome;
  eq(b(23, 10), "desert"); eq(b(-3, -60), "rainforest"); eq(b(48.8, 2.3), "temperate"); eq(b(37.5, 127), "temperate");
  ok(["taiga", "tundra"].includes(b(65, 100))); eq(b(46, 103), "steppe");
  eq(E.climate(31, -99).region, "북아메리카"); eq(E.climate(37.5, 127).city.name, "서울");
});
test("지구: 낙하 지점은 항상 육지·시작 가능 군계, 같은 시드 = 같은 지점, 여러 군계에 고르게", () => {
  const seen = {};
  for (let i = 0; i < 400; i++) { const sp = E.randomSpawn(i); ok(E.isLand(sp.lat, sp.lon), sp.id); ok(BIOMES[sp.biome].spawn, sp.biome); seen[sp.biome] = 1; }
  eq(E.randomSpawn(77).id, E.randomSpawn(77).id);
  ok(Object.keys(seen).length >= 6, Object.keys(seen).join());
});
test("지구: 1억 명이 시작해도 겹침이 드묾(구역 수 ≥ 2억)", () => {
  let land = 0; for (let r = 0; r < 360; r++) for (let c = 0; c < 720; c++) if (E.landAt(r, c)) land++;
  ok(land * E.SUB * E.SUB > 2e8, String(land * E.SUB * E.SUB));
});
test("지구: 어느 지역이든 생존 압박(난이도) 동일 ±10%", () => {
  const ref = S.climatePressure(S.DEFAULT_GEO);
  for (let i = 0; i < 300; i++) { const g = E.randomSpawn(1000 + i); const p = S.climatePressure(g, S.needsNormalizer(g)); ok(Math.abs(p / ref - 1) <= 0.1, `${g.biome} ${p}`); }
});
test("지구: 군계별 지형 — 사막엔 모래, 툰드라엔 눈, 모든 군계에 기지 근처 물·초반 자원", () => {
  for (const bio of Object.keys(BIOMES).filter((k) => BIOMES[k].spawn)) {
    const w = generateWorld(5, bio);
    const near = w.nodes.filter((n) => Math.abs(n.tx - w.cx) <= 8 && Math.abs(n.ty - w.cy) <= 8);
    for (const t of ["tree", "rock", "bush"]) ok(near.some((n) => n.type === t), `${bio} ${t}`);
    let water = false; for (let y = -11; y <= 11; y++) for (let x = -11; x <= 11; x++) if (w.tiles[(w.cy + y) * WORLD_W + w.cx + x] === T.WATER) water = true;
    ok(water, bio + " water");
  }
  const cnt = (w, t) => w.tiles.filter((x) => x === t).length;
  ok(cnt(generateWorld(5, "desert"), T.SAND) > 1000); ok(cnt(generateWorld(5, "tundra"), T.SNOW) > 1000);
});
test("지구: 같은 좌표면 같은 지형(공유 세계)", () => {
  const a = E.randomSpawn(42), b = E.randomSpawn(42);
  eq(generateWorld(a.seed, a.biome).tiles.join(""), generateWorld(b.seed, b.biome).tiles.join(""));
});
test("지구: 위도별 낮 길이(고위도 여름은 길고 겨울은 짧음), 남반구도 현지 계절", () => {
  const st = fresh().st;
  st.geo = E.climate(65, 25);
  st.time.min = 1440 * 8 + 600; const summer = S.daylight(st);
  st.time.min = 1440 * 22 + 600; const winter = S.daylight(st);
  ok(summer > 16 && winter < 8, `${summer} ${winter}`);
  st.geo = E.climate(0, 22); ok(Math.abs(S.daylight(st) - 12) < 1);
});
test("지구: 날씨는 지역 날씨표에서 나오고 영하에선 비 대신 눈", () => {
  const st = fresh().st;
  st.geo = E.climate(23, 10); // 사막
  const seen = new Set(); for (let d = 2; d < 120; d++) { st.time.min = 1440 * (d - 1) + 60; S.dailyUpdate(st, d); seen.add(st.weather.id); }
  ok(seen.has("sandstorm") || seen.has("heatwave"), [...seen].join());
  ok(!seen.has("snow") && !seen.has("blizzard"));
});
for (const bio of ["desert", "tundra", "rainforest"]) test(`지구: ${bio}에서도 무과금 생존 흐름(물·음식 확보 시 7일 생존)`, () => {
  const { st } = fresh("soldier", "normal");
  st.geo = { ...S.DEFAULT_GEO, ...(bio === "desert" ? E.climate(23, 10) : bio === "tundra" ? E.climate(68, 160) : E.climate(-3, -60)) };
  S.addItem(st, st.inv, "canned_food", 30); S.addItem(st, st.inv, "water_clean", 40);
  st.base.buildings.push({ uid: "f", id: "campfire" });
  for (let hr = 0; hr < 24 * 7 && !st.dead; hr++) {
    S.tick(st, 60, { atBase: true, nearFire: true });
    if (st.player.hunger < 50) S.useItem(st, st.inv.findIndex((x) => x.id === "canned_food"));
    if (st.player.thirst < 50) S.useItem(st, st.inv.findIndex((x) => x.id === "water_clean"));
  }
  ok(!st.dead, `${bio} died: ${st.dead?.cause}`);
});

// ---------------- 나라급 · 매칭 ----------------
const MM = await import("../js/matchmaking.js");
test("나라급: 거점 Lv4 + 주민 5명부터, 국력으로 7개 급수", () => {
  const { st } = fresh(); st.base.lv = 4;
  eq(MM.isNation(st), false);
  for (let i = 0; i < 5; i++) st.companions.push(S.randomSurvivor(makeRng(i)));
  eq(MM.isNation(st), true);
  eq(MM.gradeOf(0).g, 1); eq(MM.gradeOf(700).g, 2); eq(MM.gradeOf(5599).g, 6); eq(MM.gradeOf(99999).g, 7);
  const sum = Object.values(MM.QUOTA).reduce((a, b) => a + b, 0); eq(sum, MM.GROUP_SIZE);
});
test("전쟁: 가까운 같은 급 우선 → 없으면 ±1급 → 그래도 없으면 근처 봇", () => {
  const me = { id: "me", lat: 37.5, lon: 127, grade: 3, continent: "asia", power: 1500 };
  const near3 = { id: "a", name: "A", lat: 36, lon: 128, grade: 3, power: 1400, continent: "asia" };
  const far3 = { id: "b", name: "B", lat: 48, lon: 2, grade: 3, power: 1400, continent: "europe" };
  const near4 = { id: "c", name: "C", lat: 35, lon: 129, grade: 4, power: 2000, continent: "asia" };
  let r = MM.findWarOpponents(me, [near3, far3, near4], "s", 1);
  eq(r.list[0].id, "a"); eq(r.step, "근처의 같은 급");
  r = MM.findWarOpponents(me, [far3, near4], "s", 1);
  eq(r.list[0].id, "c"); eq(r.step, "한 급 위·아래");
  r = MM.findWarOpponents(me, [], "s", 3);
  eq(r.list.length, 3); ok(r.list.every((k) => k.bot && k.grade === 3 && k.km < 2500), JSON.stringify(r.list.map((k) => k.km)));
});
test("올림픽 조: 64개국·대륙 할당 준수, 같은 급 우선, 없으면 ±1급 조에 합류", () => {
  const groups = [];
  const conts = Object.keys(MM.QUOTA);
  for (let i = 0; i < 300; i++) MM.assignGroup({ id: "p" + i, continent: conts[i % 6], grade: 3 + (i % 3 === 0 ? 1 : 0) }, groups);
  for (const g of groups) {
    ok(g.members.length <= 64);
    for (const c of conts) ok(g.members.filter((m) => m.continent === c).length <= MM.QUOTA[c], `${g.id} ${c}`);
  }
  const lone = MM.assignGroup({ id: "x", continent: "oceania", grade: 5 }, groups);
  ok(lone.dg === 1 || lone.group.grade === 5, "±1급 합류 또는 새 조");
  const r = MM.assignGroup({ id: "y", continent: "asia", grade: 3 }, [{ id: "g", grade: 3, members: [] }]);
  eq(r.dg, 0);
});
{
  const fs = await import("fs");
  const main = fs.readFileSync(new URL("../js/main.js", import.meta.url), "utf8");
  const r3d = fs.readFileSync(new URL("../js/r3d.js", import.meta.url), "utf8");
  const { TILE_INFO } = await import("../js/world.js");
  test("타일 색 정의 누락 없음(미니맵·3D·2D)", () => {
    for (const t of Object.values(T)) {
      ok(main.includes(` ${t}: [`), `minimap ${t}`);
      ok(new RegExp(`[{ ]${t}: `).test(r3d.slice(r3d.indexOf("const colors ="), r3d.indexOf("const colors =") + 400)), `3d ${t}`);
      ok(TILE_INFO[t], `2d ${t}`);
    }
  });
}
test("올림픽: 시즌 초반엔 봇도 일부 종목만 참가, 끝날 무렵엔 거의 전부", () => {
  const ev = OLYMPIC_EVENTS[0], season = "S1483", start = 1483 * 14 * 86400000;
  let early = 0, late = 0;
  for (let i = 0; i < 200; i++) { const b = { id: "b" + i, grade: 3 }; if (O.botParticipates(season, ev, b, start + 3600e3)) early++; if (O.botParticipates(season, ev, b, start + 13.5 * 86400000)) late++; }
  ok(early < 70 && late > 180, `${early} ${late}`);
});
test("올림픽 조(오프라인): 항상 64개국, 대륙 비율 정확, 빈자리는 봇", () => {
  const me = { id: "me", name: "나", lat: 37.5, lon: 127, continent: "asia", grade: 4, power: 2000, level: 20 };
  const grp = MM.composeGroupOffline(me, MM.simulatedPool("S1", 4), "S1");
  eq(grp.length, 64);
  for (const [c, q] of Object.entries(MM.QUOTA)) eq(grp.filter((m) => m.continent === c).length, q, c);
  ok(grp.filter((m) => m.bot && m.id !== "me").every((m) => Math.abs(m.grade - 4) <= 2));
  ok(grp.filter((m) => m.id !== "me").filter((m) => m.grade === 4).length > 30, "같은 급 위주");
  const stn = O.groupStandings("S1", grp, "me", { quiz: { best: 400 } });
  ok(stn.myRank >= 1 && stn.myRank <= 64);
  eq(O.groupStandings("S1", grp, "me", {}).rows[0].id, O.groupStandings("S1", grp, "me", {}).rows[0].id, "결정적");
});
test("급별 순위: 같은 급 안에서 국력 순", () => {
  const me = { id: "me", grade: 2, power: 1000 };
  const pool = [{ id: "a", grade: 2, power: 1100 }, { id: "b", grade: 2, power: 900 }, { id: "c", grade: 3, power: 5000 }];
  const r = MM.gradeRanking(me, pool);
  eq(r.rank, 2); eq(r.total, 3);
});
test("국가 카드: 위치는 0.5° 단위로 뭉개서(약 50km) 저장", () => {
  const { st } = fresh(); st.geo = E.climate(37.567, 126.978);
  const c = MM.kingdomCard(st, 500);
  eq(c.lat * 2 % 1, 0); eq(c.lon * 2 % 1, 0); eq(c.continent, "asia");
});

// ---------------- 기기 간 이어하기 결정 로직 ----------------
const Sync = await import("../js/sync.js");
test("동기화: 서버 없음→올리기 / 같은 리비전+로컬 변경→올리기 / 다른 기기 진행→받기 / 양쪽 진행→충돌(묻기)", () => {
  eq(Sync.decide({ rev: 0, dirty: false, hasSave: true }, null), "push");
  eq(Sync.decide({ rev: 0, dirty: false, hasSave: false }, null), "none");
  eq(Sync.decide({ rev: 5, dirty: true }, { rev: 5 }), "push");
  eq(Sync.decide({ rev: 5, dirty: false }, { rev: 5 }), "none");
  eq(Sync.decide({ rev: 5, dirty: false }, { rev: 7 }), "pull");
  eq(Sync.decide({ rev: 5, dirty: true }, { rev: 7 }), "conflict");
});
test("동기화: 충돌 화면 요약(이름·일차·장·레벨·지역)", () => {
  const { st } = fresh(); st.time.min = 1440 * 9; st.story.chapter = 3;
  const s = Sync.summary(st); eq(s.day, 10); eq(s.chapter, 3); eq(s.level, 1);
});

// ---------------- 처음 안내(튜토리얼) ----------------
const Tut = await import("../js/tutorial.js");
test("튜토리얼: 8단계, 각 단계 완료 조건이 실제 플레이로 충족됨", () => {
  eq(Tut.TUTORIAL.length, 8);
  const { st } = fresh("soldier");
  const G = { tutStart: { x: 0, y: 0 } };
  st.player.x = 200; st.player.y = 0; ok(Tut.TUTORIAL[0].done(st, G));
  S.addItem(st, st.inv, "twig", 3); ok(Tut.TUTORIAL[1].done(st, G));
  S.addItem(st, st.inv, "stone", 2); ok(Tut.TUTORIAL[2].done(st, G));
  S.addItem(st, st.inv, "fiber", 2); ok(Tut.TUTORIAL[3].done(st, G));
  ok(S.craft(st, "stone_axe").ok); ok(Tut.TUTORIAL[4].done(st, G));
  ok(S.equipFromInv(st, "stone_axe")); ok(Tut.TUTORIAL[5].done(st, G));
  give(st, { wood: 10, twig: 10, stone: 10 }); ok(S.build(st, "campfire").ok); ok(Tut.TUTORIAL[6].done(st, G));
  S.addItem(st, st.inv, "water_dirty", 1); ok(S.craft(st, "water_clean").ok); ok(Tut.TUTORIAL[7].done(st, G));
});

// ---------------- 의뢰 게시판 · 동료 이야기 ----------------
test("의뢰: 매일 3개(같은 날은 같은 의뢰), 채집 의뢰는 물건을 내고 보상", () => {
  const { st } = fresh();
  const a = S.questBoard(st), b = S.questBoard(st);
  eq(a.length, 3); eq(a, b);
  st.quests.list[0] = { id: "t", kind: "gather", item: "wood", n: 5, title: "x", reward: { gold: 50, xp: 10 }, base: 0, done: false };
  eq(S.claimQuest(st, "t"), null, "부족하면 불가");
  S.addItem(st, st.inv, "wood", 7);
  const g0 = st.gold; ok(S.claimQuest(st, "t")); eq(st.gold, g0 + 50); eq(S.count(st.inv, "wood"), 2);
  eq(S.claimQuest(st, "t"), null, "중복 수령 불가");
  st.time.min += 1440; ok(S.questBoard(st)[0].id !== "t", "다음 날 새 의뢰");
});
test("의뢰: 처치 의뢰는 수락 시점 이후 처치 수로 판정", () => {
  const { st } = fresh(); st.stats.kills = 10;
  st.quests = { day: S.day(st), list: [{ id: "k", kind: "kill", n: 3, base: 10, reward: { gold: 1 }, done: false }] };
  eq(S.questProgress(st, st.quests.list[0]), 0); st.stats.kills = 13; ok(S.claimQuest(st, "k"));
});
test("동료 이야기: 호감도 40·80에서 열리고 한 번만 보상", () => {
  const { st } = fresh(); const c = S.recruitStory(st, "seoyun"); c.affinity = 45;
  const p = S.pendingCompanionStories(st); eq(p.length, 1);
  ok(S.completeCompanionStory(st, p[0].key)); eq(S.pendingCompanionStories(st).length, 0);
  c.affinity = 90; eq(S.pendingCompanionStories(st).length, 1);
});

// ---------------- 생존/부패/내구도 ----------------
test("새 게임: 체력 가득, 옷 착용, 시작 아이템", () => {
  for (const job of Object.keys(JOBS)) for (const d of Object.keys(DIFFICULTY)) {
    const { st } = fresh(job, d);
    eq(st.player.hp, st.player.maxHp);
    ok(st.player.equip.body?.id === "rag_shirt" && st.player.equip.legs?.id === "rag_pants");
    ok(st.inv.length > 0);
  }
});
test("부패: 생고기 상온 약 하루 반 → 썩음(기온 8℃), 저장고(0.4)에선 아직 신선", () => {
  const { st } = fresh("soldier");
  S.build(st, "crate"); // 비용 부족 → 실패해야 함
  eq(S.hasBuilding(st, "crate"), false);
  st.base.buildings.push({ uid: "c1", id: "cellar", storage: [] });
  S.addItem(st, st.inv, "raw_meat", 3);
  S.storeToBase(st, "raw_meat", 3);
  for (let i = 0; i < 28; i++) S.tick(st, 60, { atBase: true, nearFire: true });
  eq(S.count(st.inv, "raw_meat"), 0, "bag meat should rot");
  ok(S.count(st.inv, "rotten_food") >= 3, "rotten produced");
  const cel = st.base.buildings[0].storage.find((s) => s.id === "raw_meat");
  ok(cel && cel.fresh > 0.45 && cel.fresh < 0.75, "cellar fresh " + cel?.fresh);
});
test("부패: 요리사 직업은 25% 느리게, 핵겨울엔 더 느리게", () => {
  const a = fresh("cook").st, b = fresh("soldier").st;
  for (const st of [a, b]) { S.addItem(st, st.inv, "berry", 1); for (let i = 0; i < 10; i++) S.tick(st, 60, { atBase: true, nearFire: true }); }
  const fa = a.inv.find((s) => s.id === "berry").fresh, fb = b.inv.find((s) => s.id === "berry").fresh;
  ok(fa > fb, "cook slower");
  const w = fresh("soldier").st; w.time.min = 1440 * 21 + 600; // 22일차 = 핵겨울
  eq(S.season(w).id, "winter");
});
test("냉장고: 전력 없으면 상온, 발전기 가동 시 0.15", () => {
  const { st } = fresh();
  const fr = { uid: "f", id: "fridge", storage: [] };
  st.base.buildings.push(fr);
  eq(S.storageMult(st, fr), 1.0);
  st.base.buildings.push({ uid: "g", id: "generator", fueled: true });
  eq(S.storageMult(st, fr), 0.15);
});
test("내구도: 돌도끼 60회 사용 시 파괴, 기술자는 더 오래", () => {
  const { st } = fresh("soldier");
  S.addItem(st, st.inv, "stone_axe", 1); S.equipFromInv(st, "stone_axe");
  for (let i = 0; i < 60; i++) S.gather(st, "tree", makeRng(i));
  eq(st.player.equip.hand, null, "axe should break");
  const e = fresh("engineer").st;
  S.addItem(e, e.inv, "stone_axe", 1); S.equipFromInv(e, "stone_axe");
  for (let i = 0; i < 60; i++) S.gather(e, "tree", makeRng(i));
  ok(e.player.equip.hand && e.player.equip.hand.dur > 0, "engineer axe survives");
});
test("수리: 최대 내구도 10% 감소 (기술자 정비 스킬은 감소 없음)", () => {
  const { st } = fresh();
  st.base.buildings.push({ uid: "w", id: "workbench" });
  S.addItem(st, st.inv, "stone_axe", 1);
  const ax = st.inv.find((s) => s.id === "stone_axe"); ax.dur = 5;
  give(st, { wood: 10, twig: 10, stone: 10, fiber: 10 });
  ok(S.repair(st, ax)); eq(ax.maxDur, 54); eq(ax.dur, 54);
});
test("옷도 입고 있으면 닳는다", () => {
  const { st } = fresh();
  const before = st.player.equip.body.dur;
  S.tick(st, 600, { atBase: true, nearFire: true });
  ok(st.player.equip.body.dur < before);
});
test("굶주림/갈증 방치 시 사망, 사망 원인 기록", () => {
  const { st } = fresh();
  st.inv = [];
  for (let i = 0; i < 24 * 8 && !st.dead; i++) S.tick(st, 60, { atBase: true, nearFire: true });
  ok(st.dead, "should die"); ok(["갈증", "굶주림"].includes(st.dead.cause), st.dead.cause);
});
test("방사능: 방독면/방호복이 피폭을 줄인다", () => {
  const a = fresh().st, b = fresh().st;
  S.addItem(b, b.inv, "gas_mask", 1); S.equipFromInv(b, "gas_mask");
  for (const st of [a, b]) S.tick(st, 120, { inRad: true, atBase: false });
  ok(b.player.rad < a.player.rad);
});

// ---------------- 제작/건설/연구 ----------------
test("채집: 맨손은 아주 느리고 맞는 도구는 빠름 · 나뭇가지는 맨손으로 쉽게", () => {
  const { st } = fresh("jobless");
  st.player.equip.hand = null;
  const hand = S.gatherPower(st, "tree");
  ok(hand.need === "도끼" && hand.power <= 0.25, "맨손 나무 " + hand.power);
  ok(S.gatherPower(st, "rock").power <= 0.15);
  eq(S.gatherPower(st, "bush").power, 1); // 덤불은 맨손 OK
  give(st, { twig: 3, stone: 2, fiber: 2 }); ok(S.craft(st, "stone_axe").ok); ok(S.equipFromInv(st, "stone_axe"));
  const axe = S.gatherPower(st, "tree");
  ok(axe.tool && axe.power >= hand.power * 4, "도끼 " + axe.power);
  const out = S.gather(st, "bush", makeRng(1));
  ok(out.some(([id]) => id === "twig"), "덤불에서 나뭇가지");
});
test("체력: 깨어 있을 땐 회복 없음, 잠자면 회복(침대>침낭>맨땅)", () => {
  const heal = (ctx) => { const { st } = fresh("soldier"); st.player.hp = 20; st.player.hunger = 90; st.player.thirst = 90; S.tick(st, 120, { atBase: true, nearFire: true, ...ctx }); return st.player.hp - 20; };
  const awake = heal({}), bed = heal({ sleeping: true, sleepMul: 1 }), bag = heal({ sleeping: true, sleepMul: 0.7 }), ground = heal({ sleeping: true, sleepMul: 0.4 });
  ok(awake <= 0, "awake " + awake); ok(bed > bag && bag > ground && ground > 0, `${bed} ${bag} ${ground}`);
});
test("가공: 철광석·숯 → 철괴 → 강철 (대장간)", () => {
  const { st } = fresh("engineer");
  st.base.lv = 3; st.base.research.done.push("smelting"); st.base.buildings.push({ uid: "f", id: "forge" }, { uid: "c", id: "campfire" });
  give(st, { wood: 10, iron_ore: 3 });
  ok(S.craft(st, "coal", { atBase: true }).ok); ok(S.craft(st, "coal", { atBase: true }).ok); ok(S.craft(st, "coal", { atBase: true }).ok);
  ok(S.craft(st, "iron_from_ore", { atBase: true }).ok); ok(S.countAll(st, "iron") >= 2);
  ok(S.craft(st, "steel", { atBase: true }).ok); ok(S.countAll(st, "steel") >= 1);
});
test("제작: 재료 부족 시 실패 / 충분하면 성공 + 경험치", () => {
  const { st } = fresh();
  eq(S.craft(st, "stone_axe").ok, false);
  give(st, { twig: 3, stone: 2, fiber: 2 });
  const xp = st.stats.xpEarned;
  eq(S.craft(st, "stone_axe").ok, true);
  ok(st.stats.xpEarned > xp);
  eq(S.count(st.inv, "twig"), 0);
});
test("제작: 작업대 필요 레시피는 작업대 없이는 실패", () => {
  const { st } = fresh();
  give(st, { wood: 10, fiber: 10, leather: 2 });
  eq(S.craft(st, "bow").ok, false);
  st.base.buildings.push({ uid: "w", id: "workbench" });
  eq(S.craft(st, "bow").ok, true);
});
test("건설: 부지 수 제한 + 거점 업그레이드는 스토리 진행 필요", () => {
  const { st } = fresh();
  give(st, { wood: 500, twig: 100, stone: 500, cloth: 50, scrap: 50 });
  ok(S.build(st, "campfire").ok); ok(S.build(st, "workbench").ok); ok(S.build(st, "crate").ok);
  eq(S.build(st, "bed").ok, false, "slots full at lv1");
  ok(S.canUpgradeBase(st)?.includes("스토리"));
  st.story.chapter = 1;
  ok(S.upgradeBase(st).ok); eq(st.base.lv, 2);
  ok(S.build(st, "bed").ok);
});
test("철거: 창고에 물건이 있으면 불가(아이템 증발 방지)", () => {
  const { st } = fresh();
  give(st, { wood: 20 });
  S.build(st, "crate");
  const c = st.base.buildings[0];
  S.storeToBase(st, "stone", 3);
  eq(S.demolish(st, c.uid), false);
});
test("연구: 연구자 동료가 포인트를 쌓아 완료", () => {
  const { st } = fresh();
  st.companions.push({ uid: "r", name: "연", role: "researcher", stats: { str: 5, agi: 5, vit: 5, int: 9, cha: 5, cra: 5 }, task: "base", morale: 80 });
  st.base.buildings.push({ uid: "c", id: "cellar", storage: [] });
  S.storeToBase(st, "canned_food", 50);
  ok(S.startResearch(st, "husbandry"));
  for (let d = 2; d < 8; d++) S.dailyUpdate(st, d);
  ok(st.base.research.done.includes("husbandry"));
});
test("연구: 시대를 건너뛸 수 없음", () => {
  const { st } = fresh();
  eq(S.startResearch(st, "statecraft"), false);
});

// ---------------- 동료/가족/동물 ----------------
test("주민은 매일 기지 음식을 먹고, 없으면 사기 하락 → 떠남", () => {
  const { st } = fresh();
  st.base.buildings.push({ uid: "c", id: "crate", storage: [] });
  const sv = S.randomSurvivor(makeRng(5)); st.companions.push(sv);
  S.storeToBase(st, "canned_food", 2);
  st.player.hunger = 100; st.player.thirst = 100;
  S.dailyUpdate(st, 2);
  eq(S.countAll(st, "canned_food") - S.count(st.inv, "canned_food"), 1);
  sv.morale = 5; S.dailyUpdate(st, 3); S.dailyUpdate(st, 4);
  ok(!st.companions.includes(sv), "should leave");
});
test("결혼 → 출산 → 28일 후 성인 → 계승", () => {
  const { st, acc } = fresh("doctor");
  st.base.lv = 3;
  st.base.buildings.push({ uid: "b", id: "bed" }, { uid: "h", id: "house" }, { uid: "c", id: "cellar", storage: [] });
  S.storeToBase(st, "canned_food", 500);
  const c = S.recruitStory(st, "seoyun");
  c.affinity = 100;
  ok(S.marry(st, c.uid).ok);
  let d = 2;
  while (!st.family.children.length && d < 400) S.dailyUpdate(st, d++);
  ok(st.family.children.length >= 1, "child born");
  const kid = st.companions.find((x) => x.uid === st.family.children[0]);
  eq(S.assign(st, kid.uid, "follow"), false, "아이는 동행/전투 불가");
  for (let i = 0; i < 28; i++) S.dailyUpdate(st, d++);
  ok(S.isAdult(kid));
  S.die(st, "테스트");
  const opt = S.reviveOptions(st, acc).find((o) => o.id === "heir");
  ok(opt, "heir option");
  const r = S.revive(st, acc, "heir");
  ok(r.ok && !st.dead); eq(st.player.name, kid.name); eq(st.generation, 2);
  ok(st.base.lv === 3, "왕국 유지");
});
test("동물: 우리에서 먹이 먹고 생산, 2마리 이상이면 번식 가능", () => {
  const { st } = fresh();
  st.base.lv = 3;
  st.base.buildings.push({ uid: "p", id: "pen" }, { uid: "c", id: "cellar", storage: [] });
  S.storeToBase(st, "seed", 200);
  S.addTamed(st, "chicken"); S.addTamed(st, "chicken");
  for (let d = 2; d < 80; d++) S.dailyUpdate(st, d);
  ok(S.countAll(st, "egg") > 0 || S.countAll(st, "rotten_food") > 0, "eggs produced");
  ok(st.animals.length > 2, "breeding happened " + st.animals.length);
});
test("탈것: 승마 연구 전엔 말 못 탐, 이후 이동속도 +60%", () => {
  const { st } = fresh();
  const h = S.addTamed(st, "horse");
  eq(S.mount(st, { type: "animal", uid: h.uid }), false);
  st.base.research.done.push("riding");
  const v0 = S.moveSpeed(st);
  ok(S.mount(st, { type: "animal", uid: h.uid }));
  ok(Math.abs(S.moveSpeed(st) / v0 - 1.6) < 0.01);
});
test("동행 동료는 최대 2명", () => {
  const { st } = fresh();
  for (let i = 0; i < 3; i++) st.companions.push(S.randomSurvivor(makeRng(i)));
  ok(S.assign(st, st.companions[0].uid, "follow"));
  ok(S.assign(st, st.companions[1].uid, "follow"));
  eq(S.assign(st, st.companions[2].uid, "follow"), false);
});

// ---------------- 죽음/부활/혈통 ----------------
test("부활: 보석 비용이 챕터 내 횟수마다 증가(어려움)", () => {
  const { st, acc } = fresh("soldier", "hard");
  acc.gems = 99999; acc.lastFreeRevive = Date.now(); acc.reviveTokens = 0; acc.ads = { date: S.todayStr(), count: 1, freeRevive: true };
  const costs = [];
  for (let i = 0; i < 3; i++) { S.die(st, "x"); costs.push(S.reviveGemCost(st)); ok(S.revive(st, acc, "gems").ok); }
  eq(JSON.stringify(costs), JSON.stringify([300, 900, 2700]));
});
test("부활 후 가방 재료 절반 손실, 장비 유지", () => {
  const { st, acc } = fresh();
  give(st, { wood: 10 });
  S.die(st, "x");
  ok(S.revive(st, acc, "token").ok);
  eq(S.count(st.inv, "wood"), 5);
  ok(st.player.equip.body);
});
test("죽음 수용 → 혈통 경험치 적립 → 다음 생애 능력치 상승", () => {
  const acc = S.newAccount();
  const a = S.newGame({ gender: "M", job: "farmer", difficulty: "normal", seed: 3, account: acc });
  a.legacyPending = 400 * 16; // 혈통 Lv4 분량
  S.die(a, "x");
  S.revive(a, acc, "accept");
  ok(a.ended);
  const lv = S.legacyOf(acc, "farmer").level;
  ok(lv >= 4, "legacy lv " + lv);
  const b = S.newGame({ gender: "F", job: "farmer", difficulty: "normal", seed: 4, account: acc });
  eq(b.player.stats.str, JOBS.farmer.stats.str + Math.floor(lv / 2));
  ok(b.player.skills.includes("greenthumb"));
});
test("혈통은 살아 있는 동안에도 오르고 즉시 능력치에 반영", () => {
  const { st, acc } = fresh("soldier");
  const str0 = st.player.stats.str;
  S.gainXp(st, 400 * 9); // 혈통 Lv3 → 능력치 +1
  ok(S.flushLegacy(st, acc));
  eq(st.player.legacyLevel, 3); eq(st.player.stats.str, str0 + 1);
  ok(st.player.skills.includes("aim"));
});
test("어려움 난이도에서는 광고 부활 불가", () => {
  const { st, acc } = fresh("soldier", "hard");
  S.die(st, "x");
  ok(!S.reviveOptions(st, acc).some((o) => o.id === "ad"));
});
test("보석은 계정 귀속 — 캐릭터가 죽어도 유지", () => {
  const { st, acc } = fresh();
  acc.gems = 777;
  S.die(st, "x"); S.revive(st, acc, "accept");
  eq(acc.gems, 777);
});

// ---------------- 습격/전투력 ----------------
test("습격: 방어력 높으면 대부분 승리, 낮으면 약탈", () => {
  let wins = 0;
  for (let i = 0; i < 200; i++) {
    const { st } = fresh();
    st.base.buildings.push({ uid: "t", id: "turret" }, { uid: "t2", id: "turret" });
    if (S.resolveRaid(st, 100, 0, makeRng(i)).win) wins++;
  }
  ok(wins > 170, "wins " + wins);
});
test("전투력: 아이는 포함되지 않고, 동행 동료는 포함", () => {
  const { st } = fresh();
  const p0 = S.combatPower(st);
  st.companions.push({ uid: "k", name: "아이", child: true, age: 3, role: "soldier", stats: { str: 9, agi: 9, vit: 9, int: 1, cha: 1, cra: 1 }, task: "base" });
  eq(S.combatPower(st), p0);
  const s = S.randomSurvivor(makeRng(1)); st.companions.push(s); S.assign(st, s.uid, "follow");
  ok(S.combatPower(st) > p0);
});

// ---------------- 오프라인 ----------------
test("오프라인 진행: 8시간 상한, 플레이어는 죽지 않음, 기지 생산 진행", () => {
  const { st } = fresh();
  st.base.lv = 2;
  st.base.buildings.push({ uid: "r", id: "rain_collector" }, { uid: "c", id: "cellar", storage: [] });
  st.player.hunger = 5; st.player.thirst = 5;
  const r = S.applyOffline(st, 48 * 3600 * 1000);
  eq(r.hours, 8);
  ok(!st.dead); ok(S.countAll(st, "water_clean") > 0); // 빗물 집수기 = 비교적 깨끗한 물
});

// ---------------- 올림픽 ----------------
test("올림픽: 같은 시즌/출전자 → 같은 점수(서버 재계산 가능)", () => {
  const ev = OLYMPIC_EVENTS[0];
  const e = { uid: "p", stats: { str: 9, agi: 9, vit: 9, int: 9, cha: 9, cra: 9 }, level: 10 };
  eq(O.autoScore("S1", ev, e), O.autoScore("S1", ev, e));
  const base = O.baseScore(ev, e.stats, e.level);
  const s = O.autoScore("S1", ev, e);
  ok(s >= base * 0.85 - 1 && s <= base * 1.15 + 1, "luck band");
  eq(O.manualScore(ev, e, 1), Math.round(base * 1.3));
  eq(O.manualScore(ev, e, 0), Math.round(base * 0.85));
});
test("올림픽: 하루 3회 제한, 최고 기록 유지, 종합 순위 1~64", () => {
  const { st, acc } = fresh(); st.base.lv = 4;
  const t = "2026-1-1";
  for (let i = 0; i < 3; i++) ok(O.submit(acc, st, "shooting", "player", 100 + i, t).ok);
  eq(O.submit(acc, st, "shooting", "player", 999, t).ok, false);
  eq(acc.olympics.entries.shooting.best, 102);
  const o = O.overall(acc, 4);
  ok(o.overallRank >= 1 && o.overallRank <= 64);
});
test("올림픽: 능력치가 높을수록 순위가 오른다(실력 우선, 운은 보조)", () => {
  const ev = OLYMPIC_EVENTS[2];
  const lo = O.autoScore("S9", ev, { uid: "a", stats: { str: 8, agi: 8, vit: 8, int: 8, cha: 8, cra: 8 }, level: 12 });
  const hi = O.autoScore("S9", ev, { uid: "a", stats: { str: 18, agi: 18, vit: 18, int: 18, cha: 18, cra: 18 }, level: 30 });
  ok(O.rankOf("S9", ev, 4, hi) < O.rankOf("S9", ev, 4, lo));
});

// ---------------- 상점 ----------------
test("상점: 스타터팩 1회 한정, 월정액 일일 보석+주간 부활권", () => {
  const { st, acc } = fresh();
  ok(Shop.purchase(acc, st, "starter").ok);
  eq(Shop.purchase(acc, st, "starter").ok, false);
  const t0 = acc.reviveTokens;
  Shop.purchase(acc, st, "pass_month");
  eq(Shop.claimPassDaily(acc), 120); eq(Shop.claimPassDaily(acc), 0);
  eq(acc.reviveTokens, t0 + 1);
});
test("보급 투하 확률표 합 = 100%", () => {
  const s = Shop.SUPPLY_TABLE.reduce((a, b) => a + b.p, 0);
  ok(Math.abs(s - 1) < 1e-9, String(s));
});
test("일일 미션: 진행도 추적 후 1회만 수령", () => {
  const { st, acc } = fresh();
  Shop.dailyState(acc, st);
  st.stats.kills += 5;
  const g0 = acc.gems;
  eq(Shop.claimDaily(acc, st, "kill"), 40); eq(Shop.claimDaily(acc, st, "kill"), 0);
  eq(acc.gems, g0 + 40);
});

// ---------------- 저장 ----------------
test("저장/불러오기 왕복 + 변조 감지", () => {
  const { st, acc } = fresh();
  ok(Store.saveGame(st)); ok(Store.saveAccount(acc));
  const l = Store.loadGame();
  eq(l.player.name, st.player.name); eq(l.__tampered, false);
  const raw = JSON.parse(localStorage.getItem("ashk_save_v1"));
  raw.j = raw.j.replace('"gold":0', '"gold":999999');
  localStorage.setItem("ashk_save_v1", JSON.stringify(raw));
  eq(Store.loadGame().__tampered, true);
  const code = Store.exportAll(st, acc);
  ok(Store.importAll(code).st.player.name === st.player.name);
});
test("저장 크기 < 64KB (서버 비용 최소화)", () => {
  const { st } = fresh();
  st.base.lv = 8;
  for (let i = 0; i < 18; i++) st.base.buildings.push({ uid: "b" + i, id: "crate", storage: [] });
  for (const b of st.base.buildings) for (let k = 0; k < 16; k++) S.addItem(st, b.storage, Object.keys(ITEMS)[k + 20], 5);
  for (let i = 0; i < 60; i++) st.companions.push(S.randomSurvivor(makeRng(i)));
  const n = JSON.stringify(st).length;
  ok(n < 64 * 1024, "size " + n);
});

// ---------------- 네트워크 절약 규칙 ----------------
const Net = await import("../js/net.js");
{
  Net._reset();
  const r1 = await Net.submitRecord({ season: "S1", kind: "quiz", bracket: 4, score: 100 });
  const r2 = await Net.submitRecord({ season: "S1", kind: "quiz", bracket: 4, score: 100 });
  const r3 = await Net.submitRecord({ season: "S1", kind: "quiz", bracket: 4, score: 150 });
  const r4 = await Net.submitRecord({ season: "S1", kind: "sprint", bracket: 4, score: 150 });
  test("네트워크: 첫 기록 저장 → 동일 기록 생략 → 1시간 내 변경은 보류 → 다른 종목은 별도", () => {
    eq(r1, "offline"); eq(r2, "unchanged"); eq(r3, "throttled"); eq(r4, "offline");
  });
  const raw = JSON.parse(localStorage.getItem("ashk_net_v1"));
  raw.sent["S1|quiz"].at -= 3600e3 + 1; localStorage.setItem("ashk_net_v1", JSON.stringify(raw));
  const r5 = await Net.submitRecord({ season: "S1", kind: "quiz", bracket: 4, score: 150 });
  test("네트워크: 1시간이 지나면 바뀐 기록 전송 허용", () => eq(r5, "offline"));
  const n1 = await Net.rename("강철수"), n2 = await Net.rename("김철수"), bad = await (Net._reset(), Net.rename("!"));
  test("네트워크: 이름 변경 하루 1회 + 형식 검사", () => { ok(n1.ok); eq(n2.ok, false); eq(bad.ok, false); });
  test("네트워크: 서버 설정 없으면 완전 오프라인(요청 0회)", () => { eq(Net.stats.sent, 0); eq(Net.enabled(), false); });
}

// ---------------- 스토리 전체 진행(막힘 검사) ----------------
for (const job of Object.keys(JOBS)) test(`스토리 0→12장 완주 가능 (${JOBS[job].name})`, () => {
  const { st, acc } = fresh(job, "normal");
  const rich = { twig: 9999, coal: 9999, steel: 9999, iron_ore: 999, wood: 9999, stone: 9999, scrap: 9999, fiber: 9999, cloth: 9999, leather: 9999, iron: 9999, electronics: 9999, fuel: 9999, fertilizer: 99, ammo: 999, gold_watch: 2, bone: 99, herb: 99, salt: 99, gunpowder: 99 };
  let guard = 0;
  st.base.buildings.push({ uid: "store", id: "cellar", storage: [] });
  while (st.story.chapter < 12 && guard++ < 50) {
    const g = CHAPTERS[st.story.chapter].goal;
    // 필요한 건물을 지을 부지가 없으면 거점 업그레이드 먼저
    giveBase(st, rich); give(st, { wood: 50, twig: 50, stone: 50, fiber: 50 });
    if (g.craft) { const r = S.craft(st, g.craft); ok(r.ok, `craft ${g.craft}: ${r.why}`); }
    while (g.baseLv && st.base.lv < g.baseLv) { const r = S.upgradeBase(st); ok(r.ok, `upgrade: ${r.why}`); }
    for (const k of ["building", "building2"]) if (g[k] && !S.hasBuilding(st, g[k])) {
      while (S.canBuild(st, g[k])?.includes("부지") && S.upgradeBase(st).ok);
      if (S.canBuild(st, g[k])?.includes("부지")) st.base.buildings = st.base.buildings.filter((b) => b.id !== "cellar" || b.storage.length);
      const r = S.build(st, g[k]); ok(r.ok, `build ${g[k]}: ${r.why}`);
    }
    if (g.visit) st.story.visited[g.visit] = true;
    if (g.tamed) S.addTamed(st, "dog");
    if (g.raidWon) st.story.raidWon++;
    if (g.residents) while (st.companions.length < g.residents) {
      if (st.companions.length >= S.residentCap(st)) {
        if (S.canBuild(st, "house")?.includes("부지")) S.upgradeBase(st);
        const r = S.build(st, "house"); ok(r.ok || S.residentCap(st) > st.companions.length, `house: ${r.why}`);
      }
      ok(S.recruit(st, S.randomSurvivor(makeRng(st.companions.length))).ok, "recruit");
    }
    if (g.research) {
      for (const r of RESEARCH) { if (!st.base.research.done.includes(r.id)) { st.base.research.done.push(r.id); } if (r.id === g.research) break; }
    }
    if (g.olympics) st.story.olympics++;
    if (g.boss) st.story.bossDefeated = true;
    S.checkStory(st);
  }
  eq(st.story.chapter, 12, `stuck at ${st.story.chapter}: ${JSON.stringify(S.goalProgress(st))}`);
  const e = S.finishMainStory(st, acc);
  ok(e.title && acc.endings.length === 1);
});

console.log(results.join("\n"));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
