// Network Configuration Dialog for C-Client
// Provides UI for switching between local and public IP modes

const { BrowserWindow, screen } = require('electron');
const path = require('path');
const NetworkConfigManager = require('../config/networkConfigManager');

class NetworkConfigDialog {
    constructor() {
        this.dialogWindow = null;
        this.mainWindow = null;
        this.currentConfig = null;
        this.networkConfigManager = new NetworkConfigManager();
        this.monitoringEnabled = false;
        this.mainWindowCheckInterval = null;
    }

    // Show the network configuration dialog
    async show(mainWindow = null) {
        try {
            this.mainWindow = mainWindow;

            // Check if dialog already exists
            if (this.dialogWindow && !this.dialogWindow.isDestroyed()) {
                this.dialogWindow.focus();
                return;
            }

            // Get current configuration
            this.currentConfig = this.networkConfigManager.getConfigSummary();

            // Get display info for positioning
            const displays = screen.getAllDisplays();
            const primaryDisplay = displays.find(d => d.id === screen.getPrimaryDisplay().id) || displays[0];
            const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

            // Calculate dialog position (center of screen)
            const dialogWidth = 450;
            const dialogHeight = 320;
            const x = Math.max(0, (screenWidth - dialogWidth) / 2);
            const y = Math.max(0, (screenHeight - dialogHeight) / 2);

            // Create dialog window
            this.dialogWindow = new BrowserWindow({
                width: dialogWidth,
                height: dialogHeight,
                x: x,
                y: y,
                resizable: true,
                minimizable: true,
                maximizable: false,
                fullscreenable: false,
                alwaysOnTop: false,
                skipTaskbar: false,
                show: false,
                frame: true,
                transparent: false,
                backgroundColor: '#ffffff',
                webPreferences: {
                    nodeIntegration: true,
                    contextIsolation: false,
                    enableRemoteModule: false,
                    preload: path.join(__dirname, '../pages/preload.js'),
                    sandbox: false
                }
            });

            // Set window properties
            this.dialogWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

            // Load HTML content
            await this.loadHTMLContent();

            // Show window after content is loaded
            this.dialogWindow.show();
            this.dialogWindow.focus();

            // Setup event listeners
            this.setupEventListeners();

            // Start monitoring main window
            this.startMainWindowMonitoring();

        } catch (error) {
            console.error('Error showing network config dialog:', error);
            throw error;
        }
    }

    // Load HTML content
    async loadHTMLContent() {
        const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Network Configuration</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 0;
            background: white;
            color: #333;
            overflow: hidden;
        }

        .dialog-container {
            width: 100%;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }

        .dialog-header {
            background: linear-gradient(to bottom, #f8f9fa, #e9ecef);
            padding: 16px 20px 12px 20px;
            border-bottom: 1px solid #e0e0e0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
        }

        .dialog-title {
            font-size: 18px;
            font-weight: 600;
            margin: 0;
            color: #333;
        }

        .close-btn {
            background: none;
            border: none;
            color: #aaa;
            font-size: 20px;
            font-weight: bold;
            cursor: pointer;
            line-height: 1;
            transition: color 0.2s ease;
            padding: 0;
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .close-btn:hover {
            color: #333;
        }

        .dialog-body {
            padding: 20px;
            flex: 1;
            overflow-y: auto;
        }

        .current-status {
            background: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 20px;
        }

        .current-status h4 {
            margin: 0 0 12px 0;
            color: #495057;
            font-size: 16px;
        }

        .status-item {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #e9ecef;
        }

        .status-item:last-child {
            border-bottom: none;
        }

        .label {
            font-weight: 500;
            color: #6c757d;
        }

        .value {
            color: #007bff;
            font-weight: 600;
        }

        .mode-selection {
            margin-bottom: 20px;
        }

        .mode-selection h4 {
            margin: 0 0 12px 0;
            color: #495057;
            font-size: 16px;
        }

        .mode-buttons {
            display: flex;
            gap: 12px;
        }

        .mode-btn {
            flex: 1;
            padding: 16px;
            border: 2px solid #e1e5e9;
            border-radius: 8px;
            background: white;
            cursor: pointer;
            transition: all 0.2s;
            text-align: left;
        }

        .mode-btn:hover {
            border-color: #007bff;
            background: #f8f9ff;
        }

        .mode-btn.active {
            border-color: #007bff;
            background: #e3f2fd;
        }

        .mode-btn small {
            display: block;
            margin-top: 4px;
            color: #6c757d;
            font-size: 12px;
        }


        .dialog-footer {
            padding: 16px 20px;
            background: #f8f9fa;
            border-top: 1px solid #e0e0e0;
            flex-shrink: 0;
        }

        .status-message {
            font-size: 14px;
            padding: 8px 12px;
            border-radius: 6px;
            display: none;
            margin-bottom: 12px;
        }

        .status-message.success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
            display: block;
        }

        .status-message.error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
            display: block;
        }

