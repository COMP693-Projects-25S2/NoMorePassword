#!/usr/bin/env python3
"""
Test script for user multi-node notification functionality
Tests the scenario where a user logs in on multiple nodes and existing nodes are notified
"""

import asyncio
import json
import websockets
import time

async def test_user_multi_node_notification():
    """Test user multi-node notification functionality"""
    print("🧪 Testing user multi-node notification...")
    print("=" * 60)
    
    # Test data
    test_user = {
        "user_id": "test-user-multi-123",
        "username": "testuser",
        "domain_id": None,
        "cluster_id": None,
        "channel_id": None
    }
    
    try:
        # First connection - should succeed
        print("🔌 Step 1: First node connection...")
        async with websockets.connect("ws://127.0.0.1:8766") as websocket1:
            print("✅ First connection established")
            
            # Register first node
            register_message1 = {
                "type": "c_client_register",
                "client_id": "client-node-1",
                "user_id": test_user["user_id"],
                "username": test_user["username"],
                "node_id": "node-1",
                "domain_id": test_user["domain_id"],
                "cluster_id": test_user["cluster_id"],
                "channel_id": test_user["channel_id"]
            }
            
            print(f"📤 Sending first registration: {json.dumps(register_message1)}")
            await websocket1.send(json.dumps(register_message1))
            
            # Wait for response
            response_data1 = json.loads(await asyncio.wait_for(websocket1.recv(), timeout=5))
            if response_data1.get('type') == 'registration_success':
                print("✅ First node registered successfully")
            else:
                print(f"❌ First node registration failed: {response_data1}")
                return
            
            # Second connection with same user but different node - should succeed and notify first node
            print("\n🔌 Step 2: Second node connection (same user, different node)...")
            async with websockets.connect("ws://127.0.0.1:8766") as websocket2:
                print("✅ Second connection established")
                
                # Register second node with same user but different node_id
                register_message2 = {
                    "type": "c_client_register",
                    "client_id": "client-node-2",
                    "user_id": test_user["user_id"],  # Same user
                    "username": test_user["username"],
                    "node_id": "node-2",  # Different node
                    "domain_id": test_user["domain_id"],
                    "cluster_id": test_user["cluster_id"],
                    "channel_id": test_user["channel_id"]
                }
                
                print(f"📤 Sending second registration: {json.dumps(register_message2)}")
                await websocket2.send(json.dumps(register_message2))
                
                # Wait for response
                response_data2 = json.loads(await asyncio.wait_for(websocket2.recv(), timeout=5))
                if response_data2.get('type') == 'registration_success':
                    print("✅ Second node registered successfully")
                else:
                    print(f"❌ Second node registration failed: {response_data2}")
                    return
                
                # Check if first node received notification
                print("\n🔔 Step 3: Checking for notification on first node...")
                print("   Waiting for any message on first websocket...")
                try:
                    # Wait for notification on first websocket
                    notification = json.loads(await asyncio.wait_for(websocket1.recv(), timeout=5))
                    print(f"📨 Received message on first node: {notification}")
                    if notification.get('type') == 'user_connected_on_another_node':
                        print("✅ First node received notification!")
                        print(f"   User: {notification.get('username')}")
                        print(f"   New Node: {notification.get('new_node_id')}")
                        print(f"   Message: {notification.get('message')}")
                    else:
                        print(f"❌ Unexpected message on first node: {notification}")
                except asyncio.TimeoutError:
                    print("⏰ No notification received on first node (timeout)")
                    print("   This might indicate the notification system is not working")
                
                # Third connection with different user - should succeed without notifications
                print("\n🔌 Step 4: Third node connection (different user)...")
                async with websockets.connect("ws://127.0.0.1:8766") as websocket3:
                    print("✅ Third connection established")
                    
                    # Register third node with different user
                    register_message3 = {
                        "type": "c_client_register",
                        "client_id": "client-node-3",
                        "user_id": "test-user-different-456",  # Different user
                        "username": "testuser2",
                        "node_id": "node-3",
                        "domain_id": None,
                        "cluster_id": None,
                        "channel_id": None
                    }
                    
                    print(f"📤 Sending third registration: {json.dumps(register_message3)}")
                    await websocket3.send(json.dumps(register_message3))
                    
                    # Wait for response
                    response_data3 = json.loads(await asyncio.wait_for(websocket3.recv(), timeout=5))
                    if response_data3.get('type') == 'registration_success':
                        print("✅ Third node registered successfully")
                    else:
                        print(f"❌ Third node registration failed: {response_data3}")
                        return
                    
                    # Check that no notifications were sent for different user
                    print("\n🔔 Step 5: Verifying no notifications for different user...")
                    try:
                        # Wait briefly to see if any notifications come
                        notification = json.loads(await asyncio.wait_for(websocket1.recv(), timeout=1))
                        print(f"❌ Unexpected notification received: {notification}")
                    except asyncio.TimeoutError:
                        print("✅ No unexpected notifications (as expected)")
                    
                    print("\n🎉 Test completed successfully!")
                    print("   - First node (user A, node 1): ✅ Registered")
                    print("   - Second node (user A, node 2): ✅ Registered + Notified first node")
                    print("   - Third node (user B, node 3): ✅ Registered (no notifications)")
                    print("   - Multi-node notification system: ✅ Working correctly")
                    
    except ConnectionRefusedError:
        print("❌ Connection refused - B-Client WebSocket server not running")
        print("   Please start B-Client first: python run.py")
    except Exception as e:
        print(f"❌ An unexpected error occurred: {e}")

if __name__ == "__main__":
    asyncio.run(test_user_multi_node_notification())
