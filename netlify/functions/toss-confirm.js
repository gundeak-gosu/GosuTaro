const TOSS_CONFIRM_URL = "https://api.tosspayments.com/v1/payments/confirm";
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

function parsePayload(event) {
  if (!event.body || event.body.length > MAX_BODY_BYTES) {
    throw new Error("요청이 너무 큽니다.");
  }
  const payload = JSON.parse(event.body);
  const paymentKey = String(payload.paymentKey || "").slice(0, 200);
  const orderId = String(payload.orderId || "").slice(0, 200);
  const amount = Number(payload.amount);

  if (!paymentKey || !orderId || !Number.isFinite(amount) || amount <= 0) {
    throw new Error("결제 정보가 올바르지 않습니다.");
  }
  return { paymentKey, orderId, amount };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "POST 요청만 허용됩니다." });
  }

  if (!process.env.TOSS_SECRET_KEY) {
    return json(500, { error: "TossPayments 시크릿 키가 서버에 설정되지 않았습니다." });
  }

  let payload;
  try {
    payload = parsePayload(event);
  } catch {
    return json(400, { error: "올바르지 않은 요청입니다." });
  }

  const basicAuth = Buffer.from(`${process.env.TOSS_SECRET_KEY}:`).toString("base64");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(TOSS_CONFIRM_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Basic ${basicAuth}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("Toss confirm error", response.status, data.message || data);
      return json(502, { error: data.message || "결제 승인에 실패했습니다." });
    }

    return json(200, { ok: true, method: data.method, approvedAt: data.approvedAt });
  } catch (error) {
    console.error("Toss confirm function error", error.name || error.message);
    return json(502, { error: "결제 승인 요청을 처리하지 못했습니다." });
  } finally {
    clearTimeout(timeout);
  }
};
