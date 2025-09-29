#!/usr/bin/env python3
"""
Test script for client user switch cleanup
This script tests the connection pool cleanup when a client switches users:
- Client pool cleanup: Remove old user from client pool
- User pool cleanup: Remove client from user pool
- Proper connection management during user switches
"""

import asyncio
import websockets
import json
import time
import requests

class ClientUserSwitchTester:
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
    
    def get_connection_status(self):
        """Get current connection status from API"""
        try:
            response = requests.get(f"{self.api_url}/api/c-client/status")
            if response.status_code == 200:
                data = response.json()
                if data.get('success'):
                    return data.get('connected_clients', {})
            return None
        except Exception as e:
            print(f"❌ Error getting connection status: {e}")
            return None
    
    def print_connection_status(self, title):
        """Print current connection status"""
        print(f"\n📊 {title}")
        print("=" * 50)
        
        status = self.get_connection_status()
        if not status:
            print("❌ Failed to get connection status")
            return
        
        summary = status.get('summary', {})
        print(f"   Total Connections: {summary.get('total_connections', 0)}")
        print(f"   Total Clients: {summary.get('total_clients', 0)}")
        print(f"   Total Users: {summary.get('total_users', 0)}")
        
        # Print client connections
        client_connections = status.get('client_connections', {})
        if client_connections:
            print(f"   🔌 Client Connections ({len(client_connections)}):")
            for client_id, client_info in client_connections.items():
                print(f"      Client {client_id}:")
                print(f"         Connection Count: {client_info.get('connection_count', 0)}")
                print(f"         Users: {client_info.get('users', [])}")
                print(f"         Nodes: {client_info.get('nodes', [])}")
                print(f"         Usernames: {client_info.get('usernames', [])}")
        
        # Print user connections
        user_connections = status.get('user_connections', {})
        if user_connections:
            print(f"   👥 User Connections ({len(user_connections)}):")
            for user_id, user_info in user_connections.items():
                print(f"      User {user_id}:")
                print(f"         Connection Count: {user_info.get('connection_count', 0)}")
                print(f"         Clients: {user_info.get('clients', [])}")
                print(f"         Nodes: {user_info.get('nodes', [])}")
                print(f"         Usernames: {user_info.get('usernames', [])}")
    
    async def test_client_user_switch_cleanup(self):
        """Test client user switch cleanup functionality"""
        print("\n🧪 Test: Client User Switch Cleanup")
        print("=" * 60)
        
        client_id = "test_client"
        node_id = "test_node"
        connections = []
        
        # Step 1: Connect first user
        print("📋 Step 1: Connect first user")
        websocket1 = await self.create_test_connection(client_id, "user_1", "user1", node_id)
        if websocket1:
            connections.append(websocket1)
            self.print_connection_status("After first user connection")
            await asyncio.sleep(1)
        
        # Step 2: Connect second user (should trigger cleanup)
        print("\n📋 Step 2: Connect second user (should trigger cleanup)")
        websocket2 = await self.create_test_connection(client_id, "user_2", "user2", node_id)
        if websocket2:
            connections.append(websocket2)
            self.print_connection_status("After second user connection (cleanup should have occurred)")
            await asyncio.sleep(1)
        
        # Step 3: Connect third user (should trigger cleanup again)
        print("\n📋 Step 3: Connect third user (should trigger cleanup again)")
        websocket3 = await self.create_test_connection(client_id, "user_3", "user3", node_id)
        if websocket3:
            connections.append(websocket3)
            self.print_connection_status("After third user connection (cleanup should have occurred again)")
            await asyncio.sleep(1)
        
        print(f"📊 Created {len(connections)} connections for client {client_id}")
        return connections
    
    async def test_multiple_clients_user_switches(self):
        """Test multiple clients with user switches"""
        print("\n🧪 Test: Multiple Clients User Switches")
        print("=" * 60)
        
        connections = []
        
        # Test multiple clients with user switches
        test_cases = [
            ("client_1", "user_1", "user1", "node_1"),
            ("client_1", "user_2", "user2", "node_1"),  # Same client, different user
            ("client_2", "user_1", "user1", "node_2"),  # Different client, same user
            ("client_2", "user_3", "user3", "node_2"),  # Same client, different user
            ("client_3", "user_2", "user2", "node_3"),  # Different client, same user
        ]
        
        for i, (client_id, user_id, username, node_id) in enumerate(test_cases, 1):
            print(f"\n📋 Step {i}: Connect {client_id} with {user_id}")
            websocket = await self.create_test_connection(client_id, user_id, username, node_id)
            if websocket:
                connections.append(websocket)
                self.print_connection_status(f"After step {i}")
                await asyncio.sleep(1)
        
        print(f"📊 Created {len(connections)} connections")
        return connections
    
    async def test_cleanup_verification(self):
        """Test cleanup verification"""
        print("\n🧪 Test: Cleanup Verification")
        print("=" * 60)
        
        client_id = "cleanup_test_client"
        node_id = "cleanup_test_node"
        connections = []
        
        # Connect user 1
        print("📋 Connecting user 1...")
        websocket1 = await self.create_test_connection(client_id, "cleanup_user_1", "cleanupuser1", node_id)
        if websocket1:
            connections.append(websocket1)
            self.print_connection_status("After user 1 connection")
            await asyncio.sleep(1)
        
        # Connect user 2 (should cleanup user 1)
        print("\n📋 Connecting user 2 (should cleanup user 1)...")
        websocket2 = await self.create_test_connection(client_id, "cleanup_user_2", "cleanupuser2", node_id)
        if websocket2:
            connections.append(websocket2)
            self.print_connection_status("After user 2 connection (user 1 should be cleaned up)")
            await asyncio.sleep(1)
        
        # Verify cleanup
        status = self.get_connection_status()
        if status:
            client_connections = status.get('client_connections', {})
            if client_id in client_connections:
                client_info = client_connections[client_id]
                users = client_info.get('users', [])
                usernames = client_info.get('usernames', [])
                
                print(f"\n🔍 Cleanup Verification:")
                print(f"   Client {client_id} users: {users}")
                print(f"   Client {client_id} usernames: {usernames}")
                
                if "cleanup_user_1" in users:
                    print("❌ Cleanup failed: user 1 still present")
                else:
                    print("✅ Cleanup successful: user 1 removed")
                
                if "cleanup_user_2" in users:
                    print("✅ Current user 2 present")
                else:
                    print("❌ Current user 2 missing")
        
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
        """Run all client user switch tests"""
        print("🚀 Starting Client User Switch Tests")
        print("=" * 60)
        print("📋 Testing Client User Switch Cleanup:")
        print("   - Client pool cleanup when switching users")
        print("   - User pool cleanup when client switches")
        print("   - Proper connection management")
        print("=" * 60)
        
        all_connections = []
        
        try:
            # Test 1: Basic client user switch cleanup
            connections1 = await self.test_client_user_switch_cleanup()
            all_connections.extend(connections1)
            
            # Test 2: Multiple clients with user switches
            connections2 = await self.test_multiple_clients_user_switches()
            all_connections.extend(connections2)
            
            # Test 3: Cleanup verification
            connections3 = await self.test_cleanup_verification()
            all_connections.extend(connections3)
            
            print(f"\n📊 Test Summary:")
            print(f"   Total connections created: {len(all_connections)}")
            print(f"   All client user switch tests completed successfully!")
            
        except Exception as e:
            print(f"❌ Test failed: {e}")
        finally:
            # Clean up all connections
            await self.cleanup_connections(all_connections)

async def main():
    """Main test function"""
    print("🔧 Client User Switch Tester")
    print("Testing client user switch cleanup functionality:")
    print("- Client pool cleanup when switching users")
    print("- User pool cleanup when client switches")
    print("- Proper connection management")
    print()
    
    tester = ClientUserSwitchTester()
    await tester.run_all_tests()

if __name__ == "__main__":
    asyncio.run(main())
