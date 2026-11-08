// 처음 15분 안내 — 단계마다 '목표'와 '어디로 가야 하는지(화살표)'를 보여준다.
// done(st,G): 완료 조건. 대상(target)은 tutorialStep()이 계산.
import { countAll, hasBuilding } from "./systems.js";
import { TILE } from "./world.js";

export const TUTORIAL = [
  { id: "move", title: "주위를 둘러보세요", text: "WASD·방향키 또는 왼쪽 조이스틱으로 움직입니다.", done: (st, G) => G.tutStart && Math.hypot(st.player.x - G.tutStart.x, st.player.y - G.tutStart.y) > TILE * 3 },
  { id: "twig", title: "나뭇가지 3개 모으기", text: "덤불을 맨손으로 뒤지면 나뭇가지·섬유가 나옵니다. (나무를 맨손으로 베면 아주 오래 걸려요)", node: "bush", done: (st) => countAll(st, "twig") >= 3 || st.story.crafted.stone_axe },
  { id: "stone", title: "돌 2개 모으기", text: "바위를 ✋로 캐세요. 곡괭이가 없으면 여러 번 쳐야 합니다.", node: "rock", done: (st) => countAll(st, "stone") >= 2 || st.story.crafted.stone_axe },
  { id: "fiber", title: "섬유 2개 모으기", text: "덤불을 뒤지면 섬유와 산딸기가 나옵니다.", node: "bush", done: (st) => countAll(st, "fiber") >= 2 || st.story.crafted.stone_axe },
  { id: "axe", title: "돌도끼 만들기", text: "아래 [🛠️제작]에서 돌도끼를 만드세요. 손재주가 좋을수록 좋은 품질이 나옵니다.", done: (st) => !!st.story.crafted.stone_axe },
  { id: "equip", title: "돌도끼 손에 들기", text: "[🎒가방]에서 돌도끼를 눌러 '장착'하세요. 맨손보다 나무를 5배 빨리 벱니다.", done: (st) => !!st.player.equip.hand && ["stone_axe", "iron_axe"].includes(st.player.equip.hand.id) || hasBuilding(st, "campfire") },
  { id: "fire", title: "기지에 모닥불 짓기", text: "기지 중앙(천막)에서 ✋ → [건설] → 모닥불. 밤과 추위를 막아 줍니다.", base: true, done: (st) => hasBuilding(st, "campfire") },
  { id: "water", title: "물 끓이기", text: "물가에서 ✋로 더러운 물을 뜨고, [제작 → 모닥불]에서 나뭇가지로 끓이세요. 그냥 마시면 병에 걸릴 수 있어요!", water: true, done: (st) => !!st.story.crafted.water_clean },
];

// 현재 단계의 화살표 목표(픽셀 좌표)
export function tutorialStep(st, G, visibleNodes, nearWater) {
  const step = TUTORIAL[st.tut];
  if (!step) return null;
  const p = st.player;
  if (step.node) {
    let best = null, bd = 1e9;
    for (const n of visibleNodes()) { if (n.type !== step.node) continue; const x = (n.tx + 0.5) * TILE, y = (n.ty + 0.5) * TILE, d = Math.hypot(x - p.x, y - p.y); if (d < bd) { bd = d; best = { x, y }; } }
    return best;
  }
  if (step.base) return { x: (G.world.cx + 0.5) * TILE, y: (G.world.cy + 0.5) * TILE };
  if (step.water && !(nearWater(G.world, p.x, p.y))) {
    let best = null, bd = 1e9;
    const W = 128, cx = Math.floor(p.x / TILE), cy = Math.floor(p.y / TILE);
    for (let y = cy - 20; y <= cy + 20; y++) for (let x = cx - 20; x <= cx + 20; x++) {
      if (x < 0 || y < 0 || x >= W || y >= W) continue;
      if (G.world.tiles[y * W + x] !== 3) continue;
      const d = (x - cx) ** 2 + (y - cy) ** 2; if (d < bd) { bd = d; best = { x: (x + 0.5) * TILE, y: (y + 0.5) * TILE }; }
    }
    return best;
  }
  return null;
}
