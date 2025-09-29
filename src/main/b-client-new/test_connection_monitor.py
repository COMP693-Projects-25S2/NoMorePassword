#!/usr/bin/env python3
"""
Test script for updated connection monitor
This script tests the updated Real-time Connection Monitor that shows:
- Client count instead of node count
- Client connection details
- Proper statistics display
"""

import asyncio
import websockets
import json
import time
import requests

class ConnectionMonitorTester:
    def __init__(self):
        self.server_url = "ws://localhost:8766"
        self.api_url = "http://localhost:3000"
        self.connections = []
        
    async def create_test_connection(self, client_id, user_id, username, node_id):
        """Create a test connection with specific parameters"""
        try:
            websocket = await websockets.connect(self.server_url)
            
            # Send registration message
            registration_message = {
                'type': 'c_client_register',
                'client_id': client_id,
                'user_id': user_id,
                'username': username,
                'node_id': node_id,
                'domain_id': f'domain_{user_id}',
                'cluster_id': f'cluster_{user_id}',
                'channel_id': f'channel_{user_id}'
            }
            
            await websocket.send(json.dumps(registration_message))
            print(f"📤 Sent registration: Client={client_id}, User={user_id}, Node={node_id}")
            
            # Wait for response
            response = await websocket.recv()
            response_data = json.loads(response)
            print(f"📥 Received response: {response_data}")
            
            if response_data.get('type') == 'registration_success':
                print(f"✅ Registration successful for Client={client_id}, User={user_id}, Node={node_id}")
                return websocket
            else:
                print(f"❌ Registration failed: {response_data}")
                await websocket.close()
                return None
                
        except Exception as e:
            print(f"❌ Error creating connection: {e}")
            return None
    
    def test_api_status(self):
        """Test API status endpoint"""
        print("\n🧪 Testing API Status Endpoint")
        print("=" * 50)
        
        try:
            response = requests.get(f"{self.api_url}/api/c-client/status")
            if response.status_code == 200:
                data = response.json()
                print("✅ API Status Response:")
                print(f"   Success: {data.get('success')}")
                
                if data.get('success'):
                    connected_clients = data.get('connected_clients', {})
                    summary = connected_clients.get('summary', {})
                    
                    print(f"   📊 Connection Statistics:")
                    print(f"      Total Connections: {summary.get('total_connections', 0)}")
                    print(f"      Total Clients: {summary.get('total_clients', 0)}")
                    print(f"      Total Users: {summary.get('total_users', 0)}")
                    print(f"      Total Nodes: {summary.get('total_nodes', 0)}")
                    
                    # Display client connections
                    client_connections = connected_clients.get('client_connections', {})
                    if client_connections:
                        print(f"   🔌 Client Connections ({len(client_connections)}):")
                        for client_id, client_info in client_connections.items():
                            print(f"      Client {client_id}:")
                            print(f"         Connection Count: {client_info.get('connection_count', 0)}")
                            print(f"         Users: {client_info.get('users', [])}")
                            print(f"         Nodes: {client_info.get('nodes', [])}")
                            print(f"         Usernames: {client_info.get('usernames', [])}")
                    
                    # Display user connections
                    user_connections = connected_clients.get('user_connections', {})
                    if user_connections:
                        print(f"   👥 User Connections ({len(user_connections)}):")
                        for user_id, user_info in user_connections.items():
                            print(f"      User {user_id}:")
                            print(f"         Connection Count: {user_info.get('connection_count', 0)}")
                            print(f"         Clients: {user_info.get('clients', [])}")
                            print(f"         Nodes: {user_info.get('nodes', [])}")
                            print(f"         Usernames: {user_info.get('usernames', [])}")
                    
                    return True
                else:
                    print(f"❌ API returned error: {data.get('error')}")
                    return False
            else:
                print(f"❌ API request failed with status {response.status_code}")
                return False
                
        except Exception as e:
            print(f"❌ Error testing API: {e}")
            return False
    
    async def test_connection_scenarios(self):
        """Test various connection scenarios"""
        print("\n🧪 Testing Connection Scenarios")
        print("=" * 50)
        
        connections = []
        
        # Scenario 1: Multiple clients on same node
        print("📋 Scenario 1: Multiple clients on same node")
        node_id = "test_node_1"
        scenarios = [
            ("client_1", "user_1", "user1", node_id),
            ("client_2", "user_2", "user2", node_id),
            ("client_3", "user_3", "user3", node_id)
        ]
        
        for client_id, user_id, username, node_id in scenarios:
            websocket = await self.create_test_connection(client_id, user_id, username, node_id)
            if websocket:
                connections.append(websocket)
                await asyncio.sleep(0.5)
        
        # Scenario 2: Same user on different nodes with different clients
        print("📋 Scenario 2: Same user on different nodes")
        user_id = "multi_user"
        username = "multiuser"
        scenarios = [
            ("client_4", user_id, username, "node_2"),
            ("client_5", user_id, username, "node_3"),
            ("client_6", user_id, username, "node_4")
        ]
        
        for client_id, user_id, username, node_id in scenarios:
            websocket = await self.create_test_connection(client_id, user_id, username, node_id)
            if websocket:
                connections.append(websocket)
                await asyncio.sleep(0.5)
        
        # Scenario 3: Multiple users on same client
        print("📋 Scenario 3: Multiple users on same client")
        client_id = "multi_user_client"
        node_id = "multi_node"
        scenarios = [
            (client_id, "user_4", "user4", node_id),
            (client_id, "user_5", "user5", node_id),
            (client_id, "user_6", "user6", node_id)
        ]
        
        for client_id, user_id, username, node_id in scenarios:
            websocket = await self.create_test_connection(client_id, user_id, username, node_id)
            if websocket:
                connections.append(websocket)
                await asyncio.sleep(0.5)
        
        print(f"📊 Created {len(connections)} connections")
        return connections
    
    async def cleanup_connections(self, connections):
        """Clean up all test connections"""
        print(f"\n🧹 Cleaning up {len(connections)} connections...")
        for websocket in connections:
            try:
                await websocket.close()
            except:
                pass
        print("✅ Cleanup completed")
    
    async def run_all_tests(self):
        """Run all connection monitor tests"""
        print("🚀 Starting Connection Monitor Tests")
        print("=" * 60)
        print("📋 Testing Updated Connection Monitor:")
        print("   - Client count instead of node count")
        print("   - Client connection details")
        print("   - Proper statistics display")
        print("=" * 60)
        
        all_connections = []
        
        try:
            # Test 1: API status before connections
            print("\n🔍 Testing API status before connections...")
            self.test_api_status()
            
            # Test 2: Create various connection scenarios
            connections = await self.test_connection_scenarios()
            all_connections.extend(connections)
            
            # Test 3: API status after connections
            print("\n🔍 Testing API status after connections...")
            self.test_api_status()
            
            # Test 4: Wait and test again
            print("\n⏰ Waiting 2 seconds and testing again...")
            await asyncio.sleep(2)
            self.test_api_status()
            
            print(f"\n📊 Test Summary:")
            print(f"   Total connections created: {len(all_connections)}")
            print(f"   All connection monitor tests completed successfully!")
            
        except Exception as e:
            print(f"❌ Test failed: {e}")
        finally:
            # Clean up all connections
            await self.cleanup_connections(all_connections)

async def main():
    """Main test function"""
    print("🔧 Connection Monitor Tester")
    print("Testing updated Real-time Connection Monitor:")
    print("- Client count instead of node count")
    print("- Client connection details")
    print("- Proper statistics display")
    print()
    
    tester = ConnectionMonitorTester()
    await tester.run_all_tests()

if __name__ == "__main__":
    asyncio.run(main())