        .status-message.info {
            background: #d1ecf1;
            color: #0c5460;
            border: 1px solid #bee5eb;
            display: block;
        }

        .dialog-actions {
            display: flex;
            gap: 12px;
            justify-content: flex-end;
        }

        .btn {
            padding: 10px 20px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s;
        }

        .btn-primary {
            background: #007bff;
            color: white;
        }

        .btn-primary:hover {
            background: #0056b3;
        }

        .btn-secondary {
            background: #6c757d;
            color: white;
        }

        .btn-secondary:hover {
            background: #545b62;
        }
    </style>
</head>

<body>
    <div class="dialog-container">
        <div class="dialog-header">
            <div class="dialog-title">🌐 Network Configuration</div>
            <button class="close-btn" id="closeBtn">&times;</button>
        </div>

        <div class="dialog-body">
            <div class="current-status">
                <h4>Current Status</h4>
                <div class="status-item">
                    <span class="label">Mode:</span>
                    <span class="value" id="current-mode">Loading...</span>
                </div>
                <div class="status-item">
                    <span class="label">IP Address:</span>
                    <span class="value" id="current-ip">Loading...</span>
                </div>
            </div>
            
            <div class="mode-selection">
                <h4>Network Mode Switch</h4>
                <div class="mode-buttons">
                    <button class="mode-btn local-btn" id="switch-local">
                        🏠 Local IP Mode
                        <small>Use 127.0.0.1 for local testing</small>
                    </button>
                    <button class="mode-btn public-btn" id="switch-public">
                        🌐 Public IP Mode
                        <small>Use your public IP for external testing</small>
                    </button>
                </div>
            </div>
        </div>

        <div class="dialog-footer">
            <div id="status-message" class="status-message"></div>
            <div class="dialog-actions">
                <button class="btn btn-secondary" id="close-btn-footer">Close</button>
            </div>
        </div>
    </div>

    <script>
        const { ipcRenderer } = require('electron');

        let currentConfig = null;

        document.addEventListener('DOMContentLoaded', async () => {
            try {
                // Get current configuration
                const configResult = await ipcRenderer.invoke('get-network-config');
                if (configResult.success) {
                    currentConfig = configResult.config;
                    updateUI();
                } else {
                    showMessage('Failed to load configuration: ' + configResult.error, 'error');
                }
            } catch (error) {
                showMessage('Error loading configuration: ' + error.message, 'error');
            }

            setupEventListeners();
        });

        function setupEventListeners() {
            // Close dialog
            document.getElementById('closeBtn').addEventListener('click', () => {
                window.close();
            });

            document.getElementById('close-btn-footer').addEventListener('click', () => {
                window.close();
            });

            // Mode switching - immediate effect
            document.getElementById('switch-local').addEventListener('click', async () => {
                await switchMode('local');
            });

            document.getElementById('switch-public').addEventListener('click', async () => {
                await switchMode('public');
            });
        }

