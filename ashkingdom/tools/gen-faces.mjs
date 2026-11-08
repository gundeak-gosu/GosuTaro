// 캐릭터 시트를 참고해 '7가지 표정 얼굴(가슴 위 초상)을 초록 배경 한 줄로 만든다 — 시트 자동 자르기가 틀릴 때 쓴다
// 사용: NODE_USE_ENV_PROXY=1 OPENAI_API_KEY=proxy-injected node tools/gen-faces.mjs <id>
import fs from "fs";
const id = process.argv[2], outfit = process.argv[3] || "";
const dir = new URL(`../assets/heroines/${id}/`, import.meta.url);
const ref = fs.readFileSync(new URL("sheet_src.png", dir));
const form = new FormData();
form.append("model", process.env.OPENAI_IMAGE_MODEL || "gpt-image-2");
form.append("prompt", `Using the character from the reference sheet, draw exactly 7 bust portraits (head and shoulders) of the SAME character in ONE horizontal row, evenly spaced with clear green gaps between them, all the same size, facing the viewer. Expressions in order: 1 gentle smile, 2 joyful laugh, 3 surprised, 4 worried, 5 shy blushing, 6 angry, 7 sleepy. Same art style, face, hair and outfit as the reference (the detailed anime illustration style of the expression panels). Modest, fully covered clothing with a high neckline (no cleavage, no bare chest). ${outfit} Leave at least 30 pixels of green gap between neighbouring portraits. Flat solid pure green chroma-key background (#00FF00) everywhere behind and between the portraits, no gradient, no frames, no text, no labels.`);
form.append("size", "1536x1024");
form.append("quality", process.env.QUALITY || "medium");
form.append("output_format", "png");
form.append("stream", "true");
form.append("partial_images", "3");
form.append("image[]", new Blob([ref], { type: "image/png" }), "sheet.png");
const r = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: "Bearer " + (process.env.OPENAI_API_KEY || "x") }, body: form });
const text = await r.text();
let b64 = null, err = null;
for (const line of text.split("\n")) { if (!line.startsWith("data:")) continue; const d = JSON.parse(line.slice(5)); if (d.type?.endsWith(".completed")) b64 = d.b64_json; if (d.type === "error") err = d.error; }
if (!b64) { console.error("OpenAI 오류:", r.status, JSON.stringify(err || text.slice(0, 300))); process.exit(1); }
fs.writeFileSync(new URL("face_row.png", dir), Buffer.from(b64, "base64"));
console.log("저장:", new URL("face_row.png", dir).pathname);
