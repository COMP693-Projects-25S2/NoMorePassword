#!/usr/bin/env python3
"""
Debug script for notification functionality
"""

import asyncio
import json
import websockets

async def debug_notification():
    """Debug notification functionality step by step"""
    print("🔍 Debug: Testing notification step by step...")
    
    try:
        # First connection
        print("\n1️⃣ Connecting first node...")
        async with websockets.connect("ws://127.0.0.1:8766") as ws1:
            print("✅ First connection established")
            
            # Register first node
            msg1 = {
                "type": "c_client_register",
                "client_id": "debug-1",
                "user_id": "debug-user-123",
                "username": "debuguser",
                "node_id": "debug-node-1",
                "domain_id": None,
                "cluster_id": None,
                "channel_id": None
            }
            
            print(f"📤 Sending first registration: {json.dumps(msg1)}")
            await ws1.send(json.dumps(msg1))
            
            # Wait for response
            resp1 = json.loads(await ws1.recv())
            print(f"📨 First response: {resp1}")
            
            if resp1.get('type') != 'registration_success':
                print("❌ First registration failed")
                return
            
            print("✅ First node registered successfully")
            
            # Wait a moment
            await asyncio.sleep(1)
            
            # Second connection with same user
            print("\n2️⃣ Connecting second node (same user)...")
            async with websockets.connect("ws://127.0.0.1:8766") as ws2:
                print("✅ Second connection established")
                
                # Register second node
                msg2 = {
                    "type": "c_client_register",
                    "client_id": "debug-2",
                    "user_id": "debug-user-123",  # Same user
                    "username": "debuguser",
                    "node_id": "debug-node-2",    # Different node
                    "domain_id": None,
                    "cluster_id": None,
                    "channel_id": None
                }
                
                print(f"📤 Sending second registration: {json.dumps(msg2)}")
                await ws2.send(json.dumps(msg2))
                
                # Wait for response
                resp2 = json.loads(await ws2.recv())
                print(f"📨 Second response: {resp2}")
                
                if resp2.get('type') != 'registration_success':
                    print("❌ Second registration failed")
                    return
                
                print("✅ Second node registered successfully")
                
                # Now check for notification on first websocket
                print("\n3️⃣ Checking for notification on first websocket...")
                print("   (This should show B-Client logs about notification)")
                
                try:
                    # Wait for notification
                    notification = json.loads(await asyncio.wait_for(ws1.recv(), timeout=3))
                    print(f"📨 Received notification: {notification}")
                    
                    if notification.get('type') == 'user_connected_on_another_node':
                        print("✅ Notification received successfully!")
                    else:
                        print(f"❌ Unexpected notification type: {notification.get('type')}")
                        
                except asyncio.TimeoutError:
                    print("⏰ No notification received (timeout)")
                    print("   This suggests the notification system is not working")
                
                # Keep connections alive for a moment to see B-Client logs
                print("\n4️⃣ Keeping connections alive for 2 seconds...")
                await asyncio.sleep(2)
                
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    asyncio.run(debug_notification())
