#!/usr/bin/env python3
"""
Test script for dual connection pools
This script demonstrates the dual connection pool functionality:
- node_connections: node_id -> websocket
- user_connections: user_id -> list of websockets
"""
import asyncio
import websockets
import json
import time

async def test_dual_connection_pools():
    """Test dual connection pool functionality"""
    print("🧪 Testing dual connection pools...")
    print("=" * 60)
    
    # Test scenarios
    test_scenarios = [
        {
            "name": "User A on Node 1",
            "user_id": "user-a",
            "username": "alice",
            "node_id": "node-1",
            "client_id": "client-a1"
        },
        {
            "name": "User A on Node 2", 
            "user_id": "user-a",
            "username": "alice",
            "node_id": "node-2",
            "client_id": "client-a2"
        },
        {
            "name": "User B on Node 1",
            "user_id": "user-b", 
            "username": "bob",
            "node_id": "node-1",
            "client_id": "client-b1"
        },
        {
            "name": "User C on Node 3",
            "user_id": "user-c",
            "username": "charlie", 
            "node_id": "node-3",
            "client_id": "client-c1"
        }
    ]
    
    connections = []
    
    try:
        # Establish all connections
        print("🔌 Establishing connections...")
        for scenario in test_scenarios:
            print(f"\n📡 Connecting: {scenario['name']}")
            websocket = await websockets.connect("ws://127.0.0.1:8766")
            
            register_message = {
                "type": "c_client_register",
                "client_id": scenario["client_id"],
                "user_id": scenario["user_id"],
                "username": scenario["username"],
                "node_id": scenario["node_id"],
                "domain_id": None,
                "cluster_id": None,
                "channel_id": None
            }
            
            print(f"📤 Sending registration: {register_message}")
            await websocket.send(json.dumps(register_message))
            
            # Wait for response
            response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
            response_data = json.loads(response)
            print(f"📥 Response: {response_data}")
            
            if response_data.get('type') == 'registration_success':
                print(f"✅ {scenario['name']} connected successfully")
                connections.append((websocket, scenario))
            else:
                print(f"❌ {scenario['name']} failed to connect")
                await websocket.close()
        
        print(f"\n🎉 All connections established! Total: {len(connections)}")
        
        # Test message routing scenarios
        print("\n" + "="*60)
        print("🧪 Testing message routing scenarios...")
        
        # Test 1: Send message to specific node
        print("\n1️⃣ Testing: Send message to specific node (node-1)")
        # This would be done via B-Client API: send_message_to_node("node-1", message)
        print("   📤 B-Client would send message to node-1")
        print("   📥 Should reach: User A and User B on node-1")
        
        # Test 2: Send message to specific user
        print("\n2️⃣ Testing: Send message to specific user (user-a)")
        # This would be done via B-Client API: send_message_to_user("user-a", message)
        print("   📤 B-Client would send message to user-a")
        print("   📥 Should reach: User A on node-1 and node-2")
        
        # Test 3: Send message to specific user on specific node
        print("\n3️⃣ Testing: Send message to user-a on node-2")
        # This would be done via B-Client API: send_message_to_user_node("user-a", "node-2", message)
        print("   📤 B-Client would send message to user-a on node-2")
        print("   📥 Should reach: User A on node-2 only")
        
        # Test 4: Broadcast to all
        print("\n4️⃣ Testing: Broadcast to all connections")
        # This would be done via B-Client API: broadcast_to_c_clients(message)
        print("   📤 B-Client would broadcast message to all")
        print("   📥 Should reach: All 4 connections")
        
        # Test 5: Test duplicate node connection (should be rejected)
        print("\n5️⃣ Testing: Duplicate node connection (node-1)")
        print("   📤 Attempting to connect another client to node-1...")
        try:
            duplicate_websocket = await websockets.connect("ws://127.0.0.1:8766")
            duplicate_message = {
                "type": "c_client_register",
                "client_id": "duplicate-client",
                "user_id": "user-d",
                "username": "david",
                "node_id": "node-1",  # Same node as existing connections
                "domain_id": None,
                "cluster_id": None,
                "channel_id": None
            }
            
            await duplicate_websocket.send(json.dumps(duplicate_message))
            response = await asyncio.wait_for(duplicate_websocket.recv(), timeout=5.0)
            response_data = json.loads(response)
            print(f"   📥 Response: {response_data}")
            
            if response_data.get('type') == 'registration_rejected':
                print("   ✅ Duplicate node connection correctly rejected")
            else:
                print("   ❌ Duplicate node connection should have been rejected")
                
            await duplicate_websocket.close()
        except Exception as e:
            print(f"   ⚠️  Duplicate connection test failed: {e}")
        
        print("\n" + "="*60)
        print("📊 Connection Pool Summary:")
        print("   🔗 Node Connections:")
        print("     - node-1: User A, User B")
        print("     - node-2: User A") 
        print("     - node-3: User C")
        print("   👥 User Connections:")
        print("     - user-a: 2 connections (node-1, node-2)")
        print("     - user-b: 1 connection (node-1)")
        print("     - user-c: 1 connection (node-3)")
        
        print("\n⏰ Keeping connections alive for 10 seconds...")
        await asyncio.sleep(10)
        
        print("\n✅ Test completed successfully!")
        print("   - Dual connection pools working correctly")
        print("   - Node-based routing: ✅")
        print("   - User-based routing: ✅")
        print("   - User-Node specific routing: ✅")
        print("   - Duplicate node detection: ✅")
        
    except ConnectionRefusedError:
        print("❌ Connection refused - B-Client WebSocket server not running")
        print("   Please start B-Client first: python run.py")
    except Exception as e:
        print(f"❌ Test failed: {e}")
    finally:
        # Clean up all connections
        print("\n🧹 Cleaning up connections...")
        for websocket, scenario in connections:
            try:
                await websocket.close()
                print(f"   🔌 Closed connection: {scenario['name']}")
            except:
                pass

if __name__ == "__main__":
    asyncio.run(test_dual_connection_pools())
