#!/usr/bin/env python3
"""
Penumbra System - Media Pool Scanner & Categorizer
Scans all pipeline project directories, extracts video metadata, analyzes visual properties,
detects green-screen chroma key opportunities, classifies clips into categories,
and generates thumbnails and media_manifest.json for the TouchDesigner engine and Web Deck.
"""

import os
import sys
import json
import subprocess
import glob
from pathlib import Path

# Paths
BASE_DIR = Path("/Volumes/PLM_SSD_01/Pipeline SSD 01/Gigantera/Pipeline Gigantera")
OUTPUT_DIR = Path(__file__).resolve().parent
MANIFEST_PATH = OUTPUT_DIR / "media_manifest.json"
THUMBS_DIR = OUTPUT_DIR / "thumbnails"
THUMBS_DIR.mkdir(parents=True, exist_ok=True)

def probe_video(file_path):
    """Run ffprobe to get video duration, resolution, fps, codec."""
    try:
        cmd = [
            "ffprobe", "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height,r_frame_rate,duration,codec_name,nb_frames",
            "-show_entries", "format=duration,size",
            "-of", "json",
            str(file_path)
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=10)
        data = json.loads(res.stdout)
        
        streams = data.get("streams", [])
        fmt = data.get("format", {})
        if not streams:
            return None
        st = streams[0]
        
        # duration
        dur_str = st.get("duration") or fmt.get("duration") or "0"
        try:
            duration = float(dur_str)
        except ValueError:
            duration = 0.0
            
        # fps
        fps_str = st.get("r_frame_rate", "30/1")
        if "/" in fps_str:
            num, den = fps_str.split("/")
            fps = round(float(num) / max(float(den), 1), 2)
        else:
            fps = float(fps_str)
            
        width = int(st.get("width", 0))
        height = int(st.get("height", 0))
        size_bytes = int(fmt.get("size", 0))
        codec = st.get("codec_name", "unknown")
        
        return {
            "width": width,
            "height": height,
            "duration": duration,
            "fps": fps,
            "codec": codec,
            "size_bytes": size_bytes,
            "aspect_ratio": f"{width}:{height}" if height else "16:9"
        }
    except Exception as e:
        return None

def analyze_visual_frames(file_path, duration, thumb_filename):
    """
    Extract sample frame, calculate luminance, contrast, green chroma fraction,
    and save a web thumbnail.
    """
    thumb_path = THUMBS_DIR / thumb_filename
    sample_time = max(1.0, min(duration * 0.35, 10.0)) if duration > 0 else 1.0
    
    # 1. Generate thumbnail
    try:
        cmd_thumb = [
            "ffmpeg", "-y", "-ss", str(sample_time),
            "-i", str(file_path),
            "-vframes", "1",
            "-vf", "scale=480:-1",
            str(thumb_path)
        ]
        subprocess.run(cmd_thumb, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=12)
    except Exception:
        pass
        
    has_chroma = False
    green_pct = 0.0
    mean_lum = 0.5
    contrast = 0.5
    motion_density = 0.5

    # 2. Use python/cv2 or ffprobe/ffmpeg signalstats to analyze color/luminance
    try:
        import cv2
        import numpy as np
        if thumb_path.exists():
            img = cv2.imread(str(thumb_path))
            if img is not None:
                # BGR to HSV
                hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
                # Pure green in HSV: H between 35 and 85, S > 80, V > 70
                green_mask = cv2.inRange(hsv, np.array([35, 75, 70]), np.array([85, 255, 255]))
                green_pixels = np.count_nonzero(green_mask)
                total_pixels = img.shape[0] * img.shape[1]
                green_pct = round(float(green_pixels / total_pixels) * 100, 2)
                if green_pct > 12.0:
                    has_chroma = True

                # Gray / Luminance
                gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                mean_lum = round(float(np.mean(gray)) / 255.0, 3)
                contrast = round(float(np.std(gray)) / 128.0, 3)
    except Exception as e:
        pass

    return {
        "thumbnail": thumb_filename if thumb_path.exists() else None,
        "has_chroma": has_chroma,
        "green_pct": green_pct,
        "mean_lum": mean_lum,
        "contrast": contrast
    }

