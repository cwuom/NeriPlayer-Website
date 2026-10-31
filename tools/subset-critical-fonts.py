"""Build first-screen WOFF2 subsets from the published fonts without changing their axes.

Run with a Python environment containing fonttools and brotli:
    python tools/subset-critical-fonts.py
    python tools/subset-critical-fonts.py --check

The existing full fonts remain the source of truth and cover noncritical text.
"""

import argparse
from copy import deepcopy
import hashlib
from html.parser import HTMLParser
import io
from pathlib import Path
import re

from fontTools import subset
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables.otBase import USE_HARFBUZZ_REPACKER


ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "assets" / "fonts"
ASCII = set(range(0x20, 0x7F))
FACES = {
    "fraunces": ("Fraunces", "100 900", "normal"),
    "fraunces-italic": ("Fraunces", "100 900", "italic"),
    "np-serif": ("NP Serif", "200 900", "normal"),
    "np-hand": ("NP Hand", "400", None),
    "caveat": ("Caveat", "400 700", None),
}
CRITICAL_ALIASES = {"fraunces": "Fraunces Critical", "fraunces-italic": "Fraunces Critical", "caveat": "Caveat Critical", "np-serif": "NP Serif Critical", "np-hand": "NP Hand Critical"}
GEIST_FACES = [
    '@font-face { font-family: "Geist"; src: url("../fonts/geist.woff2") format("woff2"); font-weight: 100 900; font-display: swap; }',
    '@font-face { font-family: "Geist Mono"; src: url("../fonts/geist-mono.woff2") format("woff2"); font-weight: 100 900; font-display: swap; }',
]
VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}


class CriticalText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.text = []
        self.italic = []
        self.hand = []

    def handle_starttag(self, tag, attrs):
        classes = set(dict(attrs).get("class", "").split())
        active = (bool(self.stack) and self.stack[-1][2]) or bool({"nav__name", "menu__list"} & classes)
        active = active or (tag == "h1" and any("hero" in item[1] for item in self.stack))
        if tag not in VOID_TAGS:
            self.stack.append((tag, classes, active))

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index][0] == tag:
                del self.stack[index:]
                break

    def handle_startendtag(self, tag, attrs):
        pass

    def handle_data(self, data):
        if any({"hero__note", "hero__scroll"} & item[1] for item in self.stack):
            self.hand.append(data)
        if self.stack and self.stack[-1][2]:
            # menu counters and translations already use the monospace family
            if any("menu__list" in item[1] for item in self.stack) and any(item[0] in {"i", "small"} for item in self.stack):
                return
            self.text.append(data)
            if any(item[0] == "em" for item in self.stack):
                self.italic.append(data)


def critical_role_points():
    characters = set()
    italic = set()
    hand = set()
    for path in [ROOT / "index.html", ROOT / "en" / "index.html"]:
        parser = CriticalText()
        parser.feed(path.read_text(encoding="utf-8"))
        if not parser.text:
            raise ValueError(f"No hero or navigation text found in {path}")
        characters.update(ord(character) for character in "".join(parser.text))
        italic.update(ord(character) for character in "".join(parser.italic))
        hand.update(ord(character) for character in "".join(parser.hand))
    return characters, italic, hand


def critical_codepoints():
    characters, italic, hand = critical_role_points()
    return {point for point in characters if is_cjk(point)}, italic & ASCII, {point for point in hand if is_cjk(point)}


def is_cjk(point):
    return (0x2E80 <= point <= 0x9FFF or 0xF900 <= point <= 0xFAFF or
            0xFE30 <= point <= 0xFE4F or 0xFF00 <= point <= 0xFFEF or
            0x20000 <= point <= 0x323AF)


class ShellText(CriticalText):
    def handle_starttag(self, tag, attrs):
        classes = set(dict(attrs).get("class", "").split())
        active = (bool(self.stack) and self.stack[-1][2]) or bool({"hero", "nav", "route", "menu", "skip"} & classes)
        if tag not in VOID_TAGS:
            self.stack.append((tag, classes, active))

    def handle_data(self, data):
        if self.stack and self.stack[-1][2] and not any(item[0] in {"script", "style"} for item in self.stack):
            self.text.append(data)


def fallback_points():
    characters = set()
    for path in [ROOT / "index.html", ROOT / "en" / "index.html"]:
        parser = ShellText()
        parser.feed(path.read_text(encoding="utf-8"))
        characters.update(ord(character) for character in "".join(parser.text) if is_cjk(ord(character)))
    github = (ROOT / "assets" / "js" / "github.js").read_text(encoding="utf-8")
    cta = re.search(r'var CTA = \{[\s\S]*?(?=\n  NP\.github =)', github)
    if not cta:
        raise ValueError("No dynamic first-screen CTA labels found")
    for first, second in re.findall(r"'([^'\n]*)'|\"([^\"\n]*)\"", cta.group()):
        characters.update(ord(character) for character in first + second if is_cjk(ord(character)))
    if not characters:
        raise ValueError("No first-screen CJK characters found")
    return characters


