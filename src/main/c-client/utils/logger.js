/**
 * C-Client Logging System
 * 统一管理C端所有模块的日志输出
 */
const fs = require('fs');
const path = require('path');

class CClientLogger {
    constructor(logDir = 'logs') {
        this.logDir = path.resolve(logDir);
        this.ensureLogDir();

        // 生成日志文件名（模块_启动日期_时间）
        const startTime = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        this.startTime = startTime;

        // 日志文件路径
        this.logFiles = {
            main: path.join(this.logDir, `cclient_main_${startTime}.log`),
            websocket: path.join(this.logDir, `cclient_websocket_${startTime}.log`),
            nodemanager: path.join(this.logDir, `cclient_nodemanager_${startTime}.log`),
            sync: path.join(this.logDir, `cclient_sync_${startTime}.log`), // 统一的sync日志文件
            syncmanager: path.join(this.logDir, `cclient_sync_${startTime}.log`), // 重定向到sync文件
            tabmanager: path.join(this.logDir, `cclient_tabmanager_${startTime}.log`),
            viewmanager: path.join(this.logDir, `cclient_viewmanager_${startTime}.log`),
            history: path.join(this.logDir, `cclient_history_${startTime}.log`),
            ipc: path.join(this.logDir, `cclient_ipc_${startTime}.log`),
            app: path.join(this.logDir, `cclient_app_${startTime}.log`)
        };

        // 日志级别
        this.levels = {
            DEBUG: 0,
            INFO: 1,
            WARN: 2,
            ERROR: 3
        };

        this.currentLevel = this.levels.INFO; // 显示INFO及以上级别到控制台和文件

        // 原始console方法
        this.originalConsole = {
            log: console.log,
            info: console.info,
            warn: console.warn,
            error: console.error,
            debug: console.debug
        };

        this.logStartupInfo();
    }

    ensureLogDir() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    logStartupInfo() {
        const startupMsg = `
================================================================================
C-Client Starting at ${new Date().toISOString()}
Log files created:
  Main: ${this.logFiles.main}
  WebSocket: ${this.logFiles.websocket}
  NodeManager: ${this.logFiles.nodemanager}
  SyncManager: ${this.logFiles.syncmanager}
  TabManager: ${this.logFiles.tabmanager}
  ViewManager: ${this.logFiles.viewmanager}
  History: ${this.logFiles.history}
  IPC: ${this.logFiles.ipc}
  App: ${this.logFiles.app}
================================================================================`;
        this.writeToLog('main', 'INFO', startupMsg);
    }

    writeToLog(module, level, message) {
        if (this.levels[level] < this.currentLevel) {
            return;
        }

        const timestamp = new Date().toISOString();
        const logEntry = `${timestamp} - ${module.toUpperCase()} - ${level} - ${message}\n`;

        try {
            fs.appendFileSync(this.logFiles[module] || this.logFiles.main, logEntry, 'utf8');
        } catch (error) {
            // 如果写入失败，使用原始console
            this.originalConsole.error(`Failed to write to log file: ${error.message}`);
        }
    }

    setupModuleLogging(moduleName) {
        const logger = {
            debug: (message) => {
                this.writeToLog(moduleName, 'DEBUG', message);
                // 只在WARNING及以上级别显示到控制台
                if (this.levels.DEBUG >= this.currentLevel) {
                    this.originalConsole.debug(`[${moduleName}] ${message}`);
                }
            },
            info: (message) => {
                this.writeToLog(moduleName, 'INFO', message);
                // 只在WARNING及以上级别显示到控制台
                if (this.levels.INFO >= this.currentLevel) {
                    this.originalConsole.info(`[${moduleName}] ${message}`);
                }
            },
            warn: (message) => {
                this.writeToLog(moduleName, 'WARN', message);
                // WARNING及以上级别总是显示到控制台
                this.originalConsole.warn(`[${moduleName}] ${message}`);
            },
            error: (message) => {
                this.writeToLog(moduleName, 'ERROR', message);
                // ERROR级别总是显示到控制台
                this.originalConsole.error(`[${moduleName}] ${message}`);
            }
        };

        return logger;
    }

    // 重写console方法，将输出也记录到日志
    overrideConsole(moduleName) {
        const moduleLogger = this.setupModuleLogging(moduleName);

        return {
            log: (message) => {
                moduleLogger.info(message);
            },
            info: (message) => {
                moduleLogger.info(message);
            },
            warn: (message) => {
                moduleLogger.warn(message);
            },
            error: (message) => {
                moduleLogger.error(message);
            },
            debug: (message) => {
                moduleLogger.debug(message);
            }
        };
    }

    // 获取模块logger
    getLogger(moduleName) {
        return this.setupModuleLogging(moduleName);
    }
}

// 全局logger实例
const cclientLogger = new CClientLogger();

// 导出便捷函数
function getCClientLogger(moduleName) {
    return cclientLogger.getLogger(moduleName);
}

function getSyncLogger(moduleName) {
    // 对于sync相关的模块，使用sync日志文件
    return cclientLogger.getLogger('sync');
}

function setupConsoleRedirect(moduleName) {
    return cclientLogger.overrideConsole(moduleName);
}

module.exports = {
    CClientLogger,
    getCClientLogger,
    getSyncLogger,
    setupConsoleRedirect,
    cclientLogger
};
