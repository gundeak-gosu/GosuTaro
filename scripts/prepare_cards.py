"""
Rider-Waite-Smith 1909 (Public Domain) tarot deck asset pipeline.

Source: Wikimedia Commons, Category:Rider-Waite tarot deck (Roses & Lilies)
        https://commons.wikimedia.org/wiki/Category:Rider-Waite_tarot_deck_(Roses_%26_Lilies)
        Public Domain Mark 1.0 (1909 publication, artist Pamela Colman Smith d. 1951).

Downloads the 78 individual card scans, resizes them to a consistent web-friendly
size, and writes them into assets/cards/ using the filename convention consumed
by the CARDS array in index.html.

Usage: python scripts/prepare_cards.py
"""
import json
import os
import time
import urllib.parse
import urllib.request

from PIL import Image

HEADERS = {"User-Agent": "TaroCardFetcher/1.0 (personal project asset prep; contact info@gfkbio.com)"}
API = "https://commons.wikimedia.org/w/api.php"

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(ROOT, "assets", "cards-source", "raw")
OUT_DIR = os.path.join(ROOT, "assets", "cards")

TARGET_W = 360
TARGET_H = 624
JPEG_QUALITY = 82

MAJOR_NAMES = [
    "Fool", "Magician", "High Priestess", "Empress", "Emperor", "Hierophant",
    "Lovers", "Chariot", "Strength", "Hermit", "Wheel of Fortune", "Justice",
    "Hanged Man", "Death", "Temperance", "Devil", "Tower", "Star", "Moon",
    "Sun", "Judgement", "World",
]
SUITS = ["Cups", "Pentacles", "Swords", "Wands"]


def api_get(params):
    url = API + "?" + params
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def build_title_list():
    titles = []
    for i, name in enumerate(MAJOR_NAMES):
        titles.append((f"File:RWS1909 - {i:02d} {name}.jpeg", f"major-{i:02d}"))
    for suit in SUITS:
        for n in range(1, 15):
            titles.append((f"File:RWS1909 - {suit} {n:02d}.jpeg", f"{suit.lower()}-{n:02d}"))
    return titles


def fetch_url_for_title(title):
    params = "action=query&titles=" + urllib.parse.quote(title) + "&prop=imageinfo&iiprop=url&format=json"
    data = api_get(params)
    pages = data["query"]["pages"]
    for _, page in pages.items():
        info = page.get("imageinfo")
        if info:
            return info[0]["url"]
    return None


def download(url, dest):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as r, open(dest, "wb") as f:
        f.write(r.read())


def resize_and_save(src_path, dest_path):
    im = Image.open(src_path).convert("RGB")
    im = im.resize((TARGET_W, TARGET_H), Image.LANCZOS)
    im.save(dest_path, "JPEG", quality=JPEG_QUALITY, optimize=True)


def main():
    os.makedirs(RAW_DIR, exist_ok=True)
    os.makedirs(OUT_DIR, exist_ok=True)

    titles = build_title_list()
    print(f"{len(titles)} cards to fetch")

    for title, key in titles:
        raw_path = os.path.join(RAW_DIR, key + ".jpg")
        out_path = os.path.join(OUT_DIR, key + ".jpg")

        if not os.path.exists(raw_path):
            url = fetch_url_for_title(title)
            if not url:
                print(f"  MISSING: {title}")
                continue
            download(url, raw_path)
            time.sleep(0.3)  # be polite to Commons

        resize_and_save(raw_path, out_path)
        print(f"  ok: {key}")

    print("Done. Optimized cards in", OUT_DIR)


if __name__ == "__main__":
    main()
