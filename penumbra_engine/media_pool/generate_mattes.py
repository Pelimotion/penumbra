#!/usr/bin/env python3
"""
Penumbra System - Avant-Garde Cinematic Matte Library Generator
Generates high-resolution (1920x1080) 8-bit matte maps across 5 curated categories:
- Cat A: Sólidos & Arquitetura (splits, pillars, quadrants, anamorphic slits)
- Cat B: Soft & Penumbra (deep organic vignettes, feathered masks, horizon washes)
- Cat C: Tempo & Rítmicos (staccato vertical/horizontal blinds, stepped rings, rasters)
- Cat D: Procedurais & Fluidos (marble fluid, dark nebula, Lissajous curves, clouds)
- Cat E: Estruturais & Vetoriais (diamond lattice, architectural portals, reticles, wireframes)

Also generates `mattes_manifest.json` metadata catalog for instant UI preview and 1-click routing.
"""

import os
import json
import cv2
import numpy as np
from pathlib import Path

MATTES_DIR = Path(__file__).resolve().parent / "mattes"
MANIFEST_PATH = Path(__file__).resolve().parent / "mattes_manifest.json"
WIDTH = 1920
HEIGHT = 1080

CATEGORIES = [
    ("cat_a_solids", "SOLIDS", "Sólidos & Arquitetura"),
    ("cat_b_soft", "SOFT", "Suaves & Penumbra"),
    ("cat_c_tempo", "TEMPO", "Rítmicos & Tempo"),
    ("cat_d_procedural", "PROCEDURAL", "Fluidos & Procedurais"),
    ("cat_e_structural", "STRUCTURAL", "Estruturais & Geometria")
]

manifest_entries = []

def ensure_dirs():
    for folder, _, _ in CATEGORIES:
        (MATTES_DIR / folder).mkdir(parents=True, exist_ok=True)

def record_matte(cat_folder, cat_id, filename, name, desc, tags):
    manifest_entries.append({
        "id": Path(filename).stem,
        "filename": filename,
        "category": cat_id,
        "category_folder": cat_folder,
        "path": f"{cat_folder}/{filename}",
        "name": name,
        "description": desc,
        "tags": tags
    })

