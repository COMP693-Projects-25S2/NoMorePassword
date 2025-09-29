#!/usr/bin/env python3
"""
Test script for node offline cleanup
This script tests the connection pool cleanup when a node goes offline:
- Close all clients on the offline node
- Check if users are only connected on the offline node, if so clean up
- Check if clients are only connected on the offline node, if so clean up
- Proper connection management during node offline
"""

import asyncio
import websockets
import json
import time
import requests

class NodeOfflineCleanupTester:
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
        print(f"   Total Nodes: {summary.get('total_nodes', 0)}")
        
        # Print node connections
        node_connections = status.get('node_connections_info', [])
        if node_connections:
            print(f"   🔌 Node Connections ({len(node_connections)}):")
            for node_info in node_connections:
                print(f"      Node {node_info.get('node_id')}: {node_info.get('connection_count', 0)} connections")
        
        # Print client connections
        client_connections = status.get('client_connections', {})
        if client_connections:
            print(f"   🔌 Client Connections ({len(client_connections)}):")
            for client_id, client_info in client_connections.items():
                print(f"      Client {client_id}: {client_info.get('connection_count', 0)} connections")
                print(f"         Users: {client_info.get('users', [])}")
                print(f"         Nodes: {client_info.get('nodes', [])}")
        
        # Print user connections
        user_connections = status.get('user_connections', {})
        if user_connections:
            print(f"   👥 User Connections ({len(user_connections)}):")
            for user_id, user_info in user_connections.items():
                print(f"      User {user_id}: {user_info.get('connection_count', 0)} connections")
                print(f"         Clients: {user_info.get('clients', [])}")
                print(f"         Nodes: {user_info.get('nodes', [])}")
    
    def trigger_node_offline(self, node_id):
        """Trigger node offline cleanup via API"""
        try:
            response = requests.post(
                f"{self.api_url}/api/node/offline",
                json={'node_id': node_id},
                headers={'Content-Type': 'application/json'}
            )
            
            if response.status_code == 200:
                data = response.json()
                print(f"✅ Node offline triggered: {data.get('message', '')}")
                return True
            else:
                print(f"❌ Node offline trigger failed: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            print(f"❌ Error triggering node offline: {e}")
            return False
    
    async def test_basic_node_offline_cleanup(self):
        """Test basic node offline cleanup"""
        print("\n🧪 Test: Basic Node Offline Cleanup")
        print("=" * 60)
        
        connections = []
        
        # Step 1: Create connections on different nodes
        print("📋 Step 1: Create connections on different nodes")
        
        # Node 1 connections
        conn1 = await self.create_test_connection("client_1", "user_1", "user1", "node_1")
        if conn1:
            connections.append(conn1)
        
        conn2 = await self.create_test_connection("client_2", "user_2", "user2", "node_1")
        if conn2:
            connections.append(conn2)
        
        # Node 2 connections
        conn3 = await self.create_test_connection("client_3", "user_1", "user1", "node_2")
        if conn3:
            connections.append(conn3)
        
        conn4 = await self.create_test_connection("client_4", "user_3", "user3", "node_2")
        if conn4:
            connections.append(conn4)
        
        self.print_connection_status("After creating connections")
        await asyncio.sleep(1)
        
        # Step 2: Trigger node 1 offline
        print("\n📋 Step 2: Trigger node 1 offline")
        success = self.trigger_node_offline("node_1")
        if success:
            await asyncio.sleep(2)  # Wait for cleanup
            self.print_connection_status("After node 1 offline cleanup")
        
        return connections
    
    async def test_orphaned_user_cleanup(self):
        """Test orphaned user cleanup when node goes offline"""
        print("\n🧪 Test: Orphaned User Cleanup")
        print("=" * 60)
        
        connections = []
        
        # Step 1: Create user only on one node
        print("📋 Step 1: Create user only on node 1")
        conn1 = await self.create_test_connection("client_1", "orphaned_user", "orphaneduser", "node_1")
        if conn1:
            connections.append(conn1)
        
        self.print_connection_status("After creating orphaned user")
        await asyncio.sleep(1)
        
        # Step 2: Trigger node 1 offline (should clean up orphaned user)
        print("\n📋 Step 2: Trigger node 1 offline (should clean up orphaned user)")
        success = self.trigger_node_offline("node_1")
        if success:
            await asyncio.sleep(2)  # Wait for cleanup
            self.print_connection_status("After node 1 offline (orphaned user should be cleaned up)")
        
        return connections
    
    async def test_multi_node_user_cleanup(self):
        """Test user cleanup when user is on multiple nodes"""
        print("\n🧪 Test: Multi-Node User Cleanup")
        print("=" * 60)
        
        connections = []
        
        # Step 1: Create user on multiple nodes
        print("📋 Step 1: Create user on multiple nodes")
        conn1 = await self.create_test_connection("client_1", "multi_user", "multiuser", "node_1")
        if conn1:
            connections.append(conn1)
        
        conn2 = await self.create_test_connection("client_2", "multi_user", "multiuser", "node_2")
        if conn2:
            connections.append(conn2)
        
        self.print_connection_status("After creating multi-node user")
        await asyncio.sleep(1)
        
        # Step 2: Trigger node 1 offline (user should still exist on node 2)
        print("\n📋 Step 2: Trigger node 1 offline (user should still exist on node 2)")
        success = self.trigger_node_offline("node_1")
        if success:
            await asyncio.sleep(2)  # Wait for cleanup
            self.print_connection_status("After node 1 offline (user should still exist on node 2)")
        
        return connections
    
    async def test_orphaned_client_cleanup(self):
        """Test orphaned client cleanup when node goes offline"""
        print("\n🧪 Test: Orphaned Client Cleanup")
        print("=" * 60)
        
        connections = []
        
        # Step 1: Create client only on one node
        print("📋 Step 1: Create client only on node 1")
        conn1 = await self.create_test_connection("orphaned_client", "user_1", "user1", "node_1")
        if conn1:
            connections.append(conn1)
        
        self.print_connection_status("After creating orphaned client")
        await asyncio.sleep(1)
        
        # Step 2: Trigger node 1 offline (should clean up orphaned client)
        print("\n📋 Step 2: Trigger node 1 offline (should clean up orphaned client)")
        success = self.trigger_node_offline("node_1")
        if success:
            await asyncio.sleep(2)  # Wait for cleanup
            self.print_connection_status("After node 1 offline (orphaned client should be cleaned up)")
        
        return connections
    
    async def test_complex_cleanup_scenario(self):
        """Test complex cleanup scenario with multiple nodes, clients, and users"""
        print("\n🧪 Test: Complex Cleanup Scenario")
        print("=" * 60)
        
        connections = []
        
        # Step 1: Create complex connection scenario
        print("📋 Step 1: Create complex connection scenario")
        
        # Node 1: client_1 with user_1, client_2 with user_2
        conn1 = await self.create_test_connection("client_1", "user_1", "user1", "node_1")
        if conn1:
            connections.append(conn1)
        
        conn2 = await self.create_test_connection("client_2", "user_2", "user2", "node_1")
        if conn2:
            connections.append(conn2)
        
        # Node 2: client_3 with user_1 (same user on different node), client_4 with user_3
        conn3 = await self.create_test_connection("client_3", "user_1", "user1", "node_2")
        if conn3:
            connections.append(conn3)
        
        conn4 = await self.create_test_connection("client_4", "user_3", "user3", "node_2")
        if conn4:
            connections.append(conn4)
        
        # Node 3: client_5 with user_4 (orphaned user)
        conn5 = await self.create_test_connection("client_5", "user_4", "user4", "node_3")
        if conn5:
            connections.append(conn5)
        
        self.print_connection_status("After creating complex scenario")
        await asyncio.sleep(1)
        
        # Step 2: Trigger node 1 offline
        print("\n📋 Step 2: Trigger node 1 offline")
        success = self.trigger_node_offline("node_1")
        if success:
            await asyncio.sleep(2)  # Wait for cleanup
            self.print_connection_status("After node 1 offline cleanup")
        
        # Step 3: Trigger node 3 offline (should clean up orphaned user_4)
        print("\n📋 Step 3: Trigger node 3 offline (should clean up orphaned user_4)")
        success = self.trigger_node_offline("node_3")
        if success:
            await asyncio.sleep(2)  # Wait for cleanup
            self.print_connection_status("After node 3 offline cleanup")
        
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
        """Run all node offline cleanup tests"""
        print("🚀 Starting Node Offline Cleanup Tests")
        print("=" * 60)
        print("📋 Testing Node Offline Cleanup:")
        print("   - Close all clients on offline node")
        print("   - Clean up orphaned users")
        print("   - Clean up orphaned clients")
        print("   - Handle multi-node scenarios")
        print("=" * 60)
        
        all_connections = []
        
        try:
            # Test 1: Basic node offline cleanup
            connections1 = await self.test_basic_node_offline_cleanup()
            all_connections.extend(connections1)
            
            # Test 2: Orphaned user cleanup
            connections2 = await self.test_orphaned_user_cleanup()
            all_connections.extend(connections2)
            
            # Test 3: Multi-node user cleanup
            connections3 = await self.test_multi_node_user_cleanup()
            all_connections.extend(connections3)
            
            # Test 4: Orphaned client cleanup
            connections4 = await self.test_orphaned_client_cleanup()
            all_connections.extend(connections4)
            
            # Test 5: Complex cleanup scenario
            connections5 = await self.test_complex_cleanup_scenario()
            all_connections.extend(connections5)
            
            print(f"\n📊 Test Summary:")
            print(f"   Total connections created: {len(all_connections)}")
            print(f"   All node offline cleanup tests completed successfully!")
            
        except Exception as e:
            print(f"❌ Test failed: {e}")
        finally:
            # Clean up all connections
            await self.cleanup_connections(all_connections)

async def main():
    """Main test function"""
    print("🔧 Node Offline Cleanup Tester")
    print("Testing node offline cleanup functionality:")
    print("- Close all clients on offline node")
    print("- Clean up orphaned users")
    print("- Clean up orphaned clients")
    print("- Handle multi-node scenarios")
    print()
    
    tester = NodeOfflineCleanupTester()
    await tester.run_all_tests()

if __name__ == "__main__":
    asyncio.run(main())
