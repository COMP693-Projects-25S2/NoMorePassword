const { BrowserWindow } = require('electron');
const path = require('path');

// Window manager
class WindowManager {
    constructor(historyManager, clientManager = null) {
        this.mainWindow = null;
        this.historyManager = historyManager;
        this.clientManager = clientManager;
        this.resizeCallback = null;
        this.moveCallback = null;
        this.hasShownInitialPath = false; // Track if we've shown the initial path
    }

    /**
     * Load saved window state from database
     * @returns {object|null} Saved window state or null
     */
    loadWindowState() {
        try {
            const db = require('../sqlite/database');
            const state = db.prepare('SELECT * FROM window_state WHERE id = 1').get();

            if (state) {
                console.log('🪟 WindowManager: Loaded saved window state:', state);
                return {
                    width: state.width || 1000,
                    height: state.height || 800,
                    x: state.x,
                    y: state.y,
                    isMaximized: state.is_maximized === 1
                };
            }
        } catch (error) {
            console.error('❌ WindowManager: Error loading window state:', error);
        }
        return null;
    }

    /**
     * Update window title with current page title and project path
     * @param {string} pageTitle Current page title
     */
    updateWindowTitle(pageTitle = '') {
        console.log(`🪟 WindowManager: updateWindowTitle called with pageTitle="${pageTitle}"`);
        if (!this.mainWindow || this.mainWindow.isDestroyed()) {
            console.log(`🪟 WindowManager: Main window not available`);
            return;
        }

        try {
            const projectPath = process.cwd();
            const baseTitle = this.clientManager ? this.clientManager.getClientWindowTitle() : 'NoMorePassword Browser';

            console.log(`🪟 WindowManager: updateWindowTitle called with pageTitle="${pageTitle}", hasShownInitialPath=${this.hasShownInitialPath}`);

            let newTitle;

            // Show full path only on first display, and only if we haven't shown it yet
            if (!this.hasShownInitialPath) {
                // First time: Show full path
                if (pageTitle && pageTitle.trim() && pageTitle !== 'Loading...' && pageTitle !== 'Untitled Page') {
                    newTitle = `${pageTitle} - ${baseTitle} - ${projectPath}`;
                } else {
                    newTitle = `${baseTitle} - ${projectPath}`;
                }
                console.log(`🪟 WindowManager: Setting initial title with path: ${newTitle}`);
                this.mainWindow.setTitle(newTitle);

                // Set timer to switch to simple title after 10 seconds, but don't mark as shown yet
                setTimeout(() => {
                    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                        const simpleTitle = pageTitle && pageTitle.trim() && pageTitle !== 'Loading...' && pageTitle !== 'Untitled Page'
                            ? pageTitle
                            : baseTitle;
                        this.mainWindow.setTitle(simpleTitle);
                        console.log(`🪟 WindowManager: Switched to simple title after delay: ${simpleTitle}`);
                        // Only mark as shown after the timer completes
                        this.hasShownInitialPath = true;
                    }
                }, 10000); // 10 second delay
            } else {
                // After first display: Only show page title
                if (pageTitle && pageTitle.trim() && pageTitle !== 'Loading...' && pageTitle !== 'Untitled Page') {
                    newTitle = pageTitle;
                } else {
                    newTitle = baseTitle;
                }
                console.log(`🪟 WindowManager: Setting simple title: ${newTitle}`);
                this.mainWindow.setTitle(newTitle);
            }
        } catch (error) {
            console.error('❌ WindowManager: Error updating window title:', error);
        }
    }


    /**
     * Save window state to database
     */
    saveWindowState() {
        if (!this.mainWindow || this.mainWindow.isDestroyed()) {
            return;
        }

        try {
            const db = require('../sqlite/database');
            const bounds = this.mainWindow.getBounds();
            const isMaximized = this.mainWindow.isMaximized();
            const now = Math.floor(Date.now() / 1000);

            db.prepare(`
                UPDATE window_state 
                SET width = ?, height = ?, x = ?, y = ?, is_maximized = ?, updated_at = ?
                WHERE id = 1
            `).run(bounds.width, bounds.height, bounds.x, bounds.y, isMaximized ? 1 : 0, now);

            console.log(`🪟 WindowManager: Saved window state: ${bounds.width}x${bounds.height} at (${bounds.x}, ${bounds.y}), maximized: ${isMaximized}`);
        } catch (error) {
            console.error('❌ WindowManager: Error saving window state:', error);
        }
    }

    /**
     * Create main window
     * @returns {BrowserWindow} Main window instance
     */
    createWindow() {
        // Get client-specific window configuration
        const windowConfig = this.clientManager ?
            this.clientManager.getClientWindowConfig() :
            require('../config/constants').WINDOW_CONFIG;

        // Load saved window state
        const savedState = this.loadWindowState();

        // Merge saved state with default config
        const finalConfig = {
            ...windowConfig,
            width: savedState?.width || windowConfig.width,
            height: savedState?.height || windowConfig.height,
            x: savedState?.x,
            y: savedState?.y
        };

        console.log('🪟 WindowManager: Creating window with config:', finalConfig);

        // Get project absolute path for window title
        const projectPath = process.cwd();
        const baseTitle = this.clientManager ? this.clientManager.getClientWindowTitle() : 'NoMorePassword Browser';

        this.mainWindow = new BrowserWindow({
            ...finalConfig,
            title: `${baseTitle} - ${projectPath}`,
            webPreferences: {
                contextIsolation: true,
                nodeIntegration: false,
                preload: path.join(__dirname, '../pages/preload.js'),
                webviewTag: true  // Enable webview tag for embedded page previews
            }
        });

        // Restore maximized state after window is created
        if (savedState?.isMaximized) {
            console.log('🪟 WindowManager: Restoring maximized state');
            this.mainWindow.maximize();
        }

        // Add debugging for renderer process
        this.mainWindow.webContents.on('did-finish-load', () => {
            console.log('🎯 WindowManager: Main window finished loading');
        });

        this.mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
            console.error('❌ WindowManager: Main window failed to load:', errorCode, errorDescription);
        });

        this.mainWindow.webContents.on('dom-ready', () => {
            console.log('🎯 WindowManager: DOM ready');
        });

        this.mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
            console.log(`🎯 Renderer Console [${level}]: ${message}`);
        });

        // Load client-specific interface
        this.loadClientInterface();

        this.setupWindowEvents();

        return this.mainWindow;
    }

    /**
     * Load client-specific interface
     */
    loadClientInterface() {
        if (!this.mainWindow) return;

        const currentClient = this.clientManager ? this.clientManager.getCurrentClient() : 'c-client';

        let interfaceFile;

        if (currentClient === 'b-client') {
            interfaceFile = path.join(__dirname, '../../discard-b/pages/dashboard.html');
        } else {
            interfaceFile = path.join(__dirname, '../pages/index.html');
        }

        // Add page load event listeners
        this.mainWindow.webContents.once('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
            console.error(`❌ WindowManager: Page failed to load: ${interfaceFile}`);
            console.error(`❌ WindowManager: Error: ${errorCode} - ${errorDescription}`);
        });

        this.mainWindow.loadFile(interfaceFile);
    }

    /**
     * Reload interface for current client
     */
    reloadClientInterface() {
        try {
            this.loadClientInterface();

            this.mainWindow.once('ready-to-show', () => {
                this.mainWindow.show();
            });

            return this.mainWindow;
        } catch (error) {
            console.error('❌ WindowManager: Error reloading client interface:', error);
            throw error;
        }
    }

    /**
     * Setup window event listeners
     */
    setupWindowEvents() {
        if (!this.mainWindow) return;

        let resizeTimeout;

        // Window resize event
        this.mainWindow.on('resize', () => {
            // Debounce processing to avoid frequent adjustments
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                this.onWindowResize();
                // Save window state after resize
                this.saveWindowState();
            }, 100); // 100ms debounce
        });

        // Window move event (optional)
        this.mainWindow.on('moved', () => {
            this.onWindowMove();
            // Save window position after move
            this.saveWindowState();
        });

        // Window maximize event
        this.mainWindow.on('maximize', () => {
            // Save maximized state
            this.saveWindowState();
        });

        // Window unmaximize event
        this.mainWindow.on('unmaximize', () => {
            // Save unmaximized state
            this.saveWindowState();
        });

        // Window close event
        this.mainWindow.on('close', async (event) => {
            console.log('🚪 WindowManager: Main window closing, starting cleanup...');

            // Save window state before closing
            this.saveWindowState();

            // Clear all sessions and login status (same as user switch)
            if (this.viewManager) {
                try {
                    console.log('🧹 WindowManager: Clearing all sessions including persistent partitions...');
                    await this.viewManager.clearAllSessions();
                    console.log('✅ WindowManager: All sessions cleared successfully');
                } catch (error) {
                    console.error('❌ WindowManager: Error clearing sessions:', error);
                    console.error('❌ WindowManager: Error details:', {
                        message: error.message,
                        stack: error.stack
                    });
                }
            } else {
                console.error('❌ WindowManager: ViewManager not available for session cleanup');
            }

            if (this.historyManager) {
                try {
                    this.historyManager.logShutdown('window-close');
                } catch (error) {
                    console.error('❌ WindowManager: Error logging shutdown:', error);
                }
            }
        });

        // Window about to close event
        this.mainWindow.on('closed', () => {
            this.mainWindow = null;
        });

        // Window focus event
        this.mainWindow.on('focus', () => {
        });

        // Window blur event
        this.mainWindow.on('blur', () => {
        });

        // Window minimize event
        this.mainWindow.on('minimize', () => {
            // Window minimized
        });

        // Window restore event
        this.mainWindow.on('restore', () => {
            // Window restored
        });

        // Window enter full screen event
        this.mainWindow.on('enter-full-screen', () => {
            // Window entered full screen
        });

        // Window leave full screen event
        this.mainWindow.on('leave-full-screen', () => {
            // Window left full screen
        });

        // Window show event
        this.mainWindow.on('show', () => {
        });

        // Window hide event
        this.mainWindow.on('hide', () => {
            // Window hidden
        });
    }

    /**
     * Handle window resize
     */
    onWindowResize() {
        if (this.resizeCallback) {
            const bounds = this.getViewBounds();
            this.resizeCallback(bounds);
        }
    }

    /**
     * Handle window move
     */
    onWindowMove() {
        if (this.moveCallback) {
            const bounds = this.getViewBounds();
            this.moveCallback(bounds);
        }
    }

    /**
     * Set window resize callback
     * @param {Function} callback Callback function
     */
    setResizeCallback(callback) {
        this.resizeCallback = callback;
    }

    /**
     * Set window move callback
     * @param {Function} callback Callback function
     */
    setMoveCallback(callback) {
        this.moveCallback = callback;
    }

    /**
     * Get view bounds
     * @returns {object} Bounds object {x, y, width, height}
     */
    getViewBounds() {
        if (!this.mainWindow) {
            return { x: 0, y: 86, width: 1000, height: 714 };
        }

        const [width, height] = this.mainWindow.getContentSize();
        // Actual height determined by CSS: toolbar 50px + tab bar 36px = 86px
        const topOffset = 86;

        const bounds = {
            x: 0,
            y: topOffset,
            width: width,
            height: height - topOffset
        };

        return bounds;
    }

    /**
     * Get main window instance
     * @returns {BrowserWindow|null} Main window instance
     */
    getMainWindow() {
        return this.mainWindow;
    }

    /**
     * Send message to main window
     * @param {string} channel Channel name
     * @param {any} data Data
     */
    sendToWindow(channel, data) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send(channel, data);
        }
    }

    /**
     * Get window state
     * @returns {object} Window state
     */
    getWindowState() {
        if (!this.mainWindow) {
            return { isVisible: false, isDestroyed: true };
        }

        return {
            isVisible: this.mainWindow.isVisible(),
            isDestroyed: this.mainWindow.isDestroyed(),
            isMinimized: this.mainWindow.isMinimized(),
            isMaximized: this.mainWindow.isMaximized(),
            isFullScreen: this.mainWindow.isFullScreen(),
            isFocused: this.mainWindow.isFocused(),
            bounds: this.mainWindow.getBounds(),
            contentBounds: this.mainWindow.getContentBounds(),
            size: this.mainWindow.getSize(),
            position: this.mainWindow.getPosition(),
            title: this.mainWindow.getTitle()
        };
    }

    /**
     * Show window
     */
    show() {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.show();
        }
    }

    /**
     * Hide window
     */
    hide() {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.hide();
        }
    }

    /**
     * Minimize window
     */
    minimize() {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.minimize();
        }
    }

    /**
     * Maximize window
     */
    maximize() {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            if (this.mainWindow.isMaximized()) {
                this.mainWindow.unmaximize();
            } else {
                this.mainWindow.maximize();
            }
        }
    }

    /**
     * Unmaximize window
     */
    unmaximize() {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.unmaximize();
        }
    }

    /**
     * Toggle maximize state
     */
    toggleMaximize() {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            if (this.mainWindow.isMaximized()) {
                this.mainWindow.unmaximize();
            } else {
                this.mainWindow.maximize();
            }
        }
    }

    /**
     * Enter full screen
     */
    setFullScreen(flag = true) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.setFullScreen(flag);
        }
    }

    /**
     * Toggle full screen state
     */
    toggleFullScreen() {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            const isFullScreen = this.mainWindow.isFullScreen();
            this.mainWindow.setFullScreen(!isFullScreen);
        }
    }

    /**
     * Close window
     */
    close() {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.close();
        }
    }

    /**
     * Reload window
     */
    reload() {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.reload();
        }
    }

    /**
     * Force reload window
     */
    forceReload() {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.reloadIgnoringCache();
        }
    }

    /**
     * Open developer tools
     */
    openDevTools() {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.openDevTools({ mode: 'detach' });
        }
    }

    /**
     * Close developer tools
     */
    closeDevTools() {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.closeDevTools();
        }
    }

    /**
     * Toggle developer tools
     */
    toggleDevTools() {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.toggleDevTools();
        }
    }

    /**
     * Set window title
     * @param {string} title Title
     */
    setTitle(title) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.setTitle(title);
        }
    }

    /**
     * Get window title
     * @returns {string} Title
     */
    getTitle() {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            return this.mainWindow.getTitle();
        }
        return '';
    }

    /**
     * Set window size
     * @param {number} width Width
     * @param {number} height Height
     * @param {boolean} animate Whether to animate
     */
    setSize(width, height, animate = false) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.setSize(width, height, animate);
        }
    }

    /**
     * Get window size
     * @returns {number[]} [width, height]
     */
    getSize() {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            return this.mainWindow.getSize();
        }
        return [0, 0];
    }

    /**
     * Set window minimum size
     * @param {number} width Minimum width
     * @param {number} height Minimum height
     */
    setMinimumSize(width, height) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.setMinimumSize(width, height);
        }
    }

    /**
     * Set window maximum size
     * @param {number} width Maximum width
     * @param {number} height Maximum height
     */
    setMaximumSize(width, height) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.setMaximumSize(width, height);
        }
    }

    /**
     * Set window position
     * @param {number} x X coordinate
     * @param {number} y Y coordinate
     * @param {boolean} animate Whether to animate
     */
    setPosition(x, y, animate = false) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.setPosition(x, y, animate);
        }
    }

    /**
     * Get window position
     * @returns {number[]} [x, y]
     */
    getPosition() {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            return this.mainWindow.getPosition();
        }
        return [0, 0];
    }

    /**
     * Set window bounds
     * @param {object} bounds Bounds object {x, y, width, height}
     * @param {boolean} animate Whether to animate
     */
    setBounds(bounds, animate = false) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.setBounds(bounds, animate);
        }
    }

    /**
     * Get window bounds
     * @returns {object} Bounds object {x, y, width, height}
     */
    getBounds() {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            return this.mainWindow.getBounds();
        }
        return { x: 0, y: 0, width: 0, height: 0 };
    }

    /**
     * Center window
     */
    center() {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.center();
        }
    }

    /**
     * Focus window
     */
    focus() {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.focus();
        }
    }

    /**
     * Blur window (lose focus)
     */
    blur() {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.blur();
        }
    }

    /**
     * Set whether window is resizable
     * @param {boolean} resizable Whether resizable
     */
    setResizable(resizable) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.setResizable(resizable);
        }
    }

    /**
     * Check if window is resizable
     * @returns {boolean} Whether resizable
     */
    isResizable() {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            return this.mainWindow.isResizable();
        }
        return false;
    }

    /**
     * Set whether window is movable
     * @param {boolean} movable Whether movable
     */
    setMovable(movable) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.setMovable(movable);
        }
    }

    /**
     * Check if window is movable
     * @returns {boolean} Whether movable
     */
    isMovable() {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            return this.mainWindow.isMovable();
        }
        return false;
    }

    /**
     * Set whether window is always on top
     * @param {boolean} flag Whether always on top
     * @param {string} level Level
     */
    setAlwaysOnTop(flag, level = 'normal') {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.setAlwaysOnTop(flag, level);
        }
    }

    /**
     * Check if window is always on top
     * @returns {boolean} Whether always on top
     */
    isAlwaysOnTop() {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            return this.mainWindow.isAlwaysOnTop();
        }
        return false;
    }

    /**
     * Set window opacity
     * @param {number} opacity Opacity (0.0 - 1.0)
     */
    setOpacity(opacity) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.setOpacity(opacity);
        }
    }

    /**
     * Get window opacity
     * @returns {number} Opacity
     */
    getOpacity() {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            return this.mainWindow.getOpacity();
        }
        return 1.0;
    }

    /**
     * Check if window is destroyed
     * @returns {boolean} Whether destroyed
     */
    isDestroyed() {
        return !this.mainWindow || this.mainWindow.isDestroyed();
    }

    /**
     * Check if window is visible
     * @returns {boolean} Whether visible
     */
    isVisible() {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            return this.mainWindow.isVisible();
        }
        return false;
    }

    /**
     * Check if window is focused
     * @returns {boolean} Whether focused
     */
    isFocused() {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            return this.mainWindow.isFocused();
        }
        return false;
    }

    /**
     * Check if window is minimized
     * @returns {boolean} Whether minimized
     */
    isMinimized() {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            return this.mainWindow.isMinimized();
        }
        return false;
    }

    /**
     * Check if window is maximized
     * @returns {boolean} Whether maximized
     */
    isMaximized() {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            return this.mainWindow.isMaximized();
        }
        return false;
    }

    /**
     * Check if window is full screen
     * @returns {boolean} Whether full screen
     */
    isFullScreen() {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            return this.mainWindow.isFullScreen();
        }
        return false;
    }

    /**
     * Capture window screenshot
     * @returns {Promise<Electron.NativeImage>} Screenshot
     */
    async captureWindow() {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            return await this.mainWindow.capturePage();
        }
        return null;
    }

    /**
     * Flash window (for notification)
     * @param {boolean} flag Whether to flash
     */
    flashFrame(flag = true) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.flashFrame(flag);
        }
    }

    /**
     * Destroy window
     */
    destroy() {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.destroy();
            this.mainWindow = null;
        }
    }

    /**
     * Clean up resources
     */
    cleanup() {
        // Cleaning up WindowManager resources

        // Clear callback functions
        this.resizeCallback = null;
        this.moveCallback = null;

        // Destroy window
        this.destroy();

        // Clear history manager reference
        this.historyManager = null;

        // WindowManager resources cleaned up
    }
}

module.exports = WindowManager;