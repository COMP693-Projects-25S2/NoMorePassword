/**
 * Test Complete NSN to B-Client WebSocket Flow
 * 
 * This script tests the complete flow:
 * 1. C-Client accesses NSN dashboard
 * 2. NSN checks B-Client WebSocket connection
 * 3. NSN returns WebSocket connection info to C-Client
 * 4. C-Client automatically connects to B-Client WebSocket
 * 5. B-Client sends session data to C-Client for auto-login
 */

const { CClientMain } = require('./main');

async function testCompleteNSNFlow() {
    console.log('🧪 ===== COMPLETE NSN TO B-CLIENT WEBSOCKET FLOW TEST =====');

    try {
        // 1. Initialize C-Client
        console.log('📝 Step 1: Initializing C-Client...');
        const cClient = new CClientMain();
        await cClient.initialize();
        console.log('✅ C-Client initialized successfully');

        // 2. Simulate NSN response with WebSocket connection request
        console.log('📝 Step 2: Simulating NSN response...');
        const nsnResponse = {
            action: 'connect_websocket',
            websocket_url: process.env.NMP_WEBSOCKET_URL || 'ws://127.0.0.1:8766',
            user_id: 'test-user-123',
            message: 'Please connect to B-Client WebSocket server'
        };

        console.log('📥 NSN Response:', JSON.stringify(nsnResponse, null, 2));

        // 3. Process NSN response and connect to WebSocket
        console.log('📝 Step 3: Processing NSN response and connecting to WebSocket...');

        if (nsnResponse.action === 'connect_websocket') {
            console.log('🔌 C-Client: Received WebSocket connection request from NSN');
            console.log(`   WebSocket URL: ${nsnResponse.websocket_url}`);
            console.log(`   User ID: ${nsnResponse.user_id}`);
            console.log(`   Message: ${nsnResponse.message}`);

            if (cClient.webSocketClient && nsnResponse.websocket_url) {
                console.log('🔌 C-Client: Connecting to NSN-provided WebSocket...');
                const success = await cClient.webSocketClient.connectToNSNProvidedWebSocket(nsnResponse.websocket_url);

                if (success) {
                    console.log('✅ C-Client: Successfully connected to NSN-provided WebSocket');
                    console.log('✅ C-Client: Ready to receive session data from B-Client');
                } else {
                    console.error('❌ C-Client: Failed to connect to NSN-provided WebSocket');
                }
            } else {
                console.error('❌ C-Client: Missing WebSocket client or URL');
            }
        }

        // 4. Simulate B-Client sending session data
        console.log('📝 Step 4: Simulating B-Client sending session data...');
        const sessionData = {
            username: 'testuser',
            node_id: 'test-node-123',
            cookie: 'test-cookie-data',
            auto_refresh: true,
            refresh_time: new Date().toISOString(),
            create_time: new Date().toISOString()
        };

        const autoLoginResponse = {
            action: 'auto_login',
            user_id: 'test-user-123',
            session_data: sessionData
        };

        console.log('📥 B-Client Auto-Login Response:', JSON.stringify(autoLoginResponse, null, 2));

        // 5. Process auto-login response
        console.log('📝 Step 5: Processing auto-login response...');
        await cClient.handleNSNResponse(autoLoginResponse);

        console.log('✅ ===== COMPLETE NSN TO B-CLIENT WEBSOCKET FLOW TEST COMPLETED =====');

    } catch (error) {
        console.error('❌ Error in complete NSN flow test:', error);
    }
}

// Run the test
if (require.main === module) {
    testCompleteNSNFlow().catch(console.error);
}

module.exports = { testCompleteNSNFlow };
