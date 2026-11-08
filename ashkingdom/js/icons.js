// =====================================================================
// 잿빛 왕국 아이콘 세트 — 이모지 대신 쓰는 일관된 톤의 게임 아이콘
// 규칙(아트 바이블):
//  - 64×64 뷰박스, 모든 도형에 같은 외곽선(#1d1712, 3px, 둥근 이음)
//  - 팔레트 12색(아래 P)만 사용: 바랜 흙·녹·쇠·잿빛 + 포인트(호박색·핏빛·방사능 녹색)
//  - 빛은 항상 왼쪽 위 → 각 도형 왼쪽 위에 같은 하이라이트, 오른쪽 아래 같은 그림자
//  - 바닥에 같은 타원 그림자
// =====================================================================
import { iconSrc } from "./art.js";
const P = {
  ink: "#1d1712", bone: "#e6dcc6", sand: "#c9b48a", wood: "#8a6340", woodD: "#5e4128", rust: "#a4552f",
  iron: "#8f969b", ironD: "#5b6166", ash: "#6e6a62", leaf: "#6f8f3e", leafD: "#4c6a2b", amber: "#e0a24a",
  blood: "#a8322b", water: "#4f8fb0", rad: "#9fdc3a", cloth: "#a39276", red: "#c0392b", gold: "#d9b04a", meat: "#c56a5a", skin: "#d9a982",
};

// 도형 헬퍼 — 모든 도형에 공통 외곽선/채색 규칙 적용
const st = `stroke="${P.ink}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;
const R = (x, y, w, h, c, r = 3, extra = "") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${c}" ${st} ${extra}/>`;
const C = (x, y, r, c) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" ${st}/>`;
const E = (x, y, rx, ry, c, rot = 0) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${c}" ${st} transform="rotate(${rot} ${x} ${y})"/>`;
const Pth = (d, c) => `<path d="${d}" fill="${c}" ${st}/>`;
const L = (d, w = 3, c = P.ink) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const HL = (d) => `<path d="${d}" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="2.5" stroke-linecap="round"/>`; // 하이라이트
const rot = (deg, inner) => `<g transform="rotate(${deg} 32 32)">${inner}</g>`;

