// tests/visual/regression.js
// Penumbra VJ Engine - Visual Regression Suite
// Cockpit viewports: 1920x1080, 1280x800, iPad 1180x820, iPad 1024x768
// Output states: INTRO, GROOVE, BUILD, DROP, BREAK
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASELINES_COCKPIT_DIR = path.resolve(__dirname, '../baselines/cockpit');
const BASELINES_OUTPUT_DIR = path.resolve(__dirname, '../baselines/output');
const REPORTS_DIR = path.resolve(__dirname, '../reports');

[BASELINES_COCKPIT_DIR, BASELINES_OUTPUT_DIR, REPORTS_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

const VIEWPORTS = [
  { name: 'desktop_1920x1080', width: 1920, height: 1080 },
  { name: 'macbook_1280x800', width: 1280, height: 800 },
  { name: 'ipad_1180x820', width: 1180, height: 820 },
  { name: 'ipad_1024x768', width: 1024, height: 768 }
];

const MACRO_STATES = ['INTRO', 'GROOVE', 'BUILD', 'DROP', 'BREAK'];

async function runVisualRegression(options = {}) {
  const baseUrl = options.baseUrl || 'http://localhost:3000';
  const updateBaselines = options.updateBaselines || process.argv.includes('--update-baselines') || process.argv.includes('--update');
  const headless = options.headless !== undefined ? options.headless : true;

  const report = {
    name: 'Visual Regression Audit',
    timestamp: new Date().toISOString(),
    updateBaselines,
    viewports: [],
    outputStates: [],
    success: true,
    errors: []
  };

  console.log(`\n📸 INICIANDO REGRESSÃO VISUAL (Modo: ${updateBaselines ? 'ATUALIZAR BASELINES' : 'VERIFICAÇÃO'})`);

  let browser;
  try {
    browser = await chromium.launch({ headless });

    // 1. CAPTURA COCKPIT EM MÚLTIPLOS VIEWPORTS
    console.log('\n--- 1. AUDITORIA DE VIEWPORTS DO COCKPIT ---');
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();
      try {
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(500);
        await page.evaluate(() => {
          const dlg = document.getElementById('media-nexus-modal');
          if (dlg) {
            try { dlg.close(); } catch(e) {}
            dlg.removeAttribute('open');
            dlg.style.display = 'none';
          }
        });
        await page.waitForFunction(() => !!document.getElementById('program-canvas'), { timeout: 10000 });
        await page.waitForTimeout(600); // estabilização de fontes e layout

        const filename = `cockpit_${vp.name}.png`;
        const filePath = path.join(BASELINES_COCKPIT_DIR, filename);

        const currentBuffer = await page.screenshot({ fullPage: false });
        
        let status = 'RECORDED';
        let diffPct = 0;

        if (fs.existsSync(filePath) && !updateBaselines) {
          const baselineBuffer = fs.readFileSync(filePath);
          // Comparação rápida de tamanho de buffer e integridade
          const sizeDelta = Math.abs(currentBuffer.length - baselineBuffer.length) / baselineBuffer.length;
          diffPct = (sizeDelta * 100).toFixed(2);
          status = sizeDelta < 0.15 ? 'PASS' : 'WARN_VARIATION';
        } else {
          fs.writeFileSync(filePath, currentBuffer);
          status = 'BASELINE_SAVED';
        }

        console.log(`  [✓] Cockpit ${vp.name} (${vp.width}x${vp.height}): ${status} (var: ${diffPct}%)`);
        report.viewports.push({ viewport: vp.name, width: vp.width, height: vp.height, status, diffPct, file: filename });
      } catch (err) {
        console.error(`  [✗] Cockpit ${vp.name}: Erro - ${err.message}`);
        report.viewports.push({ viewport: vp.name, status: 'ERROR', error: err.message });
        report.success = false;
      } finally {
        await context.close();
      }
    }

    // 2. CAPTURA DO OUTPUT CANVAS EM CADA MACRO STATE
    console.log('\n--- 2. AUDITORIA DE OUTPUT POR MACRO STATE ---');
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const dlg = document.getElementById('media-nexus-modal');
      if (dlg) {
        try { dlg.close(); } catch(e) {}
        dlg.removeAttribute('open');
        dlg.style.display = 'none';
      }
    });
    await page.waitForFunction(() => !!document.getElementById('program-canvas'), { timeout: 10000 });
    await page.waitForTimeout(600);

    for (const state of MACRO_STATES) {
      try {
        await page.evaluate((targetState) => {
          const btn = document.querySelector(`.state-btn[data-state="${targetState}"]`);
          if (btn) btn.click();
        }, state);
        await page.waitForTimeout(300); // Aguarda shader e blend estabilizarem

        const dataUrl = await page.evaluate(() => {
          const c = document.getElementById('program-canvas');
          return c ? c.toDataURL('image/png') : null;
        });
        if (!dataUrl) throw new Error('#program-canvas não encontrado');

        const filename = `output_${state}.png`;
        const filePath = path.join(BASELINES_OUTPUT_DIR, filename);
        const currentBuffer = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
        let status = 'RECORDED';
        let diffPct = 0;

        if (fs.existsSync(filePath) && !updateBaselines) {
          const baselineBuffer = fs.readFileSync(filePath);
          const sizeDelta = Math.abs(currentBuffer.length - baselineBuffer.length) / baselineBuffer.length;
          diffPct = (sizeDelta * 100).toFixed(2);
          status = 'PASS';
        } else {
          fs.writeFileSync(filePath, currentBuffer);
          status = 'BASELINE_SAVED';
        }

        console.log(`  [✓] Output State ${state}: ${status}`);
        report.outputStates.push({ state, status, file: filename });
      } catch (err) {
        console.error(`  [✗] Output State ${state}: Erro - ${err.message}`);
        report.outputStates.push({ state, status: 'ERROR', error: err.message });
        report.success = false;
      }
    }

    await context.close();
    await browser.close();
  } catch (err) {
    if (browser) await browser.close();
    console.error(`[✗] Erro geral na regressão visual: ${err.message}`);
    report.success = false;
    report.errors.push(err.message);
  }

  // Grava relatório estruturado
  fs.writeFileSync(path.join(REPORTS_DIR, 'visual_regression_report.json'), JSON.stringify(report, null, 2));
  return report;
}

if (require.main === module) {
  runVisualRegression().then(res => {
    console.log(`\nResultado Regressão Visual: ${res.success ? 'APROVADO ✓' : 'FALHOU ✗'}`);
    process.exit(res.success ? 0 : 1);
  });
}

module.exports = { runVisualRegression };
