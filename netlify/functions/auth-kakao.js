const KAKAO_ME_URL = "https://kapi.kakao.com/v2/user/me";
const MAX_BODY_BYTES = 4_000;

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
  if (!event.body || event.body.length > MAX_BODY_BYTES) {
    return json(400, { error: "요청이 너무 큽니다." });
  }

  let accessToken;
  try {
    accessToken = String(JSON.parse(event.body).accessToken || "");
  } catch {
    return json(400, { error: "올바르지 않은 요청입니다." });
  }
  if (!accessToken) return json(400, { error: "accessToken이 없습니다." });

  try {
    // 카카오 access token은 opaque라서, 프로필 조회 자체가 토큰 검증을 겸한다 (실패하면 카카오가 401을 준다).
    const res = await fetch(KAKAO_ME_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) return json(401, { error: "카카오 토큰이 유효하지 않습니다." });

    const account = data.kakao_account || {};
    const name = (account.profile && account.profile.nickname) || "카카오 사용자";
    const email = account.email || "";

    return json(200, { name, email });
  } catch (error) {
    console.error("Kakao auth error", error.name || error.message);
    return json(502, { error: "카카오 로그인 확인에 실패했습니다." });
  }
};
