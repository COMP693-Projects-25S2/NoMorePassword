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
    getCurrentUser: () => ipcRenderer.invoke('get-current-user'),

    // Browser view control
    hideBrowserView: () => ipcRenderer.invoke('hide-browser-view'),
    showBrowserView: () => ipcRenderer.invoke('show-browser-view'),

    // Config actions
    clearLocalUsers: () => ipcRenderer.invoke('clear-local-users'),
    exitApp: () => ipcRenderer.invoke('exit-app'),
    openConfigModal: () => ipcRenderer.invoke('open-config-modal'),
    openUserSelector: () => ipcRenderer.invoke('open-user-selector'),
    switchUser: (userId) => ipcRenderer.invoke('switch-user', userId),
    openUserRegistration: () => ipcRenderer.invoke('open-user-registration'),
    clearCurrentUserActivities: () => ipcRenderer.invoke('clear-current-user-activities'),

    // Client switching
    switchToClient: (clientType) => ipcRenderer.invoke('switch-to-client', clientType),

    // URL parameter injection
    getUrlInjectionStatus: (url) => ipcRenderer.invoke('get-url-injection-status', url),



    // Event listeners
    onTabTitleUpdated: (callback) => ipcRenderer.on('tab-title-updated', callback),
    onAutoTabCreated: (callback) => ipcRenderer.on('auto-tab-created', callback),
    onInitTab: (callback) => ipcRenderer.on('init-tab', callback),
    onShowNotification: (callback) => ipcRenderer.on('show-notification', callback),
    onCloseAllTabs: (callback) => ipcRenderer.on('close-all-tabs', callback),


    // Cleanup listeners
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
}
);
