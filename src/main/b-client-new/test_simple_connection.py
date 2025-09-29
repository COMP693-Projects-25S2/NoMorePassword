#!/usr/bin/env python3
"""
Simple test to verify B-Client WebSocket handler is being called
"""

import asyncio
import json
import websockets

async def test_simple_connection():
    """Test simple WebSocket connection to B-Client"""
    print("🔍 Testing simple WebSocket connection...")
    
    try:
        async with websockets.connect("ws://127.0.0.1:8766") as ws:
            print("✅ Connected to B-Client WebSocket")
            
            # Send a simple registration message
            msg = {
                "type": "c_client_register",
                "client_id": "test-simple",
                "user_id": "test-user-simple",
                "username": "testsimple",
                "node_id": "test-node-simple",
                "domain_id": None,
                "cluster_id": None,
                "channel_id": None
            }
            
            print(f"📤 Sending message: {json.dumps(msg)}")
            await ws.send(json.dumps(msg))
            
            # Wait for response
            response = json.loads(await ws.recv())
            print(f"📨 Response: {response}")
            
            if response.get('type') == 'registration_success':
                print("✅ Registration successful")
            else:
                print(f"❌ Registration failed: {response}")
                
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_simple_connection())
