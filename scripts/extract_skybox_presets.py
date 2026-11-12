#!/usr/bin/env python3
"""Extract CC0 starter skybox presets from access/Sky into the web client.

Each Poly Haven sky package ships a 1K HDR EXR (environment lighting) plus a
tonemapped JPG (UI thumbnail). We copy only those two files so the runtime can
light scenes with real HDR data while the Studio grid stays lightweight.

Usage:
    python scripts/extract_skybox_presets.py
"""

from __future__ import annotations

import json
import shutil
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "access" / "Sky"
OUTPUT_DIR = ROOT / "mochi" / "public" / "skyboxes"

# id -> (archive stem, display name, lighting hints)
PRESETS: dict[str, tuple[str, str, dict]] = {
    "day_clear": ("DaySkyHDRI005B", "Day Clear", {"exposure": 1.0, "sunIntensity": 2.2}),
    "day_soft": ("DaySkyHDRI068B", "Day Soft", {"exposure": 1.05, "sunIntensity": 1.8}),
    "day_bright": ("DaySkyHDRI070B", "Day Bright", {"exposure": 0.95, "sunIntensity": 2.6}),
    "day_haze": ("DaySkyHDRI071B", "Day Haze", {"exposure": 1.1, "sunIntensity": 1.6}),
    "sunset": ("EveningSkyHDRI047B", "Sunset", {"exposure": 1.15, "sunIntensity": 1.4}),
    "night_stars": ("NightSkyHDRI008", "Night Stars", {"exposure": 1.3, "sunIntensity": 0.35}),
    "night_moon": ("NightSkyHDRI013", "Night Moon", {"exposure": 1.25, "sunIntensity": 0.5}),
}


def extract_one(preset_id: str, archive_stem: str, label: str, hints: dict) -> dict | None:
    archive = SOURCE_DIR / f"{archive_stem}_1K.zip"
    if not archive.exists():
        print(f"skip {preset_id}: missing {archive.name}")
        return None

    target = OUTPUT_DIR / preset_id
    target.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(archive) as zf:
        names = zf.namelist()
        exr = next((n for n in names if n.lower().endswith("_hdr.exr")), None)
        jpg = next((n for n in names if n.lower().endswith("_tonemapped.jpg")), None)
        if not exr:
            print(f"skip {preset_id}: no HDR EXR inside {archive.name}")
            return None
        with zf.open(exr) as src, open(target / "env.exr", "wb") as dst:
            shutil.copyfileobj(src, dst)
        if jpg:
            with zf.open(jpg) as src, open(target / "preview.jpg", "wb") as dst:
                shutil.copyfileobj(src, dst)

    return {
        "id": preset_id,
        "name": label,
        "source": f"access/Sky/{archive.name}",
        "license": "CC0",
        "environment": f"/skyboxes/{preset_id}/env.exr",
        "preview": f"/skyboxes/{preset_id}/preview.jpg" if (target / "preview.jpg").exists() else None,
        **hints,
    }


def main() -> int:
    if not SOURCE_DIR.exists():
        print(f"source directory not found: {SOURCE_DIR}", file=sys.stderr)
        return 1

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = []
    for preset_id, (stem, label, hints) in PRESETS.items():
        entry = extract_one(preset_id, stem, label, hints)
        if entry:
            manifest.append(entry)
            print(f"extracted {preset_id} <- {stem}")

    manifest_path = OUTPUT_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {manifest_path} ({len(manifest)} presets)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
