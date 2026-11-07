// 미니게임 — 모두 Promise 로 결과 {win, perf(0~1), ...} 를 돌려준다.
// 짧게(20~45초) 끝나도록 설계: 지루함을 끊는 '양념'이지 본편을 대체하지 않는다.
import { drawCharacter, drawAnimal, roundRect } from "./render.js";

function overlay(title, help) {
  const el = document.createElement("div");
  el.className = "mg";
  el.innerHTML = `<div class="mg-head"><b>${title}</b><span>${help}</span></div><canvas></canvas><div class="mg-foot"></div>`;
  document.body.appendChild(el);
  const cv = el.querySelector("canvas");
  const fit = () => {
    const W = 360, H = 540;
    const sc = Math.min((innerWidth - 16) / W, (innerHeight - 110) / H, 1.6);
    cv.style.width = W * sc + "px"; cv.style.height = H * sc + "px";
    const dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = W * dpr; cv.height = H * dpr;
    cv.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
    return sc;
  };
  let sc = fit();
  const onR = () => { sc = fit(); };
  addEventListener("resize", onR);
  const keys = new Set();
  const kd = (e) => { keys.add(e.key.toLowerCase()); if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(e.key.toLowerCase())) e.preventDefault(); };
  const ku = (e) => keys.delete(e.key.toLowerCase());
  addEventListener("keydown", kd); addEventListener("keyup", ku);
  const pointer = { down: false, x: 0, y: 0, tap: false };
  const toLocal = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / (r.width / 360), (e.clientY - r.top) / (r.height / 540)]; };
  cv.addEventListener("pointerdown", (e) => { pointer.down = true; pointer.tap = true; [pointer.x, pointer.y] = toLocal(e); cv.setPointerCapture(e.pointerId); });
  cv.addEventListener("pointermove", (e) => { if (pointer.down) [pointer.x, pointer.y] = toLocal(e); });
  cv.addEventListener("pointerup", () => { pointer.down = false; });
  const close = () => { removeEventListener("resize", onR); removeEventListener("keydown", kd); removeEventListener("keyup", ku); el.remove(); };
  return { el, ctx: cv.getContext("2d"), keys, pointer, close, foot: el.querySelector(".mg-foot") };
}

