
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

// 新增：创建历史记录标签页
function createHistoryTab() {
    window.electronAPI.createHistoryTab().then((result) => {
        if (result && result.success) {
            const { id, title } = result;
            const tabEl = document.createElement('div');
            tabEl.className = 'tab history-tab'; // 添加特殊样式类
            tabEl.dataset.id = id;

            const titleNode = document.createElement('span');
            titleNode.className = 'title';
            titleNode.textContent = title || 'History'; // Fallback to 'History' if title is missing

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

            tabs[id] = { el: tabEl, title: title || 'History', titleNode, closeBtn, isHistory: true };

            currentTabId = id;
            activateTab(id);

            // 历史标签页不需要地址栏更新
            addressBar.value = 'browser://history';
            console.log('✅ 历史标签页已创建并激活:', id);
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

                    // 检查新活动标签页的类型
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

// 修改后的历史显示函数 - 现在创建新标签页而不是弹框
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


    // 绑定按钮事件
    document.getElementById('new-tab').onclick = () => createTab();
    document.getElementById('back').onclick = () => window.electronAPI.goBack();
    document.getElementById('forward').onclick = () => window.electronAPI.goForward();
    document.getElementById('refresh').onclick = () => window.electronAPI.refresh();

    // 历史按钮事件 - 现在创建新标签页
    document.getElementById('history').onclick = showVisitHistory;

    // 配置弹框功能 - 独立窗口
    const configBtn = document.getElementById('config-btn');

    // 显示配置弹框
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






    addressBar.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const url = addressBar.value.trim();

            // 检查是否是特殊的浏览器协议
            if (url === 'browser://history' || url === 'history://') {
                createHistoryTab();
                return;
            }

            const validUrl = url.startsWith('http') ? url : `https://${url}`;

            // 如果有当前标签页，在当前标签页中导航；否则创建新标签页
            if (currentTabId && tabs[currentTabId]) {
                navigateToUrl(validUrl);
            } else {
                createTab(validUrl);
            }
        }
    });

    // IPC 事件监听 - 使用预加载脚本暴露的API
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

    // 监听TabManager创建的标签页 (统一的通知机制)
    console.log('🎯 Renderer: Setting up onTabCreated listener');
    window.electronAPI.onTabCreated((_, { id, url, title, metadata }) => {
        console.log('🔔 TabManager通知: 标签页已创建:', { id, url, title, metadata });

        // 检查是否已经存在该标签页的UI
        if (tabs[id]) {
            console.log(`⚠️ Tab ${id} UI already exists, updating instead of creating`);
            // 更新现有标签页
            if (tabs[id].titleNode) {
                tabs[id].titleNode.textContent = title || 'Loading...';
            }
            tabs[id].title = title || 'Loading...';
            return;
        }

        // 创建标签页元素
        const tabEl = document.createElement('div');
        tabEl.className = 'tab';
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

        tabs[id] = { el: tabEl, title: title || 'Loading...', titleNode, closeBtn, metadata };

        // 不要在这里自动激活tab，让TabManager统一管理激活状态
        // TabManager会通过tab-switched事件来通知激活状态

        console.log('✅ TabManager创建的标签页已添加到界面');
    });

    // 监听标签页标题更新
    window.electronAPI.onTabTitleUpdated((_, { id, title }) => {
        console.log('🔔 TabManager通知: 标签页标题已更新:', { id, title });

        // 更新标签页标题
        if (tabs[id] && tabs[id].titleNode) {
            tabs[id].titleNode.textContent = title;
            tabs[id].title = title;
            console.log(`✅ 标签页 ${id} 标题已更新为: ${title}`);
        } else {
            console.warn(`⚠️ 标签页 ${id} 不存在，无法更新标题`);
        }
    });

    // 监听TabManager关闭的标签页
    window.electronAPI.onTabClosed((_, { id }) => {
        console.log('🔔 TabManager通知: 标签页已关闭:', { id });

        // 移除标签页UI
        if (tabs[id]) {
            tabs[id].el.remove();
            delete tabs[id];

            // 如果关闭的是当前标签页，切换到下一个可用的标签页
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

    // 监听TabManager切换的标签页
    window.electronAPI.onTabSwitched((_, { id }) => {
        console.log('🔔 TabManager通知: 标签页已切换:', { id });

        // 更新当前标签页ID和聚焦状态
        if (tabs[id]) {
            currentTabId = id;
            activateTab(id);
            updateAddressFromTab(id);
            console.log('✅ Switched to tab', id);
        }
    });

    // 启动时创建第一个标签页 - 等待init-tab事件
    // 不在这里直接调用createTab，等待主进程的init-tab事件
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


