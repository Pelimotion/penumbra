const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), 'utf8');

test('documentação principal aponta para fontes internas existentes', () => {
  const readme = read('README.md');
  for (const path of ['docs/ARCHITECTURE.md', 'DECISOES.md', 'STATE.md', 'CHANGELOG.md']) {
    assert.ok(existsSync(join(root, path)), `arquivo ausente: ${path}`);
    assert.ok(readme.includes(path), `README sem referência a ${path}`);
  }
});

test('documentação não presume licença ausente', () => {
  assert.match(read('README.md'), /Nenhum arquivo de licença foi identificado/);
});

test('componente do controlador e assets da aplicação existem', () => {
  assert.ok(existsSync(join(root, 'penumbra_engine/web_controller/server.js')));
  assert.ok(existsSync(join(root, 'penumbra_engine/web_controller/public/index.html')));
});
