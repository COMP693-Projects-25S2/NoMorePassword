#!/usr/bin/env python3
"""
Test WebSocket connection to B-Client
"""

import asyncio
import websockets
import json
import time

async def test_connection():
    """Test WebSocket connection to B-Client"""
    try:
        # Connect to B-Client WebSocket server
        uri = "ws://localhost:8766"
        print(f"🔌 Testing connection to {uri}...")
        
        async with websockets.connect(uri) as websocket:
            print("✅ Connected to B-Client WebSocket server")
            
            # Register as C-Client
            register_message = {
                'type': 'c_client_register',
                'client_id': 'test-client-123',
                'user_id': 'test-user-456',
                'username': 'testuser'
            }
            
            await websocket.send(json.dumps(register_message))
            print("📤 Sent registration message")
            
            # Wait for response
            response = await websocket.recv()
            response_data = json.loads(response)
            print(f"📥 Received response: {response_data}")
            
            # Keep connection alive for a few seconds
            await asyncio.sleep(3)
            
            print("✅ Test completed successfully!")
            
    except Exception as e:
        print(f"❌ Test failed: {e}")

if __name__ == '__main__':
    print("🧪 Starting WebSocket connection test...")
    asyncio.run(test_connection())
