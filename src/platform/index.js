function createPlatformAdapter(rawPlatform = process.platform, environment = process.env) {
  const isWindows = rawPlatform === 'win32';
  const isLinux = rawPlatform === 'linux';
  const isMac = rawPlatform === 'darwin';
  const id = isWindows ? 'windows' : isMac ? 'macos' : isLinux ? 'linux' : rawPlatform;

  return Object.freeze({
    rawPlatform,
    id,
    isWindows,
    isLinux,
    isMac,
    defaultDesktopFile: isLinux ? '/opt/Kingdee/EASCloud.desktop' : null,
    defaultClientDirectory: isWindows ? 'D:\\Kingdee\\eas' : null,
    startupScriptName: isWindows ? 'client.bat' : 'client.sh',
    javaExecutableName: isWindows ? 'java.exe' : 'java',
    classPathDelimiter: isWindows ? ';' : ':',
    sessionType: isWindows ? 'windows' : null,
    supportsAtspi: isLinux,
    environmentCommands: isWindows
      ? ['powershell.exe', 'cmd.exe', 'java.exe']
      : isLinux
        ? ['wmctrl', 'xdotool', 'xwininfo', 'xprop', 'gdbus', 'secret-tool', 'python3', 'java']
        : ['python3', 'java'],
    launcherFilter: isWindows
      ? { name: 'Windows 启动器', extensions: ['bat', 'cmd', 'exe'] }
      : isLinux
        ? { name: 'Linux 启动器', extensions: ['desktop', 'sh'] }
        : { name: '启动器', extensions: ['command', 'sh'] },
    shouldQuitOnAllWindowsClosed: !isMac,
    loginVerificationMode: isWindows ? 'agent' : 'window-close',
    commandProbe(command) {
      return isWindows
        ? { executable: environment.ComSpec || 'cmd.exe', args: ['/d', '/c', 'where', command] }
        : { executable: 'sh', args: ['-c', 'command -v "$1"', 'probe', command] };
    },
    wrapStartupScript(startupScript) {
      return isWindows
        ? { executable: environment.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', 'call', startupScript] }
        : { executable: '/bin/sh', args: [startupScript] };
    }
  });
}

const currentPlatform = createPlatformAdapter();

module.exports = { createPlatformAdapter, currentPlatform };
