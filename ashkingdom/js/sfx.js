// 효과음 — 음원 파일 없이 WebAudio 로 즉석 합성(용량 0, 서버 트래픽 0).
// 나중에 실제 녹음/구매 음원으로 바꿀 때는 play(name) 의 내부만 교체하면 된다.
let ctx = null, on = true, master = null;
export function setEnabled(v) { on = !!v; }
function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C(); master = ctx.createGain(); master.gain.value = 0.35; master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}
// 사용자 첫 터치 때 오디오 잠금 해제(모바일 브라우저 정책)
if (typeof window !== "undefined") window.addEventListener("pointerdown", () => ac(), { once: true });

function tone(freq, dur, type = "sine", vol = 0.5, slide = 0, delay = 0) {
  const a = ac(); if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol = 0.4, hp = 800, delay = 0) {
  const a = ac(); if (!a) return;
  const t = a.currentTime + delay;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = a.createBufferSource(); s.buffer = buf;
  const f = a.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp;
  const g = a.createGain(); g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(master); s.start(t);
}

const SOUNDS = {
  click: () => tone(660, 0.05, "square", 0.15),
  chop: () => { noise(0.08, 0.5, 400); tone(140, 0.08, "triangle", 0.4, -60); },
  mine: () => { tone(900, 0.06, "square", 0.25, -400); noise(0.05, 0.3, 2000); },
  gather: () => { noise(0.12, 0.25, 1500); tone(420, 0.08, "sine", 0.2, 120); },
  hit: () => { noise(0.07, 0.5, 600); tone(180, 0.1, "sawtooth", 0.3, -120); },
  shoot: () => { noise(0.12, 0.7, 300); tone(90, 0.15, "square", 0.3, -50); },
  hurt: () => { tone(220, 0.18, "sawtooth", 0.35, -140); },
  craft: () => { tone(520, 0.07, "triangle", 0.3); tone(780, 0.1, "triangle", 0.3, 0, 0.07); },
  build: () => { [0, 0.09, 0.18].forEach((d) => { noise(0.06, 0.4, 300, d); tone(160, 0.06, "square", 0.25, 0, d); }); },
  levelup: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, "triangle", 0.3, 0, i * 0.09)); },
  good: () => { tone(660, 0.1, "sine", 0.25); tone(990, 0.14, "sine", 0.25, 0, 0.08); },
  bad: () => { tone(300, 0.2, "sawtooth", 0.25, -120); },
  eat: () => { [0, 0.1].forEach((d) => noise(0.05, 0.3, 1200, d)); },
  death: () => { tone(330, 0.6, "sawtooth", 0.35, -250); tone(165, 0.8, "sine", 0.3, -80, 0.1); },
  tame: () => { tone(880, 0.1, "sine", 0.25, 220); tone(1320, 0.12, "sine", 0.2, 0, 0.08); },
};
let last = {};
export function play(name) {
  if (!on || !SOUNDS[name]) return;
  const now = performance.now();
  if (last[name] && now - last[name] < 45) return; // 같은 소리 폭주 방지
  last[name] = now;
  try { SOUNDS[name](); } catch { /* 오디오 불가 환경 */ }
}
