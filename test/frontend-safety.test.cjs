const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { join } = require('node:path');
const test = require('node:test');

const source = readFileSync(join(__dirname, '..', 'penumbra_engine', 'web_controller', 'public', 'app.js'), 'utf8');

test('catalog HTML escaping encodes markup and quoted attributes', () => {
  const declaration = source.match(/function escapeHTML\(value\) \{[\s\S]*?\n\}/);
  assert.ok(declaration, 'app.js must define the shared HTML escaper');
  const escapeHTML = vm.runInNewContext(`(${declaration[0]})`);
  assert.equal(escapeHTML(`<img src=x onerror='alert(1)'>&`), '&lt;img src=x onerror=&#39;alert(1)&#39;&gt;&amp;');
});

test('catalog renderers escape untrusted manifest and matte fields', () => {
  assert.ok(source.includes('${escapeHTML(clip.filename)}'), 'media card filename must be escaped');
  assert.ok(source.includes('${escapeHTML(mName)}'), 'matte display name must be escaped before rendering');
  const declaration = source.match(/function safeCDNMediaUrl\(value\) \{[\s\S]*?\n\}/);
  assert.ok(declaration, 'app.js must define safeCDNMediaUrl for manifest media URLs');
  const safeCDNMediaUrl = vm.runInNewContext(`(${declaration[0]})`, { URL });
  assert.equal(safeCDNMediaUrl('https://gigantera-penumbra.b-cdn.net/media/clip.mp4'), 'https://gigantera-penumbra.b-cdn.net/media/clip.mp4');
  assert.equal(safeCDNMediaUrl('http://evil.example/track.mp4'), '');
  assert.equal(safeCDNMediaUrl('https://gigantera-penumbra.b-cdn.net:8443/media/clip.mp4'), '');
  assert.equal(safeCDNMediaUrl('javascript:alert(1)'), '');
  const pathDeclaration = source.match(/function safeManifestPath\(value\) \{[\s\S]*?\n\}/);
  assert.ok(pathDeclaration, 'app.js must define safeManifestPath before the installer consumes remote paths');
  const safeManifestPath = vm.runInNewContext(`(${pathDeclaration[0]})`);
  assert.equal(safeManifestPath('IN/project/clip.mp4'), 'IN/project/clip.mp4');
  assert.equal(safeManifestPath('../outside.mp4'), null);
  assert.equal(safeManifestPath('C:/outside.mp4'), null);
  assert.equal(safeManifestPath('/absolute.mp4'), null);
  assert.equal(safeManifestPath('folder\\\\..\\\\outside.mp4'), null);
});

test('media action markup does not nest duplicate action-row containers', () => {
  assert.doesNotMatch(source, /<div class="card-actions-row">\s*<div class="card-actions-row">/);
});
