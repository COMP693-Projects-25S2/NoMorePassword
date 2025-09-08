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
                    preload: path.join(__dirname, '../../pages/preload.js'),
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

            console.log('✅ Config modal created and shown successfully');

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
            <div class="config-option" id="switch-client">
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
            <div class="config-option" id="clear-local-users">
                <span class="config-option-icon">🗑️</span>
                <span class="config-option-text">Clear Local Users</span>
            </div>
            <div class="config-option" id="clear-user-activities">
                <span class="config-option-icon">📊</span>
                <span class="config-option-text">Clear My Activities</span>
            </div>
            <div class="config-option" id="exit-app">
                <span class="config-option-icon">🚪</span>
                <span class="config-option-text">Exit Application</span>
            </div>
        </div>
    </div>

    <script>
        const { ipcRenderer } = require('electron');

        document.addEventListener('DOMContentLoaded', () => {
            console.log('Configuration modal loaded');

            const closeBtn = document.getElementById('closeBtn');
            const switchClientBtn = document.getElementById('switch-client');
            const newUserBtn = document.getElementById('new-user');
            const switchUserBtn = document.getElementById('switch-user');
            const clearUsersBtn = document.getElementById('clear-local-users');
            const clearActivitiesBtn = document.getElementById('clear-user-activities');
            const exitAppBtn = document.getElementById('exit-app');

            // Handle close button click
            closeBtn.addEventListener('click', () => {
                console.log('Close button clicked');
                window.close();
            });

            // Handle switch client - directly switch to B-Client
            switchClientBtn.addEventListener('click', async () => {
                try {
                    console.log('🔄 C-Client: Switch button clicked, initiating switch to B-Client...');
                    const result = await ipcRenderer.invoke('switch-to-client', 'b-client');
                    console.log('🔄 C-Client: Switch result received:', result);
                    
                    if (result.success) {
                        console.log('✅ C-Client: Switching to B-Client successful, closing config modal...');
                    } else {
                        console.error('❌ C-Client: Failed to switch to B-Client:', result.error);
                        alert(\`Failed to switch to B-Client: \${result.error}\`);
                    }
                } catch (error) {
                    console.error('❌ C-Client: Error during switch to B-Client:', error);
                    alert(\`Error switching to B-Client: \${error.message}\`);
                }
                console.log('🔄 C-Client: Closing config modal window...');
                window.close();
            });

            // Handle new user
            newUserBtn.addEventListener('click', async () => {
                try {
                    const result = await ipcRenderer.invoke('open-user-registration');
                    if (result.success) {
                        console.log('User registration dialog opened successfully');
                    } else {
                        alert(\`Failed to open user registration dialog: \${result.error}\`);
                    }
                } catch (error) {
                    alert(\`Error opening user registration dialog: \${error.message}\`);
                }
                window.close();
            });

            // Handle switch user
            switchUserBtn.addEventListener('click', async () => {
                try {
                    const result = await ipcRenderer.invoke('open-user-selector');
                    if (result.success) {
                        console.log('User switched successfully');
                    } else if (result.cancelled) {
                        console.log('User selection cancelled');
                    } else {
                        alert(\`Failed to switch user: \${result.error}\`);
                    }
                } catch (error) {
                    alert(\`Error opening user selector: \${error.message}\`);
                }
                window.close();
            });

            // Handle clear local users
            clearUsersBtn.addEventListener('click', async () => {
                try {
                    const result = await ipcRenderer.invoke('clear-local-users');
                    if (result.success) {
                        alert(\`Successfully cleared \${result.changes} users from local_users table\`);
                    } else {
                        alert(\`Failed to clear local_users table: \${result.error}\`);
                    }
                } catch (error) {
                    alert(\`Error clearing local_users table: \${error.message}\`);
                }
                window.close();
            });

            // Handle clear user activities
            clearActivitiesBtn.addEventListener('click', async () => {
                try {
                    const result = await ipcRenderer.invoke('clear-current-user-activities');
                    if (result.success) {
                        alert(\`Successfully cleared \${result.changes} activities for current user\`);
                    } else {
                        alert(\`Failed to clear user activities: \${result.error}\`);
                    }
                } catch (error) {
                    alert(\`Error clearing user activities: \${error.message}\`);
                }
                window.close();
            });

            // Handle exit app
            exitAppBtn.addEventListener('click', async () => {
                try {
                    await ipcRenderer.invoke('exit-app');
                } catch (error) {
                    alert(\`Error exiting application: \${error.message}\`);
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
            console.log('Configuration modal window closed');
            this.cleanup();
        });

        // Handle window focus
        this.modalWindow.on('focus', () => {
            console.log('Configuration modal focused');
        });

        // Handle window blur
        this.modalWindow.on('blur', () => {
            console.log('Configuration modal blurred');
        });
    }

    startMainWindowMonitoring() {
        if (this.monitoringEnabled) return;

        this.monitoringEnabled = true;
        console.log('Starting main window monitoring for config modal');

        // Monitor main window status every 2 seconds (more frequent)
        this.mainWindowCheckInterval = setInterval(() => {
            this.checkMainWindowStatus();
        }, 2000);
    }

    checkMainWindowStatus() {
        if (!this.mainWindow || !this.modalWindow) {
            console.log('Config modal: mainWindow or modalWindow not available');
            return;
        }

        try {
            // Check if main window is destroyed
            if (this.mainWindow.isDestroyed()) {
                console.log('Main window destroyed, closing config modal');
                this.close();
                return;
            }

            // Check if main window is not visible (minimized or hidden)
            if (!this.mainWindow.isVisible()) {
                console.log('Main window not visible, but keeping config modal open');
                return;
            }

            // Log status check (every 10th check to avoid spam)
            if (Math.random() < 0.1) {
                console.log('Config modal: main window status check - visible and not destroyed');
            }

        } catch (error) {
            console.error('Error checking main window status:', error);
        }
    }

    cleanup() {
        console.log('Cleaning up config modal resources');

        // Clear monitoring interval
        if (this.mainWindowCheckInterval) {
            clearInterval(this.mainWindowCheckInterval);
            this.mainWindowCheckInterval = null;
        }

        // Reset state
        this.monitoringEnabled = false;
        this.modalWindow = null;
        this.mainWindow = null;

        console.log('Config modal cleanup completed');
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
