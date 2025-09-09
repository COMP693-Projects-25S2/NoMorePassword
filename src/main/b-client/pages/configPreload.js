// configPreload.js
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('configAPI', {
    // Switch to C-Client
    switchToCClient: () => ipcRenderer.send('switch-to-c-client'),
    
    // Close config modal
    closeConfig: () => ipcRenderer.send('close-config-modal')
});
