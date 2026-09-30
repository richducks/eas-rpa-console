const expected = process.argv[2];

if (process.platform !== expected) {
  const names = { linux: 'Ubuntu/Linux', win32: 'Windows', darwin: 'macOS' };
  console.error(`请在 ${names[expected] || expected} 上构建此安装包；当前系统是 ${process.platform}。跨系统构建会把错误平台的 Keyring 原生模块装入包内。`);
  process.exit(1);
}
