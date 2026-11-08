// OpenAI(gpt-image-2)로 '격자 시트' 한 장을 만든다 — 아이템 아이콘·필드 오브젝트·건물·지형 텍스처를 한 번에 같은 화풍으로.
// 사용: NODE_USE_ENV_PROXY=1 OPENAI_API_KEY=proxy-injected node tools/gen-grid.mjs <spec.json> <out.png>
//  spec: { cols, rows, kind: "icon"|"texture"|"object", items: ["설명", ...] (행 순서), extra?: "추가 지시" }
// 키는 환경의 네트워크 비밀값(api.openai.com)으로 프록시가 넣는다. 코드·저장소에 키를 넣지 않는다.
import fs from "fs";
const [specPath, out] = process.argv.slice(2);
const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
const { cols, rows, kind, items } = spec;
// 화풍(아트 바이블): 귀여운 2D 한국식 MMORPG/모바일 생존 RPG 느낌 + 핵전쟁 뒤 잿빛 세계
export const STYLE = "Cute hand-painted 2D game art in the style of classic Korean cartoon MMORPGs and cozy mobile survival RPGs: chunky rounded shapes, bold dark-brown outlines, soft cel shading with light from the top-left, bright saturated colors slightly dusted with ash and rust for a post-nuclear-apocalypse world. Original designs only, no logos, no text.";
const list = [];
for (let r = 0; r < rows; r++) list.push(`Row ${r + 1}: ` + items.slice(r * cols, r * cols + cols).map((s, i) => `(${i + 1}) ${s}`).join(", "));
let body;
if (kind === "texture") body = `A ${cols}x${rows} grid of square top-down ground texture swatches for a 2D top-down game map, each cell completely filled edge to edge with the texture (no borders, no gaps, no objects bigger than a pebble, no shadows from outside), evenly divided into equal square cells, seen straight from above, tileable-looking. ${STYLE}\n` + list.join("\n");
else body = `A sprite sheet: a ${cols}x${rows} grid of equal square cells; in each cell exactly ONE game ${kind === "object" ? "map object seen from a 3/4 top-down view" : "item icon, centered, filling about 75% of the cell, slight 3/4 view"}, nothing else in the cell. Keep the order exactly as listed, row by row, left to right. Flat solid pure green chroma-key background (#00FF00) everywhere, no grid lines, no cell borders, no shadows on the background, no text, no labels. ${STYLE}\n` + list.join("\n");
if (spec.extra) body += "\n" + spec.extra;
const req = { model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2", prompt: body, size: spec.size || "1024x1024", quality: process.env.QUALITY || "medium", output_format: "png", stream: true, partial_images: 3 };
const r = await fetch("https://api.openai.com/v1/images/generations", { method: "POST", headers: { Authorization: "Bearer " + (process.env.OPENAI_API_KEY || "x"), "Content-Type": "application/json" }, body: JSON.stringify(req) });
const text = await r.text();
let b64 = null, err = null;
for (const line of text.split("\n")) { if (!line.startsWith("data:")) continue; try { const d = JSON.parse(line.slice(5)); if (d.type?.endsWith(".completed")) b64 = d.b64_json; if (d.type === "error") err = d.error; } catch {} }
if (!b64) { console.error("OpenAI 오류:", r.status, JSON.stringify(err || text.slice(0, 300))); process.exit(1); }
fs.writeFileSync(out, Buffer.from(b64, "base64"));
console.log("저장:", out);
