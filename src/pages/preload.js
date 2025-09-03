// preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
    'electronAPI', {
    // Tab management
    createTab: (url) => ipcRenderer.invoke('create-tab', url),

    createHistoryTab: () => ipcRenderer.invoke('create-history-tab'),
    switchTab: (id) => ipcRenderer.invoke('switch-tab', id),
    closeTab: (id) => ipcRenderer.invoke('close-tab', id),
    getTabInfo: (id) => ipcRenderer.invoke('get-tab-info', id),

    // Navigation
    navigateTo: (url) => ipcRenderer.invoke('navigate-to', url),
    goBack: () => ipcRenderer.invoke('go-back'),
    goForward: () => ipcRenderer.invoke('go-forward'),
    refresh: () => ipcRenderer.invoke('refresh'),

    // History data
    getHistoryData: () => ipcRenderer.invoke('get-history-data'),
    getVisitHistory: () => ipcRenderer.invoke('get-visit-history'),
    getVisitStats: () => ipcRenderer.invoke('get-visit-stats'),

    // Browser view control
    hideBrowserView: () => ipcRenderer.invoke('hide-browser-view'),
    showBrowserView: () => ipcRenderer.invoke('show-browser-view'),



    // Event listeners
    onTabTitleUpdated: (callback) => ipcRenderer.on('tab-title-updated', callback),
    onAutoTabCreated: (callback) => ipcRenderer.on('auto-tab-created', callback),
    onInitTab: (callback) => ipcRenderer.on('init-tab', callback),

    // Cleanup listeners
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
}
);
