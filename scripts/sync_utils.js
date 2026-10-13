const fs = require('node:fs');

function loadEnvFileIfUnset(filePath, env = process.env) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || Object.prototype.hasOwnProperty.call(env, match[1])) continue;
    env[match[1]] = match[2].replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, (_, doubleQuoted, singleQuoted) => doubleQuoted ?? singleQuoted);
  }
}

function thumbnailNeedsRefresh(sourcePath, thumbnailPath) {
  if (!fs.existsSync(thumbnailPath)) return true;
  return fs.statSync(sourcePath).mtimeMs > fs.statSync(thumbnailPath).mtimeMs;
}

module.exports = { loadEnvFileIfUnset, thumbnailNeedsRefresh };