        function updateUI() {
            if (!currentConfig) return;

            // Update current status
            document.getElementById('current-mode').textContent = 
                currentConfig.current_mode === 'public' ? '🌐 Public IP Mode' : '🏠 Local IP Mode';
            document.getElementById('current-ip').textContent = currentConfig.current_ip;

            // Update mode buttons
            const localBtn = document.getElementById('switch-local');
            const publicBtn = document.getElementById('switch-public');
            
            localBtn.classList.toggle('active', currentConfig.current_mode === 'local');
            publicBtn.classList.toggle('active', currentConfig.current_mode === 'public');
        }

        async function switchMode(mode) {
            try {
                showMessage(\`Switching to \${mode} IP mode...\`, 'info');

                let result;
                if (mode === 'local') {
                    result = await ipcRenderer.invoke('switch-to-local-mode');
                } else {
                    result = await ipcRenderer.invoke('switch-to-public-mode');
                }

                if (result.success) {
                    showMessage(\`✅ Successfully switched to \${mode} IP mode\`, 'success');
                    // Refresh configuration
                    const configResult = await ipcRenderer.invoke('get-network-config');
                    if (configResult.success) {
                        currentConfig = configResult.config;
                        updateUI();
                    }
                } else {
                    showMessage(\`❌ Failed to switch to \${mode} mode: \${result.error}\`, 'error');
                }
            } catch (error) {
                showMessage(\`❌ Error switching mode: \${error.message}\`, 'error');
            }
        }

        function showMessage(message, type = 'info') {
            const messageEl = document.getElementById('status-message');
            messageEl.textContent = message;
            messageEl.className = \`status-message \${type}\`;
            
            // Auto-hide success and info messages
            if (type === 'success' || type === 'info') {
                setTimeout(() => {
                    messageEl.className = 'status-message';
                }, 3000);
            }
        }
    </script>
</body>
</html>`;

        await this.dialogWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
    }

    // Setup event listeners
    setupEventListeners() {
        // Handle window close
        this.dialogWindow.on('closed', () => {
            this.cleanup();
        });

        // Handle window focus
        this.dialogWindow.on('focus', () => {
            console.log('🌐 Network config dialog focused');
        });

        // Handle window blur
        this.dialogWindow.on('blur', () => {
            console.log('🌐 Network config dialog blurred');
        });
    }

    // Start monitoring main window status
    startMainWindowMonitoring() {
        if (this.monitoringEnabled) return;

        this.monitoringEnabled = true;

        // Monitor main window status every 2 seconds
        this.mainWindowCheckInterval = setInterval(() => {
            this.checkMainWindowStatus();
        }, 2000);
    }

    // Check main window status
    checkMainWindowStatus() {
        if (!this.mainWindow || !this.dialogWindow) {
            return;
        }

        try {
            // Check if main window is destroyed
            if (this.mainWindow.isDestroyed()) {
                console.log('🌐 Main window destroyed, closing network config dialog');
                this.close();
                return;
            }

            // Check if main window is not visible (minimized or hidden)
            if (!this.mainWindow.isVisible()) {
                return;
            }

        } catch (error) {
            console.error('Error checking main window status:', error);
        }
    }

    // Cleanup resources
    cleanup() {
        console.log('🌐 Network config dialog cleanup');

        // Clear monitoring interval
        if (this.mainWindowCheckInterval) {
            clearInterval(this.mainWindowCheckInterval);
            this.mainWindowCheckInterval = null;
        }

        // Reset state
        this.monitoringEnabled = false;
        this.dialogWindow = null;
        this.mainWindow = null;
        this.currentConfig = null;
    }

    // Close dialog
    close() {
        if (this.dialogWindow && !this.dialogWindow.isDestroyed()) {
            this.dialogWindow.close();
        }
    }

    // Check if dialog is visible
    isVisible() {
        return this.dialogWindow && !this.dialogWindow.isDestroyed() && this.dialogWindow.isVisible();
    }
}

module.exports = NetworkConfigDialog;