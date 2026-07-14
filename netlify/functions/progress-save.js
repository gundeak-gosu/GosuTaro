const { isConfigured, resolveSession, supabaseRest } = require("./_lib/supabase");

const MAX_BODY_BYTES = 2_000;

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
  if (event.httpMethod !== "PUT" && event.httpMethod !== "POST") {
    return json(405, { error: "PUT 요청만 허용됩니다." });
  }
  if (!isConfigured()) return json(500, { error: "서버에 Supabase 설정이 되어 있지 않습니다." });
  if (!event.body || event.body.length > MAX_BODY_BYTES) return json(400, { error: "요청이 너무 큽니다." });

  const userId = await resolveSession(event.headers.authorization).catch(() => null);
  if (!userId) return json(401, { error: "로그인이 필요합니다." });

  let p;
  try {
    p = JSON.parse(event.body);
  } catch {
    return json(400, { error: "올바르지 않은 요청입니다." });
  }

  try {
    await supabaseRest(`progress?user_id=eq.${userId}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify({
        streak: Number(p.streak) || 1,
        total_readings: Number(p.totalReadings) || 0,
        today_read: Boolean(p.todayRead),
        today_date: String(p.todayDate || "").slice(0, 40),
        today_card_key: p.todayCardKey ? String(p.todayCardKey).slice(0, 80) : null,
        free_used: Number(p.freeUsed) || 0,
        premium: Boolean(p.premium),
      }),
    });
    return json(200, { ok: true });
  } catch (error) {
    console.error("progress-save error", error.message);
    return json(502, { error: "저장에 실패했습니다." });
  }
};
