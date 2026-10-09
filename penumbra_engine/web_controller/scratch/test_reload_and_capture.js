const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');

async function run() {
  const listData = await new Promise((resolve, reject) => {
    http.get('http://localhost:9222/json/list', res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });

  const page = listData.find(p => p.type === 'page' && p.url.includes('3000'));
  if (!page) {
    console.error('No page matching 3000 found!');
    return;
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 1;
  function send(method, params = {}) {
    return new Promise(resolve => {
      const msgId = id++;
      const handler = raw => {
        const msg = JSON.parse(raw);
        if (msg.id === msgId) {
          ws.off('message', handler);
          resolve(msg.result);
        }
      };
      ws.on('message', handler);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  await new Promise(r => ws.on('open', r));

  console.log('Reloading page with ignoreCache: true...');
  await send('Page.reload', { ignoreCache: true });
  await new Promise(r => setTimeout(r, 2500));

  // Check window.appState
  const checkState = await send('Runtime.evaluate', {
    expression: 'Boolean(window.appState && window.appState.fx && window.applyFXEngine)'
  });
  console.log('appState and applyFXEngine check:', checkState);

  const plugins = [
    { id: 'pixel_stretch', preset: 'cinematic_anamorphic' },
    { id: 'pixel_sorter', preset: 'glitch_waterfall' },
    { id: 'bad_tv', preset: 'deep_space' },
    { id: 'rxxr', preset: 'cyberpunk_tracer' },
    { id: 'modulation', preset: 'offset_cmyk' }
  ];

  const artDir = '/Users/felipeconceicao/.gemini/antigravity-ide/brain/bd84c9f4-3525-49f1-a41f-2929088e3f20';

  for (const item of plugins) {
    console.log(`Activating plugin: ${item.id} with preset: ${item.preset}`);
    await send('Runtime.evaluate', {
      expression: `
        window.appState.fx.active = true;
        window.appState.fx.target = 'master';
        window.appState.fx.masterIntensity = 1.0;
        window.selectFxPlugin('${item.id}');
        window.loadPluginPreset('${item.id}', '${item.preset}');
        window.updateFxUI();
      `
    });

    await new Promise(r => setTimeout(r, 600));

    // Capture program canvas
    const pgmData = await send('Runtime.evaluate', {
      expression: `document.getElementById('program-canvas').toDataURL('image/png')`
    });

    if (pgmData && pgmData.result && pgmData.result.value) {
      const b64 = pgmData.result.value.replace(/^data:image\/png;base64,/, '');
      const outPath = `${artDir}/output_live_${item.id}.png`;
      fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
      console.log(`Saved screenshot for ${item.id} -> ${outPath}`);
    } else {
      console.error(`Failed to capture canvas for ${item.id}:`, pgmData);
    }
  }

  // Also take full screenshot of the UI
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  if (shot && shot.data) {
    fs.writeFileSync(`${artDir}/test_cockpit_live_fx.png`, Buffer.from(shot.data, 'base64'));
    console.log(`Saved full cockpit screenshot -> test_cockpit_live_fx.png`);
  }

  ws.close();
  console.log('All tests completed successfully!');
}

run().catch(console.error);
