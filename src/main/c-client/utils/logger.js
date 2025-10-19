/**
 * C-Client Logging System
 * Unified logging management for all C-Client modules
 */
const fs = require('fs');
const path = require('path');

class CClientLogger {
    constructor(logDir = null) {
        // Use exe file directory for independent log instances
        if (!logDir) {
            const { app } = require('electron');
            let exeDir;
            if (app && app.isPackaged) {
                // For packaged Electron app, use the app directory
                exeDir = path.dirname(process.execPath);
            } else {
                // For development or unpackaged app, use the current working directory
                exeDir = process.cwd();
            }
            logDir = path.join(exeDir, 'logs');
        }

        this.logDir = path.resolve(logDir);
        this.ensureLogDir();

        // Generate log filename (module_startup_date_time)
        const startTime = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        this.startTime = startTime;

        // Log file paths
        this.logFiles = {
            main: path.join(this.logDir, `cclient_main_${startTime}.log`),
            websocket: path.join(this.logDir, `cclient_websocket_${startTime}.log`),
            websocket_client: path.join(this.logDir, `cclient_websocket_client_${startTime}.log`), // Separate WebSocket Client log
            nodemanager: path.join(this.logDir, `cclient_node_allocation_${startTime}.log`), // Node allocation log file
            sync: path.join(this.logDir, `cclient_data_sync_${startTime}.log`), // Dedicated data sync log file
            syncmanager: path.join(this.logDir, `cclient_data_sync_${startTime}.log`), // Redirect to data sync file
            tabmanager: path.join(this.logDir, `cclient_tabmanager_${startTime}.log`),
            viewmanager: path.join(this.logDir, `cclient_viewmanager_${startTime}.log`),
            history: path.join(this.logDir, `cclient_history_${startTime}.log`),
            ipc: path.join(this.logDir, `cclient_ipc_${startTime}.log`),
            app: path.join(this.logDir, `cclient_app_${startTime}.log`),
            security_code: path.join(this.logDir, `cclient_security_code_${startTime}.log`),
            cluster_verification: path.join(this.logDir, `cclient_cluster_verification_${startTime}.log`), // Cluster verification log file
            node_allocation: path.join(this.logDir, `cclient_node_allocation_${startTime}.log`), // Dedicated node allocation log file
            data_sync: path.join(this.logDir, `cclient_data_sync_${startTime}.log`) // Dedicated data sync log file
        };

        // Log levels
        this.levels = {
            DEBUG: 0,
            INFO: 1,
            WARN: 2,
            ERROR: 3
        };

        this.currentLevel = this.levels.INFO; // Show INFO and above levels to console and file

        // Original console methods
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
  WebSocket Client: ${this.logFiles.websocket_client}
  NodeManager: ${this.logFiles.nodemanager}
  Node Allocation: ${this.logFiles.node_allocation}
  Data Sync: ${this.logFiles.data_sync}
  SyncManager: ${this.logFiles.syncmanager}
  TabManager: ${this.logFiles.tabmanager}
  ViewManager: ${this.logFiles.viewmanager}
  History: ${this.logFiles.history}
  IPC: ${this.logFiles.ipc}
  App: ${this.logFiles.app}
  Security Code: ${this.logFiles.security_code}
  Cluster Verification: ${this.logFiles.cluster_verification}
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
            // If write fails, use original console
            this.originalConsole.error(`Failed to write to log file: ${error.message}`);
        }
    }

    setupModuleLogging(moduleName) {
        const logger = {
            debug: (...args) => {
                const message = args.map(arg => this.formatArg(arg)).join(' ');
                this.writeToLog(moduleName, 'DEBUG', message);
                // Only show WARNING and above levels to console
                if (this.levels.DEBUG >= this.currentLevel) {
                    this.originalConsole.debug(`[${moduleName}]`, ...args);
                }
            },
            info: (...args) => {
                const message = args.map(arg => this.formatArg(arg)).join(' ');
                this.writeToLog(moduleName, 'INFO', message);
                // Only show WARNING and above levels to console
                if (this.levels.INFO >= this.currentLevel) {
                    this.originalConsole.info(`[${moduleName}]`, ...args);
                }
            },
            warn: (...args) => {
                const message = args.map(arg => this.formatArg(arg)).join(' ');
                this.writeToLog(moduleName, 'WARN', message);
                // WARNING and above levels always shown to console
                this.originalConsole.warn(`[${moduleName}]`, ...args);
            },
            error: (...args) => {
                const message = args.map(arg => this.formatArg(arg)).join(' ');
                this.writeToLog(moduleName, 'ERROR', message);
                // ERROR level always shown to console
                this.originalConsole.error(`[${moduleName}]`, ...args);
            }
        };

        return logger;
    }

    formatArg(arg) {
        if (typeof arg === 'string') {
            return arg;
        } else if (arg instanceof Error) {
            return `${arg.message}\n${arg.stack}`;
        } else if (typeof arg === 'object') {
            try {
                return JSON.stringify(arg, null, 2);
            } catch (e) {
                return String(arg);
            }
        } else {
            return String(arg);
        }
    }

    // Override console methods to also log output to file
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

    // Get module logger
    getLogger(moduleName) {
        return this.setupModuleLogging(moduleName);
    }
}

// Global logger instance
const cclientLogger = new CClientLogger();

// Export convenience functions
function getCClientLogger(moduleName) {
    return cclientLogger.getLogger(moduleName);
}

function getSyncLogger(moduleName) {
    // For sync-related modules, use sync log file
    return cclientLogger.getLogger('sync');
}

function getNodeAllocationLogger(moduleName) {
    // For node allocation-related modules, use node_allocation log file
    return cclientLogger.getLogger('node_allocation');
}

function getDataSyncLogger(moduleName) {
    // For data sync-related modules, use data_sync log file
    return cclientLogger.getLogger('data_sync');
}

function setupConsoleRedirect(moduleName) {
    return cclientLogger.overrideConsole(moduleName);
}

module.exports = {
    CClientLogger,
    getCClientLogger,
    getSyncLogger,
    getNodeAllocationLogger,
    getDataSyncLogger,
    setupConsoleRedirect,
    cclientLogger
};
