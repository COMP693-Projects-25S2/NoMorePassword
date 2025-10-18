/**
 * Optimized C-Client Logging System
 * Reduce redundant logs, keep only key actions
 */
const fs = require('fs');
const path = require('path');

class OptimizedCClientLogger {
    constructor(logDir = 'logs') {
        this.logDir = path.resolve(logDir);
        this.ensureLogDir();

        // Generate log filename (module_startup_date_time)
        const startTime = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        this.startTime = startTime;

        // Log file paths
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

        // Log levels
        this.levels = {
            DEBUG: 0,
            INFO: 1,
            WARN: 2,
            ERROR: 3
        };

        // Only show INFO and above levels to console
        this.currentLevel = this.levels.INFO;

        // Log filter - filter out redundant debug info
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

        // Filter redundant info
        if (this.shouldFilterMessage(message)) {
            return;
        }

        const timestamp = new Date().toISOString();
        const logEntry = `${timestamp} - ${module.toUpperCase()} - ${level} - ${message}\n`;

        try {
            fs.appendFileSync(this.logFiles[module] || this.logFiles.main, logEntry, 'utf8');
        } catch (error) {
            // If write fails, use original console
            console.error(`Failed to write to log file: ${error.message}`);
        }
    }

    shouldFilterMessage(message) {
        // Filter out debug info containing these keywords
        return this.filters.some(filter => message.includes(filter));
    }

    setupModuleLogging(moduleName) {
        const logger = {
            debug: (message) => {
                // DEBUG level not shown to console, only written to file
                this.writeToLog(moduleName, 'DEBUG', message);
            },
            info: (message) => {
                this.writeToLog(moduleName, 'INFO', message);
                // Only show key info to console
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

// Global logger instance
const optimizedLogger = new OptimizedCClientLogger();

// Export convenience function
function getOptimizedLogger(moduleName) {
    return optimizedLogger.getLogger(moduleName);
}

module.exports = {
    OptimizedCClientLogger,
    getOptimizedLogger,
    optimizedLogger
};
