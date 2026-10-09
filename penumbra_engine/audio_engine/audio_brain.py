#!/usr/bin/env python3
"""
Penumbra System - Audio Brain & Predictive Engine
Real-time audio feature extraction, multi-band spectral decomposition,
predictive EDM buildup and drop detection, beat & measure phase tracking,
4-band semantic stems, and narrative macro-state engine.

Broadcasts via:
- OSC (UDP port 7000) for TouchDesigner CHOPs
- WebSocket (port 7001) for the Web Cockpit and preview UI
"""

import sys
import time
import math
import json
import asyncio
import numpy as np
from pathlib import Path
from collections import deque

try:
    from pythonosc import udp_client
except ImportError:
    udp_client = None

try:
    import websockets
except ImportError:
    websockets = None

try:
    import soundfile as sf
except ImportError:
    sf = None

try:
    import sounddevice as sd
except ImportError:
    sd = None

class PenumbraAudioBrain:
    def __init__(self, sample_rate=44100, buffer_size=1024, osc_port=7000, ws_port=7001):
        self.sr = sample_rate
        self.buffer_size = buffer_size
        self.osc_port = osc_port
        self.ws_port = ws_port
        
        # OSC Client
        if udp_client:
            self.osc_client = udp_client.SimpleUDPClient("127.0.0.1", self.osc_port)
        else:
            self.osc_client = None

        # WebSocket connected clients
        self.ws_clients = set()

        # FFT parameters
        self.fft_size = 2048
        self.window = np.hanning(self.buffer_size)
        self.freqs = np.fft.rfftfreq(self.buffer_size, 1.0 / self.sr)
        
        # Frequency band masks
        self.bands = {
            "sub": (20, 60),
            "bass": (60, 200),
            "lo_mid": (200, 800),
            "hi_mid": (800, 4000),
            "presence": (4000, 8000),
            "air": (8000, 20000)
        }
        self.band_indices = {}
        for name, (low, high) in self.bands.items():
            idx = np.where((self.freqs >= low) & (self.freqs <= high))[0]
            self.band_indices[name] = idx

    def update_sample_rate(self, new_sr):
        if self.sr == new_sr or new_sr <= 0:
            return
        self.sr = int(new_sr)
        self.freqs = np.fft.rfftfreq(self.buffer_size, 1.0 / self.sr)
        for name, (low, high) in self.bands.items():
            idx = np.where((self.freqs >= low) & (self.freqs <= high))[0]
            self.band_indices[name] = idx

        # Rolling state & history buffers
        self.prev_spectrum = None
        self.history_len = 160  # ~5 seconds at 30fps
        self.history_flux = deque(maxlen=self.history_len)
        self.history_bass_ratio = deque(maxlen=self.history_len)
        self.history_rms = deque(maxlen=self.history_len)
        self.history_hfc = deque(maxlen=self.history_len)
        self.history_onsets = deque(maxlen=self.history_len)
        
        # Smoothed values
        self.smoothed_rms = 0.0
        self.smoothed_bands = {k: 0.0 for k in self.bands}
        
        # Beat & tempo tracking
        self.bpm = 124.0
        self.beat_phase = 0.0
        self.last_beat_time = time.time()
        self.beat_interval = 60.0 / self.bpm
        self.beat_pulse = 0
        self.downbeat_pulse = 0
        self.beat_counter = 1
        self.bar_counter = 1
        self.total_bars = 1
        self.phrase_counter = 1  # 8-bar phrase
        
        # Onset tracking
        self.onset_threshold = 0.15
        self.last_onset_time = 0.0
        
        # Predictive tension metrics
        self.buildup_score = 0.0
        self.drop_likelihood = 0.0
        self.section_stability = 1.0
        self.drop_trigger = 0
        self.pre_drop_silence = False

        # Narrative Macro State
        # States: INTRO, BUILD, DROP, BREAK, GROOVE, OUTRO
        self.macro_state = "INTRO"
        self.state_time = time.time()
        self.state_duration = 0.0
        
        # Stems emulation / 4-band semantic RMS
        self.stems = {
            "drums": 0.0,
            "bass": 0.0,
            "other": 0.0,
            "vocals": 0.0
        }

    def process_audio_buffer(self, audio_data):
        """
        Processes a mono audio buffer (length buffer_size, normalized -1.0 to 1.0).
        Returns a rich dictionary of audio features and predictive cues.
        """
        now = time.time()
        if len(audio_data) < self.buffer_size:
            audio_data = np.pad(audio_data, (0, self.buffer_size - len(audio_data)))
        elif len(audio_data) > self.buffer_size:
            audio_data = audio_data[:self.buffer_size]

        # 1. Total RMS & Peak
        rms_raw = float(np.sqrt(np.mean(audio_data**2) + 1e-9))
        peak_raw = float(np.max(np.abs(audio_data)))
        
        # Smooth RMS with inertia (attack fast, release smooth)
        if rms_raw > self.smoothed_rms:
            self.smoothed_rms = 0.6 * self.smoothed_rms + 0.4 * rms_raw
        else:
            self.smoothed_rms = 0.88 * self.smoothed_rms + 0.12 * rms_raw

        # 2. FFT & Spectral Bands (Normalized to 0.0 - 1.0)
        windowed = audio_data * self.window
        fft_raw = np.abs(np.fft.rfft(windowed))
        # Normalize by FFT length so 0 dBFS sine wave maps to ~1.0
        spectrum = fft_raw / (len(windowed) / 2.0)
        spec_sum = float(np.sum(spectrum) + 1e-9)

        band_energies = {}
        for name, idx in self.band_indices.items():
            if len(idx) > 0:
                raw_e = float(np.mean(spectrum[idx])) * 4.5
                e = min(1.0, max(0.0, raw_e))
            else:
                e = 0.0
            
            # Band smoothing
            prev = self.smoothed_bands[name]
            if e > prev:
                self.smoothed_bands[name] = 0.45 * prev + 0.55 * e
            else:
                self.smoothed_bands[name] = 0.85 * prev + 0.15 * e
            band_energies[name] = round(self.smoothed_bands[name], 4)

        # 3. Spectral Centroid & Flux
        spectral_centroid = float(np.sum(self.freqs * spectrum) / spec_sum)
        
        if self.prev_spectrum is not None:
            diff = np.maximum(0, spectrum - self.prev_spectrum)
            spectral_flux = float(np.sqrt(np.mean(diff**2))) * 8.0
        else:
            spectral_flux = 0.0
        self.prev_spectrum = spectrum.copy()

        # 4. High Frequency Content (HFC) & Zero Crossing Rate
        hfc = float(np.sum(self.freqs * (spectrum**2)) / (spec_sum + 1e-9)) / 4000.0
        hfc = min(1.0, max(0.0, hfc))
        zcr = float(np.mean(np.abs(np.diff(np.sign(audio_data)))) / 2.0)

        # 5. Bass Ratio: (Sub + Bass) / Total
        bass_energy = band_energies["sub"] + band_energies["bass"]
        total_band_e = sum(band_energies.values()) + 1e-9
        bass_ratio = min(1.0, bass_energy / total_band_e)

        # 6. Onset Detection
        is_onset = False
        if spectral_flux > 0.04 and (now - self.last_onset_time) > 0.08:
            is_onset = True
            self.last_onset_time = now

        # Append to rolling history buffers
        self.history_flux.append(spectral_flux)
        self.history_bass_ratio.append(bass_ratio)
        self.history_rms.append(rms_raw)
        self.history_hfc.append(hfc)
        self.history_onsets.append(1 if is_onset else 0)

        # 7. Beat & Phase Tracking (Internal Clock locked to estimated tempo)
        elapsed_since_beat = now - self.last_beat_time
        self.beat_phase = (elapsed_since_beat % self.beat_interval) / self.beat_interval
        
        self.beat_pulse = 0
        self.downbeat_pulse = 0
        if elapsed_since_beat >= self.beat_interval:
            self.beat_pulse = 1
            self.last_beat_time = now
            self.beat_counter += 1
            if self.beat_counter > 4:
                self.beat_counter = 1
                self.total_bars += 1
                self.bar_counter = ((self.total_bars - 1) % 8) + 1
                self.phrase_counter = ((self.total_bars - 1) // 8) % 8 + 1
                self.downbeat_pulse = 1

        # 8. Multi-Bar Long-Horizon Buildup & Drop Algorithms
        if len(self.history_flux) >= 60:
            flux_recent = list(self.history_flux)[-30:]
            flux_past = list(self.history_flux)[-90:-30] if len(self.history_flux) >= 90 else flux_recent
            flux_trend = max(0.0, float(np.mean(flux_recent) - np.mean(flux_past))) * 6.0

            hfc_recent = list(self.history_hfc)[-30:]
            hfc_past = list(self.history_hfc)[-90:-30] if len(self.history_hfc) >= 90 else hfc_recent
            hfc_trend = max(0.0, float(np.mean(hfc_recent) - np.mean(hfc_past))) * 5.0

            onset_rate = sum(list(self.history_onsets)[-60:]) / 60.0 * 2.5
        else:
            flux_trend = 0.0
            hfc_trend = 0.0
            onset_rate = 0.0

        # Acoustic spectral tension
        acoustic_tension = max(0.0, min(1.0, (hfc_trend * 2.5 + flux_trend * 3.0 + max(0.0, onset_rate - 0.25) * 1.5)))

        # Musical Tension Accumulator
        if self.macro_state == "BUILD":
            bars_in_build = self.state_duration / (self.beat_interval * 4.0)
            build_progress = min(1.0, max(0.0, bars_in_build / 8.0))
            target_buildup = 0.20 + 0.72 * (build_progress ** 1.15) + (acoustic_tension * 0.15)
            self.buildup_score = min(1.0, max(self.buildup_score, self.buildup_score * 0.95 + target_buildup * 0.05))

            if bars_in_build >= 6.0:
                target_drop = min(0.95, 0.55 + ((bars_in_build - 6.0) / 2.0) * 0.40 + acoustic_tension * 0.10)
                self.drop_likelihood = max(self.drop_likelihood, self.drop_likelihood * 0.90 + target_drop * 0.10)
            elif self.buildup_score > 0.50:
                self.drop_likelihood = max(self.drop_likelihood, (self.buildup_score - 0.45) * 1.6)

        elif self.macro_state == "DROP":
            self.buildup_score = max(0.05, self.buildup_score * 0.96)
            self.drop_likelihood = max(0.15, self.drop_likelihood * 0.97)

        elif self.macro_state == "BREAK":
            self.buildup_score = max(0.05, self.buildup_score * 0.98)
            self.drop_likelihood = max(0.0, self.drop_likelihood * 0.92)

        else: # INTRO / GROOVE
            if acoustic_tension > 0.25:
                self.buildup_score = min(0.55, self.buildup_score + 0.02 * acoustic_tension)
            else:
                self.buildup_score = max(0.05, self.buildup_score * 0.995)
            self.drop_likelihood = max(0.0, self.drop_likelihood * 0.95)

        # Pre-drop silence detection
        recent_rms_mean = np.mean(list(self.history_rms)[-50:-10]) if len(self.history_rms) >= 50 else rms_raw
        current_rms = rms_raw
        if self.buildup_score > 0.45 and current_rms < (recent_rms_mean * 0.40) and current_rms < 0.15:
            self.pre_drop_silence = True
            self.drop_likelihood = min(1.0, max(0.85, self.drop_likelihood + 0.10))
        else:
            self.pre_drop_silence = False

        # Drop trigger on downbeat impact!
        self.drop_trigger = 0
        if (self.macro_state == "BUILD" or self.buildup_score > 0.55) and self.drop_likelihood > 0.65 and band_energies["bass"] > 0.35 and (self.downbeat_pulse == 1 or is_onset):
            self.drop_likelihood = 1.0
            self.drop_trigger = 1

        # Section Stability (Inverted variance over rolling window)
        if len(self.history_rms) > 40:
            rms_var = float(np.std(list(self.history_rms)[-40:]))
            self.section_stability = max(0.0, min(1.0, 1.0 - (rms_var * 4.0)))
        else:
            self.section_stability = 0.85

        # 9. Semantic Stems (4-band decomposition, 0.0 - 1.0 range)
        self.stems["drums"] = min(1.0, max(0.0, float(band_energies["bass"] * 0.65 + band_energies["presence"] * 0.35 + (0.15 if is_onset else 0.0))))
        self.stems["bass"] = min(1.0, max(0.0, float(band_energies["sub"] * 0.70 + band_energies["bass"] * 0.40)))
        self.stems["other"] = min(1.0, max(0.0, float(band_energies["lo_mid"] * 0.60 + band_energies["hi_mid"] * 0.40)))
        self.stems["vocals"] = min(1.0, max(0.0, float(band_energies["hi_mid"] * 0.75 + band_energies["presence"] * 0.25)))

        # 10. Macro State Transitions
        self.state_duration = now - self.state_time
        self._update_macro_state()

        # Build feature output payload
        features = {
            "timestamp": now,
            "rms_total": round(self.smoothed_rms, 4),
            "peak": round(peak_raw, 4),
            "bands": band_energies,
            "spectral_centroid": round(spectral_centroid, 1),
            "spectral_flux": round(spectral_flux, 4),
            "hfc": round(hfc, 4),
            "bass_ratio": round(bass_ratio, 3),
            "zcr": round(zcr, 3),
            "is_onset": 1 if is_onset else 0,
            "beat_pulse": self.beat_pulse,
            "downbeat_pulse": self.downbeat_pulse,
            "beat_phase": round(self.beat_phase, 3),
            "bpm": round(self.bpm, 1),
            "beat_counter": self.beat_counter,
            "bar": self.total_bars,
            "bar_counter": self.total_bars,
            "phrase_bar": self.bar_counter,
            "phrase_counter": self.phrase_counter,
            "buildup_score": round(self.buildup_score, 3),
            "drop_likelihood": round(self.drop_likelihood, 3),
            "drop_trigger": self.drop_trigger,
            "pre_drop_silence": 1 if self.pre_drop_silence else 0,
            "section_stability": round(self.section_stability, 3),
            "macro_state": self.macro_state,
            "state_duration": round(self.state_duration, 1),
            "stems": {k: round(v, 3) for k, v in self.stems.items()}
        }

        # Send OSC to TouchDesigner
        self._send_osc(features)

        return features

    def _update_macro_state(self):
        """
        Long-horizon musical narrative state machine.
        Follows real electronic music structure (16 to 32 bars per section):
        - INTRO: Atmospheric, sparse drums, low bass, builds for 16-32 bars.
        - GROOVE: High stability, steady kick/bass, main body of the track (32-64 bars).
        - BUILD: Rising tension, kick/bass removed or filtered, rising pitch/noise over 8-16 bars.
        - DROP: Massive kick & bass impact on downbeat, peak intensity for 16-32 bars.
        - BREAK: Beat cuts out to atmospheric breakdown for 8-16 bars.
        """
        now = time.time()
        prev = self.macro_state
        duration = self.state_duration
        bars_in_state = duration / (self.beat_interval * 4.0)

        # Minimum dwell times (hysteresis prevents nervous flapping)
        min_bars_intro = 16.0    # ~31s
        min_bars_groove = 24.0   # ~46s
        min_bars_build = 8.0     # ~15s
        min_bars_drop = 16.0     # ~31s
        min_bars_break = 8.0     # ~15s

        # 1. DROP TRIGGER: can happen from BUILD (or on sudden massive bass explosion)
        if (self.drop_trigger == 1 or self.drop_likelihood > 0.80) and (self.macro_state == "BUILD" or self.buildup_score > 0.40):
            self.macro_state = "DROP"
            self.buildup_score = 0.05

        # 2. FROM INTRO -> GROOVE or BUILD
        elif self.macro_state == "INTRO":
            # Transition to GROOVE once drums/bass are detected or after 16 bars
            if (bars_in_state >= min_bars_intro and (self.stems["drums"] > 0.20 or self.stems["bass"] > 0.20)) or bars_in_state >= 32.0:
                self.macro_state = "GROOVE"
            elif bars_in_state >= 8.0 and self.stems["drums"] > 0.45 and self.stems["bass"] > 0.45:
                self.macro_state = "GROOVE"
            elif bars_in_state >= 12.0 and self.buildup_score > 0.50:
                self.macro_state = "BUILD"

        # 3. FROM GROOVE -> BUILD or BREAK
        elif self.macro_state == "GROOVE":
            if bars_in_state >= min_bars_groove and self.buildup_score > 0.45:
                self.macro_state = "BUILD"
            elif bars_in_state >= min_bars_groove and self.stems["drums"] < 0.15 and self.smoothed_rms > 0.10:
                self.macro_state = "BREAK"

        # 4. FROM BUILD -> DROP or GROOVE (Fake-out, NEVER INTRO!)
        elif self.macro_state == "BUILD":
            if bars_in_state >= min_bars_build and (self.drop_trigger == 1 or self.drop_likelihood > 0.70):
                self.macro_state = "DROP"
            elif bars_in_state > 24.0 and self.buildup_score < 0.20:
                # If tension subsided without a drop, return to GROOVE
                self.macro_state = "GROOVE"

        # 5. FROM DROP -> GROOVE or BREAK
        elif self.macro_state == "DROP":
            if bars_in_state >= min_bars_drop:
                if self.stems["drums"] < 0.20 and self.smoothed_rms < 0.40:
                    self.macro_state = "BREAK"
                elif bars_in_state >= 32.0:
                    self.macro_state = "GROOVE"

        # 6. FROM BREAK -> BUILD or GROOVE
        elif self.macro_state == "BREAK":
            if self.buildup_score > 0.45:
                self.macro_state = "BUILD"
            elif bars_in_state >= min_bars_break and (self.stems["drums"] > 0.30 or self.stems["bass"] > 0.25):
                self.macro_state = "GROOVE"

        if self.macro_state != prev:
            self.state_time = now
            self.state_duration = 0.0

    def _send_osc(self, f):
        """Send OSC bundle/messages to TouchDesigner on port 7000."""
        if not self.osc_client:
            return
        try:
            self.osc_client.send_message("/penumbra/rms", f["rms_total"])
            self.osc_client.send_message("/penumbra/peak", f["peak"])
            self.osc_client.send_message("/penumbra/band/sub", f["bands"]["sub"])
            self.osc_client.send_message("/penumbra/band/bass", f["bands"]["bass"])
            self.osc_client.send_message("/penumbra/band/lo_mid", f["bands"]["lo_mid"])
            self.osc_client.send_message("/penumbra/band/hi_mid", f["bands"]["hi_mid"])
            self.osc_client.send_message("/penumbra/band/presence", f["bands"]["presence"])
            self.osc_client.send_message("/penumbra/band/air", f["bands"]["air"])
            self.osc_client.send_message("/penumbra/spectral_centroid", f["spectral_centroid"])
            self.osc_client.send_message("/penumbra/spectral_flux", f["spectral_flux"])
            self.osc_client.send_message("/penumbra/buildup_score", f["buildup_score"])
            self.osc_client.send_message("/penumbra/drop_likelihood", f["drop_likelihood"])
            self.osc_client.send_message("/penumbra/drop_trigger", f["drop_trigger"])
            self.osc_client.send_message("/penumbra/beat_pulse", f["beat_pulse"])
            self.osc_client.send_message("/penumbra/downbeat_pulse", f["downbeat_pulse"])
            self.osc_client.send_message("/penumbra/beat_phase", f["beat_phase"])
            self.osc_client.send_message("/penumbra/bpm", f["bpm"])
            self.osc_client.send_message("/penumbra/bar", f["bar_counter"])
            self.osc_client.send_message("/penumbra/section_stability", f["section_stability"])
            self.osc_client.send_message("/penumbra/macro_state", f["macro_state"])
            self.osc_client.send_message("/penumbra/stems/drums", f["stems"]["drums"])
            self.osc_client.send_message("/penumbra/stems/bass", f["stems"]["bass"])
            self.osc_client.send_message("/penumbra/stems/other", f["stems"]["other"])
            self.osc_client.send_message("/penumbra/stems/vocals", f["stems"]["vocals"])
        except Exception:
            pass

    async def broadcast_ws(self, features):
        """Broadcast JSON payload to connected WebSocket clients."""
        if not self.ws_clients:
            return
        msg = json.dumps({"type": "audio_features", "data": features})
        disconnected = set()
        for client in self.ws_clients:
            try:
                await client.send(msg)
            except Exception:
                disconnected.add(client)
        self.ws_clients -= disconnected

def get_audio_input_devices():
    """Returns all available audio input devices."""
    if not sd:
        return []
    devices = []
    try:
        devs = sd.query_devices()
        for idx, d in enumerate(devs):
            if d.get("max_input_channels", 0) > 0:
                devices.append({
                    "id": idx,
                    "name": d["name"],
                    "channels": d["max_input_channels"],
                    "samplerate": int(d.get("default_samplerate", 44100))
                })
    except Exception as e:
        print(f"[!] Error querying audio devices: {e}")
    return devices

def resolve_audio_device(mode, explicit_id=None):
    """
    Resolves audio device for modes: 'test', 'mic', 'p2', 'usb' or explicit index.
    Returns (device_id, device_name, is_available).
    """
    if mode.lower() == "test":
        return None, "MP3 Interno (01 REC-2024-04-28.mp3)", True

    if not sd:
        return None, "Biblioteca sounddevice indisponível", False

    devices = get_audio_input_devices()

    if explicit_id is not None:
        for d in devices:
            if d["id"] == explicit_id:
                return d["id"], d["name"], True

    m = mode.lower()
    if m == "mic":
        # Prefer built-in MacBook mic
        for d in devices:
            n = d["name"].lower()
            if any(k in n for k in ["macbook", "microfone (macbook", "built-in", "interno", "internal"]):
                return d["id"], d["name"], True
        for d in devices:
            if "microfone" in d["name"].lower() or "mic" in d["name"].lower():
                return d["id"], d["name"], True
        if devices:
            return devices[0]["id"], devices[0]["name"], True
        return None, "Nenhum microfone encontrado", False

    elif m == "usb":
        for d in devices:
            n = d["name"].lower()
            if any(k in n for k in ["usb", "umc", "behringer", "scarlett", "codec", "audiobox"]):
                return d["id"], d["name"], True
        return None, "Placa USB não conectada (Behringer / Interface)", False

    elif m == "p2":
        for d in devices:
            n = d["name"].lower()
            if any(k in n for k in ["line", "linha", "external", "externo", "p2", "integrada"]):
                return d["id"], d["name"], True
        return None, "Entrada P2 não detectada (conecte o cabo)", False

    return None, "Modo desconhecido", False

class MultiSourceAudioEngine:
    def __init__(self, brain, test_audio_path):
        self.brain = brain
        self.test_audio_path = Path(test_audio_path)
        self.current_mode = "test"
        self.current_device_id = None
        self.current_device_name = "MP3 Interno (01 REC-2024-04-28.mp3)"
        self.queue = asyncio.Queue(maxsize=32)
        self.live_stream = None
        self.test_task = None
        self.running = False
        self.loop = None

    async def start(self):
        self.running = True
        self.loop = asyncio.get_running_loop()
        await self.set_source("test")

    async def set_source(self, mode, explicit_id=None):
        mode = mode.lower()
        dev_id, dev_name, available = resolve_audio_device(mode, explicit_id)

        print(f"[*] Switching audio source to: mode={mode}, device={dev_name} (available={available})")

        # Stop current feed
        if self.live_stream is not None:
            try:
                self.live_stream.stop()
                self.live_stream.close()
            except Exception:
                pass
            self.live_stream = None

        if self.test_task and not self.test_task.done():
            self.test_task.cancel()
            self.test_task = None

        # Drain queue
        while not self.queue.empty():
            try:
                self.queue.get_nowait()
            except Exception:
                break

        if mode == "test" or not available or dev_id is None:
            self.current_mode = "test"
            self.current_device_id = None
            self.current_device_name = "MP3 Interno (01 REC-2024-04-28.mp3)"
            if not available and mode != "test":
                print(f"[!] Warning: {dev_name}. Falling back to TEST MP3.")
            self.test_task = asyncio.create_task(self._test_feeder())
        else:
            self.current_mode = mode
            self.current_device_id = dev_id
            self.current_device_name = dev_name

            # Open sounddevice InputStream
            try:
                dev_info = sd.query_devices(dev_id)
                ch = min(2, dev_info.get("max_input_channels", 1))
                sr = int(dev_info.get("default_samplerate", 44100))
                self.brain.update_sample_rate(sr)

                def audio_callback(indata, frames, time_info, status):
                    if not self.running:
                        return
                    if indata.shape[1] > 1:
                        mono = np.mean(indata, axis=1)
                    else:
                        mono = indata[:, 0]
                    self.loop.call_soon_threadsafe(
                        lambda m=mono.copy(): self.queue.put_nowait(m) if not self.queue.full() else None
                    )

                self.live_stream = sd.InputStream(
                    device=dev_id,
                    channels=ch,
                    samplerate=sr,
                    blocksize=self.brain.buffer_size,
                    dtype="float32",
                    callback=audio_callback
                )
                self.live_stream.start()
                print(f"[✓] Live audio stream active on [{dev_id}] {dev_name} ({sr}Hz, {ch}ch)")
            except Exception as e:
                print(f"[!] Error starting live stream on [{dev_id}] {dev_name}: {e}. Fallback to TEST.")
                self.current_mode = "test"
                self.current_device_id = None
                self.current_device_name = "MP3 Interno (01 REC-2024-04-28.mp3)"
                self.test_task = asyncio.create_task(self._test_feeder())

        # Notify connected clients of the switch
        await self.broadcast_status()

    async def _test_feeder(self):
        try:
            if not sf or not self.test_audio_path.exists():
                print(f"[!] Cannot read test audio file: {self.test_audio_path}")
                # Generate synthetic test pulse if file missing
                while self.running:
                    t = np.linspace(0, 1024 / 44100, 1024, endpoint=False)
                    dummy = (0.2 * np.sin(2 * np.pi * 120 * t)).astype(np.float32)
                    if not self.queue.full():
                        self.queue.put_nowait(dummy)
                    await asyncio.sleep(1024 / 44100)
                return

            with sf.SoundFile(str(self.test_audio_path)) as f:
                sr = f.samplerate
                channels = f.channels
                self.brain.update_sample_rate(sr)
                chunk_size = self.brain.buffer_size
                dt = chunk_size / sr

                while self.running:
                    t0 = time.time()
                    data = f.read(chunk_size, dtype="float32")
                    if len(data) == 0:
                        f.seek(0)
                        continue

                    if channels > 1:
                        mono = np.mean(data, axis=1)
                    else:
                        mono = data

                    if not self.queue.full():
                        self.queue.put_nowait(mono)

                    elapsed = time.time() - t0
                    sleep_time = max(0.001, dt - elapsed)
                    await asyncio.sleep(sleep_time)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"[!] Test feeder error: {e}")

    async def broadcast_status(self):
        msg = json.dumps({
            "type": "audio_source_status",
            "current_mode": self.current_mode,
            "device_name": self.current_device_name,
            "device_id": self.current_device_id,
            "devices": get_audio_input_devices()
        })
        disconnected = set()
        for client in self.brain.ws_clients:
            try:
                await client.send(msg)
            except Exception:
                disconnected.add(client)
        self.brain.ws_clients -= disconnected

