import importlib.util
import sys
import types
import unittest
from pathlib import Path

AUDIO_PATH = Path(__file__).resolve().parents[1] / "penumbra_engine" / "audio_engine" / "audio_brain.py"
sys.modules.setdefault("numpy", types.SimpleNamespace())
spec = importlib.util.spec_from_file_location("penumbra_audio_test", AUDIO_PATH)
audio = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audio)


class BeatClockTests(unittest.TestCase):
    def test_advances_counters_for_elapsed_intervals_and_preserves_phase(self):
        brain = audio.PenumbraAudioBrain.__new__(audio.PenumbraAudioBrain)
        brain.beat_interval = 0.5
        brain.last_beat_time = 10.0
        brain.beat_counter = 2
        brain.total_bars = 4
        brain.bar_counter = 4
        brain.phrase_counter = 1

        brain.advance_beat_clock(11.75)

        self.assertEqual(brain.beat_counter, 1)
        self.assertEqual(brain.total_bars, 5)
        self.assertEqual(brain.last_beat_time, 11.5)
        self.assertAlmostEqual(brain.beat_phase, 0.5)
        self.assertEqual(brain.beat_pulse, 1)
        self.assertEqual(brain.downbeat_pulse, 1)


if __name__ == "__main__":
    unittest.main()
