#!/usr/bin/env python3
"""
Simple test script to verify detailed logging
"""

import asyncio
import json
import websockets

async def test_detailed_logs():
    """Test with detailed logging output"""
    print("🧪 Testing detailed logging...")
    print("=" * 60)
    
    try:
        # Test connection 1: User A on Node 1
        print("\n🔌 Test 1: User A on Node 1")
        async with websockets.connect("ws://127.0.0.1:8766") as ws1:
            msg1 = {
                "type": "c_client_register",
                "client_id": "test-client-1",
                "user_id": "user-a-123",
                "username": "alice",
                "node_id": "node-1",
                "domain_id": None,
                "cluster_id": None,
                "channel_id": None
            }
            
            print(f"📤 Sending: {json.dumps(msg1)}")
            await ws1.send(json.dumps(msg1))
            
            resp1 = json.loads(await ws1.recv())
            print(f"📨 Response: {resp1}")
            
            if resp1.get('type') == 'registration_success':
                print("✅ Registration 1 successful")
            else:
                print(f"❌ Registration 1 failed: {resp1}")
                return
            
            # Wait a moment
            await asyncio.sleep(1)
            
            # Test connection 2: User A on Node 2 (same user, different node)
            print("\n🔌 Test 2: User A on Node 2 (same user, different node)")
            async with websockets.connect("ws://127.0.0.1:8766") as ws2:
                msg2 = {
                    "type": "c_client_register",
                    "client_id": "test-client-2",
                    "user_id": "user-a-123",  # Same user
                    "username": "alice",
                    "node_id": "node-2",      # Different node
                    "domain_id": None,
                    "cluster_id": None,
                    "channel_id": None
                }
                
                print(f"📤 Sending: {json.dumps(msg2)}")
                await ws2.send(json.dumps(msg2))
                
                resp2 = json.loads(await ws2.recv())
                print(f"📨 Response: {resp2}")
                
                if resp2.get('type') == 'registration_success':
                    print("✅ Registration 2 successful")
                else:
                    print(f"❌ Registration 2 failed: {resp2}")
                    return
                
                # Wait a moment
                await asyncio.sleep(1)
                
                # Test connection 3: User B on Node 1 (node switching user)
                print("\n🔌 Test 3: User B on Node 1 (node switching user)")
                async with websockets.connect("ws://127.0.0.1:8766") as ws3:
                    msg3 = {
                        "type": "c_client_register",
                        "client_id": "test-client-3",
                        "user_id": "user-b-456",  # Different user
                        "username": "bob",
                        "node_id": "node-1",     # Same node as User A
                        "domain_id": None,
                        "cluster_id": None,
                        "channel_id": None
                    }
                    
                    print(f"📤 Sending: {json.dumps(msg3)}")
                    await ws3.send(json.dumps(msg3))
                    
                    resp3 = json.loads(await ws3.recv())
                    print(f"📨 Response: {resp3}")
                    
                    if resp3.get('type') == 'registration_success':
                        print("✅ Registration 3 successful")
                    else:
                        print(f"❌ Registration 3 failed: {resp3}")
                        return
                    
                    print("\n🎉 All tests completed!")
                    print("   - User A on Node 1: ✅")
                    print("   - User A on Node 2: ✅ (multi-node user)")
                    print("   - User B on Node 1: ✅ (node user switch)")
                    
                    # Keep connections alive for a moment to see final status
                    await asyncio.sleep(2)
                    
    except ConnectionRefusedError:
        print("❌ Connection refused - B-Client WebSocket server not running")
        print("   Please start B-Client first: python run.py")
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_detailed_logs())
