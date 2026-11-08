// assets/{items,objects,mobs,tiles} 폴더를 읽어 js/art-manifest.js 를 만든다(어떤 그림이 있는지 게임이 알 수 있게)
// 사용: node tools/art-manifest.mjs
import fs from "fs";
const dirs = ["items", "objects", "mobs", "tiles"];
const out = {};
for (const d of dirs) out[d] = fs.readdirSync(new URL(`../assets/${d}/`, import.meta.url)).filter((f) => f.endsWith(".webp")).map((f) => f.slice(0, -5)).sort();
fs.writeFileSync(new URL("../js/art-manifest.js", import.meta.url), "// 자동 생성: node tools/art-manifest.mjs\nexport const ART = " + JSON.stringify(out) + ";\n");
console.log(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])));
