const { BrowserWindow, screen } = require('electron');
const path = require('path');

class UserSelectorModal {
    constructor() {
        this.modalWindow = null;
        this.mainWindow = null;
        this.selectedUserId = null;
        this.resolvePromise = null;
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

            // Get all local users first
            const users = await this.getAllLocalUsers();
            if (users.length === 0) {
                throw new Error('No users found in local_users table');
            }

            // Get display info for positioning
            const displays = screen.getAllDisplays();
            const primaryDisplay = displays.find(d => d.id === screen.getPrimaryDisplay().id) || displays[0];
            const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

            // Calculate modal position (center of main window)
            const mainBounds = mainWindow.getBounds();
            const modalWidth = 320;
            const modalHeight = Math.min(540, 168 + (users.length * 72)); // Dynamic height based on user count, increased by 20%

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
            await this.loadHTMLContent(users);

            // Show window after content is loaded
            this.modalWindow.show();
            this.modalWindow.focus();

            // Setup event listeners
            this.setupEventListeners();

            // Start monitoring main window
            this.startMainWindowMonitoring();

            console.log('✅ User selector modal created and shown successfully');

            // Return a promise that resolves when user makes a selection
            return new Promise((resolve) => {
                this.resolvePromise = resolve;
            });

        } catch (error) {
            console.error('Error creating user selector modal:', error);
            throw error;
        }
    }

    async getAllLocalUsers() {
        try {
            const DatabaseManager = require('./sqlite/databaseManager');
            const users = DatabaseManager.getAllLocalUsers();
            return users;
        } catch (error) {
            console.error('Error getting local users:', error);
            return [];
        }
    }

    async loadHTMLContent(users) {
        const maxDisplayUsers = 5;
        const displayUsers = users.slice(0, maxDisplayUsers);
        const hasMoreUsers = users.length > maxDisplayUsers;

        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Select User</title>
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
            padding: 16px 0;
            flex: 1;
            overflow-y: auto;
            max-height: ${maxDisplayUsers * 72}px;
        }

        .user-list {
            list-style: none;
            margin: 0;
            padding: 0;
        }

        .user-item {
            display: flex;
            align-items: center;
            padding: 20px 20px;
            cursor: pointer;
            transition: background-color 0.2s ease;
            border-bottom: 1px solid #f0f0f0;
        }

        .user-item:last-child {
            border-bottom: none;
        }

        .user-item:hover {
            background-color: #f8f9fa;
        }

        .user-item.selected {
            background-color: #e3f2fd;
            color: #1976d2;
        }

        .user-radio {
            margin-right: 12px;
            width: 16px;
            height: 16px;
        }

        .user-info {
            flex: 1;
        }

        .user-name {
            font-size: 14px;
            font-weight: 500;
            margin: 0;
        }

        .user-status {
            font-size: 12px;
            color: #666;
            margin: 2px 0 0 0;
        }

        .current-user {
            color: #4caf50;
            font-weight: 600;
        }

        .more-users-notice {
            padding: 12px 20px;
            font-size: 12px;
            color: #666;
            text-align: center;
            background-color: #f8f9fa;
            border-top: 1px solid #e0e0e0;
        }

        .modal-footer {
            padding: 16px 20px;
            border-top: 1px solid #e0e0e0;
            display: flex;
            gap: 12px;
            justify-content: flex-end;
            flex-shrink: 0;
        }

        .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
            min-width: 80px;
        }

        .btn-primary {
            background: #4CAF50;
            color: white;
        }

        .btn-primary:hover {
            background: #45a049;
        }

        .btn-primary:disabled {
            background: #ccc;
            cursor: not-allowed;
        }

        .btn-secondary {
            background: #f0f0f0;
            color: #333;
            border: 1px solid #e0e0e0;
        }

        .btn-secondary:hover {
            background: #e0e0e0;
        }
    </style>
</head>