// ---------- 아이콘 정의 ----------
const D = {
  // 재료
  wood: rot(-20, R(10, 22, 44, 12, P.wood, 6) + E(54, 28, 4, 6, P.sand) + R(14, 34, 38, 11, P.woodD, 5) + HL("M16 25 H44")),
  stone: Pth("M12 44 L16 26 L30 18 L46 22 L54 38 L46 48 L22 50 Z", P.ash) + Pth("M30 18 L34 32 L54 38", "none") + HL("M18 28 L28 22"),
  fiber: L("M22 52 C20 36 26 22 34 12", 4, P.leafD) + L("M30 52 C30 36 34 24 44 14", 4, P.leaf) + L("M38 52 C40 40 46 30 52 24", 4, P.leafD),
  scrap: Pth("M14 40 L22 22 L40 18 L50 30 L44 46 L24 50 Z", P.iron) + C(30, 34, 6, P.ironD) + L("M22 22 L30 34 L50 30", 2) + HL("M18 36 L24 24"),
  cloth: R(12, 18, 40, 28, P.cloth, 6) + L("M18 26 H46 M18 32 H46 M18 38 H40", 2, P.woodD) + HL("M16 22 H34"),
  leather: Pth("M14 20 Q32 12 50 20 L54 34 Q48 50 32 52 Q16 50 10 34 Z", "#8a5a36") + HL("M18 24 Q28 18 38 20"),
  bone: rot(30, C(16, 28, 5, P.bone) + C(16, 36, 5, P.bone) + C(48, 28, 5, P.bone) + C(48, 36, 5, P.bone) + R(16, 28, 32, 8, P.bone, 3)),
  herb: L("M32 54 V30", 3) + E(24, 30, 8, 13, P.leaf, -30) + E(40, 26, 8, 13, P.leaf, 30) + E(32, 18, 6, 10, P.leafD),
  salt: R(18, 22, 28, 30, P.bone, 6) + R(22, 14, 20, 8, P.iron, 2) + C(28, 18, 1, P.ink) + C(36, 18, 1, P.ink),
  fuel: R(16, 12, 32, 42, P.red, 5) + L("M16 24 H48 M16 42 H48", 3) + R(36, 8, 8, 6, P.iron, 1) + HL("M20 16 V50"),
  electronics: R(12, 16, 40, 32, P.leafD, 3) + R(24, 24, 16, 16, P.ink, 2) + L("M18 22 H22 M18 42 H22 M42 22 H46 M42 42 H46", 2, P.gold),
  gunpowder: Pth("M20 24 Q32 10 44 24 L48 50 Q32 56 16 50 Z", P.ash) + L("M32 14 Q36 8 40 10", 2, P.amber) + C(42, 9, 2.5, P.amber),
  iron: Pth("M10 42 L18 26 H46 L54 42 Z", P.iron) + Pth("M18 26 L22 18 H42 L46 26", P.bone) + HL("M20 30 H40"),
  seed: E(24, 34, 7, 10, "#b88a4a", -20) + E(40, 30, 7, 10, "#a07a3a", 20) + E(32, 44, 6, 8, "#c89a5a"),
  fertilizer: Pth("M10 48 Q20 30 32 34 Q44 28 54 48 Z", "#6a4a2a") + C(24, 40, 2, P.leaf) + C(40, 42, 2, P.leaf),
  ammo: [0, 1, 2].map((i) => R(18 + i * 10, 22, 8, 26, P.gold, 2) + Pth(`M${18 + i * 10} 22 Q${22 + i * 10} 10 ${26 + i * 10} 22 Z`, P.rust)).join(""),
  arrow: rot(-40, L("M10 32 H50", 4, P.wood) + Pth("M50 26 L60 32 L50 38 Z", P.iron) + Pth("M10 26 L18 32 L10 38 L6 32 Z", P.blood)),
  rotten_food: Pth("M14 46 Q16 28 32 26 Q48 28 50 46 Z", "#6a7a3a") + C(26, 36, 3, "#4a5a2a") + C(38, 40, 2.5, "#4a5a2a") + L("M22 20 q4 -6 8 0 M34 18 q4 -6 8 0", 2, P.leafD),
  notebook: R(16, 10, 32, 44, "#7a5a8a", 3) + L("M22 10 V54", 2) + L("M28 22 H42 M28 30 H42", 2, P.bone),
  gold_watch: C(32, 34, 16, P.gold) + C(32, 34, 11, P.bone) + L("M32 34 V26 M32 34 L38 37", 2.5) + R(28, 10, 8, 8, P.gold, 2),
  game_console: R(10, 20, 44, 26, P.ash, 8) + R(22, 24, 20, 14, P.water, 2) + C(48, 30, 2.5, P.red) + L("M14 33 H20 M17 30 V36", 2),

  // 물·음식
  water_dirty: Pth("M24 10 H40 V18 L46 28 V52 Q32 58 18 52 V28 L24 18 Z", "#8a8a5a") + Pth("M20 38 Q32 34 44 38 V50 Q32 54 20 50 Z", "#6a6a3a"),
  water_clean: Pth("M24 10 H40 V18 L46 28 V52 Q32 58 18 52 V28 L24 18 Z", "#cfe6ee") + Pth("M20 34 Q32 30 44 34 V50 Q32 54 20 50 Z", P.water) + HL("M24 30 V46"),
  berry: [[24, 36], [36, 34], [30, 44], [40, 44], [22, 46]].map(([x, y]) => C(x, y, 7, "#5a4a9a")).join("") + E(32, 22, 9, 4, P.leaf, -20),
  mushroom: R(28, 32, 8, 18, P.bone, 3) + Pth("M12 34 Q32 6 52 34 Z", P.rust) + C(24, 26, 2.5, P.bone) + C(38, 22, 2.5, P.bone),
  raw_meat: Pth("M12 36 Q14 18 34 16 Q52 18 52 34 Q50 50 30 50 Q14 50 12 36 Z", P.meat) + E(36, 30, 7, 5, "#e8b0a0") + HL("M18 30 Q22 22 30 20"),
  cooked_meat: E(30, 36, 18, 13, "#8a4a2a", -20) + R(42, 14, 6, 16, P.bone, 3, 'transform="rotate(35 45 22)"') + C(48, 14, 4, P.bone) + HL("M18 34 Q22 28 30 26"),
  jerky: rot(-15, R(14, 22, 36, 9, "#7a3a2a", 3) + R(18, 33, 32, 9, "#6a3020", 3)) + L("M20 26 H40", 1.5, "#a05a3a"),
  salted_meat: Pth("M14 38 Q16 20 34 18 Q50 20 50 36 Q48 50 30 50 Q16 50 14 38 Z", "#b0705a") + [20, 28, 36, 44].map((x) => C(x, 30 + (x % 3), 1.6, "#fff")).join(""),
  raw_fish: E(30, 32, 18, 9, "#7a9aaa") + Pth("M46 32 L58 22 V42 Z", "#6a8a9a") + C(20, 30, 2, P.ink) + HL("M18 28 Q28 24 38 27"),
  grilled_fish: E(30, 32, 18, 9, "#a0703a") + Pth("M46 32 L58 22 V42 Z", "#8a5a2a") + L("M24 26 L28 38 M32 25 L36 39", 2, P.woodD),
  egg: E(32, 34, 13, 17, P.bone) + HL("M24 26 Q26 20 30 18"),
  milk: Pth("M22 14 H42 V20 L46 26 V52 H18 V26 L22 20 Z", "#f2efe6") + R(18, 34, 28, 10, P.water, 0) + HL("M22 28 V50"),
  potato: E(32, 34, 18, 13, "#b08a5a", -15) + C(26, 30, 1.5, P.woodD) + C(38, 36, 1.5, P.woodD) + C(32, 40, 1.5, P.woodD),
  baked_potato: E(32, 36, 18, 12, "#8a5a2a", -10) + Pth("M22 32 Q32 24 42 32 Q32 36 22 32 Z", "#f2d27a"),
  bread: Pth("M10 40 Q12 22 32 20 Q52 22 54 40 Q32 46 10 40 Z", "#c48a42") + L("M22 28 L26 34 M32 26 L36 32 M42 28 L44 34", 2, P.woodD),
  stew: Pth("M10 32 H54 Q52 52 32 52 Q12 52 10 32 Z", P.ironD) + E(32, 32, 22, 5, "#b0603a") + C(26, 31, 2.5, "#e0a050") + C(36, 32, 2.5, P.leaf) + L("M22 22 q3 -6 0 -10 M32 22 q3 -6 0 -10 M42 22 q3 -6 0 -10", 2, P.ash),
  canned_food: R(16, 14, 32, 40, P.iron, 4) + R(16, 26, 32, 16, P.red, 0) + E(32, 14, 16, 4, P.bone) + HL("M20 18 V50"),
  instant_noodle: Pth("M12 24 H52 L46 54 H18 Z", P.red) + E(32, 24, 20, 5, P.bone) + L("M20 22 q4 -8 8 0 q4 -8 8 0 q4 -8 8 0", 2, P.gold),

  // 의료
  bandage: rot(-30, R(10, 24, 44, 16, P.bone, 5) + R(26, 24, 12, 16, "#d8c8a8", 0) + C(30, 30, 1, P.ink) + C(34, 34, 1, P.ink)),
  medkit: R(10, 20, 44, 30, "#d8d4ca", 5) + R(24, 12, 16, 8, P.ironD, 2) + R(28, 26, 8, 18, P.red, 1) + R(23, 31, 18, 8, P.red, 1),
  radaway: rot(-35, R(14, 24, 18, 16, P.amber, 8) + R(30, 24, 20, 16, P.bone, 8)) + C(48, 16, 6, P.rad),
  herbal_tea: Pth("M14 26 H46 V42 Q46 52 30 52 Q14 52 14 42 Z", P.bone) + Pth("M46 30 Q56 30 54 38 Q52 44 46 42", "none") + E(30, 27, 15, 3, "#8a9a4a") + L("M24 20 q3 -5 0 -9 M34 20 q3 -5 0 -9", 2, P.ash),
  revive_kit: rot(-35, R(10, 28, 36, 10, "#cfe6ee", 3) + R(14, 30, 20, 6, P.rad, 2) + L("M46 33 H56", 2) + R(4, 26, 6, 14, P.iron, 2)),

  // 도구·무기 (같은 손잡이 각도 45°)
  stone_axe: rot(-45, R(29, 8, 6, 50, P.wood, 3) + Pth("M35 10 L50 6 L52 24 L35 22 Z", P.ash)),
  iron_axe: rot(-45, R(29, 8, 6, 50, P.woodD, 3) + Pth("M35 8 L52 4 Q56 16 52 26 L35 22 Z", P.iron) + HL("M38 10 L50 7")),
  stone_pick: rot(-45, R(29, 12, 6, 46, P.wood, 3) + Pth("M10 16 Q32 2 54 16 L52 20 Q32 10 12 20 Z", P.ash)),
  iron_pick: rot(-45, R(29, 12, 6, 46, P.woodD, 3) + Pth("M8 16 Q32 0 56 16 L54 20 Q32 8 10 20 Z", P.iron)),
  stone_hammer: rot(-45, R(29, 16, 6, 42, P.wood, 3) + R(18, 6, 28, 14, P.ironD, 3)),
  stone_hoe: rot(-45, R(29, 10, 6, 48, P.wood, 3) + Pth("M35 10 H52 V20 L35 16 Z", P.ash)),
  fishing_rod: L("M12 54 L48 10", 4, P.wood) + L("M48 10 Q54 30 50 46", 1.5, P.ash) + C(50, 48, 3, P.red),
  knife: rot(-45, R(29, 36, 6, 20, P.woodD, 3) + R(25, 34, 14, 4, P.gold, 1) + Pth("M29 34 V10 Q36 14 35 34 Z", P.iron)),
  spear: rot(-45, R(30, 18, 4, 44, P.wood, 2) + Pth("M32 2 L38 18 H26 Z", P.iron)),
  machete: rot(-45, R(29, 42, 6, 16, P.woodD, 3) + Pth("M29 42 V12 Q40 8 42 18 L35 42 Z", P.iron) + HL("M31 38 V16")),
  bow: Pth("M18 8 Q50 32 18 56", "none") + L("M18 8 Q50 32 18 56", 5, P.wood) + L("M18 8 V56", 1.5, P.bone),
  pipe_pistol: R(10, 20, 40, 10, P.ironD, 2) + R(14, 28, 10, 20, P.wood, 3) + R(48, 22, 8, 6, P.iron, 1) + L("M26 30 Q28 36 32 32", 2),
  rifle: rot(-20, R(4, 26, 54, 7, P.ironD, 2) + Pth("M6 30 L22 30 L20 44 L6 40 Z", P.wood) + R(30, 32, 6, 12, P.ironD, 2)),
  royal_blade: rot(-45, R(29, 44, 6, 16, "#5a2a2a", 3) + R(20, 40, 24, 5, P.gold, 2) + Pth("M28 40 V6 L32 2 L36 6 V40 Z", "#e8e2c8") + C(32, 42, 2.5, P.red)),

  // 옷 (같은 실루엣 규칙)
  rag_shirt: Pth("M20 12 L10 22 L16 30 L20 26 V54 H44 V26 L48 30 L54 22 L44 12 Q32 20 20 12 Z", P.cloth) + L("M24 48 L28 52 L32 48 L36 52 L40 48", 2),
  rag_pants: Pth("M18 10 H46 L50 54 H36 L32 26 L28 54 H14 Z", "#7a6e5a") + L("M16 50 L20 54 M44 52 L48 54", 2),
  sandals: E(22, 40, 8, 14, P.ironD) + E(42, 40, 8, 14, P.ironD) + L("M16 34 H28 M36 34 H48", 3, P.wood),
  leather_jacket: Pth("M20 12 L8 24 L14 52 H50 L56 24 L44 12 Q32 18 20 12 Z", "#6a4428") + L("M32 18 V52", 2) + Pth("M20 12 L28 26 L32 18 L36 26 L44 12", "#4a2e1a") + HL("M14 28 L18 46"),
  leather_pants: Pth("M18 10 H46 L50 54 H36 L32 26 L28 54 H14 Z", "#5a3a22") + L("M22 16 H42", 2),
  boots: Pth("M14 14 H28 V40 H38 Q46 40 46 50 V54 H14 Z", "#3a2a1e") + L("M14 26 H28", 2) + R(14, 50, 32, 4, P.ink, 1),
  fur_coat: Pth("M20 12 L8 26 L14 54 H50 L56 26 L44 12 Q32 18 20 12 Z", "#9c8468") + E(32, 14, 14, 6, "#d8c8a8") + L("M32 20 V54", 2) + R(12, 48, 40, 6, "#d8c8a8", 3),
  gas_mask: E(32, 32, 20, 18, "#3d4a3a") + C(24, 28, 6, "#9ad0e0") + C(40, 28, 6, "#9ad0e0") + R(26, 42, 12, 12, P.ironD, 4) + L("M28 48 H36", 2),
  helmet: Pth("M8 40 Q8 12 32 12 Q56 12 56 40 Z", "#4f5a3c") + R(4, 38, 56, 6, "#3f4a2e", 3) + HL("M16 24 Q22 16 32 16"),
  hazmat: Pth("M20 12 L8 24 L14 54 H50 L56 24 L44 12 Q32 18 20 12 Z", "#d8c23a") + R(12, 34, 40, 5, P.ink, 1) + C(32, 24, 5, P.ink) + C(32, 24, 2, "#d8c23a"),
  combat_vest: Pth("M18 10 L12 54 H52 L46 10 L38 10 L32 18 L26 10 Z", "#3f4a35") + R(18, 30, 10, 9, "#2c3426", 2) + R(36, 30, 10, 9, "#2c3426", 2) + R(20, 44, 24, 6, "#2c3426", 2),
  backpack: R(14, 14, 36, 42, "#5b4a33", 8) + R(18, 36, 28, 14, "#4a3a26", 4) + L("M24 14 Q32 4 40 14", 3, P.wood),
  royal_robe: Pth("M22 10 H42 L54 56 H10 Z", "#7a1f2b") + L("M22 10 L32 22 L42 10", 3, P.gold) + R(10, 50, 44, 6, "#e8e0d0", 2) + C(32, 14, 3, P.gold),
  crown: Pth("M10 46 V20 L22 32 L32 14 L42 32 L54 20 V46 Z", P.gold) + R(10, 44, 44, 8, P.gold, 2) + C(32, 38, 3.5, P.red) + C(20, 40, 2.5, P.water) + C(44, 40, 2.5, P.water),
  campfire_kit: "",

  // HUD / 메뉴
  "ui.hp": Pth("M32 54 C10 38 6 22 18 14 C26 9 32 16 32 20 C32 16 38 9 46 14 C58 22 54 38 32 54 Z", P.red) + HL("M18 22 Q20 16 26 16"),
  "ui.hunger": D_meat(),
  "ui.thirst": Pth("M32 6 C42 22 50 32 50 40 A18 18 0 0 1 14 40 C14 32 22 22 32 6 Z", P.water) + HL("M22 38 Q22 30 26 26"),
  "ui.temp": R(26, 8, 12, 36, P.bone, 6) + C(32, 48, 9, P.red) + R(29, 22, 6, 24, P.red, 2),
  "ui.rad": C(32, 32, 24, P.amber) + [0, 120, 240].map((a) => `<path d="M32 32 L${32 + 20 * Math.cos(((a - 90) * Math.PI) / 180)} ${32 + 20 * Math.sin(((a - 90) * Math.PI) / 180)} A20 20 0 0 1 ${32 + 20 * Math.cos(((a - 30) * Math.PI) / 180)} ${32 + 20 * Math.sin(((a - 30) * Math.PI) / 180)} Z" fill="${P.ink}"/>`).join("") + C(32, 32, 5, P.amber),
  "ui.gem": Pth("M14 24 L24 12 H40 L50 24 L32 54 Z", "#5ab0c0") + L("M14 24 H50 M24 12 L32 24 L40 12 M32 24 V54", 2) + HL("M20 22 L26 14"),
  "ui.coin": C(32, 32, 20, P.gold) + C(32, 32, 13, "#c49a3a") + L("M28 26 H36 M32 26 V40", 3),
  "ui.bag": R(12, 20, 40, 34, "#6a5236", 8) + L("M24 20 Q24 8 32 8 Q40 8 40 20", 4, P.woodD) + R(22, 32, 20, 10, "#4a3a26", 3),
  "ui.craft": rot(-45, R(29, 10, 6, 46, P.wood, 3) + R(18, 4, 28, 12, P.iron, 3)) + rot(45, R(30, 14, 4, 40, P.iron, 2)),
  "ui.base": R(10, 26, 44, 28, "#86807a", 2) + Pth("M10 26 V16 H18 V22 H26 V16 H38 V22 H46 V16 H54 V26 Z", "#86807a") + R(27, 38, 10, 16, "#3d3027", 5) + L("M32 4 V16", 2) + Pth("M32 4 L42 8 L32 12 Z", P.red),
  "ui.people": C(22, 22, 8, P.skin) + Pth("M8 54 Q8 34 22 34 Q36 34 36 54 Z", P.cloth) + C(42, 20, 8, P.skin) + Pth("M30 54 Q30 32 42 32 Q56 32 56 54 Z", "#6a4428"),
  "ui.animals": E(32, 42, 12, 10, "#8a6a45") + C(18, 28, 6, "#8a6a45") + C(28, 18, 6, "#8a6a45") + C(40, 18, 6, "#8a6a45") + C(48, 28, 6, "#8a6a45"),
  "ui.story": Pth("M8 14 Q20 10 32 16 V54 Q20 48 8 52 Z", P.bone) + Pth("M56 14 Q44 10 32 16 V54 Q44 48 56 52 Z", "#d8ccb0") + L("M14 24 H26 M14 32 H26 M38 24 H50 M38 32 H50", 2, P.ash),
  "ui.olympics": Pth("M18 10 H46 V24 Q46 38 32 38 Q18 38 18 24 Z", P.gold) + R(28, 38, 8, 8, P.gold, 1) + R(20, 46, 24, 8, P.woodD, 2) + L("M18 16 H10 Q10 28 20 30 M46 16 H54 Q54 28 44 30", 3, P.gold),
  "ui.shop": D_gem(),
  "ui.menu": R(10, 14, 44, 7, P.bone, 3) + R(10, 29, 44, 7, P.bone, 3) + R(10, 44, 44, 7, P.bone, 3),
  "ui.hand": Pth("M20 54 Q12 44 14 32 L16 22 Q18 18 22 22 V30 V14 Q24 10 28 14 V28 V10 Q30 6 34 10 V28 V14 Q36 10 40 14 V32 L44 26 Q48 24 50 28 L44 44 Q40 54 30 54 Z", P.skin),

  // 장소
  "poi.radio_tower": L("M22 56 L32 8 L42 56 M25 42 H39 M28 28 H36 M22 56 L39 42 M42 56 L25 42", 3, P.ironD) + C(32, 8, 4, P.red),
  "poi.iron_city": R(8, 28, 18, 26, "#6a6a6e", 1) + R(26, 18, 14, 36, "#5a5a5e", 1) + R(40, 32, 16, 22, "#6a6a6e", 1) + R(44, 10, 6, 22, P.rust, 1) + L("M12 34 H22 M30 26 H36 M30 34 H36", 2, P.amber),
  "poi.rad_river": D_rad(),
  "poi.raider_camp": L("M18 56 V8", 4, P.woodD) + Pth("M20 10 H50 L42 20 L50 30 H20 Z", P.blood) + Pth("M28 56 L40 38 L52 56 Z", "#6b4a3a"),
  "poi.ash_fortress": R(8, 26, 48, 28, "#3a3634", 1) + Pth("M8 26 V16 H16 V22 H24 V16 H40 V22 H48 V16 H56 V26 Z", "#3a3634") + R(26, 36, 12, 18, P.ink, 6) + C(32, 10, 4, P.blood),
  "poi.trader": R(10, 30, 40, 14, P.wood, 2) + Pth("M8 30 Q30 8 52 30 Z", "#c9b48a") + C(18, 48, 6, P.woodD) + C(42, 48, 6, P.woodD),
};
function D_meat() { return E(28, 36, 16, 12, "#8a4a2a", -25) + R(38, 12, 7, 18, P.bone, 3, 'transform="rotate(35 41 21)"') + C(46, 12, 4.5, P.bone) + HL("M18 34 Q22 28 30 26"); }
function D_gem() { return Pth("M14 24 L24 12 H40 L50 24 L32 54 Z", "#5ab0c0") + L("M14 24 H50 M24 12 L32 24 L40 12 M32 24 V54", 2) + HL("M20 22 L26 14"); }
function D_rad() { return C(32, 32, 24, P.rad) + [0, 120, 240].map((a) => `<path d="M32 32 L${32 + 20 * Math.cos(((a - 90) * Math.PI) / 180)} ${32 + 20 * Math.sin(((a - 90) * Math.PI) / 180)} A20 20 0 0 1 ${32 + 20 * Math.cos(((a - 30) * Math.PI) / 180)} ${32 + 20 * Math.sin(((a - 30) * Math.PI) / 180)} Z" fill="${P.ink}"/>`).join("") + C(32, 32, 5, P.rad); }
D["ui.hunger"] = D_meat();

