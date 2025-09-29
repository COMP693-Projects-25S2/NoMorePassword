const { BrowserWindow, ipcMain } = require('electron');
const BClientConfigManager = require('./bClientConfigManager');

class BClientConfigModal {
    constructor(mainWindow) {
        this.mainWindow = mainWindow;
        this.configManager = new BClientConfigManager();
        this.setupIpcHandlers();
    }

    setupIpcHandlers() {
        // Get current configuration
        ipcMain.handle('b-client-config:get', () => {
            return {
                currentEnvironment: this.configManager.getCurrentEnvironment(),
                environments: this.configManager.getAvailableEnvironments(),
                environmentConfigs: this.configManager.config.b_client_environment,
                webSocketConfig: this.configManager.config.b_client_websocket
            };
        });

        // Set current environment
        ipcMain.handle('b-client-config:set-environment', (event, environment) => {
            this.configManager.setCurrentEnvironment(environment);
            return { success: true, currentEnvironment: environment };
        });

        // Update environment configuration
        ipcMain.handle('b-client-config:update-environment', (event, environment, config) => {
            this.configManager.updateEnvironmentConfig(environment, config);
            return { success: true };
        });

        // Update WebSocket configuration
        ipcMain.handle('b-client-config:update-websocket', (event, config) => {
            this.configManager.updateWebSocketConfig(config);
            return { success: true };
        });

        // Show configuration modal
        ipcMain.handle('b-client-config:show-modal', () => {
            this.showConfigModal();
        });
    }

