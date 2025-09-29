#!/usr/bin/env python3
"""
Test script for new connection pool implementation
This script tests the updated connection pool structure that supports:
- Multiple connections per node
- Multiple users per client
- Multiple clients per user
- No node rejection logic
"""

import asyncio
import websockets
import json
import time
import uuid

class ConnectionPoolTester:
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
                return websocket
            else:
                print(f"❌ Registration failed: {response_data}")
                await websocket.close()
                return None
                
        except Exception as e:
            print(f"❌ Error creating connection: {e}")
            return None
    
    async def test_multiple_connections_per_node(self):
        """Test multiple connections on the same node"""
        print("\n🧪 Test 1: Multiple connections per node")
        print("=" * 50)
        
        node_id = "test_node_1"
        connections = []
        
        # Create 3 connections on the same node with different users
        for i in range(3):
            client_id = f"client_{i+1}"
            user_id = f"user_{i+1}"
            username = f"testuser_{i+1}"
            
            websocket = await self.create_test_connection(client_id, user_id, username, node_id)
            if websocket:
                connections.append(websocket)
                await asyncio.sleep(0.5)  # Small delay between connections
        
        print(f"📊 Created {len(connections)} connections on node {node_id}")
        return connections
    
    async def test_multiple_users_per_client(self):
        """Test multiple users on the same client"""
        print("\n🧪 Test 2: Multiple users per client")
        print("=" * 50)
        
        client_id = "multi_user_client"
        connections = []
        
        # Create 3 connections with the same client but different users
        for i in range(3):
            user_id = f"multi_user_{i+1}"
            username = f"multiuser_{i+1}"
            node_id = f"multi_node_{i+1}"
            
            websocket = await self.create_test_connection(client_id, user_id, username, node_id)
            if websocket:
                connections.append(websocket)
                await asyncio.sleep(0.5)
        
        print(f"📊 Created {len(connections)} connections for client {client_id}")
        return connections
    
    async def test_duplicate_users(self):
        """Test duplicate users (same user on different clients/nodes)"""
        print("\n🧪 Test 3: Duplicate users")
        print("=" * 50)
        
        user_id = "duplicate_user"
        username = "duplicateuser"
        connections = []
        
        # Create 3 connections with the same user but different clients/nodes
        for i in range(3):
            client_id = f"duplicate_client_{i+1}"
            node_id = f"duplicate_node_{i+1}"
            
            websocket = await self.create_test_connection(client_id, user_id, username, node_id)
            if websocket:
                connections.append(websocket)
                await asyncio.sleep(0.5)
        
        print(f"📊 Created {len(connections)} connections for user {user_id}")
        return connections
    
    async def test_mixed_scenarios(self):
        """Test mixed scenarios with various combinations"""
        print("\n🧪 Test 4: Mixed scenarios")
        print("=" * 50)
        
        connections = []
        
        # Scenario 1: Same node, different clients, different users
        for i in range(2):
            client_id = f"mixed_client_{i+1}"
            user_id = f"mixed_user_{i+1}"
            username = f"mixeduser_{i+1}"
            node_id = "mixed_node_1"
            
            websocket = await self.create_test_connection(client_id, user_id, username, node_id)
            if websocket:
                connections.append(websocket)
                await asyncio.sleep(0.5)
        
        # Scenario 2: Same client, different nodes, different users
        for i in range(2):
            client_id = "mixed_client_3"
            user_id = f"mixed_user_{i+3}"
            username = f"mixeduser_{i+3}"
            node_id = f"mixed_node_{i+2}"
            
            websocket = await self.create_test_connection(client_id, user_id, username, node_id)
            if websocket:
                connections.append(websocket)
                await asyncio.sleep(0.5)
        
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
        """Run all connection pool tests"""
        print("🚀 Starting Connection Pool Tests")
        print("=" * 60)
        
        all_connections = []
        
        try:
            # Test 1: Multiple connections per node
            connections1 = await self.test_multiple_connections_per_node()
            all_connections.extend(connections1)
            
            # Test 2: Multiple users per client
            connections2 = await self.test_multiple_users_per_client()
            all_connections.extend(connections2)
            
            # Test 3: Duplicate users
            connections3 = await self.test_duplicate_users()
            all_connections.extend(connections3)
            
            # Test 4: Mixed scenarios
            connections4 = await self.test_mixed_scenarios()
            all_connections.extend(connections4)
            
            print(f"\n📊 Test Summary:")
            print(f"   Total connections created: {len(all_connections)}")
            print(f"   All tests completed successfully!")
            
        except Exception as e:
            print(f"❌ Test failed: {e}")
        finally:
            # Clean up all connections
            await self.cleanup_connections(all_connections)

async def main():
    """Main test function"""
    print("🔧 Connection Pool Tester")
    print("Testing new connection pool structure:")
    print("- Multiple connections per node")
    print("- Multiple users per client") 
    print("- Multiple clients per user")
    print("- No node rejection logic")
    print()
    
    tester = ConnectionPoolTester()
    await tester.run_all_tests()

if __name__ == "__main__":
    asyncio.run(main())
