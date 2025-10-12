
console.log('🎯 Renderer: Script loaded');

let tabs = {};
let currentTabId = null;
let pendingTitles = {};

let tabsContainer = null;
let addressBar = null;

// Handle close all tabs event (for user switching) - outside DOMContentLoaded
window.electronAPI.onCloseAllTabs(() => {
    // Ensure DOM elements are available
    if (!tabsContainer || !addressBar) {
        return;
    }

    // Close all tabs in the UI
    const tabElements = document.querySelectorAll('.tab');
    tabElements.forEach(tabEl => {
        tabEl.remove();
    });

    // Clear tabs object
    Object.keys(tabs).forEach(id => {
        delete tabs[id];
    });

    // Reset current tab
    currentTabId = null;
    addressBar.value = '';
});




function createTab(url = 'about:blank') {
    // Just call the IPC, let TabManager handle UI creation through tab-created event
    window.electronAPI.createTab(url).then((result) => {
        if (result && result.success && result.id) {
            console.log(`✅ Tab creation request sent for tab ${result.id}`);
            // Tab UI will be created by the onTabCreated listener
        } else {
            console.error('Failed to create tab:', result?.error || 'Unknown error');
        }
    }).catch((error) => {
        console.error('Error creating tab:', error);
    });
}

// New: Create history record tab
function createHistoryTab() {
    window.electronAPI.createHistoryTab().then((result) => {
        if (result && result.success) {
            console.log('✅ 历史标签页创建请求已发送，等待TabManager创建UI:', result.id);
            // Don't manually create UI here, let TabManager manage via onTabCreated event
        } else {
            console.error('❌ 创建历史标签页失败:', result?.error || 'Unknown error');
            alert('Failed to create history tab: ' + (result?.error || 'Unknown error'));
        }
    }).catch((error) => {
        console.error('❌ 创建历史标签页时发生错误:', error);
        alert('Failed to create history tab: ' + error.message);
    });
}

function navigateToUrl(url) {
    window.electronAPI.navigateTo(url).then((result) => {
        if (result && result.success) {
            console.log('✅ Navigation successful:', url);
            // Don't update address bar here - let updateAddressFromTab handle it
            // This ensures the address bar shows the full URL with NMP parameters
        } else {
            console.error('❌ Navigation failed:', result?.error || 'Unknown error');
            alert('Failed to navigate: ' + (result?.error || 'Unknown error'));
        }
    }).catch((error) => {
        console.error('❌ Navigation error:', error);
        alert('Navigation error: ' + error.message);
    });
}

// Switch to a specific tab
function switchToTab(tabId) {
    if (currentTabId === tabId) return;

    // Call main process to switch tab
    window.electronAPI.switchTab(tabId).then((result) => {
        if (result && result.success) {
            // Update tab states in renderer
            if (currentTabId && tabs[currentTabId]) {
                tabs[currentTabId].el.classList.remove('active');
            }
            if (tabs[tabId]) {
                tabs[tabId].el.classList.add('active');
            }

            currentTabId = tabId;
            updateAddressFromTab(tabId);
            console.log(`✅ Switched to tab ${tabId}`);
        } else {
            console.error(`Failed to switch to tab ${tabId}:`, result?.error || 'Unknown error');
        }
    }).catch((error) => {
        console.error(`Error switching to tab ${tabId}:`, error);
    });
}

function activateTab(id) {
    Object.entries(tabs).forEach(([tid, obj]) => {
        obj.el.classList.toggle('active', parseInt(tid) === id);
    });
}

function closeTab(id) {
    window.electronAPI.closeTab(id).then((result) => {
        if (result && result.success) {
            // Remove tab UI
            tabs[id]?.el.remove();
            delete tabs[id];

            // Check if there's a new active tab
            const remainingTabs = Object.keys(tabs);
            if (remainingTabs.length > 0) {
                // Find the next tab to activate
                const nextTabId = remainingTabs.find(tabId => parseInt(tabId) > parseInt(id)) || remainingTabs[0];
                if (nextTabId) {
                    activateTab(nextTabId);
                    currentTabId = nextTabId;

                    // Check new activity tab type
                    if (tabs[nextTabId] && tabs[nextTabId].isHistory) {
                        addressBar.value = 'browser://history';
                    } else {
                        updateAddressFromTab(nextTabId);
                    }
                }
            } else {
                currentTabId = null;
                addressBar.value = '';
            }
        } else {
            console.error('Failed to close tab:', result?.error || 'Unknown error');
        }
    }).catch((error) => {
        console.error('Error closing tab:', error);
    });
}

function updateAddressFromTab(id) {
    setTimeout(() => {
        window.electronAPI.getTabInfo(id).then(info => {
            if (!info) return;
            if (info.url) addressBar.value = info.url;
            if (info.title && tabs[id]) {
                tabs[id].title = info.title;
                tabs[id].titleNode.textContent = info.title;
                if (id === currentTabId) document.title = info.title;
            }
        });
    }, 100);
}

// Modified history display function - now creates new tab instead of modal
async function showVisitHistory() {
    try {
        createHistoryTab();
    } catch (error) {
        console.error('Failed to create history tab:', error);
        alert('Failed to create history tab');
    }
}







