const { ipcMain } = require('electron');

// IPC handlers
class IpcHandlers {
    constructor(viewManager, historyManager) {
        this.viewManager = viewManager;
        this.historyManager = historyManager;
        this.registerHandlers();
    }

    /**
     * Register all IPC handlers
     */
    registerHandlers() {
        // Tab management
        this.registerTabHandlers();

        // History management
        this.registerHistoryHandlers();

        // Navigation control
        this.registerNavigationHandlers();

        // View management
        this.registerViewHandlers();

        // Database management
        this.registerDatabaseHandlers();
    }

    /**
     * Register tab-related handlers
     */
    registerTabHandlers() {
        // Create new tab
        ipcMain.handle('create-tab', async (_, url) => {
            try {
                const view = await this.viewManager.createBrowserView(url);
                if (view && url && this.historyManager) {
                    // Record visit start
                    const viewId = view.id || Date.now(); // Ensure viewId exists
                    const record = this.historyManager.recordVisit(url, viewId);
                    if (record) {
                        console.log(`Recorded initial visit for new tab: ${url}`);
                    }
                }
                return view;
            } catch (error) {
                console.error('Failed to create tab:', error);
                return null;
            }
        });



        // Create history tab
        ipcMain.handle('create-history-tab', async () => {
            try {
                return await this.viewManager.createHistoryView();
            } catch (error) {
                console.error('Failed to create history tab:', error);
                return null;
            }
        });



        // Switch tab
        ipcMain.handle('switch-tab', (_, id) => {
            try {
                const result = this.viewManager.switchTab(id);

                // When switching tabs, end previous tab's active records
                if (result && this.historyManager) {
                    const now = Date.now();
                    // Get all views, end active records except current view
                    const allViews = this.viewManager.getAllViews();
                    Object.keys(allViews).forEach(viewId => {
                        if (parseInt(viewId) !== parseInt(id)) {
                            this.historyManager.finishActiveRecords(parseInt(viewId), now);
                        }
                    });
                }

                return result;
            } catch (error) {
                console.error('Failed to switch tab:', error);
                return false;
            }
        });

        // Close tab
        ipcMain.handle('close-tab', (_, id) => {
            try {
                // End this tab's active records
                if (this.historyManager) {
                    this.historyManager.finishActiveRecords(id, Date.now());
                }

                return this.viewManager.closeTab(id);
            } catch (error) {
                console.error('Failed to close tab:', error);
                return null;
            }
        });

        // Get tab info
        ipcMain.handle('get-tab-info', (_, id) => {
            try {
                return this.viewManager.getTabInfo(id);
            } catch (error) {
                console.error('Failed to get tab info:', error);
                return null;
            }
        });
    }

    /**
     * Register history-related handlers
     */
    registerHistoryHandlers() {
        // Get visit history
        ipcMain.handle('get-visit-history', (_, limit) => {
            try {
                return this.historyManager.getHistory(limit);
            } catch (error) {
                console.error('Failed to get visit history:', error);
                return [];
            }
        });

        // Get visit statistics
        ipcMain.handle('get-visit-stats', () => {
            try {
                return this.historyManager.getStats();
            } catch (error) {
                console.error('Failed to get visit stats:', error);
                return {
                    totalVisits: 0,
                    totalTime: 0,
                    averageStayTime: 0,
                    topPages: {},
                    activeRecords: 0
                };
            }
        });

        // Get history data (including statistics and records)
        ipcMain.handle('get-history-data', (_, limit) => {
            try {
                return this.historyManager.getHistoryData(limit || 100);
            } catch (error) {
                console.error('Failed to get history data:', error);
                return {
                    stats: {
                        totalVisits: 0,
                        totalTime: 0,
                        averageStayTime: 0,
                        topPages: {},
                        activeRecords: 0
                    },
                    history: []
                };
            }
        });

        // Get shutdown history
        ipcMain.handle('get-shutdown-history', () => {
            try {
                return this.historyManager.getShutdownHistory();
            } catch (error) {
                console.error('Failed to get shutdown history:', error);
                return [];
            }
        });

        // Manually trigger shutdown log (for testing)
        ipcMain.handle('trigger-shutdown-log', (_, reason) => {
            try {
                this.historyManager.logShutdown(reason || 'manual');
                return true;
            } catch (error) {
                console.error('Failed to trigger shutdown log:', error);
                return false;
            }
        });

        // Get active records information
        ipcMain.handle('get-active-records', () => {
            try {
                return this.historyManager.getActiveRecordsInfo();
            } catch (error) {
                console.error('Failed to get active records:', error);
                return {
                    activeRecords: [],
                    totalActive: 0,
                    maxActive: 50
                };
            }
        });

        // Get history by date range
        ipcMain.handle('get-history-by-date-range', (_, startDate, endDate) => {
            try {
                const start = new Date(startDate);
                const end = new Date(endDate);
                return this.historyManager.getHistoryByDateRange(start, end);
            } catch (error) {
                console.error('Failed to get history by date range:', error);
                return [];
            }
        });

        // Get top domains statistics
        ipcMain.handle('get-top-domains', (_, limit) => {
            try {
                return this.historyManager.getTopDomains(limit || 10);
            } catch (error) {
                console.error('Failed to get top domains:', error);
                return [];
            }
        });

        // Export history data
        ipcMain.handle('export-history-data', (_, limit) => {
            try {
                return this.historyManager.exportHistoryData(limit);
            } catch (error) {
                console.error('Failed to export history data:', error);
                return {
                    exportTime: new Date().toISOString(),
                    error: error.message,
                    stats: {},
                    history: [],
                    shutdownHistory: [],
                    totalRecords: 0
                };
            }
        });

        // Manually record visit (for testing or special cases)
        ipcMain.handle('record-manual-visit', (_, url, viewId) => {
            try {
                if (!url || !viewId) {
                    throw new Error('URL and viewId are required');
                }
                const record = this.historyManager.recordVisit(url, viewId);
                return record;
            } catch (error) {
                console.error('Failed to record manual visit:', error);
                return null;
            }
        });

        // Update record title (for frontend manual update)
        ipcMain.handle('update-record-title', (_, recordId, title) => {
            try {
                if (!recordId || !title) {
                    throw new Error('Record ID and title are required');
                }
                // Need to get record object first here
                const record = { id: recordId };
                this.historyManager.updateRecordTitle(record, title);
                return true;
            } catch (error) {
                console.error('Failed to update record title:', error);
                return false;
            }
        });
    }

