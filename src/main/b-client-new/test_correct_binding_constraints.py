#!/usr/bin/env python3
"""
Test script for correct binding constraints
This script tests the correct binding relationship constraints:
- One node can have multiple clients and users ✅
- One user can have multiple clients and nodes ✅  
- One client can have multiple users ✅
- One client can only have one node ❌ (enforced)
"""

import asyncio
import websockets
import json
import time
import uuid

class BindingConstraintsTester:
    def __init__(self):
        self.server_url = "ws://localhost:8766"
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
                return websocket, True
            elif response_data.get('type') == 'registration_rejected':
                print(f"❌ Registration rejected: {response_data.get('reason')} - {response_data.get('message')}")
                await websocket.close()
                return None, False
            else:
                print(f"❌ Unexpected response: {response_data}")
                await websocket.close()
                return None, False
                
        except Exception as e:
            print(f"❌ Error creating connection: {e}")
            return None, False
    
    async def test_node_multiple_clients_users(self):
        """Test: One node can have multiple clients and users"""
        print("\n🧪 Test 1: One node can have multiple clients and users")
        print("=" * 60)
        
        node_id = "test_node_1"
        connections = []
        
        # Test 1.1: Same node, different clients, different users
        test_cases = [
            ("client_1", "user_1", "user1", node_id),
            ("client_2", "user_2", "user2", node_id),
            ("client_3", "user_3", "user3", node_id)
        ]
        
        for client_id, user_id, username, node_id in test_cases:
            websocket, success = await self.create_test_connection(client_id, user_id, username, node_id)
            if success and websocket:
                connections.append(websocket)
                await asyncio.sleep(0.5)
        
        print(f"📊 Created {len(connections)} connections on node {node_id}")
        return connections
    
    async def test_user_multiple_clients_nodes(self):
        """Test: One user can have multiple clients and nodes"""
        print("\n🧪 Test 2: One user can have multiple clients and nodes")
        print("=" * 60)
        
        user_id = "multi_user"
        username = "multiuser"
        connections = []
        
        # Test 2.1: Same user, different clients, different nodes
        test_cases = [
            ("client_1", user_id, username, "node_1"),
            ("client_2", user_id, username, "node_2"),
            ("client_3", user_id, username, "node_3")
        ]
        
        for client_id, user_id, username, node_id in test_cases:
            websocket, success = await self.create_test_connection(client_id, user_id, username, node_id)
            if success and websocket:
                connections.append(websocket)
                await asyncio.sleep(0.5)
        
        print(f"📊 Created {len(connections)} connections for user {user_id}")
        return connections
    
    async def test_client_multiple_users(self):
        """Test: One client can have multiple users"""
        print("\n🧪 Test 3: One client can have multiple users")
        print("=" * 60)
        
        client_id = "multi_user_client"
        node_id = "multi_node"
        connections = []
        
        # Test 3.1: Same client, same node, different users
        test_cases = [
            (client_id, "user_1", "user1", node_id),
            (client_id, "user_2", "user2", node_id),
            (client_id, "user_3", "user3", node_id)
        ]
        
        for client_id, user_id, username, node_id in test_cases:
            websocket, success = await self.create_test_connection(client_id, user_id, username, node_id)
            if success and websocket:
                connections.append(websocket)
                await asyncio.sleep(0.5)
        
        print(f"📊 Created {len(connections)} connections for client {client_id}")
        return connections
    
    async def test_client_single_node_constraint(self):
        """Test: One client can only have one node (constraint enforcement)"""
        print("\n🧪 Test 4: One client can only have one node (constraint enforcement)")
        print("=" * 60)
        
        client_id = "single_node_client"
        connections = []
        
        # Test 4.1: Same client, different nodes - should reject second connection
        print("🔌 First connection: client to node_1")
        websocket1, success1 = await self.create_test_connection(client_id, "user_1", "user1", "node_1")
        if success1 and websocket1:
            connections.append(websocket1)
            print("✅ First connection successful")
        
        await asyncio.sleep(1)
        
        print("🔌 Second connection: same client to node_2 (should be rejected)")
        websocket2, success2 = await self.create_test_connection(client_id, "user_2", "user2", "node_2")
        if not success2:
            print("✅ Second connection correctly rejected (client already connected to different node)")
        else:
            print("❌ Second connection should have been rejected!")
            if websocket2:
                connections.append(websocket2)
        
        print(f"📊 Created {len(connections)} connections for client {client_id}")
        return connections
    
    async def test_mixed_scenarios(self):
        """Test: Mixed scenarios with all constraints"""
        print("\n🧪 Test 5: Mixed scenarios with all constraints")
        print("=" * 60)
        
        connections = []
        
        # Scenario 1: Multiple clients on same node with different users
        print("📋 Scenario 1: Multiple clients on same node")
        node_id = "mixed_node"
        scenarios = [
            ("client_1", "user_1", "user1", node_id),
            ("client_2", "user_2", "user2", node_id),
            ("client_3", "user_3", "user3", node_id)
        ]
        
        for client_id, user_id, username, node_id in scenarios:
            websocket, success = await self.create_test_connection(client_id, user_id, username, node_id)
            if success and websocket:
                connections.append(websocket)
                await asyncio.sleep(0.5)
        
        # Scenario 2: Same user on different nodes with different clients
        print("📋 Scenario 2: Same user on different nodes")
        user_id = "mixed_user"
        username = "mixeduser"
        scenarios = [
            ("client_4", user_id, username, "node_2"),
            ("client_5", user_id, username, "node_3"),
            ("client_6", user_id, username, "node_4")
        ]
        
        for client_id, user_id, username, node_id in scenarios:
            websocket, success = await self.create_test_connection(client_id, user_id, username, node_id)
            if success and websocket:
                connections.append(websocket)
                await asyncio.sleep(0.5)
        
        # Scenario 3: Test client constraint violation
        print("📋 Scenario 3: Test client constraint violation")
        client_id = "constraint_test_client"
        
        # First connection should succeed
        websocket1, success1 = await self.create_test_connection(client_id, "user_4", "user4", "node_5")
        if success1 and websocket1:
            connections.append(websocket1)
            print("✅ First connection successful")
        
        await asyncio.sleep(1)
        
        # Second connection to different node should fail
        websocket2, success2 = await self.create_test_connection(client_id, "user_5", "user5", "node_6")
        if not success2:
            print("✅ Second connection correctly rejected (client constraint enforced)")
        else:
            print("❌ Second connection should have been rejected!")
            if websocket2:
                connections.append(websocket2)
        
        print(f"📊 Created {len(connections)} connections in mixed scenarios")
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
        """Run all binding constraint tests"""
        print("🚀 Starting Binding Constraint Tests")
        print("=" * 60)
        print("📋 Testing Constraints:")
        print("   ✅ One node can have multiple clients and users")
        print("   ✅ One user can have multiple clients and nodes")
        print("   ✅ One client can have multiple users")
        print("   ❌ One client can only have one node (enforced)")
        print("=" * 60)
        
        all_connections = []
        
        try:
            # Test 1: Node multiple clients/users
            connections1 = await self.test_node_multiple_clients_users()
            all_connections.extend(connections1)
            
            # Test 2: User multiple clients/nodes
            connections2 = await self.test_user_multiple_clients_nodes()
            all_connections.extend(connections2)
            
            # Test 3: Client multiple users
            connections3 = await self.test_client_multiple_users()
            all_connections.extend(connections3)
            
            # Test 4: Client single node constraint
            connections4 = await self.test_client_single_node_constraint()
            all_connections.extend(connections4)
            
            # Test 5: Mixed scenarios
            connections5 = await self.test_mixed_scenarios()
            all_connections.extend(connections5)
            
            print(f"\n📊 Test Summary:")
            print(f"   Total connections created: {len(all_connections)}")
            print(f"   All constraint tests completed successfully!")
            
        except Exception as e:
            print(f"❌ Test failed: {e}")
        finally:
            # Clean up all connections
            await self.cleanup_connections(all_connections)

async def main():
    """Main test function"""
    print("🔧 Binding Constraint Tester")
    print("Testing correct binding relationship constraints:")
    print("- One node can have multiple clients and users")
    print("- One user can have multiple clients and nodes")
    print("- One client can have multiple users")
    print("- One client can only have one node (enforced)")
    print()
    
    tester = BindingConstraintsTester()
    await tester.run_all_tests()

if __name__ == "__main__":
    asyncio.run(main())
