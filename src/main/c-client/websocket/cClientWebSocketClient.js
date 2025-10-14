const WebSocket = require('ws');

// Import logging system
const { getCClientLogger, getSyncLogger } = require('../utils/logger');

// Import all handlers
const ConnectionManager = require('./handlers/connectionManager');
const MessageRouter = require('./handlers/messageRouter');
const AuthHandler = require('./handlers/authHandler');
const SessionManager = require('./handlers/sessionManager');
const FeedbackManager = require('./handlers/feedbackManager');
const DialogManager = require('./handlers/dialogManager');
const BatchHandler = require('./handlers/batchHandler');
const NodeCommandHandler = require('./handlers/nodeCommandHandler');
const SecurityCodeHandler = require('./handlers/securityCodeHandler');
const ClusterVerificationHandler = require('./handlers/clusterVerificationHandler');

class CClientWebSocketClient {
    constructor() {
        // Initialize logging system
        this.logger = getCClientLogger('websocket_client');
        this.syncLogger = getSyncLogger('websocket');

        // Core WebSocket properties
        this.websocket = null;
        this.clientId = null;
        this.isConnected = false;
        this.isRegistered = false;
        this.config = this.loadWebSocketConfig();
        this.reconnectInterval = this.config.reconnect_interval || 30;
        this.reconnectTimer = null;
        this.mainWindow = null;
        this.electronApp = null;

        // Additional properties used by handlers
        this.userSessionCache = {};
        this.userFlags = {};
        this.logoutHistory = {};
        this.securityCodeCallback = null;

        // Initialize all handlers
        this.connectionManager = new ConnectionManager(this);
        this.messageRouter = new MessageRouter(this);
        this.authHandler = new AuthHandler(this);
        this.sessionManager = new SessionManager(this);
        this.feedbackManager = new FeedbackManager(this);
        this.dialogManager = new DialogManager(this);
        this.batchHandler = new BatchHandler(this);
        this.nodeCommandHandler = new NodeCommandHandler(this);
        this.securityCodeHandler = new SecurityCodeHandler(this);
        this.clusterVerificationHandler = new ClusterVerificationHandler(this);

        this.logger.info('✅ CClientWebSocketClient initialized with all handlers');
    }

    // ========================================
    // Configuration Methods
    // ========================================

    loadWebSocketConfig() {
        try {
            const fs = require('fs');
            const path = require('path');
            const configPath = path.join(__dirname, '../config.json');
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            return config.websocket || { host: 'localhost', port: 8888 };
        } catch (error) {
            this.logger.error(`[WebSocket Client] Error loading config:`, error);
            return { host: 'localhost', port: 8888 };
        }
    }

    setMainWindow(mainWindow) {
        this.mainWindow = mainWindow;
        this.logger.info('Main window reference set');
    }

    setElectronApp(electronApp) {
        this.electronApp = electronApp;
        this.logger.info('ElectronApp reference set');
    }

    setClientId(clientId) {
        this.clientId = clientId;
        this.logger.info(`Client ID set: ${clientId}`);
    }

    resetRegistrationStatus() {
        this.isRegistered = false;
        this.logger.info('Registration status reset');
    }

    // ========================================
    // Connection Methods (delegate to ConnectionManager)
    // ========================================

    async connect() {
        return this.connectionManager.connect();
    }

    async connectToNSNProvidedWebSocket(websocketUrl) {
        return this.connectionManager.connectToNSNProvidedWebSocket(websocketUrl);
    }

    async connectToServer(host, port, environmentName) {
        return this.connectionManager.connectToServer(host, port, environmentName);
    }

    disconnect() {
        return this.connectionManager.disconnect();
    }

    startHeartbeat() {
        return this.connectionManager.startHeartbeat();
    }

    stopHeartbeat() {
        return this.connectionManager.stopHeartbeat();
    }

    scheduleReconnect() {
        return this.connectionManager.scheduleReconnect();
    }

