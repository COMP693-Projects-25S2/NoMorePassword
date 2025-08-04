const { app, BrowserWindow, BrowserView, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs')

//标准接收方法的参数是event和data
function writeFile(event, data) {
    console.log(data)
    const bufferData = Buffer.from(JSON.stringify(data, null, 2))
    fs.writeFileSync('D:/Course/693/Tino/electron01/files/inputData.txt', bufferData)
}
function readFile(event, data) {
    const res = fs.readFileSync('D:/Course/693/Tino/electron01/files/inputData.txt').toString()
    console.log(res)
    return res

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

    ipcMain.on('post-request', writeFile)//前端传入
    ipcMain.handle('pull-data', readFile)//后端传出

    mainWindow.loadFile('./pages/index.html');

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        mainWindow.webContents.send('init-tab');
    });

}

// ---------------- 启动 ----------------
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});