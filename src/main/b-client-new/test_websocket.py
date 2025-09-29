#!/usr/bin/env python3
"""
Test script for WebSocket communication between B-Client and C-Client
"""

import asyncio
import websockets
import json
import time

async def test_websocket_connection():
    """Test WebSocket connection to C-Client"""
    try:
        # Connect to C-Client WebSocket server
        uri = "ws://localhost:8765"
        print(f"🔌 Testing connection to {uri}...")
        
        async with websockets.connect(uri) as websocket:
            print("✅ Connected to C-Client WebSocket server")
            
            # Register as B-Client
            register_message = {
                'type': 'b_client_register',
                'client_id': 'test-b-client-123'
            }
            
            await websocket.send(json.dumps(register_message))
            print("📤 Sent registration message")
            
            # Wait for response
            response = await websocket.recv()
            response_data = json.loads(response)
            print(f"📥 Received response: {response_data}")
            
            # Test cookie update
            cookie_update = {
                'type': 'cookie_update',
                'user_id': 'test-user-123',
                'username': 'testuser',
                'cookie': 'session_id=abc123; user_token=xyz789',
                'auto_refresh': True
            }
            
            await websocket.send(json.dumps(cookie_update))
            print("📤 Sent cookie update")
            
            # Wait for update response
            update_response = await websocket.recv()
            update_data = json.loads(update_response)
            print(f"📥 Received update response: {update_data}")
            
            print("✅ WebSocket communication test completed successfully!")
            
    except ConnectionRefusedError:
        print("❌ Failed to connect to C-Client WebSocket server")
        print("   Make sure C-Client is running and WebSocket server is started")
    except Exception as e:
        print(f"❌ WebSocket test failed: {e}")

if __name__ == '__main__':
    print("🧪 Starting WebSocket communication test...")
    asyncio.run(test_websocket_connection())
