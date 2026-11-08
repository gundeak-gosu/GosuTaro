// OpenAI(챗GPT 이미지 모델)로 캐릭터 시트를 만든다 — 유하린 시트를 '화풍·배치 참고'로 넣는다.
// 키: 환경의 네트워크 비밀값(api.openai.com)으로 프록시가 넣어 준다. 코드·저장소에 키를 넣지 않는다.
// 사용: NODE_USE_ENV_PROXY=1 node tools/gen-openai.mjs <id> "<캐릭터 설명>"  → assets/heroines/<id>/sheet_src.png
//       그다음 python3 tools/slice-sheet.py assets/heroines/<id>/sheet_src.png assets/heroines/<id>/
import fs from "fs";
const [id, desc] = process.argv.slice(2);
if (!id || !desc) { console.error('사용: node tools/gen-openai.mjs <id> "<설명>"'); process.exit(1); }
const ref = fs.readFileSync(new URL("../assets/heroines/harin/sheet_src.png", import.meta.url));
const prompt = `Create a game character reference sheet in exactly the same art style, color grading and layout as the reference image ` +
  `(post-apocalyptic ruined city background; top-left name + profile table; "기본 의상" front/side/back turnaround; "다양한 의상 예시" row of 6 outfits; ` +
  `"표정 예시" row of 7 facial expressions: smile, joyful laugh, surprised, worried, shy, angry, sleepy; "게임 내 SD (2등신)" row of 7 chibi poses: idle, happy with hearts, cheering, shooting a rifle, walking with a backpack, sitting by a campfire, sleeping with zz). ` +
  `Keep every panel in the same position as the reference so it can be sliced automatically. Korean labels. Adult character (20+), tasteful, not explicit. Character: ${desc}`;
const form = new FormData();
form.append("model", "gpt-image-1");
form.append("prompt", prompt);
form.append("size", "1536x1024");
form.append("quality", "high");
form.append("image[]", new Blob([ref], { type: "image/png" }), "reference.png");
const r = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: "Bearer " + (process.env.OPENAI_API_KEY || "proxy-injects-key") }, body: form });
const j = await r.json();
if (!r.ok) { console.error("OpenAI 오류:", r.status, JSON.stringify(j).slice(0, 400)); process.exit(1); }
const dir = new URL(`../assets/heroines/${id}/`, import.meta.url);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(new URL("sheet_src.png", dir), Buffer.from(j.data[0].b64_json, "base64"));
console.log("저장:", new URL("sheet_src.png", dir).pathname, "· 사용량:", JSON.stringify(j.usage || {}));
