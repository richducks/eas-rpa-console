const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'src', 'renderer');
const destination = path.join(root, 'dist', 'web');
fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(destination, { recursive: true });
for (const file of ['styles.css', 'app.js', 'web-bridge.js']) fs.copyFileSync(path.join(source, file), path.join(destination, file));
fs.copyFileSync(path.join(source, 'index.html'), path.join(destination, 'app.html'));
for (const file of ['index.html', 'marker.css', 'marker.js']) fs.copyFileSync(path.join(root, 'src', 'web-marker', file), path.join(destination, file));
fs.writeFileSync(path.join(destination, 'README.txt'), 'EAS RPA 问题标记版\n\n通过本地 HTTP 服务打开 index.html。点击“开始标记”，再点击右侧 RPA 界面中的问题位置，填写说明并导出 JSON。\n标记只保存在浏览器本地，不会启动 EAS 或读取系统凭据。\n', 'utf8');
