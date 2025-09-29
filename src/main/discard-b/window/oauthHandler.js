const { BrowserView } = require('electron');

/**
 * OAuth Handler - Handle all OAuth related operations
 */
class OAuthHandler {
    constructor(viewManager) {
        this.viewManager = viewManager;
    }

    /**
     * Simplified OAuth progress check
     */
    async checkOAuthProgress(view, id) {
        try {
            console.log('🔍 Checking OAuth progress with simplified logic...');

            // Use simplified success strategy
            const loginStatus = await this.checkLoginStatus(view, id);

            if (loginStatus.isLoggedIn) {
                console.log('✅ User is logged in, OAuth flow complete');
                view._oauthCompleted = true;
                return { success: true, message: 'User is logged in' };
            } else {
                console.log('⚠️ User not logged in yet, continuing OAuth flow');
                return { success: false, message: 'User not logged in' };
            }

        } catch (error) {
            console.error('❌ Error checking OAuth progress:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Trigger Google Sign-In on x.com login page
     */
    async triggerGoogleSignIn(view, id) {
        try {
            console.log('🔍 Processing login status...');

            // Simplified login modal handling
            const result = await view.webContents.executeJavaScript(`
            (function () {
                try {
                    // Find and close login modals
                    const modals = document.querySelectorAll('[role="dialog"], .modal, [data-testid*="modal"]');
                    let modalClosed = false;

                    if (modals.length > 0) {
                        // Try to close modals
                        const closeButtons = document.querySelectorAll('[aria-label*="close"], [data-testid*="close"]');
                        for (let btn of closeButtons) {
                            if (btn.offsetParent !== null) {
                                btn.click();
                                modalClosed = true;
                                break;
                            }
                        }
                    }

                    // Find Google login buttons
                    const googleButtons = document.querySelectorAll('[data-testid*="google"], [aria-label*="Google"], .google-signin, [class*="google"]');
                    let buttonClicked = false;

                    for (let btn of googleButtons) {
                        if (btn.offsetParent !== null && !btn.disabled) {
                            btn.click();
                            buttonClicked = true;
                            break;
                        }
                    }

                    return {
                        modalClosed: modalClosed,
                        buttonClicked: buttonClicked,
                        modalsFound: modals.length,
                        googleButtonsFound: googleButtons.length
                    };
                } catch (e) {
                    return { error: e.message };
                }
            })()
            `);

            console.log('📊 Google Sign-In trigger result:', result);
            return result;

        } catch (error) {
            console.error('❌ Error triggering Google Sign-In:', error);
            return { error: error.message };
        }
    }

    /**
     * Check login status
     */
    async checkLoginStatus(view, id) {
        try {
            console.log('🔍 Checking login status...');

            // Simplified login status check
            const loginStatus = await view.webContents.executeJavaScript(`
            (function () {
                try {
                    // Check basic login status
                    const hasUserAvatar = !!document.querySelector('[data-testid="UserAvatar"], .user-avatar');
                    const hasUserName = !!document.querySelector('[data-testid="UserName"], .user-name');
                    const hasProfileLink = !!document.querySelector('[data-testid="AppTabBar_Profile_Link"], .profile-link');
                    const hasLogoutOption = !!document.querySelector('[data-testid="AccountSwitcher_Logout_Button"], [aria-label*="log out"]');
                    
                    // Check login modals
                    const hasLoginModal = !!document.querySelector('[role="dialog"]:not([style*="display: none"]), .modal:not([style*="display: none"])');
                    
                    const isLoggedIn = (hasUserAvatar || hasUserName || hasProfileLink || hasLogoutOption) && !hasLoginModal;
                    
                    return {
                        isLoggedIn: isLoggedIn,
                        hasUserAvatar: hasUserAvatar,
                        hasUserName: hasUserName,
                        hasProfileLink: hasProfileLink,
                        hasLogoutOption: hasLogoutOption,
                        hasLoginModal: hasLoginModal,
                        url: window.location.href,
                        title: document.title
                    };
                } catch (e) {
                    return { error: e.message, isLoggedIn: false };
                }
            })()
            `);

            console.log('📊 Login status check result:', loginStatus);
            return loginStatus;

        } catch (error) {
            console.error('❌ Error checking login status:', error);
            return { error: error.message, isLoggedIn: false };
        }
    }

    /**
     * Check OAuth status for popup mode
     */
    async checkOAuthStatusForPopup(view, id, isPopupMode = false) {
        try {
            console.log('🔍 Checking OAuth status for popup mode...');

            // Execute JavaScript to check OAuth status
            const oauthStatus = await view.webContents.executeJavaScript(`
                (function() {
                    try {
                        // Check for success/error messages
                        const successMsg = document.querySelector('.success, .alert-success, [class*="success"]');
                        const errorMsg = document.querySelector('.error, .alert-error, [class*="error"]');
                        const loadingMsg = document.querySelector('.loading, .spinner, [class*="loading"]');
                        
                        const urlParams = new URLSearchParams(window.location.search);
                        const hasCode = urlParams.has('code');
                        const hasError = urlParams.has('error');
                        const hasAccessToken = urlParams.has('access_token');
                        
                        // Check page content
                        const hasSuccessText = document.body.textContent.includes('success') || 
                                             document.body.textContent.includes('Success') ||
                                             document.body.textContent.includes('authorization successful');
                        const hasErrorText = document.body.textContent.includes('error') || 
                                           document.body.textContent.includes('Error') ||
                                           document.body.textContent.includes('error occurred');
                        
                        // Check for account selection buttons or elements
                        const hasAccountSelection = document.querySelector('[data-email], .account-option, .account-item, [data-identifier], .account-picker-item') ||
                                                  document.body.textContent.includes('select account') ||
                                                  document.body.textContent.includes('Select account') ||
                                                  document.body.textContent.includes('Choose an account') ||
                                                  document.body.textContent.includes('select account') ||
                                                  document.body.textContent.includes('select Google account');
                        
                        return {
                            hasSuccessMsg: !!successMsg,
                            hasErrorMsg: !!errorMsg,
                            hasLoadingMsg: !!loadingMsg,
                            hasCode: hasCode,
                            hasError: hasError,
                            hasAccessToken: hasAccessToken,
                            hasSuccessText: hasSuccessText,
                            hasErrorText: hasErrorText,
                            hasAccountSelection: hasAccountSelection,
                            url: window.location.href,
                            title: document.title
                        };
                    } catch (error) {
                        return { error: error.message };
                    }
                })()
            `, true);

            console.log('📊 OAuth status check result:', oauthStatus);

            // If it's popup mode and on account selection page, wait for user selection
            if (isPopupMode && oauthStatus.hasAccountSelection) {
                console.log('🪟 Popup mode: Waiting for user to select account...');
                console.log('⏰ Checking account selection status every 2 seconds');

                // Check every 2 seconds if account has been selected (more frequent checks)
                const accountCheckInterval = setInterval(async () => {
                    try {
                        const newUrl = view.webContents.getURL();
                        console.log('🔄 Account selection check, current URL:', newUrl);

                        if ((newUrl.includes('x.com') || newUrl.includes('twitter.com')) &&
                            !newUrl.includes('accounts.google.com') &&
                            !newUrl.includes('gsi/select')) {
                            console.log('✅ Detected redirect back to x.com, clearing timer');
                            console.log(`🌐 Redirect URL: ${newUrl}`);
                            clearInterval(accountCheckInterval);
                            await this.verifyOAuthSuccessAndRedirect(view, id, newUrl);
                        } else if (newUrl.includes('code=') || newUrl.includes('access_token=')) {
                            console.log('🎯 Detected OAuth success indicator, waiting for redirect...');
                            console.log(`🔑 Success indicator: ${newUrl.includes('code=') ? 'Authorization code' : 'Access token'}`);

                            // Wait for Google to complete redirect
                            setTimeout(() => {
                                try {
                                    console.log('⏳ Waiting for Google to complete redirect...');
                                    this.viewManager.checkOAuthProgress(view, id);
                                } catch (error) {
                                    console.error('❌ Error in account selection redirect wait:', error);
                                }
                            }, 2000);
                        }
                    } catch (error) {
                        console.error('❌ Error in account selection interval check:', error);
                        clearInterval(accountCheckInterval);
                    }
                }, 2000); // Reduced to 2 seconds

                // Force check after 30 seconds (improved timeout from test tool)
                setTimeout(() => {
                    try {
                        clearInterval(accountCheckInterval);
                        console.log('⏰ Account selection timeout (30s), attempting manual redirect');
                        this.viewManager.forceRedirectToX(view, id);
                    } catch (error) {
                        console.error('❌ Error in account selection timeout:', error);
                    }
                }, 30000); // Improved timeout from test tool

                return { waiting: true, reason: 'account_selection' };
            }

            // Handle success cases
            if (oauthStatus.hasCode || oauthStatus.hasAccessToken || oauthStatus.hasSuccessText) {
                console.log('✅ OAuth success detected, waiting for natural redirect...');

                // Wait for natural redirect first (improved from test tool)
                setTimeout(async () => {
                    try {
                        const currentUrl = view.webContents.getURL();
                        console.log('🔄 Post-success URL check:', currentUrl);

                        if (currentUrl.includes('x.com') || currentUrl.includes('twitter.com')) {
                            console.log('✅ Natural redirect to x.com successful');
                            await this.verifyOAuthSuccessAndRedirect(view, id, currentUrl);
                        } else {
                            console.log('⚠️ Natural redirect may have failed, attempting manual redirect...');
                            // Use stored OAuth return URL if available, otherwise fallback
                            const oauthReturnUrl = view._oauthReturnUrl;
                            if (oauthReturnUrl && !oauthReturnUrl.includes('accounts.google.com')) {
                                try {
                                    await view.webContents.loadURL(oauthReturnUrl);
                                    console.log(`✅ Manual redirect to OAuth return URL: ${oauthReturnUrl}`);
                                } catch (error) {
                                    console.error(`❌ Manual redirect to OAuth return URL failed: ${oauthReturnUrl}`, error);
                                }
                            } else {
                                try {
                                    await view.webContents.loadURL('https://x.com');
                                    console.log('✅ Manual redirect to x.com (fallback)');
                                } catch (error) {
                                    console.error('❌ Manual redirect failed:', error);
                                }
                            }
                        }
                    } catch (error) {
                        console.error('❌ Error checking redirect status:', error);
                    }
                }, 10000); // Wait 10 seconds for natural redirect

            } else if (oauthStatus.hasError || oauthStatus.hasErrorText) {
                console.log('❌ OAuth error occurred, attempting to restart');
                // Use OAuth return URL if available, otherwise fallback to x.com
                setTimeout(async () => {
                    try {
                        const oauthReturnUrl = view._oauthReturnUrl;
                        if (oauthReturnUrl &&
                            !oauthReturnUrl.includes('accounts.google.com') &&
                            !oauthReturnUrl.includes('gsi/select')) {
                            console.log(`🔄 Reloading using OAuth return URL: ${oauthReturnUrl}`);
                            await view.webContents.loadURL(oauthReturnUrl);
                        } else {
                            console.log('🔄 No valid OAuth return URL, reloading x.com');
                            await view.webContents.loadURL('https://x.com');
                        }
                    } catch (error) {
                        console.error('❌ Reload failed:', error);
                    }
                }, 2000);
            } else {
                // If no clear success or failure indicators, wait longer
                console.log('⏳ OAuth status unclear, waiting longer...');

                // For popup mode, be more aggressive with redirects
                if (currentUrl.includes('ux_mode=popup')) {
                    setTimeout(async () => {
                        try {
                            const oauthReturnUrl = view._oauthReturnUrl;
                            if (oauthReturnUrl &&
                                !oauthReturnUrl.includes('accounts.google.com') &&
                                !oauthReturnUrl.includes('gsi/select')) {
                                try {
                                    await view.webContents.loadURL(oauthReturnUrl);
                                    console.log(`✅ Manual redirect to OAuth return URL: ${oauthReturnUrl}`);
                                } catch (jumpError) {
                                    console.error(`❌ Manual redirect to OAuth return URL failed: ${oauthReturnUrl}`, jumpError);
                                }
                            } else {
                                try {
                                    await view.webContents.loadURL('https://x.com');
                                    console.log('✅ Manual redirect to x.com (fallback)');
                                } catch (jumpError) {
                                    console.error('❌ Manual redirect failed:', jumpError);
                                }
                            }
                        } catch (error) {
                            console.error('❌ Error checking redirect status:', error);
                        }
                    }, 8000); // Wait 8 seconds for natural redirect
                }
            }

        } catch (error) {
            console.error('❌ Failed to check OAuth progress:', error);
        }
    }

    /**
     * Force redirect to X.com
     */
    async forceRedirectToX(view, id) {
        try {
            console.log('🔄 Force redirecting to x.com...');
            await view.webContents.loadURL('https://x.com');
            console.log('✅ Force redirect to x.com completed');
        } catch (error) {
            console.error('❌ Force redirect to x.com failed:', error);
        }
    }

    /**
     * Verify OAuth success and redirect
     */
    async verifyOAuthSuccessAndRedirect(view, id, url) {
        try {
            console.log('🔍 Verifying OAuth success and redirect...');
            console.log(`🌐 Current URL: ${url}`);

            // Mark OAuth as completed
            view._oauthCompleted = true;

            // Check if we're already on x.com
            if (url.includes('x.com') || url.includes('twitter.com')) {
                console.log('✅ Already on x.com, checking login status...');
                const loginStatus = await this.checkLoginStatus(view, id);

                if (loginStatus.isLoggedIn) {
                    console.log('✅ OAuth verification successful - user is logged in');
                    return { success: true, loggedIn: true };
                } else {
                    console.log('⚠️ On x.com but not logged in, may need additional verification');
                    return { success: true, loggedIn: false };
                }
            } else {
                console.log('🔄 Not on x.com yet, attempting redirect...');
                try {
                    await view.webContents.loadURL('https://x.com');
                    console.log('✅ Redirect to x.com initiated');
                    return { success: true, redirected: true };
                } catch (error) {
                    console.error('❌ Redirect to x.com failed:', error);
                    return { success: false, error: error.message };
                }
            }

        } catch (error) {
            console.error('❌ Error verifying OAuth success and redirect:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = OAuthHandler;