    cancelReconnect() {
        return this.connectionManager.cancelReconnect();
    }

    reconnect() {
        return this.connectionManager.reconnect();
    }

    handleDisconnection() {
        return this.connectionManager.handleDisconnection();
    }

    handleUserSwitch() {
        return this.connectionManager.handleUserSwitch();
    }

    resetWebSocketConnection() {
        return this.connectionManager.resetWebSocketConnection();
    }

    markCurrentWebSocketServerAsUnavailable() {
        return this.connectionManager.markCurrentWebSocketServerAsUnavailable();
    }

    disconnectAndReconnectForUserSwitch() {
        return this.connectionManager.disconnectAndReconnectForUserSwitch();
    }

    getReadyStateName(readyState) {
        return this.connectionManager.getReadyStateName(readyState);
    }

    // ========================================
    // Message Methods (delegate to MessageRouter)
    // ========================================

    setupMessageHandler() {
        return this.messageRouter.setupMessageHandler();
    }

    onMessage(data) {
        return this.messageRouter.onMessage(data);
    }

    handleIncomingMessage(message) {
        return this.messageRouter.handleIncomingMessage(message);
    }

    sendMessage(message) {
        return this.messageRouter.sendMessage(message);
    }

    // ========================================
    // Auth Methods (delegate to AuthHandler)
    // ========================================

    getCurrentUserInfo() {
        return this.authHandler.getCurrentUserInfo();
    }

    registerCurrentUser() {
        return this.authHandler.registerCurrentUser();
    }

    reRegisterUser() {
        return this.authHandler.reRegisterUser();
    }

    isRepeatedLogout(message) {
        return this.authHandler.isRepeatedLogout(message);
    }

    checkUserLogoutStatus(userId, username) {
        return this.authHandler.checkUserLogoutStatus(userId, username);
    }

    checkNSNLoginStatus() {
        return this.authHandler.checkNSNLoginStatus();
    }

    callNSNLogoutAPI(logoutUrl, websiteRootPath) {
        return this.authHandler.callNSNLogoutAPI(logoutUrl, websiteRootPath);
    }

    handleUserLogoutNotification(message) {
        return this.authHandler.handleUserLogoutNotification(message);
    }

    handleLogoutForWebsite(message) {
        return this.authHandler.handleLogoutForWebsite(message);
    }

    async handleAutoLogin(message) {
        return this.authHandler.handleAutoLogin(message);
    }

    // ========================================
    // Session Methods (delegate to SessionManager)
    // ========================================

    async handleCookieQuery(data) {
        return this.sessionManager.handleCookieQuery(data);
    }

    async handleCookieUpdate(data) {
        return this.sessionManager.handleCookieUpdate(data);
    }

    async getStoredCookie(userId, username) {
        return this.sessionManager.getStoredCookie(userId, username);
    }

    async storeCookie(userId, username, cookie, autoRefresh) {
        return this.sessionManager.storeCookie(userId, username, cookie, autoRefresh);
    }

    async handleSessionSync(message) {
        return this.sessionManager.handleSessionSync(message);
    }

    async clearWebsiteSpecificSessions(websiteConfig) {
        return this.sessionManager.clearWebsiteSpecificSessions(websiteConfig);
    }

    async clearWebsitePersistentSessionPartition(websiteConfig) {
        return this.sessionManager.clearWebsitePersistentSessionPartition(websiteConfig);
    }

    async clearIncrementalWebsiteSessions(websiteConfig) {
        return this.sessionManager.clearIncrementalWebsiteSessions(websiteConfig);
    }

    async clearUserSessionData(user_id) {
        return this.sessionManager.clearUserSessionData(user_id);
    }

    async closeWebsiteSpecificTabs(websiteConfig) {
        return this.sessionManager.closeWebsiteSpecificTabs(websiteConfig);
    }

