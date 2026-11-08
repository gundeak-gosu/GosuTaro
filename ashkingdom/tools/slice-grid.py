# 격자 시트(gen-grid.mjs 결과)를 칸별 그림으로 자른다.
#  아이콘/오브젝트: 초록 배경(크로마키) 제거 → 내용만 남기고 정사각형 → webp
#  지형(texture): 칸 안쪽을 잘라 '이음매 없는' 텍스처로 만든다(반 칸 밀어 겹쳐 섞기) → webp
# 사용: python3 tools/slice-grid.py <spec.json> <sheet.png> <out_dir> [size]
import sys, json, os
import numpy as np
from PIL import Image

spec = json.load(open(sys.argv[1]))
sheet = Image.open(sys.argv[2]).convert("RGB")
out = sys.argv[3]
os.makedirs(out, exist_ok=True)
cols, rows = spec["cols"], spec["rows"]
ids = spec.get("ids") or [str(i) for i in range(cols * rows)]
W, H = sheet.size
cw, ch = W / cols, H / rows
kind = spec.get("kind", "icon")
size = int(sys.argv[4]) if len(sys.argv) > 4 else (256 if kind == "texture" else 160 if kind == "object" else 128)


def chroma(a):
    a = a.astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    k = g - np.maximum(r, b)
    alpha = np.clip((70 - k) * 255 / 45, 0, 255)
    alpha[k <= 25] = 255
    spill = k > 0
    g2 = np.where(spill, np.maximum(r, b) + np.minimum(k, 10), g)  # 초록 번짐 제거
    return np.dstack([r, g2, b, alpha]).clip(0, 255).astype(np.uint8)


def seamless(img):
    a = np.asarray(img).astype(np.float32)
    h, w = a.shape[:2]
    rolled = np.roll(np.roll(a, h // 2, 0), w // 2, 1)
    y = np.minimum(np.arange(h), h - 1 - np.arange(h)) / (h / 2)
    x = np.minimum(np.arange(w), w - 1 - np.arange(w)) / (w / 2)
    m = np.minimum(y[:, None], x[None, :])
    m = np.clip(m * 2.2, 0, 1)[..., None]  # 가장자리 근처만 섞는다
    return Image.fromarray((a * m + rolled * (1 - m)).astype(np.uint8))


for i, id_ in enumerate(ids):
    if id_.startswith("_"):
        continue
    c, r = i % cols, i // cols
    box = (round(c * cw), round(r * ch), round((c + 1) * cw), round((r + 1) * ch))
    cell = sheet.crop(box)
    if kind == "texture":
        inset = int(cw * 0.04)
        cell = cell.crop((inset, inset, cell.width - inset, cell.height - inset)).resize((size, size), Image.LANCZOS)
        seamless(cell).save(os.path.join(out, id_ + ".webp"), quality=86)
        continue
    rgba = chroma(np.asarray(cell))
    al = rgba[..., 3]
    # 칸 가장자리에 걸친 이웃 그림 조각은 버린다: 가장자리 2px 띠는 투명 처리
    al[:2, :] = 0; al[-2:, :] = 0; al[:, :2] = 0; al[:, -2:] = 0
    # 이웃 칸에서 넘어온 조각 제거: 가장 큰 덩어리와, 그 근처(가까운) 덩어리만 남긴다
    from scipy import ndimage
    lab, n = ndimage.label(ndimage.binary_dilation(al > 40, iterations=3))
    if n > 1:
        sizes = ndimage.sum(al > 40, lab, range(1, n + 1))
        big = int(np.argmax(sizes)) + 1
        keep = [i + 1 for i, sz in enumerate(sizes) if i + 1 == big or sz > sizes.max() * 0.12]
        al[~np.isin(lab, keep)] = 0
    ys, xs = np.where(al > 40)
    if len(xs) == 0:
        print("빈 칸:", id_); continue
    im = Image.fromarray(rgba).crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    s = max(im.width, im.height)
    canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    # 오브젝트는 바닥 맞춤(발이 아래), 아이콘은 가운데
    oy = (s - im.height) if kind == "object" else (s - im.height) // 2
    canvas.paste(im, ((s - im.width) // 2, oy), im)
    canvas.resize((size, size), Image.LANCZOS).save(os.path.join(out, id_ + ".webp"), quality=88)
print("완료:", out, len(ids))
