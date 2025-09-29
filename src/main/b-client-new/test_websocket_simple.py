#!/usr/bin/env python3
"""
Simple WebSocket connection test to B-Client
"""
import asyncio
import websockets
import json

async def test_connection():
    """Test WebSocket connection to B-Client"""
    try:
        print("🔌 Testing WebSocket connection to B-Client...")
        print("   Target: ws://127.0.0.1:8766")
        
        # Try to connect
        async with websockets.connect("ws://127.0.0.1:8766") as websocket:
            print("✅ WebSocket connection established!")
            
            # Send registration message
            register_message = {
                "type": "c_client_register",
                "client_id": "test-client-123",
                "user_id": "test-user-456",
                "username": "testuser"
            }
            
            print(f"📤 Sending registration message: {register_message}")
            await websocket.send(json.dumps(register_message))
            
            # Wait for response
            response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
            print(f"📥 Received response: {response}")
            
            print("✅ Test completed successfully!")
            
    except asyncio.TimeoutError:
        print("❌ Connection timeout - B-Client WebSocket server not responding")
    except ConnectionRefusedError:
        print("❌ Connection refused - B-Client WebSocket server not running")
    except Exception as e:
        print(f"❌ Connection failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_connection())
