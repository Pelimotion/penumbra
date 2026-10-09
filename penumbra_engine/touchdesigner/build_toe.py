#!/usr/bin/env python3
"""
Penumbra System - TouchDesigner Project Generator
Injects the automated setup DAT into penumbra_base.toe.dir and collapses it
using /Applications/TouchDesigner.app/Contents/MacOS/toecollapse to generate
penumbra_engine/touchdesigner/penumbra_main.toe.
"""

import os
import shutil
import subprocess
from pathlib import Path

TD_DIR = Path(__file__).resolve().parent
BASE_DIR = TD_DIR.parent.parent
DIR_SOURCE = TD_DIR / "penumbra_base.toe.dir"
TARGET_DIR = TD_DIR / "penumbra_main.toe.dir"
TARGET_TOE = TD_DIR / "penumbra_main.toe"

COLLAPSE_BIN = Path("/Applications/TouchDesigner.app/Contents/MacOS/toecollapse")

EXECUTE_TEXT = f"""# TouchDesigner Penumbra System - Bootstrap & Network Builder
# Pelimotion 2026 - Audio-reactive VJ Engine
import os, sys

def onStart():
    print("[*] PENUMBRA SYSTEM BOOTSTRAP INITIALIZING...")
    p1 = op('/project1')
    if not p1:
        print("[!] Error: /project1 not found")
        return
        
    # Check if network is already built
    if p1.op('out1'):
        print("[✓] Penumbra Network already exists. Skipping recreation.")
        return

    try:
        # Set project to 60fps
        project.cookRate = 60

        # -------------------------------------------------------------
        # 1. AUDIO BRAIN NETWORK
        # -------------------------------------------------------------
        print("[*] Creating Audio Network...")
        audio_dev = p1.create(audiodeviceinCHOP, 'audio_in_live')
        audio_file = p1.create(audiofileinCHOP, 'audio_in_test')
        audio_file.par.file = '/Volumes/PLM_SSD_01/Musica/Tracks Autorais/01 REC-2024-04-28.mp3'
        audio_file.par.play = 1

        audio_switch = p1.create(switchCHOP, 'audio_switch')
        audio_switch.inputConnectors[0].connect(audio_dev.outputConnectors[0])
        audio_switch.inputConnectors[0].connect(audio_file.outputConnectors[0])
        audio_switch.par.index = 1  # 0 = Live Line-In, 1 = Test MP3

        # Spectral Filters
        filt_sub = p1.create(audiofilterCHOP, 'filt_sub')
        filt_sub.par.filter = 'lowpass'
        filt_sub.par.cutoff = 60
        filt_sub.inputConnectors[0].connect(audio_switch.outputConnectors[0])

        filt_bass = p1.create(audiofilterCHOP, 'filt_bass')
        filt_bass.par.filter = 'bandpass'
        filt_bass.par.cutoff = 130
        filt_bass.par.width = 140
        filt_bass.inputConnectors[0].connect(audio_switch.outputConnectors[0])

        filt_mid = p1.create(audiofilterCHOP, 'filt_mid')
        filt_mid.par.filter = 'bandpass'
        filt_mid.par.cutoff = 1500
        filt_mid.par.width = 2000
        filt_mid.inputConnectors[0].connect(audio_switch.outputConnectors[0])

        # Analysis RMS
        an_sub = p1.create(analyzeCHOP, 'an_sub')
        an_sub.par.function = 'rms'
        an_sub.inputConnectors[0].connect(filt_sub.outputConnectors[0])

        an_bass = p1.create(analyzeCHOP, 'an_bass')
        an_bass.par.function = 'rms'
        an_bass.inputConnectors[0].connect(filt_bass.outputConnectors[0])

        # OSC In from Penumbra Audio Brain
        osc_in = p1.create(oscinCHOP, 'osc_in_penumbra')
        osc_in.par.port = 7000

        # -------------------------------------------------------------
        # 2. VIDEO STREAM PLAYERS (COM PRESERVAÇÃO DE ASPECT RATIO)
        # -------------------------------------------------------------
        print("[*] Creating Video Players & Fit TOPs (Anti-distortion)...")
        movie_base = p1.create(moviefileinTOP, 'movie_base')
        movie_base.par.file = '/Volumes/PLM_SSD_01/Pipeline SSD 01/Gigantera/Pipeline Gigantera/Espinhaço/1. In/Animate_silver_tail_in_sand_202608120209.mp4'
        
        # Fit Best prevents horizontal/vertical stretching of 9:16 or non-16:9 videos
        fit_base = p1.create(fitTOP, 'fit_base')
        fit_base.par.fit = 'fitbest'
        fit_base.par.resolutionw = 1920
        fit_base.par.resolutionh = 1080
        fit_base.inputConnectors[0].connect(movie_base.outputConnectors[0])

        movie_sec = p1.create(moviefileinTOP, 'movie_secondary')
        movie_sec.par.file = '/Volumes/PLM_SSD_01/Pipeline SSD 01/Gigantera/Pipeline Gigantera/Espinhaço/1. In/Metallic_spine_sculpture_moving_1080p_202608292000.mp4'

        fit_sec = p1.create(fitTOP, 'fit_sec')
        fit_sec.par.fit = 'fitbest'
        fit_sec.par.resolutionw = 1920
        fit_sec.par.resolutionh = 1080
        fit_sec.inputConnectors[0].connect(movie_sec.outputConnectors[0])

        movie_accent = p1.create(moviefileinTOP, 'movie_accent')
        movie_accent.par.file = '/Volumes/PLM_SSD_01/Pipeline SSD 01/Gigantera/Pipeline Gigantera/Espinhaço/1. In/STIPPLES_SIMULACAO_4_1.mov'

        fit_accent = p1.create(fitTOP, 'fit_accent')
        fit_accent.par.fit = 'fitbest'
        fit_accent.par.resolutionw = 1920
        fit_accent.par.resolutionh = 1080
        fit_accent.inputConnectors[0].connect(movie_accent.outputConnectors[0])

        # Audio Headphone Cue Monitor
        audio_cue_out = p1.create(audiodeviceoutCHOP, 'audio_cue_out')
        audio_cue_out.inputConnectors[0].connect(audio_switch.outputConnectors[0])

        # -------------------------------------------------------------
        # 3. MATTE GENERATORS & ASSETS
        # -------------------------------------------------------------
        print("[*] Loading Mattes...")
        matte_b = p1.create(moviefileinTOP, 'matte_b_vignette')
        matte_b.par.file = f'{str(BASE_DIR)}/penumbra_engine/media_pool/mattes/cat_b_soft/matte_b_penumbra_vignette.png'

        matte_a = p1.create(moviefileinTOP, 'matte_a_solid')
        matte_a.par.file = f'{str(BASE_DIR)}/penumbra_engine/media_pool/mattes/cat_a_solids/matte_a_half_left.png'

        matte_c = p1.create(moviefileinTOP, 'matte_c_tempo')
        matte_c.par.file = f'{str(BASE_DIR)}/penumbra_engine/media_pool/mattes/cat_c_tempo/matte_c_staccato_blinds.png'

        # -------------------------------------------------------------
        # 4. PENUMBRA 5-LAYER COMPOSITING STACK
        # -------------------------------------------------------------
        print("[*] Building 5-Layer Penumbra Composite Stack...")
        
        # LAYER 0: Base with Penumbra Level & Soft Vignette
        level_base = p1.create(levelTOP, 'level_base')
        level_base.par.gamma = 0.85
        level_base.par.contrast = 1.15
        level_base.inputConnectors[0].connect(fit_base.outputConnectors[0])

        comp_layer0 = p1.create(compositeTOP, 'comp_layer0_base')
        comp_layer0.par.operand = 'multiply'
        comp_layer0.inputConnectors[0].connect(level_base.outputConnectors[0])
        comp_layer0.inputConnectors[0].connect(matte_b.outputConnectors[0])

        # LAYER 1: Self-Double (Scale 1.18x, Multiply - never adds light)
        xform_self = p1.create(transformTOP, 'xform_self_double')
        xform_self.par.sx = 1.18
        xform_self.par.sy = 1.18
        xform_self.inputConnectors[0].connect(comp_layer0.outputConnectors[0])

        level_self = p1.create(levelTOP, 'level_self_double')
        level_self.par.opacity = 0.55
        level_self.inputConnectors[0].connect(xform_self.outputConnectors[0])

        comp_layer1 = p1.create(compositeTOP, 'comp_layer1_self')
        comp_layer1.par.operand = 'multiply'
        comp_layer1.inputConnectors[0].connect(comp_layer0.outputConnectors[0])
        comp_layer1.inputConnectors[0].connect(level_self.outputConnectors[0])

        # LAYER 2: Edge Trace (Sobel edge, Screen 22% opacity)
        edge_node = p1.create(edgeTOP, 'edge_trace')
        edge_node.inputConnectors[0].connect(comp_layer0.outputConnectors[0])

        level_edge = p1.create(levelTOP, 'level_edge')
        level_edge.par.opacity = 0.22
        level_edge.inputConnectors[0].connect(edge_node.outputConnectors[0])

        comp_layer2 = p1.create(compositeTOP, 'comp_layer2_edge')
        comp_layer2.par.operand = 'screen'
        comp_layer2.inputConnectors[0].connect(comp_layer1.outputConnectors[0])
        comp_layer2.inputConnectors[0].connect(level_edge.outputConnectors[0])

        # LAYER 3: Secondary Video (Soft Light with Solid/Tempo Matte)
        comp_sec_mask = p1.create(compositeTOP, 'comp_sec_mask')
        comp_sec_mask.par.operand = 'multiply'
        comp_sec_mask.inputConnectors[0].connect(fit_sec.outputConnectors[0])
        comp_sec_mask.inputConnectors[0].connect(matte_a.outputConnectors[0])

        level_sec = p1.create(levelTOP, 'level_secondary')
        level_sec.par.opacity = 0.38
        level_sec.inputConnectors[0].connect(comp_sec_mask.outputConnectors[0])

        comp_layer3 = p1.create(compositeTOP, 'comp_layer3_sec')
        comp_layer3.par.operand = 'softlight'
        comp_layer3.inputConnectors[0].connect(comp_layer2.outputConnectors[0])
        comp_layer3.inputConnectors[0].connect(level_sec.outputConnectors[0])

        # LAYER 4: Accent Video (Difference / Exclusion - Climax/Drop Only)
        # Always mask raw media with matte so it never floods the frame
        comp_accent_mask = p1.create(compositeTOP, 'comp_accent_mask')
        comp_accent_mask.par.operand = 'multiply'
        comp_accent_mask.inputConnectors[0].connect(fit_accent.outputConnectors[0])
        comp_accent_mask.inputConnectors[0].connect(matte_c.outputConnectors[0])

        level_accent = p1.create(levelTOP, 'level_accent')
        level_accent.par.opacity = 0.0  # Controlled dynamically, max 0.45
        level_accent.inputConnectors[0].connect(comp_accent_mask.outputConnectors[0])

        comp_layer4 = p1.create(compositeTOP, 'comp_layer4_accent')
        comp_layer4.par.operand = 'difference'
        comp_layer4.inputConnectors[0].connect(comp_layer3.outputConnectors[0])
        comp_layer4.inputConnectors[0].connect(level_accent.outputConnectors[0])

        # -------------------------------------------------------------
        # 5. MASTERING, NDI OUTPUT & SYPHON
        # -------------------------------------------------------------
        print("[*] Creating Master Level & NDI / Syphon Outputs...")
        master_level = p1.create(levelTOP, 'master_level')
        master_level.par.opacity = 1.0
        master_level.inputConnectors[0].connect(comp_layer4.outputConnectors[0])

        # NDI Out for Bê's MadMapper
        ndi_out = p1.create(ndioutTOP, 'ndi_out_live')
        ndi_out.par.streamname = 'PENUMBRA_LIVE'
        ndi_out.inputConnectors[0].connect(master_level.outputConnectors[0])

        # Syphon Out for Local Mac Preview
        syphon_out = p1.create(syphonspoutoutTOP, 'syphon_out_preview')
        syphon_out.par.sendername = 'PENUMBRA_SYPHON'
        syphon_out.inputConnectors[0].connect(master_level.outputConnectors[0])

        # Out TOP
        out1 = p1.create(outTOP, 'out1')
        out1.inputConnectors[0].connect(master_level.outputConnectors[0])

        print("[✓] PENUMBRA TOUCHDESIGNER NETWORK BUILT SUCCESSFULLY!")
    except Exception as e:
        print("[!] Exception during bootstrap:", e)
"""

