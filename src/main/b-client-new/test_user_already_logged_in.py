#!/usr/bin/env python3
"""
Test script for user already logged in dialog
This script simulates the scenario where a user tries to connect
when they are already logged in from another device
"""
import asyncio
import websockets
import json
import time

async def test_user_already_logged_in_dialog():
    """Test user already logged in dialog functionality"""
    print("🧪 Testing user already logged in dialog...")
    print("=" * 60)
    
    # Test user data
    test_user = {
        "user_id": "test-user-123",
        "username": "testuser",
        "node_id": "test-node-456",
        "domain_id": None,
        "cluster_id": None,
        "channel_id": None
    }
    
    try:
        # First connection - should succeed
        print("🔌 Step 1: Establishing first connection...")
        async with websockets.connect("ws://127.0.0.1:8766") as websocket1:
            print("✅ First connection established")
            
            # Register first user
            register_message1 = {
                "type": "c_client_register",
                "client_id": "client-1",
                "user_id": test_user["user_id"],
                "username": test_user["username"],
                "node_id": test_user["node_id"],
                "domain_id": test_user["domain_id"],
                "cluster_id": test_user["cluster_id"],
                "channel_id": test_user["channel_id"]
            }
            
            print(f"📤 Sending first registration: {register_message1}")
            await websocket1.send(json.dumps(register_message1))
            
            # Wait for response
            response1 = await asyncio.wait_for(websocket1.recv(), timeout=5.0)
            response_data1 = json.loads(response1)
            print(f"📥 First connection response: {response_data1}")
            
            if response_data1.get('type') == 'registration_success':
                print("✅ First connection registered successfully")
                print("   User is now logged in and should appear in B-Client dashboard")
            else:
                print(f"❌ First connection failed: {response_data1}")
                return
            
            print("\n" + "="*60)
            print("🔔 Now start C-Client to see the dialog!")
            print("   The C-Client should show a dialog saying:")
            print(f"   'User {test_user['username']} is already logged in from another device'")
            print("="*60)
            
            # Keep first connection alive for a while
            print("\n⏰ Keeping first connection alive for 30 seconds...")
            print("   During this time, start C-Client to test the dialog")
            
            # Wait for 30 seconds
            for i in range(30):
                await asyncio.sleep(1)
                if i % 5 == 0:
                    print(f"   ⏰ {30-i} seconds remaining...")
            
            print("\n✅ Test completed!")
            print("   - First connection: ✅ Successfully registered")
            print("   - Second connection attempt: Should show dialog in C-Client")
            print("   - Dialog should display: 'User testuser is already logged in from another device'")
            
    except ConnectionRefusedError:
        print("❌ Connection refused - B-Client WebSocket server not running")
        print("   Please start B-Client first: python run.py")
    except Exception as e:
        print(f"❌ Test failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_user_already_logged_in_dialog())
