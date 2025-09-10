
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




function createTab(url = 'https://www.google.com') {
    window.electronAPI.createTab(url).then(({ id, title }) => {
        const tabEl = document.createElement('div');
        tabEl.className = 'tab';
        tabEl.dataset.id = id;

        const titleNode = document.createElement('span');
        titleNode.className = 'title';
        titleNode.textContent = title;

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

        tabs[id] = { el: tabEl, title, titleNode, closeBtn };

        if (pendingTitles[id]) {
            titleNode.textContent = pendingTitles[id];
            delete pendingTitles[id];
        }

        currentTabId = id;
        activateTab(id);
        updateAddressFromTab(id);
    });
}

// 新增：创建历史记录标签页
function createHistoryTab() {
    window.electronAPI.createHistoryTab().then(({ id, title }) => {
        const tabEl = document.createElement('div');
        tabEl.className = 'tab history-tab'; // 添加特殊样式类
        tabEl.dataset.id = id;

        const titleNode = document.createElement('span');
        titleNode.className = 'title';
        titleNode.textContent = title;

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

        tabs[id] = { el: tabEl, title, titleNode, closeBtn, isHistory: true };

        currentTabId = id;
        activateTab(id);

        // 历史标签页不需要地址栏更新
        addressBar.value = 'browser://history';
    });
}

// Switch to a specific tab
function switchToTab(tabId) {
    if (currentTabId === tabId) return;

    // Call main process to switch tab
    window.electronAPI.switchTab(tabId).then((success) => {
        if (success) {
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
            console.error(`Failed to switch to tab ${tabId}`);
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
    window.electronAPI.closeTab(id).then((newActiveId) => {
        tabs[id]?.el.remove();
        delete tabs[id];
        if (newActiveId) {
            activateTab(newActiveId);
            currentTabId = newActiveId;

            // 检查新活动标签页的类型
            if (tabs[newActiveId] && tabs[newActiveId].isHistory) {
                addressBar.value = 'browser://history';
            } else {
                updateAddressFromTab(newActiveId);
            }
        } else {
            currentTabId = null;
            addressBar.value = '';
        }
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
            createTab(validUrl);
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



    // Init tab event listener - create initial tab when main process is ready
    window.electronAPI.onInitTab(() => {
        console.log('Received init-tab event from main process');
        console.log('Creating initial tab...');
        createTab('https://www.google.com');
    });

    // 监听自动创建的标签页
    window.electronAPI.onAutoTabCreated((_, { id, title, url }) => {
        console.log('检测到自动创建的标签页:', { id, title, url });

        // 创建标签页元素
        const tabEl = document.createElement('div');
        tabEl.className = 'tab';
        tabEl.dataset.id = id;

        const titleNode = document.createElement('span');
        titleNode.className = 'title';
        titleNode.textContent = title;

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

        tabs[id] = { el: tabEl, title, titleNode, closeBtn };

        // 激活新标签页
        currentTabId = id;
        activateTab(id);
        updateAddressFromTab(id);

        console.log('✅ 自动创建的标签页已添加到界面');
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


