// 저장: 로컬(localStorage) 전용. 서버에는 세이브를 올리지 않는다.
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

// ---------- 세이브 슬롯 8개 ----------
// 1번 슬롯은 예전 키를 그대로 써서 기존 저장이 사라지지 않는다. 나머지는 키 뒤에 _s번호.
export const SLOT_COUNT = 8;
const KEY_SLOT = "ashk_slot";
const slotKey = (n) => (n === 0 ? KEY_SAVE : `${KEY_SAVE}_s${n}`);
export function activeSlot() { const n = parseInt(safeGet(KEY_SLOT) ?? "0", 10); return n >= 0 && n < SLOT_COUNT ? n : 0; }
export function setSlot(n) { safeSet(KEY_SLOT, String(n)); }
export function loadSlot(n) { return unpack(safeGet(slotKey(n))); }
export function deleteSlot(n) { safeDel(slotKey(n)); }
// 타이틀 화면용 요약(본문 전체를 펼치지 않고 필요한 것만)
export function listSlots() { return Array.from({ length: SLOT_COUNT }, (_, n) => { const d = loadSlot(n); return d ? { n, d } : { n, d: null }; }); }

export function loadGame() { return loadSlot(activeSlot()); }
export function saveGame(st) { st.lastSaved = Date.now(); return safeSet(slotKey(activeSlot()), pack(st)); }
export function deleteGame() { deleteSlot(activeSlot()); }

// 내보내기/가져오기(기기 변경용 — 서버 없이도 이전 가능)
export function exportAll(st, acc) { return btoa(unescape(encodeURIComponent(pack({ st, acc })))); }
export function importAll(code) {
  const o = unpack(decodeURIComponent(escape(atob(code.trim()))));
  if (!o || !o.acc) return null;
  return o;
}

// 서버 세이브 없음(의도된 설계): 서버는 랭킹 기록 한 줄만 받는다(js/net.js).
// 기기 변경은 위의 저장 코드(exportAll/importAll)로 한다 → 서버 저장·전송 비용 0.
