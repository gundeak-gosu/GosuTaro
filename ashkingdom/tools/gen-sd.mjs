// 캐릭터 시트를 참고해 'SD(2등신) 7포즈'를 투명 배경으로 만든다(머리카락이 배경과 섞여 잘리는 문제 없음)
// 사용: NODE_USE_ENV_PROXY=1 OPENAI_API_KEY=proxy-injected node tools/gen-sd.mjs <id>
import fs from "fs";
const id = process.argv[2];
const dir = new URL(`../assets/heroines/${id}/`, import.meta.url);
const ref = fs.readFileSync(new URL("sheet_src.png", dir));
const form = new FormData();
form.append("model", process.env.OPENAI_IMAGE_MODEL || "gpt-image-2");
form.append("prompt", "Using the chibi SD (2-head-tall) character from the reference sheet, draw exactly 7 full-body chibi poses of the SAME character in ONE horizontal row, evenly spaced with clear gaps, all the same height, feet on the same baseline, facing right three-quarter view. Poses in order: 1 idle standing, 2 happy waving with small hearts, 3 cheering fist up, 4 shooting a rifle with muzzle flash, 5 walking with a big backpack, 6 sitting by a small campfire, 7 sleeping curled up with zz. Same art style and colors as the reference. Flat solid pure green chroma-key background (#00FF00) everywhere behind the characters, no gradient, no shadows on the background, no text, no labels, no panels.");
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
fs.writeFileSync(new URL("sd_row.png", dir), Buffer.from(b64, "base64"));
console.log("저장:", new URL("sd_row.png", dir).pathname);
