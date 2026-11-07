// =====================================================================
// 기기 간 이어하기(PC ↔ 휴대폰) — 이메일 로그인 + 세이브 동기화
// 서버 비용 원칙: 세이브는 압축(gzip)해서 '게임 시작 시 1번 받기, 끌 때·10분마다 바뀐 경우만 올리기'.
// 충돌(두 기기에서 따로 진행)은 자동으로 덮어쓰지 않고 플레이어에게 묻는다.
// 서버 설정(window.ASHK_CONFIG)이 없으면 아무 것도 하지 않는다(완전 오프라인).
// =====================================================================
import { enabled } from "./net.js";

const K = "ashk_sync_v1";
const SYNC_EVERY_MS = 10 * 60 * 1000;
const MAX_BYTES = 200 * 1024;

function load() { try { return JSON.parse(localStorage.getItem(K)) || {}; } catch { return {}; } }
function save(s) { try { localStorage.setItem(K, JSON.stringify(s)); } catch { /* */ } }
export const state = () => load();
export const loggedIn = () => !!load().auth?.email;

// ---------- 결정 로직(순수 함수, 테스트 대상) ----------
// local: { rev: 마지막으로 서버와 맞춘 리비전, dirty: 그 뒤 로컬에서 진행했는지 }
// remote: { rev, ... } | null
// 반환: "push" | "pull" | "conflict" | "none"
export function decide(local, remote) {
  if (!remote) return local.dirty || local.hasSave ? "push" : "none";
  if (remote.rev === local.rev) return local.dirty ? "push" : "none";
  if (remote.rev > local.rev) return local.dirty ? "conflict" : "pull";
  return "push"; // 로컬 rev 가 더 큼(이론상 없음) → 로컬 기준
}

// 충돌 시 보여줄 요약
export function summary(st) {
  if (!st) return null;
  return { name: st.player?.name, day: Math.floor((st.time?.min || 0) / 1440) + 1, chapter: st.story?.chapter ?? 0, level: st.player?.level ?? 1, region: st.geo?.region || "" };
}

// ---------- 압축 ----------
async function gzip(str) {
  if (typeof CompressionStream === "undefined") return "raw:" + btoa(unescape(encodeURIComponent(str)));
  const cs = new Blob([str]).stream().pipeThrough(new CompressionStream("gzip"));
  const buf = new Uint8Array(await new Response(cs).arrayBuffer());
  let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return "gz:" + btoa(s);
}
async function gunzip(data) {
  if (data.startsWith("raw:")) return decodeURIComponent(escape(atob(data.slice(4))));
  const bin = atob(data.slice(3)); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const ds = new Blob([u]).stream().pipeThrough(new DecompressionStream("gzip"));
  return await new Response(ds).text();
}

// ---------- 서버 ----------
function cfg() { return window.ASHK_CONFIG; }
async function api(path, { method = "GET", body, token, prefer, keepalive } = {}) {
  const c = cfg();
  const res = await fetch(c.supabaseUrl.replace(/\/$/, "") + path, {
    method, keepalive,
    headers: { apikey: c.anonKey, authorization: `Bearer ${token || c.anonKey}`, "content-type": "application/json", ...(prefer ? { prefer } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await res.text(); const d = t ? JSON.parse(t) : null;
  if (!res.ok) { const e = new Error(d?.msg || d?.message || res.status); e.status = res.status; throw e; }
  return d;
}

// 이메일 로그인: 6자리 코드 발송 → 입력 → 같은 계정이면 어느 기기에서든 같은 세이브
export async function sendCode(email) { await api("/auth/v1/otp", { method: "POST", body: { email, create_user: true } }); }
export async function verifyCode(email, code) {
  const r = await api("/auth/v1/verify", { method: "POST", body: { type: "email", email, token: code } });
  const s = load();
  s.auth = { email, token: r.access_token, refresh: r.refresh_token, uid: r.user?.id, exp: Date.now() + (r.expires_in || 3600) * 1000 };
  s.rev = 0; s.dirty = true; // 새 계정 연결 → 첫 동기화에서 결정
  save(s);
  return true;
}
export function logout() { const s = load(); delete s.auth; s.rev = 0; save(s); }
async function token() {
  const s = load();
  if (!s.auth) return null;
  if (s.auth.exp - 60e3 > Date.now()) return s.auth.token;
  const r = await api("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: s.auth.refresh } });
  s.auth = { ...s.auth, token: r.access_token, refresh: r.refresh_token, exp: Date.now() + (r.expires_in || 3600) * 1000 };
  save(s);
  return s.auth.token;
}

export function markDirty() { const s = load(); if (!s.dirty) { s.dirty = true; save(s); } }

// 메타만 먼저 받는다(세이브 본문은 필요할 때만) — 전송량 최소화
async function remoteMeta(t) {
  const rows = await api(`/rest/v1/ashk_saves?select=rev,device,day,chapter,level,updated_at&user_id=eq.${load().auth.uid}`, { token: t });
  return rows[0] || null;
}

// 시작 시 호출. 반환: {action, remote, apply(st,acc)} — conflict 면 UI 가 선택 후 resolve 호출
export async function onStart(hasLocalSave) {
  if (!enabled() || !loggedIn()) return { action: "none" };
  const t = await token();
  const remote = await remoteMeta(t);
  const s = load(); s.hasSave = hasLocalSave; save(s);
  const action = decide({ rev: s.rev || 0, dirty: !!s.dirty, hasSave: hasLocalSave }, remote);
  return { action, remote };
}

export async function pull() {
  const t = await token();
  const rows = await api(`/rest/v1/ashk_saves?select=rev,data&user_id=eq.${load().auth.uid}`, { token: t });
  if (!rows[0]) return null;
  const obj = JSON.parse(await gunzip(rows[0].data));
  const s = load(); s.rev = rows[0].rev; s.dirty = false; save(s);
  return obj; // { st, acc }
}

// 올리기: 바뀐 경우만, 10분 간격(강제 시 무시)
export async function push(st, acc, { force = false, keepalive = false } = {}) {
  if (!enabled() || !loggedIn()) return "off";
  const s = load();
  if (!s.dirty && !force) return "unchanged";
  if (!force && s.lastPush && Date.now() - s.lastPush < SYNC_EVERY_MS) return "throttled";
  const data = await gzip(JSON.stringify({ st, acc }));
  if (data.length > MAX_BYTES) return "too_big";
  const t = await token();
  const next = (s.rev || 0) + 1;
  await api("/rest/v1/rpc/ashk_save_push", { method: "POST", token: t, keepalive, body: { p_rev: next, p_data: data, p_device: deviceName(), p_day: Math.floor(st.time.min / 1440) + 1, p_chapter: st.story.chapter, p_level: st.player.level } });
  s.rev = next; s.dirty = false; s.lastPush = Date.now(); save(s);
  return "pushed";
}

export function deviceName() {
  const ua = navigator.userAgent;
  return /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows PC" : "기기";
}

// 충돌 해결: "이 기기 것으로" → 서버 리비전 위에 덮어쓰기 / "다른 기기 것으로" → pull()
export async function keepLocal(st, acc, remoteRev) {
  const s = load(); s.rev = remoteRev; s.dirty = true; s.lastPush = 0; save(s);
  return push(st, acc, { force: true });
}
