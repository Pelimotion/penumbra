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
    
    // Modos / Bancos Operacionais
    // 1: Master Live Mixer (Macro)
    // 2: Layer Focus & Deep Params (Micro)
    // 3: Conductor & Macro Presets (Narrativo)
    // 4: Color Lab & Grading (Estúdio)
    this.activeBank = 1;
    this.bankNames = {
      1: 'MASTER LIVE MIXER',
      2: 'LAYER FOCUS & PARAMS',
      3: 'CONDUCTOR MACROS',
      4: 'COLOR LAB & GRADING'
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
    // O M-Vave possui 2 presets internos de fábrica:
    //   - Banco 1 (Seta Esquerda ◄): Faders CC 20..27, Master CC 28, Encoders CC 30..37
    //   - Banco 2 (Seta Direita ►): Matriz Completa de Botões (Mute CC 20..27, Solo CC 28..35, Rec CC 36..43, Sel CC 44..51, Setas/Transporte CC 56..63)
    if (cc === 86 || (cc === 46 && value > 0)) {
      this.setHardwareBank('bank1');
      return;
    }
    if (cc === 87 || (cc === 47 && value > 0)) {
      this.setHardwareBank('bank2');
      return;
    }

    // Auto-identificação dinâmica por tráfego quando o perfil for Auto (mvave_smc):
    if (this.activeProfile === 'mvave_smc') {
      if ((cc >= 56 && cc <= 63) || (cc >= 36 && cc <= 43) || (cc >= 44 && cc <= 51)) {
        if (this.hardwareBank !== 'bank2') {
          this.setHardwareBank('bank2');
        }
      } else if (cc >= 20 && cc <= 27 && value > 2 && value < 125) {
        // Movimento analógico intermediário em CC 20..27 confirma Fader físico em movimento (Banco 1 ◄)
        if (this.hardwareBank !== 'bank1') {
          this.setHardwareBank('bank1');
        }
      }
    }

    const isHwBank2 = (this.activeProfile === 'mvave_bank2' || (this.activeProfile === 'mvave_smc' && this.hardwareBank === 'bank2'));

    // ---------------------------------------------------------------------------------------
    // A) SE ESTIVER NO BANCO 2 DO HARDWARE (SETA DIREITA ► · MATRIZ COMPLETA DE BOTÕES):
    // ---------------------------------------------------------------------------------------
    if (isHwBank2) {
      // 1. Linha Mute (CC 20 a 27):
      if (channel === 1 && cc >= 20 && cc <= 27 && value > 0) {
        this.handleButtonMute(cc - 20);
        return;
      }
      // 2. Linha Solo (CC 28 a 35):
      if (channel === 1 && cc >= 28 && cc <= 35 && value > 0) {
        this.handleButtonSolo(cc - 28);
        return;
      }
      // 3. Linha Rec / Trigger (CC 36 a 43):
      if (channel === 1 && cc >= 36 && cc <= 43 && value > 0) {
        this.handleButtonRec(cc - 36);
        return;
      }
      // 4. Linha Select (CC 44 a 51):
      if (channel === 1 && cc >= 44 && cc <= 51 && value > 0) {
        this.handleButtonSelect(cc - 44);
        return;
      }
      // 5. Linha Transporte & Setas de Navegação (CC 56 a 63):
      if (channel === 1 && cc >= 56 && cc <= 63 && value > 0) {
        switch (cc) {
          case 56: this.actionRewind(); return;          // Rewind / Downbeat 1.1.1
          case 57: this.actionFastForward(); return;     // FastForward / Advance Take
          case 58: this.stepCrossfader(-5); return;      // Seta Esquerda (◄ Nudge A)
          case 59: this.navigateUp(); return;            // Seta Acima (▲ Preset Anterior)
          case 60: this.navigateDown(); return;          // Seta Abaixo (▼ Próximo Preset)
          case 61: this.stepCrossfader(+5); return;      // Seta Direita (► Nudge B)
          case 62: this.nextBank(); return;              // Cycle / Loop (Cicla B1..B4!)
          case 63: this.actionBlackout(); return;        // Record / Panic Blackout
        }
      }
      // Faders e Knobs secundários no Modo 2 (se configurados):
      if (channel === 1 && cc >= 9 && cc <= 16) {
        this.handleFaderInput(cc - 9, norm);
        return;
      }
      if (channel === 1 && cc >= 1 && cc <= 8) {
        this.handleKnobInput(cc - 1, value, norm);
        return;
      }
    }

    // ---------------------------------------------------------------------------------------
    // B) SE ESTIVER NO BANCO 1 DO HARDWARE (SETA ESQUERDA ◄ · FADERS & ENCODERS NATIVOS):
    // ---------------------------------------------------------------------------------------
    else {
      // 1. Faders Físicos 1 a 8 (CC 20 a 27 no Canal 1):
      if (channel === 1 && cc >= 20 && cc <= 27) {
        const faderIdx = cc - 20;
        this.handleFaderInput(faderIdx, norm);
        return;
      }

      // 2. Master Fader / Crossfader Físico (CC 28 ou CC 29 no Canal 1):
      if (channel === 1 && (cc === 28 || cc === 29)) {
        this.handleMasterFaderInput(norm);
        return;
      }

      // 3. Knobs / Rotary Encoders 1 a 8 (CC 30 a 37 no Canal 1):
      if (channel === 1 && cc >= 30 && cc <= 37) {
        const knobIdx = cc - 30;
        this.handleKnobInput(knobIdx, value, norm);
        return;
      }

      // 4. Botões Complementares via CC (Modo 1):
      if (cc >= 40 && cc <= 47 && value > 0) {
        this.handleButtonMute(cc - 40);
        return;
      }
      if (cc >= 48 && cc <= 55 && value > 0) {
        this.handleButtonSolo(cc - 48);
        return;
      }
      if (cc >= 56 && cc <= 63 && value > 0) {
        switch (cc) {
          case 56: this.actionRewind(); return;
          case 57: this.actionFastForward(); return;
          case 58: this.stepCrossfader(-5); return;
          case 59: this.navigateUp(); return;
          case 60: this.navigateDown(); return;
          case 61: this.stepCrossfader(+5); return;
          case 62: this.nextBank(); return;              // Cycle cicla B1..B4!
          case 63: this.actionBlackout(); return;
        }
      }
      if (cc >= 64 && cc <= 71 && value > 0) {
        this.handleButtonSelect(cc - 64);
        return;
      }

      // 5. Botões de Transporte Mackie CC:
      if (value > 0) {
        switch (cc) {
          case 80: case 114: this.actionRewind(); return;
          case 81: case 115: this.actionFastForward(); return;
          case 82: case 116: this.actionStop(); return;
          case 83: case 117: this.actionPlay(); return;
          case 84: case 118: this.nextBank(); return;   // Cycle cicla B1..B4!
          case 85: case 119: this.actionBlackout(); return;
          case 86: this.prevBank(); return;
          case 87: this.nextBank(); return;
          case 88: this.actionTapTempo(); return;
        }
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
      case 86: this.actionLoop(); return;            // Cycle / Loop (🔁)
      case 46: this.prevBank(); return;              // Channel / Bank Left («)
      case 47: this.nextBank(); return;              // Channel / Bank Right (»)
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

    // -------------------------------------------------------------
    // BANCO 1: MASTER LIVE MIXER
    // Faders 1 a 5: Opacidade das Camadas 0 a 4
    // Fader 6: Master FX Intensity / Crossfader
    // Fader 7: Video Speed Master
    // Fader 8: Master Brightness / Fade to Black
    // -------------------------------------------------------------
    if (this.activeBank === 1) {
      if (faderIdx >= 0 && faderIdx <= 4) {
        const layerKey = `layer${faderIdx}`;
        const inputId = `l${faderIdx}-opacity`;
        const el = document.getElementById(inputId);
        const currNorm = el ? (Number(el.value) / 100.0) : 0;
        
        const takeover = this.applySoftTakeover(`b1_fader_${faderIdx}`, normValue, currNorm);
        if (takeover.allowUpdate) {
          this.setLayerOpacityDirect(layerKey, takeover.finalValue * 100);
        }
      } else if (faderIdx === 5) {
        // Master FX Intensity
        const el = document.getElementById('crossfader');
        const currNorm = el ? (Number(el.value) / 100.0) : 0.5;
        const takeover = this.applySoftTakeover(`b1_fader_5`, normValue, currNorm);
        if (takeover.allowUpdate && el) {
          el.value = (takeover.finalValue * 100).toFixed(1);
          el.dispatchEvent(new Event('input'));
        }
      } else if (faderIdx === 6) {
        // Master Video Playback Speed (0.25x a 3.0x)
        const speed = 0.25 + (normValue * 2.75);
        this.setPlaybackSpeedGlobal(speed);
      } else if (faderIdx === 7) {
        // Master Dimmer / Brightness
        this.setMasterBrightnessDimmer(normValue);
      }
    }

    // -------------------------------------------------------------
    // BANCO 2: LAYER FOCUS & DEEP PARAMETERS
    // Opera na camada ativa: this.activeFocusLayer (0..4)
    // Faders 1 a 4: Mascaramento Procedural (Crop Top, Bottom, Left, Right)
    // Faders 5 a 8: Áudio DSP Reactivity Bands (Sub, Bass, Mids, Air)
    // -------------------------------------------------------------
    else if (this.activeBank === 2) {
      const layerKey = `layer${this.activeFocusLayer}`;
      if (faderIdx >= 0 && faderIdx <= 3) {
        this.setLayerProceduralCrop(layerKey, faderIdx, normValue);
      } else if (faderIdx >= 4 && faderIdx <= 7) {
        this.setAudioBandSensitivity(faderIdx - 4, normValue);
      }
    }

    // -------------------------------------------------------------
    // BANCO 3: CONDUCTOR & MACRO PRESETS
    // Faders 1 a 5: Opacidade de Layers L0..L4
    // Fader 6: Master Macro Chaos Intensity
    // Fader 7: Tempo Nudge
    // Fader 8: Master Blackout Fade
    // -------------------------------------------------------------
    else if (this.activeBank === 3) {
      if (faderIdx <= 4) {
        this.setLayerOpacityDirect(`layer${faderIdx}`, normValue * 100);
      } else if (faderIdx === 5) {
        if (window.appState) window.appState.macro_chaos = normValue;
      }
    }

    // -------------------------------------------------------------
    // BANCO 4: COLOR LAB & GRADING
    // Faders 1 a 5: Camadas L0..L4
    // Fader 6: Master Saturation (-100 a +100)
    // Fader 7: Color Temp
    // Fader 8: Master Blackout
    // -------------------------------------------------------------
    else if (this.activeBank === 4) {
      if (faderIdx <= 4) {
        this.setLayerOpacityDirect(`layer${faderIdx}`, normValue * 100);
      } else if (faderIdx === 5) {
        this.updateFaderElement('fader-contrast', normValue, 60, 160);
      } else if (faderIdx === 6) {
        this.updateFaderElement('fader-edge-mix', normValue, 0, 45);
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
    // No modo relativo do M-Vave/MCU, os encoders enviam apenas 1 (+1) ou 65 (-1)
    const isRelativeStep = (rawValue === 1 || rawValue === 65 || (rawValue >= 2 && rawValue <= 4) || (rawValue >= 66 && rawValue <= 68));
    const isExplicitRelative = this.encoderMode === 'relative';
    const isExplicitAbsolute = this.encoderMode === 'absolute';

    let newKnobVal;
    if (isExplicitAbsolute || (!isExplicitRelative && !isRelativeStep && (rawValue > 4 && rawValue < 64 || rawValue > 68 && rawValue <= 127 || rawValue === 0))) {
      // Modo Absoluto Direto Contínuo (0.0 a 1.0): segue a rotação do knob 1:1
      newKnobVal = normValue;
    } else if (isExplicitRelative || isRelativeStep) {
      // Modo Relativo com aceleração balística
      const now = performance.now();
      const lastTime = this.encoderLastTime[knobIdx] || now;
      const dt = Math.max(1, now - lastTime);
      this.encoderLastTime[knobIdx] = now;

      // Aceleração balística por delta-t
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

    // -------------------------------------------------------------
    // BANCO 1: MASTER MIXER
    // Knobs 1 a 5: Sobel Edge Threshold por Camada (L0..L4)
    // Knobs 6 a 8: Gamma, Contraste, Sobel Mix Master
    // -------------------------------------------------------------
    if (this.activeBank === 1) {
      if (knobIdx <= 4) {
        this.setLayerEdgeThreshold(knobIdx, newKnobVal);
      } else if (knobIdx === 5) {
        this.updateFaderElement('fader-gamma', newKnobVal, 40, 160);
      } else if (knobIdx === 6) {
        this.updateFaderElement('fader-contrast', newKnobVal, 70, 160);
      } else if (knobIdx === 7) {
        this.updateFaderElement('fader-edge-mix', newKnobVal, 0, 40);
      }
    }

    // -------------------------------------------------------------
    // BANCO 2: LAYER FOCUS & DEEP PARAMETERS
    // Opera nos parâmetros profundos da camada focada (L0..L4)
    // Knob 1: Opacidade Fina
    // Knob 2: Velocidade de Reprodução (0.25x a 3.0x)
    // Knob 3: Edge Sobel Threshold
    // Knob 4: Zoom / Escala (0.8x a 2.0x)
    // Knob 5: Rotação / Orientação (0°, -90°, +90°, 180°)
    // Knob 6: Tint / Hue Shift
    // Knob 7: Inversão de Máscara / Threshold
    // Knob 8: Seletor de Blend Mode (Normal, Multiply, Screen, Darken, Overlay, Difference)
    // -------------------------------------------------------------
    else if (this.activeBank === 2) {
      const layerKey = `layer${this.activeFocusLayer}`;
      switch (knobIdx) {
        case 0:
          this.setLayerOpacityDirect(layerKey, newKnobVal * 100);
          break;
        case 1:
          this.setLayerSpeedDirect(layerKey, 0.25 + newKnobVal * 2.75);
          break;
        case 2:
          this.setLayerEdgeThreshold(this.activeFocusLayer, newKnobVal);
          break;
        case 3:
          this.setLayerScale(layerKey, 0.8 + newKnobVal * 1.4);
          break;
        case 4:
          this.cycleLayerRotationByKnob(layerKey, newKnobVal);
          break;
        case 5:
          this.setLayerHueTint(layerKey, newKnobVal);
          break;
        case 6:
          this.setLayerMatteThreshold(layerKey, newKnobVal);
          break;
        case 7:
          this.cycleLayerBlendByKnob(layerKey, newKnobVal);
          break;
      }
    }

    // -------------------------------------------------------------
    // BANCO 3: CONDUCTOR & MACRO PRESETS
    // Knobs 1 a 4: Autopilot Dwell Time, Glitch Probability, Motion Dynamics, Audio Sensitivity
    // Knobs 5 a 8: After Effects Plugins Intensity
    // -------------------------------------------------------------
    else if (this.activeBank === 3) {
      if (knobIdx === 0 && window.appState) {
        window.appState.autopilot_dwell = Math.round(8 + newKnobVal * 32);
      } else if (knobIdx === 1 && window.appState) {
        window.appState.glitch_prob = newKnobVal;
      } else if (knobIdx === 2 && window.setAudioInputGain) {
        window.setAudioInputGain(Math.round(newKnobVal * 200));
      } else if (knobIdx >= 4 && knobIdx <= 7) {
        this.setFxPluginIntensityByIndex(knobIdx - 4, newKnobVal);
      }
    }

    // -------------------------------------------------------------
    // BANCO 4: COLOR LAB & GRADING
    // Knobs 1 a 8: Gamma, Pretos, Médios, Contraste, Edge Mix, Saturação, Temp, Grão
    // -------------------------------------------------------------
    else if (this.activeBank === 4) {
      if (knobIdx === 0) this.updateFaderElement('fader-gamma', newKnobVal, 40, 160);
      else if (knobIdx === 1) this.updateFaderElement('fader-brightness', newKnobVal, -30, 20);
      else if (knobIdx === 2) this.updateFaderElement('fader-midtones', newKnobVal, 50, 150);
      else if (knobIdx === 3) this.updateFaderElement('fader-contrast', newKnobVal, 70, 160);
      else if (knobIdx === 4) this.updateFaderElement('fader-edge-mix', newKnobVal, 0, 40);
      else if (knobIdx === 5) this.updateFaderElement('fader-edge-thresh', newKnobVal, 10, 80);
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
      this.soloLayer(channelIdx);
      this.activeTelemetry.lastAction = `Solo Camada L${channelIdx}`;
    } else if (channelIdx === 5) {
      // Canal 6: Invert Matte da Camada Ativa
      const layerKey = `layer${this.activeFocusLayer}`;
      if (window.appState && window.appState[layerKey]) {
        window.appState[layerKey].invert = !window.appState[layerKey].invert;
        this.flashToastHud(`MÁSCARA L${this.activeFocusLayer}: ${window.appState[layerKey].invert ? 'INVERTIDA' : 'NORMAL'}`);
      }
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

    if (this.activeBank === 2) {
      // No Banco 2 (Layer Focus), os botões Rec ligam/desligam os 5 Plugins do After Effects!
      const plugins = ['pixel_sorter', 'pixel_stretch', 'bad_tv', 'rxxr', 'modulation'];
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

    // Seleciona o foco da camada sem forçar troca indesejada de banco
    if (channelIdx <= 4) {
      this.activeFocusLayer = channelIdx;
      this.twinState.buttons.sel.fill(false);
      this.twinState.buttons.sel[channelIdx] = true;
      this.flashToastHud(`FOCO EM CAMADA L${channelIdx}`);
      this.activeTelemetry.lastAction = `Foco Camada L${channelIdx}`;
      this.sendLedFeedbackAll();
      this.notifyUI();
    } else if (channelIdx === 5) {
      this.setBank(1);
    } else if (channelIdx === 6) {
      this.setBank(2);
    } else if (channelIdx === 7) {
      this.setBank(this.activeBank === 3 ? 4 : 3);
    }
  }

  // =========================================================================
  // 8. TRANSPORTE & NAVEGAÇÃO DE BANCOS
  // =========================================================================
  setBank(bankNum) {
    if (bankNum < 1 || bankNum > 4) return;
    this.activeBank = bankNum;
    this.resetTakeoverForBankChange();
    this.flashToastHud(`BANCO MIDI ${bankNum}: ${this.bankNames[bankNum]}`);
    console.log(`[PENUMBRA MIDI] Banco comutado para: ${bankNum} (${this.bankNames[bankNum]})`);
    this.sendLedFeedbackAll();
    this.notifyUI();
  }

  nextBank() {
    let next = this.activeBank + 1;
    if (next > 4) next = 1;
    this.setBank(next);
  }

  prevBank() {
    let prev = this.activeBank - 1;
    if (prev < 1) prev = 4;
    this.setBank(prev);
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
    for (let i = 0; i <= 4; i++) {
      const targetKey = `layer${i}`;
      const shouldActive = (i === layerIdx);
      if (window.appState && window.appState.layers && window.appState.layers[targetKey]) {
        window.appState.layers[targetKey].active = shouldActive;
      }
      this.twinState.buttons.solo[i] = shouldActive;
      this.sendLedFeedback('solo', i, shouldActive);
    }
    this.flashToastHud(`SOLO ISOLADO NA CAMADA L${layerIdx}`);
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
    const plugins = ['pixel_sorter', 'pixel_stretch', 'bad_tv', 'rxxr', 'modulation'];
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

  executeMappedAction(mapping, normValue, rawValue) {
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
      bankBadge.textContent = `B${this.activeBank}: ${this.bankNames[this.activeBank].split(' ')[0]}`;
      bankBadge.title = `Banco de Software Ativo: B${this.activeBank} (${this.bankNames[this.activeBank]}) · Clique para avançar banco [Atalho: Tecla B ou F1-F4]`;
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

      // Alternar Bancos de Software: [ e ] ou Tecla B
      if (e.key === '[' || ((e.key === 'b' || e.key === 'B') && !e.ctrlKey && !e.metaKey && !e.altKey)) {
        e.preventDefault();
        if (e.key === '[') this.prevBank();
        else this.nextBank();
        return;
      }
      if (e.key === ']') {
        e.preventDefault();
        this.nextBank();
        return;
      }

      // Teclas F1 a F4: Ir direto para B1, B2, B3, B4
      if (e.key === 'F1') { e.preventDefault(); this.setBank(1); return; }
      if (e.key === 'F2') { e.preventDefault(); this.setBank(2); return; }
      if (e.key === 'F3') { e.preventDefault(); this.setBank(3); return; }
      if (e.key === 'F4') { e.preventDefault(); this.setBank(4); return; }

      // Tecla H: Alternar Preset de Hardware M-Vave (◄ Banco 1 Faders / ► Banco 2 Botões)
      if ((e.key === 'h' || e.key === 'H') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        this.toggleHardwareBank();
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

    // Rótulos Dinâmicos dos Knobs e Faders por Banco
    this.labels = {
      knobs: {
        1: ['SOBEL L0', 'SOBEL L1', 'SOBEL L2', 'SOBEL L3', 'SOBEL L4', 'GAMMA', 'CONTRAST', 'EDGE MIX'],
        2: ['OPACITY', 'SPEED', 'SOBEL', 'SCALE', 'PAN/ROT', 'HUE TINT', 'MATTE INV', 'BLEND'],
        3: ['DWELL', 'GLITCH', 'AUDIO SENS', 'CHAOS', 'PX SORT', 'PX STRETCH', 'BAD TV', 'MODULAT'],
        4: ['GAMMA', 'BLACKS', 'MIDS', 'CONTRAST', 'EDGE MIX', 'THRESH', 'COLOR BAL', 'GRAIN']
      },
      faders: {
        1: ['L0 OPAC', 'L1 OPAC', 'L2 OPAC', 'L3 OPAC', 'L4 OPAC', 'CROSS', 'SPEED', 'DIMMER'],
        2: ['CROP TOP', 'CROP BTM', 'CROP LFT', 'CROP RGT', 'DSP SUB', 'DSP BASS', 'DSP MIDS', 'DSP AIR'],
        3: ['L0 OPAC', 'L1 OPAC', 'L2 OPAC', 'L3 OPAC', 'L4 OPAC', 'CHAOS FX', 'NUDGE', 'DIMMER'],
        4: ['L0 OPAC', 'L1 OPAC', 'L2 OPAC', 'L3 OPAC', 'L4 OPAC', 'CONTRAST', 'EDGE MIX', 'DIMMER']
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
            <button class="hw-btn hw-btn-solo" id="hw-btn-solo-${i}" onclick="handleHwButtonClick('solo', ${i})" title="Solo da Camada">S</button>
            <button class="hw-btn hw-btn-rec" id="hw-btn-rec-${i}" onclick="handleHwButtonClick('rec', ${i})" title="Trigger / Macro">R</button>
            <button class="hw-btn hw-btn-sel" id="hw-btn-sel-${i}" onclick="handleHwButtonClick('sel', ${i})" title="Focar Camada (Shift + ${i + 1})">SEL</button>
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
    if (bankBadge) bankBadge.textContent = `BANCO ${bank}: ${this.hub.bankNames[bank]}`;

    for (let b = 1; b <= 4; b++) {
      const bBtn = document.getElementById(`btn-bank-1`);
      const card = document.getElementById(`btn-bank-${b}`);
      if (card) card.classList.toggle('active', b === bank);
    }

    // Foco de Camada (Banco 2)
    const focusRow = document.getElementById('midi-focus-layer-row');
    if (focusRow) {
      focusRow.style.display = (bank === 2) ? 'flex' : 'none';
      for (let l = 0; l <= 4; l++) {
        const btn = document.getElementById(`btn-focus-l${l}`);
        if (btn) btn.classList.toggle('active', l === focusLayer);
      }
    }

    // Atualiza OLED
    const oled1 = document.getElementById('oled-line-1');
    const oled2 = document.getElementById('oled-line-2');
    if (oled1) {
      const hwTxt = (this.hub.hardwareBank === 'bank1') ? 'HW: ◄ B1 (FADERS)' : 'HW: ► B2 (BOTÕES)';
      oled1.textContent = `${hwTxt} · SW B${bank}: ${this.hub.bankNames[bank]} · ${this.hub.activeTelemetry.deviceName.slice(0, 14)}`;
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
        strip.classList.toggle('focused', bank === 2 && i === focusLayer);
      }

      // Rótulos Dinâmicos
      const knobLbl = document.getElementById(`hw-knob-lbl-${i}`);
      if (knobLbl) knobLbl.textContent = this.labels.knobs[bank][i];

      const faderLbl = document.getElementById(`hw-fader-lbl-${i}`);
      if (faderLbl) faderLbl.textContent = this.labels.faders[bank][i];

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
  if (!window.penumbraMidi) return;
  e.preventDefault();
  const delta = e.deltaY < 0 ? 0.04 : -0.04;
  const curr = window.penumbraMidi.twinState.knobs[knobIdx] || 0.5;
  const nextVal = Math.max(0, Math.min(1, curr + delta));
  window.penumbraMidi.handleKnobInput(knobIdx, Math.round(nextVal * 127), nextVal);
  window.penumbraMidi.notifyUI();
};

window.handleHwButtonClick = function(type, chIdx) {
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
// INSTANCIAÇÃO & INICIALIZAÇÃO AUTOMÁTICA
// ============================================================================
window.penumbraMidi = new PenumbraMidiHub();
window.penumbraHwTwin = new HardwareTwinUI(window.penumbraMidi);