def classify_clip(name, folder_name, meta, visual):
    """
    Classify clip into DENSE, MINIMAL, ABSTRACT, FIGURA, or CHROMA.
    Assign suggested layer in the Penumbra Engine stack (0, 3, or 4).
    """
    name_lower = name.lower()
    folder_lower = folder_name.lower()

    if visual["has_chroma"]:
        return "CHROMA", 3, "Chroma green background detected; apply ChromaKey TOP"

    # Keywords in filename
    if any(k in name_lower for k in ["stipples", "mutacao", "matrix", "kinetic", "tail"]):
        return "ABSTRACT", 4, "High frequency organic/kinetic textures; ideal for Layer 4 Difference accent"

    if any(k in name_lower for k in ["spine", "sculpture", "fish", "mullet"]):
        return "FIGURA", 3, "Clear organic skeletal figures; ideal for Layer 3 Secondary mask"

    if any(k in name_lower for k in ["smoke", "sand", "ocean", "arvore", "contempla"]):
        return "MINIMAL", 0, "Atmospheric deep shadows and gentle flow; ideal for Layer 0 Base Penumbra"

    # Luminance and contrast heuristics
    if visual["mean_lum"] < 0.25:
        return "MINIMAL", 0, "Low key / deep penumbra base"
    elif visual["contrast"] > 0.7:
        return "DENSE", 4, "High contrast punchy imagery; suited for build & drop peaks"
    else:
        return "ABSTRACT", 3, "Balanced textural loop; suited for secondary compositing"

def scan_all():
    print(f"[*] Scanning pipeline directory: {BASE_DIR}")
    video_extensions = {".mp4", ".m4v"} # Only browser-playable H.264 formats, strictly excluding desktop-only .mov ProRes/qtrle
    candidates = []

    for root, dirs, files in os.walk(BASE_DIR):
        rpath = Path(root)
        # Skip backup and planning folders
        if ".git" in rpath.parts or ".planning" in rpath.parts or "bkp" in str(rpath).lower():
            continue
            
        # Strictly require raw footage: must be inside '1. In', '1. in', or camera takes
        path_str = str(rpath)
        is_raw_in = any(part.lower() in ["1. in", "takes rj"] or "1. in" in part.lower() for part in rpath.parts)
        if not is_raw_in:
            continue
            
        for f in files:
            ext = os.path.splitext(f)[1].lower()
            if ext in video_extensions and not f.startswith("._") and not f.startswith("."):
                if "stipples_simulacao" in f.lower():
                    continue # Exclude pitch-black simulation tests
                full_path = rpath / f
                candidates.append(full_path)

    print(f"[*] Found {len(candidates)} RAW 1. In video files across the pipeline.")
    
    manifest = []
    idx = 1

    for vpath in sorted(candidates):
        folder_name = vpath.parent.name
        rel_path = str(vpath.relative_to(BASE_DIR))
        print(f"[{idx}/{len(candidates)}] Probing: {rel_path}...")
        
        meta = probe_video(vpath)
        if not meta or meta["duration"] < 0.5:
            continue

        thumb_name = f"thumb_{idx:03d}_{vpath.stem[:24]}.jpg".replace(" ", "_")
        visual = analyze_visual_frames(vpath, meta["duration"], thumb_name)
        category, suggested_layer, notes = classify_clip(vpath.name, folder_name, meta, visual)

        rel_parts = vpath.relative_to(BASE_DIR).parts
        project_name = rel_parts[0] if len(rel_parts) > 1 else folder_name
        source_folder = str(vpath.parent.relative_to(BASE_DIR))

        item = {
            "id": f"clip_{idx:03d}",
            "filename": vpath.name,
            "project": project_name,
            "project_folder": source_folder,
            "folder": folder_name,
            "relative_path": rel_path,
            "absolute_path": str(vpath),
            "width": meta["width"],
            "height": meta["height"],
            "duration": meta["duration"],
            "fps": meta["fps"],
            "codec": meta["codec"],
            "size_mb": round(meta["size_bytes"] / (1024 * 1024), 2),
            "category": category,
            "suggested_layer": suggested_layer,
            "has_chroma": visual["has_chroma"],
            "green_pct": visual["green_pct"],
            "mean_luminance": visual["mean_lum"],
            "contrast": visual["contrast"],
            "thumbnail": visual["thumbnail"],
            "notes": notes
        }
        manifest.append(item)
        idx += 1

    # Save manifest
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    print(f"[✓] Manifest written with {len(manifest)} valid clips: {MANIFEST_PATH}")
    return manifest

if __name__ == "__main__":
    scan_all()
