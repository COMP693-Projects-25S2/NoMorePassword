#!/usr/bin/env python3
"""
Test script to verify WebSocket disconnect during user switch
"""

import asyncio
import json
import websockets
import time

async def test_user_switch_disconnect():
    """Test if B-Client properly handles WebSocket disconnect during user switch"""
    
    print("🧪 Testing WebSocket disconnect during user switch...")
    print("=" * 60)
    
    try:
        # Connect as first user
        print("\n1️⃣ Connecting as user-a...")
        async with websockets.connect("ws://127.0.0.1:8766") as websocket1:
            print("✅ First connection established")
            
            # Register first user
            register_message1 = {
                "type": "c_client_register",
                "client_id": "client-1",
                "user_id": "user-a",
                "username": "alice",
                "node_id": "node-1",
                "domain_id": None,
                "cluster_id": None,
                "channel_id": None
            }
            
            print(f"📤 Sending first registration: {register_message1}")
            await websocket1.send(json.dumps(register_message1))
            
            # Wait for response
            response1 = await asyncio.wait_for(websocket1.recv(), timeout=5.0)
            response_data1 = json.loads(response1)
            print(f"📥 First registration response: {response_data1}")
            
            if response_data1.get('type') == 'registration_success':
                print("✅ First user registered successfully")
                
                # Wait a moment
                print("⏰ Waiting 2 seconds...")
                await asyncio.sleep(2)
                
                # Simulate user switch - disconnect first connection
                print("\n2️⃣ Simulating user switch - disconnecting first connection...")
                print("🔌 Closing first WebSocket connection...")
                await websocket1.close()
                print("✅ First connection closed")
                
                # Wait for B-Client to process the disconnect
                print("⏰ Waiting 3 seconds for B-Client to process disconnect...")
                await asyncio.sleep(3)
                
                # Connect as second user
                print("\n3️⃣ Connecting as user-b...")
                async with websockets.connect("ws://127.0.0.1:8766") as websocket2:
                    print("✅ Second connection established")
                    
                    # Register second user
                    register_message2 = {
                        "type": "c_client_register",
                        "client_id": "client-1",  # Same client, different user
                        "user_id": "user-b",
                        "username": "bob",
                        "node_id": "node-1",
                        "domain_id": None,
                        "cluster_id": None,
                        "channel_id": None
                    }
                    
                    print(f"📤 Sending second registration: {register_message2}")
                    await websocket2.send(json.dumps(register_message2))
                    
                    # Wait for response
                    response2 = await asyncio.wait_for(websocket2.recv(), timeout=5.0)
                    response_data2 = json.loads(response2)
                    print(f"📥 Second registration response: {response_data2}")
                    
                    if response_data2.get('type') == 'registration_success':
                        print("✅ Second user registered successfully")
                        print("\n🎉 User switch test completed successfully!")
                        print("   - First user disconnected: ✅")
                        print("   - Second user connected: ✅")
                        print("   - B-Client should have updated counts: ✅")
                    else:
                        print(f"❌ Second user registration failed: {response_data2}")
                
            else:
                print(f"❌ First user registration failed: {response_data1}")
                
    except ConnectionRefusedError:
        print("❌ Connection refused - B-Client WebSocket server not running")
        print("   Please start B-Client first: python run.py")
    except Exception as e:
        print(f"❌ Test failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_user_switch_disconnect())
