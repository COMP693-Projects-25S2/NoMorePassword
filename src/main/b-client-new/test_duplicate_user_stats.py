#!/usr/bin/env python3
"""
Test script for duplicate user statistics
This script tests the statistics when two clients login with the same user:
- Should show 1 user, not 2 users
- Should show 2 clients
- Should show 2 connections
"""

import asyncio
import websockets
import json
import time
import requests

class DuplicateUserStatsTester:
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
            
            # Wait for response (may receive multiple messages)
            registration_success = False
            notification_received = False
            
            try:
                # Wait for up to 3 seconds for responses
                for _ in range(10):  # Try up to 10 times
                    try:
                        response = await asyncio.wait_for(websocket.recv(), timeout=0.3)
                        response_data = json.loads(response)
                        print(f"📥 Received response: {response_data}")
                        
                        if response_data.get('type') == 'registration_success':
                            registration_success = True
                            print(f"✅ Registration successful for Client={client_id}, User={user_id}, Node={node_id}")
                        elif response_data.get('type') == 'user_connected_on_another_client':
                            notification_received = True
                            print(f"🔔 Received notification: {response_data.get('message', '')}")
                        
                        # If we got registration success, we're done
                        if registration_success:
                            break
                            
                    except asyncio.TimeoutError:
                        # No more messages, break
                        break
                        
            except Exception as e:
                print(f"❌ Error receiving responses: {e}")
            
            if registration_success:
                return websocket
            else:
                print(f"❌ Registration failed - no success message received")
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
        print(f"   Total Nodes: {summary.get('total_nodes', 0)}")
        
        # Print detailed user connections
        user_connections = status.get('user_connections', {})
        if user_connections:
            print(f"\n👥 User Connections Details ({len(user_connections)}):")
            for user_id, user_info in user_connections.items():
                print(f"   User {user_id}:")
                print(f"      Connection Count: {user_info.get('connection_count', 0)}")
                print(f"      Clients: {user_info.get('clients', [])}")
                print(f"      Nodes: {user_info.get('nodes', [])}")
                print(f"      Usernames: {user_info.get('usernames', [])}")
        
        # Print detailed client connections
        client_connections = status.get('client_connections', {})
        if client_connections:
            print(f"\n🔌 Client Connections Details ({len(client_connections)}):")
            for client_id, client_info in client_connections.items():
                print(f"   Client {client_id}:")
                print(f"      Connection Count: {client_info.get('connection_count', 0)}")
                print(f"      Users: {client_info.get('users', [])}")
                print(f"      Nodes: {client_info.get('nodes', [])}")
                print(f"      Usernames: {client_info.get('usernames', [])}")
        
        # Print node connections
        node_connections = status.get('node_connections', {})
        if node_connections:
            print(f"\n🔌 Node Connections Details ({len(node_connections)}):")
            for node_id, node_info in node_connections.items():
                print(f"   Node {node_id}:")
                print(f"      Connection Count: {node_info.get('connection_count', 0)}")
                print(f"      Users: {node_info.get('users', [])}")
                print(f"      Clients: {node_info.get('clients', [])}")
                print(f"      Usernames: {node_info.get('usernames', [])}")
    
    async def test_duplicate_user_scenario(self):
        """Test scenario where two clients login with the same user"""
        print("\n🧪 Test: Duplicate User Statistics")
        print("=" * 60)
        print("📋 Scenario: Two clients login with the same user")
        print("   Expected: 1 user, 2 clients, 2 connections")
        
        connections = []
        
        # Step 1: First client logs in with user_1
        print("\n📋 Step 1: First client logs in with user_1")
        conn1 = await self.create_test_connection("client_1", "user_1", "user1", "node_1")
        if conn1:
            connections.append(conn1)
        
        self.print_connection_status("After first client login")
        await asyncio.sleep(1)
        
        # Step 2: Second client logs in with the same user_1
        print("\n📋 Step 2: Second client logs in with the same user_1")
        conn2 = await self.create_test_connection("client_2", "user_1", "user1", "node_2")
        if conn2:
            connections.append(conn2)
        
        self.print_connection_status("After second client login (same user)")
        await asyncio.sleep(1)
        
        # Step 3: Third client logs in with different user_2
        print("\n📋 Step 3: Third client logs in with different user_2")
        conn3 = await self.create_test_connection("client_3", "user_2", "user2", "node_3")
        if conn3:
            connections.append(conn3)
        
        self.print_connection_status("After third client login (different user)")
        await asyncio.sleep(1)
        
        # Step 4: Fourth client logs in with user_1 again (different node)
        print("\n📋 Step 4: Fourth client logs in with user_1 again (different node)")
        conn4 = await self.create_test_connection("client_4", "user_1", "user1", "node_4")
        if conn4:
            connections.append(conn4)
        
        self.print_connection_status("After fourth client login (user_1 again)")
        await asyncio.sleep(1)
        
        return connections
    
    async def test_user_connection_pool_integrity(self):
        """Test user connection pool integrity"""
        print("\n🧪 Test: User Connection Pool Integrity")
        print("=" * 60)
        
        connections = []
        
        # Create multiple connections with same user
        test_cases = [
            ("client_1", "same_user", "sameuser", "node_1"),
            ("client_2", "same_user", "sameuser", "node_2"),
            ("client_3", "same_user", "sameuser", "node_3"),
        ]
        
        for i, (client_id, user_id, username, node_id) in enumerate(test_cases, 1):
            print(f"\n📋 Step {i}: Client {client_id} logs in with {user_id}")
            conn = await self.create_test_connection(client_id, user_id, username, node_id)
            if conn:
                connections.append(conn)
            
            self.print_connection_status(f"After step {i}")
            await asyncio.sleep(1)
        
        # Verify statistics
        status = self.get_connection_status()
        if status:
            summary = status.get('summary', {})
            user_connections = status.get('user_connections', {})
            
            print(f"\n🔍 Verification:")
            print(f"   Total Users: {summary.get('total_users', 0)} (Expected: 1)")
            print(f"   Total Clients: {summary.get('total_clients', 0)} (Expected: 3)")
            print(f"   Total Connections: {summary.get('total_connections', 0)} (Expected: 3)")
            
            if 'same_user' in user_connections:
                user_info = user_connections['same_user']
                print(f"   Same User Connections: {user_info.get('connection_count', 0)} (Expected: 3)")
                print(f"   Same User Clients: {user_info.get('clients', [])} (Expected: ['client_1', 'client_2', 'client_3'])")
                print(f"   Same User Nodes: {user_info.get('nodes', [])} (Expected: ['node_1', 'node_2', 'node_3'])")
            
            # Check if statistics are correct
            if summary.get('total_users', 0) == 1:
                print("✅ User count is correct (1 user)")
            else:
                print(f"❌ User count is incorrect: {summary.get('total_users', 0)} (expected 1)")
            
            if summary.get('total_clients', 0) == 3:
                print("✅ Client count is correct (3 clients)")
            else:
                print(f"❌ Client count is incorrect: {summary.get('total_clients', 0)} (expected 3)")
            
            if summary.get('total_connections', 0) == 3:
                print("✅ Connection count is correct (3 connections)")
            else:
                print(f"❌ Connection count is incorrect: {summary.get('total_connections', 0)} (expected 3)")
        
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
        """Run all duplicate user statistics tests"""
        print("🚀 Starting Duplicate User Statistics Tests")
        print("=" * 60)
        print("📋 Testing Duplicate User Statistics:")
        print("   - Same user on multiple clients")
        print("   - Statistics accuracy")
        print("   - Connection pool integrity")
        print("=" * 60)
        
        all_connections = []
        
        try:
            # Test 1: Duplicate user scenario
            connections1 = await self.test_duplicate_user_scenario()
            all_connections.extend(connections1)
            
            # Test 2: User connection pool integrity
            connections2 = await self.test_user_connection_pool_integrity()
            all_connections.extend(connections2)
            
            print(f"\n📊 Test Summary:")
            print(f"   Total connections created: {len(all_connections)}")
            print(f"   All duplicate user statistics tests completed!")
            
        except Exception as e:
            print(f"❌ Test failed: {e}")
        finally:
            # Clean up all connections
            await self.cleanup_connections(all_connections)

async def main():
    """Main test function"""
    print("🔧 Duplicate User Statistics Tester")
    print("Testing duplicate user statistics:")
    print("- Same user on multiple clients")
    print("- Statistics accuracy")
    print("- Connection pool integrity")
    print()
    
    tester = DuplicateUserStatsTester()
    await tester.run_all_tests()

if __name__ == "__main__":
    asyncio.run(main())
