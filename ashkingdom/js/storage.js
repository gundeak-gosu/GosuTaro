// 저장: 로컬(localStorage) 우선 + 선택적 클라우드 백업(Netlify Function → Supabase).
// 월드는 시드로 재생성되므로 저장 데이터는 보통 10~30KB 수준 → 서버 비용 거의 0.
import { VERSION } from "./data.js";
import { newAccount } from "./systems.js";
import { hashStr } from "./rng.js";

const KEY_SAVE = "ashk_save_v1";
const KEY_ACC = "ashk_account_v1";

function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } }
function safeDel(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } }

// 가벼운 무결성 체크(완벽한 보안 아님 — 경쟁 콘텐츠는 서버 검증이 원칙)
function sign(json) { return hashStr("ashk|" + json + "|" + json.length).toString(36); }

function pack(obj) { const j = JSON.stringify(obj); return JSON.stringify({ v: VERSION, j, s: sign(j) }); }
function unpack(raw) {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    if (!o || typeof o.j !== "string") return null;
    const data = JSON.parse(o.j);
    data.__tampered = sign(o.j) !== o.s;
    return migrate(data);
  } catch { return null; }
}

function migrate(d) {
  // 버전별 마이그레이션 자리 — 필드가 추가되면 여기서 기본값을 채운다
  if (!d.v) d.v = 1;
  return d;
}

export function loadAccount() {
  const a = unpack(safeGet(KEY_ACC));
  const base = newAccount();
  if (!a) return base;
  return { ...base, ...a, ads: { ...base.ads, ...(a.ads || {}) }, olympics: { ...base.olympics, ...(a.olympics || {}) } };
}
export function saveAccount(acc) { return safeSet(KEY_ACC, pack(acc)); }

export function loadGame() { return unpack(safeGet(KEY_SAVE)); }
export function saveGame(st) { st.lastSaved = Date.now(); return safeSet(KEY_SAVE, pack(st)); }
export function deleteGame() { safeDel(KEY_SAVE); }

// 내보내기/가져오기(기기 변경용 — 서버 없이도 이전 가능)
export function exportAll(st, acc) { return btoa(unescape(encodeURIComponent(pack({ st, acc })))); }
export function importAll(code) {
  const o = unpack(decodeURIComponent(escape(atob(code.trim()))));
  if (!o || !o.acc) return null;
  return o;
}

// 클라우드 백업(선택) — 서버가 설정돼 있지 않으면 조용히 실패
export async function cloudBackup(st, acc, token) {
  try {
    const res = await fetch("/.netlify/functions/ashkingdom-save", {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: token ? `Bearer ${token}` : "" },
      body: JSON.stringify({ save: pack({ st, acc }) }),
    });
    return res.ok;
  } catch { return false; }
}
