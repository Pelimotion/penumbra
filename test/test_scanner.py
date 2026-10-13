import importlib.util
import tempfile
import unittest
from pathlib import Path

SCANNER_PATH = Path(__file__).resolve().parents[1] / "penumbra_engine" / "media_pool" / "scanner.py"
spec = importlib.util.spec_from_file_location("penumbra_scanner", SCANNER_PATH)
scanner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scanner)


class ScannerDiscoveryTests(unittest.TestCase):
    def test_discovers_video_inside_pipeline_raw_in_folder(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            expected = base / "Project A" / "1. In" / "clip.mp4"
            expected.parent.mkdir(parents=True)
            expected.touch()

            self.assertEqual(scanner.discover_candidates(base), [expected])

    def test_empty_or_unavailable_root_is_not_silently_scanned(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "missing"
            with self.assertRaises(FileNotFoundError):
                scanner.discover_candidates(root)

    def test_ignores_video_outside_raw_in_folders(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            clip = base / "Project A" / "Exports" / "clip.mp4"
            clip.parent.mkdir(parents=True)
            clip.touch()

            self.assertEqual(scanner.discover_candidates(base), [])


if __name__ == "__main__":
    unittest.main()
