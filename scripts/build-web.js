const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'src', 'renderer');
const destination = path.join(root, 'dist', 'web');
fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(destination, { recursive: true });
for (const file of ['index.html', 'styles.css', 'app.js', 'web-bridge.js']) fs.copyFileSync(path.join(source, file), path.join(destination, file));
fs.writeFileSync(path.join(destination, 'README.txt'), 'EAS 自动登录中心网页版\n\n打开 index.html 即可使用账号簿界面。\n受浏览器安全限制，网页版不能启动 EAS、读取系统 Keyring 或执行自动登录；这些能力请使用 Windows 或 Ubuntu 桌面版。\n', 'utf8');
