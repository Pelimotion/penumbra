const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');

async function shotFXTab() {
  const listData = await new Promise((resolve, reject) => {
    http.get('http://localhost:9222/json/list', res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });

  const page = listData.find(p => p.type === 'page' && p.url.includes('3000'));
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

  await send('Runtime.evaluate', {
    expression: `
      const btn = document.querySelector('button[data-tab="tab-fx"]');
      if (btn) btn.click();
      window.selectFxPlugin('pixel_sorter');
    `
  });

  await new Promise(r => setTimeout(r, 600));

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const artDir = '/Users/felipeconceicao/.gemini/antigravity-ide/brain/bd84c9f4-3525-49f1-a41f-2929088e3f20';
  fs.writeFileSync(`${artDir}/test_dock_tab_fx_engine.png`, Buffer.from(shot.data, 'base64'));
  console.log('Saved test_dock_tab_fx_engine.png');

  ws.close();
}

shotFXTab().catch(console.error);
