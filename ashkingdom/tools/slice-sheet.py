#!/usr/bin/env python3
"""챗GPT(OpenAI) 캐릭터 시트 → 게임 그림 조각.
사용: python3 tools/slice-sheet.py <시트.png> <출력폴더>
시트는 1536x1024, 유하린 시트와 같은 배치(표정 7칸 · SD 7칸 · 의상 6칸)를 가정한다."""
import sys
from PIL import Image
from collections import deque
src, out = sys.argv[1], sys.argv[2].rstrip("/") + "/"
im = Image.open(src).convert("RGB")
if im.size != (1536, 1024): im = im.resize((1536, 1024), Image.LANCZOS)
for i, n in enumerate(["smile", "joy", "surprised", "worried", "shy", "angry", "sleepy"]):
    x = 468 + i * 101
    im.crop((x + 4, 594, x + 88, 716)).resize((168, 244), Image.LANCZOS).save(out + f"face_{n}.png")
boxes = [(458, 842, 552, 962), (548, 842, 642, 962), (633, 842, 727, 962), (728, 842, 836, 962), (832, 842, 940, 962), (936, 842, 1046, 962), (1046, 842, 1150, 962)]
for b, n in zip(boxes, ["idle", "happy", "cheer", "shoot", "pack", "campfire", "sleep"]):
    c = im.crop(b).convert("RGBA"); w, h = c.size; px = c.load(); bg = px[1, h - 2][:3]
    seen = set(); q = deque([(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)])
    while q:
        x, y = q.popleft()
        if (x, y) in seen or not (0 <= x < w and 0 <= y < h): continue
        seen.add((x, y)); p = px[x, y]
        if sum(abs(p[k] - bg[k]) for k in range(3)) >= 48: continue
        px[x, y] = (0, 0, 0, 0); q.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])
    c.crop(c.getbbox()).save(out + f"sd_{n}.png")
im.crop((824, 160, 926, 512)).save(out + "full_survivor.png")
print("saved to", out)
