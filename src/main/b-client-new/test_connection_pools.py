#!/usr/bin/env python3
"""
Test script to check connection pools status
"""

import requests
import json

def test_connection_pools():
    """Test connection pools via B-Client API"""
    print("🔍 Testing B-Client connection pools...")
    
    try:
        # Get connection status from B-Client API
        response = requests.get("http://localhost:3000/api/c-client/status", timeout=5)
        
        if response.status_code == 200:
            data = response.json()
            print("✅ B-Client API response:")
            print(json.dumps(data, indent=2))
            
            # Check if there are any connections
            if 'summary' in data:
                summary = data['summary']
                print(f"\n📊 Connection Summary:")
                print(f"   Total Nodes: {summary.get('total_nodes', 0)}")
                print(f"   Total Users: {summary.get('total_users', 0)}")
                print(f"   Total Connections: {summary.get('total_connections', 0)}")
            
            # Check node connections
            if 'node_connections_info' in data:
                nodes = data['node_connections_info']
                print(f"\n🔌 Node Connections ({len(nodes)}):")
                for node in nodes:
                    print(f"   Node: {node.get('node_id')} | User: {node.get('user_id')} | Username: {node.get('username')}")
            
            # Check user connections
            if 'user_connections' in data:
                users = data['user_connections']
                print(f"\n👥 User Connections ({len(users)}):")
                for user_id, info in users.items():
                    print(f"   User: {user_id} | Connections: {info.get('connection_count', 0)} | Nodes: {info.get('nodes', [])}")
                    
        else:
            print(f"❌ B-Client API error: {response.status_code}")
            print(f"   Response: {response.text}")
            
    except requests.exceptions.ConnectionError:
        print("❌ Cannot connect to B-Client API")
        print("   Make sure B-Client is running on http://localhost:3000")
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    test_connection_pools()
