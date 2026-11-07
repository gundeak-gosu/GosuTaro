// 배경음악 — 음원 파일 없이 WebAudio 로 즉석 연주(용량 0). 분위기별로 음계·빠르기·악기가 바뀐다.
//  day: 밝은 5음계, 잔잔한 뜯는 소리 / night: 단조, 느리고 어두움 / combat: 빠른 북 + 긴장 / base: 따뜻한 화음 / winter: 높은 종소리
// 나중에 작곡된 음원으로 바꿀 때는 setMood() 에서 <audio> 재생으로 교체하면 된다.
let ctx = null, out = null, on = true, mood = null, timer = null, step = 0, nextT = 0;
const MOODS = {
  day: { bpm: 84, root: 57, scale: [0, 2, 4, 7, 9], wave: "triangle", pad: [0, 7, 12], drum: 0, vol: 0.11 },
  night: { bpm: 62, root: 52, scale: [0, 3, 5, 7, 10], wave: "sine", pad: [0, 3, 7], drum: 0, vol: 0.1 },
  combat: { bpm: 132, root: 50, scale: [0, 1, 5, 7, 8], wave: "sawtooth", pad: [0, 7], drum: 1, vol: 0.09 },
  base: { bpm: 72, root: 55, scale: [0, 2, 4, 7, 9, 11], wave: "triangle", pad: [0, 4, 7, 11], drum: 0, vol: 0.1 },
  winter: { bpm: 66, root: 64, scale: [0, 2, 5, 7, 9], wave: "sine", pad: [0, 5, 9], drum: 0, vol: 0.09 },
};
const f = (m) => 440 * Math.pow(2, (m - 69) / 12);
function ac() {
  if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ctx = new C(); out = ctx.createGain(); out.gain.value = 0; out.connect(ctx.destination); }
  return ctx;
}
function note(freq, t, dur, wave, vol) {
  const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
  o.type = wave; o.frequency.value = freq; lp.type = "lowpass"; lp.frequency.value = 1800;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(lp); lp.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
}
function drum(t, hard) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(hard ? 120 : 80, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
  g.gain.setValueAtTime(hard ? 0.35 : 0.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.2);
}
function tick() {
  const M = MOODS[mood];
  if (!M || !ctx) return;
  const beat = 60 / M.bpm / 2; // 8분음표
  while (nextT < ctx.currentTime + 0.3) {
    const bar = Math.floor(step / 16), s = step % 16;
    // 4마디마다 화음(패드) 바꾸기: I - vi - IV - V 느낌
    const prog = [0, -3, 5, 7][bar % 4];
    if (s === 0) for (const iv of M.pad) note(f(M.root - 12 + prog + iv), nextT, beat * 15, "sine", M.vol * 0.5);
    // 멜로디: 결정적 무작위(같은 분위기는 같은 곡 느낌)
    const h = Math.sin(step * 12.9898 + bar * 78.233) * 43758.5453; const r = h - Math.floor(h);
    if (r < (mood === "combat" ? 0.7 : 0.45)) {
      const deg = M.scale[Math.floor(r * 100) % M.scale.length] + (r > 0.3 ? 12 : 0);
      note(f(M.root + prog + deg), nextT, beat * (mood === "night" ? 3 : 1.6), M.wave, M.vol * (mood === "winter" ? 0.8 : 0.6));
    }
    if (M.drum && s % 4 === 0) drum(nextT, s % 8 === 0);
    if (M.drum && s % 4 === 2) drum(nextT, false);
    nextT += beat; step++;
  }
}
export function setEnabled(v) {
  on = !!v;
  if (!ctx) return;
  out.gain.setTargetAtTime(on && mood ? 0.9 : 0, ctx.currentTime, 0.4);
}
// 분위기 전환(같으면 무시) — 0.6초에 걸쳐 부드럽게
export function setMood(m) {
  if (m === mood) return;
  if (!ac()) return;
  if (ctx.state === "suspended") ctx.resume();
  mood = m; step = 0; nextT = ctx.currentTime + 0.1;
  out.gain.cancelScheduledValues(ctx.currentTime);
  out.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.6);
  if (!timer) timer = setInterval(tick, 120);
}
export const currentMood = () => mood;
