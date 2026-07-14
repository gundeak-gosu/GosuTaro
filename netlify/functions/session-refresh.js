const { isConfigured, resolveSession, supabaseRest, getProgress, getRecentJournal } = require("./_lib/supabase");

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
  if (event.httpMethod !== "GET") return json(405, { error: "GET 요청만 허용됩니다." });
  if (!isConfigured()) return json(500, { error: "서버에 Supabase 설정이 되어 있지 않습니다." });

  const userId = await resolveSession(event.headers.authorization).catch(() => null);
  if (!userId) return json(401, { error: "로그인이 필요합니다." });

  try {
    const [rows, progress, journal] = await Promise.all([
      supabaseRest(`users?id=eq.${userId}&select=name,email,sign,birth,provider`),
      getProgress(userId),
      getRecentJournal(userId),
    ]);
    const user = rows && rows[0];
    if (!user) return json(404, { error: "계정을 찾을 수 없습니다." });

    return json(200, {
      user: { name: user.name, email: user.email, sign: user.sign, birth: user.birth, loginType: user.provider },
      progress,
      journal,
    });
  } catch (error) {
    console.error("session-refresh error", error.message);
    return json(502, { error: "동기화에 실패했습니다." });
  }
};
