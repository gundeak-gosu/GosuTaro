#!/usr/bin/env python3
"""투명 배경 SD 줄(sd_row.png) → 포즈 7장. 알파가 있는 열 덩어리로 나눈다."""
import sys
from PIL import Image
d = sys.argv[1].rstrip("/") + "/"
im = Image.open(d + "sd_row.png").convert("RGBA"); W, H = im.size
# 초록 배경 빼기(크로마키): 초록이 빨강·파랑보다 확실히 강하면 투명, 가장자리는 반투명 + 초록 번짐 제거
px = im.load()
for y in range(H):
    for x in range(W):
        r, g, b, _ = px[x, y]
        k = g - max(r, b)
        if k > 70: px[x, y] = (0, 0, 0, 0)
        elif k > 25: px[x, y] = (r, min(g, max(r, b) + 10), b, int(255 * (70 - k) / 45))
a = im.split()[3].load()
cols = [sum(a[x, y] > 20 for y in range(0, H, 2)) for x in range(W)]
segs, ins, s0 = [], False, 0
for x in range(W):
    on = cols[x] > 2
    if on and not ins: ins, s0 = True, x
    if not on and ins:
        ins = False
        if x - s0 > 30: segs.append((s0, x))
segs = sorted(sorted(segs, key=lambda s: s[1] - s[0], reverse=True)[:7])
# 붙어 있는 포즈(모닥불 돌·잠자는 몸 등)는 가장 넓은 덩어리를 가장 얇은 열에서 둘로 나눈다
while len(segs) < 7 and segs:
    i = max(range(len(segs)), key=lambda k: segs[k][1] - segs[k][0]); x0, x1 = segs[i]
    lo, hi = x0 + (x1 - x0) * 3 // 10, x0 + (x1 - x0) * 7 // 10
    cut = min(range(lo, hi), key=lambda x: cols[x])
    segs[i:i + 1] = [(x0, cut), (cut, x1)]
print("포즈", len(segs))
for (x0, x1), n in zip(segs, ["idle", "happy", "cheer", "shoot", "pack", "campfire", "sleep"]):
    c = im.crop((x0, 0, x1, H)); c = c.crop(c.getbbox())
    c.thumbnail((240, 240), Image.LANCZOS)
    c.save(d + f"sd_{n}.png")
