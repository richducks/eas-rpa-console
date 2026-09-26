const fs = require('fs');
const path = require('path');

const FIELD_CODES = new Set(['f', 'F', 'u', 'U', 'd', 'D', 'n', 'N', 'v', 'm']);

function tokenizeExec(input) {
  const tokens = [];
  let current = '';
  let quote = null;
  let escaping = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (escaping) { current += char; escaping = false; continue; }
    if (char === '\\' && quote !== "'") { escaping = true; continue; }
    if (quote) { if (char === quote) quote = null; else current += char; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (/\s/.test(char)) { if (current) { tokens.push(current); current = ''; } continue; }
    if (char === '%' && input[i + 1]) {
      const code = input[++i];
      if (code === '%') current += '%';
      else if (!FIELD_CODES.has(code) && code !== 'i' && code !== 'c' && code !== 'k') current += `%${code}`;
      continue;
    }
    current += char;
  }
  if (escaping || quote) throw new Error('Exec 字段的引号或转义不完整');
  if (current) tokens.push(current);
  return tokens;
}

function parseDesktopFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const section = content.match(/\[Desktop Entry\]([\s\S]*?)(?:\n\[|$)/);
  if (!section) throw new Error('缺少 [Desktop Entry]');
  const entries = {};
  for (const line of section[1].split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator > 0) entries[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  if (!entries.Exec) throw new Error('Desktop 文件缺少 Exec');
  const argv = tokenizeExec(entries.Exec);
  if (!argv.length) throw new Error('Exec 未解析出可执行命令');
  return { argv, workingDirectory: entries.Path || path.dirname(filePath), name: entries.Name || path.basename(filePath), source: filePath };
}

module.exports = { parseDesktopFile, tokenizeExec };
