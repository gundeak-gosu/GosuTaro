const { isConfigured, supabaseRest, hashPassword, verifyPassword, buildSessionBundle } = require("./_lib/supabase");

const MAX_BODY_BYTES = 4_000;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 8; // 무차별 대입 방지

const buckets = new Map();

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
    body: JSON.stringify(body),
  };
}

function clientIp(event) {
  return (
    event.headers["x-nf-client-connection-ip"] ||
    event.headers["client-ip"] ||
    event.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function rateLimited(ip) {
  const now = Date.now();
  const bucket = buckets.get(ip) || { count: 0, resetAt: now + WINDOW_MS };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + WINDOW_MS;
  }
  bucket.count += 1;
  buckets.set(ip, bucket);
  return bucket.count > MAX_REQUESTS_PER_WINDOW;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "POST 요청만 허용됩니다." });
  }
  if (!isConfigured()) {
    return json(500, { error: "서버에 Supabase 설정이 되어 있지 않습니다." });
  }
  if (rateLimited(clientIp(event))) {
    return json(429, { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." });
  }
  if (!event.body || event.body.length > MAX_BODY_BYTES) {
    return json(400, { error: "요청이 너무 큽니다." });
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return json(400, { error: "올바르지 않은 요청입니다." });
  }

  const action = payload.action === "signup" ? "signup" : "login";
  const email = String(payload.email || "").trim().toLowerCase().slice(0, 200);
  const password = String(payload.password || "");
  if (!email || !password) return json(400, { error: "이메일과 비밀번호를 입력해주세요." });

  try {
    const existing = await supabaseRest(
      `users?provider=eq.email&provider_user_id=eq.${encodeURIComponent(email)}&select=*`
    );
    const user = existing && existing[0];

    if (action === "signup") {
      if (user) return json(409, { error: "이미 가입된 이메일이에요." });
      if (password.length < 6) return json(400, { error: "비밀번호는 6자 이상이어야 해요." });

      const name = String(payload.name || "").trim().slice(0, 80) || email.split("@")[0];
      const sign = String(payload.sign || "").slice(0, 40);
      const birth = String(payload.birth || "").slice(0, 20);
      const { hash, salt } = await hashPassword(password);

      const [created] = await supabaseRest("users", {
        method: "POST",
        body: JSON.stringify({
          provider: "email",
          provider_user_id: email,
          name,
          email,
          sign,
          birth,
          password_hash: hash,
          password_salt: salt,
        }),
      });
      const bundle = await buildSessionBundle(created);
      return json(200, bundle);
    }

    // action === "login"
    if (!user) return json(404, { error: "가입된 계정을 찾을 수 없어요." });
    const ok = await verifyPassword(password, user.password_salt, user.password_hash);
    if (!ok) return json(401, { error: "비밀번호가 올바르지 않아요." });

    const bundle = await buildSessionBundle(user);
    return json(200, bundle);
  } catch (error) {
    console.error("Email auth error", error.message);
    return json(502, { error: "로그인 처리에 실패했습니다." });
  }
};
