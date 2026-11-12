#!/usr/bin/env python3
"""Extract CC0 PBR material presets from access/Texture/01 into the web client.

Poly Haven 1K-JPG packs ship Color / NormalGL / Roughness maps at 1K. We
downscale them to 512px JPEGs so a full starter library stays inside a few
hundred kilobytes, then write a manifest the Studio material picker reads.

Usage:
    python scripts/extract_material_presets.py
"""

from __future__ import annotations

import io
import json
import sys
import zipfile
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover - documented prerequisite
    print("Pillow is required: pip install Pillow", file=sys.stderr)
    raise SystemExit(1)

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "access" / "Texture" / "01"
OUTPUT_DIR = ROOT / "mochi" / "public" / "materials"

TARGET_SIZE = 512
COLOR_QUALITY = 85
DATA_QUALITY = 92

# id -> (archive stem, display name, category)
PRESETS: dict[str, tuple[str, str, str]] = {
    "brick_red": ("Bricks097", "Red Brick", "masonry"),
    "concrete_plain": ("Concrete034", "Plain Concrete", "concrete"),
    "wood_planks": ("Planks019", "Wood Planks", "wood"),
    "metal_plate": ("Metal020", "Metal Plate", "metal"),
    "diamond_plate": ("DiamondPlate008A", "Diamond Plate", "metal"),
    "grass_field": ("Grass003", "Grass Field", "nature"),
    "stone_paving": ("PavingStones057", "Stone Paving", "stone"),
    "marble_white": ("Marble016", "White Marble", "stone"),
    "lava_flow": ("Lava001", "Lava Flow", "nature"),
    "fabric_weave": ("Fabric070", "Woven Fabric", "fabric"),
}

MAP_SUFFIXES = {
    "color": ("_Color.jpg", COLOR_QUALITY),
    "normal": ("_NormalGL.jpg", DATA_QUALITY),
    "roughness": ("_Roughness.jpg", DATA_QUALITY),
}


def resize_and_save(raw: bytes, target: Path, quality: int, grayscale: bool) -> int:
    with Image.open(io.BytesIO(raw)) as image:
        converted = image.convert("L" if grayscale else "RGB")
        converted = converted.resize((TARGET_SIZE, TARGET_SIZE), Image.LANCZOS)
        converted.save(target, format="JPEG", quality=quality, optimize=True)
    return target.stat().st_size


def extract_one(preset_id: str, stem: str, label: str, category: str) -> dict | None:
    archive = SOURCE_DIR / f"{stem}_1K-JPG.zip"
    if not archive.exists():
        print(f"skip {preset_id}: missing {archive.name}")
        return None

    target_dir = OUTPUT_DIR / preset_id
    target_dir.mkdir(parents=True, exist_ok=True)

    maps: dict[str, str] = {}
    total_bytes = 0

    with zipfile.ZipFile(archive) as zf:
        names = zf.namelist()
        for map_name, (suffix, quality) in MAP_SUFFIXES.items():
            entry = next((n for n in names if n.endswith(suffix)), None)
            if not entry:
                continue
            output_name = f"{map_name}.jpg"
            size = resize_and_save(
                zf.read(entry),
                target_dir / output_name,
                quality,
                grayscale=(map_name == "roughness"),
            )
            maps[map_name] = f"/materials/{preset_id}/{output_name}"
            total_bytes += size

    if "color" not in maps:
        print(f"skip {preset_id}: no color map inside {archive.name}")
        return None

    return {
        "id": preset_id,
        "name": label,
        "category": category,
        "source": f"access/Texture/01/{archive.name}",
        "license": "CC0",
        "maps": maps,
        "bytes": total_bytes,
    }


def main() -> int:
    if not SOURCE_DIR.exists():
        print(f"source directory not found: {SOURCE_DIR}", file=sys.stderr)
        return 1

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = []
    for preset_id, (stem, label, category) in PRESETS.items():
        entry = extract_one(preset_id, stem, label, category)
        if entry:
            manifest.append(entry)
            print(f"extracted {preset_id} <- {stem} ({entry['bytes'] // 1024} KB)")

    manifest_path = OUTPUT_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    total = sum(entry["bytes"] for entry in manifest)
    print(f"wrote {manifest_path} ({len(manifest)} presets, {total // 1024} KB total)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
