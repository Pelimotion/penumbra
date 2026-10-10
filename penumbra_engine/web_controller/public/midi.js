/**
 * 🪐 PENUMBRA VJ ENGINE · ADVANCED MIDI CONTROLLER HUB (PRO REVOLUTION)
 * 
 * Arquitetura de Conectividade de Vanguarda inspirada em Ableton Live 12, Resolume Arena 7,
 * Elektron Octatrack e Bitwig Studio.
 * 
 * Recursos Centrais:
 * 1. Suporte Nativo & Modelagem Fiel ao M-Vave SMC-MIXER (e compatível com Mackie, nanoKONTROL2, LaunchControl XL)
 * 2. Arquitetura Modal Hierárquica em 4 Níveis (Master Mixer, Layer Focus, Conductor Macros, Color Lab)
 * 3. Soft Takeover Engine (Pickup Mode sem saltos bruscos em telão / Value Scaling)
 * 4. Ballistic Rotary Encoder Engine (Aceleração balística por velocidade delta-t)
 * 5. Sistema MIDI Learn em Tempo Real com Persistência em LocalStorage
 * 6. Feedback Bi-direcional de LEDs (MIDI Output)
 * 7. Gêmeo Virtual Interativo do Hardware ("Interactive Hardware Twin") operável 100% via MIDI, Teclado ou Mouse
 * 8. Zero-Zipper LERP Smoothing a 60 FPS
 */

class PenumbraMidiHub {
  constructor() {
    this.midiAccess = null;
    this.activeInput = null;
    this.activeOutput = null;
    this.devicesList = [];
    
    // Modos / Bancos Operacionais (Hardware M-Vave SMC-MIXER Dual-Bank Architecture)
    // 1: Banco A (Master Live Mixer, Takes, Levels & Layers)
    // 2: Banco B (FX Engine, Mattes, Shaders & Creative Sculpt)
    this.activeBank = 1;
    this.bankNames = {
      1: 'BANK A · LIVE MIX, TAKES & LEVELS',
      2: 'BANK B · FX ENGINE, MATTES & SCULPT',
      3: 'BANK C · 3D GENERATIVE MATRIX & ESTRELA 13'
    };
    
    // Foco de Camada para o Banco 2
    this.activeFocusLayer = 0; // 0=L0, 1=L1, 2=L2, 3=L3, 4=L4
    
    // Soft Takeover Engine State
    // Registra se o controle físico já "alcançou" o valor atual do software
    // 'pickup' (padrão pro), 'scaling', 'direct'
    this.takeoverMode = 'pickup'; 
    this.takeoverTolerance = 0.04; // 4% de tolerância para engate
    this.takeoverStates = {}; // key: "bank_type_idx", val: { isCaught, physicalVal, targetVal, direction: 'UP'|'DOWN'|'CAUGHT' }

    // Ballistic Rotary Engine State
    this.encoderLastTime = {};
    this.encoderSensitivities = { low: 0.005, mid: 0.015, high: 0.035 };
    this.activeSensitivity = 'mid';

    // MIDI Learn State
    this.isLearning = false;
    this.learnTarget = null; // { bank, type, index, name }
    this.customMappings = this.loadCustomMappings();

    // Perfil Ativo e Detecção de Protocolo
    this.activeProfile = (typeof localStorage !== 'undefined' && localStorage.getItem('penumbra_midi_profile')) || 'mvave_smc';
    this.hardwareBank = (typeof localStorage !== 'undefined' && localStorage.getItem('penumbra_midi_hw_bank')) || 'bank1';
    this.detectedProtocol = 'Aguardando controlador...';

    // Telemetria & Monitor
    this.messageCount = 0;
    this.messageRateHz = 0;
    this.lastMsgTime = performance.now();
    this.recentMessages = []; // buffer circular dos últimos 40 eventos
    this.activeTelemetry = {
      deviceName: 'Procurando...',
      connected: false,
      channel: 1,
      lastAction: 'Iniciando sistema',
      detectedProtocol: 'Aguardando controlador...',
      msgRate: 0
    };

    // Camada de Estado Lógico do Hardware Twin
    this.twinState = {
      faders: [1.0, 0.0, 0.2, 0.0, 0.0, 0.5, 1.0, 1.0], // 8 canais
      knobs: [0.35, 0.5, 0.25, 0.5, 0.0, 0.85, 1.0, 0.22], // 8 encoders
      buttons: {
        mute: [false, false, false, false, false, false, false, false],
        solo: [false, false, false, false, false, false, false, false],
        rec: [false, false, false, false, false, false, false, false],
        sel: [true, false, false, false, false, false, false, false]
      },
      transport: {
        play: true,
        loop: true,
        blackout: false
      }
    };

    // Callbacks de Atualização de UI
    this.uiListeners = new Set();

    // Inicialização
    this.init();
    this.startRateTicker();
    this.bindKeyboardShortcuts();
  }

