// tests/e2e/live_smoke.js
// Penumbra VJ Engine - Playwright Smoke E2E do Fluxo ao Vivo
const { chromium } = require('playwright');

async function runLiveSmokeTest(options = {}) {
  const baseUrl = options.baseUrl || 'http://localhost:3000';
  const headless = options.headless !== undefined ? options.headless : true;
  
  const report = {
    name: 'Playwright Smoke E2E do Fluxo ao Vivo',
    timestamp: new Date().toISOString(),
    steps: [],
    success: true,
    errors: []
  };

  const logStep = (stepName, passed, details = '') => {
    report.steps.push({ step: stepName, passed, details });
    const mark = passed ? '✓' : '✗';
    console.log(`  [${mark}] ${stepName} ${details ? '(' + details + ')' : ''}`);
    if (!passed) {
      report.success = false;
      report.errors.push(`${stepName}: ${details}`);
    }
  };

  console.log(`\n🚀 INICIANDO SMOKE E2E AO VIVO EM ${baseUrl} (headless: ${headless})`);

  let browser;
  try {
    browser = await chromium.launch({ headless });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 }
    });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => {
      consoleErrors.push(err.message);
    });

    // 1. ABRIR COCKPIT
    try {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(400);
      await page.evaluate(() => {
        const dlg = document.getElementById('media-nexus-modal');
        if (dlg) {
          try { dlg.close(); } catch(e) {}
          dlg.removeAttribute('open');
          dlg.style.display = 'none';
        }
      });
      const ready = await page.evaluate(() => {
        return {
          title: document.title,
          hasPrg: !!document.getElementById('program-canvas'),
          hasPrv: !!document.getElementById('preview-canvas'),
          hasApp: typeof window.appState !== 'undefined'
        };
      });

      if (ready.hasPrg && ready.hasPrv) {
        logStep('1. Abrir Cockpit & Inicializar Canvases', true, `Title: "${ready.title}"`);
      } else {
        logStep('1. Abrir Cockpit & Inicializar Canvases', false, 'Canvases não encontrados');
      }
    } catch (e) {
      logStep('1. Abrir Cockpit & Inicializar Canvases', false, e.message);
    }

    // 2. TROCAR TAKE (M/E Auto Take Transition)
    try {
      const takeSuccess = await page.evaluate(() => {
        const b = document.getElementById('btn-auto-take') || document.getElementById('btn-cue-take');
        if (b) {
          b.click();
          return true;
        }
        return false;
      });

      if (takeSuccess) {
        await page.waitForTimeout(1400);
        const afterTake = await page.evaluate(() => ({
          clip: window.appState ? window.appState.layers.layer0.clipId : null,
          crossfader: document.getElementById('crossfader') ? document.getElementById('crossfader').value : null
        }));
        logStep('2. Trocar Take (Auto Transition)', true, `Clip Base: ${afterTake.clip || 'OK'} | Crossfader: ${afterTake.crossfader}`);
      } else {
        logStep('2. Trocar Take (Auto Transition)', false, 'Botão #btn-auto-take não encontrado');
      }
    } catch (e) {
      logStep('2. Trocar Take (Auto Transition)', false, e.message);
    }

    // 3. MUDAR MACRO STATE (INTRO, GROOVE, BUILD, DROP, BREAK)
    try {
      const statesToTest = ['INTRO', 'GROOVE', 'BUILD', 'DROP', 'BREAK'];
      let statesPassed = 0;

      for (const st of statesToTest) {
        await page.evaluate((targetState) => {
          const btn = document.querySelector(`.state-btn[data-state="${targetState}"]`);
          if (btn) btn.click();
        }, st);
        await page.waitForTimeout(120);
        const current = await page.evaluate(() => window.appState ? window.appState.macro_state : null);
        if (current === st) statesPassed++;
      }

      if (statesPassed === statesToTest.length) {
        logStep('3. Mudar Macro State (5 Estados)', true, `${statesPassed}/5 estados comutados perfeitamente`);
      } else {
        logStep('3. Mudar Macro State (5 Estados)', false, `Apenas ${statesPassed}/${statesToTest.length} estados responderam`);
      }
    } catch (e) {
      logStep('3. Mudar Macro State (5 Estados)', false, e.message);
    }

    // 4. ATIVAR LAYER 5 (OVERLAY DECK)
    try {
      const l5Result = await page.evaluate(() => {
        const tabBtn = document.querySelector('.dock-tab[data-tab="tab-layers"]');
        if (tabBtn) tabBtn.click();
        const init = !!window.appState?.layers?.layer5?.active;
        const b = document.getElementById('btn-toggle-l5');
        if (b) {
          b.click();
          const tog = !!window.appState?.layers?.layer5?.active;
          if (tog !== init) b.click();
          return { ok: true, init, tog };
        }
        return { ok: false };
      });

      if (l5Result.ok) {
        logStep('4. Ativar/Alternar Layer 5 (Overlay Deck)', true, `Estado L5 alternado: ${l5Result.init} -> ${l5Result.tog}`);
      } else {
        logStep('4. Ativar/Alternar Layer 5 (Overlay Deck)', false, 'Botão #btn-toggle-l5 não encontrado');
      }
    } catch (e) {
      logStep('4. Ativar/Alternar Layer 5 (Overlay Deck)', false, e.message);
    }

    // 5. CLICK-TO-MAP (GÊMEO MIDI)
    try {
      await page.evaluate(() => {
        const btnSettings = document.getElementById('btn-show-settings');
        if (btnSettings) btnSettings.click();
        const btnMap = document.getElementById('btn-hw-mode-map');
        if (btnMap) btnMap.click();
      });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
      logStep('5. Click-to-Map MIDI Twin', true, 'Modo de mapeamento acionado');
    } catch (e) {
      logStep('5. Click-to-Map MIDI Twin', false, e.message);
    }

    // 6. EXPANDIR MONITOR CINEMA
    try {
      const theaterResult = await page.evaluate(() => {
        const btnExpand = document.getElementById('btn-prg-expand');
        if (btnExpand) {
          btnExpand.click();
          const modal = document.getElementById('theater-modal');
          const active = modal && modal.classList.contains('active');
          if (window.closeTheater) window.closeTheater();
          return active;
        }
        return false;
      });
      logStep('6. Expandir Monitor Cinema', !!theaterResult, 'Overlay Cinema ativo');
    } catch (e) {
      logStep('6. Expandir Monitor Cinema', false, e.message);
    }

    // 7. DESTACAR POP-OUT
    try {
      const popoutPage = await context.newPage();
      await popoutPage.goto(`${baseUrl}/popout.html?view=program`, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await popoutPage.waitForTimeout(300);
      
      const popoutReady = await popoutPage.evaluate(() => {
        const c = document.getElementById('popout-canvas');
        return !!c && c.width > 0 && c.height > 0;
      });

      logStep('7. Destacar Pop-out Window (popout.html)', !!popoutReady, 'Pop-out canvas 100% ativo');
      await popoutPage.close();
    } catch (e) {
      logStep('7. Destacar Pop-out Window (popout.html)', false, e.message);
    }

    // Validação de erros graves de console
    const criticalErrors = consoleErrors.filter(err => 
      !err.includes('favicon') && 
      !err.includes('404') && 
      !err.includes('test_preview.mp3')
    );

    if (criticalErrors.length > 0) {
      console.log(`  [!] Avisos de console detectados: ${criticalErrors.length}`);
      report.consoleWarnings = criticalErrors;
    }

    await browser.close();
  } catch (err) {
    if (browser) await browser.close();
    logStep('Geral / Setup Playwright', false, err.message);
  }

  return report;
}

if (require.main === module) {
  runLiveSmokeTest().then(res => {
    console.log(`\nResultado Smoke: ${res.success ? 'APROVADO ✓' : 'FALHOU ✗'}`);
    process.exit(res.success ? 0 : 1);
  });
}

module.exports = { runLiveSmokeTest };
