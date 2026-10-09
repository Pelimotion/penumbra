---
name: midi-hardware-master
description: >-
  Orchestrates, maps, and operates physical and virtual MIDI controllers in Penumbra VJ Engine. Use whenever configuring Web MIDI API, modifying control mappings, troubleshooting hardware connectivity (M-Vave SMC-MIXER, Mackie, LaunchControl, nanoKONTROL), calibrating Soft Takeover pickup modes, tuning ballistic rotary encoder acceleration, or interacting with the Interactive Hardware Twin.
---

# 🎛️ MIDI Hardware Master: Conectividade & Hardware Twin Engine

Esta habilidade reúne todos os padrões arquiteturais, procedimentos de calibração e invariantes para operação de controladores MIDI no **Penumbra System** (operável simultaneamente via hardware físico, teclado ou mouse).

---

## 🎯 Objetivo & Casos de Uso
1. **Configuração & Mapeamento:** Mapeamento de encoders, faders e botões com suporte a MIDI Learn persistente em `localStorage`.
2. **Níveis de Controle (Hierarquia Modal):** Operação nos 4 bancos hierárquicos:
   - **Banco 1 (Master Live Mixer):** Opacidade das 5 camadas, Master Crossfader, Master Speed, Master Blackout Dimmer, Sobel Edge Thresholds e Gamma.
   - **Banco 2 (Layer Focus & Parâmetros Profundos):** Controle focado no clipe ativo (Speed, Scale, Pan/Rotation, Hue Tint, Matte Invert, Blend Mode, Procedural Crops, DSP Envelopes e os 5 FX do After Effects).
   - **Banco 3 (Conductor & Macro Presets):** Disparo em tempo real dos 16 Macro Presets nas matrizes de botões (Intro, Groove, Build, Drop, Break) e modulação de Autopilot.
   - **Banco 4 (Color Lab & Grading):** Gamma, Pedestal de Pretos, Densidade de Médios, Contraste, Saturação e Grão de Filme.
3. **Prevenção de Glitches em Projeções:** Prevenção de saltos bruscos ("value jumping") em telão através do **Soft Takeover Engine (Pickup Mode)**.
4. **Precisão Cirúrgica vs Saltos Dinâmicos:** Aceleração balística para rotary encoders sem fim (360°).
5. **Gêmeo Virtual Interativo:** Suporte ao **Interactive Hardware Twin** (réplica visual em SVG/CSS do M-Vave SMC-MIXER com display OLED virtual e feedback bidirecional).

---

## 🛡️ Invariantes Críticas & Regras de Ouro
1. **Zero Degraus Visuais (60 FPS LERP):** Nunca aplique valores discretos brutos ($0\dots 127$) diretamente no canvas sem interpolação em parâmetros sensíveis como Gamma, Speed e Sobel Mix.
2. **Soft Takeover Obrigatório ao Trocar de Banco:** Ao comutar de banco (ex: de B1 para B2), os faders físicos ficam desengatados até interceptarem o valor atual do software, emitindo feedback de direção (`▲` ou `▼`).
3. **Proibição de Strobes Brancos (`#ffffff`):** O botão Rec / Trigger em camadas nunca deve gerar flashes brancos estourados; deve modular temporariamente o blend Difference ou aplicar pulso suave de opacidade contido.
4. **Tríade Operacional Simétrica:** Qualquer função disponível no controlador físico DEVE ser 100% controlável via mouse no Hardware Twin e por atalhos de teclado.

---

## 📋 Protocolo de Conexão & Especificação M-Vave SMC-MIXER

### Canais Padrão (CC Mode):
* **Rotary Encoders (Knobs 1 a 8):** CC 1 a 8 (ou CC 16 a 23). Suporta modo relativo (Relative 2 / 2's Complement: 1=UP, 127=DOWN).
* **Faders Lineares (1 a 8):** CC 9 a 16 (ou CC 0 a 7). Normalizado linearmente para $[0.0\dots 1.0]$.
* **Botões Mute (1 a 8):** CC 32 a 39 (ou Notes 16 a 23).
* **Botões Solo (1 a 8):** CC 40 a 47 (ou Notes 8 a 15).
* **Botões Rec (1 a 8):** CC 48 a 55 (ou Notes 0 a 7).
* **Botões Select (1 a 8):** CC 56 a 63 (ou Notes 24 a 31).
* **Transporte & Navegação:** CC 64 (Rewind), CC 65 (FF), CC 66 (Stop), CC 67 (Play), CC 68 (Loop), CC 69 (Tap), CC 70 (Bank Left), CC 71 (Bank Right), CC 72 (Panic).

---

## ⌨️ Tabela de Atalhos de Teclado (Laptop Equivalente)
* `[` / `]`: Alternar Bancos (B1 ➔ B2 ➔ B3 ➔ B4)
* `Shift + 1 .. 5`: Focar na Camada correspondente (Layer Focus B2)
* `Alt + 1 .. 5`: Mute instantâneo da Camada 1 a 5
* `Space`: Auto Take Suave (Play)
* `Enter`: Corte Seco Imediato (Hard Cut)
* `R`: Reiniciar Frase Musical / Downbeat 1.1.1 (Rewind)
* `Tab`: Alternar Módulos e Pro Timeline (Loop)
* `B`: Master Blackout Instantâneo (Panic)
* `←` / `→`: Mover Master Crossfader

---

## ✅ Verificação & Validação
1. Execute `npm run build` para garantir que `Penumbra_Portable.html` e o bundle local integrem os componentes sem erro.
2. Inspecione se o widget `#chip-midi` no topo da tela exibe o status de conexão e badge do banco ativo.
3. Abra as configurações (atalho `,`), acerte a aba `Controlador MIDI & Twin` e teste o movimento de faders e knobs com o mouse e pelo hardware.