function loop(fn) {
  return new Promise((resolve) => {
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const r = fn(dt);
      if (r !== undefined) resolve(r); else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

function endScreen(ui, text, sub) {
  return new Promise((res) => {
    const d = document.createElement("div");
    d.className = "mg-end";
    d.innerHTML = `<h2>${text}</h2><p>${sub}</p><button class="btn primary">확인</button>`;
    ui.el.appendChild(d);
    d.querySelector("button").onclick = () => { ui.close(); res(); };
  });
}

// =============== 사격전 ===============
// opts: {title, duration, waves:[{type,count}], enemyHp, enemyAtk, playerHp, playerDmg, fireRate, boss, turrets, look, equip}
export async function shooter(opts) {
  const ui = overlay(opts.title || "사격전", "이동: WASD/방향키·화면 드래그 — 사격은 자동");
  const { ctx, keys, pointer } = ui;
  const P = { x: 180, y: 470, hp: opts.playerHp || 100, maxHp: opts.playerHp || 100, cd: 0, inv: 0, phase: 0, moving: false };
  const bullets = [], ebullets = [], enemies = [], fx = [];
  const total = opts.enemyCount || 14;
  let spawned = 0, kills = 0, time = 0, spawnT = 0;
  const duration = opts.duration || 40;
  let boss = opts.boss ? { x: 180, y: -60, hp: opts.boss.hp, maxHp: opts.boss.hp, cd: 2, phase: 0, entered: false } : null;
  const turrets = Array.from({ length: Math.min(4, opts.turrets || 0) }, (_, i) => ({ x: i % 2 ? 330 : 30, y: 400 - Math.floor(i / 2) * 80, cd: 0 }));

  const result = await loop((dt) => {
    time += dt;
    // 이동
    let mx = 0, my = 0;
    if (keys.has("a") || keys.has("arrowleft")) mx--; if (keys.has("d") || keys.has("arrowright")) mx++;
    if (keys.has("w") || keys.has("arrowup")) my--; if (keys.has("s") || keys.has("arrowdown")) my++;
    if (pointer.down) { const dx = pointer.x - P.x, dy = pointer.y - 40 - P.y; const L = Math.hypot(dx, dy); if (L > 6) { mx = dx / L; my = dy / L; } }
    const ml = Math.hypot(mx, my) || 1;
    P.moving = mx || my;
    P.x = Math.max(16, Math.min(344, P.x + (mx / ml) * 190 * dt));
    P.y = Math.max(200, Math.min(520, P.y + (my / ml) * 190 * dt));
    if (P.moving) P.phase += dt * 12;
    // 적 생성
    spawnT -= dt;
    if (spawned < total && spawnT <= 0) {
      spawnT = (duration * 0.7) / total;
      const ranged = Math.random() < (opts.rangedRatio ?? 0.35);
      enemies.push({ x: 20 + Math.random() * 320, y: -20, hp: opts.enemyHp, maxHp: opts.enemyHp, ranged, cd: 1 + Math.random() * 2, phase: 0 });
      spawned++;
    }
    // 보스
    if (boss && time > 3) {
      boss.entered = true;
      boss.y = Math.min(110, boss.y + 30 * dt);
      boss.x = 180 + Math.sin(time * 0.8) * 120;
      boss.cd -= dt;
      if (boss.cd <= 0) {
        boss.cd = 1.4;
        for (let k = -3; k <= 3; k++) { const a = Math.atan2(P.y - boss.y, P.x - boss.x) + k * 0.18; ebullets.push({ x: boss.x, y: boss.y + 20, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170, dmg: opts.enemyAtk * 1.2 }); }
      }
    }
    // 자동 사격(가장 가까운 적)
    P.cd -= dt;
    const targets = enemies.concat(boss && boss.entered && boss.hp > 0 ? [boss] : []);
    if (P.cd <= 0 && targets.length) {
      let best = null, bd = 1e9;
      for (const e of targets) { const d = Math.hypot(e.x - P.x, e.y - P.y); if (d < bd) { bd = d; best = e; } }
      if (bd < 380) {
        P.cd = 1 / (opts.fireRate || 3);
        const a = Math.atan2(best.y - P.y + 10, best.x - P.x);
        bullets.push({ x: P.x, y: P.y - 24, vx: Math.cos(a) * 420, vy: Math.sin(a) * 420, dmg: opts.playerDmg });
      }
    }
    for (const t of turrets) {
      t.cd -= dt;
      if (t.cd <= 0 && enemies.length) { t.cd = 0.7; const e = enemies[0]; const a = Math.atan2(e.y - t.y, e.x - t.x); bullets.push({ x: t.x, y: t.y, vx: Math.cos(a) * 400, vy: Math.sin(a) * 400, dmg: opts.playerDmg * 0.6, turret: true }); }
    }
    // 탄 이동/충돌
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i]; b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.y < -20 || b.x < -20 || b.x > 380 || b.y > 560) { bullets.splice(i, 1); continue; }
      for (const e of targets) {
        const r = e === boss ? 34 : 14;
        if (Math.hypot(e.x - b.x, e.y - 14 - b.y) < r) { e.hp -= b.dmg; fx.push({ x: b.x, y: b.y, t: 0.25, txt: Math.round(b.dmg) }); bullets.splice(i, 1); break; }
      }
    }
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.hp <= 0) { enemies.splice(i, 1); kills++; continue; }
      const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy);
      const sp = e.ranged ? (d > 220 ? 55 : 0) : 70;
      e.x += (dx / d) * sp * dt; e.y += (dy / d) * sp * dt; e.phase += dt * 10;
      if (e.ranged) { e.cd -= dt; if (e.cd <= 0) { e.cd = 2.2; ebullets.push({ x: e.x, y: e.y - 14, vx: (dx / d) * 200, vy: (dy / d) * 200, dmg: opts.enemyAtk }); } }
      else if (d < 22 && P.inv <= 0) { P.hp -= opts.enemyAtk; P.inv = 0.6; }
    }
    for (let i = ebullets.length - 1; i >= 0; i--) {
      const b = ebullets[i]; b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.y > 560 || b.y < -40 || b.x < -20 || b.x > 380) { ebullets.splice(i, 1); continue; }
      if (Math.hypot(P.x - b.x, P.y - 16 - b.y) < 12 && P.inv <= 0) { P.hp -= b.dmg; P.inv = 0.4; ebullets.splice(i, 1); }
    }
    P.inv -= dt;
    // 그리기
    ctx.fillStyle = "#3b352e"; ctx.fillRect(0, 0, 360, 540);
    ctx.fillStyle = "#463f37"; for (let i = 0; i < 30; i++) ctx.fillRect((i * 97) % 360, (i * 61 + time * 20) % 540, 30, 2);
    ctx.fillStyle = "#5c4630"; ctx.fillRect(0, 180, 360, 6); // 방어선
    for (const t of turrets) { ctx.fillStyle = "#555"; roundRect(ctx, t.x - 10, t.y - 10, 20, 20, 4); ctx.fill(); ctx.fillStyle = "#9ad"; ctx.fillRect(t.x - 2, t.y - 14, 4, 8); }
    for (const e of enemies) {
      drawCharacter(ctx, e.x, e.y, { skin: "#b98c6a", hair: "short", hairColor: "#111" }, { body: { id: e.ranged ? "leather_jacket" : "rag_shirt" }, legs: { id: "rag_pants" }, head: e.ranged ? { id: "gas_mask" } : null, hand: { id: e.ranged ? "pipe_pistol" : "machete" } }, e.x > P.x ? -1 : 1, e.phase, { moving: true, scale: 0.9 });
      ctx.fillStyle = "#e5534b"; ctx.fillRect(e.x - 10, e.y - 46, 20 * (e.hp / e.maxHp), 3);
    }
    if (boss && boss.entered && boss.hp > 0) {
      drawCharacter(ctx, boss.x, boss.y + 30, { skin: "#8d6e5a", hair: "mohawk", hairColor: "#111" }, { body: { id: "combat_vest" }, legs: { id: "leather_pants" }, head: { id: "helmet" }, back: { id: "royal_robe" }, hand: { id: "rifle" } }, 1, time * 3, { moving: true, scale: 1.9, detail: true });
      ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect(40, 10, 280, 10); ctx.fillStyle = "#c0392b"; ctx.fillRect(41, 11, 278 * Math.max(0, boss.hp / boss.maxHp), 8);
      ctx.fillStyle = "#fff"; ctx.font = "bold 11px sans-serif"; ctx.fillText(opts.boss.name || "보스", 44, 34);
    }
    ctx.globalAlpha = P.inv > 0 && Math.floor(time * 20) % 2 ? 0.4 : 1;
    drawCharacter(ctx, P.x, P.y, opts.look, opts.equip, 1, P.phase, { moving: P.moving, scale: 1.1, gender: opts.gender });
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ffd36b"; for (const b of bullets) ctx.fillRect(b.x - 2, b.y - 2, 4, 4);
    ctx.fillStyle = "#ff6b5b"; for (const b of ebullets) { ctx.beginPath(); ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2); ctx.fill(); }
    for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t -= dt; f.y -= 30 * dt; ctx.fillStyle = "#fff"; ctx.font = "10px sans-serif"; ctx.fillText(f.txt, f.x, f.y); if (f.t <= 0) fx.splice(i, 1); }
    // HUD
    ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(0, 512, 360, 28);
    ctx.fillStyle = "#7ed957"; ctx.fillRect(8, 520, 150 * Math.max(0, P.hp / P.maxHp), 10);
    ctx.strokeStyle = "#fff"; ctx.strokeRect(8, 520, 150, 10);
    ctx.fillStyle = "#fff"; ctx.font = "12px sans-serif";
    ctx.fillText(`처치 ${kills}/${total}${boss ? " + 보스" : ""}   ⏱ ${Math.max(0, Math.ceil(duration - time))}s`, 170, 530);

    const bossDead = !boss || boss.hp <= 0;
    if (P.hp <= 0) return { win: false, perf: kills / (total + (boss ? 5 : 0)), kills };
    if ((spawned >= total && enemies.length === 0 && bossDead) || (time >= duration && bossDead)) return { win: true, perf: Math.min(1, (kills / total) * 0.7 + (P.hp / P.maxHp) * 0.3), kills };
    if (time >= duration + (boss ? 30 : 0)) return { win: bossDead && kills >= total * 0.5, perf: kills / total * 0.6, kills };
  });
  await endScreen(ui, result.win ? "🏆 승리!" : "💥 패배…", `처치 ${result.kills} · 성과 ${(result.perf * 100).toFixed(0)}%`);
  return result;
}

