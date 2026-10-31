"""Run with the fonttools environment used by the subset generator."""

import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("critical_fonts", ROOT / "tools" / "subset-critical-fonts.py")
fonts = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fonts)


class FontSubsettingTests(unittest.TestCase):
    def test_missing_glyphs_fail_instead_of_disappearing(self):
        with self.assertRaisesRegex(ValueError, "missing required characters: U\\+10FFFF"):
            fonts.subset_bytes(fonts.FONTS / "fraunces.woff2", {ord("A"), 0x10FFFF})

    def test_assets_are_deterministic_and_keep_the_old_url(self):
        source = fonts.FONTS / "fraunces.woff2"
        original_output = fonts.FONTS
        with tempfile.TemporaryDirectory() as directory:
            try:
                fonts.FONTS = Path(directory)
                old = fonts.FONTS / "fraunces-critical.woff2"
                old.write_bytes(b"cached version")
                target = fonts.build_immutable(source, "fraunces", {32, 65, 86}, critical=True)
                repeated = fonts.build_immutable(source, "fraunces", {86, 65, 32}, check=True, critical=True)
                self.assertEqual(target, repeated)
                self.assertEqual(old.read_bytes(), b"cached version")
                digest = hashlib.sha256(target.read_bytes()).hexdigest()[:12]
                self.assertEqual(target.name, f"fraunces-{digest}-critical.woff2")
                target.write_bytes(b"corrupt cache")
                with self.assertRaisesRegex(AssertionError, "immutable asset mismatch"):
                    fonts.build_immutable(source, "fraunces", {32, 65, 86}, critical=True)
            finally:
                fonts.FONTS = original_output


if __name__ == "__main__":
    unittest.main()
