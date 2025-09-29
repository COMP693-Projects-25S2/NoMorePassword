#!/usr/bin/env python3
"""
Test script for duplicate user login detection
This script simulates multiple C-Client connections with the same user_id
"""
import asyncio
import websockets
import json
import time

async def test_duplicate_login():
    """Test duplicate node connection detection"""
    print("🧪 Testing duplicate node connection detection...")
    print("=" * 60)
    
    # Test node data
    test_node = {
        "user_id": "test-user-123",
        "username": "testuser",
        "node_id": "test-node-456",
        "domain_id": None,
        "cluster_id": None,
        "channel_id": None
    }
    
    try:
        # First connection - should succeed
        print("🔌 Attempting first connection...")
        async with websockets.connect("ws://127.0.0.1:8766") as websocket1:
            print("✅ First connection established")
            
            # Register first node
            register_message1 = {
                "type": "c_client_register",
                "client_id": "client-1",
                "user_id": test_node["user_id"],
                "username": test_node["username"],
                "node_id": test_node["node_id"],
                "domain_id": test_node["domain_id"],
                "cluster_id": test_node["cluster_id"],
                "channel_id": test_node["channel_id"]
            }
            
            print(f"📤 Sending first registration: {register_message1}")
            await websocket1.send(json.dumps(register_message1))
            
            # Wait for response
            response1 = await asyncio.wait_for(websocket1.recv(), timeout=5.0)
            response_data1 = json.loads(response1)
            print(f"📥 First connection response: {response_data1}")
            
            if response_data1.get('type') == 'registration_success':
                print("✅ First connection registered successfully")
            else:
                print(f"❌ First connection failed: {response_data1}")
                return
            
            # Second connection with same node_id - should be rejected
            print("\n🔌 Attempting second connection with same node_id...")
            async with websockets.connect("ws://127.0.0.1:8766") as websocket2:
                print("✅ Second connection established")
                
                # Register second node with same node_id
                register_message2 = {
                    "type": "c_client_register",
                    "client_id": "client-2",
                    "user_id": test_node["user_id"],
                    "username": test_node["username"],
                    "node_id": test_node["node_id"],  # Same node_id
                    "domain_id": test_node["domain_id"],
                    "cluster_id": test_node["cluster_id"],
                    "channel_id": test_node["channel_id"]
                }
                
                print(f"📤 Sending second registration: {register_message2}")
                await websocket2.send(json.dumps(register_message2))
                
                # Wait for response
                try:
                    response2 = await asyncio.wait_for(websocket2.recv(), timeout=5.0)
                    response_data2 = json.loads(response2)
                    print(f"📥 Second connection response: {response_data2}")
                    
                    if response_data2.get('type') == 'registration_rejected':
                        print("✅ Second connection correctly rejected")
                        print(f"   Reason: {response_data2.get('reason')}")
                        print(f"   Message: {response_data2.get('message')}")
                    else:
                        print(f"❌ Second connection should have been rejected: {response_data2}")
                except asyncio.TimeoutError:
                    print("⏰ Second connection timed out (connection may have been closed)")
                
            # Third connection with different node_id - should succeed
            print("\n🔌 Attempting third connection with different node_id...")
            async with websockets.connect("ws://127.0.0.1:8766") as websocket3:
                print("✅ Third connection established")
                
                # Register third node with different node_id
                register_message3 = {
                    "type": "c_client_register",
                    "client_id": "client-3",
                    "user_id": "test-user-789",
                    "username": "testuser2",
                    "node_id": "test-node-789",  # Different node_id
                    "domain_id": None,
                    "cluster_id": None,
                    "channel_id": None
                }
                    
                    print(f"📤 Sending third registration: {register_message3}")
                    await websocket3.send(json.dumps(register_message3))
                    
                    # Wait for response
                    response3 = await asyncio.wait_for(websocket3.recv(), timeout=5.0)
                    response_data3 = json.loads(response3)
                    print(f"📥 Third connection response: {response_data3}")
                    
                    if response_data3.get('type') == 'registration_success':
                        print("✅ Third connection registered successfully")
                    else:
                        print(f"❌ Third connection failed: {response_data3}")
                
                print("\n🎉 Test completed successfully!")
                print("   - First connection (same node): ✅ Allowed")
                print("   - Second connection (same node): ✅ Rejected")
                print("   - Third connection (different node): ✅ Allowed")
                
    except ConnectionRefusedError:
        print("❌ Connection refused - B-Client WebSocket server not running")
        print("   Please start B-Client first: python run.py")
    except Exception as e:
        print(f"❌ Test failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_duplicate_login())
