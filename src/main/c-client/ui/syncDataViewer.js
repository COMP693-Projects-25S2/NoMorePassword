/**
 * SyncData Viewer Modal
 * Display all data from sync_data table
 */

const { BrowserWindow, screen } = require('electron');
const path = require('path');

class SyncDataViewer {
    constructor() {
        this.modalWindow = null;
        this.mainWindow = null;
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

            // Calculate modal position (center of screen)
            const modalWidth = 800;
            const modalHeight = 600;
            const x = Math.round((screenWidth - modalWidth) / 2);
            const y = Math.round((screenHeight - modalHeight) / 2);

            // Create modal window
            this.modalWindow = new BrowserWindow({
                width: modalWidth,
                height: modalHeight,
                x: x,
                y: y,
                resizable: true,
                minimizable: true,
                maximizable: true,
                fullscreenable: false,
                alwaysOnTop: false,
                modal: false, // Set to false to avoid blocking main window
                parent: mainWindow,
                webPreferences: {
                    nodeIntegration: true,
                    contextIsolation: false
                }
            });

            // Auto-close when main window closes
            if (mainWindow) {
                const mainWindowCloseHandler = () => {
                    if (this.modalWindow && !this.modalWindow.isDestroyed()) {
                        console.log('📈 Main window closing, auto-closing sync data viewer');
                        this.modalWindow.close();
                    }
                };

                mainWindow.once('close', mainWindowCloseHandler);

                // Clean up listener when modal is closed
                this.modalWindow.once('closed', () => {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.removeListener('close', mainWindowCloseHandler);
                    }
                });
            }

            // Load HTML content
            await this.loadHTMLContent();

            // Show the modal
            this.modalWindow.show();

            // Config modal created and shown successfully

        } catch (error) {
            console.error('Error creating sync data viewer modal:', error);
            throw error;
        }
    }

    async loadHTMLContent() {
        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Sync Data Viewer</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 0;
            background: #f5f5f5;
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
            font-size: 18px;
            font-weight: 600;
            margin: 0;
            color: #333;
        }


        .modal-body {
            padding: 20px;
            flex: 1;
            overflow-y: auto;
        }

        .loading {
            text-align: center;
            padding: 40px;
            color: #666;
        }

        .error {
            background: #fee;
            color: #c33;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            border: 1px solid #fcc;
        }

        .data-container {
            background: white;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .data-item {
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            margin-bottom: 15px;
            padding: 15px;
            background: #fafafa;
        }

        .data-item:last-child {
            margin-bottom: 0;
        }

        .data-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }

        .data-id {
            font-weight: 600;
            color: #333;
        }

        .data-direction {
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
        }

        .direction-outgoing {
            background: #e3f2fd;
            color: #1976d2;
        }

        .direction-incoming {
            background: #f3e5f5;
            color: #7b1fa2;
        }

        .data-details {
            font-size: 13px;
            color: #666;
            line-height: 1.4;
        }

        .data-field {
            margin-bottom: 5px;
        }

        .data-field strong {
            color: #333;
        }

        .empty-state {
            text-align: center;
            padding: 40px;
            color: #666;
        }

        .sync-btn {
            background: #28a745;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            margin-left: 10px;
        }

        .sync-btn:hover {
            background: #1e7e34;
        }

        .sync-btn:disabled {
            background: #6c757d;
            cursor: not-allowed;
        }

        .refresh-btn {
            background: #007bff;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            margin-left: 10px;
        }

        .refresh-btn:hover {
            background: #0056b3;
        }
    </style>
</head>

