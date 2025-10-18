const { BrowserWindow, screen } = require('electron');
const path = require('path');

class ConfigModal {
    constructor() {
        this.modalWindow = null;
        this.mainWindow = null;
        this.monitoringEnabled = false;
        this.mainWindowCheckInterval = null;
    }

    async show(mainWindow) {
        try {
            this.mainWindow = mainWindow;

            // Check if modal already exists
            if (this.modalWindow && !this.modalWindow.isDestroyed()) {
                this.modalWindow.focus();
                return;
            }

            // Get display info for positioning
            const displays = screen.getAllDisplays();
            const primaryDisplay = displays.find(d => d.id === screen.getPrimaryDisplay().id) || displays[0];
            const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

            // Calculate modal position (top-left of main window)
            const mainBounds = mainWindow.getBounds();
            const modalWidth = 280;
            const modalHeight = 360; // Increased height for client switching option

            // Position modal at top-left of main window content area (below toolbar and tabs)
            const x = mainBounds.x + 20; // 20px from left edge
            const y = mainBounds.y + 86; // 86px from top (toolbar height + tabs height)

            // Ensure modal is within screen bounds
            const finalX = Math.max(0, Math.min(x, screenWidth - modalWidth - 20));
            const finalY = Math.max(0, Math.min(y, screenHeight - modalHeight - 20));

            // Create modal window
            this.modalWindow = new BrowserWindow({
                width: modalWidth,
                height: modalHeight,
                x: finalX,
                y: finalY,
                resizable: false,
                minimizable: false,
                maximizable: false,
                fullscreenable: false,
                alwaysOnTop: false,
                skipTaskbar: false,
                show: false,
                frame: false, // Remove frame to hide toolbar
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
            this.modalWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

            // Load HTML content
            await this.loadHTMLContent();

            // Show window after content is loaded
            this.modalWindow.show();
            this.modalWindow.focus();

            // Setup event listeners
            this.setupEventListeners();

            // Start monitoring main window
            this.startMainWindowMonitoring();

            // Config modal created and shown successfully

        } catch (error) {
            console.error('Error creating config modal:', error);
            throw error;
        }
    }

    async loadHTMLContent() {
        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Configuration Options</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 0;
            background: white;
            color: #333;
            overflow: hidden;
        }

        .modal-container {
            width: 100%;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }

        .modal-header {
            background: linear-gradient(to bottom, #f8f9fa, #e9ecef);
            padding: 16px 20px 12px 20px;
            border-bottom: 1px solid #e0e0e0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
        }

        .modal-title {
            font-size: 16px;
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

        .modal-body {
            padding: 12px 0;
            flex: 1;
            overflow-y: auto;
        }

        .config-option {
            display: flex;
            align-items: center;
            padding: 12px 20px;
            cursor: pointer;
            transition: background-color 0.2s ease;
            border-bottom: 1px solid #f0f0f0;
        }

        .config-option:last-child {
            border-bottom: none;
        }

        .config-option:hover {
            background-color: #f8f9fa;
        }

        .config-option:active {
            background-color: #e9ecef;
        }

        .config-option-icon {
            font-size: 18px;
            margin-right: 14px;
            width: 20px;
            text-align: center;
        }

        .config-option-text {
            font-size: 13px;
            color: #333;
            font-weight: 500;
        }
    </style>
</head>

<body>
    <div class="modal-container">
        <div class="modal-header">
            <div class="modal-title">Configuration Options</div>
            <button class="close-btn" id="closeBtn">&times;</button>
        </div>

        <div class="modal-body">
            <div class="config-option" id="network-config" style="display: none;">
                <span class="config-option-icon">🌐</span>
                <span class="config-option-text">Network Configuration</span>
            </div>
            <div class="config-option" id="node-status" style="display: none;">
                <span class="config-option-icon">📊</span>
                <span class="config-option-text">Node Status</span>
            </div>
            <div class="config-option" id="check-sync-data">
                <span class="config-option-icon">📈</span>
                <span class="config-option-text">Check Sync Data</span>
            </div>
            <div class="config-option" id="b-client-config" style="display: none;">
                <span class="config-option-icon">🔗</span>
                <span class="config-option-text">B-Client Configuration</span>
            </div>
            <div class="config-option" id="switch-client" style="display: none;">
                <span class="config-option-icon">🔄</span>
                <span class="config-option-text">Switch to B-Client</span>
            </div>
            <div class="config-option" id="new-user">
                <span class="config-option-icon">➕</span>
                <span class="config-option-text">New User</span>
            </div>
            <div class="config-option" id="switch-user">
                <span class="config-option-icon">👤</span>
                <span class="config-option-text">Switch User</span>
            </div>
            <div class="config-option" id="login-another-device">
                <span class="config-option-icon">📱</span>
                <span class="config-option-text">Login in Another Device</span>
            </div>
            <div class="config-option" id="node-test" style="display: none;">
                <span class="config-option-icon">🧪</span>
                <span class="config-option-text">Node Test</span>
            </div>
            <div class="config-option" id="exit-app" style="display: none;">
                <span class="config-option-icon">🚪</span>
                <span class="config-option-text">Exit Application</span>
            </div>
        </div>
    </div>

    <script>
        const { ipcRenderer } = require('electron');

        document.addEventListener('DOMContentLoaded', () => {

            const closeBtn = document.getElementById('closeBtn');
            const networkConfigBtn = document.getElementById('network-config');
            const nodeStatusBtn = document.getElementById('node-status');
            const bClientConfigBtn = document.getElementById('b-client-config');
            const switchClientBtn = document.getElementById('switch-client');
            const newUserBtn = document.getElementById('new-user');
            const switchUserBtn = document.getElementById('switch-user');
            const loginAnotherDeviceBtn = document.getElementById('login-another-device');
            const nodeTestBtn = document.getElementById('node-test');
            const exitAppBtn = document.getElementById('exit-app');

            // Handle close button click
            closeBtn.addEventListener('click', () => {
                window.close();
            });

            // Handle network configuration button click
            networkConfigBtn.addEventListener('click', async () => {
                try {
                    console.log('🌐 Network Configuration button clicked');
                    const result = await ipcRenderer.invoke('open-network-config');
                    console.log('🌐 Network Configuration IPC result:', result);
                    if (!result.success) {
                        console.error('Failed to open network config:', result.error);
                    }
                } catch (error) {
                    console.error('Error opening network config:', error);
                }
                window.close();
            });

            // Handle node status button click
            nodeStatusBtn.addEventListener('click', async () => {
                try {
                    console.log('🔍 Node Status button clicked');
                    const result = await ipcRenderer.invoke('open-node-status-modal');
                    console.log('🔍 Node Status IPC result:', result);
                    if (!result.success) {
                        console.error('Failed to open node status modal:', result.error);
                    }
                } catch (error) {
                    console.error('Error opening node status modal:', error);
                }
            });

            // Handle check sync data button click
            const checkSyncDataBtn = document.getElementById('check-sync-data');
            checkSyncDataBtn.addEventListener('click', async () => {
                try {
                    console.log('📈 Check Sync Data button clicked');
                    const result = await ipcRenderer.invoke('open-sync-data-viewer');
                    console.log('📈 Check Sync Data IPC result:', result);
                    if (!result.success) {
                        console.error('Failed to open sync data viewer:', result.error);
                        alert('Failed to open sync data viewer: ' + result.error);
                    }
                } catch (error) {
                    console.error('Error opening sync data viewer:', error);
                    alert('Error opening sync data viewer: ' + error.message);
                }
                window.close();
            });

            // Handle B-Client configuration button click
            bClientConfigBtn.addEventListener('click', async () => {
                try {
                    console.log('🔗 B-Client Configuration button clicked');
                    const result = await ipcRenderer.invoke('show-b-client-config');
                    console.log('🔗 B-Client Configuration IPC result:', result);
                    if (!result.success) {
                        console.error('Failed to open B-Client config:', result.error);
                    }
                } catch (error) {
                    console.error('Error opening B-Client config:', error);
                }
                window.close();
            });

            // Handle switch client - directly switch to B-Client
            switchClientBtn.addEventListener('click', async () => {
                try {
                    const result = await ipcRenderer.invoke('switch-to-client', 'b-client');
                    
                    if (result.success) {
                        // Switching to B-Client successful
                    } else {
                        console.error('❌ C-Client: Failed to switch to B-Client:', result.error);
                        alert('Failed to switch to B-Client: ' + result.error);
                    }
                } catch (error) {
                    console.error('❌ C-Client: Error during switch to B-Client:', error);
                    alert('Error switching to B-Client: ' + error.message);
                }
                window.close();
            });

            // Handle new user
            newUserBtn.addEventListener('click', async () => {
                try {
                    const result = await ipcRenderer.invoke('open-user-registration');
                    if (result.success) {
                        // User registration dialog opened successfully
                    } else {
                        alert('Failed to open user registration dialog: ' + result.error);
                    }
                } catch (error) {
                    alert('Error opening user registration dialog: ' + error.message);
                }
                window.close();
            });

            // Handle switch user
            switchUserBtn.addEventListener('click', async () => {
                try {
                    const result = await ipcRenderer.invoke('open-user-selector');
                    if (result.success) {
                        // User switched successfully
                    } else if (result.cancelled) {
                        // User selection cancelled
                    } else {
                        alert('Failed to switch user: ' + result.error);
                    }
                } catch (error) {
                    alert('Error opening user selector: ' + error.message);
                }
                window.close();
            });

            // Handle login in another device
            loginAnotherDeviceBtn.addEventListener('click', async () => {
                try {
                    console.log('📱 Login in Another Device button clicked');
                    const result = await ipcRenderer.invoke('request-security-code');
                    
                    if (result.success) {
                        // Show security code in custom dialog
                        await ipcRenderer.invoke('show-security-code-dialog', {
                            code: result.security_code
                        });
                    } else {
                        // Show error with clickable links in custom dialog
                        const errorMessage = result.error || 'Failed to get security code';
                        const localUrl = result.localUrl;
                        const productionUrl = result.productionUrl;
                        
                        if (localUrl && productionUrl) {
                            // Use IPC to open custom error dialog with both URLs
                            await ipcRenderer.invoke('show-error-dialog', {
                                message: errorMessage,
                                localUrl: localUrl,
                                productionUrl: productionUrl
                            });
                        } else {
                            alert(errorMessage);
                        }
                    }
                } catch (error) {
                    console.error('Error requesting security code:', error);
                    alert('Error: ' + error.message);
                }
                window.close();
            });

            // Handle node test
            nodeTestBtn.addEventListener('click', async () => {
                try {
                    const confirmed = confirm('🧪 Generate unique node_id for users (except the first user)?');
                    
                    if (confirmed) {
                        const result = await ipcRenderer.invoke('node-test-unique-ids');
                        
                        if (result.success) {
                            alert('Success! Updated ' + result.count + ' users (first user kept unchanged)');
                        } else {
                            alert('Failed: ' + result.error);
                        }
                    }
                } catch (error) {
                    alert('Error: ' + error.message);
                }
                window.close();
            });

            // Handle exit app
            exitAppBtn.addEventListener('click', async () => {
                try {
                    await ipcRenderer.invoke('exit-app');
                } catch (error) {
                    alert('Error exiting application: ' + error.message);
                }
                window.close();
            });
        });
    </script>
</body>
</html>`;

        await this.modalWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
    }

    setupEventListeners() {
        // Handle window close
        this.modalWindow.on('closed', () => {
            this.cleanup();
        });

        // Handle window focus
        this.modalWindow.on('focus', () => {
            // Configuration modal focused
        });

        // Handle window blur
        this.modalWindow.on('blur', () => {
            // Configuration modal blurred
        });
    }

    startMainWindowMonitoring() {
        if (this.monitoringEnabled) return;

        this.monitoringEnabled = true;

        // Monitor main window status every 2 seconds (more frequent)
        this.mainWindowCheckInterval = setInterval(() => {
            this.checkMainWindowStatus();
        }, 2000);
    }

    checkMainWindowStatus() {
        if (!this.mainWindow || !this.modalWindow) {
            return;
        }

        try {
            // Check if main window is destroyed
            if (this.mainWindow.isDestroyed()) {
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

    cleanup() {
        // Cleaning up config modal resources

        // Clear monitoring interval
        if (this.mainWindowCheckInterval) {
            clearInterval(this.mainWindowCheckInterval);
            this.mainWindowCheckInterval = null;
        }

        // Reset state
        this.monitoringEnabled = false;
        this.modalWindow = null;
        this.mainWindow = null;

        // Config modal cleanup completed
    }

    close() {
        if (this.modalWindow && !this.modalWindow.isDestroyed()) {
            this.modalWindow.close();
        }
    }

    isVisible() {
        return this.modalWindow && !this.modalWindow.isDestroyed() && this.modalWindow.isVisible();
    }
}

module.exports = ConfigModal;