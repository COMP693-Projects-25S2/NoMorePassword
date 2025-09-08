const { BrowserWindow, screen } = require('electron');
const path = require('path');

class ClientSelectorModal {
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

            // Calculate modal position (center of main window)
            const mainBounds = mainWindow.getBounds();
            const modalWidth = 400;
            const modalHeight = 300;

            // Position modal at center of main window
            const x = mainBounds.x + (mainBounds.width - modalWidth) / 2;
            const y = mainBounds.y + (mainBounds.height - modalHeight) / 2;

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
                alwaysOnTop: true,
                skipTaskbar: false,
                show: false,
                frame: false,
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

            console.log('✅ Client selector modal created and shown successfully');

        } catch (error) {
            console.error('Error creating client selector modal:', error);
            throw error;
        }
    }

    async loadHTMLContent() {
        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Select Client Type</title>
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
            padding: 20px;
            border-bottom: 1px solid #e0e0e0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
        }

        .modal-title {
            font-size: 18px;
            font-weight: 600;
            margin: 0;
            color: #333;
        }

        .close-btn {
            background: none;
            border: none;
            color: #aaa;
            font-size: 24px;
            font-weight: bold;
            cursor: pointer;
            line-height: 1;
            transition: color 0.2s ease;
            padding: 0;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .close-btn:hover {
            color: #333;
        }

        .modal-body {
            padding: 30px 20px;
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
        }

        .client-option {
            width: 100%;
            max-width: 300px;
            padding: 20px;
            margin: 10px 0;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s ease;
            text-align: center;
            background: white;
        }

        .client-option:hover {
            border-color: #007bff;
            background: #f8f9fa;
        }

        .client-option.selected {
            border-color: #007bff;
            background: #e3f2fd;
        }

        .client-icon {
            font-size: 32px;
            margin-bottom: 10px;
        }

        .client-name {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 5px;
            color: #333;
        }

        .client-description {
            font-size: 12px;
            color: #666;
            line-height: 1.4;
        }

        .switch-btn {
            width: 100%;
            max-width: 300px;
            padding: 12px;
            margin-top: 20px;
            background: #007bff;
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: background-color 0.2s ease;
        }

        .switch-btn:hover {
            background: #0056b3;
        }

        .switch-btn:disabled {
            background: #ccc;
            cursor: not-allowed;
        }
    </style>
</head>

<body>
    <div class="modal-container">
        <div class="modal-header">
            <div class="modal-title">Switch Client Type</div>
            <button class="close-btn" id="closeBtn">&times;</button>
        </div>

        <div class="modal-body">
            <div class="client-option" id="c-client-option">
                <div class="client-icon">👤</div>
                <div class="client-name">Consumer Client</div>
                <div class="client-description">Standard browsing experience with basic features</div>
            </div>
            
            <div class="client-option" id="b-client-option">
                <div class="client-icon">🏢</div>
                <div class="client-name">Enterprise Client</div>
                <div class="client-description">Advanced features for business users with enhanced analytics</div>
            </div>

            <button class="switch-btn" id="switchBtn" disabled>Select Client Type</button>
        </div>
    </div>

    <script>
        const { ipcRenderer } = require('electron');

        let selectedClient = null;

        document.addEventListener('DOMContentLoaded', () => {

            const closeBtn = document.getElementById('closeBtn');
            const cClientOption = document.getElementById('c-client-option');
            const bClientOption = document.getElementById('b-client-option');
            const switchBtn = document.getElementById('switchBtn');

            // Handle close button click
            closeBtn.addEventListener('click', () => {
                window.close();
            });

            // Handle client option selection
            cClientOption.addEventListener('click', () => {
                selectClient('c-client');
            });

            bClientOption.addEventListener('click', () => {
                selectClient('b-client');
            });

            // Handle switch button click
            switchBtn.addEventListener('click', async () => {
                if (!selectedClient) return;

                try {
                    const result = await ipcRenderer.invoke('switch-to-client', selectedClient);
                    if (result.success) {
                    } else {
                        alert(\`Failed to switch client: \${result.error}\`);
                    }
                } catch (error) {
                    alert(\`Error switching client: \${error.message}\`);
                }
                window.close();
            });

            function selectClient(clientType) {
                // Remove previous selection
                cClientOption.classList.remove('selected');
                bClientOption.classList.remove('selected');

                // Add selection to clicked option
                if (clientType === 'c-client') {
                    cClientOption.classList.add('selected');
                } else {
                    bClientOption.classList.add('selected');
                }

                selectedClient = clientType;
                switchBtn.disabled = false;
                switchBtn.textContent = \`Switch to \${clientType === 'c-client' ? 'Consumer' : 'Enterprise'} Client\`;
            }
        });
    </script>
</body>
</html>`;

        await this.modalWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
    }

    setupEventListeners() {
        // Handle window close
        this.modalWindow.on('closed', () => {
            console.log('Client selector modal window closed');
            this.cleanup();
        });

        // Handle window focus
        this.modalWindow.on('focus', () => {
            console.log('Client selector modal focused');
        });

        // Handle window blur
        this.modalWindow.on('blur', () => {
            console.log('Client selector modal blurred');
        });
    }

    startMainWindowMonitoring() {
        if (this.monitoringEnabled) return;

        this.monitoringEnabled = true;
        console.log('Starting main window monitoring for client selector modal');

        // Monitor main window status every 2 seconds
        this.mainWindowCheckInterval = setInterval(() => {
            this.checkMainWindowStatus();
        }, 2000);
    }

    checkMainWindowStatus() {
        if (!this.mainWindow || !this.modalWindow) {
            console.log('Client selector modal: mainWindow or modalWindow not available');
            return;
        }

        try {
            // Check if main window is destroyed
            if (this.mainWindow.isDestroyed()) {
                console.log('Main window destroyed, closing client selector modal');
                this.close();
                return;
            }

            // Check if main window is not visible (minimized or hidden)
            if (!this.mainWindow.isVisible()) {
                console.log('Main window not visible, but keeping client selector modal open');
                return;
            }

        } catch (error) {
            console.error('Error checking main window status:', error);
        }
    }

    cleanup() {
        console.log('Cleaning up client selector modal resources');

        // Clear monitoring interval
        if (this.mainWindowCheckInterval) {
            clearInterval(this.mainWindowCheckInterval);
            this.mainWindowCheckInterval = null;
        }

        // Reset state
        this.monitoringEnabled = false;
        this.modalWindow = null;
        this.mainWindow = null;

        console.log('Client selector modal cleanup completed');
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

module.exports = ClientSelectorModal;
