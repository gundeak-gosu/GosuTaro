const TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";
const MAX_BODY_BYTES = 8_000;

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

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "POST 요청만 허용됩니다." });
  }
  if (!process.env.GOOGLE_CLIENT_ID) {
    return json(500, { error: "Google 클라이언트 ID가 서버에 설정되지 않았습니다." });
  }
  if (!event.body || event.body.length > MAX_BODY_BYTES) {
    return json(400, { error: "요청이 너무 큽니다." });
  }

  let credential;
  try {
    credential = String(JSON.parse(event.body).credential || "");
  } catch {
    return json(400, { error: "올바르지 않은 요청입니다." });
  }
  if (!credential) return json(400, { error: "credential이 없습니다." });

  try {
    // Google의 tokeninfo 엔드포인트가 서명·만료를 검증해준다 — 별도 JWT 라이브러리 불필요.
    const res = await fetch(`${TOKENINFO_URL}?id_token=${encodeURIComponent(credential)}`);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) return json(401, { error: "Google 토큰이 유효하지 않습니다." });
    if (data.aud !== process.env.GOOGLE_CLIENT_ID) return json(401, { error: "Google 클라이언트 ID가 일치하지 않습니다." });

    return json(200, { name: data.name || data.email || "구글 사용자", email: data.email || "" });
  } catch (error) {
    console.error("Google auth error", error.name || error.message);
    return json(502, { error: "Google 로그인 확인에 실패했습니다." });
  }
};
