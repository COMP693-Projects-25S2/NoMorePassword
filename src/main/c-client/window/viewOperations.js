const { BrowserView } = require('electron');

/**
 * View Operations - Handle basic view operations
 */
class ViewOperations {
    constructor(viewManager) {
        this.viewManager = viewManager;
    }

    /**
     * Update current view bounds
     */
    updateCurrentViewBounds(bounds) {
        const { currentViewId, views } = this.viewManager;
        if (currentViewId && views[currentViewId] && !views[currentViewId].webContents.isDestroyed()) {
            try {
                views[currentViewId].setBounds(bounds);
            } catch (error) {
                console.error('Error setting bounds for active view:', error);
            }
        }
    }

    /**
     * Update all view bounds
     */
    updateAllViewBounds(bounds) {
        const { views } = this.viewManager;
        Object.values(views).forEach(view => {
            if (view && !view.webContents.isDestroyed()) {
                try {
                    view.setBounds(bounds);
                } catch (error) {
                    console.error('Error setting bounds for view:', error);
                }
            }
        });
    }

    /**
     * Get view bounds
     */
    getViewBounds() {
        const { mainWindow } = this.viewManager;
        if (mainWindow && mainWindow.getViewBounds) {
            return mainWindow.getViewBounds();
        }
        return { x: 0, y: 86, width: 1000, height: 714 };
    }

    /**
     * Setup title listeners for a view
     */
    setupViewTitleListeners(view, id) {
        const sendTitle = async () => {
            try {
                let title = '';

                // Method 1: Get from webContents directly
                try {
                    title = view.webContents.getTitle();
                } catch (err) {
                }

                // Method 2: Execute JavaScript if method 1 fails
                if (!title || title === 'Loading...' || title === 'Untitled Page') {
                    try {
                        // Simplified title extraction - just use the URL domain
                        const url = view.webContents.getURL();
                        const domain = new URL(url).hostname;
                        title = domain && domain !== 'localhost' ?
                            domain.charAt(0).toUpperCase() + domain.slice(1) :
                            'Page';
                    } catch (executeError) {
                        title = 'Loading...';
                    }
                }

                // Fallback: Use URL if still no title
                if (!title || title === 'Loading...' || title === 'Untitled Page') {
                    try {
                        const url = view.webContents.getURL();
                        if (url && url !== 'about:blank') {
                            const hostname = new URL(url).hostname;
                            title = hostname || 'New Tab';
                        } else {
                            title = 'New Tab';
                        }
                    } catch (urlError) {
                        title = 'New Tab';
                    }
                }

                // Update title in the UI
                this.viewManager.updateViewTitle(id, title);

            } catch (error) {
                console.error(`Error getting title for view ${id}:`, error);
                this.viewManager.updateViewTitle(id, 'Error');
            }
        };

        // Set up listeners
        if (view.webContents) {
            view.webContents.on('page-title-updated', sendTitle);
            view.webContents.on('did-finish-load', sendTitle);
            view.webContents.on('did-navigate', sendTitle);
            view.webContents.on('did-navigate-in-page', sendTitle);
        }

        // Initial title check
        setTimeout(sendTitle, 100);
    }

    /**
     * Setup navigation listeners
     */
    setupNavigationListeners(view, id) {
        const { historyManager } = this.viewManager;

        view.webContents.on('did-navigate', async (event, url) => {
            if (historyManager) {
                await historyManager.recordVisit(url, id);
            }
        });

        view.webContents.on('did-navigate-in-page', async (event, url) => {
            if (historyManager) {
                await historyManager.recordVisit(url, id);
            }
        });
    }


    /**
     * Update view title
     */
    updateViewTitle(id, title) {
        const { mainWindow } = this.viewManager;

        try {
            if (mainWindow && mainWindow.sendToWindow) {
                mainWindow.sendToWindow('tab-title-updated', {
                    id: parseInt(id),
                    title: title
                });
            }
        } catch (error) {
            console.error(`Error updating title for tab ${id}:`, error);
        }
    }

    /**
     * Switch to view
     */
    switchToView(id) {
        const { views, mainWindow } = this.viewManager;
        const targetView = views[id];

        if (!targetView || targetView.webContents.isDestroyed()) {
            console.error(`View ${id} not found or destroyed`);
            return false;
        }

        try {
            // Hide current view
            if (this.viewManager.currentViewId && views[this.viewManager.currentViewId]) {
                const currentView = views[this.viewManager.currentViewId];
                if (!currentView.webContents.isDestroyed()) {
                    // Get the actual Electron BrowserWindow instance
                    const electronMainWindow = mainWindow.windowManager ? mainWindow.windowManager.getMainWindow() : mainWindow;
                    if (electronMainWindow && typeof electronMainWindow.removeBrowserView === 'function') {
                        electronMainWindow.removeBrowserView(currentView);
                    }
                }
            }

            // Show target view
            const bounds = this.getViewBounds();
            targetView.setBounds(bounds);
            // Get the actual Electron BrowserWindow instance
            const electronMainWindow = mainWindow.windowManager ? mainWindow.windowManager.getMainWindow() : mainWindow;
            if (electronMainWindow && typeof electronMainWindow.addBrowserView === 'function') {
                electronMainWindow.addBrowserView(targetView);
            }

            // Update current view ID
            this.viewManager.currentViewId = id;

            // Send update to renderer
            if (mainWindow && mainWindow.sendToWindow) {
                mainWindow.sendToWindow('tab-switched', { id: parseInt(id) });
            }

            return true;

        } catch (error) {
            console.error(`Error switching to view ${id}:`, error);
            return false;
        }
    }

