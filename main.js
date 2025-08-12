const { app, BrowserWindow, BrowserView, globalShortcut, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let views = {};
let currentViewId = null;
let viewCounter = 0;
let visitHistory = [];

// 配置常量
const CONFIG = {
    MAX_ACTIVE_RECORDS: 50,
    MERGE_THRESHOLD: 60 * 1000, // 1分钟
    WRITE_INTERVAL: 30 * 1000,  // 30秒
};

// 活跃记录管理
let activeRecords = []; // 最多50个元素
let writeTimer = null;

// 关闭时间记录类
class ShutdownLogger {
    constructor() {
        this.logPath = path.join(__dirname, 'shutdown-log.json');
        this.setupEventListeners();
    }

    log(reason = 'normal') {
        const shutdownTime = Date.now();
        const logEntry = {
            timestamp: new Date(shutdownTime).toISOString(),
            timestampMs: shutdownTime,
            reason: reason,
            platform: process.platform,
            version: app.getVersion(),
            lastVisitedUrl: this.getLastActiveUrl(),
            sessionDuration: this.calculateSessionDuration()
        };

        try {
            let logs = [];
            if (fs.existsSync(this.logPath)) {
                const data = fs.readFileSync(this.logPath, 'utf8');
                logs = JSON.parse(data);
            }

            logs.push(logEntry);
            // 只保留最近50条关闭记录
            if (logs.length > 50) {
                logs = logs.slice(-50);
            }

            fs.writeFileSync(this.logPath, JSON.stringify(logs, null, 2));
            console.log('shutdown time:', logEntry.timestamp);
            console.log('shutdown reason:', reason);

            // 处理所有活跃记录
            this.recordFinalShutdown(shutdownTime);

        } catch (error) {
            console.error('record shutdown time failed:', error);
        }
    }

    getLastActiveUrl() {
        if (activeRecords.length > 0) {
            return activeRecords[activeRecords.length - 1].url;
        }
        if (visitHistory.length > 0) {
            return visitHistory[visitHistory.length - 1].url;
        }
        return null;
    }

    calculateSessionDuration() {
        if (visitHistory.length > 0) {
            const firstVisit = new Date(visitHistory[0].timestamp).getTime();
            const now = Date.now();
            return Math.round((now - firstVisit) / 1000); // 返回秒数
        }
        return 0;
    }

    recordFinalShutdown(shutdownTime) {
        console.log('=== shutdown processing ===');
        console.log('shutdown time:', new Date(shutdownTime).toISOString());
        console.log(`Found ${activeRecords.length} active records to finish`);

        // 结束所有活跃记录
        let processedCount = 0;
        activeRecords.forEach(activeRecord => {
            const record = visitHistory[activeRecord.index];
            if (record && record.stayDuration === null) {
                const finalStayDuration = (shutdownTime - activeRecord.enterTime) / 1000;
                if (finalStayDuration >= 0) {
                    record.stayDuration = finalStayDuration;
                    processedCount++;
                    console.log(`Finished active record: ${record.url} - ${finalStayDuration.toFixed(2)}s`);
                }
            }
        });

        console.log(`Processed ${processedCount} active records during shutdown`);

        // 清空活跃记录
        activeRecords = [];

        // 强制保存
        forceWrite();
    }

    setupEventListeners() {
        // 正常关闭
        app.on('before-quit', (event) => {
            this.log('before-quit');
        });

        app.on('window-all-closed', () => {
            this.log('window-all-closed');
            if (process.platform !== 'darwin') {
                app.quit();
            }
        });

        // 异常关闭处理
        process.on('uncaughtException', (error) => {
            this.log('uncaught-exception');
            process.exit(1);
        });

        process.on('unhandledRejection', (reason, promise) => {
            this.log('unhandled-rejection');
        });

        // 系统信号处理 (Linux/macOS)
        if (process.platform !== 'win32') {
            process.on('SIGINT', () => {
                this.log('SIGINT');
                app.quit();
            });

            process.on('SIGTERM', () => {
                this.log('SIGTERM');
                app.quit();
            });
        }
    }

    // 获取关闭历史
    getShutdownHistory() {
        try {
            if (fs.existsSync(this.logPath)) {
                const data = fs.readFileSync(this.logPath, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('read shutdown history failed:', error);
        }
        return [];
    }
}

// 创建关闭记录器实例
const shutdownLogger = new ShutdownLogger();

// 访问记录管理函数
function shouldMergeWithLastRecord(url, currentTime) {
    if (visitHistory.length === 0) return false;

    const lastRecord = visitHistory[visitHistory.length - 1];
    const timeDiff = currentTime - lastRecord.enterTime;

    return lastRecord.url === url &&
        timeDiff < CONFIG.MERGE_THRESHOLD &&
        lastRecord.stayDuration === null;
}

function updateLastRecordTimestamp(currentTime) {
    if (visitHistory.length === 0) return;

    const lastRecord = visitHistory[visitHistory.length - 1];
    lastRecord.timestamp = new Date(currentTime).toISOString();

    // 更新活跃记录中的时间
    const activeRecord = activeRecords.find(ar => ar.index === visitHistory.length - 1);
    if (activeRecord) {
        // 不更新 enterTime，保持最初进入时间
        console.log(`Merged visit: ${lastRecord.url} (updated timestamp)`);
    }
}

function finishRecord(index, endTime) {
    const record = visitHistory[index];
    if (!record || record.stayDuration !== null) return;

    const activeRecord = activeRecords.find(ar => ar.index === index);
    if (!activeRecord) return;

    const stayDuration = (endTime - activeRecord.enterTime) / 1000;
    if (stayDuration >= 0) {
        record.stayDuration = stayDuration;
        console.log(`Finished record: ${record.url} - ${stayDuration.toFixed(2)}s`);
    }
}

function finishOldestActiveRecord(endTime) {
    if (activeRecords.length === 0) return;

    // 按进入时间排序，结束最早的记录
    activeRecords.sort((a, b) => a.enterTime - b.enterTime);
    const oldest = activeRecords.shift();

    finishRecord(oldest.index, endTime);
    console.log(`Finished oldest active record (limit reached): ${oldest.url}`);
}

function finishActiveRecordsByViewId(viewId, endTime) {
    const toFinish = activeRecords.filter(record => record.viewId === viewId);

    toFinish.forEach(record => {
        finishRecord(record.index, endTime);
    });

    // 从活跃记录中移除
    const beforeCount = activeRecords.length;
    activeRecords = activeRecords.filter(record => record.viewId !== viewId);
    const finishedCount = beforeCount - activeRecords.length;

    if (finishedCount > 0) {
        console.log(`Finished ${finishedCount} active records for viewId ${viewId}`);
    }
}

function createNewVisitRecord(url, viewId, currentTime) {
    return {
        url,
        title: 'Loading...', // 将在获取到标题后更新
        timestamp: new Date(currentTime).toISOString(),
        enterTime: currentTime,
        stayDuration: null,
        viewId: viewId
    };
}

function scheduleWrite() {
    if (writeTimer) return; // 已经调度了

    writeTimer = setTimeout(() => {
        saveVisitHistory();
        writeTimer = null;
    }, CONFIG.WRITE_INTERVAL);
}

function forceWrite() {
    if (writeTimer) {
        clearTimeout(writeTimer);
        writeTimer = null;
    }
    saveVisitHistory();
}

// 重新设计的 recordVisit 函数
function recordVisit(url, viewId) {
    // 跳过特殊URL
    if (!url || url === 'about:blank' || url.startsWith('chrome://') || url.startsWith('electron://')) {
        return;
    }

    const now = Date.now();
    console.log('Recording visit to:', url, 'from view:', viewId);

    // 1. 检查是否需要合并
    if (shouldMergeWithLastRecord(url, now)) {
        updateLastRecordTimestamp(now);
        scheduleWrite();
        return;
    }

    // 2. 管理活跃记录数量
    if (activeRecords.length >= CONFIG.MAX_ACTIVE_RECORDS) {
        finishOldestActiveRecord(now);
    }

    // 3. 结束当前viewId的活跃记录（活跃页面只能是一个）
    finishActiveRecordsByViewId(viewId, now);

    // 4. 创建新记录
    const newRecord = createNewVisitRecord(url, viewId, now);
    visitHistory.push(newRecord);

    // 5. 添加到活跃记录
    activeRecords.push({
        index: visitHistory.length - 1,
        url: url,
        enterTime: now,
        viewId: viewId
    });

    console.log('Visit recorded:', {
        url: newRecord.url,
        timestamp: newRecord.timestamp,
        viewId: newRecord.viewId,
        totalRecords: visitHistory.length,
        activeRecords: activeRecords.length
    });

    // 6. 异步获取页面标题并更新记录
    const currentView = views[viewId];
    if (currentView) {
        setTimeout(() => {
            currentView.webContents.executeJavaScript('document.title').then(title => {
                newRecord.title = title || 'Untitled Page';
                console.log(`Updated title for ${url}: ${newRecord.title}`);
            }).catch(err => {
                console.error('Failed to get page title:', err);
                newRecord.title = 'Unknown Title';
            });
        }, 500); // 等待页面加载
    }

    // 7. 调度写入
    scheduleWrite();
}

// 保存访问历史到文件
function saveVisitHistory() {
    try {
        const historyFile = path.join(__dirname, 'visit_history.json');
        fs.writeFileSync(historyFile, JSON.stringify(visitHistory, null, 2), 'utf8');
        console.log(`Visit history saved: ${visitHistory.length} records, ${activeRecords.length} active`);
    } catch (error) {
        console.error('Failed to save visit history:', error);
    }
}

// 加载访问历史从文件
function loadVisitHistory() {
    try {
        const historyFile = path.join(__dirname, 'visit_history.json');
        if (fs.existsSync(historyFile)) {
            const data = fs.readFileSync(historyFile, 'utf8');
            visitHistory = JSON.parse(data);
            console.log(`Loaded ${visitHistory.length} visit records from file`);

            // 重建活跃记录索引
            rebuildActiveRecords();
        } else {
            console.log('No existing history file found, starting fresh');
        }
    } catch (error) {
        console.error('Failed to load visit history:', error);
        visitHistory = []; // 重置为空数组
        activeRecords = [];
    }
}

// 重建活跃记录索引
function rebuildActiveRecords() {
    activeRecords = [];

    // 从后往前找最近的未完成记录
    for (let i = visitHistory.length - 1; i >= 0 && activeRecords.length < CONFIG.MAX_ACTIVE_RECORDS; i--) {
        const record = visitHistory[i];
        if (record.stayDuration === null) {
            activeRecords.unshift({
                index: i,
                url: record.url,
                enterTime: record.enterTime,
                viewId: record.viewId
            });
        }
    }

    console.log(`Rebuilt ${activeRecords.length} active records from history`);
}

// 获取访问统计
function getVisitStats() {
    console.log('Calculating visit stats from', visitHistory.length, 'records');

    const stats = {
        totalVisits: visitHistory.length,
        totalTime: 0,
        averageStayTime: 0,
        topPages: {},
        activeRecords: activeRecords.length
    };

    // 计算总时间和统计访问最多的页面
    let validDurations = 0;
    visitHistory.forEach(record => {
        // 跳过关闭记录
        if (record.isShutdown) return;

        // 计算总时间（只计算有效的停留时间）
        if (record.stayDuration && record.stayDuration > 0) {
            stats.totalTime += record.stayDuration;
            validDurations++;
        }

        // 统计访问最多的页面
        try {
            const domain = new URL(record.url).hostname;
            stats.topPages[domain] = (stats.topPages[domain] || 0) + 1;
        } catch (e) {
            // 如果URL无效，使用URL的前50个字符作为标识
            const key = record.url ? record.url.substring(0, 50) : 'Unknown';
            stats.topPages[key] = (stats.topPages[key] || 0) + 1;
        }
    });

    // 计算平均停留时间
    if (validDurations > 0) {
        stats.averageStayTime = stats.totalTime / validDurations;
    }

    console.log('Calculated stats:', {
        totalVisits: stats.totalVisits,
        totalTimeFormatted: `${(stats.totalTime / 60).toFixed(1)} minutes`,
        averageStayTimeFormatted: `${stats.averageStayTime.toFixed(1)} seconds`,
        validDurations: validDurations,
        topPagesCount: Object.keys(stats.topPages).length,
        activeRecords: stats.activeRecords
    });

    return stats;
}

// 公共：为某个 view 设置标题监听
function setupViewTitleListeners(view, id) {
    const sendTitle = async () => {
        try {
            const jsTitle = await view.webContents.executeJavaScript('document.title', true);
            mainWindow?.webContents.send('tab-title-updated', { id, title: jsTitle || '无标题页面' });
        } catch (err) {
            console.error(`Fetch title failed (id=${id}):`, err);
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

    // 添加窗口关闭事件监听
    mainWindow.on('close', (event) => {
        console.log('window is closing...');
        shutdownLogger.log('window-close');
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
            // 添加安全和性能优化
            webSecurity: true,
            allowRunningInsecureContent: false,
            experimentalFeatures: false,
        }
    });

    const id = ++viewCounter;
    views[id] = view;
    view.setBounds(getViewBounds());
    view.setAutoResize({ width: true, height: true });

    // 切换到新创建的视图
    if (currentViewId && views[currentViewId]) {
        mainWindow.removeBrowserView(views[currentViewId]);
    }
    currentViewId = id;
    mainWindow.addBrowserView(view);

    setupViewTitleListeners(view, id);

    // 添加错误处理，过滤常见的第三方服务错误
    view.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        // 只记录主页面的加载错误，忽略第三方资源错误
        if (event.target === view.webContents) {
            console.error(`page loading failed: ${validatedURL} - ${errorDescription}`);
        }
    });

    // 处理新窗口请求，将其转换为新标签页
    view.webContents.setWindowOpenHandler((details) => {
        console.log('New window request intercepted:', details.url);

        // 创建新标签页而不是弹窗
        createBrowserView(details.url);

        // 阻止默认的弹窗行为
        return { action: 'deny' };
    });

    // 可选：阻止某些已知的跟踪域名
    view.webContents.session.webRequest.onBeforeRequest((details, callback) => {
        const blockList = [
            'audienceexposure.com',
            'pixel-sync.sitescout.com',
            'omnitagjs.com'
            // 可以添加更多需要阻止的域名
        ];

        const shouldBlock = blockList.some(domain => details.url.includes(domain));

        if (shouldBlock) {
            console.log(`request stopped: ${details.url}`);
            callback({ cancel: true });
        } else {
            callback({ cancel: false });
        }
    });

    // 添加导航监听，记录访问历史
    view.webContents.on('did-navigate', (event, url) => {
        console.log('Navigate to:', url);
        recordVisit(url, id);
    });

    view.webContents.on('did-navigate-in-page', (event, url) => {
        console.log('Navigate in page to:', url);
        recordVisit(url, id);
    });

    try {
        await view.webContents.loadURL(url);
        console.log('Tab created and loaded:', url);
    } catch (error) {
        console.error('Failed to load URL:', error);
    }

    return { id, title: 'loading...' };
}

// 修改 createHistoryView 函数
async function createHistoryView() {
    const view = new BrowserView({
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: true,
            allowRunningInsecureContent: false,
            experimentalFeatures: false,
            // 添加 preload 脚本
            preload: path.join(__dirname, './pages/preload.js'),
        }
    });

    const id = ++viewCounter;
    views[id] = view;
    view.setBounds(getViewBounds());
    view.setAutoResize({ width: true, height: true });

    // 切换到当前视图
    if (currentViewId && views[currentViewId]) {
        mainWindow.removeBrowserView(views[currentViewId]);
    }
    currentViewId = id;
    mainWindow.addBrowserView(view);

    // 加载历史页面
    const historyPath = path.join(__dirname, './pages/history.html');

    try {
        await view.webContents.loadFile(historyPath);

        // 发送标题更新
        mainWindow?.webContents.send('tab-title-updated', { id, title: 'Browse History' });

        console.log('History view created successfully');
    } catch (error) {
        console.error('Failed to load history page:', error);
    }

    return { id, title: 'Browse History' };
}

// ---------------- IPC handlers ----------------
ipcMain.handle('create-tab', (_, url) => createBrowserView(url));

// 新增：创建历史记录标签页的 IPC handler
ipcMain.handle('create-history-tab', () => createHistoryView());

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
        // 结束该 view 的活跃记录
        const now = Date.now();
        finishActiveRecordsByViewId(id, now);

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

    setupViewTitleListeners(view, id);
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

// 添加 IPC handler 来获取访问历史
ipcMain.handle('get-visit-history', () => {
    return visitHistory;
});

ipcMain.handle('get-visit-stats', () => {
    return getVisitStats();
});

// 隐藏当前的 BrowserView
ipcMain.handle('hide-browser-view', () => {
    if (currentViewId && views[currentViewId]) {
        mainWindow.removeBrowserView(views[currentViewId]);
        return true;
    }
    return false;
});

// 显示当前的 BrowserView
ipcMain.handle('show-browser-view', () => {
    if (currentViewId && views[currentViewId]) {
        mainWindow.addBrowserView(views[currentViewId]);
        return true;
    }
    return false;
});

// 添加新的 IPC handlers 来提供历史数据
ipcMain.handle('get-history-data', () => {
    const stats = getVisitStats();
    const historyData = visitHistory.slice(-100); // 只返回最近100条

    console.log('Providing history data:', {
        statsData: stats,
        historyCount: historyData.length
    });

    return {
        stats,
        history: historyData
    };
});

// 新增：获取关闭历史的 IPC handler
ipcMain.handle('get-shutdown-history', () => {
    return shutdownLogger.getShutdownHistory();
});

// 新增：手动触发关闭记录的 IPC handler（用于测试）
ipcMain.handle('trigger-shutdown-log', (_, reason) => {
    shutdownLogger.log(reason || 'manual');
    return true;
});

// 新增：获取活跃记录信息的 IPC handler
ipcMain.handle('get-active-records', () => {
    return {
        activeRecords: activeRecords.map(ar => ({
            url: ar.url,
            enterTime: new Date(ar.enterTime).toISOString(),
            viewId: ar.viewId
        })),
        totalActive: activeRecords.length,
        maxActive: CONFIG.MAX_ACTIVE_RECORDS
    };
});

// ---------------- 启动 ----------------
app.whenReady().then(() => {
    // 启动时加载历史记录
    loadVisitHistory();

    createWindow(); // 原本的窗口创建

    // 注册快捷键
    globalShortcut.register('CommandOrControl+Shift+I', () => {
        if (views[currentViewId]) {
            views[currentViewId].webContents.openDevTools({ mode: 'detach' });
        } else if (mainWindow) {
            mainWindow.webContents.openDevTools({ mode: 'detach' });
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// 注册程序退出前的清理工作
app.on('before-quit', () => {
    // 强制保存所有数据
    forceWrite();
});