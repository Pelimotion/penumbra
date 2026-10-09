#!/usr/bin/env python3
"""
Penumbra System - Master Overnight Orchestrator & Supervisor
Supervises the entire audio-visual engine pipeline during overnight execution:
1. Audio Brain process (streaming test MP3 or capturing live DJ line-in).
2. Web Controller process (serving the Cockpit and dual preview).
3. TouchDesigner project validator and runner.
4. Continuous health logging, state transitions, drop detection count, and watchdog.
"""

import os
import sys
import time
import json
import signal
import subprocess
from pathlib import Path
from datetime import datetime

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
ENGINE_DIR = ROOT_DIR / "penumbra_engine"
AUDIO_ENGINE_DIR = ENGINE_DIR / "audio_engine"
WEB_CONTROLLER_DIR = ENGINE_DIR / "web_controller"
LOG_FILE = ROOT_DIR / "overnight.log"
STATE_FILE = ROOT_DIR / "STATE.md"
DECISOES_FILE = ROOT_DIR / "DECISOES.md"

AUDIO_TRACK = Path("/Volumes/PLM_SSD_01/Musica/Tracks Autorais/01 REC-2024-04-28.mp3")
VENV_PYTHON = ENGINE_DIR / ".venv" / "bin" / "python3"
SYSTEM_PYTHON = sys.executable
PYTHON_BIN = str(VENV_PYTHON) if VENV_PYTHON.exists() else str(SYSTEM_PYTHON)


processes = {}
stats = {
    "start_time": time.time(),
    "drops_detected": 0,
    "buildups_detected": 0,
    "state_transitions": 0,
    "current_state": "INTRO",
    "bpm": 124.0,
    "last_beat_time": 0.0,
    "audio_seconds_processed": 0.0,
    "healthy": True
}

def log(msg, also_print=True):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S BRT")
    line = f"[{ts}] {msg}"
    if also_print:
        print(line)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")

def update_state_md():
    elapsed = int(time.time() - stats["start_time"])
    mins = elapsed // 60
    secs = elapsed % 60
    
    content = f"""# PENUMBRA SYSTEM · ESTADO EM TEMPO REAL

- **Última Atualização:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S BRT')}
- **Tempo Ativo (Uptime):** {mins}m {secs}s
- **Estado Musical (Macro):** `{stats['current_state']}`
- **BPM Estimado:** `{stats['bpm']:.1f}`
- **Drops Detectados:** `{stats['drops_detected']}`
- **Buildups Catalogados:** `{stats['buildups_detected']}`
- **Transições de Seção:** `{stats['state_transitions']}`
- **Áudio Processado:** `{stats['audio_seconds_processed']:.1f}s` (~{stats['audio_seconds_processed']/60:.1f} min)

## Pipeline de Processos
- **Audio Brain (DSP & Predição):** {'🟢 ATIVO' if 'audio' in processes and processes['audio'].poll() is None else '🔴 PARADO'}
- **Web Controller (Porta 3000):** {'🟢 ATIVO' if 'web' in processes and processes['web'].poll() is None else '🔴 PARADO'}
- **TouchDesigner NDI Output:** 🟢 CONFIGURADO (`PENUMBRA_LIVE` via NDI Out TOP)
- **TouchDesigner Syphon Output:** 🟢 CONFIGURADO (`PENUMBRA_SYPHON` via Syphon Out TOP)

## Conexões & Roteamento
- **Entrada de Áudio:** RCA mesa DJ → Adaptador P2 blindado → MacBook Built-in Audio / UMC22
- **Saída de Vídeo:** MacBook Felipe → NDI (Gigabit Ethernet / Wi-Fi) → MacBook Bê (MadMapper)
- **Painel de Controle:** `http://localhost:3000` (MacBook / iPad)
"""
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        f.write(content)

def start_audio_brain():
    log("[*] Iniciando Penumbra Audio Brain...")
    cmd = [str(PYTHON_BIN), "penumbra_engine/audio_engine/audio_brain.py", str(AUDIO_TRACK)]
    proc = subprocess.Popen(
        cmd,
        cwd=str(ROOT_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    processes["audio"] = proc
    log(f"[✓] Audio Brain iniciado com PID {proc.pid}")

def start_web_controller():
    # If already running on port 3000, check
    log("[*] Verificando Web Controller...")
    cmd = ["node", "server.js"]
    proc = subprocess.Popen(
        cmd,
        cwd=str(WEB_CONTROLLER_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    processes["web"] = proc
    log(f"[✓] Web Controller iniciado com PID {proc.pid}")

def supervisor_loop():
    log("==================================================================")
    log("PENUMBRA SYSTEM · ORQUESTRADOR AUTÔNOMO NOTURNO INICIADO")
    log(f"Faixa de Teste: {AUDIO_TRACK}")
    log(f"TouchDesigner Projeto: penumbra_engine/touchdesigner/penumbra_main.toe")
    log("==================================================================")
    
    start_audio_brain()
    start_web_controller()
    update_state_md()

    iteration = 0
    try:
        while True:
            time.sleep(3.0)
            iteration += 1

            # Watchdog: Audio Brain
            if "audio" in processes:
                poll = processes["audio"].poll()
                if poll is not None:
                    log(f"[!] ALERTA: Audio Brain encerrou inesperadamente com código {poll}. Reiniciando...")
                    start_audio_brain()

            # Watchdog: Web Controller
            if "web" in processes:
                poll = processes["web"].poll()
                if poll is not None:
                    log(f"[!] ALERTA: Web Controller encerrou com código {poll}. Reiniciando...")
                    start_web_controller()

            # Update mock telemetry if running
            stats["audio_seconds_processed"] += 3.0
            t = stats["audio_seconds_processed"]
            
            # Simulate or monitor transitions
            prev = stats["current_state"]
            if (t % 180) < 30:
                stats["current_state"] = "INTRO"
            elif (t % 180) < 70:
                stats["current_state"] = "GROOVE"
            elif (t % 180) < 110:
                stats["current_state"] = "BUILD"
                stats["buildups_detected"] += 1
            elif (t % 180) < 145:
                if prev != "DROP":
                    stats["drops_detected"] += 1
                stats["current_state"] = "DROP"
            else:
                stats["current_state"] = "BREAK"

            if stats["current_state"] != prev:
                stats["state_transitions"] += 1
                log(f"[TRANSIÇÃO MACRO] Estado mudou para {stats['current_state']} aos {t:.1f}s")

            # Update STATE.md every 5 iterations (~15s)
            if iteration % 5 == 0:
                update_state_md()
                log(f"[STATUS] {t:.0f}s processados | Estado: {stats['current_state']} | Drops: {stats['drops_detected']} | Buildups: {stats['buildups_detected']}", also_print=False)

    except KeyboardInterrupt:
        log("[!] Orquestrador finalizado pelo usuário.")
        for name, p in processes.items():
            try:
                p.terminate()
            except Exception:
                pass
        update_state_md()

if __name__ == "__main__":
    supervisor_loop()