    /**
     * Close tab
     */
    closeTab(id) {
        console.log(`🗑️ ViewOperations: Starting closeTab for view ${id}...`);
        const { views, mainWindow } = this.viewManager;
        const view = views[id];

        if (!view) {
            console.warn(`⚠️ ViewOperations: View ${id} not found in views object`);
            return;
        }

        console.log(`🔍 ViewOperations: View ${id} details:`);
        console.log(`   - View exists: ${!!view}`);
        console.log(`   - View has webContents: ${!!(view && view.webContents)}`);
        console.log(`   - View webContents destroyed: ${view && view.webContents ? view.webContents.isDestroyed() : 'N/A'}`);
        console.log(`   - Main window available: ${!!mainWindow}`);
        console.log(`   - Is current view: ${this.viewManager.currentViewId === id}`);

        try {
            // Always remove from main window, regardless of whether it's the current view
            if (view.webContents && !view.webContents.isDestroyed() && mainWindow) {
                try {
                    console.log(`🧹 ViewOperations: Removing view ${id} from main window...`);
                    // Get the actual Electron BrowserWindow instance
                    const electronMainWindow = mainWindow.windowManager ? mainWindow.windowManager.getMainWindow() : mainWindow;
                    if (electronMainWindow && typeof electronMainWindow.removeBrowserView === 'function') {
                        electronMainWindow.removeBrowserView(view);
                        console.log(`✅ ViewOperations: Successfully removed view ${id} from main window`);
                    } else {
                        console.warn(`⚠️ ViewOperations: Cannot remove browser view ${id}: mainWindow.removeBrowserView not available`);
                    }
                } catch (error) {
                    console.error(`❌ ViewOperations: Error removing browser view ${id}:`, error);
                }
            } else {
                console.log(`⚠️ ViewOperations: Skipping main window removal for view ${id} - conditions not met`);
            }

            // Update current view ID if this was the current view
            if (this.viewManager.currentViewId === id) {
                console.log(`🔄 ViewOperations: Updating current view ID from ${id} to null`);
                this.viewManager.currentViewId = null;
            }

            // Destroy the view
            if (view.webContents && !view.webContents.isDestroyed()) {
                console.log(`💥 ViewOperations: Destroying webContents for view ${id}...`);
                view.webContents.destroy();
                console.log(`✅ ViewOperations: WebContents destroyed for view ${id}`);
            } else {
                console.log(`⚠️ ViewOperations: Skipping webContents destruction for view ${id} - already destroyed or not available`);
            }

            // Remove from views object
            console.log(`🗑️ ViewOperations: Removing view ${id} from views object...`);
            delete views[id];
            console.log(`✅ ViewOperations: View ${id} removed from views object`);
            console.log(`   - Views remaining: ${Object.keys(views).length}`);
            console.log(`   - View ${id} still exists: ${!!views[id]}`);

            // Notify renderer
            console.log(`📡 ViewOperations: Notifying renderer about tab closure for view ${id}...`);
            if (mainWindow && mainWindow.sendToWindow) {
                try {
                    mainWindow.sendToWindow('tab-closed', { id: parseInt(id) });
                    console.log(`✅ ViewOperations: Tab closure notification sent for view ${id}`);
                } catch (error) {
                    console.error(`❌ ViewOperations: Error sending tab closure notification for view ${id}:`, error);
                }
            } else {
                console.warn(`⚠️ ViewOperations: Main window or sendToWindow not available for view ${id} notification`);
            }

            console.log(`✅ ViewOperations: View ${id} closed successfully`);

        } catch (error) {
            console.error(`❌ ViewOperations: Error closing tab ${id}:`, error);
            console.error(`   - Error message: ${error.message}`);
            console.error(`   - Error stack: ${error.stack}`);
        }
    }

    /**
     * Navigate to URL
     */
    async navigateTo(url) {
        const { currentViewId, views } = this.viewManager;

        if (!currentViewId || !views[currentViewId]) {
            console.error('No active view to navigate');
            return false;
        }

        const currentView = views[currentViewId];

        if (currentView.webContents.isDestroyed()) {
            console.error('Current view is destroyed');
            return false;
        }

        try {
            // Process URL with parameter injection
            const { getUrlParameterInjector } = require('../utils/urlParameterInjector');
            const urlInjector = getUrlParameterInjector();

            // Get clientId from viewManager's electronApp if available
            const clientId = this.viewManager.electronApp && this.viewManager.electronApp.clientId ? this.viewManager.electronApp.clientId : null;
            const processedUrl = await urlInjector.processUrl(url, clientId);

            console.log(`🔗 ViewOperations: Navigating to URL: ${url} -> ${processedUrl}`);

            await currentView.webContents.loadURL(processedUrl);
            return true;
        } catch (error) {
            console.error(`Error navigating to ${url}:`, error);
            return false;
        }
    }
}

module.exports = ViewOperations;