// 건물: 같은 집 실루엣 + 지붕색 + 상징 배지
const house = (roof, wall, emblem) => R(10, 30, 44, 24, wall, 2) + Pth(`M6 32 L32 10 L58 32 Z`, roof) + R(27, 40, 10, 14, "#3d3027", 4) + (emblem ? `<g transform="translate(36 34) scale(.38)">${emblem}</g>` : "");
const B = {
  campfire: Pth("M22 34 Q24 18 32 8 Q40 18 42 34 Q32 40 22 34 Z", P.amber) + Pth("M27 34 Q28 24 32 18 Q36 24 37 34 Z", "#f2d27a") + rot(20, R(12, 42, 40, 7, P.wood, 3)) + rot(-20, R(12, 42, 40, 7, P.woodD, 3)),
  workbench: R(6, 26, 52, 8, P.wood, 2) + R(10, 34, 6, 20, P.woodD, 1) + R(48, 34, 6, 20, P.woodD, 1) + rot(-20, R(30, 14, 4, 14, P.wood, 2) + R(26, 10, 12, 6, P.iron, 2)),
  crate: R(10, 16, 44, 38, P.wood, 2) + L("M10 16 L54 54 M54 16 L10 54", 3, P.woodD) + R(10, 16, 44, 38, "none", 2),
  bed: R(6, 32, 52, 14, P.wood, 3) + R(10, 26, 44, 10, P.bone, 4) + R(10, 24, 12, 8, "#f2efe6", 3) + L("M8 46 V54 M56 46 V54", 4, P.woodD),
  cellar: Pth("M8 54 V30 Q32 10 56 30 V54 Z", "#86807a") + R(22, 34, 20, 20, "#3d3027", 3) + L("M22 40 H42 M22 46 H42", 2, P.wood),
  smokehouse: house("#3a3027", P.wood, D.jerky) + L("M44 16 V6", 6, "#55504b") + L("M46 4 q4 -3 0 -6", 2, P.ash),
  farm: R(6, 30, 52, 24, "#6a4a2a", 3) + [12, 22, 32, 42, 52].map((x) => L(`M${x} 46 V30`, 3, P.leaf) + E(x, 28, 3, 5, P.leaf)).join(""),
  rain_collector: R(18, 26, 28, 28, P.water, 4) + Pth("M10 22 H54 L46 30 H18 Z", P.ironD) + L("M24 10 V16 M32 8 V16 M40 10 V16", 2, P.water),
  pen: L("M6 30 H58 M6 42 H58", 4, P.wood) + [10, 24, 40, 54].map((x) => R(x - 3, 24, 6, 30, P.woodD, 2)).join(""),
  watchtower: L("M18 56 L24 22 M46 56 L40 22 M20 44 H44 M22 32 H42", 4, P.wood) + R(16, 16, 32, 8, P.wood, 2) + Pth("M14 16 L32 4 L50 16 Z", P.woodD),
  forge: house("#4a3a32", "#86807a", D.iron_axe) + C(20, 44, 5, P.amber),
  kitchen: house("#7a4a2a", P.wood, D.stew),
  clinic: house("#e8e2d8", "#d8d4ca") + R(29, 20, 6, 14, P.red, 1) + R(25, 24, 14, 6, P.red, 1),
  house: house("#6a3a2a", "#a08a6a"),
  lab: house("#4a5a6a", "#86807a") + Pth("M40 34 H48 L52 50 H36 Z", "#cfe6ee") + R(36, 44, 16, 6, P.rad, 2),
  stable: house("#5a4a3a", P.wood) + E(44, 44, 7, 5, "#7a4e2d"),
  barracks: house("#4f5a3c", "#86807a") + Pth("M14 16 H22 L26 22 L22 28 H14 Z", P.blood),
  wall_gate: R(6, 18, 52, 36, "#86807a", 2) + Pth("M20 54 V36 Q32 24 44 36 V54 Z", "#3d3027") + L("M24 40 V54 M32 34 V54 M40 40 V54", 2, P.iron),
  generator: R(10, 22, 44, 30, P.ironD, 4) + Pth("M34 26 L26 38 H32 L28 48 L40 34 H34 Z", P.amber) + R(42, 14, 6, 8, P.iron, 1),
  fridge: R(16, 8, 32, 48, "#d8d8d0", 4) + L("M16 26 H48", 3) + L("M42 14 V22 M42 32 V44", 3, P.iron) + HL("M20 12 V52"),
  turret: R(14, 40, 36, 14, P.ironD, 3) + C(32, 34, 12, P.iron) + R(32, 30, 26, 6, P.ironD, 2),
  purifier: R(14, 18, 36, 36, P.iron, 6) + Pth("M32 24 C38 32 42 38 42 42 A10 10 0 0 1 22 42 C22 38 26 32 32 24 Z", P.water),
  garage: R(6, 24, 52, 30, "#6a6a6e", 2) + R(14, 32, 36, 22, P.ironD, 1) + L("M14 38 H50 M14 44 H50 M14 50 H50", 2),
  arena: E(32, 40, 26, 14, "#86807a") + E(32, 38, 18, 8, "#c9a76a") + Pth("M28 10 H36 V22 H28 Z", P.gold),
  throne: R(16, 8, 32, 30, "#7a1f2b", 4) + R(12, 34, 40, 10, P.gold, 3) + R(16, 44, 8, 10, P.gold, 2) + R(40, 44, 8, 10, P.gold, 2) + Pth("M24 8 L32 2 L40 8", P.gold),
};
for (const [k, v] of Object.entries(B)) D["b." + k] = v;