    /**
     * Register navigation-related handlers
     */
    registerNavigationHandlers() {
        // Navigate to specified URL
        ipcMain.handle('navigate-to', async (_, url) => {
            try {
                await this.viewManager.navigateTo(url);

                // Record new visit
                if (url && this.historyManager) {
                    const currentView = this.viewManager.getCurrentView();
                    if (currentView) {
                        const viewId = currentView.id || Date.now();
                        const record = this.historyManager.recordVisit(url, viewId);
                        if (record) {
                            console.log(`Recorded navigation visit: ${url}`);
                        }
                    }
                }

                return true;
            } catch (error) {
                console.error('Failed to navigate to URL:', error);
                return false;
            }
        });

        // Go back
        ipcMain.handle('go-back', () => {
            try {
                const result = this.viewManager.goBack();

                // Record back navigation
                if (result && this.historyManager) {
                    const currentView = this.viewManager.getCurrentView();
                    if (currentView && currentView.webContents) {
                        const url = currentView.webContents.getURL();
                        const viewId = currentView.id || Date.now();
                        if (url) {
                            this.historyManager.recordVisit(url, viewId);
                            console.log(`Recorded back navigation visit: ${url}`);
                        }
                    }
                }

                return result;
            } catch (error) {
                console.error('Failed to go back:', error);
                return false;
            }
        });

        // Go forward
        ipcMain.handle('go-forward', () => {
            try {
                const result = this.viewManager.goForward();

                // Record forward navigation
                if (result && this.historyManager) {
                    const currentView = this.viewManager.getCurrentView();
                    if (currentView && currentView.webContents) {
                        const url = currentView.webContents.getURL();
                        const viewId = currentView.id || Date.now();
                        if (url) {
                            this.historyManager.recordVisit(url, viewId);
                            console.log(`Recorded forward navigation visit: ${url}`);
                        }
                    }
                }

                return result;
            } catch (error) {
                console.error('Failed to go forward:', error);
                return false;
            }
        });

        // Refresh page
        ipcMain.handle('refresh', () => {
            try {
                const result = this.viewManager.refresh();

                // Record page refresh
                if (result && this.historyManager) {
                    const currentView = this.viewManager.getCurrentView();
                    if (currentView && currentView.webContents) {
                        const url = currentView.webContents.getURL();
                        const viewId = currentView.id || Date.now();
                        if (url) {
                            this.historyManager.recordVisit(url, viewId);
                            console.log(`Recorded refresh visit: ${url}`);
                        }
                    }
                }

                return result;
            } catch (error) {
                console.error('Failed to refresh page:', error);
                return false;
            }
        });
    }

