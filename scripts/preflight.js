// scripts/preflight.js
// Penumbra VJ Engine - Pipeline Preflight Suite (Safety Net)
// Roda Smoke E2E + Regressão Visual + Verificação de Integridade
const { runLiveSmokeTest } = require('../tests/e2e/live_smoke.js');
const { runVisualRegression } = require('../tests/visual/regression.js');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ARTIFACTS_REPORT_PATH = '/Users/felipeconceicao/.gemini/antigravity-ide/brain/4bc15861-a7a4-4a44-8bbc-2704f1df8acf/preflight_report.md';
const LOCAL_REPORT_PATH = path.resolve(__dirname, '../tests/reports/preflight_report.md');

function checkServerAlive(port = 3000) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/`, (res) => {
      resolve(res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function ensureServerRunning(port = 3000) {
  const isAlive = await checkServerAlive(port);
  if (isAlive) {
    console.log(`[✓] Penumbra Controller ativo na porta ${port}`);
    return null;
  }

  console.log(`[*] Iniciando Penumbra Controller em background na porta ${port}...`);
  const serverScript = path.resolve(__dirname, '../penumbra_engine/web_controller/server.js');
  const serverProc = spawn('node', [serverScript], {
    cwd: path.resolve(__dirname, '../penumbra_engine/web_controller'),
    detached: true,
    stdio: 'ignore'
  });
  serverProc.unref();

  // Espera até 5 segundos
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (await checkServerAlive(port)) {
      console.log(`[✓] Servidor conectado após inicialização.`);
      return serverProc;
    }
  }
  throw new Error(`Não foi possível conectar ao servidor na porta ${port}`);
}

async function main() {
  const startTime = Date.now();
  console.log('====================================================');
  console.log('🪐 PENUMBRA ENGINE · PREFLIGHT AUDIT & SAFETY NET');
  console.log('====================================================');

  await ensureServerRunning(3000);

  const smokeOnly = process.argv.includes('--smoke-only');
  const visualOnly = process.argv.includes('--visual-only');
  const updateBaselines = process.argv.includes('--update-baselines');

  let smokeResult = null;
  let visualResult = null;
  let overallSuccess = true;

  if (!visualOnly) {
    console.log('\n[1/2] Executando Smoke E2E...');
    smokeResult = await runLiveSmokeTest({ baseUrl: 'http://localhost:3000' });
    if (!smokeResult.success) overallSuccess = false;
  }

  if (!smokeOnly) {
    console.log('\n[2/2] Executando Regressão Visual...');
    visualResult = await runVisualRegression({ baseUrl: 'http://localhost:3000', updateBaselines });
    if (!visualResult.success) overallSuccess = false;
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);

  // GERAÇÃO DO RELATÓRIO PREFLIGHT
  const reportLines = [
    '# 🪐 PENUMBRA ENGINE · RELATÓRIO PREFLIGHT & SAFETY NET',
    '',
    `- **Data de Execução:** ${new Date().toLocaleString('pt-BR')}`,
    `- **Duração Total:** ${durationSec}s`,
    `- **Status Geral:** ${overallSuccess ? '🟢 APROVADO (Zero Regressões)' : '🔴 FALHA DETECTADA'}`,
    '',
    '## 1. Playwright Smoke E2E (Fluxo ao Vivo)',
    smokeResult ? `**Status:** ${smokeResult.success ? '🟢 PASSOU' : '🔴 FALHOU'}` : '*(Ignorado)*',
    ''
  ];

  if (smokeResult) {
    reportLines.push('| Passo de Fluxo | Resultado | Detalhes |');
    reportLines.push('|---|---|---|');
    smokeResult.steps.forEach(s => {
      reportLines.push(`| ${s.step} | ${s.passed ? '🟢 PASS' : '🔴 FAIL'} | ${s.details || '—'} |`);
    });
    reportLines.push('');
  }

  reportLines.push('## 2. Regressão Visual de Viewports & Output');
  reportLines.push(visualResult ? `**Status:** ${visualResult.success ? '🟢 PASSOU' : '🔴 FALHOU'}` : '*(Ignorado)*');
  reportLines.push('');

  if (visualResult) {
    reportLines.push('### Viewports Auditados (Cockpit UI):');
    reportLines.push('| Viewport | Dimensões | Status | Variação | Baseline |');
    reportLines.push('|---|---|---|---|---|');
    visualResult.viewports.forEach(v => {
      reportLines.push(`| ${v.viewport} | ${v.width}x${v.height} | ${v.status} | ${v.diffPct || 0}% | \`${v.file}\` |`);
    });
    reportLines.push('');

    reportLines.push('### Output Visual por Macro State (Program Canvas):');
    reportLines.push('| Estado Musical | Status | Arquivo Baseline |');
    reportLines.push('|---|---|---|');
    visualResult.outputStates.forEach(o => {
      reportLines.push(`| **${o.state}** | ${o.status} | \`${o.file}\` |`);
    });
    reportLines.push('');
  }

  reportLines.push('## 3. Diretriz do Workflow de UI');
  reportLines.push('> Toda e qualquer edição futura em `app.js`, `styles.css` ou `index.html` deve rodar obrigatoriamente `npm run preflight`. Se falhar, o deploy e merge são bloqueados.');
  reportLines.push('');

  const reportContent = reportLines.join('\n');
  fs.writeFileSync(LOCAL_REPORT_PATH, reportContent);
  try {
    fs.writeFileSync(ARTIFACTS_REPORT_PATH, reportContent);
  } catch (_) {}

  console.log('\n====================================================');
  if (overallSuccess) {
    console.log(`🟢 PREFLIGHT CONCLUÍDO COM SUCESSO (${durationSec}s)`);
    console.log(`📄 Relatório salvo em: ${LOCAL_REPORT_PATH}`);
    console.log('====================================================\n');
    process.exit(0);
  } else {
    console.error(`🔴 PREFLIGHT FALHOU COM ERROS (${durationSec}s)`);
    console.error(`📄 Relatório de falhas salvo em: ${LOCAL_REPORT_PATH}`);
    console.log('====================================================\n');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