// Setup all event listeners and initialization
document.addEventListener('DOMContentLoaded', () => {
    // Initialize DOM elements
    tabsContainer = document.getElementById('tabs');
    addressBar = document.getElementById('address');

    if (!tabsContainer || !addressBar) {
        return;
    }


    // Bind button events
    document.getElementById('new-tab').onclick = () => createTab();
    document.getElementById('back').onclick = () => window.electronAPI.goBack();
    document.getElementById('forward').onclick = () => window.electronAPI.goForward();
    document.getElementById('refresh').onclick = () => window.electronAPI.refresh();

    // History button event - now creates new tab
    document.getElementById('history').onclick = showVisitHistory;

    // Config modal functionality - restore original modal approach
    const configBtn = document.getElementById('config-btn');

    // Show config modal
    if (configBtn) {
        configBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                const result = await window.electronAPI.openConfigModal();
                if (!result.success) {
                    console.error('Failed to open config modal:', result.error);
                }
            } catch (error) {
                console.error('Error opening config modal:', error);
            }
        });
    } else {
        console.error('❌ Config button not found!');
    }

    // Initialize UI components
    initializeUIComponents();

    // Listen to IPC messages
    setupIPCListeners();






    addressBar.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const url = addressBar.value.trim();

            // Check if it's a special browser protocol
            if (url === 'browser://history' || url === 'history://') {
                createHistoryTab();
                return;
            }

            // Add protocol if missing - use http for localhost/127.0.0.1, https for others
            let validUrl;
            if (url.startsWith('http')) {
                validUrl = url;
            } else if (url.startsWith('localhost') || url.startsWith('127.0.0.1')) {
                validUrl = `http://${url}`;
            } else {
                validUrl = `https://${url}`;
            }

            // If there's a current tab, navigate in current tab; otherwise create new tab
            if (currentTabId && tabs[currentTabId]) {
                navigateToUrl(validUrl);
            } else {
                createTab(validUrl);
            }
        }
    });

    // IPC event listeners - use API exposed by preload script
    window.electronAPI.onTabTitleUpdated((_, { id, title }) => {
        if (tabs[id]) {
            tabs[id].title = title;
            if (tabs[id].titleNode) {
                tabs[id].titleNode.textContent = title;
            }
        } else {
            pendingTitles[id] = title;
        }

        if (id === currentTabId) {
            document.title = title;
        }
    });



    // Initial tab is now created directly by TabManager in main process
    // No need to listen for init-tab event anymore

    // Listen to tabs created by TabManager (unified notification mechanism)
    console.log('🎯 Renderer: Setting up onTabCreated listener');
    window.electronAPI.onTabCreated((_, { id, url, title, metadata }) => {
        console.log('🔔 TabManager通知: 标签页已创建:', { id, url, title, metadata });

        // Check if UI for this tab already exists
        if (tabs[id]) {
            console.log(`⚠️ Tab ${id} UI already exists, updating instead of creating`);
            // Update existing tab
            if (tabs[id].titleNode) {
                tabs[id].titleNode.textContent = title || 'Loading...';
            }
            tabs[id].title = title || 'Loading...';
            return;
        }

        // Create tab element
        const tabEl = document.createElement('div');

        // Check if it's a history tab, add special style class
        if (metadata && metadata.isHistory) {
            tabEl.className = 'tab history-tab';
        } else {
            tabEl.className = 'tab';
        }

        tabEl.dataset.id = id;

        const titleNode = document.createElement('span');
        titleNode.className = 'title';
        titleNode.textContent = title || 'Loading...';

        const closeBtn = document.createElement('span');
        closeBtn.className = 'close';
        closeBtn.textContent = '×';
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            closeTab(id);
        };

        tabEl.appendChild(titleNode);
        tabEl.appendChild(closeBtn);
        tabsContainer.appendChild(tabEl);

        tabEl.onclick = () => switchToTab(id);

        // Save special marker for history tab
        tabs[id] = { el: tabEl, title: title || 'Loading...', titleNode, closeBtn, metadata };

        // If it's a history tab, set address bar
        if (metadata && metadata.isHistory) {
            addressBar.value = 'browser://history';
        }

        // Don't auto-activate tab here, let TabManager manage activation state uniformly
        // TabManager will notify activation state via tab-switched event

        console.log('✅ TabManager创建的标签页已添加到界面');
    });

    // Listen to tab title updates
    window.electronAPI.onTabTitleUpdated((_, { id, title }) => {
        console.log('🔔 TabManager通知: 标签页标题已更新:', { id, title });

        // Update tab title
        if (tabs[id] && tabs[id].titleNode) {
            tabs[id].titleNode.textContent = title;
            tabs[id].title = title;
            console.log(`✅ 标签页 ${id} 标题已更新为: ${title}`);
        } else {
            console.warn(`⚠️ 标签页 ${id} 不存在，无法更新标题`);
        }
    });

    // Listen to tabs closed by TabManager
    window.electronAPI.onTabClosed((_, { id }) => {
        console.log('🔔 TabManager通知: 标签页已关闭:', { id });

        // Remove tab UI
        if (tabs[id]) {
            tabs[id].el.remove();
            delete tabs[id];

            // If closed tab is current tab, switch to next available tab
            if (currentTabId === id) {
                const remainingTabs = Object.keys(tabs);
                if (remainingTabs.length > 0) {
                    const nextTabId = remainingTabs[0];
                    currentTabId = nextTabId;
                    activateTab(nextTabId);
                    updateAddressFromTab(nextTabId);
                } else {
                    currentTabId = null;
                    addressBar.value = '';
                }
            }
        }

        console.log('✅ TabManager关闭的标签页已从界面移除');
    });

    // Listen to tab switches by TabManager
    window.electronAPI.onTabSwitched((_, { id }) => {
        console.log('🔔 TabManager通知: 标签页已切换:', { id });

        // Update current tab ID and focus state
        if (tabs[id]) {
            currentTabId = id;
            activateTab(id);
            updateAddressFromTab(id);
            console.log('✅ Switched to tab', id);
        }
    });

    // Create first tab on startup - wait for init-tab event
    // Don't call createTab directly here, wait for main process's init-tab event
    console.log('Waiting for init-tab event from main process...');





    // Add notification system
    window.electronAPI.onShowNotification((_, notification) => {
        showNotification(notification.type, notification.message);
    });


    console.log('All event listeners and initialization completed');

    console.log('✅ 应用初始化完成');
    console.log('✅ 配置独立窗口功能已启用');
});