    async closeNSNTabsOnly() {
        return this.sessionManager.closeNSNTabsOnly();
    }

    async closeIncrementalWebsiteTabs(websiteConfig) {
        return this.sessionManager.closeIncrementalWebsiteTabs(websiteConfig);
    }

    isWebsiteUrl(url, websiteRootPath) {
        return this.sessionManager.isWebsiteUrl(url, websiteRootPath);
    }

    // ========================================
    // Feedback Methods (delegate to FeedbackManager)
    // ========================================

    sendSessionFeedback(originalMessage, success, message) {
        return this.feedbackManager.sendSessionFeedback(originalMessage, success, message);
    }

    sendLogoutFeedback(originalMessage, success, message) {
        return this.feedbackManager.sendLogoutFeedback(originalMessage, success, message);
    }

    // ========================================
    // Dialog Methods (delegate to DialogManager)
    // ========================================

    handleUserConnectedOnAnotherNode(message) {
        return this.dialogManager.handleUserConnectedOnAnotherNode(message);
    }

    handleUserConnectedOnAnotherClient(message) {
        return this.dialogManager.handleUserConnectedOnAnotherClient(message);
    }

    handleUserLogout(message) {
        return this.dialogManager.handleUserLogout(message);
    }

    showUserConnectedOnAnotherNodeDialog(message) {
        return this.dialogManager.showUserConnectedOnAnotherNodeDialog(message);
    }

    showUserAlreadyLoggedInDialog(message) {
        return this.dialogManager.showUserAlreadyLoggedInDialog(message);
    }

    showUserConnectedOnAnotherClientDialog(message) {
        return this.dialogManager.showUserConnectedOnAnotherClientDialog(message);
    }

    showDialogOnWindow(mainWindow, message, windowIndex) {
        return this.dialogManager.showDialogOnWindow(mainWindow, message, windowIndex);
    }

    // ========================================
    // Batch Methods (delegate to BatchHandler)
    // ========================================

    handleUserActivitiesBatchForward(message) {
        return this.batchHandler.handleUserActivitiesBatchForward(message);
    }

    handleUserActivitiesBatchFeedback(message) {
        return this.batchHandler.handleUserActivitiesBatchFeedback(message);
    }

    // ========================================
    // Node Command Methods (delegate to NodeCommandHandler)
    // ========================================

    async handleNodeManagerCommand(message) {
        return this.nodeCommandHandler.handleNodeManagerCommand(message);
    }

    // ========================================
    // Security Code Methods (delegate to SecurityCodeHandler)
    // ========================================

    handleSecurityCodeResponse(message) {
        return this.securityCodeHandler.handleSecurityCodeResponse(message);
    }

    requestSecurityCode(data) {
        return this.securityCodeHandler.requestSecurityCode(data);
    }

    async handleNewDeviceLogin(message) {
        return this.securityCodeHandler.handleNewDeviceLogin(message);
    }

    // ========================================
    // Cluster Verification Methods (delegate to ClusterVerificationHandler)
    // ========================================

    async handleClusterVerificationQuery(message) {
        return this.clusterVerificationHandler.handleClusterVerificationQuery(message);
    }

    async handleClusterVerificationRequest(message) {
        return this.clusterVerificationHandler.handleClusterVerificationRequest(message);
    }

    async queryValidBatchesForUser(userId, username) {
        return this.clusterVerificationHandler.queryValidBatchesForUser(userId, username);
    }

    async getBatchFirstRecord(batchId) {
        return this.clusterVerificationHandler.getBatchFirstRecord(batchId);
    }

    async sendNoValidBatchesResponse(requestId) {
        return this.clusterVerificationHandler.sendNoValidBatchesResponse(requestId);
    }

    async sendErrorResponse(requestId, errorMessage) {
        return this.clusterVerificationHandler.sendErrorResponse(requestId, errorMessage);
    }
}

module.exports = CClientWebSocketClient;
