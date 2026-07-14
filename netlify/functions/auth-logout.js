const { isConfigured, deleteSession } = require("./_lib/supabase");

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
  if (event.httpMethod !== "POST") return json(405, { error: "POST 요청만 허용됩니다." });
  if (!isConfigured()) return json(200, { ok: true }); // 설정 안 됐으면 할 일 없음(로컬 세션만 존재)

  try {
    await deleteSession(event.headers.authorization);
    return json(200, { ok: true });
  } catch (error) {
    console.error("auth-logout error", error.message);
    return json(200, { ok: true }); // 로그아웃은 실패해도 클라이언트 쪽 세션은 어차피 지운다
  }
};
