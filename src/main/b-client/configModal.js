const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');

class ConfigModal {
    constructor() {
        this.configWindow = null;
        this.isOpen = false;
    }

    /**
     * Show configuration modal
     */
    show() {
        if (this.isOpen && this.configWindow && !this.configWindow.isDestroyed()) {
            this.configWindow.focus();
            return;
        }

        this.isOpen = true;

        // Create configuration window
        this.configWindow = new BrowserWindow({
            width: 400,
            height: 300,
            resizable: false,
            modal: true,
            show: false,
            title: 'B-Client Configuration',
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                enableRemoteModule: false,
                preload: path.join(__dirname, 'pages', 'configPreload.js')
            }
        });

        // Load configuration HTML
        const configPath = path.join(__dirname, 'pages', 'config.html');
        this.configWindow.loadFile(configPath);

        // Show window when ready
        this.configWindow.once('ready-to-show', () => {
            this.configWindow.show();
        });

        // Handle window events
        this.configWindow.on('focus', () => {
            console.log('Configuration modal focused');
        });

        this.configWindow.on('blur', () => {
            console.log('Configuration modal blurred');
        });

        this.configWindow.on('closed', () => {
            this.isOpen = false;
            this.configWindow = null;
            console.log('Configuration modal window closed');
        });

        // Set up IPC handlers
        this.setupIpcHandlers();

        console.log('Configuration modal created and shown successfully');
    }

    /**
     * Set up IPC handlers for configuration modal
     */
    setupIpcHandlers() {
        // Handle switch to C-Client
        ipcMain.once('switch-to-c-client', () => {
            console.log('Switching to C-Client from B-Client configuration');
            this.close();
            
            // Emit client switch event
            const { app } = require('electron');
            app.emit('client-switch', 'c-client');
        });

        // Handle close configuration
        ipcMain.once('close-config-modal', () => {
            console.log('Closing configuration modal');
            this.close();
        });
    }

    /**
     * Close configuration modal
     */
    close() {
        if (this.configWindow && !this.configWindow.isDestroyed()) {
            this.configWindow.close();
        }
        this.isOpen = false;
        this.configWindow = null;
    }

    /**
     * Check if modal is open
     */
    isModalOpen() {
        return this.isOpen && this.configWindow && !this.configWindow.isDestroyed();
    }
}

module.exports = ConfigModal;