async def run_multi_source_engine(audio_path):
    brain = PenumbraAudioBrain()
    print(f"[*] Penumbra Audio Brain initialized. Default track: {audio_path}")
    print(f"[*] OSC broadcasting on UDP 127.0.0.1:{brain.osc_port}")

    engine = MultiSourceAudioEngine(brain, audio_path)

    # WebSocket Server
    async def ws_handler(websocket):
        brain.ws_clients.add(websocket)
        # Send current status on connect
        init_msg = json.dumps({
            "type": "audio_source_status",
            "current_mode": engine.current_mode,
            "device_name": engine.current_device_name,
            "device_id": engine.current_device_id,
            "devices": get_audio_input_devices()
        })
        try:
            await websocket.send(init_msg)
            async for raw in websocket:
                try:
                    data = json.loads(raw)
                    action = data.get("action")
                    if action == "set_audio_source":
                        mode = data.get("mode", "test")
                        dev_id = data.get("device_id")
                        await engine.set_source(mode, dev_id)
                    elif action == "get_audio_devices":
                        await engine.broadcast_status()
                except Exception as ex:
                    print(f"[!] Error parsing ws message: {ex}")
        finally:
            brain.ws_clients.discard(websocket)

    ws_server = await websockets.serve(ws_handler, "0.0.0.0", brain.ws_port)
    print(f"[*] WebSocket server listening on ws://0.0.0.0:{brain.ws_port}")

    await engine.start()

    # Audio DSP Consumer Loop
    while engine.running:
        try:
            mono = await engine.queue.get()
            features = brain.process_audio_buffer(mono)
            features["audio_source"] = {
                "mode": engine.current_mode,
                "device_name": engine.current_device_name,
                "device_id": engine.current_device_id
            }
            await brain.broadcast_ws(features)
        except Exception as e:
            await asyncio.sleep(0.01)

if __name__ == "__main__":
    audio_file = Path("/Volumes/PLM_SSD_01/Musica/Tracks Autorais/01 REC-2024-04-28.mp3")
    if len(sys.argv) > 1:
        audio_file = Path(sys.argv[1])

    try:
        asyncio.run(run_multi_source_engine(audio_file))
    except KeyboardInterrupt:
        print("\n[!] Audio Brain stopped by user.")