// =============== 길들이기 (타이밍 링) ===============
export async function taming({ name, type, difficulty }) {
  const ui = overlay(`길들이기 — ${name}`, "바늘이 초록 구간에 올 때 탭/스페이스! 3번 성공하면 길들여짐");
  const { ctx, keys, pointer } = ui;
  let ang = 0, hits = 0, miss = 0, flash = 0, msg = "";
  const arc = (1 - difficulty) * 1.4 + 0.25;
  let target = Math.random() * Math.PI * 2;
  let speed = 2.4 + difficulty * 2.5;
  let prevSpace = false, t = 0;
  const result = await loop((dt) => {
    t += dt;
    ang = (ang + speed * dt) % (Math.PI * 2);
    const space = keys.has(" ") || keys.has("enter");
    const press = (space && !prevSpace) || pointer.tap;
    prevSpace = space; pointer.tap = false;
    if (press) {
      let d = Math.abs(((ang - target + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (d < arc / 2) { hits++; msg = "좋아!"; target = Math.random() * Math.PI * 2; speed *= 1.18; flash = 0.3; }
      else { miss++; msg = "놀라서 뒷걸음질친다…"; flash = -0.3; }
    }
    ctx.fillStyle = "#2c2924"; ctx.fillRect(0, 0, 360, 540);
    drawAnimal(ctx, type, 180, 200, t * 3, false, 1, hits >= 3);
    ctx.save(); ctx.translate(180, 380);
    ctx.lineWidth = 18; ctx.strokeStyle = "#4a4540"; ctx.beginPath(); ctx.arc(0, 0, 90, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "#5fcf6a"; ctx.beginPath(); ctx.arc(0, 0, 90, target - arc / 2, target + arc / 2); ctx.stroke();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(ang) * 104, Math.sin(ang) * 104); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = flash > 0 ? "#7ed957" : flash < 0 ? "#e5534b" : "#ddd"; flash *= 0.95;
    ctx.font = "bold 16px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(msg, 180, 270);
    ctx.fillStyle = "#fff"; ctx.font = "14px sans-serif";
    ctx.fillText(`신뢰 ${"❤️".repeat(hits)}${"🤍".repeat(Math.max(0, 3 - hits))}   경계 ${"⚠️".repeat(miss)}`, 180, 500);
    ctx.textAlign = "left";
    if (hits >= 3) return { win: true, perf: 1 - miss * 0.2 };
    if (miss >= 3) return { win: false, perf: hits / 3 };
  });
  await endScreen(ui, result.win ? `🐾 ${name}이(가) 당신을 따릅니다!` : "도망쳐 버렸다…", result.win ? "기지의 동물 우리(또는 곁)로 갑니다." : "먹이를 들고 다시 도전해 보세요.");
  return result;
}

// =============== 레이스 (3차선 회피) ===============
export async function race({ title = "폐허 질주", duration = 22, look, equip, gender, mount }) {
  const ui = overlay(title, "←/→ 또는 화면 좌/우 탭으로 차선 변경");
  const { ctx, keys, pointer } = ui;
  let lane = 1, x = 180, t = 0, hits = 0, spawn = 0, dist = 0, prevL = false, prevR = false;
  const obs = [];
  const speed0 = 220;
  const result = await loop((dt) => {
    t += dt;
    const sp = speed0 + t * 9;
    dist += sp * dt;
    const L = keys.has("arrowleft") || keys.has("a"), R = keys.has("arrowright") || keys.has("d");
    if (L && !prevL) lane = Math.max(0, lane - 1);
    if (R && !prevR) lane = Math.min(2, lane + 1);
    prevL = L; prevR = R;
    if (pointer.tap) { lane = pointer.x < 180 ? Math.max(0, lane - 1) : Math.min(2, lane + 1); pointer.tap = false; }
    x += (60 + lane * 120 - x) * Math.min(1, dt * 14);
    spawn -= dt;
    if (spawn <= 0) { spawn = Math.max(0.35, 0.9 - t * 0.02); obs.push({ lane: Math.floor(Math.random() * 3), y: -30, kind: Math.random() < 0.5 ? "🚧" : Math.random() < 0.5 ? "🪨" : "🛢️" }); }
    ctx.fillStyle = "#3a3632"; ctx.fillRect(0, 0, 360, 540);
    ctx.strokeStyle = "rgba(230,200,90,.5)"; ctx.setLineDash([20, 20]); ctx.lineDashOffset = -dist % 40; ctx.lineWidth = 3;
    for (const lx of [120, 240]) { ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, 540); ctx.stroke(); }
    ctx.setLineDash([]);
    for (let i = obs.length - 1; i >= 0; i--) {
      const o = obs[i]; o.y += sp * dt;
      ctx.font = "30px sans-serif"; ctx.textAlign = "center"; ctx.fillText(o.kind, 60 + o.lane * 120, o.y); ctx.textAlign = "left";
      if (!o.hit && Math.abs(o.y - 450) < 24 && o.lane === lane) { o.hit = true; hits++; }
      if (o.y > 580) obs.splice(i, 1);
    }
    drawCharacter(ctx, x, 470, look, equip, 1, t * 14, { moving: true, scale: 1.1, mount, gender });
    ctx.fillStyle = "#fff"; ctx.font = "13px sans-serif";
    ctx.fillText(`거리 ${Math.round(dist / 10)}m   충돌 ${hits}/5   ⏱ ${Math.max(0, Math.ceil(duration - t))}`, 10, 22);
    if (hits >= 5) return { win: false, perf: Math.min(1, t / duration) * 0.5 };
    if (t >= duration) return { win: true, perf: Math.max(0, 1 - hits * 0.18) };
  });
  await endScreen(ui, result.win ? "🏁 완주!" : "넘어졌다…", `성과 ${(result.perf * 100).toFixed(0)}%`);
  return result;
}

// =============== 타이밍 바 (씨름/요리/건축) ===============
export async function timing({ title, labels = ["준비", "힘!", "마무리"], rounds = 3 }) {
  const ui = overlay(title, "움직이는 막대가 금색 구간에 올 때 탭/스페이스");
  const { ctx, keys, pointer } = ui;
  let r = 0, pos = 0, dir = 1, scores = [], prev = false, wait = 0, t = 0;
  let sweet = 0.35 + Math.random() * 0.3;
  const result = await loop((dt) => {
    t += dt;
    if (wait > 0) wait -= dt;
    else { pos += dir * dt * (0.9 + r * 0.45); if (pos > 1) { pos = 1; dir = -1; } if (pos < 0) { pos = 0; dir = 1; } }
    const sp = keys.has(" ") || keys.has("enter");
    const press = ((sp && !prev) || pointer.tap) && wait <= 0;
    prev = sp; pointer.tap = false;
    if (press) { const acc = Math.max(0, 1 - Math.abs(pos - sweet) / 0.25); scores.push(acc); r++; wait = 0.6; sweet = 0.2 + Math.random() * 0.6; }
    ctx.fillStyle = "#29251f"; ctx.fillRect(0, 0, 360, 540);
    ctx.fillStyle = "#fff"; ctx.font = "bold 22px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(labels[Math.min(r, labels.length - 1)], 180, 160);
    ctx.fillStyle = "#4a443c"; roundRect(ctx, 30, 250, 300, 30, 8); ctx.fill();
    ctx.fillStyle = "#d4af37"; ctx.fillRect(30 + (sweet - 0.06) * 300, 250, 0.12 * 300, 30);
    ctx.fillStyle = "#fff"; ctx.fillRect(30 + pos * 300 - 3, 240, 6, 50);
    ctx.font = "14px sans-serif";
    ctx.fillText(scores.map((s) => (s > 0.8 ? "완벽" : s > 0.5 ? "좋음" : s > 0.2 ? "보통" : "실패")).join("  ·  "), 180, 340);
    ctx.textAlign = "left";
    if (r >= rounds && wait <= 0) { const perf = scores.reduce((a, b) => a + b, 0) / rounds; return { win: perf > 0.4, perf }; }
  });
  await endScreen(ui, result.perf > 0.75 ? "👏 훌륭해요!" : result.perf > 0.4 ? "괜찮았어요" : "아쉬워요", `성과 ${(result.perf * 100).toFixed(0)}%`);
  return result;
}

// =============== 구세계 퀴즈 ===============
const QUIZ = [
  ["물이 끓는 온도(1기압)는?", ["100℃", "80℃", "120℃", "60℃"], 0],
  ["방사능 피폭을 줄이는 3원칙이 아닌 것은?", ["시간", "거리", "차폐", "속도"], 3],
  ["감자는 어느 부위를 먹는 작물인가?", ["덩이줄기", "뿌리", "열매", "잎"], 0],
  ["훈제가 음식 보존에 좋은 이유는?", ["건조+항균 성분", "소금 때문", "얼리기 때문", "색 때문"], 0],
  ["북극성으로 찾을 수 있는 방향은?", ["북쪽", "남쪽", "동쪽", "서쪽"], 0],
  ["불을 피우는 3요소가 아닌 것은?", ["물", "연료", "산소", "열"], 0],
  ["사람이 물 없이 버틸 수 있는 대략적 기간은?", ["3일", "3주", "3시간", "3개월"], 0],
  ["상처 소독에 가장 적합한 것은?", ["끓여 식힌 물", "흙", "기름", "우유"], 0],
  ["말을 길들일 때 가장 중요한 것은?", ["신뢰와 반복", "큰 소리", "굶기기", "때리기"], 0],
  ["전기의 단위는?", ["볼트(V)", "그램(g)", "미터(m)", "리터(L)"], 0],
  ["소금에 절이면 상하지 않는 이유는?", ["삼투압으로 수분 제거", "맛이 짜서", "색이 변해서", "무거워져서"], 0],
  ["겨울 동상 예방에 가장 좋은 것은?", ["마른 옷 여러 겹", "젖은 옷", "얇은 옷 한 벌", "맨발"], 0],
];
export async function quiz({ title = "구세계 퀴즈" }) {
  return new Promise((resolve) => {
    const el = document.createElement("div");
    el.className = "mg";
    const qs = [...QUIZ].sort(() => Math.random() - 0.5).slice(0, 5);
    let i = 0, correct = 0;
    const render = () => {
      if (i >= qs.length) {
        el.innerHTML = `<div class="mg-end" style="position:static"><h2>${correct}/5 정답</h2><p>성과 ${(correct * 20)}%</p><button class="btn primary">확인</button></div>`;
        el.querySelector("button").onclick = () => { el.remove(); resolve({ win: correct >= 3, perf: correct / 5 }); };
        return;
      }
      const [q, opts, ans] = qs[i];
      const order = opts.map((o, k) => [o, k]).sort(() => Math.random() - 0.5);
      el.innerHTML = `<div class="mg-head"><b>${title} ${i + 1}/5</b><span>정답 ${correct}</span></div><div class="quiz"><h3>${q}</h3>${order.map(([o, k]) => `<button class="btn" data-k="${k}">${o}</button>`).join("")}</div>`;
      el.querySelectorAll("[data-k]").forEach((b) => (b.onclick = () => { if (+b.dataset.k === ans) correct++; i++; render(); }));
    };
    document.body.appendChild(el);
    render();
  });
}
