const crypto = require("crypto");

const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90일

function baseUrl() {
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error("SUPABASE_URL이 설정되지 않았습니다.");
  return url.replace(/\/+$/, "");
}

function serviceKey() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.");
  return key;
}

function isConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Supabase PostgREST 호출 래퍼. service_role 키로만 호출하며,
 * 이 함수는 반드시 서버(Netlify Function)에서만 사용한다 — 클라이언트에 노출 금지.
 */
async function supabaseRest(path, opts = {}) {
  const key = serviceKey();
  const res = await fetch(`${baseUrl()}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      prefer: opts.prefer || "return=representation",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(`Supabase REST error ${res.status}: ${JSON.stringify(data)}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt);
  return { hash, salt };
}

async function verifyPassword(password, salt, expectedHash) {
  const hash = await scrypt(password, salt);
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(expectedHash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function scrypt(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, buf) => {
      if (err) reject(err);
      else resolve(buf.toString("hex"));
    });
  });
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await supabaseRest("sessions", {
    method: "POST",
    prefer: "return=minimal",
    body: JSON.stringify({ token, user_id: userId, expires_at: expiresAt }),
  });
  return token;
}

/** Authorization: Bearer <token> 헤더 값에서 user_id를 찾는다. 유효하지 않으면 null. */
async function resolveSession(authHeader) {
  const token = (authHeader || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const rows = await supabaseRest(
    `sessions?token=eq.${encodeURIComponent(token)}&select=user_id,expires_at`
  );
  const row = rows && rows[0];
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return row.user_id;
}

async function deleteSession(authHeader) {
  const token = (authHeader || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return;
  await supabaseRest(`sessions?token=eq.${encodeURIComponent(token)}`, {
    method: "DELETE",
    prefer: "return=minimal",
  });
}

async function getProgress(userId) {
  const rows = await supabaseRest(`progress?user_id=eq.${userId}&select=*`);
  return (rows && rows[0]) || null;
}

async function getRecentJournal(userId, limit = 50) {
  return supabaseRest(
    `journal_entries?user_id=eq.${userId}&select=*&order=created_at.desc&limit=${limit}`
  );
}

/** 세션 발급 + progress/journal 조회를 묶어서 반환 (로그인/가입 공통 마무리) */
async function buildSessionBundle(user) {
  const existingProgress = await getProgress(user.id);
  if (!existingProgress) {
    await supabaseRest("progress", {
      method: "POST",
      prefer: "return=minimal",
      body: JSON.stringify({ user_id: user.id }),
    });
  }

  const token = await createSession(user.id);
  const [progress, journal] = await Promise.all([getProgress(user.id), getRecentJournal(user.id)]);

  return {
    token,
    user: { name: user.name, email: user.email, sign: user.sign, birth: user.birth, loginType: user.provider },
    progress,
    journal,
  };
}

/**
 * 소셜 로그인 등 "있으면 갱신, 없으면 생성"이 필요한 경우의 전체 흐름.
 * profile: {name, email, sign, birth, passwordHash, passwordSalt}
 */
async function finalizeLogin(provider, providerUserId, profile) {
  const [user] = await supabaseRest("users?on_conflict=provider,provider_user_id", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: JSON.stringify({
      provider,
      provider_user_id: providerUserId,
      name: profile.name || "",
      email: profile.email || "",
      sign: profile.sign || "",
      birth: profile.birth || "",
      ...(profile.passwordHash ? { password_hash: profile.passwordHash, password_salt: profile.passwordSalt } : {}),
    }),
  });
  return buildSessionBundle(user);
}

module.exports = {
  isConfigured,
  supabaseRest,
  hashPassword,
  verifyPassword,
  createSession,
  resolveSession,
  deleteSession,
  buildSessionBundle,
  getProgress,
  getRecentJournal,
  finalizeLogin,
};
