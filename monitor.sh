#!/bin/bash
# Penumbra System - Terminal Monitor Script
# Visualiza status dos processos, telemetria em tempo real e log do orquestrador.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$ROOT_DIR/overnight.log"
STATE_FILE="$ROOT_DIR/STATE.md"

clear
echo "========================================================================"
echo "          PENUMBRA SYSTEM · MONITOR EM TEMPO REAL                       "
echo "========================================================================"
echo ""

if [ -f "$STATE_FILE" ]; then
    cat "$STATE_FILE"
    echo ""
else
    echo "[!] STATE.md ainda não gerado. O orquestrador está ativo?"
fi

echo "------------------------------------------------------------------------"
echo "PROCESSOS DO SISTEMA:"
echo "------------------------------------------------------------------------"
ps aux | grep -E "audio_brain|node server.js|TouchDesigner" | grep -v grep | awk '{printf "%-8s %-6s %-6s %-s\n", $1, $2, $3, $11}'

echo ""
echo "------------------------------------------------------------------------"
echo "ÚLTIMAS ENTRADAS DE overnight.log:"
echo "------------------------------------------------------------------------"
if [ -f "$LOG_FILE" ]; then
    tail -n 12 "$LOG_FILE"
else
    echo "Nenhum log gravado ainda."
fi
echo ""
echo "========================================================================"
echo "Acesse a interface de controle no navegador: http://localhost:3000"
echo "========================================================================"
