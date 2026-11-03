const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  presets: {
    list: () => ipcRenderer.invoke('presets:list'),
    save: (name, state) => ipcRenderer.invoke('presets:save', name, state),
    remove: (name) => ipcRenderer.invoke('presets:delete', name),
    exportFile: (name, state) => ipcRenderer.invoke('presets:exportFile', name, state),
    importFile: () => ipcRenderer.invoke('presets:importFile'),
  },
  fonts: {
    list: () => ipcRenderer.invoke('fonts:list'),
    import: () => ipcRenderer.invoke('fonts:import'),
    remove: (file) => ipcRenderer.invoke('fonts:remove', file),
    installData: (file, data) => ipcRenderer.invoke('fonts:installData', file, data),
    read: (file) => ipcRenderer.invoke('fonts:read', file),
  },
  exporter: {
    chooseDest: (format, baseName) => ipcRenderer.invoke('export:chooseDest', format, baseName),
    start: (opts) => ipcRenderer.invoke('export:start', opts),
    frame: (id, data) => ipcRenderer.invoke('export:frame', id, data),
    finish: (id) => ipcRenderer.invoke('export:finish', id),
    cancel: (id) => ipcRenderer.invoke('export:cancel', id),
  },
  project: {
    save: (filePath, json, suggestedName) => ipcRenderer.invoke('project:save', filePath, json, suggestedName),
    open: () => ipcRenderer.invoke('project:open'),
    read: (p) => ipcRenderer.invoke('project:read', p),
    onOpenPath: (cb) => ipcRenderer.on('project:openPath', (_e, p) => cb(p)),
  },
  onMenu: (cb) => ipcRenderer.on('menu', (_e, cmd) => cb(cmd)),
  reveal: (p) => ipcRenderer.invoke('shell:reveal', p),
  info: () => ipcRenderer.invoke('app:info'),
});
