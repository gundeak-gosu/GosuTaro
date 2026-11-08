// 동물 행동(동물행동학 기반 단순화) — 순수 함수라 테스트 가능.
// 상태: rest(휴식·잠) graze(풀 뜯기·쪼기) walk(천천히 이동) alert(멈춰서 경계) flee(도망)
//       warn(위협 과시) charge(돌진) stalk(몰래 접근) attack(공격 — 실제 타격은 main.js 의 예고·피격 처리)
// 거리 단위: px (1칸 = 32px ≈ 1.5m). 사람 걸음(플레이어) ≈ 120~150px/s.
export const AI = {
  // prey: 겁 많은 초식. 경계 거리에서 멈춰 보고, 도주 거리 안이면 달아난다(무리 전체가 따라 도망)
  chicken: { kind: "prey", walk: 22, run: 115, alert: 90, flee: 55, herd: [3, 5], day: true, graze: 0.55 },
  goat: { kind: "prey", walk: 26, run: 150, alert: 150, flee: 95, herd: [2, 4], day: true, graze: 0.6 },
  deer: { kind: "prey", walk: 34, run: 260, alert: 230, flee: 170, herd: [2, 4], crepuscular: true, graze: 0.5, freeze: 1.0 },
  horse: { kind: "prey", walk: 38, run: 280, alert: 180, flee: 115, herd: [2, 5], day: true, graze: 0.55, freeze: 0.6 },
  // defensive: 평소엔 순하지만 너무 가까이 오거나 맞으면 경고 → 돌진
  cow: { kind: "defensive", walk: 18, run: 140, alert: 110, warn: 55, herd: [2, 4], day: true, graze: 0.7 },
  boar: { kind: "defensive", walk: 30, run: 210, alert: 160, warn: 110, herd: [1, 3], graze: 0.45, chargeOnWarn: 0.5 },
  // territorial: 영역에 들어오면 으르렁 → 물러나지 않으면 공격, 크게 다치면 도망
  dog: { kind: "territorial", walk: 32, run: 200, alert: 200, warn: 150, attack: 90, herd: [2, 4], fleeHp: 0.3 },
  // predator: 몰래 다가와(stalk) 무리로 공격, 밤에 더 대담, 크게 다치면 물러남
  wolf: { kind: "predator", walk: 34, run: 240, alert: 320, stalk: 260, attack: 110, herd: [2, 4], night: true, fleeHp: 0.25 },
};

const pick = (rng, a, b) => a + rng() * (b - a);