  // =========================================================================
  // 1. INICIALIZAÇÃO & WEBMIDI ACCESS COM HOT-PLUG
  // =========================================================================
  async init() {
    if (!navigator.requestMIDIAccess) {
      console.warn("[PENUMBRA MIDI] Web MIDI API não é suportada neste navegador (Requer Chrome, Edge ou Opera com HTTPS/Localhost).");
      this.activeTelemetry.deviceName = 'Web MIDI Indisponível';
      this.notifyUI();
      return;
    }

    try {
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: true });
      this.midiAccess.onstatechange = this.onStateChange.bind(this);
      this.scanDevices();
      console.log("[PENUMBRA MIDI] Motor Web MIDI inicializado com sucesso.");
    } catch (err) {
      console.warn("[PENUMBRA MIDI] Acesso Sysex recusado, tentando sem Sysex:", err);
      try {
        this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
        this.midiAccess.onstatechange = this.onStateChange.bind(this);
        this.scanDevices();
      } catch (e2) {
        console.error("[PENUMBRA MIDI] Erro fatal ao acessar Web MIDI:", e2);
        this.activeTelemetry.deviceName = 'Acesso Negado';
        this.notifyUI();
      }
    }
  }

  scanDevices() {
    if (!this.midiAccess) return;
    this.devicesList = [];
    
    // Inputs
    const inputs = Array.from(this.midiAccess.inputs.values());
    // Outputs
    const outputs = Array.from(this.midiAccess.outputs.values());

    let candidateInput = null;
    let candidateOutput = null;

    inputs.forEach(input => {
      this.devicesList.push({ type: 'input', id: input.id, name: input.name, manufacturer: input.manufacturer || 'Generic' });
      const lower = (input.name || '').toLowerCase();
      if (lower.includes('smc') || lower.includes('vave') || lower.includes('m-vave') || lower.includes('cuvave') || lower.includes('mixer')) {
        candidateInput = input;
      } else if (!candidateInput && (lower.includes('midi') || lower.includes('controller') || lower.includes('usb'))) {
        candidateInput = input;
      }
    });

    outputs.forEach(output => {
      this.devicesList.push({ type: 'output', id: output.id, name: output.name, manufacturer: output.manufacturer || 'Generic' });
      const lower = (output.name || '').toLowerCase();
      if (lower.includes('smc') || lower.includes('vave') || lower.includes('m-vave') || lower.includes('cuvave') || lower.includes('mixer')) {
        candidateOutput = output;
      } else if (!candidateOutput && (lower.includes('midi') || lower.includes('controller') || lower.includes('usb'))) {
        candidateOutput = output;
      }
    });

    if (candidateInput) {
      this.bindInput(candidateInput);
    } else if (inputs.length > 0) {
      this.bindInput(inputs[0]);
    } else {
      this.activeInput = null;
      this.activeTelemetry.connected = false;
      this.activeTelemetry.deviceName = 'Nenhum controlador físico';
    }

    if (candidateOutput) {
      this.activeOutput = candidateOutput;
    } else if (outputs.length > 0) {
      this.activeOutput = outputs[0];
    } else {
      this.activeOutput = null;
    }

    this.syncTwinWithApplicationState();
    this.notifyUI();
  }

  bindInput(device) {
    if (this.activeInput) {
      this.activeInput.onmidimessage = null;
    }
    this.activeInput = device;
    this.activeInput.onmidimessage = this.handleMidiMessage.bind(this);
    this.activeTelemetry.connected = true;
    this.activeTelemetry.deviceName = device.name || 'Controlador MIDI';
    console.log(`[PENUMBRA MIDI] Conectado e escutando: ${device.name}`);
    this.sendLedFeedbackAll();
    this.notifyUI();
  }

  onStateChange(event) {
    const port = event.port;
    console.log(`[PENUMBRA MIDI] Hot-plug state change: ${port.name} (${port.type}) -> ${port.state}`);
    this.scanDevices();
  }

  // =========================================================================
  // 2. DISPATCHER DE MENSAGENS MIDI & PROTOCOLOS (CC, NOTE, MACKIE)
  // =========================================================================
  handleMidiMessage(event) {
    const data = event.data;
    if (!data || data.length < 2) return;

    const status = data[0];
    const data1 = data[1];
    const data2 = data.length > 2 ? data[2] : 0;
    const command = status >> 4;
    const channel = (status & 0x0F) + 1;

    // Métricas de taxa
    this.messageCount++;
    const now = performance.now();
    this.lastMsgTime = now;

    // Log para monitor
    this.recordMessageLog({
      timestamp: new Date().toLocaleTimeString(),
      statusHex: '0x' + status.toString(16).toUpperCase(),
      cmdName: command === 0x9 ? 'Note On' : command === 0x8 ? 'Note Off' : command === 0xB ? 'Control Change' : 'SysEx/Other',
      channel: channel,
      data1: data1,
      data2: data2
    });

    // Modo MIDI LEARN intercepta primeiro
    if (this.isLearning && this.learnTarget) {
      this.commitMidiLearn(command, data1, channel);
      return;
    }

    // Processamento de Comandos
    if (command === 0xB) {
      // Control Change (CC)
      this.processControlChange(data1, data2, channel);
    } else if (command === 0x9) {
      // Note On
      if (data2 > 0) {
        this.processNoteMessage(data1, data2, true, channel);
      } else {
        this.processNoteMessage(data1, 0, false, channel);
      }
    } else if (command === 0x8) {
      // Note Off
      this.processNoteMessage(data1, 0, false, channel);
    } else if (command === 0xE) {
      // Pitch Bend (Fader de alta resolução em Mackie Control)
      this.processPitchBend(data1, data2, channel);
    }

    this.notifyUI();
  }

  recordMessageLog(item) {
    this.recentMessages.unshift(item);
    if (this.recentMessages.length > 200) {
      this.recentMessages.pop();
    }
    // Envia telemetria para o servidor local para diagnóstico exato em tempo real
    try {
      fetch('/api/midi-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      }).catch(() => {});
    } catch (e) {}
  }

  // =========================================================================
  // 3. MAPEAMENTOS CUSTOMIZADOS & DETECÇÃO INTELIGENTE DO M-VAVE SMC-MIXER
  // =========================================================================
  processControlChange(cc, value, channel) {
    const norm = value / 127.0;

    // 1. Verifica se há mapeamento customizado salvo
    const customKey = `CC_${channel}_${cc}`;
    if (this.customMappings[customKey]) {
      this.executeMappedAction(this.customMappings[customKey], norm, value);
      return;
    }

    this.detectedProtocol = 'Modo CC (Control Change)';
    this.activeTelemetry.detectedProtocol = 'Modo CC';

    // 2. DETECÇÃO INTELIGENTE DE MUDANÇA DE BANCO DE HARDWARE DO M-VAVE:
    // Seta Esquerda ◄ (CC 86 ou CC 46) -> Seleciona BANCO A (Live Mixer, Takes & Levels)
    // Seta Direita ► (CC 87 ou CC 47) -> Seleciona BANCO B (FX Engine, Mattes & Sculpt)
    if (cc === 86 || (cc === 46 && value > 0)) {
      this.setBank(1);
      return;
    }
    if (cc === 87 || (cc === 47 && value > 0)) {
      this.setBank(2);
      return;
    }

    // 1. Faders Físicos 1 a 8 (CC 20 a 27 no Canal 1 ou CC 9 a 16):
    if (channel === 1 && ((cc >= 20 && cc <= 27) || (cc >= 9 && cc <= 16))) {
      const faderIdx = (cc >= 20 && cc <= 27) ? (cc - 20) : (cc - 9);
      this.handleFaderInput(faderIdx, norm);
      return;
    }

    // 2. Master Fader / Crossfader Físico (CC 28 ou CC 29 no Canal 1, CC 17, CC 11):
    if (channel === 1 && (cc === 28 || cc === 29 || cc === 17 || cc === 11)) {
      this.handleMasterFaderInput(norm);
      return;
    }

    // 3. Knobs / Rotary Encoders 1 a 8 (CC 30 a 37 no Canal 1 ou CC 1 a 8):
    if (channel === 1 && ((cc >= 30 && cc <= 37) || (cc >= 1 && cc <= 8))) {
      const knobIdx = (cc >= 30 && cc <= 37) ? (cc - 30) : (cc - 1);
      this.handleKnobInput(knobIdx, value, norm);
      return;
    }

    // 4. Botões de Mute (CC 40 a 47 no Canal 1):
    if (channel === 1 && cc >= 40 && cc <= 47 && value > 0) {
      this.handleButtonMute(cc - 40);
      return;
    }

    // 5. Botões de Solo (CC 48 a 55 no Canal 1):
    if (channel === 1 && cc >= 48 && cc <= 55 && value > 0) {
      this.handleButtonSolo(cc - 48);
      return;
    }

    // 6. Botões de Rec / Trigger (CC 36 a 43 no Canal 1):
    if (channel === 1 && cc >= 36 && cc <= 43 && value > 0) {
      this.handleButtonRec(cc - 36);
      return;
    }

    // 7. Botões de Select / Inspect (CC 64 a 71 no Canal 1):
    if (channel === 1 && cc >= 64 && cc <= 71 && value > 0) {
      this.handleButtonSelect(cc - 64);
      return;
    }

    // 8. Transporte & Setas de Navegação (CC 56 a 63 no Canal 1):
    if (channel === 1 && cc >= 56 && cc <= 63 && value > 0) {
      switch (cc) {
        case 56: this.actionRewind(); return;          // Rewind / Downbeat 1.1.1
        case 57: this.actionFastForward(); return;     // FastForward / Advance Take
        case 58: this.stepCrossfader(-5); return;      // Seta Esquerda (◄ Nudge A)
        case 59: this.navigateUp(); return;            // Seta Acima (▲ Preset Anterior)
        case 60: this.navigateDown(); return;          // Seta Abaixo (▼ Próximo Preset)
        case 61: this.stepCrossfader(+5); return;      // Seta Direita (► Nudge B)
        case 62: this.toggleBank(); return;            // Cycle / Loop (Alterna Bank A / Bank B)
        case 63: this.actionBlackout(); return;        // Record / Panic Blackout
      }
    }

    // 9. Botões de Transporte Mackie CC Adicionais:
    if (value > 0) {
      switch (cc) {
        case 80: case 114: this.actionRewind(); return;
        case 81: case 115: this.actionFastForward(); return;
        case 82: case 116: this.actionStop(); return;
        case 83: case 117: this.actionPlay(); return;
        case 84: case 118: this.toggleBank(); return;
        case 85: case 119: this.actionBlackout(); return;
        case 86: this.setBank(1); return;
        case 87: this.setBank(2); return;
        case 88: this.actionTapTempo(); return;
      }
    }

    // 3. CONTROLADORES GENÉRICOS & FALLBACKS (UNIVERSAL / MCU):
    // ---------------------------------------------------------
    // Volume por Canal (CC 7 em Canais 1 a 8):
    if (cc === 7 && channel >= 1 && channel <= 8) {
      const faderIdx = channel - 1;
      this.handleFaderInput(faderIdx, norm);
      return;
    }
    if (cc === 7 && channel === 9) {
      this.handleMasterFaderInput(norm);
      return;
    }

    // Pan por Canal (CC 10 em Canais 1 a 8):
    if (cc === 10 && channel >= 1 && channel <= 8) {
      const knobIdx = channel - 1;
      this.handleKnobInput(knobIdx, value, norm);
      return;
    }

    // Faders Lineares Genéricos (CC 9 a 16 no Canal 1):
    if (channel === 1 && cc >= 9 && cc <= 16) {
      const faderIdx = cc - 9;
      this.handleFaderInput(faderIdx, norm);
      return;
    }

    // Knobs Lineares Genéricos (CC 1 a 8 no Canal 1):
    if (channel === 1 && cc >= 1 && cc <= 8) {
      const knobIdx = cc - 1;
      this.handleKnobInput(knobIdx, value, norm);
      return;
    }

    // Knobs MCU V-Pots (CC 16 a 23 apenas para perfil explícito 'mackie_universal'):
    if (this.activeProfile === 'mackie_universal' && channel === 1 && cc >= 16 && cc <= 23) {
      const knobIdx = cc - 16;
      this.handleKnobInput(knobIdx, value, norm);
      return;
    }

    // Master / Crossfader adicional genérico (CC 17, CC 11):
    if (cc === 17 || cc === 11) {
      this.handleMasterFaderInput(norm);
      return;
    }

    // Fader CC 0 (ex: nanoKONTROL2 Fader 1):
    if (channel === 1 && cc === 0) {
      this.handleFaderInput(0, norm);
      return;
    }
  }

  processNoteMessage(note, velocity, isDown, channel) {
    if (!isDown) return;

    const customKey = `NOTE_${channel}_${note}`;
    if (this.customMappings[customKey]) {
      this.executeMappedAction(this.customMappings[customKey], 1.0, velocity);
      return;
    }

    this.detectedProtocol = 'Mackie MCU (Notas MIDI)';
    this.activeTelemetry.detectedProtocol = 'Mackie MCU';

    // M-Vave SMC-MIXER / VAVE6412 - Mapeamento Fiel aos Botões Físicos em Modo MCU:
    // Faixa de canal tem 4 botões de cima para baixo: M (Mute), S (Solo), R (Rec), Select (□)
    
    // 1. Linha R (Rec): Notes 0 a 7
    if (note >= 0 && note <= 7) {
      this.handleButtonRec(note);
      return;
    }

    // 2. Linha S (Solo): Notes 8 a 15
    if (note >= 8 && note <= 15) {
      this.handleButtonSolo(note - 8);
      return;
    }

    // 3. Linha M (Mute): Notes 16 a 23
    if (note >= 16 && note <= 23) {
      this.handleButtonMute(note - 16);
      return;
    }

    // 4. Linha Select (□): Notes 24 a 31
    if (note >= 24 && note <= 31) {
      this.handleButtonSelect(note - 24);
      return;
    }

    // 5. Transporte & Navegação Mackie (M-Vave hardware buttons):
    switch (note) {
      case 91: this.actionRewind(); return;          // Rewind (<<)
      case 92: this.actionFastForward(); return;     // FastForward (>>)
      case 93: this.actionStop(); return;            // Stop (||)
      case 94: this.actionPlay(); return;            // Play (>)
      case 95: this.actionBlackout(); return;        // Record (O) -> Master Blackout Panic
      case 86: this.toggleBank(); return;            // Cycle / Loop (🔁 Alterna Bank A/B)
      case 46: this.setBank(1); return;              // Channel / Bank Left (« Bank A)
      case 47: this.setBank(2); return;              // Channel / Bank Right (» Bank B)
      case 96: this.navigateUp(); return;            // Seta Acima (▲)
      case 97: this.navigateDown(); return;          // Seta Abaixo (▼)
      case 98: this.stepCrossfader(-5); return;      // Seta Esquerda (◀)
      case 99: this.stepCrossfader(+5); return;      // Seta Direita (▶)
    }

    // 6. Modo Pad / Oitava C1 (36 a 67) caso configurado via MidiSuite:
    if (note >= 36 && note <= 43) {
      this.handleButtonRec(note - 36);
      return;
    }
    if (note >= 44 && note <= 51) {
      this.handleButtonSolo(note - 44);
      return;
    }
    if (note >= 52 && note <= 59) {
      this.handleButtonMute(note - 52);
      return;
    }
    if (note >= 60 && note <= 67) {
      this.handleButtonSelect(note - 60);
      return;
    }
  }

  processPitchBend(lsb, msb, channel) {
    this.detectedProtocol = 'Mackie MCU (Pitch Bend Faders)';
    this.activeTelemetry.detectedProtocol = 'Mackie MCU';

    // Fader pitch bend em Mackie Control (14-bit: LSB + MSB)
    const raw = (msb << 7) | lsb;
    const norm = raw / 16383.0;
    const chIdx = channel - 1;
    if (chIdx >= 0 && chIdx < 8) {
      this.handleFaderInput(chIdx, norm);
    } else if (chIdx === 8) {
      // Canal 9: Master Fader em Mackie MCU
      this.handleMasterFaderInput(norm);
    }
  }

  // =========================================================================
  // 4. SOFT TAKEOVER ENGINE (VALUE PICKUP / SCALING SEM SALTO)
  // =========================================================================
  applySoftTakeover(controlKey, physicalNorm, currentSoftwareNorm) {
    if (this.takeoverMode === 'direct') {
      return { allowUpdate: true, finalValue: physicalNorm, direction: 'CAUGHT' };
    }

    let state = this.takeoverStates[controlKey];
    if (!state) {
      state = {
        isCaught: false,
        physicalVal: physicalNorm,
        targetVal: currentSoftwareNorm,
        direction: physicalNorm > currentSoftwareNorm ? 'DOWN' : 'UP'
      };
      this.takeoverStates[controlKey] = state;
    }

    state.physicalVal = physicalNorm;
    state.targetVal = currentSoftwareNorm;

    // Se já está engatado, acompanha diretamente
    if (state.isCaught) {
      state.direction = 'CAUGHT';
      return { allowUpdate: true, finalValue: physicalNorm, direction: 'CAUGHT' };
    }

    // Verifica se cruzou o valor atual dentro da tolerância
    const diff = physicalNorm - currentSoftwareNorm;
    if (Math.abs(diff) <= this.takeoverTolerance) {
      state.isCaught = true;
      state.direction = 'CAUGHT';
      console.log(`[PENUMBRA MIDI] Soft Takeover ENGATADO em ${controlKey} (alinhado a ${(currentSoftwareNorm * 100).toFixed(1)}%)`);
      return { allowUpdate: true, finalValue: physicalNorm, direction: 'CAUGHT' };
    }

    // Se ainda não alcançou, determina a direção necessária para engatar
    if (diff < 0) {
      state.direction = 'UP'; // Fader físico está abaixo: mova para cima
    } else {
      state.direction = 'DOWN'; // Fader físico está acima: mova para baixo
    }

    if (this.takeoverMode === 'scaling') {
      // Modo Value Scaling: move 50% em direção ao valor físico sem pulo abrupto
      const scaledVal = currentSoftwareNorm + diff * 0.2;
      return { allowUpdate: true, finalValue: Math.max(0, Math.min(1, scaledVal)), direction: state.direction };
    }

    // Modo 'pickup' rígido: bloqueia o movimento até interceptar
    return { allowUpdate: false, finalValue: currentSoftwareNorm, direction: state.direction };
  }

  resetTakeoverForBankChange() {
    // Ao trocar de banco, desengata os faders até novo cruzamento para evitar surpresas
    Object.keys(this.takeoverStates).forEach(key => {
      if (this.takeoverStates[key]) {
        this.takeoverStates[key].isCaught = false;
      }
    });
  }

  // =========================================================================
  // 5. PROCESSAMENTO DE FADERS NOS 4 BANCOS OPERACIONAIS
  // =========================================================================
  handleFaderInput(faderIdx, normValue) {
    if (faderIdx < 0 || faderIdx > 7) return;

    this.activeTelemetry.lastAction = `Fader ${faderIdx + 1} (${(normValue * 100).toFixed(0)}%)`;
    this.twinState.faders[faderIdx] = normValue;

    // =============================================================
    // BANCO 1 (BANK A): LIVE MIXER, TAKES & LEVELS
    // Faders 0 a 4: Opacidade das Camadas L0, L1, L2 (Find Edges), L3 (Cue B), L5 (Overlay)
    // Fader 5: Master Brightness / Fade to Black Dimmer
    // Fader 6: Master Video Speed (0.25x a 2.5x)
    // Fader 7: T-Bar Crossfader A/B (Takes)
    // =============================================================
    if (this.activeBank === 1) {
      const layerMap = [0, 1, 2, 3, 5];
      if (faderIdx >= 0 && faderIdx < layerMap.length) {
        const lNum = layerMap[faderIdx];
        const layerKey = `layer${lNum}`;
        const inputId = `l${lNum}-opacity`;
        const el = document.getElementById(inputId);
        const currNorm = el ? (Number(el.value) / 100.0) : 0;
        
        const takeover = this.applySoftTakeover(`b1_fader_${faderIdx}`, normValue, currNorm);
        if (takeover.allowUpdate) {
          this.setLayerOpacityDirect(layerKey, takeover.finalValue * 100);
        }
      } else if (faderIdx === 5) {
        // Master Dimmer / Brightness
        this.setMasterBrightnessDimmer(normValue);
      } else if (faderIdx === 6) {
        // Video Speed Master
        const spd = 0.25 + normValue * 2.25;
        this.setPlaybackSpeedGlobal(spd);
      } else if (faderIdx === 7) {
        // Crossfader Master Bus A/B
        this.handleMasterFaderInput(normValue);
      }
    }

    // =============================================================
    // BANCO 2 (BANK B): FX ENGINE, MATTES & SCULPT
    // Faders 0 a 4: Opacidades dos 5 Plugins de Efeitos (Pixel Sorter, Stretch, Modulation, Bad TV, RXXR)
    // Fader 5: Master FX Dry/Wet Mix
    // Fader 6: Find Edges Sobel Mix / Opacity
    // Fader 7: Master Blackout / Fade
    // =============================================================
    else if (this.activeBank === 2) {
      const plugins = ['pixel_sorter', 'pixel_stretch', 'modulation', 'bad_tv', 'rxxr'];
      if (faderIdx >= 0 && faderIdx < plugins.length) {
        const pId = plugins[faderIdx];
        const currInt = window.appState?.fx?.[pId]?.intensity !== undefined ? window.appState.fx[pId].intensity : 0.8;
        const takeover = this.applySoftTakeover(`b2_fader_${faderIdx}`, normValue, currInt);
        if (takeover.allowUpdate) {
          this.setFxPluginIntensityByIndex(faderIdx, takeover.finalValue);
          this.flashToastHud(`FX ${pId.replace('_', ' ').toUpperCase()}: ${Math.round(takeover.finalValue * 100)}%`);
        }
      } else if (faderIdx === 5) {
        // Master FX Dry/Wet Mix
        const currDryWet = window.appState?.fx?.masterIntensity !== undefined ? window.appState.fx.masterIntensity : 0.8;
        const takeover = this.applySoftTakeover('b2_fader_5', normValue, currDryWet);
        if (takeover.allowUpdate && window.setFxMasterParam) {
          window.setFxMasterParam('masterIntensity', takeover.finalValue);
          const slider = document.getElementById('slider-fx-intensity');
          if (slider) slider.value = Math.round(takeover.finalValue * 100);
          const valLbl = document.getElementById('val-fx-intensity');
          if (valLbl) valLbl.textContent = `${Math.round(takeover.finalValue * 100)}%`;
          this.flashToastHud(`MASTER FX DRY/WET: ${Math.round(takeover.finalValue * 100)}%`);
        }
      } else if (faderIdx === 6) {
        // Find Edges Sobel Mix
        this.updateFaderElement('fader-edge-mix', normValue, 0, 100);
        if (window.appState) {
          if (window.appState.tonal) window.appState.tonal.edge_mix = normValue;
          if (window.appState.layers?.layer2) window.appState.layers.layer2.edge_mix = normValue;
        }
      } else if (faderIdx === 7) {
        // Master Dimmer / Fade
        this.setMasterBrightnessDimmer(normValue);
      }
    }

    // =============================================================
    // BANCO 3 (BANK C): 3D GENERATIVE MATRIX & SCENE MORPH
    // Fader 0: Scene Morph / Selector (Spine / Ocean Sun / Star 13 / Hybrid)
    // Fader 1: Palette Morph (Cyan Neon / Solar / Emerald / Violet / Ice)
    // Fader 2: Numeral 13 Z-Displacement Kick Mult (0.5x a 4.0x)
    // Fader 3: Star 13 Treble Spin Sensitivity (0.2x a 3.0x)
    // Fader 4: Ocean Wave Amplitude (0.2x a 2.5x)
    // Fader 5: Preamp Microphone Gain (0.5x a 5.0x)
    // Fader 6: Vignette Roundness (0% a 100%)
    // Fader 7: Master Dimmer / Blackout
    // =============================================================
    else if (this.activeBank === 3) {
      if (faderIdx === 0) {
        const scenes = ['spine', 'ocean_sun', 'star_13', 'hybrid'];
        const scIdx = Math.min(3, Math.floor(normValue * 4));
        if (window.appState?.gen3d) {
          window.appState.gen3d.active_scene = scenes[scIdx];
        }
        this.flashToastHud(`3D CENA: ${scenes[scIdx].toUpperCase()}`);
        if (window.renderStudioInspector) window.renderStudioInspector();
      } else if (faderIdx === 1) {
        const palettes = ['cyan_neon', 'solar_gold', 'matrix_emerald', 'deep_violet', 'monochrome_ice'];
        const pIdx = Math.min(4, Math.floor(normValue * 5));
        if (window.appState?.gen3d) {
          window.appState.gen3d.palette = palettes[pIdx];
        }
        this.flashToastHud(`3D PALETA: ${palettes[pIdx].toUpperCase()}`);
        if (window.renderStudioInspector) window.renderStudioInspector();
      } else if (faderIdx === 2) {
        const kick = 0.5 + normValue * 3.5;
        if (window.appState?.gen3d?.audio_reactivity) {
          window.appState.gen3d.audio_reactivity.num13_sub_kick = kick;
        }
        this.flashToastHud(`NUMERAL 13 KICK: ${kick.toFixed(1)}x`);
      } else if (faderIdx === 3) {
        const spin = 0.2 + normValue * 2.8;
        if (window.appState?.gen3d?.audio_reactivity) {
          window.appState.gen3d.audio_reactivity.star_treble_spin = spin;
        }
        this.flashToastHud(`ESTRELA TREBLE SPIN: ${spin.toFixed(1)}x`);
      } else if (faderIdx === 4) {
        const wave = 0.2 + normValue * 2.3;
        if (window.appState?.gen3d?.audio_reactivity) {
          window.appState.gen3d.audio_reactivity.ocean_wave_amp = wave;
        }
        this.flashToastHud(`OCEAN WAVE AMP: ${wave.toFixed(1)}x`);
      } else if (faderIdx === 5) {
        const gain = 0.5 + normValue * 4.5;
        if (typeof window.setAudioPreampGain === 'function') {
          window.setAudioPreampGain(gain);
        }
        this.flashToastHud(`PREAMP GAIN: ${gain.toFixed(2)}x`);
      } else if (faderIdx === 6) {
        if (window.appState?.matte?.vignette) {
          window.appState.matte.vignette.roundness = normValue;
          window.appState.matte.vignette.enabled = true;
        }
        this.flashToastHud(`VINHETA ROUNDNESS: ${Math.round(normValue * 100)}%`);
        if (window.renderStudioInspector) window.renderStudioInspector();
      } else if (faderIdx === 7) {
        this.setMasterBrightnessDimmer(normValue);
      }
    }
  }

  handleMasterFaderInput(normValue) {
    const el = document.getElementById('crossfader');
    if (el) {
      el.value = (normValue * 100).toFixed(1);
      el.dispatchEvent(new Event('input'));
    }
  }

  // =========================================================================
  // 6. PROCESSAMENTO DE ROTARY ENCODERS COM ACELERAÇÃO BALÍSTICA
  // =========================================================================
  handleKnobInput(knobIdx, rawValue, normValue) {
    if (knobIdx < 0 || knobIdx > 7) return;

    // Detecta se o controlador está operando em Modo Relativo (ex: Mackie MCU / Relative Sign-Magnitude)
    const isRelativeStep = (rawValue === 1 || rawValue === 65 || (rawValue >= 2 && rawValue <= 4) || (rawValue >= 66 && rawValue <= 68));
    const isExplicitRelative = this.encoderMode === 'relative';
    const isExplicitAbsolute = this.encoderMode === 'absolute';

    let newKnobVal;
    if (isExplicitAbsolute || (!isExplicitRelative && !isRelativeStep && (rawValue > 4 && rawValue < 64 || rawValue > 68 && rawValue <= 127 || rawValue === 0))) {
      newKnobVal = normValue;
    } else if (isExplicitRelative || isRelativeStep) {
      const now = performance.now();
      const lastTime = this.encoderLastTime[knobIdx] || now;
      const dt = Math.max(1, now - lastTime);
      this.encoderLastTime[knobIdx] = now;

      const acceleration = dt < 30 ? 3.5 : (dt < 70 ? 2.0 : 1.0);
      const baseStep = (this.encoderSensitivities[this.activeSensitivity] || 0.015) * acceleration;

      let delta = 0;
      if (rawValue === 1 || (rawValue >= 2 && rawValue <= 15)) {
        delta = (rawValue > 0 ? rawValue : 1) * baseStep;
      } else if (rawValue === 65 || (rawValue >= 66 && rawValue <= 75)) {
        const steps = rawValue - 64;
        delta = -(steps > 0 ? steps : 1) * baseStep;
      } else if (rawValue === 127) {
        delta = -baseStep;
      } else {
        delta = (normValue - (this.twinState.knobs[knobIdx] || 0.5)) * 0.15;
      }

      const currentKnobVal = this.twinState.knobs[knobIdx] || 0;
      newKnobVal = Math.max(0, Math.min(1, currentKnobVal + delta));
    } else {
      newKnobVal = normValue;
    }

    this.twinState.knobs[knobIdx] = newKnobVal;
    this.activeTelemetry.lastAction = `Knob ${knobIdx + 1} (${(newKnobVal * 100).toFixed(0)}%)`;

    // =============================================================
    // BANCO 1 (BANK A): LEVELS & MATTES
    // Knobs 0 a 3: Levels (Pretos, Contraste, Gamma, Find Edges White Luminance Boost)
    // Knobs 4 a 7: Mattes (Selector, Scale/Zoom, Invert Toggle, Mix/Opacity)
    // =============================================================
    if (this.activeBank === 1) {
      if (knobIdx === 0) {
        // Black Pedestal (-30% a +20%)
        this.updateFaderElement('fader-brightness', newKnobVal, -30, 20);
      } else if (knobIdx === 1) {
        // Contrast (60% a 160%)
        this.updateFaderElement('fader-contrast', newKnobVal, 60, 160);
      } else if (knobIdx === 2) {
        // Gamma (0.40 a 1.60)
        this.updateFaderElement('fader-gamma', newKnobVal, 40, 160);
      } else if (knobIdx === 3) {
        // Find Edges White Luminance Boost (1.0x a 4.0x)
        const boost = 1.0 + newKnobVal * 3.0;
        if (window.appState) {
          if (window.appState.tonal) window.appState.tonal.edge_luminance = boost;
          if (window.appState.layers?.layer2) window.appState.layers.layer2.edge_luminance = boost;
        }
        this.flashToastHud(`FIND EDGES WHITE LUMINANCE: ${(boost).toFixed(1)}x`);
        if (window.renderStudioInspector) window.renderStudioInspector();
      } else if (knobIdx === 4) {
        // Matte Selector
        this.cycleMatteByKnob(newKnobVal);
      } else if (knobIdx === 5) {
        // Matte Scale / Zoom (0.5x a 2.5x)
        const scale = 0.5 + newKnobVal * 2.0;
        if (window.appState?.matte?.deform) {
          window.appState.matte.deform.wiggle_scale = scale * 0.05;
        }
        this.flashToastHud(`MÁSCARA ZOOM: ${(scale).toFixed(2)}x`);
      } else if (knobIdx === 6) {
        // Matte Invert Toggle (acima de 50% inverte)
        const inv = newKnobVal > 0.5;
        if (window.appState?.layers?.layer3) {
          window.appState.layers.layer3.matte_invert = inv;
        }
        this.flashToastHud(`MÁSCARA INVERT: ${inv ? 'INVERTIDA' : 'NORMAL'}`);
      } else if (knobIdx === 7) {
        // Matte Opacity / Mix
        this.setLayerMatteThreshold('layer3', newKnobVal);
      }
    }

    // =============================================================
    // BANCO 2 (BANK B): FX ENGINE KEY PARAMETERS & FIND EDGES
    // Knob 0: Pixel Sorter (Threshold & Chunk Size)
    // Knob 1: Pixel Stretch (Length & Direction)
    // Knob 2: Modulation (Frequency & Density)
    // Knob 3: Bad TV (Warp Distortion & Tape Noise)
    // Knob 4: RXXR (Matrix Density & Shift)
    // Knob 5: Find Edges Threshold (Sensibilidade 5% a 90%)
    // Knob 6: Find Edges White Luminance Boost (1.0x a 4.0x)
    // Knob 7: FX Audio Reactivity (Sensibilidade musical)
    // =============================================================
    else if (this.activeBank === 2) {
      if (knobIdx === 0) {
        this.setFxParam('pixel_sorter', 'threshold_min', 0.1 + newKnobVal * 0.8);
      } else if (knobIdx === 1) {
        this.setFxParam('pixel_stretch', 'length', Math.round(50 + newKnobVal * 450));
      } else if (knobIdx === 2) {
        this.setFxParam('modulation', 'frequency', Math.round(10 + newKnobVal * 120));
      } else if (knobIdx === 3) {
        this.setFxParam('bad_tv', 'tv_warp_wiggle', newKnobVal * 0.9);
      } else if (knobIdx === 4) {
        this.setFxParam('rxxr', 'density', Math.round(4 + newKnobVal * 20));
      } else if (knobIdx === 5) {
        // Find Edges Sensitivity (Threshold)
        const th = 0.05 + newKnobVal * 0.85;
        if (window.appState) {
          if (window.appState.tonal) window.appState.tonal.edge_threshold = th;
          if (window.appState.layers?.layer2) window.appState.layers.layer2.edge_threshold = th;
        }
        this.updateFaderElement('fader-edge-thresh', newKnobVal, 5, 90);
        this.flashToastHud(`FIND EDGES THRESHOLD: ${Math.round(th * 100)}%`);
        if (window.renderStudioInspector) window.renderStudioInspector();
      } else if (knobIdx === 6) {
        // Find Edges White Luminance Boost
        const boost = 1.0 + newKnobVal * 3.0;
        if (window.appState) {
          if (window.appState.tonal) window.appState.tonal.edge_luminance = boost;
          if (window.appState.layers?.layer2) window.appState.layers.layer2.edge_luminance = boost;
        }
        this.flashToastHud(`FIND EDGES WHITE LUMINANCE: ${(boost).toFixed(1)}x`);
        if (window.renderStudioInspector) window.renderStudioInspector();
      } else if (knobIdx === 7) {
        // Audio Gain / Reactivity
        if (typeof window.setAudioInputGain === 'function') {
          window.setAudioInputGain(Math.round(newKnobVal * 200));
          this.flashToastHud(`ÁUDIO GAIN: ${Math.round(newKnobVal * 200)}%`);
        }
      }
    }

    // =============================================================
    // BANCO 3 (BANK C): 3D GENERATIVE MATRIX & CAMERA DYNAMICS
    // Knob 0: 3D Orbit Speed (-2.0x a +2.0x)
    // Knob 1: Camera Tilt Angle (-45° a +45°)
    // Knob 2: Camera Distance / Zoom (1.2 a 4.2)
    // Knob 3: Star 13 Treble Spin Sensitivity (0.2x a 3.0x)
    // Knob 4: Numeral 13 Decoupled Sub Kick Sensitivity (0.5x a 4.0x)
    // Knob 5: Ocean Wave Amplitude (0.2x a 2.5x)
    // Knob 6: Vignette Roundness (0% a 100%)
    // Knob 7: Vignette Feather Softness (5% a 95%)
    // =============================================================
    else if (this.activeBank === 3) {
      if (knobIdx === 0) {
        const spd = (newKnobVal - 0.5) * 4.0;
        if (window.appState?.gen3d?.camera) window.appState.gen3d.camera.orbit_speed = spd;
        this.flashToastHud(`3D ORBIT SPEED: ${spd.toFixed(1)}x`);
      } else if (knobIdx === 1) {
        const tilt = (newKnobVal - 0.5) * 1.2;
        if (window.appState?.gen3d?.camera) window.appState.gen3d.camera.tilt = tilt;
        this.flashToastHud(`3D TILT: ${(tilt * 180 / Math.PI).toFixed(0)}°`);
      } else if (knobIdx === 2) {
        const dist = 1.2 + newKnobVal * 3.0;
        if (window.appState?.gen3d?.camera) window.appState.gen3d.camera.distance = dist;
        this.flashToastHud(`3D ZOOM DIST: ${dist.toFixed(1)}`);
      } else if (knobIdx === 3) {
        const spin = 0.2 + newKnobVal * 2.8;
        if (window.appState?.gen3d?.audio_reactivity) window.appState.gen3d.audio_reactivity.star_treble_spin = spin;
        this.flashToastHud(`ESTRELA TREBLE SPIN: ${spin.toFixed(1)}x`);
      } else if (knobIdx === 4) {
        const kick = 0.5 + newKnobVal * 3.5;
        if (window.appState?.gen3d?.audio_reactivity) window.appState.gen3d.audio_reactivity.num13_sub_kick = kick;
        this.flashToastHud(`NUMERAL 13 KICK: ${kick.toFixed(1)}x`);
      } else if (knobIdx === 5) {
        const wave = 0.2 + newKnobVal * 2.3;
        if (window.appState?.gen3d?.audio_reactivity) window.appState.gen3d.audio_reactivity.ocean_wave_amp = wave;
        this.flashToastHud(`OCEAN WAVE AMP: ${wave.toFixed(1)}x`);
      } else if (knobIdx === 6) {
        if (window.appState?.matte?.vignette) {
          window.appState.matte.vignette.roundness = newKnobVal;
          window.appState.matte.vignette.enabled = true;
        }
        this.flashToastHud(`VINHETA ROUNDNESS: ${Math.round(newKnobVal * 100)}%`);
        if (window.renderStudioInspector) window.renderStudioInspector();
      } else if (knobIdx === 7) {
        if (window.appState?.matte?.vignette) {
          window.appState.matte.vignette.feather = 0.05 + newKnobVal * 0.9;
          window.appState.matte.vignette.enabled = true;
        }
        this.flashToastHud(`VINHETA FEATHER: ${Math.round((0.05 + newKnobVal * 0.9) * 100)}%`);
        if (window.renderStudioInspector) window.renderStudioInspector();
      }
    }
  }

  // =========================================================================
  // 7. PROCESSAMENTO DE BOTÕES (MUTE, SOLO, REC, SELECT)
  // =========================================================================
  handleButtonMute(channelIdx) {
    if (channelIdx < 0 || channelIdx > 7) return;

    if (this.activeBank === 3) {
      // No Banco 3 (Conductor), os botões Mute disparam os Presets de INTRO e GROOVE!
      const presets = [
        ['INTRO', 0], ['INTRO', 1], ['INTRO', 2],
        ['GROOVE', 0], ['GROOVE', 1], ['GROOVE', 2], ['GROOVE', 3], ['GROOVE', 4]
      ];
      const p = presets[channelIdx];
      if (p && window.applyMacroPreset) {
        window.applyMacroPreset(p[0], p[1], true);
        this.flashToastHud(`MACRO ${p[0]} · PRESET ${p[1] + 1}`);
      }
      return;
    }

    // Comportamento Geral (Bancos 1, 2, 4):
    if (channelIdx <= 4) {
      const layerKey = `layer${channelIdx}`;
      if (typeof window.toggleLayerActive === 'function') {
        window.toggleLayerActive(layerKey);
      }
      this.twinState.buttons.mute[channelIdx] = !this.twinState.buttons.mute[channelIdx];
      this.sendLedFeedback('mute', channelIdx, this.twinState.buttons.mute[channelIdx]);
      this.activeTelemetry.lastAction = `Mute Camada L${channelIdx}`;
    } else if (channelIdx === 5) {
      // Canal 6: Toggle FX Sobel Edge
      if (typeof window.toggleFxModuleEnabled === 'function') {
        const isCur = window.appState && window.appState.fx && window.appState.fx.sobel_edge && window.appState.fx.sobel_edge.enabled;
        window.toggleFxModuleEnabled('sobel_edge', !isCur);
        this.flashToastHud(`SOBEL EDGE: ${!isCur ? 'LIGADO' : 'DESLIGADO'}`);
      }
    } else if (channelIdx === 6) {
      // Canal 7: Freeze / Normal
      this.actionStop();
    } else if (channelIdx === 7) {
      // Canal 8: Master Blackout Panic
      this.actionBlackout();
    }
    this.notifyUI();
  }

  handleButtonSolo(channelIdx) {
    if (channelIdx < 0 || channelIdx > 7) return;

    if (this.activeBank === 3) {
      // No Banco 3 (Conductor), os botões Solo disparam os Presets de BUILD, DROP e BREAK!
      const presets = [
        ['BUILD', 0], ['BUILD', 1], ['BUILD', 2], ['BUILD', 3],
        ['DROP', 0], ['DROP', 1], ['DROP', 2],
        ['BREAK', 0]
      ];
      const p = presets[channelIdx];
      if (p && window.applyMacroPreset) {
        window.applyMacroPreset(p[0], p[1], true);
        this.flashToastHud(`MACRO ${p[0]} · PRESET ${p[1] + 1}`);
      }
      return;
    }

    if (channelIdx <= 4) {
      const targetLayer = channelIdx === 4 ? 5 : channelIdx;
      this.soloLayer(targetLayer);
      this.activeTelemetry.lastAction = `Solo Camada L${targetLayer}`;
    } else if (channelIdx === 5) {
      // Canal 6: UNSOLO ALL (Destrava todos os canais de solo!)
      this.unsoloAll();
    } else if (channelIdx === 6) {
      // Canal 7: Reset Playback Speed
      this.setPlaybackSpeedGlobal(1.0);
      this.flashToastHud('VELOCIDADE MASTER: 1.0x (RESET)');
    } else if (channelIdx === 7) {
      // Canal 8: Reset Crossfader ao Centro (50%)
      const el = document.getElementById('crossfader');
      if (el) {
        el.value = '50';
        el.dispatchEvent(new Event('input'));
        this.flashToastHud('CROSSFADER: CENTRO 50%');
      }
    }
    this.notifyUI();
  }

  handleButtonRec(channelIdx) {
    if (channelIdx < 0 || channelIdx > 7) return;

    if (this.activeBank === 3) {
      if (channelIdx <= 3) {
        const scenes = ['spine', 'ocean_sun', 'star_13', 'hybrid'];
        const sc = scenes[channelIdx];
        if (window.appState?.gen3d) window.appState.gen3d.active_scene = sc;
        this.flashToastHud(`3D CENA: ${sc.toUpperCase()}`);
        if (window.renderStudioInspector) window.renderStudioInspector();
      } else {
        const palettes = ['cyan_neon', 'solar_gold', 'matrix_emerald', 'deep_violet'];
        const pal = palettes[channelIdx - 4];
        if (window.appState?.gen3d) window.appState.gen3d.palette = pal;
        this.flashToastHud(`3D PALETA: ${pal.toUpperCase()}`);
        if (window.renderStudioInspector) window.renderStudioInspector();
      }
      return;
    }

    if (this.activeBank === 2) {
      // No Banco 2 (Bank B), os botões Rec ligam/desligam os 5 Plugins do After Effects!
      const plugins = ['pixel_sorter', 'pixel_stretch', 'modulation', 'bad_tv', 'rxxr'];
      if (channelIdx < plugins.length) {
        const pId = plugins[channelIdx];
        const isCurrent = window.appState && window.appState.fx && window.appState.fx[pId] && window.appState.fx[pId].enabled;
        const nextState = !isCurrent;
        if (typeof window.toggleFxModuleEnabled === 'function') {
          window.toggleFxModuleEnabled(pId, nextState);
        }
        this.twinState.buttons.rec[channelIdx] = nextState;
        this.flashToastHud(`FX ${pId.toUpperCase()}: ${nextState ? 'ON' : 'OFF'}`);
        return;
      }
    }

    // Comportamento Geral: Pulso Momentâneo / Strobe Suave na Camada
    if (channelIdx <= 4) {
      this.triggerSoftPulseLayer(channelIdx);
    } else if (channelIdx === 5) {
      this.actionFastForward(); // Take / Advance
    } else if (channelIdx === 6) {
      this.actionRewind();      // Downbeat
    } else if (channelIdx === 7) {
      this.actionPlay();        // Auto Take
    }

    this.twinState.buttons.rec[channelIdx] = true;
    setTimeout(() => {
      this.twinState.buttons.rec[channelIdx] = false;
      this.notifyUI();
    }, 200);
  }

  handleButtonSelect(channelIdx) {
    if (channelIdx < 0 || channelIdx > 7) return;

    // Foca na camada e atualiza o Studio Inspector
    if (channelIdx <= 4) {
      const targetLayer = channelIdx === 4 ? 5 : channelIdx;
      this.activeFocusLayer = targetLayer;
      this.twinState.buttons.sel.fill(false);
      this.twinState.buttons.sel[channelIdx] = true;
      this.flashToastHud(`INSPECTOR: FOCO CAMADA L${targetLayer}`);
      this.activeTelemetry.lastAction = `Foco Camada L${targetLayer}`;
      if (typeof window.openStudioInspector === 'function') {
        window.openStudioInspector('layer', targetLayer);
      }
      this.sendLedFeedbackAll();
      this.notifyUI();
    } else if (channelIdx === 5) {
      this.setBank(1);
    } else if (channelIdx === 6) {
      this.setBank(2);
    } else if (channelIdx === 7) {
      this.toggleBank();
    }
  }

  // =========================================================================
  // 8. TRANSPORTE & NAVEGAÇÃO DE BANCOS (DUAL-BANK HARDWARE & SOFTWARE)
  // =========================================================================
  setBank(bankNum) {
    if (bankNum < 1 || bankNum > 3) return;
    this.activeBank = bankNum;
    this.hardwareBank = (bankNum === 2) ? 'bank2' : (bankNum === 3 ? 'bank3' : 'bank1');
    try {
      localStorage.setItem('penumbra_midi_hw_bank', this.hardwareBank);
      localStorage.setItem('penumbra_midi_active_bank', String(this.activeBank));
    } catch (e) {}
    this.resetTakeoverForBankChange();
    const bLetter = bankNum === 1 ? 'A' : (bankNum === 2 ? 'B' : 'C');
    this.flashToastHud(`BANCO MIDI ${bLetter}: ${this.bankNames[bankNum]}`);
    console.log(`[PENUMBRA MIDI] Banco comutado para: ${bankNum} (${this.bankNames[bankNum]})`);
    this.sendLedFeedbackAll();
    this.notifyUI();
  }

  nextBank() {
    this.setBank((this.activeBank % 3) + 1);
  }

  prevBank() {
    this.setBank(this.activeBank === 1 ? 3 : this.activeBank - 1);
  }

  toggleBank() {
    this.nextBank();
  }

  actionRewind() {
    if (typeof window.resetMusicalPhrase === 'function') {
      window.resetMusicalPhrase();
      this.flashToastHud('REINICIAR BAR 1.1.1 (DOWNBEAT)');
    }
  }

  actionFastForward() {
    if (typeof window.advanceSmartQueue === 'function') {
      window.advanceSmartQueue();
      this.flashToastHud('AVANÇAR FILA DE VÍDEO (TAKE)');
    }
  }

  actionStop() {
    // Pausa ou Freeze Frame
    if (window.appState) {
      window.appState.playback_freeze = !window.appState.playback_freeze;
      this.flashToastHud(`FREEZE FRAME: ${window.appState.playback_freeze ? 'ATIVO' : 'DESATIVADO'}`);
    }
  }

  actionPlay() {
    // Dispara transição suave (Auto Take)
    if (typeof window.startAutoTransition === 'function') {
      window.startAutoTransition();
      this.flashToastHud('TRANSIÇÃO SUAVE (AUTO TAKE)');
    }
  }

  actionLoop() {
    if (typeof window.toggleDockViewMode === 'function') {
      window.toggleDockViewMode();
      this.flashToastHud('ALTERNAR DOCK / TIMELINE');
    }
  }

  actionTapTempo() {
    if (typeof window.tapTempo === 'function') {
      window.tapTempo();
    } else {
      this.flashToastHud('TAP TEMPO SINC');
    }
  }

  actionBlackout() {
    const btn = document.getElementById('btn-blackout');
    if (btn) {
      btn.click();
      this.flashToastHud('MASTER BLACKOUT');
    }
  }

  // =========================================================================
  // 9. FEEDBACK BI-DIRECIONAL DE LEDS (MIDI OUT)
  // =========================================================================
  sendLedFeedback(type, index, isActive) {
    if (!this.activeOutput) return;

    try {
      const velocity = isActive ? 127 : 0;
      let noteNum = 0;
      let ccNum = 0;

      if (type === 'rec') {
        noteNum = 0 + index;
        ccNum = 48 + index;
      } else if (type === 'solo') {
        noteNum = 8 + index;
        ccNum = 40 + index;
      } else if (type === 'mute') {
        noteNum = 16 + index;
        ccNum = 32 + index;
      } else if (type === 'sel') {
        noteNum = 24 + index;
        ccNum = 56 + index;
      }

      // Envia via Note On (Mackie MCU: 0x90) e via CC (CC Mode: 0xB0)
      this.activeOutput.send([0x90, noteNum, velocity]);
      this.activeOutput.send([0xB0, ccNum, velocity]);
    } catch (e) {
      // Silencioso se dispositivo não aceitar
    }
  }

  sendLedFeedbackAll() {
    if (!this.activeOutput) return;
    for (let i = 0; i < 8; i++) {
      this.sendLedFeedback('mute', i, this.twinState.buttons.mute[i]);
      this.sendLedFeedback('solo', i, this.twinState.buttons.solo[i]);
      this.sendLedFeedback('rec', i, this.twinState.buttons.rec[i]);
      this.sendLedFeedback('sel', i, this.twinState.buttons.sel[i]);
    }
  }

  // =========================================================================
  // 10. INTEGRAÇÃO CIRÚRGICA COM OS MÓDULOS DO PENUMBRA
  // =========================================================================
  setLayerOpacityDirect(layerKey, valPercent) {
    const layerIdx = layerKey.replace('layer', 'l');
    const el = document.getElementById(`${layerIdx}-opacity`);
    if (el) {
      el.value = valPercent;
      const lbl = document.getElementById(`lbl-${layerIdx}-opacity`);
      if (lbl) lbl.textContent = `${Math.round(valPercent)}%`;
      el.dispatchEvent(new Event('input'));
    }
    if (window.appState && window.appState.layers && window.appState.layers[layerKey]) {
      window.appState.layers[layerKey].opacity = valPercent / 100.0;
    }
  }

  setLayerEdgeThreshold(layerIdx, normVal) {
    const threshVal = Math.round(15 + normVal * 75);
    const el = document.getElementById(`fader-edge-thresh`);
    if (el) {
      el.value = threshVal;
      el.dispatchEvent(new Event('input'));
    }
  }

  setLayerSpeedDirect(layerKey, speedVal) {
    if (window.appState && window.appState.layers && window.appState.layers[layerKey]) {
      window.appState.layers[layerKey].playbackRate = speedVal;
      this.flashToastHud(`L${layerKey.slice(-1)} VELOCIDADE: ${speedVal.toFixed(2)}x`);
    }
  }

  setLayerScale(layerKey, scaleVal) {
    if (window.appState && window.appState.layers && window.appState.layers[layerKey]) {
      window.appState.layers[layerKey].scale = scaleVal;
    }
  }

  cycleLayerRotationByKnob(layerKey, normVal) {
    const rots = [0, -90, 90, 180];
    const idx = Math.min(3, Math.floor(normVal * 4));
    if (typeof window.setLayerRotation === 'function') {
      window.setLayerRotation(layerKey, rots[idx]);
    }
  }

  setLayerHueTint(layerKey, normVal) {
    if (window.appState && window.appState.layers && window.appState.layers[layerKey]) {
      window.appState.layers[layerKey].hue = Math.round(normVal * 360);
    }
  }

  setLayerMatteThreshold(layerKey, normVal) {
    if (window.appState && window.appState.layers && window.appState.layers[layerKey]) {
      window.appState.layers[layerKey].matte_threshold = normVal;
    }
  }

  cycleLayerBlendByKnob(layerKey, normVal) {
    const modes = ['Normal', 'Multiply', 'Screen', 'Darken', 'Overlay', 'Difference'];
    const idx = Math.min(modes.length - 1, Math.floor(normVal * modes.length));
    const mode = modes[idx];
    if (typeof window.onLayerBlendChange === 'function') {
      window.onLayerBlendChange(layerKey, mode);
    }
  }

  setLayerProceduralCrop(layerKey, edgeIdx, normVal) {
    // 0=Top, 1=Bottom, 2=Left, 3=Right
    if (window.appState && window.appState.layers && window.appState.layers[layerKey]) {
      const crops = window.appState.layers[layerKey].crops || [0, 0, 0, 0];
      crops[edgeIdx] = normVal * 0.45; // até 45% de crop
      window.appState.layers[layerKey].crops = crops;
    }
  }

  setAudioBandSensitivity(bandIdx, normVal) {
    const bands = ['sub', 'bass', 'lomid', 'air'];
    const b = bands[bandIdx];
    if (window.appState && window.appState.audio_sensitivities) {
      window.appState.audio_sensitivities[b] = normVal * 2.0;
    }
  }

  setPlaybackSpeedGlobal(speed) {
    ['layer0', 'layer1', 'layer2', 'layer3', 'layer4'].forEach(lk => {
      if (window.appState && window.appState.layers && window.appState.layers[lk]) {
        window.appState.layers[lk].playbackRate = speed;
      }
    });
  }

  setMasterBrightnessDimmer(normVal) {
    if (window.appState) {
      window.appState.master_dimmer = normVal;
    }
  }

  soloLayer(layerIdx) {
    // Verifica se já está em solo nessa camada para fazer toggle
    let isCurrentlyOnlyThisActive = true;
    for (let i = 0; i <= 5; i++) {
      const targetKey = `layer${i}`;
      if (window.appState && window.appState.layers && window.appState.layers[targetKey]) {
        if (i === layerIdx && !window.appState.layers[targetKey].active) isCurrentlyOnlyThisActive = false;
        if (i !== layerIdx && window.appState.layers[targetKey].active) isCurrentlyOnlyThisActive = false;
      }
    }

    if (isCurrentlyOnlyThisActive) {
      // Toggle OFF: desfaz o solo e reativa todas as camadas
      this.unsoloAll();
      return;
    }

    for (let i = 0; i <= 5; i++) {
      const targetKey = `layer${i}`;
      const shouldActive = (i === layerIdx);
      if (window.appState && window.appState.layers && window.appState.layers[targetKey]) {
        window.appState.layers[targetKey].active = shouldActive;
      }
      if (this.twinState.buttons.solo && i < this.twinState.buttons.solo.length) {
        this.twinState.buttons.solo[i] = shouldActive;
      }
      this.sendLedFeedback('solo', i, shouldActive);
    }
    this.flashToastHud(`SOLO ATIVADO: CAMADA L${layerIdx}`);
    if (typeof window.renderStudioInspector === 'function') window.renderStudioInspector();
  }

  unsoloAll() {
    for (let i = 0; i <= 5; i++) {
      const targetKey = `layer${i}`;
      if (window.appState && window.appState.layers && window.appState.layers[targetKey]) {
        window.appState.layers[targetKey].active = true;
      }
      if (this.twinState.buttons.solo && i < this.twinState.buttons.solo.length) {
        this.twinState.buttons.solo[i] = false;
      }
      this.sendLedFeedback('solo', i, false);
    }
    this.flashToastHud('TODAS AS CAMADAS REATIVADAS (UNSOLO ALL)');
    if (typeof window.renderStudioInspector === 'function') window.renderStudioInspector();
  }

  cycleMatteByKnob(normVal) {
    const list = (typeof allMattes !== 'undefined' && allMattes) || window.allMattes || [];
    if (!list.length) return;
    const idx = Math.min(list.length - 1, Math.floor(normVal * list.length));
    const m = list[idx];
    if (m && window.appState) {
      const targetLayer = this.activeFocusLayer !== undefined ? `layer${this.activeFocusLayer}` : 'layer3';
      if (window.appState.layers && window.appState.layers[targetLayer]) {
        window.appState.layers[targetLayer].matte = m.path || m.filename;
      }
      this.flashToastHud(`MÁSCARA ${targetLayer.toUpperCase()}: ${m.name || m.filename}`);
      if (typeof window.renderStudioInspector === 'function') window.renderStudioInspector();
    }
  }

  setFxParam(pluginId, paramName, value) {
    if (window.appState && window.appState.fx && window.appState.fx[pluginId]) {
      window.appState.fx[pluginId][paramName] = value;
    }
  }

  triggerSoftPulseLayer(layerIdx) {
    const layerKey = `layer${layerIdx}`;
    const el = document.getElementById(`l${layerIdx}-opacity`);
    if (!el) return;
    const original = Number(el.value);
    const boosted = Math.min(100, original + 30);
    this.setLayerOpacityDirect(layerKey, boosted);
    setTimeout(() => {
      this.setLayerOpacityDirect(layerKey, original);
    }, 180);
  }

  setFxPluginIntensityByIndex(idx, normVal) {
    const plugins = ['pixel_sorter', 'pixel_stretch', 'modulation', 'bad_tv', 'rxxr'];
    if (idx < plugins.length) {
      const pId = plugins[idx];
      if (window.appState && window.appState.fx && window.appState.fx[pId]) {
        window.appState.fx[pId].intensity = normVal;
      }
    }
  }

  updateFaderElement(elementId, normValue, min, max) {
    const el = document.getElementById(elementId);
    if (el) {
      const val = min + (normValue * (max - min));
      el.value = Math.round(val);
      el.dispatchEvent(new Event('input'));
    }
  }

  flashToastHud(message) {
    const toast = document.getElementById('hud-macro-toast');
    if (toast) {
      toast.textContent = `[MIDI] ${message}`;
      toast.classList.add('visible');
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => {
        toast.classList.remove('visible');
      }, 1600);
    }
  }

  // =========================================================================
  // 11. SISTEMA MIDI LEARN EM TEMPO REAL COM PERSISTÊNCIA
  // =========================================================================
  startMidiLearn(targetSpec) {
    this.isLearning = true;
    this.learnTarget = targetSpec;
    this.flashToastHud(`MODO LEARN: MOVA O CONTROLE FÍSICO PARA VINCULAR A ${targetSpec.name.toUpperCase()}`);
    this.notifyUI();
  }

  cancelMidiLearn() {
    this.isLearning = false;
    this.learnTarget = null;
    this.notifyUI();
  }

  commitMidiLearn(command, data1, channel) {
    if (!this.learnTarget) return;

    const key = command === 0xB ? `CC_${channel}_${data1}` : `NOTE_${channel}_${data1}`;
    this.customMappings[key] = {
      action: this.learnTarget.action,
      bank: this.learnTarget.bank,
      index: this.learnTarget.index,
      name: this.learnTarget.name
    };

    this.saveCustomMappings();
    this.flashToastHud(`MAPEADO COM SUCESSO! ${key} ➔ ${this.learnTarget.name}`);
    console.log(`[PENUMBRA MIDI] Mapeamento gravado: ${key} ->`, this.customMappings[key]);
    
    this.isLearning = false;
    this.learnTarget = null;
    this.notifyUI();
  }

  executeDirectTarget(target, normVal, rawVal, opts = {}) {
    let val = normVal;
    if (opts.invert) val = 1.0 - val;
    if (opts.curve === 'exp') val = Math.pow(val, 2);
    else if (opts.curve === 'log') val = Math.sqrt(val);
    else if (opts.curve === 'scurve') val = val * val * (3 - 2 * val);

    if (target.startsWith('l') && target.includes('_opacity')) {
      const idx = target.split('_')[0].replace('l', '');
      this.setLayerOpacityDirect(`layer${idx}`, val * 100);
    } else if (target.startsWith('l') && target.includes('_scale')) {
      const idx = target.split('_')[0].replace('l', '');
      if (window.setLayerScale) window.setLayerScale(`layer${idx}`, 0.2 + val * 2.8);
    } else if (target.startsWith('l') && target.includes('_pos_x')) {
      const idx = target.split('_')[0].replace('l', '');
      if (window.setLayerPosition) window.setLayerPosition(`layer${idx}`, Math.round((val - 0.5) * 400), undefined);
    } else if (target.startsWith('l') && target.includes('_pos_y')) {
      const idx = target.split('_')[0].replace('l', '');
      if (window.setLayerPosition) window.setLayerPosition(`layer${idx}`, undefined, Math.round((val - 0.5) * 400));
    } else if (target === 'cue_clip_scale') {
      const cueClipId = window.appState?.preview_clip || window.appState?.layers?.layer3?.clipId;
      if (cueClipId && window.setClipTransform) window.setClipTransform(cueClipId, { scale: 0.2 + val * 2.8 });
    } else if (target === 'cue_clip_rot') {
      const cueClipId = window.appState?.preview_clip || window.appState?.layers?.layer3?.clipId;
      const rots = [0, 90, 180, 270];
      const rot = rots[Math.min(3, Math.floor(val * 4))];
      if (cueClipId && window.setClipTransform) window.setClipTransform(cueClipId, { rotation: rot });
    } else if (target === 'crossfader') {
      const el = document.getElementById('crossfader');
      if (el) {
        el.value = (val * 100).toFixed(1);
        el.dispatchEvent(new Event('input'));
      }
    } else if (target === 'auto_take' && (rawVal === undefined || rawVal > 64)) {
      const btn = document.getElementById('btn-auto-take');
      if (btn) btn.click();
    } else if (target === 'cut' && (rawVal === undefined || rawVal > 64)) {
      const btn = document.getElementById('btn-cut-instant');
      if (btn) btn.click();
    } else if (target === 'blackout' && (rawVal === undefined || rawVal > 64)) {
      const btn = document.getElementById('btn-blackout');
      if (btn) btn.click();
    } else if (target === 'master_locked_matte' && (rawVal === undefined || rawVal > 64)) {
      if (window.toggleMasterLockedMatte) window.toggleMasterLockedMatte();
    } else if (target === 'gamma') {
      const el = document.getElementById('fader-gamma');
      if (el) { el.value = Math.round(40 + val * 120); el.dispatchEvent(new Event('input')); }
    } else if (target === 'contrast') {
      const el = document.getElementById('fader-contrast');
      if (el) { el.value = Math.round(80 + val * 80); el.dispatchEvent(new Event('input')); }
    } else if (target === 'edge_mix') {
      const el = document.getElementById('fader-edge-mix');
      if (el) { el.value = Math.round(val * 40); el.dispatchEvent(new Event('input')); }
    } else if (target.startsWith('macro_state_') && (rawVal === undefined || rawVal > 64)) {
      const st = target.replace('macro_state_', '').toUpperCase();
      if (window.setMacroState) window.setMacroState(st);
    }
  }

  executeMappedAction(mapping, normValue, rawValue) {
    if (mapping.target) {
      this.executeDirectTarget(mapping.target, normValue, rawValue, mapping);
      return;
    }
    if (mapping.action === 'fader') {
      this.handleFaderInput(mapping.index, normValue);
    } else if (mapping.action === 'knob') {
      this.handleKnobInput(mapping.index, rawValue, normValue);
    } else if (mapping.action === 'mute') {
      this.handleButtonMute(mapping.index);
    } else if (mapping.action === 'solo') {
      this.handleButtonSolo(mapping.index);
    } else if (mapping.action === 'rec') {
      this.handleButtonRec(mapping.index);
    } else if (mapping.action === 'sel') {
      this.handleButtonSelect(mapping.index);
    }
  }

  loadCustomMappings() {
    try {
      const raw = localStorage.getItem('penumbra_midi_custom_map');
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  saveCustomMappings() {
    try {
      localStorage.setItem('penumbra_midi_custom_map', JSON.stringify(this.customMappings));
    } catch (e) {}
  }

  resetMappingsToDefault() {
    this.customMappings = {};
    try {
      localStorage.removeItem('penumbra_midi_custom_map');
    } catch (e) {}
    this.flashToastHud('MAPEAMENTOS RESTAURADOS PARA O PADRÃO M-VAVE');
    this.notifyUI();
  }

  setProfile(profileKey) {
    this.activeProfile = profileKey;
    if (profileKey === 'mvave_bank1') {
      this.hardwareBank = 'bank1';
    } else if (profileKey === 'mvave_bank2') {
      this.hardwareBank = 'bank2';
    }
    try {
      localStorage.setItem('penumbra_midi_profile', profileKey);
    } catch (e) {}
    const sel = document.getElementById('sel-midi-profile');
    if (sel && sel.value !== profileKey) {
      sel.value = profileKey;
    }
    this.flashToastHud(`PERFIL MIDI: ${profileKey.toUpperCase()}`);
    console.log(`[PENUMBRA MIDI] Perfil alterado para: ${profileKey}`);
    this.notifyUI();
  }

  setHardwareBank(bankKey) {
    this.hardwareBank = (bankKey === 'bank2') ? 'bank2' : 'bank1';
    try {
      localStorage.setItem('penumbra_midi_hw_bank', this.hardwareBank);
    } catch (e) {}
    const label = this.hardwareBank === 'bank1' ? 'BANCO 1 (◄ FADERS & KNOBS)' : 'BANCO 2 (► MATRIZ DE BOTÕES)';
    this.flashToastHud(`M-VAVE: ${label}`);
    console.log(`[PENUMBRA MIDI] Hardware Bank comutado para: ${this.hardwareBank}`);
    this.notifyUI();
  }

  toggleHardwareBank() {
    this.setHardwareBank(this.hardwareBank === 'bank1' ? 'bank2' : 'bank1');
  }

  autoCalibrateMvave() {
    this.customMappings = {};
    try {
      localStorage.removeItem('penumbra_midi_custom_map');
      localStorage.setItem('penumbra_midi_profile', 'mvave_smc');
    } catch (e) {}
    this.setProfile('mvave_smc');
    this.takeoverMode = 'scaling';
    const selTakeover = document.getElementById('sel-soft-takeover');
    if (selTakeover) selTakeover.value = 'scaling';
    this.flashToastHud('M-VAVE SMC-MIXER: AUTO-CALIBRAÇÃO APLICADA!');
    console.log('[PENUMBRA MIDI] Auto-calibração M-Vave executada.');
    this.notifyUI();
  }

  // =========================================================================
  // 12. TELEMETRIA & MONITOR TICKER
  // =========================================================================
  startRateTicker() {
    setInterval(() => {
      this.activeTelemetry.msgRate = this.messageCount;
      this.messageCount = 0;
      this.updateHeaderChip();
    }, 1000);
  }

  updateHeaderChip() {
    const chip = document.getElementById('chip-midi');
    if (!chip) return;

    const dot = document.getElementById('midi-status-dot');
    const label = document.getElementById('chip-midi-label');
    const bankBadge = document.getElementById('chip-midi-bank');

    if (this.activeTelemetry.connected) {
      if (dot) {
        dot.className = 'dot live';
        dot.style.background = '#00ff88';
      }
      if (label) {
        label.textContent = `MIDI: ${this.activeTelemetry.deviceName.slice(0, 14)}`;
      }
    } else {
      if (dot) {
        dot.className = 'dot';
        dot.style.background = '#777';
      }
      if (label) {
        label.textContent = 'MIDI: OFF';
      }
    }

    if (bankBadge) {
      bankBadge.textContent = this.activeBank === 1 ? 'BANK A' : (this.activeBank === 2 ? 'BANK B' : 'BANK C (3D)');
      bankBadge.title = `Banco MIDI Ativo: ${this.bankNames[this.activeBank]} · Clique para alternar [Atalho: [ ou ]]`;
    }

    const hwBadge = document.getElementById('chip-midi-hw-bank');
    if (hwBadge) {
      const isBank1 = (this.hardwareBank === 'bank1');
      hwBadge.textContent = isBank1 ? '◄ HW1: FADERS' : '► HW2: BOTÕES';
      hwBadge.className = `midi-hw-bank-badge ${isBank1 ? 'hw1' : 'hw2'}`;
      hwBadge.title = `Modo Hardware M-Vave: ${isBank1 ? 'Banco 1 (Seta Esquerda ◄ - Faders/Knobs Diretos)' : 'Banco 2 (Seta Direita ► - Matriz 32 Botões M/S/R/SEL)'} · Clique para alternar [Atalho: Tecla H]`;
    }
  }

  // =========================================================================
  // 13. ATALHOS DE TECLADO COMPLETOS & OPERAÇÃO POR MOUSE
  // =========================================================================
  bindKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
        return;
      }

      // Alternar Bancos de Hardware: [ e ]
      if (e.key === '[') {
        e.preventDefault();
        this.prevBank();
        return;
      }
      if (e.key === ']') {
        e.preventDefault();
        this.nextBank();
        return;
      }

      // Teclas F1 e F2: Ir direto para Bank A (1) ou Bank B (2)
      if (e.key === 'F1') { e.preventDefault(); this.setBank(1); return; }
      if (e.key === 'F2') { e.preventDefault(); this.setBank(2); return; }

      // Tecla I: Alternar Studio Inspector
      if ((e.key === 'i' || e.key === 'I') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (typeof window.toggleStudioInspector === 'function') {
          window.toggleStudioInspector();
        }
        return;
      }

      // Tecla H: Alternar Banco A / Banco B
      if ((e.key === 'h' || e.key === 'H') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        this.toggleBank();
        return;
      }

      // Shift + 1 a 5: Focar na Camada correspondente (Layer Focus)
      if (e.shiftKey && e.key >= '1' && e.key <= '5') {
        e.preventDefault();
        const ch = parseInt(e.key, 10) - 1;
        this.handleButtonSelect(ch);
        return;
      }

      // Alt + 1 a 5: Mute na Camada correspondente
      if (e.altKey && e.key >= '1' && e.key <= '5') {
        e.preventDefault();
        const ch = parseInt(e.key, 10) - 1;
        this.handleButtonMute(ch);
        return;
      }
    });
  }

  // Sincroniza o hardware virtual com os valores atuais da aplicação
  syncTwinWithApplicationState() {
    for (let i = 0; i <= 4; i++) {
      const el = document.getElementById(`l${i}-opacity`);
      if (el) {
        this.twinState.faders[i] = Number(el.value) / 100.0;
      }
    }
  }

  // Registra listener de UI para o painel de configurações e hardware twin
  subscribeUI(callback) {
    this.uiListeners.add(callback);
  }

  unsubscribeUI(callback) {
    this.uiListeners.delete(callback);
  }

  notifyUI() {
    this.updateHeaderChip();
    this.uiListeners.forEach(cb => {
      try { cb(this); } catch (e) {}
    });
  }
}