// 날씨
const cloud = (c = "#b8b4ac", y = 0) => Pth(`M14 ${40 + y} Q8 ${40 + y} 10 ${32 + y} Q12 ${24 + y} 22 ${26 + y} Q26 ${14 + y} 38 ${18 + y} Q50 ${16 + y} 50 ${28 + y} Q58 ${30 + y} 54 ${40 + y} Z`, c);
Object.assign(D, {
  "w.clear": C(32, 32, 13, P.amber) + [0, 45, 90, 135, 180, 225, 270, 315].map((a) => L(`M${32 + Math.cos((a * Math.PI) / 180) * 18} ${32 + Math.sin((a * Math.PI) / 180) * 18} L${32 + Math.cos((a * Math.PI) / 180) * 25} ${32 + Math.sin((a * Math.PI) / 180) * 25}`, 3, P.amber)).join(""),
  "w.cloudy": cloud(),
  "w.rain": cloud("#9aa0a4", -6) + L("M20 44 L16 54 M32 44 L28 54 M44 44 L40 54", 3, P.water),
  "w.storm": cloud("#6e737a", -6) + Pth("M34 38 L26 50 H32 L28 60 L42 46 H36 L40 38 Z", P.amber),
  "w.snow": cloud("#d8dde2", -6) + [20, 32, 44].map((x) => C(x, 50, 3, "#fff")).join(""),
  "w.blizzard": cloud("#c8cdd2", -8) + L("M8 46 H40 M14 54 H52", 3, "#fff") + [24, 40].map((x) => C(x, 50, 2.5, "#fff")).join(""),
  "w.fog": L("M10 22 H54 M6 32 H50 M14 42 H58 M10 52 H46", 5, "#a8a49c"),
  "w.heatwave": C(32, 26, 12, P.red) + L("M14 46 q6 -6 12 0 t12 0 t12 0 M14 54 q6 -6 12 0 t12 0 t12 0", 3, P.amber),
  "w.sandstorm": L("M8 24 Q30 16 44 24 T58 26 M6 36 Q24 30 40 36 T56 38 M10 48 Q30 42 46 48", 4, "#c8b07a"),
  "w.ashfall": cloud("#55504b", -8) + [18, 28, 38, 46].map((x, i) => R(x, 46 + (i % 2) * 6, 4, 4, "#8a857c", 1)).join(""),
  "w.radstorm": cloud("#5a6a3a", -8) + C(32, 48, 8, P.rad) + C(32, 48, 2, P.ink),
  "ui.globe": C(32, 32, 24, P.water) + Pth("M18 20 Q24 14 30 18 Q34 26 26 30 Q20 34 22 42 Q14 38 12 30 Z", P.leaf) + Pth("M38 14 Q48 16 52 26 Q46 30 40 26 Q36 20 38 14 Z", P.leaf) + Pth("M36 38 Q44 36 46 44 Q42 52 36 50 Z", P.leaf),
});

