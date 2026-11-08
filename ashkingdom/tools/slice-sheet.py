#!/usr/bin/env python3
"""챗GPT(OpenAI) 캐릭터 시트 → 게임 그림 조각(표정 7 · SD 7 · 기본복 전신).
사용: python3 tools/slice-sheet.py <시트.png> <출력폴더>
시트마다 칸 위치가 조금씩 달라서, '표정'·'SD' 줄을 자동으로 찾는다:
  1) 화면을 가로 띠로 훑어 내용이 있는 줄(밝기 변화가 큰 띠)을 찾고, 아래에서 두 번째=표정, 맨 아래=SD
  2) 그 띠 안에서 세로로 비어 있는 틈을 기준으로 7덩어리로 나눈다"""
import sys
from PIL import Image, ImageFilter
from collections import deque
src, out = sys.argv[1], sys.argv[2].rstrip("/") + "/"
im = Image.open(src).convert("RGB")
if im.size != (1536, 1024): im = im.resize((1536, 1024), Image.LANCZOS)
g = im.convert("L").filter(ImageFilter.FIND_EDGES)
W, H = g.size; px = g.load()
def rowE(y, x0=0, x1=W): return sum(px[x, y] > 40 for x in range(x0, x1, 2))
def colE(x, y0, y1): return sum(px[x, y] > 40 for y in range(y0, y1, 2))
# 아래 절반에서 내용 띠 찾기
rows = [rowE(y) for y in range(H)]
bands, inb, st = [], False, 0
for y in range(H // 2, H):
    on = rows[y] > 25
    if on and not inb: inb, st = True, y
    if not on and inb:
        inb = False
        if y - st > 60: bands.append((st, y))
if inb and H - st > 60: bands.append((st, H))
assert len(bands) >= 2, f"띠를 못 찾음: {bands}"
face_band, sd_band = bands[-2], bands[-1]
def split7(y0, y1):
    cols = [colE(x, y0, y1) for x in range(W)]
    segs, ins, s0 = [], False, 0
    for x in range(W):
        on = cols[x] > 3
        if on and not ins: ins, s0 = True, x
        if not on and ins:
            ins = False
            if x - s0 > 25: segs.append((s0, x))
    # 큰 덩어리 7개(라벨·제목 제외: 폭 순)
    segs = sorted(sorted(segs, key=lambda s: s[1] - s[0], reverse=True)[:7])
    return segs
faces = split7(face_band[0] + 30, face_band[1] - 25)
sds = split7(sd_band[0] + 40, sd_band[1] - 5)
print("표정 띠", face_band, len(faces), "SD 띠", sd_band, len(sds))
if len(faces) != 7:  # 못 찾으면 참고 시트(유하린)와 같은 자리로
    faces = [(468 + i * 101, 468 + i * 101 + 92) for i in range(7)]; face_band = (566, 744)
for (x0, x1), n in zip(faces, ["smile", "joy", "surprised", "worried", "shy", "angry", "sleepy"]):
    im.crop((x0 + 3, face_band[0] + 28, x1 - 3, face_band[1] - 28)).resize((168, 244), Image.LANCZOS).save(out + f"face_{n}.png")
for (x0, x1), n in zip(sds, ["idle", "happy", "cheer", "shoot", "pack", "campfire", "sleep"]):
    c = im.crop((x0 - 4, sd_band[0] + 30, x1 + 4, sd_band[1] - 4)).convert("RGBA"); w, h = c.size; p = c.load(); bg = p[1, h - 2][:3]
    seen = set(); q = deque([(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)])
    while q:
        x, y = q.popleft()
        if (x, y) in seen or not (0 <= x < w and 0 <= y < h): continue
        seen.add((x, y)); v = p[x, y]
        if sum(abs(v[k] - bg[k]) for k in range(3)) >= 48: continue
        p[x, y] = (0, 0, 0, 0); q.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])
    c.crop(c.getbbox()).save(out + f"sd_{n}.png")
print("saved to", out)
