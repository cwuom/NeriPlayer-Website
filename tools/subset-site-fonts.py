"""Extend the published CJK role fonts using matching complete upstream sources.

Run collect-glyphs.mjs first, then pass the directory containing the verified
NotoSerifSC-wght.ttf, LXGWWenKai-Regular.ttf and MiSans/woff2 sources:
    python tools/subset-site-fonts.py --source-dir PATH
    python tools/subset-critical-fonts.py

Existing font URLs remain untouched. New assets are named after their bytes.
"""

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re

from fontTools.ttLib import TTFont


ROOT = Path(__file__).resolve().parent.parent
module_spec = importlib.util.spec_from_file_location("critical_fonts", Path(__file__).with_name("subset-critical-fonts.py"))
fonts = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(fonts)

# CSS descriptors retain the original desktop source mapping
MISANS = {400: "Normal", 500: "Regular", 600: "Medium", 700: "Semibold", 800: "Bold"}


def cmap(path):
    with TTFont(path) as font:
        return set(font.getBestCmap())


def original_sources(name):
    if name == "misans-400":
        sources = sorted((fonts.FONTS / name).glob("*.woff2"))
    else:
        sources = [fonts.FONTS / f"{name}.woff2"]
    if not sources or not all(path.is_file() for path in sources):
        raise ValueError(f"The original published {name} fonts must remain available")
    return sources


def replace_face_sources(filename, replacements, check):
    path = ROOT / "assets" / "css" / filename
    original = path.read_text(encoding="utf-8")
    expected = original
    for matches, target, points in replacements:
        first = matches[0][0]
        body = first[1]
        body = re.sub(r'url\("[^"]+"\)', f'url("../fonts/{target.name}")', body)
        if "unicode-range:" in body:
            body = re.sub(r'unicode-range:\s*[^;]+;', f'unicode-range: {fonts.unicode_ranges(points)};', body)
        replacement = "@font-face {" + body + "}"
        expected = expected.replace(first[0], replacement, 1)
        for match, _ in matches[1:]:
            expected = expected.replace(match[0] + "\n", "", 1)
    if check:
        assert original == expected, f"Regenerate {filename} after changing the required glyphs"
    else:
        path.write_text(expected, encoding="utf-8")


def run(source_dir, glyph_file, check, report):
    glyphs = json.loads(glyph_file.read_text(encoding="utf-8"))
    required = lambda key: {ord(character) for character in glyphs[key] if fonts.is_cjk(ord(character))}
    jobs = [
        ("np-serif", "content-fonts.css", "NP Serif", "200 900", "normal", source_dir / "NotoSerifSC-wght.ttf", required("serif"), False),
        ("np-hand", "content-fonts.css", "NP Hand", "400", None, source_dir / "LXGWWenKai-Regular.ttf", required("hand"), False),
    ]
    for weight, source_name in MISANS.items():
        descriptor = "800 900" if weight == 800 else str(weight)
        jobs.append((f"misans-{weight}", "desktop-fonts.css", "MiSans", descriptor, None,
                     source_dir / "MiSans" / "woff2" / f"MiSans-{source_name}.woff2", required("sans") | fonts.fallback_points(), True))
    changes = {}
    records = []
    for name, filename, family, weight, style, source, needed, hinting in jobs:
        matches = fonts.registered_faces(filename, family, weight, style)
        originals = original_sources(name)
        old_points = set().union(*(cmap(path) for path in originals))
        points = old_points | needed
        target = fonts.build_immutable(source, name, points, check, hinting)
        changes.setdefault(filename, []).append((matches, target, points))
        records.append({
            "role": name, "cssWeight": weight, "source": str(source),
            "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            "oldFiles": [str(path.relative_to(ROOT)) for path in originals],
            "oldBytes": sum(path.stat().st_size for path in originals),
            "oldCharacters": len(old_points), "requiredCharacters": len(needed),
            "addedCharacters": len(needed - old_points), "characters": len(points),
            "file": str(target.relative_to(ROOT)), "bytes": target.stat().st_size,
            "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
        })
    for filename, replacements in changes.items():
        replace_face_sources(filename, replacements, check)
    if report:
        report.write_text(json.dumps({"fonts": records}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    arguments = argparse.ArgumentParser(description=__doc__)
    arguments.add_argument("--source-dir", type=Path, required=True)
    arguments.add_argument("--glyphs", type=Path, default=ROOT / "tools" / "glyphs.json")
    arguments.add_argument("--check", action="store_true")
    arguments.add_argument("--report", type=Path)
    options = arguments.parse_args()
    run(options.source_dir, options.glyphs, options.check, options.report)