def registered_faces(filename, family, weight=None, style=None):
    css = (ROOT / "assets" / "css" / filename).read_text(encoding="utf-8")
    matches = []
    for match in re.finditer(r'@font-face\s*\{([^}]+)\}', css):
        body = match[1]
        if not re.search(r'font-family:\s*"' + re.escape(family) + r'"\s*;', body):
            continue
        if weight is not None and not re.search(r'font-weight:\s*' + re.escape(str(weight)) + r'\s*;', body):
            continue
        if style is not None and not re.search(r'font-style:\s*' + re.escape(style) + r'\s*;', body):
            continue
        href = re.search(r'url\("([^"?]+)(?:\?[^"]*)?"\)', body)
        if not href:
            raise ValueError(f"Missing source for {family} in {filename}")
        source = (ROOT / "assets" / "css" / href[1]).resolve()
        matches.append((match, source))
    if not matches:
        raise ValueError(f"No {family} {weight or ''} face in {filename}")
    return matches


def unicode_ranges(points):
    runs = []
    for point in sorted(points):
        if runs and runs[-1][1] + 1 == point:
            runs[-1][1] = point
        else:
            runs.append([point, point])
    return ", ".join(f"U+{start:04X}" + (f"-{end:04X}" if end != start else "") for start, end in runs)


def face(name, source, points, critical=False):
    family, weight, style = FACES[name]
    if critical:
        family = CRITICAL_ALIASES.get(name, family)
    style = f" font-style: {style};" if style else ""
    ranges = "" if critical else f" unicode-range: {unicode_ranges(points)};"
    return f'@font-face {{ font-family: "{family}"; src: url("../fonts/{source.name}") format("woff2"); font-weight: {weight};{style} font-display: swap;{ranges} }}'


def update_css(jobs, check):
    critical = [face(name, source, points, critical=True) for name, source, points in jobs if name in FACES]
    for name, source, _ in jobs:
        if name.startswith("misans-"):
            weight = name.removeprefix("misans-")
            critical.append(f'@font-face {{ font-family: "MiSans Critical"; src: url("../fonts/{source.name}") format("woff2"); font-weight: {weight}; font-display: swap; }}')
    path = ROOT / "assets" / "css" / "base.css"
    css = path.read_text(encoding="utf-8")
    faces = list(re.finditer(r'^@font-face \{[^\n]+\}\n', css, re.MULTILINE))
    if not faces or len(faces) not in {7, 10, 11, 13}:
        raise ValueError("Expected the existing base font declarations")
    start, end = faces[0].start(), faces[-1].end()
    assert css[start:end] == "".join(item.group() for item in faces), "only the contiguous font-face block may change"
    expected = "\n".join(critical + GEIST_FACES) + "\n"
    if check:
        assert css[start:end] == expected, "base must contain only the matching first-screen font faces"
    else:
        path.write_text(css[:start] + expected + css[end:], encoding="utf-8")


def verify(original, critical, points):
    assert set(critical.getBestCmap()) == points, "critical cmap must contain exactly the requested characters"
    names = lambda font: {(record.nameID, record.platformID, record.platEncID, record.langID, record.string) for record in font["name"].names}
    assert names(critical) == names(original), "all names, including copyright and license records, must survive"
    assert ("fvar" in critical) == ("fvar" in original), "the source variation model must survive"
    if "fvar" in original:
        axes = lambda font: [(axis.axisTag, axis.minValue, axis.defaultValue, axis.maxValue, axis.flags, axis.axisNameID) for axis in font["fvar"].axes]
        assert axes(critical) == axes(original), "variable axes and their complete ranges must survive"
        assert critical["fvar"].compile(critical) == original["fvar"].compile(original), "named variable instances must survive"
    if "avar" in original:
        assert critical["avar"].segments == original["avar"].segments, "variable axis mappings must survive"
    if "STAT" in original:
        assert critical["STAT"].compile(critical) == original["STAT"].compile(original), "variation style metadata must survive"
    metrics = {"head": ["unitsPerEm"], "hhea": ["ascent", "descent", "lineGap"], "OS/2": ["sTypoAscender", "sTypoDescender", "sTypoLineGap", "usWinAscent", "usWinDescent", "usWeightClass", "usWidthClass"]}
    if "vhea" in original:
        metrics["vhea"] = ["ascent", "descent", "lineGap"]
    for table, fields in metrics.items():
        for field in fields:
            assert getattr(critical[table], field) == getattr(original[table], field), f"{table}.{field} changed"
    original_glyphs, critical_glyphs = original.getGlyphSet(), critical.getGlyphSet()
    for point in points:
        glyph, reduced = original.getBestCmap()[point], critical.getBestCmap()[point]
        assert critical["hmtx"][reduced] == original["hmtx"][glyph], f"glyph metrics changed for U+{point:04X}"
        if "vmtx" in original:
            assert critical["vmtx"][reduced] == original["vmtx"][glyph], f"vertical glyph metrics changed for U+{point:04X}"
        original_pen, critical_pen = DecomposingRecordingPen(original_glyphs), DecomposingRecordingPen(critical_glyphs)
        original_glyphs[glyph].draw(original_pen)
        critical_glyphs[reduced].draw(critical_pen)
        assert original_pen.value == critical_pen.value, f"glyph outline changed for U+{point:04X}"