<body>
    <div class="modal-container">
        <div class="modal-header">
            <div class="modal-title">Select User</div>
            <button class="close-btn" id="closeBtn">&times;</button>
        </div>

        <div class="modal-body">
            <ul class="user-list" id="userList">
                ${displayUsers.map(user => `
                    <li class="user-item" data-user-id="${user.user_id}">
                        <input type="radio" name="user" value="${user.user_id}" class="user-radio" ${user.is_current ? 'checked' : ''}>
                        <div class="user-info">
                            <p class="user-name">${user.username}</p>
                            <p class="user-status ${user.is_current ? 'current-user' : ''}">${user.is_current ? 'Current User' : 'Available'}</p>
                        </div>
                    </li>
                `).join('')}
            </ul>
            ${hasMoreUsers ? `<div class="more-users-notice">Showing first ${maxDisplayUsers} users (${users.length} total)</div>` : ''}
        </div>

        <div class="modal-footer">
            <button class="btn btn-secondary" id="cancelBtn">Cancel</button>
            <button class="btn btn-primary" id="confirmBtn" disabled>Confirm</button>
        </div>
    </div>

    <script>
        const { ipcRenderer } = require('electron');

        document.addEventListener('DOMContentLoaded', () => {
            console.log('User selector modal loaded');

            const closeBtn = document.getElementById('closeBtn');
            const cancelBtn = document.getElementById('cancelBtn');
            const confirmBtn = document.getElementById('confirmBtn');
            const userItems = document.querySelectorAll('.user-item');
            const userRadios = document.querySelectorAll('input[name="user"]');

            let selectedUserId = null;

            // Handle close button click
            closeBtn.addEventListener('click', () => {
                console.log('Close button clicked');
                window.close();
            });

            // Handle cancel button click
            cancelBtn.addEventListener('click', () => {
                console.log('Cancel button clicked');
                window.close();
            });

            // Handle user selection
            userItems.forEach((item, index) => {
                item.addEventListener('click', () => {
                    // Update radio button
                    userRadios[index].checked = true;
                    
                    // Update visual selection
                    userItems.forEach(i => i.classList.remove('selected'));
                    item.classList.add('selected');
                    
                    // Update selected user ID
                    selectedUserId = item.dataset.userId;
                    
                    // Enable confirm button
                    confirmBtn.disabled = false;
                });
            });

            // Handle radio button changes
            userRadios.forEach((radio, index) => {
                radio.addEventListener('change', () => {
                    if (radio.checked) {
                        userItems.forEach(i => i.classList.remove('selected'));
                        userItems[index].classList.add('selected');
                        selectedUserId = radio.value;
                        confirmBtn.disabled = false;
                    }
                });
            });

            // Handle confirm button click
            confirmBtn.addEventListener('click', async () => {
                if (selectedUserId) {
                    try {
                        const result = await ipcRenderer.invoke('switch-user', selectedUserId);
                        if (result.success) {
                            console.log('User switched successfully');
                        } else {
                            alert(\`Failed to switch user: \${result.error}\`);
                        }
                    } catch (error) {
                        alert(\`Error switching user: \${error.message}\`);
                    }
                }
                window.close();
            });

            // Initialize selection if current user is visible
            const currentUserItem = document.querySelector('.user-item .current-user');
            if (currentUserItem) {
                const currentUserItem = currentUserItem.closest('.user-item');
                currentUserItem.classList.add('selected');
                selectedUserId = currentUserItem.dataset.userId;
                confirmBtn.disabled = false;
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
            console.log('User selector modal window closed');
            if (this.resolvePromise) {
                this.resolvePromise({ success: false, cancelled: true });
                this.resolvePromise = null;
            }
            this.cleanup();
        });

        // Handle window focus
        this.modalWindow.on('focus', () => {
            console.log('User selector modal focused');
        });

        // Handle window blur
        this.modalWindow.on('blur', () => {
            console.log('User selector modal blurred');
        });
    }

    startMainWindowMonitoring() {
        if (this.monitoringEnabled) return;

        this.monitoringEnabled = true;
        console.log('Starting main window monitoring for user selector modal');

        // Monitor main window status every 2 seconds (more frequent)
        this.mainWindowCheckInterval = setInterval(() => {
            this.checkMainWindowStatus();
        }, 2000);
    }

    checkMainWindowStatus() {
        if (!this.mainWindow || !this.modalWindow) {
            console.log('User selector modal: mainWindow or modalWindow not available');
            return;
        }

        try {
            // Check if main window is destroyed
            if (this.mainWindow.isDestroyed()) {
                console.log('Main window destroyed, closing user selector modal');
                this.close();
                return;
            }

            // Check if main window is not visible (minimized or hidden)
            if (!this.mainWindow.isVisible()) {
                console.log('Main window not visible, but keeping user selector modal open');
                return;
            }

            // Log status check (every 10th check to avoid spam)
            if (Math.random() < 0.1) {
                console.log('User selector modal: main window status check - visible and not destroyed');
            }

        } catch (error) {
            console.error('Error checking main window status:', error);
        }
    }

    cleanup() {
        console.log('Cleaning up user selector modal resources');

        // Clear monitoring interval
        if (this.mainWindowCheckInterval) {
            clearInterval(this.mainWindowCheckInterval);
            this.mainWindowCheckInterval = null;
        }

        // Reset state
        this.monitoringEnabled = false;
        this.modalWindow = null;
        this.mainWindow = null;

        console.log('User selector modal cleanup completed');
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

module.exports = UserSelectorModal;