// ============================================================================
// HARDWARE TWIN UI & INTERACTIVE VIRTUAL CONTROLLER
// ============================================================================
class HardwareTwinUI {
  constructor(hub) {
    this.hub = hub;
    this.isDraggingFader = false;
    this.isDraggingKnob = false;

    // Rótulos Dinâmicos dos Knobs e Faders por Banco (Dual-Bank A / B)
    this.labels = {
      knobs: {
        1: ['BLACKS', 'CONTRAST', 'GAMMA', 'FIND LUM', 'MATTE SEL', 'MATTE ZOOM', 'MATTE INV', 'MATTE MIX'],
        2: ['SORT THRESH', 'STR LENGTH', 'MOD FREQ', 'TV WARP', 'RXXR DENS', 'EDGE THRESH', 'FIND LUM', 'AUDIO GAIN']
      },
      faders: {
        1: ['L0 BASE', 'L1 DOUBLE', 'L2 EDGES', 'L3 CUE', 'L5 OVERLAY', 'DIMMER', 'SPEED', 'CROSSFADER'],
        2: ['PX SORTER', 'PX STRETCH', 'MODULATION', 'BAD TV', 'RXXR', 'MASTER FX', 'EDGE MIX', 'BLACKOUT']
      }
    };

    this.init();
  }

