"""
Penumbra System - TouchDesigner Runtime Engine Script
Manages audio-reactive parameter modulation, clip pool routing,
blend mode selection, matte modulation, and NDI broadcasting.
Can be executed directly within TouchDesigner Python or as a standalone orchestrator.
"""

import os
import json
import math
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent.parent
MANIFEST_PATH = BASE_DIR / "media_pool" / "media_manifest.json"
MATTES_DIR = BASE_DIR / "media_pool" / "mattes"
LUT_PATH = BASE_DIR / "media_pool" / "luts" / "penumbra_master.cube"

class PenumbraEngineManager:
    def __init__(self, op_root=None):
        self.root = op_root  # Reference to TouchDesigner /project1 or COMP
        self.manifest = self._load_manifest()
        
        # Clip pools by category
        self.pool_base = [x for x in self.manifest if x["category"] in ["MINIMAL", "ABSTRACT"]]
        self.pool_secondary = [x for x in self.manifest if x["category"] in ["FIGURA", "ABSTRACT", "CHROMA"]]
        self.pool_accent = [x for x in self.manifest if x["category"] in ["DENSE", "ABSTRACT"]]

        # Active clip indices
        self.idx_base = 0
        self.idx_secondary = 0
        self.idx_accent = 0

        # Runtime state
        self.current_state = "INTRO"
        self.current_bpm = 124.0
        self.buildup_score = 0.0
        self.drop_likelihood = 0.0
        
        # Creative parameter overrides
        self.master_intensity = 1.0
        self.blackout = False
        self.self_double_scale = 1.18
        self.self_double_blend = "Multiply"  # Multiply, Darken, Overlay
        self.accent_blend = "Difference"    # Difference, Exclusion, Soft Light
        self.edge_opacity = 0.22
        self.active_matte_bank = "B"        # A, B, C, D, E, Auto

    def _load_manifest(self):
        if MANIFEST_PATH.exists():
            with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        return []

    def get_active_clips(self):
        base_clip = self.pool_base[self.idx_base % len(self.pool_base)] if self.pool_base else None
        sec_clip = self.pool_secondary[self.idx_secondary % len(self.pool_secondary)] if self.pool_secondary else None
        accent_clip = self.pool_accent[self.idx_accent % len(self.pool_accent)] if self.pool_accent else None
        return {
            "layer_0_base": base_clip,
            "layer_1_self": base_clip,
            "layer_2_edge": base_clip,
            "layer_3_secondary": sec_clip,
            "layer_4_accent": accent_clip
        }

    def cycle_clip(self, layer_name):
        """Advance clip in pool with smooth transition."""
        if layer_name == "base" and self.pool_base:
            self.idx_base = (self.idx_base + 1) % len(self.pool_base)
        elif layer_name == "secondary" and self.pool_secondary:
            self.idx_secondary = (self.idx_secondary + 1) % len(self.pool_secondary)
        elif layer_name == "accent" and self.pool_accent:
            self.idx_accent = (self.idx_accent + 1) % len(self.pool_accent)

    def update_audio_frame(self, features):
        """
        Called each frame with features from PenumbraAudioBrain.
        Modulates layer parameters according to the Penumbra Aesthetic Rules:
        - NEVER blow out highlights.
        - Darkness is structural.
        - Multiply / Darken for self-double.
        - Difference / Exclusion for accents on drops only.
        """
        self.current_state = features.get("macro_state", self.current_state)
        self.buildup_score = features.get("buildup_score", 0.0)
        self.drop_likelihood = features.get("drop_likelihood", 0.0)
        self.current_bpm = features.get("bpm", 124.0)
        
        bands = features.get("bands", {})
        sub = bands.get("sub", 0.0)
        bass = bands.get("bass", 0.0)
        lo_mid = bands.get("lo_mid", 0.0)
        hi_mid = bands.get("hi_mid", 0.0)
        presence = bands.get("presence", 0.0)
        air = bands.get("air", 0.0)
        rms = features.get("rms_total", 0.0)
        phase = features.get("beat_phase", 0.0)
        downbeat = features.get("downbeat_pulse", 0)

        # 1. Layer 0 (Base): Soft matte radius breathes with bass RMS
        matte_radius = 0.45 + min(0.35, (sub + bass) * 0.003)

        # 2. Layer 1 (Self-Double): Scale modulates slightly with flux, opacity with lo_mid
        self_scale = 1.15 + min(0.12, lo_mid * 0.005)
        self_opacity = max(0.35, min(0.70, 0.40 + (lo_mid * 0.01)))

        # 3. Layer 2 (Edge Trace): Opacity modulates with presence + air
        edge_opacity = max(0.12, min(0.35, 0.15 + (presence + air) * 0.02))

        # 4. Layer 3 (Secondary): Driven by downbeat and buildup
        if self.current_state in ["BUILD", "DROP"]:
            sec_opacity = min(0.85, 0.30 + self.buildup_score * 0.5)
        elif self.current_state == "BREAK":
            sec_opacity = 0.15
        else:
            sec_opacity = 0.40

        # 5. Layer 4 (Accent): ONLY active on DROP or high drop likelihood
        if self.current_state == "DROP" or features.get("drop_trigger", 0) == 1:
            accent_opacity = max(0.40, min(0.80, 0.50 + self.drop_likelihood * 0.3))
        elif self.current_state == "BUILD" and self.buildup_score > 0.7:
            accent_opacity = 0.25 * (phase ** 2)  # Rhythmic flash preceding drop
        else:
            accent_opacity = 0.0  # Kept in complete darkness during normal groove

        # 6. Clip cycling on phrase boundaries
        if features.get("phrase_counter", 1) == 8 and downbeat == 1:
            if self.current_state == "BREAK":
                self.cycle_clip("base")
            elif self.current_state == "DROP":
                self.cycle_clip("accent")

        return {
            "macro_state": self.current_state,
            "matte_radius": round(matte_radius, 3),
            "layer_0_opacity": 1.0,
            "layer_1_scale": round(self_scale, 3),
            "layer_1_opacity": round(self_opacity, 3),
            "layer_1_blend": self.self_double_blend,
            "layer_2_opacity": round(edge_opacity, 3),
            "layer_3_opacity": round(sec_opacity, 3),
            "layer_4_opacity": round(accent_opacity, 3),
            "layer_4_blend": self.accent_blend,
            "active_clips": self.get_active_clips()
        }

if __name__ == "__main__":
    mgr = PenumbraEngineManager()
    print("[*] Penumbra Manager initialized.")
    clips = mgr.get_active_clips()
    print("[*] Base Pool:", len(mgr.pool_base), "Secondary Pool:", len(mgr.pool_secondary), "Accent Pool:", len(mgr.pool_accent))
    print("[*] Active Clips:")
    for k, v in clips.items():
        print(f"    {k}: {v['filename'] if v else 'None'}")