// 직업·동물(동일 원형 메달 위)
const medal = (inner, ring = P.gold) => C(32, 32, 26, "#3a2f26") + `<circle cx="32" cy="32" r="26" fill="none" stroke="${ring}" stroke-width="3"/>` + `<g transform="translate(12 12) scale(.625)">${inner}</g>`;
Object.assign(D, {
  "job.soldier": medal(D.helmet), "job.doctor": medal(D.medkit), "job.engineer": medal(D.stone_hammer), "job.cook": medal(D.stew),
  "job.researcher": medal(Pth("M26 8 H38 V24 L52 52 H12 L26 24 Z", "#cfe6ee") + Pth("M18 40 H46 L52 52 H12 Z", P.rad)), "job.politician": medal(Pth("M18 14 H46 V40 H18 Z", P.ink) + R(10, 40, 44, 6, P.ink, 2) + R(18, 32, 28, 4, P.red, 0)),
  "job.farmer": medal(L("M32 56 V14", 3, P.gold) + [18, 26, 34, 42].map((y) => E(26, y, 4, 7, P.gold, -30) + E(38, y, 4, 7, P.gold, 30)).join("")), "job.jobless": medal(R(8, 30, 48, 18, "#7a6a8a", 6) + R(8, 20, 10, 28, "#6a5a7a", 4) + R(46, 20, 10, 28, "#6a5a7a", 4)),
});
const animal = (c, extra = "") => E(32, 38, 18, 12, c) + C(46, 26, 9, c) + C(49, 24, 1.8, P.ink) + extra;
Object.assign(D, {
  "a.chicken": E(30, 38, 16, 14, P.bone) + C(44, 22, 8, P.bone) + Pth("M52 22 L58 24 L52 26 Z", P.amber) + R(40, 12, 6, 6, P.red, 2),
  "a.goat": animal("#cfc6b0", L("M44 18 Q40 8 34 10 M50 18 Q52 8 58 10", 3, "#e8e0c8")),
  "a.dog": animal("#8a6a45", Pth("M40 20 L42 10 L48 18 Z", "#8a6a45")),
  "a.boar": animal("#5b4636", L("M52 32 L58 28", 3, P.bone)),
  "a.cow": animal("#d9d2c3", E(26, 36, 6, 5, "#3a3a3a") + L("M42 18 Q40 12 36 12 M52 18 Q54 12 58 12", 3, "#e8e0c8")),
  "a.horse": animal("#7a4e2d", R(34, 14, 6, 14, "#2b1d12", 2)),
  "a.wolf": animal("#6e6e72", Pth("M40 20 L42 8 L48 18 Z M48 18 L54 8 L56 20 Z", "#6e6e72")),
  "a.deer": animal("#a47a4f", L("M44 18 L40 6 L36 4 M40 6 L44 2 M50 18 L54 6 L58 4", 2.5, "#5a4024")),
  "v.bicycle": C(16, 42, 11, P.ironD) + C(16, 42, 6, "#241f1b") + C(48, 42, 11, P.ironD) + C(48, 42, 6, "#241f1b") + L("M16 42 L28 24 H44 L48 42 M28 24 L34 42 L44 24 M26 18 H32 M44 24 L42 16 H48", 3, "#2f5d7a"),
  "v.motorbike": C(16, 44, 10, P.ironD) + C(16, 44, 4, P.iron) + C(48, 44, 10, P.ironD) + C(48, 44, 4, P.iron) + Pth("M18 40 L26 26 H44 L50 34 L40 40 Z", "#8a1f1f") + R(26, 20, 14, 6, P.ink, 3) + L("M44 26 L48 16 H54", 3, P.iron),
});

// ---------- 출력 ----------
const cache = new Map();
export function svg(key, size = 32) {
  const k = key + "|" + size;
  if (cache.has(k)) return cache.get(k);
  const body = D[key];
  const out = body
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64" class="gi"><ellipse cx="32" cy="58" rx="20" ry="4" fill="#000" opacity=".25"/>${body}</svg>`
    : null;
  cache.set(k, out);
  return out;
}
export function has(key) { return !!D[key]; }
// 아이템 id / 건물 id 등 → HTML (없으면 대체 문자)
export function icon(key, size = 28, fallback = "") {
  const src = iconSrc(key); // 그림(OpenAI 아트)이 있으면 그것을 쓴다
  if (src) return `<img class="gi art" src="${src}" width="${size}" height="${size}" alt="" draggable="false" loading="lazy">`;
  return svg(key, size) || `<span class="gi-fb">${fallback}</span>`;
}
export function dataURI(key, size = 64) {
  const s = svg(key, size);
  return s ? "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s) : null;
}
export const ALL_KEYS = () => Object.keys(D).filter((k) => D[k]);
