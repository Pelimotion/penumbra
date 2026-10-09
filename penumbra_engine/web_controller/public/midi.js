/**
 * PENUMBRA VJ ENGINE - MIDI CONTROLLER HUB
 * Integração Web MIDI API para M-Vave SMC-MIXER
 */

class MidiHub {
  constructor() {
    this.midiAccess = null;
    this.smcMixer = null;
    this.activeBank = 1; // Bank 1: Layers, Bank 2: Grading, Bank 3: FX
    this.lastInteractionTime = {};
    
    this.init();
  }

  async init() {
    if (!navigator.requestMIDIAccess) {
      console.warn("[MIDI] Web MIDI API não suportada neste navegador.");
      return;
    }

    try {
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      this.midiAccess.onstatechange = this.onStateChange.bind(this);
      this.scanDevices();
    } catch (err) {
      console.error("[MIDI] Falha ao acessar Web MIDI:", err);
    }
  }

  scanDevices() {
    const inputs = this.midiAccess.inputs.values();
    for (let input = inputs.next(); input && !input.done; input = inputs.next()) {
      const device = input.value;
      if (device.name.toLowerCase().includes('smc') || device.name.toLowerCase().includes('midi')) {
        console.log(`[MIDI] Dispositivo Conectado: ${device.name}`);
        this.smcMixer = device;
        this.smcMixer.onmidimessage = this.handleMidiMessage.bind(this);
      }
    }
  }

  onStateChange(event) {
    const port = event.port;
    if (port.type === 'input') {
      if (port.state === 'connected') {
        console.log(`[MIDI] Conectado: ${port.name}`);
        this.scanDevices();
      } else if (port.state === 'disconnected') {
        console.warn(`[MIDI] Desconectado: ${port.name}`);
        if (this.smcMixer && this.smcMixer.id === port.id) {
          this.smcMixer = null;
        }
      }
    }
  }

  handleMidiMessage(message) {
    const [command, control, value] = message.data;
    
    // Filtra apenas Control Change (CC) -> Command 176 (Channel 1)
    if (command >= 176 && command <= 191) {
      this.routeControlChange(control, value);
    }
  }

  routeControlChange(cc, value) {
    // Exemplo de mapeamento para o SMC-MIXER.
    // Presumindo Encoders = CC 1 a 8, Faders = CC 9 a 16.
    
    // Override flag
    const now = performance.now();
    this.lastInteractionTime[cc] = now;
    window.appState = window.appState || {};
    window.appState.manual_override = true;
    window.appState.last_manual_time = now;

    // Normalização (0 a 1)
    const normValue = value / 127.0;

    // BANCO 1: Camadas e Crossfader
    if (this.activeBank === 1) {
      if (cc >= 9 && cc <= 13) {
        // Faders de 1 a 5 -> Opacidade Layers 0 a 4
        const layerIdx = cc - 9;
        const inputId = `l${layerIdx}-opacity`;
        const el = document.getElementById(inputId);
        if (el) {
          el.value = normValue * 100;
          el.dispatchEvent(new Event('input'));
        }
      }
      else if (cc === 16) {
        // Master Fader -> Master Crossfader
        const el = document.getElementById('crossfader');
        if (el) {
          el.value = normValue * 100;
          el.dispatchEvent(new Event('input'));
        }
      }
      else if (cc >= 1 && cc <= 5) {
        // Encoders (Rotativos) -> Edge Threshold Layers 0 a 4 (Relative-2 mode assumption: 1=up, 127=down)
        // Precisamos tratar o modo relativo no software da M-Vave (Relative-2 / 2's Complement).
        const delta = value < 64 ? value : value - 128; 
        console.log(`[MIDI] Rotary CC ${cc} delta: ${delta}`);
      }
    }
    
    // BANCO 2: Grading Tonal
    else if (this.activeBank === 2) {
      if (cc === 9) this.updateFader('fader-gamma', normValue, 40, 160);
      else if (cc === 10) this.updateFader('fader-brightness', normValue, -30, 20);
      else if (cc === 11) this.updateFader('fader-midtones', normValue, 50, 150);
      else if (cc === 12) this.updateFader('fader-contrast', normValue, 80, 160);
      else if (cc === 13) this.updateFader('fader-edge-mix', normValue, 0, 40);
    }
  }

  updateFader(elementId, normValue, min, max) {
    const el = document.getElementById(elementId);
    if (el) {
      const val = min + (normValue * (max - min));
      el.value = val;
      el.dispatchEvent(new Event('input'));
    }
  }

  switchBank(bankNum) {
    this.activeBank = bankNum;
    console.log(`[MIDI] Banco alterado para: ${bankNum}`);
    // Poderiamos adicionar um Toast Alert UI aqui
  }
}

// Inicia o Hub globalmente
window.addEventListener('DOMContentLoaded', () => {
  window.penumbraMidi = new MidiHub();
});
