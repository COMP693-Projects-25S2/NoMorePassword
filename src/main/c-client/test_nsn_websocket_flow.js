#!/usr/bin/env node
/**
 * Test script for NSN to C-Client WebSocket connection flow
 * This script simulates the complete flow from NSN response to C-Client WebSocket connection
 */

const CClientWebSocketClient = require('./websocket/cClientWebSocketClient');

async function testNSNWebSocketFlow() {
    console.log('🧪 Testing NSN to C-Client WebSocket connection flow...');

    try {
        // 1. Create WebSocket client instance
        console.log('📝 Step 1: Creating WebSocket client instance...');
        const webSocketClient = new CClientWebSocketClient();

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

            if (webSocketClient && nsnResponse.websocket_url) {
                // Connect to NSN-provided WebSocket server
                const success = await webSocketClient.connectToNSNProvidedWebSocket(nsnResponse.websocket_url);
                if (success) {
                    console.log('✅ C-Client: Successfully connected to NSN-provided WebSocket');

                    // Wait a bit to see the connection
                    await new Promise(resolve => setTimeout(resolve, 2000));

                    // Disconnect
                    console.log('🔌 C-Client: Disconnecting from WebSocket...');
                    webSocketClient.disconnect();

                    console.log('✅ Test completed successfully!');
                } else {
                    console.error('❌ C-Client: Failed to connect to NSN-provided WebSocket');
                }
            } else {
                console.error('❌ C-Client: Missing WebSocket client or URL');
            }
        }

    } catch (error) {
        console.error('❌ Test failed with error:', error);
    }
}

// Run the test
if (require.main === module) {
    testNSNWebSocketFlow().then(() => {
        console.log('🏁 Test completed');
        process.exit(0);
    }).catch(error => {
        console.error('💥 Test failed:', error);
        process.exit(1);
    });
}

module.exports = { testNSNWebSocketFlow };
