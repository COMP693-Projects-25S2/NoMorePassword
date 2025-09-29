#!/usr/bin/env python3
"""
Debug script for re-registration logic
"""

import asyncio
import websockets
import json

async def debug_reregistration():
    """Debug re-registration logic"""
    print("🔍 Debug: Re-registration Logic")
    print("=" * 50)
    
    try:
        # Create first connection
        websocket1 = await websockets.connect("ws://localhost:8766")
        print("✅ First connection created")
        
        # Register first connection
        registration1 = {
            'type': 'c_client_register',
            'client_id': 'debug_client',
            'user_id': 'user_1',
            'username': 'user1',
            'node_id': 'node_1',
            'domain_id': 'domain_1',
            'cluster_id': 'cluster_1',
            'channel_id': 'channel_1'
        }
        
        await websocket1.send(json.dumps(registration1))
        print("📤 Sent first registration")
        
        # Wait for first response
        try:
            response1 = await asyncio.wait_for(websocket1.recv(), timeout=5.0)
            response_data1 = json.loads(response1)
            print(f"📥 First response: {response_data1}")
        except asyncio.TimeoutError:
            print("❌ Timeout waiting for first response")
            return
        
        # Wait a bit
        await asyncio.sleep(1)
        
        # Create second connection (simulating re-registration)
        websocket2 = await websockets.connect("ws://localhost:8766")
        print("✅ Second connection created")
        
        # Register second connection with same client_id but different user
        registration2 = {
            'type': 'c_client_register',
            'client_id': 'debug_client',  # Same client_id
            'user_id': 'user_2',          # Different user
            'username': 'user2',
            'node_id': 'node_1',          # Same node
            'domain_id': 'domain_2',
            'cluster_id': 'cluster_2',
            'channel_id': 'channel_2'
        }
        
        await websocket2.send(json.dumps(registration2))
        print("📤 Sent second registration (re-registration)")
        
        # Wait for second response
        try:
            response2 = await asyncio.wait_for(websocket2.recv(), timeout=5.0)
            response_data2 = json.loads(response2)
            print(f"📥 Second response: {response_data2}")
        except asyncio.TimeoutError:
            print("❌ Timeout waiting for second response")
        
        # Check if first connection received any messages
        try:
            response1_2 = await asyncio.wait_for(websocket1.recv(), timeout=2.0)
            response_data1_2 = json.loads(response1_2)
            print(f"📥 First connection received: {response_data1_2}")
        except asyncio.TimeoutError:
            print("⏰ First connection received no additional messages")
        
        # Clean up
        await websocket1.close()
        await websocket2.close()
        print("🔌 Connections closed")
        
    except Exception as e:
        print(f"❌ Error: {e}")

async def main():
    """Main debug function"""
    print("🔧 Re-registration Debug Tool")
    print("Debugging re-registration logic...")
    print()
    
    await debug_reregistration()

if __name__ == "__main__":
    asyncio.run(main())
