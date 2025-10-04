/**
 * 优化版C-Client日志系统
 * 减少冗余日志，只保留关键动作
 */
const fs = require('fs');
const path = require('path');

class OptimizedCClientLogger {
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

        // 只显示INFO及以上级别到控制台
        this.currentLevel = this.levels.INFO;

        // 日志过滤器 - 过滤掉冗余的调试信息
        this.filters = [
            'Getting current user info',
            'Current user info:',
            'Getting main node IDs',
            'Main node IDs:',
            'Re-registration details:',
            'Connection config:',
            'WebSocket object:',
            'Connection state:',
            'Connection details:'
        ];

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
Optimized Logging System - Only Key Actions Logged
Log files created:
  Main: ${this.logFiles.main}
  WebSocket: ${this.logFiles.websocket}
  NodeManager: ${this.logFiles.nodemanager}
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

        // 过滤冗余信息
        if (this.shouldFilterMessage(message)) {
            return;
        }

        const timestamp = new Date().toISOString();
        const logEntry = `${timestamp} - ${module.toUpperCase()} - ${level} - ${message}\n`;

        try {
            fs.appendFileSync(this.logFiles[module] || this.logFiles.main, logEntry, 'utf8');
        } catch (error) {
            // 如果写入失败，使用原始console
            console.error(`Failed to write to log file: ${error.message}`);
        }
    }

    shouldFilterMessage(message) {
        // 过滤掉包含这些关键词的调试信息
        return this.filters.some(filter => message.includes(filter));
    }

    setupModuleLogging(moduleName) {
        const logger = {
            debug: (message) => {
                // DEBUG级别不显示到控制台，只写入文件
                this.writeToLog(moduleName, 'DEBUG', message);
            },
            info: (message) => {
                this.writeToLog(moduleName, 'INFO', message);
                // 只显示关键信息到控制台
                if (!this.shouldFilterMessage(message)) {
                    console.info(`[${moduleName}] ${message}`);
                }
            },
            warn: (message) => {
                this.writeToLog(moduleName, 'WARN', message);
                console.warn(`[${moduleName}] ${message}`);
            },
            error: (message) => {
                this.writeToLog(moduleName, 'ERROR', message);
                console.error(`[${moduleName}] ${message}`);
            }
        };

        return logger;
    }

    getLogger(moduleName) {
        return this.setupModuleLogging(moduleName);
    }
}

// 全局logger实例
const optimizedLogger = new OptimizedCClientLogger();

// 导出便捷函数
function getOptimizedLogger(moduleName) {
    return optimizedLogger.getLogger(moduleName);
}

module.exports = {
    OptimizedCClientLogger,
    getOptimizedLogger,
    optimizedLogger
};
