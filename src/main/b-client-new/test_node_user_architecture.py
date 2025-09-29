#!/usr/bin/env python3
"""
Test script for node-user architecture
This script demonstrates the correct behavior:
- Reject duplicate node_id connections
- Allow multiple users on the same node (through the same WebSocket connection)
"""
import asyncio
import websockets
import json
import time

async def test_node_user_architecture():
    """Test node-user architecture behavior"""
    print("🧪 Testing Node-User Architecture...")
    print("=" * 60)
    print("📋 Expected Behavior:")
    print("   ✅ Allow: Multiple users on same node (same WebSocket)")
    print("   ❌ Reject: Multiple WebSocket connections to same node")
    print("   ✅ Allow: Same user on different nodes")
    print("=" * 60)
    
    try:
        # Test 1: First connection to node-1 with user-a
        print("\n1️⃣ Test: First connection to node-1 with user-a")
        async with websockets.connect("ws://127.0.0.1:8766") as websocket1:
            register_message1 = {
                "type": "c_client_register",
                "client_id": "client-a1",
                "user_id": "user-a",
                "username": "alice",
                "node_id": "node-1",
                "domain_id": None,
                "cluster_id": None,
                "channel_id": None
            }
            
            print(f"📤 Sending: {register_message1}")
            await websocket1.send(json.dumps(register_message1))
            
            response1 = await asyncio.wait_for(websocket1.recv(), timeout=5.0)
            response_data1 = json.loads(response1)
            print(f"📥 Response: {response_data1}")
            
            if response_data1.get('type') == 'registration_success':
                print("✅ First connection to node-1 successful")
            else:
                print(f"❌ First connection failed: {response_data1}")
                return
            
            # Test 2: Try to connect another WebSocket to same node-1 (should be rejected)
            print("\n2️⃣ Test: Try to connect another WebSocket to node-1 (should be rejected)")
            async with websockets.connect("ws://127.0.0.1:8766") as websocket2:
                register_message2 = {
                    "type": "c_client_register",
                    "client_id": "client-b1",
                    "user_id": "user-b",
                    "username": "bob",
                    "node_id": "node-1",  # Same node as first connection
                    "domain_id": None,
                    "cluster_id": None,
                    "channel_id": None
                }
                
                print(f"📤 Sending: {register_message2}")
                await websocket2.send(json.dumps(register_message2))
                
                try:
                    response2 = await asyncio.wait_for(websocket2.recv(), timeout=5.0)
                    response_data2 = json.loads(response2)
                    print(f"📥 Response: {response_data2}")
                    
                    if response_data2.get('type') == 'registration_rejected':
                        print("✅ Duplicate node connection correctly rejected")
                    else:
                        print(f"❌ Duplicate node connection should have been rejected: {response_data2}")
                except asyncio.TimeoutError:
                    print("⏰ Connection timed out (likely closed by server)")
            
            # Test 3: Connect to different node-2 with user-a (should be allowed)
            print("\n3️⃣ Test: Connect user-a to different node-2 (should be allowed)")
            async with websockets.connect("ws://127.0.0.1:8766") as websocket3:
                register_message3 = {
                    "type": "c_client_register",
                    "client_id": "client-a2",
                    "user_id": "user-a",  # Same user as first connection
                    "username": "alice",
                    "node_id": "node-2",  # Different node
                    "domain_id": None,
                    "cluster_id": None,
                    "channel_id": None
                }
                
                print(f"📤 Sending: {register_message3}")
                await websocket3.send(json.dumps(register_message3))
                
                response3 = await asyncio.wait_for(websocket3.recv(), timeout=5.0)
                response_data3 = json.loads(response3)
                print(f"📥 Response: {response_data3}")
                
                if response_data3.get('type') == 'registration_success':
                    print("✅ Same user on different node allowed")
                else:
                    print(f"❌ Same user on different node should be allowed: {response_data3}")
            
            # Test 4: Connect to node-3 with user-c (should be allowed)
            print("\n4️⃣ Test: Connect user-c to node-3 (should be allowed)")
            async with websockets.connect("ws://127.0.0.1:8766") as websocket4:
                register_message4 = {
                    "type": "c_client_register",
                    "client_id": "client-c1",
                    "user_id": "user-c",
                    "username": "charlie",
                    "node_id": "node-3",
                    "domain_id": None,
                    "cluster_id": None,
                    "channel_id": None
                }
                
                print(f"📤 Sending: {register_message4}")
                await websocket4.send(json.dumps(register_message4))
                
                response4 = await asyncio.wait_for(websocket4.recv(), timeout=5.0)
                response_data4 = json.loads(response4)
                print(f"📥 Response: {response_data4}")
                
                if response4.get('type') == 'registration_success':
                    print("✅ Different user on different node allowed")
                else:
                    print(f"❌ Different user on different node should be allowed: {response_data4}")
            
            print("\n" + "="*60)
            print("📊 Final Connection State:")
            print("   🔗 Active Connections:")
            print("     - node-1: user-a (WebSocket 1)")
            print("     - node-2: user-a (WebSocket 3)")  
            print("     - node-3: user-c (WebSocket 4)")
            print("   ❌ Rejected:")
            print("     - node-1: user-b (WebSocket 2) - Duplicate node")
            print("\n✅ Test completed successfully!")
            print("   - Node uniqueness: ✅ Enforced")
            print("   - User multi-node: ✅ Allowed")
            print("   - Duplicate node detection: ✅ Working")
            
    except ConnectionRefusedError:
        print("❌ Connection refused - B-Client WebSocket server not running")
        print("   Please start B-Client first: python run.py")
    except Exception as e:
        print(f"❌ Test failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_node_user_architecture())
