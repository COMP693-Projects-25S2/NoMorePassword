#!/usr/bin/env python3
"""
Simple test for re-registration functionality
"""

import asyncio
import websockets
import json
import time

async def test_simple_reregistration():
    """Test simple re-registration scenario"""
    print("🧪 Testing Simple Re-registration")
    print("=" * 50)
    
    try:
        # Connect to WebSocket server
        websocket = await websockets.connect("ws://localhost:8766")
        print("✅ Connected to WebSocket server")
        
        # First registration
        print("\n📋 Step 1: First registration with user_1")
        register_message = {
            'type': 'c_client_register',
            'client_id': 'test_client',
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
        
        # Second registration (re-registration) with different user
        print("\n📋 Step 2: Re-registration with user_2")
        re_register_message = {
            'type': 'c_client_register',
            'client_id': 'test_client',  # Same client ID
            'user_id': 'user_2',         # Different user
            'username': 'user2',
            'node_id': 'node_1',         # Same node
            'domain_id': 'domain_2',
            'cluster_id': 'cluster_2',
            'channel_id': 'channel_2'
        }
        
        await websocket.send(json.dumps(re_register_message))
        print(f"📤 Sent re-registration: {re_register_message}")
        
        # Wait for response
        try:
            response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
            response_data = json.loads(response)
            print(f"📥 Received response: {response_data}")
            
            if response_data.get('type') == 'registration_success':
                print("✅ Re-registration successful")
            else:
                print(f"❌ Re-registration failed: {response_data}")
        except asyncio.TimeoutError:
            print("❌ Timeout waiting for re-registration response")
        except Exception as e:
            print(f"❌ Error receiving re-registration response: {e}")
        
        # Close connection
        await websocket.close()
        print("🔌 Connection closed")
        
    except Exception as e:
        print(f"❌ Test failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_simple_reregistration())