// Notification system
function showNotification(type, message) {
    // Remove existing notification if any
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }

    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    // Add styles
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 6px;
        color: white;
        font-weight: 600;
        z-index: 10000;
        max-width: 300px;
        word-wrap: break-word;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        transition: all 0.3s ease;
    `;

    // Set background color based on type
    if (type === 'success') {
        notification.style.background = '#4CAF50';
    } else if (type === 'error') {
        notification.style.background = '#f44336';
    } else {
        notification.style.background = '#2196F3';
    }

    // Add to page
    document.body.appendChild(notification);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }
    }, 5000);

    // Allow manual close on click
    notification.onclick = () => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    };
}

// ===================== UI Components Initialization =====================

/**
 * Initialize UI components
 */
function initializeUIComponents() {
    console.log('🎨 Initializing UI components...');

    // Load and initialize SyncDataViewer
    try {
        // Check if script is already loaded
        if (!document.querySelector('script[src="../ui/syncDataViewer.js"]')) {
            const script = document.createElement('script');
            script.src = '../ui/syncDataViewer.js';
            script.onload = () => {
                console.log('✅ SyncDataViewer component loaded');
                // Make sure the global instance is available
                if (window.syncDataViewer) {
                    console.log('✅ SyncDataViewer global instance available');
                } else {
                    console.warn('⚠️ SyncDataViewer global instance not found');
                }
            };
            script.onerror = (error) => {
                console.error('❌ Failed to load SyncDataViewer component:', error);
            };
            document.head.appendChild(script);
        } else {
            console.log('✅ SyncDataViewer script already loaded');
        }
    } catch (error) {
        console.error('❌ Error initializing SyncDataViewer:', error);
    }

    // Load and initialize SyncNotification
    try {
        // Dynamically import the SyncNotification component
        const script = document.createElement('script');
        script.src = '../ui/syncNotification.js';
        script.onload = () => {
            console.log('✅ SyncNotification component loaded');
        };
        script.onerror = (error) => {
            console.error('❌ Failed to load SyncNotification component:', error);
        };
        document.head.appendChild(script);
    } catch (error) {
        console.error('❌ Error initializing SyncNotification:', error);
    }
}

/**
 * Setup IPC listeners
 */
function setupIPCListeners() {
    console.log('📡 Setting up IPC listeners...');

    // Listen for show sync data viewer message
    window.electronAPI.onShowSyncDataViewer(() => {
        console.log('📊 Received show sync data viewer message');
        if (window.syncDataViewer) {
            window.syncDataViewer.show();
        } else {
            console.error('❌ SyncDataViewer not available');
        }
    });

    // Listen for sync data received notification
    window.electronAPI.onSyncDataReceived((data) => {
        console.log('📥 Received sync data notification:', data);
        if (window.syncNotification) {
            const { username, activitiesCount } = data;
            window.syncNotification.show(username, activitiesCount, 3000);
        } else {
            console.error('❌ SyncNotification not available');
        }
    });

    // Listen for sync data sent notification
    window.electronAPI.onSyncDataSent((data) => {
        console.log('📤 Received sync data sent notification:', data);
        if (window.syncNotification) {
            const { activitiesCount } = data;
            window.syncNotification.showSent(activitiesCount, 2000);
        } else {
            console.error('❌ SyncNotification not available');
        }
    });

    // Listen for sync error notification
    window.electronAPI.onSyncError((data) => {
        console.log('❌ Received sync error notification:', data);
        if (window.syncNotification) {
            const { errorMessage } = data;
            window.syncNotification.showError(errorMessage, 4000);
        } else {
            console.error('❌ SyncNotification not available');
        }
    });
}