    showConfigModal() {
        const configWindow = new BrowserWindow({
            width: 600,
            height: 500,
            parent: this.mainWindow,
            modal: true,
            resizable: false,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });

        const htmlContent = this.getConfigModalHTML();
        configWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

        // Handle window close
        configWindow.on('closed', () => {
            // Notify main window that config might have changed
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('b-client-config:updated');
            }
        });
    }

    getConfigModalHTML() {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>B-Client Configuration</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f5f5f5;
        }
        .config-container {
            background: white;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .config-header {
            border-bottom: 1px solid #eee;
            padding-bottom: 15px;
            margin-bottom: 20px;
        }
        .config-header h2 {
            margin: 0;
            color: #333;
        }
        .config-section {
            margin-bottom: 25px;
        }
        .config-section h3 {
            margin: 0 0 15px 0;
            color: #555;
            font-size: 16px;
        }
        .form-group {
            margin-bottom: 15px;
        }
        .form-group label {
            display: block;
            margin-bottom: 5px;
            font-weight: 500;
            color: #333;
        }
        .form-group input, .form-group select {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
            box-sizing: border-box;
        }
        .form-group input:focus, .form-group select:focus {
            outline: none;
            border-color: #007AFF;
        }
        .radio-group {
            display: flex;
            gap: 20px;
        }
        .radio-option {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .radio-option input[type="radio"] {
            width: auto;
        }
        .button-group {
            display: flex;
            gap: 10px;
            justify-content: flex-end;
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid #eee;
        }
        .btn {
            padding: 10px 20px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
        }
        .btn-primary {
            background: #007AFF;
            color: white;
        }
        .btn-secondary {
            background: #f0f0f0;
            color: #333;
        }
        .btn:hover {
            opacity: 0.9;
        }
        .status {
            padding: 10px;
            border-radius: 4px;
            margin-bottom: 15px;
            display: none;
        }
        .status.success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        .status.error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
    </style>
</head>
<body>
    <div class="config-container">
        <div class="config-header">
            <h2>B-Client Configuration</h2>
        </div>
        
        <div id="status" class="status"></div>
        
        <div class="config-section">
            <h3>Environment Selection</h3>
            <div class="form-group">
                <div class="radio-group">
                    <div class="radio-option">
                        <input type="radio" id="env-local" name="environment" value="local">
                        <label for="env-local">Local B-Client</label>
                    </div>
                    <div class="radio-option">
                        <input type="radio" id="env-production" name="environment" value="production">
                        <label for="env-production">Production B-Client</label>
                    </div>
                </div>
            </div>
        </div>

        <div class="config-section">
            <h3>Connection Settings</h3>
            <div class="form-group">
                <label for="host">Host:</label>
                <input type="text" id="host" placeholder="B-Client host address">
            </div>
            <div class="form-group">
                <label for="port">Port:</label>
                <input type="number" id="port" placeholder="8766">
            </div>
        </div>

        <div class="config-section">
            <h3>WebSocket Settings</h3>
            <div class="form-group">
                <div class="radio-option">
                    <input type="checkbox" id="enabled" checked>
                    <label for="enabled">Enable WebSocket Connection</label>
                </div>
            </div>
            <div class="form-group">
                <div class="radio-option">
                    <input type="checkbox" id="autoReconnect" checked>
                    <label for="autoReconnect">Auto Reconnect</label>
                </div>
            </div>
            <div class="form-group">
                <label for="reconnectInterval">Reconnect Interval (seconds):</label>
                <input type="number" id="reconnectInterval" value="30" min="5" max="300">
            </div>
        </div>

        <div class="button-group">
            <button class="btn btn-secondary" onclick="closeWindow()">Cancel</button>
            <button class="btn btn-primary" onclick="saveConfig()">Save Configuration</button>
        </div>
    </div>

    <script>
        const { ipcRenderer } = require('electron');
        
        let currentConfig = null;
        
        // Load configuration on startup
        async function loadConfig() {
            try {
                currentConfig = await ipcRenderer.invoke('b-client-config:get');
                updateUI();
            } catch (error) {
                showStatus('Error loading configuration', 'error');
            }
        }
        
        function updateUI() {
            if (!currentConfig) return;
            
            // Set environment
            document.querySelector(\`input[name="environment"][value="\${currentConfig.currentEnvironment}"]\`).checked = true;
            
            // Set connection settings based on current environment
            const envConfig = currentConfig.environmentConfigs[currentConfig.currentEnvironment];
            if (envConfig) {
                document.getElementById('host').value = envConfig.host || '';
                document.getElementById('port').value = envConfig.port || 8766;
            }
            
            // Set WebSocket settings
            const wsConfig = currentConfig.webSocketConfig;
            if (wsConfig) {
                document.getElementById('enabled').checked = wsConfig.enabled !== false;
                document.getElementById('autoReconnect').checked = wsConfig.auto_reconnect !== false;
                document.getElementById('reconnectInterval').value = wsConfig.reconnect_interval || 30;
            }
        }
        
        // Handle environment change
        document.querySelectorAll('input[name="environment"]').forEach(radio => {
            radio.addEventListener('change', function() {
                if (this.checked && currentConfig) {
                    const envConfig = currentConfig.environmentConfigs[this.value];
                    if (envConfig) {
                        document.getElementById('host').value = envConfig.host || '';
                        document.getElementById('port').value = envConfig.port || 8766;
                    }
                }
            });
        });
        
        async function saveConfig() {
            try {
                const environment = document.querySelector('input[name="environment"]:checked').value;
                const host = document.getElementById('host').value;
                const port = parseInt(document.getElementById('port').value);
                const enabled = document.getElementById('enabled').checked;
                const autoReconnect = document.getElementById('autoReconnect').checked;
                const reconnectInterval = parseInt(document.getElementById('reconnectInterval').value);
                
                // Update environment configuration
                await ipcRenderer.invoke('b-client-config:update-environment', environment, {
                    host: host,
                    port: port
                });
                
                // Update WebSocket configuration
                await ipcRenderer.invoke('b-client-config:update-websocket', {
                    enabled: enabled,
                    auto_reconnect: autoReconnect,
                    reconnect_interval: reconnectInterval
                });
                
                // Set current environment
                await ipcRenderer.invoke('b-client-config:set-environment', environment);
                
                showStatus('Configuration saved successfully!', 'success');
                
                // Close window after a short delay
                setTimeout(() => {
                    closeWindow();
                }, 1500);
                
            } catch (error) {
                showStatus('Error saving configuration: ' + error.message, 'error');
            }
        }
        
        function showStatus(message, type) {
            const status = document.getElementById('status');
            status.textContent = message;
            status.className = \`status \${type}\`;
            status.style.display = 'block';
            
            if (type === 'success') {
                setTimeout(() => {
                    status.style.display = 'none';
                }, 3000);
            }
        }
        
        function closeWindow() {
            window.close();
        }
        
        // Load configuration when page loads
        loadConfig();
    </script>
</body>
</html>
        `;
    }
}

module.exports = BClientConfigModal;
