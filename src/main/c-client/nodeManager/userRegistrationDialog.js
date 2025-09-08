const { BrowserWindow, screen } = require('electron');
const path = require('path');
const fs = require('fs');

class UserRegistrationDialog {
    constructor() {
        this.dialogWindow = null;
        this.mainWindow = null;
        this.monitoringEnabled = false;
        this.mainWindowCheckInterval = null;
        this.keepInFrontInterval = null;
        this.appQuitListener = null;
        this.isIntentionalClose = false;
    }

    async show(mainWindow) {
        try {
            this.mainWindow = mainWindow;

            // Check if dialog already exists
            if (this.dialogWindow && !this.dialogWindow.isDestroyed()) {
                this.dialogWindow.focus();
                return;
            }

            // Creating user registration dialog window

            // Get display info for positioning
            const displays = screen.getAllDisplays();
            const primaryDisplay = displays.find(d => d.id === screen.getPrimaryDisplay().id) || displays[0];
            const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

            // Calculate dialog position (bottom-right of main window)
            const mainBounds = mainWindow.getBounds();
            const dialogWidth = 320;
            const dialogHeight = 200;

            // Position dialog at bottom-right of main window
            const x = Math.max(0, mainBounds.x + mainBounds.width - dialogWidth - 20);
            const y = Math.max(0, mainBounds.y + mainBounds.height - dialogHeight - 20);

            // Ensure dialog is within screen bounds
            const finalX = Math.min(x, screenWidth - dialogWidth - 20);
            const finalY = Math.min(y, screenHeight - dialogHeight - 20);

            // Positioning dialog

            // Create dialog window with more stable settings
            this.dialogWindow = new BrowserWindow({
                width: dialogWidth,
                height: dialogHeight,
                x: finalX,
                y: finalY,
                resizable: false,
                minimizable: false,
                maximizable: false,
                fullscreenable: false,
                alwaysOnTop: false, // Disable always on top to prevent issues
                skipTaskbar: false, // Show in taskbar for better visibility
                show: false,
                frame: false, // Remove frame to hide toolbar
                transparent: false,
                backgroundColor: '#ffffff',
                webPreferences: {
                    nodeIntegration: true, // Enable nodeIntegration for require
                    contextIsolation: false, // Disable contextIsolation to allow require
                    enableRemoteModule: false,
                    preload: path.join(__dirname, '../../../pages/preload.js'),
                    sandbox: false // Disable sandbox for better compatibility
                }
            });

            // Set window properties to keep dialog in front (but not always on top)
            this.dialogWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); // Visible on all workspaces

            // Load HTML content directly (more reliable)
            await this.loadHTMLContentDirectly();

            // Show window after content is loaded
            this.dialogWindow.show();
            this.dialogWindow.focus();

            // Setup event listeners
            this.setupEventListeners();

            // Start monitoring main window with longer interval
            this.startMainWindowMonitoring();

            // Start keeping dialog in front
            this.startKeepInFront();

        } catch (error) {
            console.error('Error creating user registration dialog:', error);
            throw error;
        }
    }

    async showGreeting(mainWindow) {
        try {
            this.mainWindow = mainWindow;

            // Check if dialog already exists
            if (this.dialogWindow && !this.dialogWindow.isDestroyed()) {
                this.dialogWindow.focus();
                return;
            }

            // Creating user greeting dialog window

            // Get current user from database
            const db = require('../sqlite/database');
            const currentUser = db.prepare('SELECT username FROM local_users WHERE is_current = 1').get();

            if (!currentUser) {
                // No current user found, skipping greeting dialog
                return;
            }

            const username = currentUser.username;

            // Get display info for positioning
            const displays = screen.getAllDisplays();
            const primaryDisplay = displays.find(d => d.id === screen.getPrimaryDisplay().id) || displays[0];
            const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

            // Calculate dialog position (bottom-right of main window)
            const mainBounds = mainWindow.getBounds();
            const dialogWidth = 300;
            const dialogHeight = 120;

            // Position dialog at bottom-right of main window
            const x = Math.max(0, mainBounds.x + mainBounds.width - dialogWidth - 20);
            const y = Math.max(0, mainBounds.y + mainBounds.height - dialogHeight - 20);

            // Ensure dialog is within screen bounds
            const finalX = Math.min(x, screenWidth - dialogWidth - 20);
            const finalY = Math.min(y, screenHeight - dialogHeight - 20);


            // Positioning greeting dialog

            // Create dialog window for greeting
            this.dialogWindow = new BrowserWindow({
                width: dialogWidth,
                height: dialogHeight,
                x: finalX,
                y: finalY,
                resizable: false,
                minimizable: false,
                maximizable: false,
                fullscreenable: false,
                alwaysOnTop: true, // Set to true to ensure greeting dialog appears above other windows
                skipTaskbar: false,
                show: false,
                frame: false,
                transparent: false,
                backgroundColor: '#ffffff',
                webPreferences: {
                    nodeIntegration: true,
                    contextIsolation: false,
                    enableRemoteModule: false,
                    preload: path.join(__dirname, '../../../pages/preload.js'),
                    sandbox: false
                }
            });

            // Set window properties
            this.dialogWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

            // Load greeting HTML content
            await this.loadGreetingHTMLContent(username);

            // Show window after content is loaded
            this.dialogWindow.show();
            this.dialogWindow.focus();

            // Setup event listeners
            this.setupEventListeners();

            // Start monitoring main window
            this.startMainWindowMonitoring();

            // Auto-close after 3 seconds
            setTimeout(() => {
                if (this.dialogWindow && !this.dialogWindow.isDestroyed()) {
                    // Auto-closing greeting dialog after 3 seconds
                    this.close();
                }
            }, 3000);

            // User greeting dialog created and shown successfully

        } catch (error) {
            console.error('Error creating user greeting dialog:', error);
            throw error;
        }
    }

    async loadHTMLContentDirectly() {
        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>User Registration</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: white;
            color: #333;
        }
        .dialog-title {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 18px;
            text-align: center;
        }
        .input-group {
            margin-bottom: 18px;
        }
        .input-field {
            width: 100%;
            padding: 10px 12px;
            border: 2px solid #e0e0e0;
            border-radius: 6px;
            font-size: 14px;
            box-sizing: border-box;
            cursor: text;
            user-select: text;
            -webkit-user-select: text;
            -moz-user-select: text;
            -ms-user-select: text;
            position: relative;
            z-index: 1000;
            background: #ffffff;
            color: #333333;
        }
        
        .input-field:focus {
            outline: none;
            border-color: #4CAF50;
            box-shadow: 0 0 0 3px rgba(76, 175, 80, 0.1);
            background: #ffffff;
        }
        
        .button-group {
            display: flex;
            gap: 10px;
            justify-content: center;
        }
        .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            min-width: 80px;
        }
        .btn-primary {
            background: #4CAF50;
            color: white;
        }
        .btn-secondary {
            background: #f0f0f0;
            color: #333;
            border: 2px solid #e0e0e0;
        }
        .error-message {
            color: #ff6b6b;
            font-size: 12px;
            margin-top: 8px;
            display: none;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="dialog-title">Please Enter New Username</div>
    <div class="input-group">
        <input type="text" id="usernameInput" class="input-field" placeholder="Username" maxlength="50">
    </div>
    <div class="error-message" id="errorMessage"></div>
    <div class="button-group">
        <button id="confirmBtn" class="btn btn-primary">Confirm</button>
        <button id="cancelBtn" class="btn btn-secondary">Cancel</button>
    </div>
    
    <script>
        try {
            // Check if ipcRenderer is available
            let ipcRenderer;
            try {
                ipcRenderer = require('electron').ipcRenderer;
            } catch (error) {
                console.error('Failed to load ipcRenderer:', error);
                // Don't return here, continue with fallback
            }
            
            // Get DOM elements
            const usernameInput = document.getElementById('usernameInput');
            const confirmBtn = document.getElementById('confirmBtn');
            const cancelBtn = document.getElementById('cancelBtn');
            const errorMessage = document.getElementById('errorMessage');
            
            // DOM elements found
            
            // Validation function
            function validateUsername(username) {
                if (!username || username.trim() === '') {
                    return 'Username cannot be empty';
                }
                if (username.length < 2) {
                    return 'Username must be at least 2 characters';
                }
                if (username.length > 50) {
                    return 'Username cannot exceed 50 characters';
                }
                return null;
            }
            
            // Error display functions
            function showError(message) {
                if (errorMessage) {
                    errorMessage.textContent = message;
                    errorMessage.style.display = 'block';
                }
                if (usernameInput) {
                    usernameInput.style.borderColor = '#ff6b6b';
                }
            }
            
            function hideError() {
                if (errorMessage) {
                    errorMessage.style.display = 'none';
                }
                if (usernameInput) {
                    usernameInput.style.borderColor = '';
                }
            }
            
            // Input validation
            if (usernameInput) {
                usernameInput.addEventListener('input', () => {
                    hideError();
                    const username = usernameInput.value.trim();
                    const isValid = !validateUsername(username);
                    if (confirmBtn) {
                        confirmBtn.disabled = !isValid;
                    }
                });
                
                usernameInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter' && confirmBtn && !confirmBtn.disabled) {
                        handleSubmit();
                    }
                });
            }
            
            // Confirm button handler
            if (confirmBtn) {
                confirmBtn.addEventListener('click', handleSubmit);
            } else {
                console.error('Confirm button not found!');
            }
            
            // Cancel button handler
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => {
                    try {
                        if (ipcRenderer) {
                            ipcRenderer.send('close-user-registration-dialog');
                        } else {
                            // Fallback to direct close
                            if (window.close) {
                                window.close();
                            }
                        }
                    } catch (error) {
                        console.error('Cancel button error:', error);
                        // Fallback to direct close
                        if (window.close) {
                            window.close();
                        }
                    }
                });
            } else {
                console.error('Cancel button not found!');
            }
            
            // Submit handler
            function handleSubmit() {
                if (!usernameInput || !confirmBtn) {
                    console.error('Required elements not found');
                    return;
                }
                
                const username = usernameInput.value.trim();
                
                const error = validateUsername(username);
                if (error) {
                    showError(error);
                    return;
                }
                
                confirmBtn.disabled = true;
                confirmBtn.textContent = 'Submitting...';
                
                try {
                    if (ipcRenderer) {
                        ipcRenderer.invoke('submit-username', username).then(result => {
                            if (result && result.success) {
                                // Show success message briefly before closing
                                if (confirmBtn) {
                                    confirmBtn.textContent = 'Success!';
                                    confirmBtn.style.background = '#4CAF50';
                                }
                                
                                // Close dialog after a short delay
                                setTimeout(() => {
                                    try {
                                        ipcRenderer.send('close-user-registration-dialog');
                                    } catch (error) {
                                        console.error('Error sending close message:', error);
                                        // Fallback to direct close
                                        if (window.close) {
                                            window.close();
                                        }
                                    }
                                }, 1000);
                            } else {
                                const errorMsg = result ? (result.error || 'Failed to submit username') : 'Failed to submit username';
                                console.error('Submit failed:', errorMsg);
                                showError(errorMsg);
                                if (confirmBtn) {
                                    confirmBtn.disabled = false;
                                    confirmBtn.textContent = 'Confirm';
                                }
                            }
                        }).catch(error => {
                            console.error('Submit promise error:', error);
                            showError('Error occurred while submitting username');
                            if (confirmBtn) {
                                confirmBtn.disabled = false;
                                confirmBtn.textContent = 'Confirm';
                            }
                        });
                    } else {
                        // ipcRenderer not available, showing error
                        showError('System error: Unable to submit username');
                        if (confirmBtn) {
                            confirmBtn.disabled = false;
                            confirmBtn.textContent = 'Confirm';
                        }
                    }
                } catch (error) {
                    console.error('Error invoking submit-username:', error);
                    showError('Error occurred while submitting username');
                    if (confirmBtn) {
                        confirmBtn.disabled = false;
                        confirmBtn.textContent = 'Confirm';
                    }
                }
            }
            
            // Focus input on load
            if (usernameInput) {
                // Simple and reliable focus setup
                const setupInputFocus = () => {
                    try {
                        // Ensure input is visible and enabled
                        usernameInput.style.display = 'block';
                        usernameInput.style.visibility = 'visible';
                        usernameInput.style.opacity = '1';
                        usernameInput.style.pointerEvents = 'auto';
                        usernameInput.disabled = false;
                        usernameInput.readOnly = false;
                        
                        // Set tab index to make it focusable
                        usernameInput.tabIndex = 0;
                        
                        // Focus and select
                        usernameInput.focus();
                        usernameInput.select();
                        
                        // Verify focus
                        setTimeout(() => {
                            if (document.activeElement === usernameInput) {
                                // Input field successfully focused and verified
                            } else {
                                // Focus verification failed, retrying
                                usernameInput.focus();
                                usernameInput.select();
                            }
                        }, 100);
                        
                    } catch (error) {
                        console.error('Input focus setup failed:', error);
                    }
                };
                
                // Try immediate focus
                setupInputFocus();
                
                // Also try delayed focus for reliability
                setTimeout(setupInputFocus, 200);
                setTimeout(setupInputFocus, 500);
                
                // Add click handler to ensure focus
                usernameInput.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    
                    try {
                        usernameInput.focus();
                        usernameInput.select();
                    } catch (error) {
                        console.error('Click focus failed:', error);
                    }
                });
                
                // Add mousedown handler
                usernameInput.addEventListener('mousedown', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    
                    try {
                        usernameInput.focus();
                        usernameInput.select();
                    } catch (error) {
                        console.error('Mousedown focus failed:', error);
                    }
                });
                
                // Add focus event handler
                usernameInput.addEventListener('focus', () => {
                    // Input field gained focus
                });
                
                // Add blur event handler (but don't prevent it)
                usernameInput.addEventListener('blur', () => {
                    // Input field lost focus - no logging needed
                });
                
                // Add input event handler
                usernameInput.addEventListener('input', () => {
                    // Input field value changed - no logging needed
                });
                
                // Add keydown event handler
                usernameInput.addEventListener('keydown', (event) => {
                    // Input field keydown - no logging needed
                });
                
            } else {
                console.error('Username input field not found for focus setup');
            }
            
            // Dialog script initialization completed
            
        } catch (error) {
            console.error('Error in dialog script:', error);
            alert('Script error: ' + error.message);
        }
    </script>
