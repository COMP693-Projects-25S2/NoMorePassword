const { BrowserWindow, screen } = require('electron');
const path = require('path');

class NodeStatusModal {
    constructor() {
        this.modalWindow = null;
        this.mainWindow = null;
    }

    async show(mainWindow) {
        try {
            console.log('🔍 NodeStatusModal: Starting to show modal...');
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
            const modalWidth = 500;
            const modalHeight = 600;

            // Center the modal on the main window
            const x = mainBounds.x + (mainBounds.width - modalWidth) / 2;
            const y = mainBounds.y + (mainBounds.height - modalHeight) / 2;

            // Ensure modal is within screen bounds
            const finalX = Math.max(50, Math.min(x, screenWidth - modalWidth - 50));
            const finalY = Math.max(50, Math.min(y, screenHeight - modalHeight - 50));

            console.log('🔍 NodeStatusModal: Modal position - x:', finalX, 'y:', finalY, 'width:', modalWidth, 'height:', modalHeight);

            // Create modal window
            console.log('🔍 NodeStatusModal: Creating modal window...');
            this.modalWindow = new BrowserWindow({
                width: modalWidth,
                height: modalHeight,
                x: finalX,
                y: finalY,
                resizable: true,
                minimizable: false,
                maximizable: false,
                fullscreenable: false,
                alwaysOnTop: false,
                frame: true,
                show: false,
                webPreferences: {
                    nodeIntegration: true,
                    contextIsolation: false,
                    enableRemoteModule: true
                }
            });
            console.log('🔍 NodeStatusModal: Modal window created successfully');

            // Load HTML content
            console.log('🔍 NodeStatusModal: Loading HTML content...');
            await this.modalWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(this.getHTMLContent())}`);
            console.log('🔍 NodeStatusModal: HTML content loaded successfully');

            // Show modal immediately after loading
            console.log('🔍 NodeStatusModal: Showing modal immediately...');
            console.log('🔍 NodeStatusModal: Modal window exists:', !!this.modalWindow);
            console.log('🔍 NodeStatusModal: Modal window destroyed:', this.modalWindow ? this.modalWindow.isDestroyed() : 'N/A');

            this.modalWindow.show();
            this.modalWindow.focus();
            this.modalWindow.setAlwaysOnTop(true);
            console.log('🔍 NodeStatusModal: Modal shown successfully');

            // Bring to front after a short delay
            setTimeout(() => {
                if (this.modalWindow && !this.modalWindow.isDestroyed()) {
                    this.modalWindow.focus();
                    this.modalWindow.setAlwaysOnTop(false);
                    console.log('🔍 NodeStatusModal: Modal focus adjusted');
                }
            }, 100);

            // Additional fallback to ensure visibility
            setTimeout(() => {
                if (this.modalWindow && !this.modalWindow.isDestroyed()) {
                    this.modalWindow.show();
                    this.modalWindow.focus();
                    console.log('🔍 NodeStatusModal: Fallback show triggered');
                } else {
                    console.log('🔍 NodeStatusModal: Modal window not available for fallback show');
                }
            }, 500);

            // Check modal status after a longer delay
            setTimeout(() => {
                if (this.modalWindow && !this.modalWindow.isDestroyed()) {
                    console.log('🔍 NodeStatusModal: Modal still exists after 1 second');
                    console.log('🔍 NodeStatusModal: Modal visible:', this.modalWindow.isVisible());
                    console.log('🔍 NodeStatusModal: Modal focused:', this.modalWindow.isFocused());
                } else {
                    console.log('🔍 NodeStatusModal: Modal no longer exists after 1 second');
                }
            }, 1000);

            // Handle window close
            this.modalWindow.on('closed', () => {
                this.modalWindow = null;
            });

            // Handle window show event
            this.modalWindow.on('show', () => {
                console.log('🔍 NodeStatusModal: Modal show event triggered');
            });

            // Handle window focus event
            this.modalWindow.on('focus', () => {
                console.log('🔍 NodeStatusModal: Modal focus event triggered');
            });

        } catch (error) {
            console.error('Error showing node status modal:', error);
            throw error;
        }
    }

    getHTMLContent() {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Node Status</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f8f9fa;
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
            padding: 20px;
            flex: 1;
            overflow-y: auto;
        }

        .status-section {
            background: white;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 16px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .status-section h3 {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 12px;
            color: #333;
            display: flex;
            align-items: center;
        }

        .status-section h3 .icon {
            margin-right: 8px;
            font-size: 18px;
        }

        .status-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 0;
            border-bottom: 1px solid #f0f0f0;
        }

        .status-item:last-child {
            border-bottom: none;
        }

        .status-label {
            font-weight: 500;
            color: #666;
        }

        .status-value {
            font-weight: 600;
            color: #333;
        }

        .status-value.main-node {
            color: #28a745;
        }

        .status-value.sub-node {
            color: #007bff;
        }

        .status-value.offline {
            color: #dc3545;
        }

        .loading {
            text-align: center;
            padding: 40px;
            color: #666;
        }

        .error {
            text-align: center;
            padding: 40px;
            color: #dc3545;
        }

        .refresh-btn {
            background: #007bff;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            margin-bottom: 16px;
        }

        .refresh-btn:hover {
            background: #0056b3;
        }

        .hierarchy-tree {
            margin-top: 12px;
            padding-left: 20px;
        }

        .hierarchy-item {
            margin: 4px 0;
            padding: 4px 8px;
            background: #f8f9fa;
            border-radius: 4px;
            font-size: 14px;
        }

        .hierarchy-item.main {
            background: #d4edda;
            color: #155724;
        }

        .hierarchy-item.sub {
            background: #d1ecf1;
            color: #0c5460;
        }
    </style>
</head>
<body>
    <div class="modal-container">
        <div class="modal-header">
            <div class="modal-title">🌐 Node Status</div>
            <button class="close-btn" id="closeBtn">&times;</button>
        </div>

        <div class="modal-body">
            <button class="refresh-btn" id="refreshBtn">🔄 Refresh Status</button>
            
            <div id="statusContent">
                <div class="loading">Loading node status...</div>
            </div>
        </div>
    </div>

    <script>
        const { ipcRenderer } = require('electron');

        document.addEventListener('DOMContentLoaded', () => {
            const closeBtn = document.getElementById('closeBtn');
            const refreshBtn = document.getElementById('refreshBtn');
            const statusContent = document.getElementById('statusContent');

            // Handle close button click
            closeBtn.addEventListener('click', () => {
                window.close();
            });

            // Handle refresh button click
            refreshBtn.addEventListener('click', () => {
                loadNodeStatus();
            });

            // Load node status on startup
            loadNodeStatus();
        });

        async function loadNodeStatus() {
            try {
                statusContent.innerHTML = '<div class="loading">Loading node status...</div>';
                
                const result = await ipcRenderer.invoke('get-node-status');
                
                if (result.success) {
                    displayNodeStatus(result.data);
                } else {
                    statusContent.innerHTML = '<div class="error">Error loading node status: ' + result.error + '</div>';
                }
            } catch (error) {
                statusContent.innerHTML = '<div class="error">Error loading node status: ' + error.message + '</div>';
            }
        }

        function displayNodeStatus(data) {
            const { currentNode, mainNodes, hierarchy } = data;
            
            let html = '<div class="status-section">' +
                '<h3><span class="icon">🏠</span>Current Node</h3>' +
                '<div class="status-item">' +
                    '<span class="status-label">Node ID:</span>' +
                    '<span class="status-value">' + (currentNode.nodeId || 'Unknown') + '</span>' +
                '</div>' +
                '<div class="status-item">' +
                    '<span class="status-label">Username:</span>' +
                    '<span class="status-value">' + (currentNode.username || 'Unknown') + '</span>' +
                '</div>' +
                '<div class="status-item">' +
                    '<span class="status-label">IP Address:</span>' +
                    '<span class="status-value">' + (currentNode.ipAddress || 'Unknown') + '</span>' +
                '</div>' +
                '<div class="status-item">' +
                    '<span class="status-label">Port:</span>' +
                    '<span class="status-value">' + (currentNode.port || 'Unknown') + '</span>' +
                '</div>' +
                '<div class="status-item">' +
                    '<span class="status-label">Status:</span>' +
                    '<span class="status-value ' + (currentNode.status === 'active' ? 'main-node' : 'offline') + '">' + (currentNode.status || 'Unknown') + '</span>' +
                '</div>' +
                '<div class="status-item">' +
                    '<span class="status-label">Priority:</span>' +
                    '<span class="status-value">' + (currentNode.priority || 'Unknown') + '</span>' +
                '</div>' +
            '</div>' +

            '<div class="status-section">' +
                '<h3><span class="icon">👑</span>Main Node Status</h3>' +
                '<div class="status-item">' +
                    '<span class="status-label">Domain Main Node:</span>' +
                    '<span class="status-value ' + (mainNodes.domain ? 'main-node' : 'offline') + '">' + (mainNodes.domain ? mainNodes.domain.node_id : 'None') + '</span>' +
                '</div>' +
                '<div class="status-item">' +
                    '<span class="status-label">Cluster Main Node:</span>' +
                    '<span class="status-value ' + (mainNodes.cluster ? 'main-node' : 'offline') + '">' + (mainNodes.cluster ? mainNodes.cluster.node_id : 'None') + '</span>' +
                '</div>' +
                '<div class="status-item">' +
                    '<span class="status-label">Channel Main Node:</span>' +
                    '<span class="status-value ' + (mainNodes.channel ? 'main-node' : 'offline') + '">' + (mainNodes.channel ? mainNodes.channel.node_id : 'None') + '</span>' +
                '</div>' +
                '<div class="status-item">' +
                    '<span class="status-label">Local Main Node:</span>' +
                    '<span class="status-value ' + (mainNodes.local ? 'main-node' : 'offline') + '">' + (mainNodes.local ? mainNodes.local.node_id : 'None') + '</span>' +
                '</div>' +
            '</div>' +

            '<div class="status-section">' +
                '<h3><span class="icon">🌳</span>Node Hierarchy</h3>' +
                '<div class="hierarchy-tree">' +
                    hierarchy.map(level => 
                        '<div class="hierarchy-item ' + (level.isMainNode ? 'main' : 'sub') + '">' +
                            '<strong>' + level.type + ':</strong> ' + (level.nodeId || 'None') + ' ' +
                            (level.isMainNode ? '👑' : '') +
                        '</div>'
                    ).join('') +
                '</div>' +
            '</div>';
            
            statusContent.innerHTML = html;
        }
    </script>
</body>
</html>
        `;
    }
}

module.exports = NodeStatusModal;
