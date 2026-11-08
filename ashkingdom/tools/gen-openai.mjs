// OpenAI(챗GPT 이미지 모델)로 캐릭터 시트를 만든다 — 유하린 시트를 '화풍·배치 참고'로 넣는다.
// 키: 환경의 네트워크 비밀값(api.openai.com)으로 프록시가 넣어 준다. 코드·저장소에 키를 넣지 않는다.
// 사용: NODE_USE_ENV_PROXY=1 node tools/gen-openai.mjs <id> "<캐릭터 설명>"  → assets/heroines/<id>/sheet_src.png
//       그다음 python3 tools/slice-sheet.py assets/heroines/<id>/sheet_src.png assets/heroines/<id>/
import fs from "fs";
const [id, desc] = process.argv.slice(2);
if (!id || !desc) { console.error('사용: node tools/gen-openai.mjs <id> "<설명>"'); process.exit(1); }
// 참고 이미지는 '안전한 부분만' 남긴 판(OpenAI 안전 필터가 노출 많은 원본을 막는다). REF=파일로 바꿀 수 있다
const ref = fs.readFileSync(process.env.REF || new URL("../assets/heroines/style_ref_safe.jpg", import.meta.url));
const prompt = `Create a game character reference sheet in exactly the same art style, color grading and layout as the reference image ` +
  `(post-apocalyptic ruined city background; top-left name + profile table; "기본 의상" front/side/back turnaround; "다양한 의상 예시" row of 6 outfits; ` +
  `"표정 예시" row of 7 facial expressions: smile, joyful laugh, surprised, worried, shy, angry, sleepy; "게임 내 SD (2등신)" row of 7 chibi poses: idle, happy with hearts, cheering, shooting a rifle, walking with a backpack, sitting by a campfire, sleeping with zz). ` +
  `Keep every panel in the same position as the reference so it can be sliced automatically. Korean labels. Adult character (20+), tasteful, not explicit. Character: ${desc}`;
const form = new FormData();
form.append("model", process.env.OPENAI_IMAGE_MODEL || "gpt-image-2"); // 챗GPT 이미지 모델(계정에서 쓸 수 있는 최신)
form.append("prompt", prompt);
form.append("size", "1536x1024");
form.append("quality", process.env.QUALITY || "medium");
// 스트리밍: 중간 그림을 보내 연결을 살려 둔다(프록시는 30초 동안 조용하면 끊는다)
form.append("stream", "true");
form.append("partial_images", "3");
form.append("image[]", new Blob([ref], { type: "image/jpeg" }), "reference.jpg");
const r = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: "Bearer " + (process.env.OPENAI_API_KEY || "proxy-injects-key") }, body: form });
const text = await r.text();
let j = null, err = null;
for (const line of text.split("\n")) {
  if (!line.startsWith("data:")) continue;
  const d = JSON.parse(line.slice(5));
  if (d.type?.endsWith(".completed")) j = { data: [{ b64_json: d.b64_json }], usage: d.usage };
  if (d.type === "error") err = d.error;
}
if (!j) { console.error("OpenAI 오류:", r.status, JSON.stringify(err || text.slice(0, 300))); process.exit(1); }
const dir = new URL(`../assets/heroines/${id}/`, import.meta.url);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(new URL("sheet_src.png", dir), Buffer.from(j.data[0].b64_json, "base64"));
console.log("저장:", new URL("sheet_src.png", dir).pathname, "· 사용량:", JSON.stringify(j.usage || {}));