</body>
</html>`;

        // Load HTML content directly to avoid encoding issues
        await this.dialogWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));
    }

    async loadGreetingHTMLContent(username) {
        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>User Greeting</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: white;
            color: #333;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            box-sizing: border-box;
        }
        .greeting-container {
            text-align: center;
            padding: 20px;
        }
        .greeting-text {
            font-size: 18px;
            font-weight: 600;
            color: #4CAF50;
            margin: 0;
        }
        .username {
            font-weight: 700;
            color: #2196F3;
        }
    </style>
</head>
<body>
    <div class="greeting-container">
        <p class="greeting-text">Hello, <span class="username">${username}</span></p>
    </div>
</body>
</html>`;

        // Load HTML content directly to avoid encoding issues
        await this.dialogWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));
    }

    setupEventListeners() {
        if (!this.dialogWindow) return;

        try {
            // Handle dialog close
            this.dialogWindow.on('closed', () => {
                // Dialog window closed
                this.cleanup();
            });

            // Handle dialog close request from renderer using ipcMain
            const { ipcMain } = require('electron');

            // Remove any existing listeners to avoid duplicates
            ipcMain.removeAllListeners('close-user-registration-dialog');
            ipcMain.removeAllListeners('user-registration-cancelled');

            // Set up new listeners
            ipcMain.on('close-user-registration-dialog', (event) => {
                // Received close request from renderer via ipcMain
                this.isIntentionalClose = true;
                this.close();
            });

            ipcMain.on('user-registration-cancelled', (event) => {
                // User registration cancelled via ipcMain
                this.isIntentionalClose = true;
                this.close();
            });

            // IPC listeners set up successfully

            // Listen for all webContents events to debug
            this.dialogWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
                // Dialog console message received
            });

            // Handle dialog focus
            this.dialogWindow.on('focus', () => {
                // Dialog window focused
            });

            // Handle dialog blur
            this.dialogWindow.on('blur', () => {
                // Dialog window blurred
            });

            // Handle dialog move
            this.dialogWindow.on('move', () => {
                // Dialog window moved
            });

            // Handle dialog resize
            this.dialogWindow.on('resize', () => {
                // Dialog window resized
            });

            // Handle dialog show
            this.dialogWindow.on('show', () => {
                // Dialog window shown
            });

            // Handle webContents events
            this.dialogWindow.webContents.on('did-finish-load', () => {
                // Dialog HTML loaded successfully
            });

            this.dialogWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
                console.error('Dialog failed to load:', errorCode, errorDescription);
            });

            this.dialogWindow.webContents.on('dom-ready', () => {
                // Dialog webContents DOM ready
            });

            this.dialogWindow.webContents.on('stopped-loading', () => {
                // Dialog webContents stopped loading
            });

        } catch (error) {
            console.error('Error setting up event listeners:', error);
        }
    }

    startMainWindowMonitoring() {
        if (this.monitoringEnabled) return;

        this.monitoringEnabled = true;
        // Starting main window monitoring

        // Use much longer interval to prevent excessive checking
        this.mainWindowCheckInterval = setInterval(() => {
            this.checkMainWindowStatus();
        }, 10000); // Increased to 10 seconds to prevent premature closing
    }

    startKeepInFront() {
        if (!this.dialogWindow) return;

        // Starting keep-in-front monitoring

        // Set up interval to ensure dialog stays in front
        this.keepInFrontInterval = setInterval(() => {
            try {
                if (this.dialogWindow && !this.dialogWindow.isDestroyed()) {
                    // Bring dialog to front
                    this.dialogWindow.moveTop();
                    this.dialogWindow.focus();

                    // Don't set always on top to prevent issues
                }
            } catch (error) {
                console.error('Error keeping dialog in front:', error);
            }
        }, 1000); // Check every second
    }

    checkMainWindowStatus() {
        if (!this.mainWindow || !this.dialogWindow) {
            // Main window or dialog window not available, skipping check
            return;
        }

        try {
            // Check if main window is destroyed
            if (this.mainWindow.isDestroyed()) {
                // Main window destroyed, closing dialog
                this.close();
                return;
            }

            // Don't close dialog just because main window is not visible
            // This can cause false positives during window operations
            if (!this.mainWindow.isVisible()) {
                // Main window not visible, but keeping dialog open
                return;
            }

            // Only log status, don't take action unless main window is destroyed
            // Main window status check: visible and not destroyed

        } catch (error) {
            console.error('Error checking main window status:', error);
            // Don't close dialog on error, just log it
            // Continuing to monitor main window despite error
        }
    }

    close() {
        // Always allow closing when called from IPC or external request
        if (this.isIntentionalClose) {
            // Intentional close detected, proceeding with close
            try {
                if (this.dialogWindow && !this.dialogWindow.isDestroyed()) {
                    this.dialogWindow.close();
                }
            } catch (error) {
                console.error('Error closing dialog window:', error);
            }

            this.cleanup();
        } else {
            // Not an intentional close, check if we should allow it
            // For now, allow all close requests to prevent dialog from getting stuck
            try {
                if (this.dialogWindow && !this.dialogWindow.isDestroyed()) {
                    this.dialogWindow.close();
                }
            } catch (error) {
                console.error('Error closing dialog window:', error);
            }

            this.cleanup();
        }
    }

    cleanup() {
        // Cleaning up dialog resources

        // Clear monitoring interval
        if (this.mainWindowCheckInterval) {
            clearInterval(this.mainWindowCheckInterval);
            this.mainWindowCheckInterval = null;
        }

        // Clear keep-in-front interval
        if (this.keepInFrontInterval) {
            clearInterval(this.keepInFrontInterval);
            this.keepInFrontInterval = null;
        }

        // Remove app quit listener
        if (this.appQuitListener) {
            this.appQuitListener();
            this.appQuitListener = null;
        }

        // Reset state
        this.monitoringEnabled = false;
        this.dialogWindow = null;
        this.mainWindow = null;

        // Cleanup completed
    }

    isVisible() {
        return this.dialogWindow && !this.dialogWindow.isDestroyed() && this.dialogWindow.isVisible();
    }

    // Public method to close dialog from external request
    closeFromExternalRequest() {
        // Closing dialog from external request
        this.isIntentionalClose = true;
        this.close();
    }
}

module.exports = UserRegistrationDialog;
