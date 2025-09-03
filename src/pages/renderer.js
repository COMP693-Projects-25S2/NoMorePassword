let tabs = {};
let currentTabId = null;
let pendingTitles = {};

const tabsContainer = document.getElementById('tabs');
const addressBar = document.getElementById('address');



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

        tabEl.onclick = () => switchTab(id);

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

        tabEl.onclick = () => switchTab(id);

        tabs[id] = { el: tabEl, title, titleNode, closeBtn, isHistory: true };

        currentTabId = id;
        activateTab(id);

        // 历史标签页不需要地址栏更新
        addressBar.value = 'browser://history';
    });
}

function switchTab(id) {
    window.electronAPI.switchTab(id);
    activateTab(id);
    currentTabId = id;

    // 如果是历史标签页，显示特殊地址
    if (tabs[id] && tabs[id].isHistory) {
        addressBar.value = 'browser://history';
    } else {
        updateAddressFromTab(id);
    }
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







window.addEventListener('DOMContentLoaded', () => {
    // 绑定按钮事件
    document.getElementById('new-tab').onclick = () => createTab();
    document.getElementById('back').onclick = () => window.electronAPI.goBack();
    document.getElementById('forward').onclick = () => window.electronAPI.goForward();
    document.getElementById('refresh').onclick = () => window.electronAPI.refresh();

    // 历史按钮事件 - 现在创建新标签页
    document.getElementById('history').onclick = showVisitHistory;

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

        tabEl.onclick = () => switchTab(id);

        tabs[id] = { el: tabEl, title, titleNode, closeBtn };

        // 激活新标签页
        currentTabId = id;
        activateTab(id);
        updateAddressFromTab(id);

        console.log('✅ 自动创建的标签页已添加到界面');
    });

    window.electronAPI.onInitTab(() => {
        createTab();
    });


});

// 启动时创建第一个标签页
createTab('https://www.google.com');