// 한 프레임 진행. ctx: { d, dx, dy(플레이어까지), dt, night, hurt(최근 맞음), packAggro(무리가 공격 중), herdPanic(무리가 도망 중), rng }
// 반환: { sp, tx, ty, hostile(공격 판정 대상), emote }
export function stepAnimal(m, ctx) {
  let A = AI[m.type];
  const { d, dx, dy, dt, night } = ctx;
  const rng = ctx.rng || Math.random;
  if (!A) return { sp: 0, tx: 0, ty: 0, hostile: false };
  m.t = (m.t ?? 0) - dt;
  const awayX = -dx / (d || 1), awayY = -dy / (d || 1), toX = dx / (d || 1), toY = dy / (d || 1);
  const sleepy = A.night ? !night : A.crepuscular ? false : night && A.day; // 야행성은 낮에, 주행성은 밤에 쉰다
  const set = (s, t) => { m.state = s; m.t = t; };
  const hpFrac = m.maxHp ? m.hp / m.maxHp : 1;

  // 1) 크게 다쳤으면 누구든 도망(포식자·영역 동물도)
  if (A.fleeHp && hpFrac < A.fleeHp && d < 400) { if (m.state !== "flee") set("flee", 4); return { sp: A.run, tx: awayX, ty: awayY, hostile: false, emote: "💦" }; }

  if (A.kind === "prey") {
    const k = ctx.bait ? 0.45 : 1; // 좋아하는 먹이를 들고 오면 덜 경계한다(길들이기)
    A = { ...A, flee: A.flee * k, alert: A.alert * k };
    if (ctx.hurt || ctx.herdPanic || (m.state === "flee" && m.t > 0)) { if (m.state !== "flee") set("flee", pick(rng, 3, 5)); return { sp: A.run, tx: awayX, ty: awayY, hostile: false, emote: "❗" }; }
    if (d < A.flee) { set("flee", pick(rng, 3, 5)); return { sp: A.run, tx: awayX, ty: awayY, hostile: false, emote: "❗" }; }
    if (d < A.alert * (sleepy ? 0.6 : 1)) {
      // 멈춰서 바라본다(얼어붙기) → 가까워지거나 시간이 지나면 천천히 멀어진다
      if (m.state !== "alert") set("alert", A.freeze ?? 1.5);
      if (m.t > 0) return { sp: 0, tx: toX, ty: toY, hostile: false, emote: "❕" };
      return { sp: A.walk * 1.4, tx: awayX, ty: awayY, hostile: false, emote: "❕" };
    }
  } else if (A.kind === "defensive") {
    if (ctx.hurt || m.state === "charge") {
      if (m.state !== "charge") set("charge", pick(rng, 2.5, 4));
      if (m.t <= 0) { set("walk", pick(rng, 2, 4)); return { sp: A.walk, tx: awayX, ty: awayY, hostile: false }; } // 돌진 뒤 숨 고르며 물러남
      return { sp: A.run, tx: toX, ty: toY, hostile: true, emote: "💢" };
    }
    if (d < A.warn) {
      if (m.state !== "warn") set("warn", 1.6);
      if (m.t <= 0 && rng() < (A.chargeOnWarn ?? 0.25)) { set("charge", 2.5); return { sp: A.run, tx: toX, ty: toY, hostile: true, emote: "💢" }; }
      return { sp: 0, tx: toX, ty: toY, hostile: false, emote: "💢" }; // 발 구르며 노려봄
    }
    if (d < A.alert && m.state !== "graze") return { sp: 0, tx: toX, ty: toY, hostile: false, emote: "❕" };
  } else if (A.kind === "territorial") {
    if (ctx.hurt || ctx.packAggro || d < A.attack) { set("attack", 3); return { sp: A.run, tx: toX, ty: toY, hostile: true, emote: "💢" }; }
    if (d < A.warn) { if (m.state !== "warn") set("warn", 2.5); if (m.t <= 0) { set("attack", 3); } return { sp: 0, tx: toX, ty: toY, hostile: false, emote: "💢" }; } // 으르렁
    if (d < A.alert) return { sp: 0, tx: toX, ty: toY, hostile: false, emote: "❕" };
  } else if (A.kind === "predator") {
    const bold = night ? 1.4 : 1;
    if (ctx.hurt || ctx.packAggro || d < A.attack * bold) { set("attack", 4); return { sp: A.run, tx: toX, ty: toY, hostile: true, emote: "💢" }; }
    if (d < A.stalk * bold) {
      // 몸을 낮추고 천천히 다가오며 옆으로 돈다(정면을 피함)
      if (m.state !== "stalk") set("stalk", 6);
      const side = (m.uidSide ??= rng() < 0.5 ? -1 : 1);
      return { sp: A.walk * 1.2, tx: toX * 0.8 - toY * 0.6 * side, ty: toY * 0.8 + toX * 0.6 * side, hostile: false, emote: "👀" };
    }
  }

  // 2) 평상시: 쉬기 / 풀 뜯기 / 천천히 걷기를 번갈아(쉬지 않고 움직이지 않는다)
  if (m.t <= 0 || !["rest", "graze", "walk"].includes(m.state)) {
    const r = rng();
    if (sleepy && r < 0.75) set("rest", pick(rng, 8, 20));
    else if (r < (A.graze ?? 0.5)) set("graze", pick(rng, 3, 9));
    else { set("walk", pick(rng, 2, 5)); const a = rng() * Math.PI * 2; m.wx = Math.cos(a); m.wy = Math.sin(a); }
    // 무리에서 너무 멀면 무리 쪽으로
    if (ctx.herdDx !== undefined && Math.hypot(ctx.herdDx, ctx.herdDy) > 90) { const h = Math.hypot(ctx.herdDx, ctx.herdDy); m.wx = ctx.herdDx / h; m.wy = ctx.herdDy / h; set("walk", 2.5); }
  }
  if (m.state === "walk") return { sp: A.walk, tx: m.wx || 0, ty: m.wy || 0, hostile: false };
  return { sp: 0, tx: 0, ty: 0, hostile: false, emote: m.state === "rest" ? "💤" : null };
}
export function herdSize(type, rng = Math.random) { const h = AI[type]?.herd || [1, 1]; return h[0] + Math.floor(rng() * (h[1] - h[0] + 1)); }
