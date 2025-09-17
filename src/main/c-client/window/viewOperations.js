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
                        title = await view.webContents.executeJavaScript(`
                            (function() {
                                let title = document.title;
                                if (!title || title === 'Loading...' || title === 'Untitled Page') {
                                    // Try meta tags
                                    const metaTitle = document.querySelector('meta[property="og:title"]');
                                    if (metaTitle) title = metaTitle.getAttribute('content');
                                    
                                    // Try h1 tags
                                    if (!title || title === 'Loading...' || title === 'Untitled Page') {
                                        const h1 = document.querySelector('h1');
                                        if (h1) title = h1.textContent.trim();
                                    }
                                    
                                    // Infer from URL domain
                                    if (!title || title === 'Loading...' || title === 'Untitled Page') {
                                        const url = window.location.href;
                                        const domain = window.location.hostname;
                                        if (domain && domain !== 'localhost') {
                                            title = domain.charAt(0).toUpperCase() + domain.slice(1);
                                        }
                                    }
                                }
                                return title || 'Untitled';
                            })()
                        `);
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

        view.webContents.on('did-navigate', (event, url) => {
            if (historyManager) {
                historyManager.recordVisit(url, id);
            }
        });

        view.webContents.on('did-navigate-in-page', (event, url) => {
            if (historyManager) {
                historyManager.recordVisit(url, id);
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
                    mainWindow.getMainWindow().removeBrowserView(currentView);
                }
            }

            // Show target view
            const bounds = this.getViewBounds();
            targetView.setBounds(bounds);
            mainWindow.getMainWindow().addBrowserView(targetView);

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
        const { views, mainWindow } = this.viewManager;
        const view = views[id];

        if (!view) {
            return;
        }

        try {
            // Remove from main window if it's the current view
            if (this.viewManager.currentViewId === id) {
                if (view.webContents && !view.webContents.isDestroyed() && mainWindow && mainWindow.getMainWindow()) {
                    mainWindow.getMainWindow().removeBrowserView(view);
                }
                this.viewManager.currentViewId = null;
            }

            // Destroy the view
            if (view.webContents && !view.webContents.isDestroyed()) {
                view.webContents.destroy();
            }

            // Remove from views object
            delete views[id];

            // Notify renderer
            if (mainWindow && mainWindow.sendToWindow) {
                mainWindow.sendToWindow('tab-closed', { id: parseInt(id) });
            }


        } catch (error) {
            console.error(`Error closing tab ${id}:`, error);
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
            const UrlParameterInjector = require('../utils/urlParameterInjector');
            const urlInjector = new UrlParameterInjector();
            const processedUrl = urlInjector.processUrl(url);

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
