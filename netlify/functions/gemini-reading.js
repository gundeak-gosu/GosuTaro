const MODEL = "gemini-flash-latest";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const MAX_BODY_BYTES = 12_000;
const MAX_QUESTION_CHARS = 400;
const MAX_CARDS = 10;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 8;

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

function cleanText(value, limit) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function parsePayload(event) {
  if (!event.body || event.body.length > MAX_BODY_BYTES) {
    throw new Error("요청이 너무 큽니다.");
  }

  const payload = JSON.parse(event.body);
  const question = cleanText(payload.question, MAX_QUESTION_CHARS);
  const spread = payload.spread || {};
  const cards = Array.isArray(payload.cards) ? payload.cards.slice(0, MAX_CARDS) : [];
  const user = payload.user || {};

  if (question.length < 2) throw new Error("질문이 비어 있습니다.");
  if (!cards.length) throw new Error("카드 정보가 없습니다.");

  return {
    question,
    spread: {
      name: cleanText(spread.name, 80) || "타로 스프레드",
      cards: Math.min(Number(spread.cards) || cards.length, MAX_CARDS),
    },
    cards: cards.map((card) => ({
      position: cleanText(card.position, 80),
      name: cleanText(card.name, 80),
      en: cleanText(card.en, 80),
      suit: cleanText(card.suit, 40),
      reversed: Boolean(card.reversed),
    })),
    user: {
      name: cleanText(user.name, 80),
      sign: cleanText(user.sign, 40),
      birth: cleanText(user.birth, 20),
    },
  };
}

function buildPrompt({ question, spread, cards, user }) {
  const userContext = [
    user.name ? `사용자 이름: ${user.name}` : "",
    user.sign ? `별자리: ${user.sign}` : "",
    user.birth ? `생년월일: ${user.birth}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const cardList = cards
    .map((card) => `- [${card.position}] ${card.name} (${card.en})${card.reversed ? " - 역방향" : ""}`)
    .join("\n");

  return `당신은 30년 경력의 타로 마스터입니다. 아래 정보를 바탕으로 한국어 타로 해석을 작성하세요.

${userContext ? `사용자 정보:\n${userContext}\n` : ""}질문:
"${question}"

스프레드: ${spread.name} (${spread.cards}장)

뽑힌 카드:
${cardList}

작성 지침:
1. 질문에 직접 답하고, 일반론보다 사용자의 상황에 맞춘 해석을 하세요.
2. 각 카드 위치의 의미와 카드 간 흐름을 연결하세요.
3. 역방향 카드가 있으면 반드시 반영하세요.
4. 따뜻하고 신비롭되 현실적인 조언을 주세요.
5. 의료, 법률, 투자, 안전 문제는 단정하지 말고 전문가 상담을 권하세요.
6. 총 700~1000자 정도로 작성하세요.
7. 마지막에 "타로가 전하는 조언" 제목으로 실천 조언 2~3가지를 쓰세요.`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "POST 요청만 허용됩니다." });
  }

  if (rateLimited(clientIp(event))) {
    return json(429, { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." });
  }

  if (!process.env.GEMINI_API_KEY) {
    return json(500, { error: "Gemini API 키가 서버에 설정되지 않았습니다." });
  }

  let payload;
  try {
    payload = parsePayload(event);
  } catch {
    return json(400, { error: "올바르지 않은 요청입니다." });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(GEMINI_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: buildPrompt(payload) }] }],
        generationConfig: {
          temperature: 0.8,
          topP: 0.9,
          maxOutputTokens: 3000,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("Gemini error", response.status, data.error?.message || data);
      return json(502, { error: "Gemini 해석 요청에 실패했습니다." });
    }

    const interpretation =
      data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim() || "";

    if (!interpretation) {
      return json(502, { error: "Gemini 응답이 비어 있습니다." });
    }

    return json(200, { interpretation });
  } catch (error) {
    console.error("Gemini function error", error.name || error.message);
    return json(502, { error: "AI 해석을 가져오지 못했습니다." });
  } finally {
    clearTimeout(timeout);
  }
};
