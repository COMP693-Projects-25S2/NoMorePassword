const { app, BrowserWindow, BrowserView, ipcMain } = require('electron');
const path = require('path');

let mainWindow;
let views = {};
let currentViewId = null;
let viewCounter = 0;

// 公共：为某个 view 设置标题监听
function setupViewTitleListeners(view, id) {
    const sendTitle = async () => {
        try {
            const jsTitle = await view.webContents.executeJavaScript('document.title', true);
            mainWindow?.webContents.send('tab-title-updated', { id, title: jsTitle || '无标题页面' });
        } catch (err) {
            console.error(`获取标题失败 (id=${id}):`, err);
        }
    };

    // 防止重复绑定
    view.webContents.removeAllListeners('did-finish-load');
    view.webContents.removeAllListeners('did-frame-finish-load');
    view.webContents.removeAllListeners('did-navigate');
    view.webContents.removeAllListeners('page-title-updated');

    view.webContents.on('did-finish-load', () => setTimeout(sendTitle, 300));
    view.webContents.on('did-frame-finish-load', () => setTimeout(sendTitle, 500));
    view.webContents.on('did-navigate', () => setTimeout(sendTitle, 800));
    view.webContents.on('page-title-updated', (e, newTitle) => {
        e.preventDefault();
        mainWindow?.webContents.send('tab-title-updated', { id, title: newTitle });
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        autoHideMenuBar: true,
        show: false,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            preload: path.join(__dirname, './pages/preload.js'),
        }
    });

    mainWindow.loadFile('./pages/index.html');

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        mainWindow.webContents.send('init-tab');
    });

    mainWindow.on('resize', () => {
        const bounds = getViewBounds();
        Object.values(views).forEach(view => view.setBounds(bounds));
    });
}

function getViewBounds() {
    const [width, height] = mainWindow.getContentSize();
    return { x: 0, y: 86, width, height: height - 86 };
}

async function createBrowserView(url = 'https://www.google.com') {
    const view = new BrowserView({
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
        }
    });

    const id = ++viewCounter;
    views[id] = view;
    view.setBounds(getViewBounds());
    view.setAutoResize({ width: true, height: true });

    setupViewTitleListeners(view, id); // ✅ 设置标题监听

    // 立即激活一次，确保加载和 title 能正常执行
    const previousViewId = currentViewId;
    mainWindow.addBrowserView(view);
    currentViewId = id;

    await view.webContents.loadURL(url).catch(console.error);

    return { id, title: '加载中...' };
}

// ---------------- IPC handlers ----------------
ipcMain.handle('create-tab', (_, url) => createBrowserView(url));

ipcMain.handle('switch-tab', (_, id) => {
    if (views[id]) {
        if (currentViewId && views[currentViewId]) {
            mainWindow.removeBrowserView(views[currentViewId]);
        }
        currentViewId = id;
        mainWindow.addBrowserView(views[id]);
    }
});

ipcMain.handle('close-tab', (_, id) => {
    if (views[id]) {
        if (id === currentViewId) mainWindow.removeBrowserView(views[id]);
        views[id].webContents.destroy();
        delete views[id];

        const ids = Object.keys(views);
        if (ids.length > 0) {
            const newId = parseInt(ids[ids.length - 1]);
            currentViewId = newId;
            mainWindow.addBrowserView(views[newId]);
            return newId;
        } else {
            currentViewId = null;
        }
    }
    return null;
});

ipcMain.handle('navigate-to', async (_, url) => {
    const view = views[currentViewId];
    if (!view) return;

    const id = currentViewId;

    setupViewTitleListeners(view, id); // ✅ 确保标题监听绑定
    await view.webContents.loadURL(url).catch(console.error);
});

ipcMain.handle('go-back', () => {
    const wc = views[currentViewId]?.webContents;
    if (wc?.canGoBack()) wc.goBack();
});

ipcMain.handle('go-forward', () => {
    const wc = views[currentViewId]?.webContents;
    if (wc?.canGoForward()) wc.goForward();
});

ipcMain.handle('refresh', () => {
    views[currentViewId]?.webContents.reload();
});

ipcMain.handle('get-tab-info', (_, id) => {
    const view = views[id];
    if (view) {
        return {
            url: view.webContents.getURL(),
            title: view.webContents.getTitle()
        };
    }
    return null;
});

// ---------------- 启动 ----------------
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
