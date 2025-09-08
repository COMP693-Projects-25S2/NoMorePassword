/**
 * Session Manager - Handle session related operations
 */
class SessionManager {
    constructor(viewManager) {
        this.viewManager = viewManager;
    }

    /**
     * Clear session data
     */
    async cleanupSession(view, id) {
        try {
            console.log(`🧹 Clearing session data for tab ${id}...`);

            // Clear cookies
            await view.webContents.session.clearStorageData({
                storages: ['cookies', 'localStorage', 'sessionStorage', 'cache']
            });

            // Clear cache
            await view.webContents.session.clearCache();

            console.log(`✅ Session data cleared for tab ${id}`);
        } catch (error) {
            console.error('❌ Error clearing session:', error);
        }
    }

    /**
     * Clear all sessions
     */
    async clearAllSessions() {
        try {
            console.log('🧹 Clearing all sessions...');

            // Get all views
            const views = this.viewManager.views;

            // Clear session data for all views
            for (const [id, view] of Object.entries(views)) {
                if (view && view.webContents && !view.webContents.isDestroyed()) {
                    try {
                        // Clear session data
                        await view.webContents.session.clearStorageData({
                            storages: ['cookies', 'localStorage', 'sessionStorage', 'cache']
                        });

                        // Clear cache
                        await view.webContents.session.clearCache();

                        console.log(`✅ Session cleared for view ${id}`);
                    } catch (error) {
                        console.error(`❌ Error clearing session for view ${id}:`, error);
                    }
                }
            }

            console.log('✅ All sessions cleared');

            // Try to execute logout script
            for (const [id, view] of Object.entries(views)) {
                if (view && view.webContents && !view.webContents.isDestroyed()) {
                    try {
                        await view.webContents.executeJavaScript(`
                            (function() {
                                try {
                                    console.log('🔓 Trying to execute automatic logout...');
                                    
                                    // Find logout button
                                    const logoutSelectors = [
                                        '[data-testid="AccountSwitcher_Logout_Button"]',
                                        '[aria-label*="log out"]',
                                        '[aria-label*="Log out"]',
                                        '[aria-label*="Sign out"]',
                                        '[aria-label*="sign out"]',
                                        '.logout',
                                        '[href*="logout"]',
                                        '[onclick*="logout"]'
                                    ];
                                    
                                    let logoutButton = null;
                                    for (const selector of logoutSelectors) {
                                        logoutButton = document.querySelector(selector);
                                        if (logoutButton && logoutButton.offsetParent !== null) {
                                            break;
                                        }
                                    }
                                    
                                    if (logoutButton) {
                                        console.log('🔓 Found logout button, clicking...');
                                        logoutButton.click();
                                        return { success: true, message: 'Logout button clicked' };
                                    } else {
                                        console.log('⚠️ No logout button found');
                                        return { success: false, message: 'No logout button found' };
                                    }
                                } catch (error) {
                                    console.error('❌ Error executing logout script:', error);
                                    return { success: false, error: error.message };
                                }
                            })()
                        `);
                    } catch (error) {
                        console.error(`❌ Error executing logout script for view ${id}:`, error);
                    }
                }
            }

        } catch (error) {
            console.error('❌ Error clearing all sessions:', error);
        }
    }

    /**
     * Auto-cleanup Loading... titles
     */
    autoCleanupLoadingTitles() {
        try {
            const views = this.viewManager.views;
            Object.keys(views).forEach(id => {
                const view = views[id];
                if (view && view.webContents) {
                    const currentTitle = view.webContents.getTitle();
                    if (currentTitle && currentTitle.includes('Loading...')) {
                        console.log(`🧹 Auto-cleaning Loading... title for tab ${id}`);
                        this.viewManager.updateViewTitle(id, 'Loading...');
                    }
                }
            });
        } catch (error) {
            console.error('Error in autoCleanupLoadingTitles:', error);
        }
    }
}

module.exports = SessionManager;
