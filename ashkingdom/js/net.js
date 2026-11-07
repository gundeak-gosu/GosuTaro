// =====================================================================
// 네트워크 — "서버가 할 일을 거의 없게" 만드는 통신 계층
// 원칙(기획서 §16):
//  1) 결과만 보낸다: 게임은 전부 기기에서 돈다. 서버에는 랭킹용 기록 '한 줄'만.
//     세이브는 서버에 올리지 않는다(기기 이전은 저장 코드).
//  2) 접속 총량을 줄인다: 보안 연결(TLS) 비용이 기록 한 줄보다 훨씬 크므로
//     - 기록은 '랭킹 화면을 열 때만', 바뀌지 않았으면 안 보내고, 바뀌어도 종류별 1시간에 1번
//     - 받기도 1시간 캐시, 상위 100명만, 공지는 최근 10개만
//     - 명예의 전당(주간 1위)은 기기에 저장해 두고 새로 생긴 주만 주 1회 받는다
//     - 이름 변경은 하루 1번
//  3) 조작 기록은 DB 보안 규칙(RLS·CHECK·트리거)이 공짜로 거른다(docs/supabase_schema.sql).
// 서버 설정이 없으면(window.ASHK_CONFIG 없음) 완전 오프라인으로 동작 — 라이벌은 결정적 시뮬레이션.
// =====================================================================
export const CLIENT_VER = 110; // 서버 ashk_config.min_client_ver 보다 낮으면 DB가 기록을 거부

const HOUR = 3600e3, DAY = 86400e3, WEEK = 7 * DAY;
const K = "ashk_net_v1";

function cfg() { return typeof window !== "undefined" ? window.ASHK_CONFIG : null; }
export function enabled() { const c = cfg(); return !!(c && c.supabaseUrl && c.anonKey); }

function load() { try { return JSON.parse(localStorage.getItem(K)) || {}; } catch { return {}; } }
function save(n) { try { localStorage.setItem(K, JSON.stringify(n)); } catch { /* 저장 불가 환경 */ } }
const now = () => Date.now();
export const stats = { sent: 0, skipped: 0, fetched: 0, cached: 0 }; // 디버그·테스트용 카운터

