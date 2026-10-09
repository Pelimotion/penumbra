/**
 * Penumbra Engine Portable Bundler
 * Compiles the entire web engine (HTML, CSS, JS) into a single, self-contained
 * Penumbra_Portable.html file that can run completely offline.
 */

const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '../penumbra_engine/web_controller/public');
const OUTPUT_DIR = path.join(__dirname, '../cdn_build');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function bundlePortable() {
  console.log('[*] Bundling Penumbra Engine into a Portable HTML...');

  let htmlContent = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf-8');
  
  // Inline CSS
  const cssContent = fs.readFileSync(path.join(PUBLIC_DIR, 'styles.css'), 'utf-8');
  htmlContent = htmlContent.replace(/<link rel="stylesheet" href="styles\.css[^"]*">/, `<style>\n${cssContent}\n</style>`);
  
  // Inline MIDI JS
  const midiContent = fs.readFileSync(path.join(PUBLIC_DIR, 'midi.js'), 'utf-8');
  htmlContent = htmlContent.replace(/<script src="midi\.js"><\/script>/, `<script>\n${midiContent}\n</script>`);
  
  // Inline APP JS
  const appContent = fs.readFileSync(path.join(PUBLIC_DIR, 'app.js'), 'utf-8');
  htmlContent = htmlContent.replace(/<script src="app\.js[^"]*"><\/script>/, `<script>\n${appContent}\n</script>`);
  
  // Inline Favicon (SVG to Base64) - Optional, but good for zero external requests
  const faviconSvg = fs.readFileSync(path.join(PUBLIC_DIR, 'favicon.svg'), 'utf-8');
  const faviconB64 = Buffer.from(faviconSvg).toString('base64');
  htmlContent = htmlContent.replace(/<link rel="icon" type="image\/svg\+xml" href="favicon\.svg">/, `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,${faviconB64}">`);

  const outputPath = path.join(OUTPUT_DIR, 'Penumbra_Portable.html');
  fs.writeFileSync(outputPath, htmlContent);
  console.log(`[✓] Successfully built: ${outputPath}`);
  
  return outputPath;
}

if (require.main === module) {
  bundlePortable();
}

module.exports = bundlePortable;
