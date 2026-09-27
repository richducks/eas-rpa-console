const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('easDesktop', {
  getEnvironment: () => ipcRenderer.invoke('environment:get'),
  probeEnvironment: () => ipcRenderer.invoke('environment:probe'),
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (config) => ipcRenderer.invoke('config:save', config),
  checkCredential: (accountId) => ipcRenderer.invoke('credentials:check', accountId),
  storeCredential: (accountId, password) => ipcRenderer.invoke('credentials:store', { accountId, password }),
  deleteCredential: (accountId) => ipcRenderer.invoke('credentials:delete', accountId),
  getPaths: () => ipcRenderer.invoke('app:paths'),
  startFoundationRun: (dataCenter) => ipcRenderer.invoke('task:start-foundation', dataCenter),
  startAccountRun: (accountId) => ipcRenderer.invoke('task:start-account', accountId),
  stopRun: () => ipcRenderer.invoke('task:stop'),
  discoverDataCenters: () => ipcRenderer.invoke('datacenters:discover'),
  onTaskEvent: (listener) => {
    const wrapped = (_event, payload) => listener(payload);
    ipcRenderer.on('task:event', wrapped);
    return () => ipcRenderer.removeListener('task:event', wrapped);
  },
  pickLauncher: () => ipcRenderer.invoke('launcher:pick'),
  pickClientDirectory: () => ipcRenderer.invoke('client-directory:pick')
});
