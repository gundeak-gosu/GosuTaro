const TOKEN_URL = "https://nid.naver.com/oauth2.0/token";
const PROFILE_URL = "https://openapi.naver.com/v1/nid/me";

function redirect(location) {
  return { statusCode: 302, headers: { Location: location }, body: "" };
}

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const { code, state, error } = params;

  if (error || !code) {
    return redirect("/?naverFail=1");
  }
  if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) {
    console.error("Naver auth: missing NAVER_CLIENT_ID/NAVER_CLIENT_SECRET env vars");
    return redirect("/?naverFail=1");
  }

  try {
    const tokenRes = await fetch(
      `${TOKEN_URL}?grant_type=authorization_code` +
        `&client_id=${encodeURIComponent(process.env.NAVER_CLIENT_ID)}` +
        `&client_secret=${encodeURIComponent(process.env.NAVER_CLIENT_SECRET)}` +
        `&code=${encodeURIComponent(code)}` +
        `&state=${encodeURIComponent(state || "")}`
    );
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("Naver token error", tokenData);
      return redirect("/?naverFail=1");
    }

    const profileRes = await fetch(PROFILE_URL, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profileData = await profileRes.json();
    if (!profileRes.ok || profileData.resultcode !== "00") {
      console.error("Naver profile error", profileData);
      return redirect("/?naverFail=1");
    }

    const info = profileData.response || {};
    const profile = { name: info.name || info.nickname || "네이버 사용자", email: info.email || "" };
    const encoded = encodeURIComponent(Buffer.from(JSON.stringify(profile)).toString("base64"));
    const stateParam = encodeURIComponent(state || "");

    return redirect(`/?naverProfile=${encoded}&naverState=${stateParam}`);
  } catch (err) {
    console.error("Naver auth error", err.name || err.message);
    return redirect("/?naverFail=1");
  }
};
