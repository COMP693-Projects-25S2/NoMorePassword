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

function switchTab(id) {
    window.electronAPI.switchTab(id);
    activateTab(id);
    currentTabId = id;
    updateAddressFromTab(id);
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
            updateAddressFromTab(newActiveId);
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

window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('new-tab').onclick = () => createTab();
    document.getElementById('back').onclick = () => window.electronAPI.goBack();
    document.getElementById('forward').onclick = () => window.electronAPI.goForward();
    document.getElementById('refresh').onclick = () => window.electronAPI.refresh();

    addressBar.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const url = addressBar.value.trim();
            const validUrl = url.startsWith('http') ? url : `https://${url}`;
            createTab(validUrl); // ✅ 始终新建标签页
        }
    });

    const { ipcRenderer } = require('electron');

    ipcRenderer.on('tab-title-updated', (_, { id, title }) => {
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

    ipcRenderer.on('init-tab', () => {
        createTab();
    });
});
