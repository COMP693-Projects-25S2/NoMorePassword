// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    createTab: (url) => ipcRenderer.invoke('create-tab', url),
    createHistoryTab: () => ipcRenderer.invoke('create-history-tab'), // 新增
    switchTab: (id) => ipcRenderer.invoke('switch-tab', id),
    closeTab: (id) => ipcRenderer.invoke('close-tab', id),
    navigateTo: (url) => ipcRenderer.invoke('navigate-to', url),
    goBack: () => ipcRenderer.invoke('go-back'),
    goForward: () => ipcRenderer.invoke('go-forward'),
    refresh: () => ipcRenderer.invoke('refresh'),
    getTabInfo: (id) => ipcRenderer.invoke('get-tab-info', id),

    // 新增：访问历史和统计功能
    getVisitHistory: () => ipcRenderer.invoke('get-visit-history'),
    getVisitStats: () => ipcRenderer.invoke('get-visit-stats'),

    // 获取历史数据
    getHistoryData: () => ipcRenderer.invoke('get-history-data'),

    // 新增：控制 BrowserView 显示/隐藏
    hideBrowserView: () => ipcRenderer.invoke('hide-browser-view'),
    showBrowserView: () => ipcRenderer.invoke('show-browser-view'),

    // 监听事件
    onTabTitleUpdated: (callback) => ipcRenderer.on('tab-title-updated', callback),
    onInitTab: (callback) => ipcRenderer.on('init-tab', callback),

    // 清理监听器
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});