    /**
     * Register view management related handlers
     */
    registerViewHandlers() {
        // Hide current BrowserView
        ipcMain.handle('hide-browser-view', () => {
            try {
                return this.viewManager.hideBrowserView();
            } catch (error) {
                console.error('Failed to hide browser view:', error);
                return false;
            }
        });

        // Show current BrowserView
        ipcMain.handle('show-browser-view', () => {
            try {
                return this.viewManager.showBrowserView();
            } catch (error) {
                console.error('Failed to show browser view:', error);
                return false;
            }
        });

        // Get current view information
        ipcMain.handle('get-current-view-info', () => {
            try {
                const currentView = this.viewManager.getCurrentView();
                if (currentView && currentView.webContents) {
                    return {
                        id: currentView.id,
                        url: currentView.webContents.getURL(),
                        title: currentView.webContents.getTitle(),
                        canGoBack: currentView.webContents.canGoBack(),
                        canGoForward: currentView.webContents.canGoForward()
                    };
                }
                return null;
            } catch (error) {
                console.error('Failed to get current view info:', error);
                return null;
            }
        });

        // Get all views information
        ipcMain.handle('get-all-views-info', () => {
            try {
                const allViews = this.viewManager.getAllViews();
                const viewsInfo = {};

                Object.entries(allViews).forEach(([viewId, view]) => {
                    if (view && view.webContents) {
                        viewsInfo[viewId] = {
                            id: viewId,
                            url: view.webContents.getURL(),
                            title: view.webContents.getTitle(),
                            canGoBack: view.webContents.canGoBack(),
                            canGoForward: view.webContents.canGoForward()
                        };
                    }
                });

                return viewsInfo;
            } catch (error) {
                console.error('Failed to get all views info:', error);
                return {};
            }
        });
    }

    /**
     * Register database management related handlers
     */
    registerDatabaseHandlers() {
        // Get database statistics
        ipcMain.handle('get-database-stats', () => {
            try {
                return this.historyManager.getDatabaseStats();
            } catch (error) {
                console.error('Failed to get database stats:', error);
                return {
                    visitHistory: 0,
                    activeRecords: 0,
                    shutdownLogs: 0
                };
            }
        });

        // Clean up old data
        ipcMain.handle('cleanup-old-data', (_, daysToKeep) => {
            try {
                const days = daysToKeep || 30;
                return this.historyManager.cleanupOldData(days);
            } catch (error) {
                console.error('Failed to cleanup old data:', error);
                return { changes: 0 };
            }
        });

        // Force write data (mainly for testing)
        ipcMain.handle('force-write-data', () => {
            try {
                this.historyManager.forceWrite();
                return true;
            } catch (error) {
                console.error('Failed to force write data:', error);
                return false;
            }
        });



        // Get browser session information
        ipcMain.handle('get-session-info', () => {
            try {
                const stats = this.historyManager.getStats();
                const activeRecords = this.historyManager.getActiveRecordsInfo();

                return {
                    totalVisits: stats.totalVisits,
                    totalTime: stats.totalTime,
                    averageStayTime: stats.averageStayTime,
                    activeRecords: activeRecords.totalActive,
                    maxActiveRecords: activeRecords.maxActive,
                    topDomains: Object.keys(stats.topPages).length,
                    sessionStartTime: new Date().toISOString() // Can store actual session start time here
                };
            } catch (error) {
                console.error('Failed to get session info:', error);
                return {
                    totalVisits: 0,
                    totalTime: 0,
                    averageStayTime: 0,
                    activeRecords: 0,
                    maxActiveRecords: 50,
                    topDomains: 0,
                    sessionStartTime: new Date().toISOString()
                };
            }
        });


    }



    /**
     * Clean up all IPC handlers
     */
    cleanup() {
        // Remove all registered handlers
        const handlers = [
            // Tab related
            'create-tab',
            'create-history-tab',
            'switch-tab',
            'close-tab',
            'get-tab-info',

            // History related
            'get-visit-history',
            'get-visit-stats',
            'get-history-data',
            'get-shutdown-history',
            'trigger-shutdown-log',
            'get-active-records',
            'get-history-by-date-range',
            'get-top-domains',
            'export-history-data',
            'record-manual-visit',
            'update-record-title',

            // Navigation related
            'navigate-to',
            'go-back',
            'go-forward',
            'refresh',

            // View management related
            'hide-browser-view',
            'show-browser-view',
            'get-current-view-info',
            'get-all-views-info',

            // Database management related
            'get-database-stats',
            'cleanup-old-data',
            'force-write-data',
            'get-session-info',


        ];

        handlers.forEach(handler => {
            ipcMain.removeHandler(handler);
        });

        console.log('IPC handlers cleaned up');
    }
}

module.exports = IpcHandlers;