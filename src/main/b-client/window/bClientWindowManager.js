const { BrowserWindow } = require('electron');
const path = require('path');

// B-Client Window manager
class BClientWindowManager {
    constructor(historyManager, clientManager = null) {
        this.mainWindow = null;
        this.historyManager = historyManager;
        this.clientManager = clientManager;
        this.resizeCallback = null;
        this.moveCallback = null;
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

        this.mainWindow = new BrowserWindow({
            ...windowConfig,
            title: this.clientManager ? this.clientManager.getClientWindowTitle() : 'NoMorePassword Browser',
            webPreferences: {
                contextIsolation: true,
                nodeIntegration: false,
                preload: path.join(__dirname, '../pages/preload.js'),
            }
        });

        // Load B-Client dashboard interface
        this.mainWindow.loadFile(path.join(__dirname, '../pages/dashboard.html'));

        this.setupWindowEvents();

        this.mainWindow.once('ready-to-show', () => {
            this.mainWindow.show();
        });

        return this.mainWindow;
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
            }, 100); // 100ms 防抖
        });

        // Window move event (optional)
        this.mainWindow.on('moved', () => {
            this.onWindowMove();
        });

        // Window close event
        this.mainWindow.on('close', async (event) => {
            console.log('window is closing...');

            // Clear all sessions and login status
            if (this.viewManager) {
                try {
                    console.log('🧹 Window closing, starting to clear all sessions...');
                    await this.viewManager.clearAllSessions();
                } catch (error) {
                    console.error('❌ Error clearing sessions:', error);
                }
            }

            if (this.historyManager) {
                this.historyManager.logShutdown('window-close');
            }
        });

        // Window about to close event
        this.mainWindow.on('closed', () => {
            this.mainWindow = null;
        });

        // Window focus event
        this.mainWindow.on('focus', () => {
            console.log('Window focused');
        });

        // Window blur event
        this.mainWindow.on('blur', () => {
            console.log('Window blurred');
        });

        // Window minimize event
        this.mainWindow.on('minimize', () => {
            console.log('Window minimized');
        });

        // Window restore event
        this.mainWindow.on('restore', () => {
            console.log('Window restored');
        });

        // Window maximize event
        this.mainWindow.on('maximize', () => {
            console.log('Window maximized');
        });

        // Window unmaximize event
        this.mainWindow.on('unmaximize', () => {
            console.log('Window unmaximized');
        });

        // Window enter full screen event
        this.mainWindow.on('enter-full-screen', () => {
            console.log('Window entered full screen');
        });

        // Window leave full screen event
        this.mainWindow.on('leave-full-screen', () => {
            console.log('Window left full screen');
        });

        // Window show event
        this.mainWindow.on('show', () => {
            console.log('Window shown');
        });

        // Window hide event
        this.mainWindow.on('hide', () => {
            console.log('Window hidden');
        });
    }

    /**
     * Handle window resize
     */
    onWindowResize() {
        if (this.resizeCallback) {
            const bounds = this.getViewBounds();
            console.log('Window resized, updating view bounds:', bounds);
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

        console.log('Calculated view bounds:', bounds);
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
        console.log('Cleaning up WindowManager resources...');

        // Clear callback functions
        this.resizeCallback = null;
        this.moveCallback = null;

        // Destroy window
        this.destroy();

        // Clear history manager reference
        this.historyManager = null;

        console.log('WindowManager resources cleaned up');
    }
}

module.exports = BClientWindowManager;