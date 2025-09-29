#!/usr/bin/env python3
"""
Test script to verify WebSocket connection and statistics
"""

import asyncio
import websockets
import json
import requests

async def test_websocket_connection():
    """Test WebSocket connection and get statistics"""
    print("🧪 Testing WebSocket Connection and Statistics")
    print("=" * 50)
    
    # Test WebSocket connection
    try:
        websocket = await websockets.connect("ws://localhost:8766")
        print("✅ WebSocket connection successful")
        
        # Send registration message
        registration_message = {
            'type': 'c_client_register',
            'client_id': 'test_client_001',
            'user_id': 'test_user_001',
            'username': 'testuser1',
            'node_id': 'test_node_001',
            'domain_id': 'domain_001',
            'cluster_id': 'cluster_001',
            'channel_id': 'channel_001'
        }
        
        await websocket.send(json.dumps(registration_message))
        print("📤 Sent registration message")
        
        # Wait for response
        try:
            response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
            response_data = json.loads(response)
            print(f"📥 Received response: {response_data}")
            
            if response_data.get('type') == 'registration_success':
                print("✅ Registration successful")
            else:
                print(f"❌ Registration failed: {response_data}")
        except asyncio.TimeoutError:
            print("❌ Timeout waiting for response")
        
        await websocket.close()
        print("🔌 WebSocket connection closed")
        
    except Exception as e:
        print(f"❌ WebSocket connection failed: {e}")
        return False
    
    # Test API statistics
    try:
        response = requests.get("http://localhost:3000/api/c-client/status")
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                summary = data.get('connected_clients', {}).get('summary', {})
                print(f"\n📊 Current Statistics:")
                print(f"   Total Connections: {summary.get('total_connections', 0)}")
                print(f"   Total Clients: {summary.get('total_clients', 0)}")
                print(f"   Total Users: {summary.get('total_users', 0)}")
                print(f"   Total Nodes: {summary.get('total_nodes', 0)}")
                return True
            else:
                print(f"❌ API returned error: {data}")
                return False
        else:
            print(f"❌ API request failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ API request failed: {e}")
        return False

async def main():
    """Main test function"""
    print("🔧 WebSocket Connection Tester")
    print("Testing WebSocket connection and statistics...")
    print()
    
    success = await test_websocket_connection()
    
    if success:
        print("\n✅ Test completed successfully!")
    else:
        print("\n❌ Test failed!")

if __name__ == "__main__":
    asyncio.run(main())
