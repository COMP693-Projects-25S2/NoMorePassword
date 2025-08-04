// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    createTab: (url) => ipcRenderer.invoke('create-tab', url),
    switchTab: (id) => ipcRenderer.invoke('switch-tab', id),
    closeTab: (id) => ipcRenderer.invoke('close-tab', id),
    navigateTo: (url) => ipcRenderer.invoke('navigate-to', url),
    goBack: () => ipcRenderer.invoke('go-back'),
    goForward: () => ipcRenderer.invoke('go-forward'),
    refresh: () => ipcRenderer.invoke('refresh'),
    getTabInfo: (id) => ipcRenderer.invoke('get-tab-info', id)

});

