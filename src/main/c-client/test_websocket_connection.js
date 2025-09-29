#!/usr/bin/env node
/**
 * Test script for C-Client WebSocket dynamic connection
 * Usage: node test_websocket_connection.js [host] [port] [environmentName]
 */

const CClientWebSocketClient = require('./websocket/cClientWebSocketClient');

async function testConnection() {
    // Get command line arguments
    const args = process.argv.slice(2);
    const host = args[0] || 'localhost';
    const port = parseInt(args[1]) || 8766;
    const environmentName = args[2] || 'Test Server';

    console.log('🧪 Testing C-Client WebSocket dynamic connection...');
    console.log(`   Target: ${environmentName} (${host}:${port})`);
    console.log('');

    // Create WebSocket client instance
    const wsClient = new CClientWebSocketClient();

    try {
        // Connect to specified server
        console.log('🔌 Attempting to connect...');
        const success = await wsClient.connectToServer(host, port, environmentName);

        if (success) {
            console.log('✅ Connection initiated successfully');

            // Wait for connection to establish
            await new Promise(resolve => setTimeout(resolve, 2000));

            if (wsClient.isConnected) {
                console.log('✅ WebSocket connection established');
                console.log(`   Client ID: ${wsClient.clientId}`);
                console.log(`   Connected to: ${environmentName} (${host}:${port})`);

                // Keep connection alive for 10 seconds
                console.log('⏰ Keeping connection alive for 10 seconds...');
                await new Promise(resolve => setTimeout(resolve, 10000));

                console.log('🔌 Disconnecting...');
                wsClient.disconnect();
                console.log('✅ Test completed successfully');
            } else {
                console.log('❌ WebSocket connection failed');
            }
        } else {
            console.log('❌ Failed to initiate connection');
        }
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

// Run the test
if (require.main === module) {
    testConnection().catch(console.error);
}

module.exports = { testConnection };