async function api(path, { method = "GET", body, token, prefer } = {}) {
  const c = cfg();
  const res = await fetch(c.supabaseUrl.replace(/\/$/, "") + path, {
    method,
    headers: { apikey: c.anonKey, authorization: `Bearer ${token || c.anonKey}`, "content-type": "application/json", ...(prefer ? { prefer } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  const data = txt ? JSON.parse(txt) : null;
  if (!res.ok) { const e = new Error(data?.message || res.status); e.status = res.status; throw e; }
  return data;
}

// 익명 로그인(Supabase Anonymous Sign-in) — 토큰은 기기에 저장, 만료 시에만 갱신
async function session() {
  const n = load();
  if (n.auth && n.auth.exp - 60e3 > now()) return n.auth;
  let r;
  if (n.auth?.refresh) {
    try { r = await api("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: n.auth.refresh } }); } catch { r = null; }
  }
  if (!r) r = await api("/auth/v1/signup", { method: "POST", body: {} });
  n.auth = { token: r.access_token, refresh: r.refresh_token, uid: r.user?.id, exp: now() + (r.expires_in || 3600) * 1000 };
  save(n);
  return n.auth;
}

// ---------- 0) 낙하 지점 예약: 새 생애마다 딱 1번 쓰기 ----------
// 같은 구역에 이미 다른 왕국이 있으면(유니크 충돌) 다른 곳을 다시 뽑는다. 서버가 없으면 그냥 무작위.
export async function claimSpawn(roll) {
  let sp = roll();
  if (!enabled()) return sp;
  try {
    const a = await session();
    for (let i = 0; i < 4; i++) {
      try {
        await api("/rest/v1/ashk_regions", { method: "POST", token: a.token, prefer: "return=minimal", body: { cell: sp.id, biome: sp.biome, client_ver: CLIENT_VER } });
        stats.sent++;
        return sp;
      } catch (e) { if (e.status !== 409) throw e; sp = roll(); }
    }
  } catch { /* 오프라인으로 진행 */ }
  return sp;
}

// ---------- 1) 기록 보내기 (랭킹 화면 열 때만 호출) ----------
// rec: { season, kind, bracket, score }
export async function submitRecord(rec) {
  const n = load();
  n.sent = n.sent || {};
  const key = `${rec.season}|${rec.kind}`;
  const prev = n.sent[key];
  if (prev && prev.score === rec.score && prev.bracket === rec.bracket) { stats.skipped++; return "unchanged"; }
  if (prev && now() - prev.at < HOUR) { stats.skipped++; return "throttled"; }
  if (!enabled()) { n.sent[key] = { ...rec, at: now() }; save(n); return "offline"; }
  const a = await session();
  await api("/rest/v1/ashk_records?on_conflict=user_id,season,kind", {
    method: "POST", token: a.token, prefer: "resolution=merge-duplicates,return=minimal",
    body: { season: rec.season, kind: rec.kind, bracket: rec.bracket, score: Math.floor(rec.score), client_ver: CLIENT_VER },
  });
  n.sent[key] = { ...rec, at: now() };
  save(n);
  stats.sent++;
  return "sent";
}

// ---------- 2) 랭킹 받기: 1시간 캐시, 상위 100명 ----------
export async function fetchBoard(season, kind, bracket) {
  const n = load();
  n.boards = n.boards || {};
  const key = `${season}|${kind}|${bracket}`;
  const c = n.boards[key];
  if (c && now() - c.at < HOUR) { stats.cached++; return c.rows; }
  if (!enabled()) return c?.rows || null;
  const rows = await api(`/rest/v1/ashk_board?season=eq.${encodeURIComponent(season)}&kind=eq.${encodeURIComponent(kind)}&bracket=eq.${bracket}&select=name,score&order=score.desc&limit=100`);
  // 다른 시즌의 오래된 캐시는 정리(기기 저장 공간)
  for (const k of Object.keys(n.boards)) if (!k.startsWith(season + "|")) delete n.boards[k];
  n.boards[key] = { at: now(), rows };
  save(n);
  stats.fetched++;
  return rows;
}

// 랭킹 화면을 열 때: 바뀐 기록만(1시간 제한) 보내고, 보드는 캐시 우선
export async function openRanking(records, season, bracket) {
  const out = {};
  for (const r of records) { try { await submitRecord({ ...r, season, bracket }); } catch (e) { out.error = e.message; } }
  for (const r of records) { try { out[r.kind] = await fetchBoard(season, r.kind, bracket); } catch (e) { out.error = e.message; } }
  return out;
}

// ---------- 공지: 최근 10개, 1시간 캐시 ----------
export async function notices() {
  const n = load();
  if (n.notices && now() - n.notices.at < HOUR) { stats.cached++; return n.notices.rows; }
  if (!enabled()) return n.notices?.rows || [];
  const rows = await api("/rest/v1/ashk_notices?select=id,title,body,created_at&order=created_at.desc&limit=10");
  n.notices = { at: now(), rows };
  save(n);
  stats.fetched++;
  return rows;
}

// ---------- 명예의 전당: 기기에 누적 저장, 새로 생긴 주만 주 1회 ----------
export async function hallOfFame() {
  const n = load();
  n.hof = n.hof || { at: 0, rows: [] };
  if (now() - n.hof.at < WEEK || !enabled()) { stats.cached++; return n.hof.rows; }
  const lastWeek = n.hof.rows.reduce((m, r) => Math.max(m, r.week), 0);
  const fresh = await api(`/rest/v1/ashk_hall_of_fame?week=gt.${lastWeek}&select=week,kind,name,score&order=week.asc`);
  n.hof = { at: now(), rows: [...n.hof.rows, ...fresh] };
  save(n);
  stats.fetched++;
  return n.hof.rows;
}

// ---------- 이름 변경: 하루 1번(서버 트리거도 같은 규칙으로 막음) ----------
export function canRename() { const n = load(); return !n.renamedAt || now() - n.renamedAt >= DAY; }
export async function rename(name) {
  name = String(name).trim().slice(0, 10);
  if (!/^[\p{L}\p{N} _-]{2,10}$/u.test(name)) return { ok: false, why: "2~10자, 글자·숫자만" };
  if (!canRename()) return { ok: false, why: "이름은 하루에 한 번만 바꿀 수 있습니다" };
  const n = load();
  if (enabled()) {
    const a = await session();
    await api("/rest/v1/ashk_players?on_conflict=user_id", { method: "POST", token: a.token, prefer: "resolution=merge-duplicates,return=minimal", body: { name } });
  }
  n.renamedAt = now(); n.name = name; save(n);
  return { ok: true };
}

// 테스트용
export function _reset() { try { localStorage.removeItem(K); } catch { /* */ } for (const k of Object.keys(stats)) stats[k] = 0; }