  init() {
    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', () => this.setup());
    } else {
      this.setup();
    }
  }

  setup() {
    this.renderChannels();
    this.hub.subscribeUI(() => this.updateView());
    this.updateView();
    this.renderMappingsTable();
  }

  renderChannels() {
    const container = document.getElementById('hw-channels-strip-group');
    if (!container) return;

    let html = '';
    for (let i = 0; i < 8; i++) {
      html += `
        <div class="hw-ch-strip" id="hw-strip-${i}">
          <span class="hw-ch-strip-num">CH ${i + 1}</span>

          <!-- Knob Rotativo -->
          <div class="hw-knob-wrapper" id="hw-knob-wrap-${i}" onmousedown="handleHwKnobDrag(${i}, event)" onwheel="handleHwKnobWheel(${i}, event)">
            <div class="hw-knob-dial" id="hw-knob-dial-${i}">
              <div class="hw-knob-pointer" id="hw-knob-ptr-${i}"></div>
            </div>
            <span class="hw-knob-label" id="hw-knob-lbl-${i}">KNOB</span>
          </div>

          <!-- Matriz de Botões M, S, R, Sel -->
          <div class="hw-btn-group">
            <button class="hw-btn hw-btn-mute" id="hw-btn-mute-${i}" onclick="handleHwButtonClick('mute', ${i})" title="Mute da Camada (Alt + ${i + 1})">M</button>
            <button class="hw-btn hw-btn-solo" id="hw-btn-solo-${i}" onclick="handleHwButtonClick('solo', ${i})" title="Solo da Camada (Clique novamente para Unsolo)">S</button>
            <button class="hw-btn hw-btn-rec" id="hw-btn-rec-${i}" onclick="handleHwButtonClick('rec', ${i})" title="Trigger / Macro">R</button>
            <button class="hw-btn hw-btn-sel" id="hw-btn-sel-${i}" onclick="handleHwButtonClick('sel', ${i})" title="Focar Camada no Inspector (Shift + ${i + 1})">SEL</button>
          </div>

          <!-- Fader Linear Tátil -->
          <div class="hw-fader-slot">
            <div class="hw-takeover-indicator" id="hw-takeover-${i}">·</div>
            <div class="hw-fader-track" id="hw-fader-track-${i}" onmousedown="handleHwFaderDrag(${i}, event)">
              <div class="hw-fader-cap" id="hw-fader-cap-${i}" style="bottom: 0%;"></div>
            </div>
            <span class="hw-fader-label" id="hw-fader-lbl-${i}">FADER</span>
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
  }

  updateView() {
    const bank = this.hub.activeBank;
    const focusLayer = this.hub.activeFocusLayer;

    // Atualiza Badges e Seletor de Bancos
    const bankBadge = document.getElementById('midi-active-bank-badge');
    if (bankBadge) bankBadge.textContent = `BANCO ${bank === 1 ? 'A' : (bank === 2 ? 'B' : 'C')}: ${this.hub.bankNames[bank] || ''}`;

    for (let b = 1; b <= 4; b++) {
      const card = document.getElementById(`btn-bank-${b}`);
      if (card) card.classList.toggle('active', b === bank);
    }

    // Foco de Camada
    const focusRow = document.getElementById('midi-focus-layer-row');
    if (focusRow) {
      for (let l = 0; l <= 5; l++) {
        const btn = document.getElementById(`btn-focus-l${l}`);
        if (btn) btn.classList.toggle('active', l === focusLayer);
      }
    }

    // Atualiza OLED
    const oled1 = document.getElementById('oled-line-1');
    const oled2 = document.getElementById('oled-line-2');
    if (oled1) {
      const hwTxt = (this.hub.hardwareBank === 'bank1') ? 'HW: ◄ BANK A (MIX & TAKES)' : 'HW: ► BANK B (FX & MATTES)';
      oled1.textContent = `${hwTxt} · SW ${bank === 1 ? 'A' : 'B'}: ${this.hub.bankNames[bank] || ''} · ${this.hub.activeTelemetry.deviceName.slice(0, 14)}`;
    }
    if (oled2) {
      const bpm = (window.appState && window.appState.bpm) ? Math.round(window.appState.bpm) : 120;
      oled2.textContent = `${this.hub.activeTelemetry.lastAction} · SOFT TAKEOVER: ${this.hub.takeoverMode.toUpperCase()} · ${bpm} BPM`;
    }

    // Atualiza Status do Header de Preferências
    const devBadge = document.getElementById('midi-prop-device-badge');
    const rateBadge = document.getElementById('midi-prop-rate-badge');
    const protoBadge = document.getElementById('midi-prop-protocol-badge');
    if (devBadge) {
      devBadge.textContent = this.hub.activeTelemetry.connected ? this.hub.activeTelemetry.deviceName : 'DESCONECTADO';
      devBadge.className = this.hub.activeTelemetry.connected ? 'cfg-badge text-emerald' : 'cfg-badge text-dim';
    }
    if (rateBadge) {
      rateBadge.textContent = `${this.hub.activeTelemetry.msgRate} HZ`;
    }
    if (protoBadge) {
      protoBadge.textContent = this.hub.detectedProtocol || 'AGUARDANDO SINAL...';
      protoBadge.className = this.hub.detectedProtocol ? 'cfg-badge text-cyan' : 'cfg-badge text-dim';
    }

    // Atualiza os 8 Canais
    for (let i = 0; i < 8; i++) {
      const strip = document.getElementById(`hw-strip-${i}`);
      if (strip) {
        strip.classList.toggle('focused', i === focusLayer);
      }

      // Rótulos Dinâmicos
      const knobLbl = document.getElementById(`hw-knob-lbl-${i}`);
      const knobBankLabels = this.labels.knobs[bank] || this.labels.knobs[1];
      if (knobLbl && knobBankLabels) knobLbl.textContent = knobBankLabels[i] || `KNOB ${i+1}`;

      const faderLbl = document.getElementById(`hw-fader-lbl-${i}`);
      const faderBankLabels = this.labels.faders[bank] || this.labels.faders[1];
      if (faderLbl && faderBankLabels) faderLbl.textContent = faderBankLabels[i] || `FADER ${i+1}`;

      // Knobs: Rotação (-135° a +135°)
      const knobVal = this.hub.twinState.knobs[i] || 0;
      const angle = -135 + (knobVal * 270);
      const ptr = document.getElementById(`hw-knob-ptr-${i}`);
      if (ptr) ptr.style.transform = `translateX(-50%) rotate(${angle}deg)`;

      // Faders: Posição vertical
      const faderVal = this.hub.twinState.faders[i] || 0;
      const cap = document.getElementById(`hw-fader-cap-${i}`);
      if (cap) cap.style.bottom = `${faderVal * 100}%`;

      // Soft Takeover Indicator
      const toState = this.hub.takeoverStates[`b${bank}_fader_${i}`];
      const toInd = document.getElementById(`hw-takeover-${i}`);
      if (toInd) {
        if (!toState || toState.direction === 'CAUGHT') {
          toInd.textContent = '●';
          toInd.className = 'hw-takeover-indicator caught';
        } else if (toState.direction === 'UP') {
          toInd.textContent = '▲';
          toInd.className = 'hw-takeover-indicator up';
        } else {
          toInd.textContent = '▼';
          toInd.className = 'hw-takeover-indicator down';
        }
      }

      // Botões: Estado Active
      const bMute = document.getElementById(`hw-btn-mute-${i}`);
      if (bMute) bMute.classList.toggle('active', !!this.hub.twinState.buttons.mute[i]);

      const bSolo = document.getElementById(`hw-btn-solo-${i}`);
      if (bSolo) bSolo.classList.toggle('active', !!this.hub.twinState.buttons.solo[i]);

      const bRec = document.getElementById(`hw-btn-rec-${i}`);
      if (bRec) bRec.classList.toggle('active', !!this.hub.twinState.buttons.rec[i]);

      const bSel = document.getElementById(`hw-btn-sel-${i}`);
      if (bSel) bSel.classList.toggle('active', !!this.hub.twinState.buttons.sel[i]);
    }

    // Master Fader
    const mCap = document.getElementById('hw-master-fader-cap');
    const xfader = document.getElementById('crossfader');
    if (mCap && xfader) {
      const val = Number(xfader.value) / 100.0;
      mCap.style.bottom = `${val * 100}%`;
    }

    // Monitor Terminal
    this.updateMonitorTerminal();
  }

  updateMonitorTerminal() {
    const term = document.getElementById('midi-monitor-terminal');
    if (!term) return;

    if (this.hub.recentMessages.length === 0) {
      term.innerHTML = '<div class="mon-empty-hint">Aguardando eventos do controlador físico...</div>';
      return;
    }

    let rows = '';
    this.hub.recentMessages.slice(0, 12).forEach(m => {
      rows += `
        <div class="mon-row">
          <span class="mon-ts">[${m.timestamp}]</span>
          <span class="mon-cmd">${m.cmdName} (Ch ${m.channel})</span>
          <span class="mon-raw">Data: ${m.data1} -> Val: ${m.data2} (${m.statusHex})</span>
        </div>
      `;
    });
    term.innerHTML = rows;
  }

  renderMappingsTable() {
    const wrapper = document.getElementById('midi-mappings-table-wrapper');
    if (!wrapper) return;

    const maps = this.hub.customMappings;
    const keys = Object.keys(maps);

    if (keys.length === 0) {
      wrapper.innerHTML = '<div style="color: #6a7182; font-size: 8.5px; padding: 6px; font-family: var(--font-mono);">Nenhum mapeamento customizado ativo (Operando no Perfil Padrão M-Vave).</div>';
      return;
    }

    let html = '';
    keys.forEach(k => {
      const item = maps[k];
      html += `
        <div class="midi-map-row">
          <span style="color:#00f0ff; font-weight:700;">${k}</span>
          <span style="color:#fff;">${item.name}</span>
          <span style="color:#7f8698;">Ação: ${item.action} [${item.index}]</span>
          <button class="mid-btn mid-btn-ghost" style="padding:2px 6px; font-size:7.5px;" onclick="removeMidiMapping('${k}')">REMOVER</button>
        </div>
      `;
    });
    wrapper.innerHTML = html;
  }
}

// ============================================================================
// HANDLERS GLOBAIS DE INTERAÇÃO COM O HARDWARE TWIN & MODAL
// ============================================================================

window.handleHwFaderDrag = function(chIdx, e) {
  if (window.hwTwinMode === 'map') {
    openMidiMapModal('fader', chIdx, window.penumbraMidi?.activeBank || 1);
    return;
  }
  const track = document.getElementById(`hw-fader-track-${chIdx}`);
  if (!track || !window.penumbraMidi) return;

  function update(evt) {
    const rect = track.getBoundingClientRect();
    const clientY = evt.clientY !== undefined ? evt.clientY : (evt.touches ? evt.touches[0].clientY : rect.bottom);
    const norm = 1.0 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    window.penumbraMidi.handleFaderInput(chIdx, norm);
    window.penumbraMidi.notifyUI();
  }

  update(e);
  function onMove(evt) { update(evt); }
  function onUp() {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  }
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
};

window.handleHwMasterFaderDrag = function(e) {
  if (window.hwTwinMode === 'map') {
    openMidiMapModal('master_fader', 0, window.penumbraMidi?.activeBank || 1);
    return;
  }
  const track = document.getElementById('hw-master-fader-track');
  if (!track || !window.penumbraMidi) return;

  function update(evt) {
    const rect = track.getBoundingClientRect();
    const clientY = evt.clientY !== undefined ? evt.clientY : (evt.touches ? evt.touches[0].clientY : rect.bottom);
    const norm = 1.0 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    window.penumbraMidi.handleMasterFaderInput(norm);
    window.penumbraMidi.notifyUI();
  }

  update(e);
  function onMove(evt) { update(evt); }
  function onUp() {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  }
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
};

window.handleHwKnobDrag = function(knobIdx, e) {
  if (window.hwTwinMode === 'map') {
    openMidiMapModal('knob', knobIdx, window.penumbraMidi?.activeBank || 1);
    return;
  }
  if (!window.penumbraMidi) return;
  const startY = e.clientY;
  const initialVal = window.penumbraMidi.twinState.knobs[knobIdx] || 0.5;

  function onMove(evt) {
    const deltaY = startY - evt.clientY;
    const norm = Math.max(0, Math.min(1, initialVal + (deltaY / 150.0)));
    window.penumbraMidi.handleKnobInput(knobIdx, Math.round(norm * 127), norm);
    window.penumbraMidi.notifyUI();
  }

  function onUp() {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  }

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
};

window.handleHwKnobWheel = function(knobIdx, e) {
  if (window.hwTwinMode === 'map') return;
  if (!window.penumbraMidi) return;
  e.preventDefault();
  const delta = e.deltaY < 0 ? 0.04 : -0.04;
  const curr = window.penumbraMidi.twinState.knobs[knobIdx] || 0.5;
  const nextVal = Math.max(0, Math.min(1, curr + delta));
  window.penumbraMidi.handleKnobInput(knobIdx, Math.round(nextVal * 127), nextVal);
  window.penumbraMidi.notifyUI();
};

window.handleHwButtonClick = function(type, chIdx) {
  if (window.hwTwinMode === 'map') {
    openMidiMapModal(type, chIdx, window.penumbraMidi?.activeBank || 1);
    return;
  }
  if (!window.penumbraMidi) return;
  if (type === 'mute') window.penumbraMidi.handleButtonMute(chIdx);
  else if (type === 'solo') window.penumbraMidi.handleButtonSolo(chIdx);
  else if (type === 'rec') window.penumbraMidi.handleButtonRec(chIdx);
  else if (type === 'sel') window.penumbraMidi.handleButtonSelect(chIdx);
  window.penumbraMidi.notifyUI();
};

window.onMidiProfileChanged = function(profileKey) {
  if (!window.penumbraMidi) return;
  window.penumbraMidi.setProfile(profileKey);
};

window.autoCalibrateMvave = function() {
  if (!window.penumbraMidi) return;
  window.penumbraMidi.autoCalibrateMvave();
};

window.setMidiTakeoverMode = function(mode) {
  if (window.penumbraMidi) {
    window.penumbraMidi.takeoverMode = mode;
    window.penumbraMidi.flashToastHud(`SOFT TAKEOVER: ${mode.toUpperCase()}`);
    window.penumbraMidi.notifyUI();
  }
};

window.setMidiEncoderSensitivity = function(sens) {
  if (window.penumbraMidi) {
    window.penumbraMidi.activeSensitivity = sens;
    window.penumbraMidi.flashToastHud(`SENSIBILIDADE BALÍSTICA: ${sens.toUpperCase()}`);
  }
};

window.toggleMidiLedFeedback = function(enabled) {
  if (window.penumbraMidi) {
    if (!enabled) {
      // Apaga todos os LEDs
      if (window.penumbraMidi.activeOutput) {
        for (let i = 0; i < 8; i++) {
          window.penumbraMidi.sendLedFeedback('mute', i, false);
          window.penumbraMidi.sendLedFeedback('solo', i, false);
        }
      }
    } else {
      window.penumbraMidi.sendLedFeedbackAll();
    }
  }
};

window.toggleMidiLearnMode = function() {
  if (!window.penumbraMidi) return;
  const btn = document.getElementById('btn-toggle-midi-learn');
  const txt = document.getElementById('txt-midi-learn');
  const hint = document.getElementById('midi-learn-hint');

  if (window.penumbraMidi.isLearning) {
    window.penumbraMidi.cancelMidiLearn();
    if (txt) txt.textContent = '● INICIAR MODO MIDI LEARN';
    if (btn) btn.className = 'btn btn-studio-primary';
    if (hint) hint.textContent = 'Modo MIDI Learn cancelado.';
  } else {
    // Entra em Learn para o próximo controle selecionado
    window.penumbraMidi.startMidiLearn({
      bank: window.penumbraMidi.activeBank,
      action: 'fader',
      index: 0,
      name: `Fader Canal 1 (Banco ${window.penumbraMidi.activeBank})`
    });
    if (txt) txt.textContent = '⏹ CANCELAR LEARN';
    if (btn) btn.className = 'btn btn-danger';
    if (hint) hint.textContent = 'Mova agora o controle físico no hardware para associar!';
  }
};

window.removeMidiMapping = function(key) {
  if (window.penumbraMidi && window.penumbraMidi.customMappings[key]) {
    delete window.penumbraMidi.customMappings[key];
    window.penumbraMidi.saveCustomMappings();
    if (window.penumbraHwTwin) window.penumbraHwTwin.renderMappingsTable();
  }
};

window.exportMidiMappingsJson = function() {
  if (!window.penumbraMidi) return;
  const data = JSON.stringify(window.penumbraMidi.customMappings, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'penumbra_midi_mappings.json';
  a.click();
  URL.revokeObjectURL(url);
};

window.importMidiMappingsJson = function() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result);
        if (window.penumbraMidi) {
          window.penumbraMidi.customMappings = parsed;
          window.penumbraMidi.saveCustomMappings();
          if (window.penumbraHwTwin) window.penumbraHwTwin.renderMappingsTable();
          window.penumbraMidi.flashToastHud('MAPEAMENTOS IMPORTADOS COM SUCESSO');
        }
      } catch (err) {
        alert('Arquivo de mapeamento JSON inválido.');
      }
    };
    reader.readAsText(file);
  };
  input.click();
};

window.clearMidiMonitorLog = function() {
  if (window.penumbraMidi) {
    window.penumbraMidi.recentMessages = [];
    if (window.penumbraHwTwin) window.penumbraHwTwin.updateMonitorTerminal();
  }
};

window.toggleHardwareBank = function() {
  if (window.penumbraMidi) {
    window.penumbraMidi.toggleHardwareBank();
  }
};

window.setHardwareBank = function(bank) {
  if (window.penumbraMidi) {
    window.penumbraMidi.setHardwareBank(bank);
  }
};

// ============================================================================
// 14. CLICK-TO-MAP SUITE & PRO FACTORY PRESETS
// ============================================================================
window.hwTwinMode = 'live';

window.setHwTwinMode = function(mode) {
  window.hwTwinMode = mode;
  const btnLive = document.getElementById('btn-hw-mode-live');
  const btnMap = document.getElementById('btn-hw-mode-map');
  const container = document.getElementById('hw-twin-container');

  if (btnLive) {
    btnLive.classList.toggle('active', mode === 'live');
    btnLive.style.background = (mode === 'live') ? 'rgba(34,211,238,0.2)' : 'transparent';
    btnLive.style.color = (mode === 'live') ? '#22d3ee' : '#94a3b8';
  }
  if (btnMap) {
    btnMap.classList.toggle('active', mode === 'map');
    btnMap.style.background = (mode === 'map') ? 'rgba(236,72,153,0.2)' : 'transparent';
    btnMap.style.color = (mode === 'map') ? '#ec4899' : '#94a3b8';
  }
  if (container) {
    container.classList.toggle('hw-mapping-mode', mode === 'map');
  }
  if (window.penumbraMidi) {
    window.penumbraMidi.flashToastHud(mode === 'map' ? 'MODO MAPEAMENTO ATIVO: CLIQUE EM QUALQUER CONTROLE' : 'MODO LIVE CONTROL RESTAURADO');
  }
};

window.openMidiMapModal = function(type, index, bank) {
  const b = bank || window.penumbraMidi?.activeBank || 1;
  const mappingKey = `b${b}_${type}_${index}`;
  const existing = window.penumbraMidi?.customMappings[mappingKey] || {};

  const oldModal = document.getElementById('modal-midi-map');
  if (oldModal) oldModal.remove();

  const titleText = `${type.toUpperCase()} ${type === 'master_fader' ? 'MASTER' : (index + 1)} · BANCO ${b}`;

  const modal = document.createElement('div');
  modal.id = 'modal-midi-map';
  modal.className = 'modal-midi-overlay';
  modal.innerHTML = `
    <div class="modal-midi-card">
      <div class="modal-midi-header">
        <div class="modal-midi-title">
          <span>🎯 MAPEAMENTO VISUAL: ${titleText}</span>
        </div>
        <button class="btn btn-outline btn-xs" onclick="document.getElementById('modal-midi-map').remove()">✕</button>
      </div>
      <div class="modal-midi-body">
        <div style="font-size: 10px; color: #94a3b8; line-height: 1.4;">
          Vincule este controle físico ou virtual a qualquer parâmetro do Penumbra, com resposta tátil e curva configurável.
        </div>

        <div class="modal-midi-prop">
          <label class="modal-midi-lbl">PARÂMETRO DE DESTINO</label>
          <select class="modal-midi-select" id="sel-map-target">
            <optgroup label="OPACIDADE DE CAMADAS (LAYERS)">
              <option value="l0_opacity" ${existing.target === 'l0_opacity' ? 'selected' : ''}>L0: Master Base (Opacidade)</option>
              <option value="l1_opacity" ${existing.target === 'l1_opacity' ? 'selected' : ''}>L1: Pulse Mirror (Opacidade)</option>
              <option value="l2_opacity" ${existing.target === 'l2_opacity' ? 'selected' : ''}>L2: Sobel Edges (Opacidade)</option>
              <option value="l3_opacity" ${existing.target === 'l3_opacity' ? 'selected' : ''}>L3: Cue Bus B (Opacidade)</option>
              <option value="l4_opacity" ${existing.target === 'l4_opacity' ? 'selected' : ''}>L4: Drop Climax Accent (Opacidade)</option>
              <option value="l5_opacity" ${existing.target === 'l5_opacity' ? 'selected' : ''}>L5: Overlay Deck (Opacidade Sobreposição)</option>
            </optgroup>
            <optgroup label="ESCALA / ZOOM DE CAMADAS">
              <option value="l0_scale" ${existing.target === 'l0_scale' ? 'selected' : ''}>L0: Master Base (Escala 20%..300%)</option>
              <option value="l1_scale" ${existing.target === 'l1_scale' ? 'selected' : ''}>L1: Pulse Mirror (Escala 20%..300%)</option>
              <option value="l2_scale" ${existing.target === 'l2_scale' ? 'selected' : ''}>L2: Sobel Edges (Escala 20%..300%)</option>
              <option value="l3_scale" ${existing.target === 'l3_scale' ? 'selected' : ''}>L3: Cue Bus B (Escala 20%..300%)</option>
              <option value="l4_scale" ${existing.target === 'l4_scale' ? 'selected' : ''}>L4: Drop Climax Accent (Escala)</option>
              <option value="l5_scale" ${existing.target === 'l5_scale' ? 'selected' : ''}>L5: Overlay Deck (Escala 20%..300%)</option>
            </optgroup>
            <optgroup label="POSIÇÃO X / Y DE CAMADAS">
              <option value="l0_pos_x" ${existing.target === 'l0_pos_x' ? 'selected' : ''}>L0: Master Base (Posição X)</option>
              <option value="l0_pos_y" ${existing.target === 'l0_pos_y' ? 'selected' : ''}>L0: Master Base (Posição Y)</option>
              <option value="l3_pos_x" ${existing.target === 'l3_pos_x' ? 'selected' : ''}>L3: Cue Bus B (Posição X)</option>
              <option value="l3_pos_y" ${existing.target === 'l3_pos_y' ? 'selected' : ''}>L3: Cue Bus B (Posição Y)</option>
              <option value="l5_pos_x" ${existing.target === 'l5_pos_x' ? 'selected' : ''}>L5: Overlay Deck (Posição X)</option>
              <option value="l5_pos_y" ${existing.target === 'l5_pos_y' ? 'selected' : ''}>L5: Overlay Deck (Posição Y)</option>
            </optgroup>
            <optgroup label="CLIPE INDIVIDUAL EM CUE (DECK B)">
              <option value="cue_clip_scale" ${existing.target === 'cue_clip_scale' ? 'selected' : ''}>Clipe em Cue: Escala Intrínseca</option>
              <option value="cue_clip_rot" ${existing.target === 'cue_clip_rot' ? 'selected' : ''}>Clipe em Cue: Rotação (0° / 90° / 180° / 270°)</option>
            </optgroup>
            <optgroup label="MASTER & TRANSIÇÃO">
              <option value="crossfader" ${existing.target === 'crossfader' ? 'selected' : ''}>Crossfader (Bus A ↔ Bus B)</option>
              <option value="auto_take" ${existing.target === 'auto_take' ? 'selected' : ''}>Auto Take (Transição Suave)</option>
              <option value="cut" ${existing.target === 'cut' ? 'selected' : ''}>Cut (Corte Seco Instantâneo)</option>
              <option value="blackout" ${existing.target === 'blackout' ? 'selected' : ''}>Master Blackout (Escurecer)</option>
              <option value="master_locked_matte" ${existing.target === 'master_locked_matte' ? 'selected' : ''}>Trava de Máscara Master (Locked Matte)</option>
            </optgroup>
            <optgroup label="GRADING TONAL & SOBEL">
              <option value="gamma" ${existing.target === 'gamma' ? 'selected' : ''}>Curva Gamma</option>
              <option value="contrast" ${existing.target === 'contrast' ? 'selected' : ''}>Contraste Penumbra</option>
              <option value="edge_mix" ${existing.target === 'edge_mix' ? 'selected' : ''}>Sobel Find Edges Mix</option>
            </optgroup>
            <optgroup label="MACRO PRESETS (AUTOPILOT)">
              <option value="macro_state_intro" ${existing.target === 'macro_state_intro' ? 'selected' : ''}>Disparar INTRO</option>
              <option value="macro_state_groove" ${existing.target === 'macro_state_groove' ? 'selected' : ''}>Disparar GROOVE</option>
              <option value="macro_state_build" ${existing.target === 'macro_state_build' ? 'selected' : ''}>Disparar BUILD</option>
              <option value="macro_state_drop" ${existing.target === 'macro_state_drop' ? 'selected' : ''}>Disparar DROP</option>
              <option value="macro_state_break" ${existing.target === 'macro_state_break' ? 'selected' : ''}>Disparar BREAK</option>
            </optgroup>
          </select>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
          <div class="modal-midi-prop">
            <label class="modal-midi-lbl">CURVA DE RESPOSTA</label>
            <select class="modal-midi-select" id="sel-map-curve">
              <option value="linear" ${(!existing.curve || existing.curve === 'linear') ? 'selected' : ''}>Linear (1:1)</option>
              <option value="exp" ${existing.curve === 'exp' ? 'selected' : ''}>Exponencial (Fino no início)</option>
              <option value="log" ${existing.curve === 'log' ? 'selected' : ''}>Logarítmico (Rápido no início)</option>
              <option value="scurve" ${existing.curve === 'scurve' ? 'selected' : ''}>S-Curve (Sigmoidal suave)</option>
            </select>
          </div>
          <div class="modal-midi-prop" style="display:flex; flex-direction:column; justify-content:center;">
            <label class="modal-midi-lbl">DIREÇÃO</label>
            <label style="display:flex; align-items:center; gap:6px; font-size:11px; color:#f8fafc; cursor:pointer;">
              <input type="checkbox" id="chk-map-invert" ${existing.invert ? 'checked' : ''}>
              Inverter Sentido (127 ↔ 0)
            </label>
          </div>
        </div>
      </div>
      <div class="modal-midi-footer">
        <button class="btn btn-outline btn-xs" onclick="window.removeMidiMapping('${mappingKey}'); document.getElementById('modal-midi-map').remove()">DESVINCULAR</button>
        <button class="btn btn-studio-primary btn-xs" onclick="window.saveMidiMapBindingFromModal('${mappingKey}', '${type}', ${index}, ${b})">SALVAR MAPEAMENTO</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.saveMidiMapBindingFromModal = function(mappingKey, type, index, bank) {
  const target = document.getElementById('sel-map-target')?.value;
  const curve = document.getElementById('sel-map-curve')?.value || 'linear';
  const invert = Boolean(document.getElementById('chk-map-invert')?.checked);

  if (!window.penumbraMidi) return;
  window.penumbraMidi.customMappings[mappingKey] = {
    target,
    curve,
    invert,
    type,
    index,
    bank,
    name: `${type.toUpperCase()} ${index + 1} → ${target}`
  };
  window.penumbraMidi.saveCustomMappings();
  if (window.penumbraHwTwin) window.penumbraHwTwin.renderMappingsTable();
  window.penumbraMidi.flashToastHud(`MAPEAMENTO SALVO: ${target}`);
  document.getElementById('modal-midi-map')?.remove();
};

window.loadMidiPreset = function(presetId) {
  if (!window.penumbraMidi) return;
  const pm = window.penumbraMidi;

  if (presetId === 'preset_master_jam') {
    pm.customMappings = {
      'b1_fader_0': { target: 'l0_opacity', name: 'L0 Master Base' },
      'b1_fader_1': { target: 'l1_opacity', name: 'L1 Pulse Mirror' },
      'b1_fader_2': { target: 'l2_opacity', name: 'L2 Sobel Edge' },
      'b1_fader_3': { target: 'l3_opacity', name: 'L3 Cue Bus B' },
      'b1_fader_4': { target: 'l4_opacity', name: 'L4 Climax Accent' },
      'b1_fader_5': { target: 'l5_opacity', name: 'L5 Overlay Deck' },
      'b1_fader_6': { target: 'crossfader', name: 'Crossfader' },
      'b1_master_fader_0': { target: 'crossfader', name: 'Master Crossfader' }
    };
    pm.flashToastHud('PRESET CARREGADO: MASTER JAM 6-DECKS');
  } else if (presetId === 'preset_layer_sculpt') {
    pm.customMappings = {
      'b1_fader_0': { target: 'l0_scale', name: 'L0 Zoom' },
      'b1_fader_1': { target: 'l1_scale', name: 'L1 Zoom' },
      'b1_fader_2': { target: 'l2_scale', name: 'L2 Zoom' },
      'b1_fader_3': { target: 'l3_scale', name: 'L3 Zoom' },
      'b1_fader_4': { target: 'l4_scale', name: 'L4 Zoom' },
      'b1_fader_5': { target: 'l5_scale', name: 'L5 Zoom' },
      'b1_knob_0': { target: 'l0_pos_x', name: 'L0 Pan X' },
      'b1_knob_1': { target: 'l0_pos_y', name: 'L0 Pan Y' },
      'b1_knob_2': { target: 'cue_clip_scale', name: 'Cue Clip Zoom' },
      'b1_knob_3': { target: 'cue_clip_rot', name: 'Cue Clip Rot' }
    };
    pm.flashToastHud('PRESET CARREGADO: LAYER GEOMETRY & SCULPTOR');
  } else if (presetId === 'preset_conductor_flow') {
    pm.customMappings = {
      'b1_fader_0': { target: 'l0_opacity', name: 'L0 Base' },
      'b1_fader_1': { target: 'l3_opacity', name: 'L3 Cue' },
      'b1_fader_2': { target: 'l5_opacity', name: 'L5 Overlay' },
      'b1_knob_0': { target: 'gamma', name: 'Curva Gamma' },
      'b1_knob_1': { target: 'contrast', name: 'Contraste Penumbra' },
      'b1_knob_2': { target: 'edge_mix', name: 'Sobel Mix' },
      'b1_mute_0': { target: 'macro_state_intro', name: 'Trigger Intro' },
      'b1_mute_1': { target: 'macro_state_groove', name: 'Trigger Groove' },
      'b1_mute_2': { target: 'macro_state_build', name: 'Trigger Build' },
      'b1_mute_3': { target: 'macro_state_drop', name: 'Trigger Drop' }
    };
    pm.flashToastHud('PRESET CARREGADO: AMBIENT CONDUCTOR & MATTE FLOW');
  } else if (presetId === 'preset_climax_battle') {
    pm.customMappings = {
      'b1_fader_0': { target: 'l0_opacity', name: 'L0 Base' },
      'b1_fader_1': { target: 'l3_opacity', name: 'L3 Cue' },
      'b1_fader_2': { target: 'l4_opacity', name: 'L4 Climax Drop' },
      'b1_fader_3': { target: 'l5_opacity', name: 'L5 Overlay' },
      'b1_mute_0': { target: 'cut', name: 'Corte Instantâneo' },
      'b1_mute_1': { target: 'auto_take', name: 'Auto Take' },
      'b1_mute_2': { target: 'blackout', name: 'Blackout' },
      'b1_mute_3': { target: 'master_locked_matte', name: 'Lock Master Matte' }
    };
    pm.flashToastHud('PRESET CARREGADO: 4-DECK BATTLE & CLÍMAX');
  }

  pm.saveCustomMappings();
  if (window.penumbraHwTwin) window.penumbraHwTwin.renderMappingsTable();
};

// ============================================================================
// INSTANCIAÇÃO & INICIALIZAÇÃO AUTOMÁTICA
// ============================================================================
window.penumbraMidi = new PenumbraMidiHub();
window.penumbraHwTwin = new HardwareTwinUI(window.penumbraMidi);