<body>
    <div class="modal-container">
        <div class="modal-header">
            <div class="modal-title">📊 Sync Data Viewer</div>
            <div>
                <button class="sync-btn" id="syncBtn">📤 Manual Sync</button>
                <button class="refresh-btn" id="refreshBtn">🔄 Refresh</button>
            </div>
        </div>

        <div class="modal-body">
            <div id="content">
                <div class="loading">Loading sync data...</div>
            </div>
        </div>
    </div>

    <script>
        const { ipcRenderer } = require('electron');
        
        let currentData = [];

        // DOM elements
        const content = document.getElementById('content');
        const syncBtn = document.getElementById('syncBtn');
        const refreshBtn = document.getElementById('refreshBtn');

        // Event listeners
        refreshBtn.addEventListener('click', () => {
            loadSyncData();
        });

        syncBtn.addEventListener('click', async () => {
            await performManualSync();
        });

        // Load sync data
        async function loadSyncData() {
            try {
                content.innerHTML = '<div class="loading">Loading sync data...</div>';
                
                const result = await ipcRenderer.invoke('get-sync-data');
                
                if (result.success) {
                    currentData = result.data || [];
                    displaySyncData(currentData);
                } else {
                    content.innerHTML = \`
                        <div class="error">
                            <strong>Error loading sync data:</strong> \${result.error}
                        </div>
                    \`;
                }
            } catch (error) {
                content.innerHTML = \`
                    <div class="error">
                        <strong>Error loading sync data:</strong> \${error.message}
                    </div>
                \`;
            }
        }

        // Display sync data
        function displaySyncData(data) {
            if (!data || data.length === 0) {
                content.innerHTML = \`
                    <div class="empty-state">
                        <h3>No sync data found</h3>
                        <p>No synchronization data has been recorded yet.</p>
                    </div>
                \`;
                return;
            }

            const html = \`
                <div class="data-container">
                    <h3>Sync Data Records (\${data.length} total)</h3>
                    \${data.map(item => \`
                        <div class="data-item">
                            <div class="data-header">
                                <span class="data-id">ID: \${item.id}</span>
                                <span class="data-direction direction-\${item.direction}">\${item.direction}</span>
                            </div>
                            <div class="data-details">
                                <div class="data-field"><strong>User ID:</strong> \${item.user_id || 'N/A'}</div>
                                <div class="data-field"><strong>Batch ID:</strong> \${item.batch_id || 'N/A'}</div>
                                <div class="data-field"><strong>Created:</strong> \${new Date(item.created_at).toLocaleString()}</div>
                                <div class="data-field"><strong>Activities Count:</strong> \${item.activities_count || 0}</div>
                                \${item.description ? \`<div class="data-field"><strong>Description:</strong> \${item.description}</div>\` : ''}
                            </div>
                        </div>
                    \`).join('')}
                </div>
            \`;

            content.innerHTML = html;
        }

        // Perform manual sync
        async function performManualSync() {
            try {
                // Disable sync button to prevent multiple clicks
                syncBtn.disabled = true;
                syncBtn.textContent = '⏳ Syncing...';
                
                content.innerHTML = '<div class="loading">🔄 Performing manual sync...</div>';
                
                const result = await ipcRenderer.invoke('manual-sync-activities');
                
                if (result.success) {
                    const syncInfo = result.data;
                    content.innerHTML = \`
                        <div class="data-container">
                            <h3>✅ Manual Sync Completed</h3>
                            <div class="data-item">
                                <div class="data-details">
                                    <div class="data-field"><strong>Activities Synced:</strong> \${syncInfo.activitiesCount || 0}</div>
                                    <div class="data-field"><strong>Batch ID:</strong> \${syncInfo.batchId || 'N/A'}</div>
                                    <div class="data-field"><strong>Timestamp:</strong> \${new Date().toLocaleString()}</div>
                                    <div class="data-field"><strong>Status:</strong> \${syncInfo.message || 'Success'}</div>
                                </div>
                            </div>
                            <p style="margin-top: 20px; color: #666;">
                                Sync completed successfully. Click "Refresh" to see updated sync data.
                            </p>
                        </div>
                    \`;
                } else {
                    content.innerHTML = \`
                        <div class="error">
                            <strong>Manual sync failed:</strong> \${result.error}
                        </div>
                    \`;
                }
            } catch (error) {
                content.innerHTML = \`
                    <div class="error">
                        <strong>Error during manual sync:</strong> \${error.message}
                    </div>
                \`;
            } finally {
                // Re-enable sync button
                syncBtn.disabled = false;
                syncBtn.textContent = '📤 Manual Sync';
            }
        }

        // Load data on page load
        document.addEventListener('DOMContentLoaded', () => {
            loadSyncData();
        });
    </script>
</body>
</html>`;

        await this.modalWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
    }
}

module.exports = SyncDataViewer;