def generate_project():
    print("[*] Building Penumbra TouchDesigner Project...")
    if TARGET_DIR.exists():
        shutil.rmtree(TARGET_DIR)
        
    shutil.copytree(DIR_SOURCE, TARGET_DIR)
    
    # Create the executeDAT node in TARGET_DIR/project1
    p1_dir = TARGET_DIR / "project1"
    p1_dir.mkdir(parents=True, exist_ok=True)
    
    # 1. Node definition
    node_n = """DAT:execute
tile 200 400 130 90
flags =  viewer 1 parlanguage 0
color 0.22 0.75 0.35
view 8 0 1 1 1 0 -3.99477 0 0 1 1
end
"""
    with open(p1_dir / "setup_penumbra.n", "w") as f:
        f.write(node_n)

    # 2. Node parameters
    node_parm = """?
start 1 on
create 1 on
language 0 python
?
"""
    with open(p1_dir / "setup_penumbra.parm", "w") as f:
        f.write(node_parm)

    # 3. Node script
    node_text = "2\n*\n" + EXECUTE_TEXT
    with open(p1_dir / "setup_penumbra.text", "w") as f:
        f.write(node_text)

    # Create .toc file
    toc_source = TD_DIR / "penumbra_base.toe.toc"
    target_toc = TD_DIR / "penumbra_main.toe.toc"
    with open(toc_source, "r") as f:
        toc_lines = f.read().splitlines()
    
    for item in ["project1/setup_penumbra.n", "project1/setup_penumbra.parm", "project1/setup_penumbra.text"]:
        if item not in toc_lines:
            toc_lines.append(item)
            
    with open(target_toc, "w") as f:
        f.write("\n".join(toc_lines) + "\n")

    print("[*] Collapsing directory into .toe file via toecollapse...")
    cmd = [str(COLLAPSE_BIN), str(TARGET_DIR)]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    print(res.stdout)
    if res.returncode != 0:
        print("[!] toecollapse error:", res.stderr)
        return False
        
    print(f"[✓] Penumbra TouchDesigner Project Generated: {TARGET_TOE}")
    return True

if __name__ == "__main__":
    generate_project()
