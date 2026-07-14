const { isConfigured, resolveSession, supabaseRest } = require("./_lib/supabase");

const MAX_BODY_BYTES = 20_000;

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
  if (!isConfigured()) return json(500, { error: "서버에 Supabase 설정이 되어 있지 않습니다." });
  if (!event.body || event.body.length > MAX_BODY_BYTES) return json(400, { error: "요청이 너무 큽니다." });

  const userId = await resolveSession(event.headers.authorization).catch(() => null);
  if (!userId) return json(401, { error: "로그인이 필요합니다." });

  let entry;
  try {
    entry = JSON.parse(event.body);
  } catch {
    return json(400, { error: "올바르지 않은 요청입니다." });
  }

  try {
    await supabaseRest("journal_entries", {
      method: "POST",
      prefer: "return=minimal",
      body: JSON.stringify({
        user_id: userId,
        question: String(entry.question || "").slice(0, 500),
        spread_name: String(entry.spreadName || "").slice(0, 80),
        spread_icon: String(entry.spreadIcon || "").slice(0, 10),
        spread_pos: entry.spreadPos || null,
        cards: entry.cards || null,
        interpretation: String(entry.interpretation || "").slice(0, 8000),
      }),
    });
    return json(200, { ok: true });
  } catch (error) {
    console.error("journal-add error", error.message);
    return json(502, { error: "저장에 실패했습니다." });
  }
};