def generate_solids():
    out = MATTES_DIR / "cat_a_solids"
    cat = "cat_a_solids"
    cid = "SOLIDS"

    # 1. Left Half
    m = np.zeros((HEIGHT, WIDTH), dtype=np.uint8)
    m[:, :WIDTH // 2] = 255
    cv2.imwrite(str(out / "matte_a_half_left.png"), m)
    record_matte(cat, cid, "matte_a_half_left.png", "Metade Esquerda", "Split vertical 50% esquerdo", ["split", "minimal"])

    # 2. Right Half
    m = np.zeros((HEIGHT, WIDTH), dtype=np.uint8)
    m[:, WIDTH // 2:] = 255
    cv2.imwrite(str(out / "matte_a_half_right.png"), m)
    record_matte(cat, cid, "matte_a_half_right.png", "Metade Direita", "Split vertical 50% direito", ["split", "minimal"])

    # 3. Top Half
    m = np.zeros((HEIGHT, WIDTH), dtype=np.uint8)
    m[:HEIGHT // 2, :] = 255
    cv2.imwrite(str(out / "matte_a_half_top.png"), m)
    record_matte(cat, cid, "matte_a_half_top.png", "Metade Superior", "Split horizontal 50% superior", ["split", "horizontal"])

    # 4. Bottom Half
    m = np.zeros((HEIGHT, WIDTH), dtype=np.uint8)
    m[HEIGHT // 2:, :] = 255
    cv2.imwrite(str(out / "matte_a_half_bottom.png"), m)
    record_matte(cat, cid, "matte_a_half_bottom.png", "Metade Inferior", "Split horizontal 50% inferior", ["split", "horizontal"])

    # 5. Third Center (Cinemascope center)
    m = np.zeros((HEIGHT, WIDTH), dtype=np.uint8)
    m[:, WIDTH // 3 : 2 * WIDTH // 3] = 255
    cv2.imwrite(str(out / "matte_a_third_center.png"), m)
    record_matte(cat, cid, "matte_a_third_center.png", "Pilar Central (1/3)", "Coluna vertical centralizada de um terço", ["pillar", "cinematic"])

    # 6. Golden Section Vertical Strip
    m = np.zeros((HEIGHT, WIDTH), dtype=np.uint8)
    gw = int(WIDTH * 0.382)
    gx = int(WIDTH * 0.309)
    m[:, gx : gx + gw] = 255
    cv2.imwrite(str(out / "matte_a_golden_pillar.png"), m)
    record_matte(cat, cid, "matte_a_golden_pillar.png", "Monólito Áureo", "Proporção áurea vertical phi (0.382)", ["sacred", "golden"])

    # 7. Center Circle Cut
    m = np.zeros((HEIGHT, WIDTH), dtype=np.uint8)
    radius = int(min(WIDTH, HEIGHT) * 0.38)
    cv2.circle(m, (WIDTH // 2, HEIGHT // 2), radius, 255, -1)
    cv2.imwrite(str(out / "matte_a_center_circle.png"), m)
    record_matte(cat, cid, "matte_a_center_circle.png", "Abertura Circular", "Círculo concêntrico de foco central", ["circle", "focus"])

    # 8. Anamorphic Cinemascope Slit (2.39:1)
    m = np.zeros((HEIGHT, WIDTH), dtype=np.uint8)
    slit_h = int(WIDTH / 2.39)
    sy = (HEIGHT - slit_h) // 2
    m[sy : sy + slit_h, :] = 255
    cv2.imwrite(str(out / "matte_a_anamorphic_slit.png"), m)
    record_matte(cat, cid, "matte_a_anamorphic_slit.png", "Fenda Anamórfica 2.39:1", "Letterbox cinemascope panorâmico", ["anamorphic", "letterbox"])

    # 9. Dual Monoliths (Left and Right pillars)
    m = np.zeros((HEIGHT, WIDTH), dtype=np.uint8)
    m[:, :WIDTH // 4] = 255
    m[:, 3 * WIDTH // 4:] = 255
    cv2.imwrite(str(out / "matte_a_dual_monolith.png"), m)
    record_matte(cat, cid, "matte_a_dual_monolith.png", "Monólitos Gêmeos", "Colunas laterais revelando centro negativo", ["architectural", "brutalist"])

    # 10. Diagonal 45 Slash
    m = np.zeros((HEIGHT, WIDTH), dtype=np.uint8)
    pts = np.array([[0, 0], [WIDTH, 0], [0, HEIGHT]], np.int32)
    cv2.fillPoly(m, [pts], 255)
    cv2.imwrite(str(out / "matte_a_diagonal_slash.png"), m)
    record_matte(cat, cid, "matte_a_diagonal_slash.png", "Corte Diagonal 45°", "Corte angular arquitetônico diagonal", ["diagonal", "angular"])

    print(f"[✓] Category A Solids generated (10 mattes).")

def generate_soft():
    out = MATTES_DIR / "cat_b_soft"
    cat = "cat_b_soft"
    cid = "SOFT"
    Y, X = np.ogrid[:HEIGHT, :WIDTH]
    cx, cy = WIDTH / 2, HEIGHT / 2

    # 1. Deep Elliptical Vignette (Penumbra Falloff)
    rx, ry = WIDTH * 0.44, HEIGHT * 0.46
    dist_sq = ((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2
    vig = np.clip(1.0 - dist_sq, 0.0, 1.0)
    vig_smooth = (np.sin((vig - 0.5) * np.pi) * 0.5 + 0.5) * 255.0
    cv2.imwrite(str(out / "matte_b_penumbra_vignette.png"), vig_smooth.astype(np.uint8))
    record_matte(cat, cid, "matte_b_penumbra_vignette.png", "Penumbra Vignette Clássica", "Degradê suave protegendo o teto de escuridão", ["vignette", "obsidian"])

    # 2. Feathered Center Core
    rx2, ry2 = WIDTH * 0.28, HEIGHT * 0.32
    dist_sq2 = ((X - cx) / rx2) ** 2 + ((Y - cy) / ry2) ** 2
    core = np.clip(1.0 - dist_sq2, 0.0, 1.0)
    core_smooth = (core ** 2) * 255.0
    cv2.imwrite(str(out / "matte_b_feather_core.png"), core_smooth.astype(np.uint8))
    record_matte(cat, cid, "matte_b_feather_core.png", "Núcleo Esfumado Oval", "Destaque orgânico central sem arestas duras", ["feather", "core"])

    # 3. Horizontal Horizon Soft Fade
    horizon = np.clip(1.0 - (np.abs(Y - cy) / (HEIGHT * 0.38)), 0.0, 1.0)
    horizon_smooth = (np.sin((horizon - 0.5) * np.pi) * 0.5 + 0.5) * 255.0
    cv2.imwrite(str(out / "matte_b_soft_horizon.png"), horizon_smooth.astype(np.uint8))
    record_matte(cat, cid, "matte_b_soft_horizon.png", "Horizonte Suave", "Degradê horizontal imitando neblina atmosférica", ["horizon", "atmosphere"])

    # 4. Asymmetrical Diagonal Wash
    diag = np.clip((X / WIDTH * 0.7 + Y / HEIGHT * 0.7) - 0.2, 0.0, 1.0)
    diag_smooth = (diag ** 1.8) * 255.0
    cv2.imwrite(str(out / "matte_b_diagonal_wash.png"), diag_smooth.astype(np.uint8))
    record_matte(cat, cid, "matte_b_diagonal_wash.png", "Lavagem Diagonal", "Luz oblíqua suave cinematográfica", ["wash", "oblique"])

    # 5. Inverse Spotlight (Black Center, Soft Ambient Perimeter)
    inv_vig = (1.0 - vig) * 255.0
    cv2.imwrite(str(out / "matte_b_inverse_spotlight.png"), inv_vig.astype(np.uint8))
    record_matte(cat, cid, "matte_b_inverse_spotlight.png", "Spotlight Invertido", "Núcleo ocluso em penumbra com periferia revelada", ["inverse", "negative"])

    # 6. Smoke & Fog Feather Density
    np.random.seed(101)
    noise = cv2.GaussianBlur(np.random.uniform(0, 255, (HEIGHT // 8, WIDTH // 8)).astype(np.float32), (21, 21), 0)
    noise_up = cv2.resize(noise, (WIDTH, HEIGHT), interpolation=cv2.INTER_CUBIC)
    smoke = np.clip((noise_up / 255.0) * vig * 1.3, 0.0, 1.0) * 255.0
    cv2.imwrite(str(out / "matte_b_smoke_density.png"), smoke.astype(np.uint8))
    record_matte(cat, cid, "matte_b_smoke_density.png", "Densidade de Névoa", "Micro-textura esfumada em suspensão", ["smoke", "texture"])

    print(f"[✓] Category B Soft generated (6 mattes).")

def generate_tempo():
    out = MATTES_DIR / "cat_c_tempo"
    cat = "cat_c_tempo"
    cid = "TEMPO"

    # 1. Stepped vertical blinds (16 stripes)
    blinds = np.zeros((HEIGHT, WIDTH), dtype=np.uint8)
    stripe_w = WIDTH // 16
    for i in range(16):
        if i % 2 == 0:
            blinds[:, i * stripe_w : (i + 1) * stripe_w] = 255
    cv2.imwrite(str(out / "matte_c_staccato_blinds.png"), blinds)
    record_matte(cat, cid, "matte_c_staccato_blinds.png", "Persianas Verticais (16)", "Ripas arquitetônicas para sincronia rítmica", ["staccato", "rhythm"])

    # 2. Horizontal Slits (12 bars)
    hslits = np.zeros((HEIGHT, WIDTH), dtype=np.uint8)
    bar_h = HEIGHT // 12
    for i in range(12):
        if i % 2 == 0:
            hslits[i * bar_h : (i + 1) * bar_h, :] = 255
    cv2.imwrite(str(out / "matte_c_horizontal_slits.png"), hslits)
    record_matte(cat, cid, "matte_c_horizontal_slits.png", "Fendas Horizontais (12)", "Ripas horizontais tipo persiana veneziana", ["staccato", "raster"])

    # 3. Concentric Stepped Rings
    Y, X = np.ogrid[:HEIGHT, :WIDTH]
    cx, cy = WIDTH / 2, HEIGHT / 2
    radii = np.sqrt(((X - cx) * (HEIGHT / WIDTH)) ** 2 + (Y - cy) ** 2)
    step_rings = ((radii // 60) % 2 == 0).astype(np.uint8) * 255
    cv2.imwrite(str(out / "matte_c_stepped_rings.png"), step_rings)
    record_matte(cat, cid, "matte_c_stepped_rings.png", "Anéis Concêntricos", "Ondas circulares quantizadas em tempo", ["rings", "ripple"])

    # 4. Raster Checkerboard (Brutalist Grid)
    block = 120
    chk = (((X // block) + (Y // block)) % 2 == 0).astype(np.uint8) * 255
    cv2.imwrite(str(out / "matte_c_raster_checker.png"), chk)
    record_matte(cat, cid, "matte_c_raster_checker.png", "Xadrez Raster Eletrônico", "Malha brutalista Berlin club", ["raster", "checker"])

    # 5. Barcode Slits (Asymmetrical Rhythm)
    barcode = np.zeros((HEIGHT, WIDTH), dtype=np.uint8)
    np.random.seed(77)
    x = 0
    while x < WIDTH:
        w = np.random.choice([16, 32, 64, 96, 140])
        val = 255 if np.random.rand() > 0.45 else 0
        barcode[:, x : min(WIDTH, x + w)] = val
        x += w
    cv2.imwrite(str(out / "matte_c_barcode_slits.png"), barcode)
    record_matte(cat, cid, "matte_c_barcode_slits.png", "Código de Barras Modular", "Intervalos assíncronos inspirados em partituras gráficas", ["barcode", "serial"])

    print(f"[✓] Category C Tempo generated (5 mattes).")

def generate_procedural():
    out = MATTES_DIR / "cat_d_procedural"
    cat = "cat_d_procedural"
    cid = "PROCEDURAL"

    # 1. Organic Fluid / Liquid Marble
    np.random.seed(42)
    small = np.random.uniform(0, 255, (HEIGHT // 16, WIDTH // 16)).astype(np.float32)
    blurred = cv2.GaussianBlur(small, (15, 15), 0)
    upscaled = cv2.resize(blurred, (WIDTH, HEIGHT), interpolation=cv2.INTER_CUBIC)
    norm = cv2.normalize(upscaled, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    cv2.imwrite(str(out / "matte_d_organic_fluid.png"), norm)
    record_matte(cat, cid, "matte_d_organic_fluid.png", "Fluido Mármore Líquido", "Morfologia orgânica de densidade líquida", ["fluid", "organic"])

    # 2. Dark Nebula (Cavernous Contrast)
    small2 = np.random.uniform(0, 255, (HEIGHT // 8, WIDTH // 8)).astype(np.float32)
    blurred2 = cv2.GaussianBlur(small2, (9, 9), 0)
    upscaled2 = cv2.resize(blurred2, (WIDTH, HEIGHT), interpolation=cv2.INTER_CUBIC)
    norm2 = cv2.normalize(upscaled2, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    cv2.imwrite(str(out / "matte_d_dark_nebula.png"), norm2)
    record_matte(cat, cid, "matte_d_dark_nebula.png", "Nebulosa Cavernosa", "Gradiente procedural escuro de alta granulação", ["nebula", "dark"])

    # 3. Lissajous Harmonic Aperture
    Y, X = np.ogrid[:HEIGHT, :WIDTH]
    cx, cy = WIDTH / 2, HEIGHT / 2
    nx = (X - cx) / (WIDTH / 2)
    ny = (Y - cy) / (HEIGHT / 2)
    liss = np.sin(nx * 3.14 * 2.0) * np.cos(ny * 3.14 * 3.0) + (1.0 - (nx**2 + ny**2)) * 0.5
    liss_norm = np.clip((liss + 0.5) * 0.7, 0.0, 1.0) * 255.0
    cv2.imwrite(str(out / "matte_d_lissajous_aperture.png"), liss_norm.astype(np.uint8))
    record_matte(cat, cid, "matte_d_lissajous_aperture.png", "Abertura Lissajous", "Harmônicos matemáticos com roll-off suave", ["lissajous", "harmonic"])

    # 4. Cloud Caverns
    small3 = np.random.uniform(0, 255, (HEIGHT // 4, WIDTH // 4)).astype(np.float32)
    blurred3 = cv2.GaussianBlur(small3, (25, 25), 0)
    upscaled3 = cv2.resize(blurred3, (WIDTH, HEIGHT), interpolation=cv2.INTER_CUBIC)
    contrast_cloud = np.clip(np.power(upscaled3 / 255.0, 2.2) * 255.0, 0, 255).astype(np.uint8)
    cv2.imwrite(str(out / "matte_d_cloud_caverns.png"), contrast_cloud)
    record_matte(cat, cid, "matte_d_cloud_caverns.png", "Caverna de Nuvens", "Bolsões de escuridão profunda com fendas de luz", ["clouds", "cavern"])

    print(f"[✓] Category D Procedural generated (4 mattes).")

def generate_structural():
    out = MATTES_DIR / "cat_e_structural"
    cat = "cat_e_structural"
    cid = "STRUCTURAL"

    # 1. Geometric diamond lattice wireframe
    wire = np.zeros((HEIGHT, WIDTH), dtype=np.uint8)
    cx, cy = WIDTH // 2, HEIGHT // 2
    for r in range(80, min(WIDTH, HEIGHT) // 2, 70):
        pts = np.array([
            [cx, cy - r],
            [cx + int(r * 1.6), cy],
            [cx, cy + r],
            [cx - int(r * 1.6), cy]
        ], np.int32)
        cv2.polylines(wire, [pts], isClosed=True, color=255, thickness=2)
    cv2.imwrite(str(out / "matte_e_diamond_lattice.png"), wire)
    record_matte(cat, cid, "matte_e_diamond_lattice.png", "Treliça de Losangos", "Geometria estrutural em arame de diamante", ["wireframe", "lattice"])

    # 2. Architectural Portal (Arch frame)
    portal = np.zeros((HEIGHT, WIDTH), dtype=np.uint8)
    pw = int(WIDTH * 0.45)
    ph = int(HEIGHT * 0.82)
    px = (WIDTH - pw) // 2
    py = (HEIGHT - ph) // 2 + 60
    cv2.rectangle(portal, (px, py + pw // 2), (px + pw, py + ph), 255, -1)
    cv2.circle(portal, (px + pw // 2, py + pw // 2), pw // 2, 255, -1)
    cv2.imwrite(str(out / "matte_e_architectural_portal.png"), portal)
    record_matte(cat, cid, "matte_e_architectural_portal.png", "Portal de Arco", "Arco monumental de galeria de arte contemporânea", ["portal", "arch"])

    # 3. Blueprint Reticle / Viewfinder
    reticle = np.zeros((HEIGHT, WIDTH), dtype=np.uint8)
    # Framing corner brackets
    c_len = 160
    thick = 4
    pad_x = int(WIDTH * 0.08)
    pad_y = int(HEIGHT * 0.08)
    x1, y1 = pad_x, pad_y
    x2, y2 = WIDTH - pad_x, HEIGHT - pad_y
    # Top Left
    cv2.line(reticle, (x1, y1), (x1 + c_len, y1), 255, thick)
    cv2.line(reticle, (x1, y1), (x1, y1 + c_len), 255, thick)
    # Top Right
    cv2.line(reticle, (x2, y1), (x2 - c_len, y1), 255, thick)
    cv2.line(reticle, (x2, y1), (x2, y1 + c_len), 255, thick)
    # Bottom Left
    cv2.line(reticle, (x1, y2), (x1 + c_len, y2), 255, thick)
    cv2.line(reticle, (x1, y2), (x1, y2 - c_len), 255, thick)
    # Bottom Right
    cv2.line(reticle, (x2, y2), (x2 - c_len, y2), 255, thick)
    cv2.line(reticle, (x2, y2), (x2, y2 - c_len), 255, thick)
    # Center crosshairs
    cv2.line(reticle, (cx - 50, cy), (cx + 50, cy), 255, 2)
    cv2.line(reticle, (cx, cy - 50), (cx, cy + 50), 255, 2)
    cv2.circle(reticle, (cx, cy), 24, 255, 2)
    cv2.imwrite(str(out / "matte_e_blueprint_reticle.png"), reticle)
    record_matte(cat, cid, "matte_e_blueprint_reticle.png", "Retículo de Blueprint", "Marcadores de enquadramento técnico industrial", ["blueprint", "viewfinder"])

    # 4. Concentric Hexagons
    hex_mask = np.zeros((HEIGHT, WIDTH), dtype=np.uint8)
    for r in range(120, min(WIDTH, HEIGHT) // 2 + 80, 90):
        pts = []
        for a in range(6):
            angle = a * np.pi / 3.0 + np.pi / 6.0
            pts.append([int(cx + r * np.cos(angle) * 1.15), int(cy + r * np.sin(angle))])
        cv2.polylines(hex_mask, [np.array(pts, np.int32)], isClosed=True, color=255, thickness=3)
    cv2.imwrite(str(out / "matte_e_concentric_hexagons.png"), hex_mask)
    record_matte(cat, cid, "matte_e_concentric_hexagons.png", "Hexágonos Concêntricos", "Estrutura isométrica com ritmo de expansão", ["hexagon", "isometric"])

    print(f"[✓] Category E Structural generated (4 mattes).")

def generate_penumbra_lut():
    lut_dir = Path(__file__).resolve().parent / "luts"
    lut_dir.mkdir(parents=True, exist_ok=True)
    cube_path = lut_dir / "penumbra_master.cube"
    size = 32
    with open(cube_path, "w") as f:
        f.write("# Penumbra Master Cinematic 3D LUT\n")
        f.write("# Pelimotion 2026 - Crushed blacks, capped highlights, de-saturated\n")
        f.write(f"LUT_3D_SIZE {size}\n")
        for b in range(size):
            fb = b / (size - 1.0)
            for g in range(size):
                fg = g / (size - 1.0)
                for r in range(size):
                    fr = r / (size - 1.0)
                    lum = 0.299 * fr + 0.587 * fg + 0.114 * fb
                    sat = 0.62
                    dr = lum + (fr - lum) * sat
                    dg = lum + (fg - lum) * sat
                    db = lum + (fb - lum) * sat
                    def curve(v):
                        c = np.power(max(0.0, v), 1.25)
                        if c > 0.5:
                            c = 0.5 + 0.20 * np.tanh((c - 0.5) / 0.20)
                        return np.clip(c, 0.0, 1.0)
                    f.write(f"{curve(dr):.6f} {curve(dg):.6f} {curve(db):.6f}\n")
    print(f"[✓] Penumbra 3D LUT written: {cube_path}")

def save_manifest():
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest_entries, f, indent=2, ensure_ascii=False)
    print(f"[✓] Mattes catalog manifest saved: {len(manifest_entries)} mattes recorded.")

if __name__ == "__main__":
    ensure_dirs()
    generate_solids()
    generate_soft()
    generate_tempo()
    generate_procedural()
    generate_structural()
    generate_penumbra_lut()
    save_manifest()
    print(f"\n[COMPLETE] 29 avant-garde mattes ready for Penumbra VJ Engine.")