def subset_bytes(source, points, hinting=True):
    original = TTFont(source, recalcTimestamp=False)
    missing = points - set(original.getBestCmap())
    if missing:
        raise ValueError(f"{source.name} is missing required characters: {unicode_ranges(missing)}")
    font = TTFont(source, recalcTimestamp=False)
    # optional HarfBuzz tooling must not change the generated font bytes
    font.cfg[USE_HARFBUZZ_REPACKER] = False
    options = subset.Options()
    options.layout_features = ["*"]
    options.hinting = hinting
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.name_legacy = True
    options.glyph_names = True
    options.notdef_outline = True
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=points)
    subsetter.subset(font)
    # GSUB 子集可能移除未使用的功能名，许可证和原始命名仍完整保留
    font["name"] = deepcopy(original["name"])
    font.flavor = "woff2"
    output = io.BytesIO()
    font.save(output)
    result = output.getvalue()
    verify(original, TTFont(io.BytesIO(result)), points)
    original.close()
    font.close()
    return result


def build_immutable(source, name, points, check=False, hinting=True, critical=False):
    data = subset_bytes(source, points, hinting)
    digest = hashlib.sha256(data).hexdigest()[:12]
    target = FONTS / f"{name}-{digest}{'-critical' if critical else ''}.woff2"
    if target.exists():
        assert target.read_bytes() == data, f"immutable asset mismatch: {target}"
    elif check:
        raise ValueError(f"Missing generated font: {target.name}")
    else:
        target.write_bytes(data)
    print(f"{target.name}: {len(data):,} bytes, {len(points)} characters")
    return target


def run(check, fallback_only=False):
    jobs = []
    if not fallback_only:
        chinese, italic, hand = critical_codepoints()
        characters, italic_characters, hand_characters = critical_role_points()
        # fixed first-screen roles use separate families so later Latin runs stay intact
        latin = characters & set(TTFont(FONTS / "fraunces.woff2").getBestCmap())
        italic = italic_characters & set(TTFont(FONTS / "fraunces-italic.woff2").getBestCmap())
        caveat = hand_characters & set(TTFont(FONTS / "caveat.woff2").getBestCmap())
        for name, points in [("fraunces", latin), ("fraunces-italic", italic), ("np-serif", chinese), ("np-hand", hand), ("caveat", caveat)]:
            family, weight, style = FACES[name]
            source = registered_faces("content-fonts.css", family, weight, style)[0][1]
            target = build_immutable(source, name, points, check, critical=True)
            jobs.append((name, target, points))
    else:
        for name in FACES:
            family = CRITICAL_ALIASES[name]
            _, weight, style = FACES[name]
            source = registered_faces("base.css", family, weight, style)[0][1]
            jobs.append((name, source, set(TTFont(source).getBestCmap())))
    points = fallback_points()
    for weight in [400, 500, 600, 700]:
        sources = registered_faces("desktop-fonts.css", "MiSans", weight)
        if len(sources) != 1:
            raise ValueError("Build the complete single MiSans 400 subset before its critical subset")
        target = build_immutable(sources[0][1], f"misans-{weight}", points, check, critical=True)
        jobs.append((f"misans-{weight}", target, points))
    update_css(jobs, check)


if __name__ == "__main__":
    arguments = argparse.ArgumentParser(description=__doc__)
    arguments.add_argument("--check", action="store_true", help="verify existing subsets without rewriting them")
    arguments.add_argument("--fallback-only", action="store_true", help="build or verify only first-screen MiSans faces")
    options = arguments.parse_args()
    run(options.check, options.fallback_only)
