#!/usr/bin/env python3
"""
Test with different client IDs to avoid re-registration logic
"""

import asyncio
import websockets
import json
import time

async def test_different_clients():
    """Test with different client IDs"""
    print("🧪 Testing Different Client IDs")
    print("=" * 50)
    
    try:
        # Connect to WebSocket server
        websocket = await websockets.connect("ws://localhost:8766")
        print("✅ Connected to WebSocket server")
        
        # First registration
        print("\n📋 Step 1: First registration with client_1, user_1")
        register_message = {
            'type': 'c_client_register',
            'client_id': 'client_1',
            'user_id': 'user_1',
            'username': 'user1',
            'node_id': 'node_1',
            'domain_id': 'domain_1',
            'cluster_id': 'cluster_1',
            'channel_id': 'channel_1'
        }
        
        await websocket.send(json.dumps(register_message))
        print(f"📤 Sent first registration: {register_message}")
        
        # Wait for response
        response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
        response_data = json.loads(response)
        print(f"📥 Received response: {response_data}")
        
        if response_data.get('type') == 'registration_success':
            print("✅ First registration successful")
        else:
            print(f"❌ First registration failed: {response_data}")
            return
        
        # Wait a bit
        await asyncio.sleep(1)
        
        # Second registration with different client but same user
        print("\n📋 Step 2: Registration with client_2, user_1 (same user)")
        register_message2 = {
            'type': 'c_client_register',
            'client_id': 'client_2',
            'user_id': 'user_1',  # Same user
            'username': 'user1',
            'node_id': 'node_1',
            'domain_id': 'domain_1',
            'cluster_id': 'cluster_1',
            'channel_id': 'channel_1'
        }
        
        await websocket.send(json.dumps(register_message2))
        print(f"📤 Sent second registration: {register_message2}")
        
        # Wait for response
        response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
        response_data = json.loads(response)
        print(f"📥 Received response: {response_data}")
        
        if response_data.get('type') == 'registration_success':
            print("✅ Second registration successful")
        else:
            print(f"❌ Second registration failed: {response_data}")
        
        # Close connection
        await websocket.close()
        print("🔌 Connection closed")
        
    except Exception as e:
        print(f"❌ Test failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_different_clients())
