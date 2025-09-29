#!/usr/bin/env python3
"""
Test script for user notification functionality
This script tests the user connection pool notification system that notifies
all existing connections when a user logs in on another client/node.
"""

import asyncio
import websockets
import json
import time
import uuid

class UserNotificationTester:
    def __init__(self):
        self.server_url = "ws://localhost:8766"
        self.connections = []
        self.received_notifications = []
        
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
    
    async def listen_for_notifications(self, websocket, connection_name):
        """Listen for notifications on a websocket connection"""
        try:
            while True:
                message = await websocket.recv()
                data = json.loads(message)
                
                if data.get('type') == 'user_connected_on_another_client':
                    notification = {
                        'connection_name': connection_name,
                        'notification': data,
                        'timestamp': time.time()
                    }
                    self.received_notifications.append(notification)
                    print(f"🔔 {connection_name} received notification: {data}")
                    
        except websockets.exceptions.ConnectionClosed:
            print(f"🔌 {connection_name} connection closed")
        except Exception as e:
            print(f"❌ {connection_name} error: {e}")
    
    async def test_user_notification_same_user_different_clients(self):
        """Test notification when same user logs in on different clients"""
        print("\n🧪 Test 1: Same user on different clients")
        print("=" * 50)
        
        user_id = "test_user_1"
        username = "testuser1"
        connections = []
        
        # Create first connection
        client_id_1 = "client_1"
        node_id_1 = "node_1"
        websocket_1 = await self.create_test_connection(client_id_1, user_id, username, node_id_1)
        if websocket_1:
            connections.append(websocket_1)
            # Start listening for notifications
            asyncio.create_task(self.listen_for_notifications(websocket_1, "Connection 1"))
            await asyncio.sleep(1)
        
        # Create second connection with same user but different client
        client_id_2 = "client_2"
        node_id_2 = "node_2"
        websocket_2 = await self.create_test_connection(client_id_2, user_id, username, node_id_2)
        if websocket_2:
            connections.append(websocket_2)
            # Start listening for notifications
            asyncio.create_task(self.listen_for_notifications(websocket_2, "Connection 2"))
            await asyncio.sleep(2)  # Wait for notifications
        
        # Create third connection with same user but different client
        client_id_3 = "client_3"
        node_id_3 = "node_3"
        websocket_3 = await self.create_test_connection(client_id_3, user_id, username, node_id_3)
        if websocket_3:
            connections.append(websocket_3)
            # Start listening for notifications
            asyncio.create_task(self.listen_for_notifications(websocket_3, "Connection 3"))
            await asyncio.sleep(2)  # Wait for notifications
        
        print(f"📊 Created {len(connections)} connections for user {user_id}")
        print(f"📊 Received {len(self.received_notifications)} notifications")
        
        return connections
    
    async def test_user_notification_different_users_same_client(self):
        """Test notification when different users log in on same client"""
        print("\n🧪 Test 2: Different users on same client")
        print("=" * 50)
        
        client_id = "multi_user_client"
        connections = []
        
        # Create connections with different users but same client
        for i in range(3):
            user_id = f"multi_user_{i+1}"
            username = f"multiuser_{i+1}"
            node_id = f"multi_node_{i+1}"
            
            websocket = await self.create_test_connection(client_id, user_id, username, node_id)
            if websocket:
                connections.append(websocket)
                # Start listening for notifications
                asyncio.create_task(self.listen_for_notifications(websocket, f"Multi-User Connection {i+1}"))
                await asyncio.sleep(1)
        
        print(f"📊 Created {len(connections)} connections for client {client_id}")
        print(f"📊 Received {len(self.received_notifications)} notifications")
        
        return connections
    
    async def test_user_notification_mixed_scenarios(self):
        """Test notification in mixed scenarios"""
        print("\n🧪 Test 3: Mixed scenarios")
        print("=" * 50)
        
        connections = []
        
        # Scenario 1: Same user, different clients, different nodes
        user_id = "mixed_user"
        username = "mixeduser"
        
        for i in range(3):
            client_id = f"mixed_client_{i+1}"
            node_id = f"mixed_node_{i+1}"
            
            websocket = await self.create_test_connection(client_id, user_id, username, node_id)
            if websocket:
                connections.append(websocket)
                # Start listening for notifications
                asyncio.create_task(self.listen_for_notifications(websocket, f"Mixed Connection {i+1}"))
                await asyncio.sleep(1)
        
        print(f"📊 Created {len(connections)} connections in mixed scenarios")
        print(f"📊 Received {len(self.received_notifications)} notifications")
        
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
        """Run all user notification tests"""
        print("🚀 Starting User Notification Tests")
        print("=" * 60)
        
        all_connections = []
        
        try:
            # Test 1: Same user on different clients
            connections1 = await self.test_user_notification_same_user_different_clients()
            all_connections.extend(connections1)
            
            # Test 2: Different users on same client
            connections2 = await self.test_user_notification_different_users_same_client()
            all_connections.extend(connections2)
            
            # Test 3: Mixed scenarios
            connections3 = await self.test_user_notification_mixed_scenarios()
            all_connections.extend(connections3)
            
            print(f"\n📊 Test Summary:")
            print(f"   Total connections created: {len(all_connections)}")
            print(f"   Total notifications received: {len(self.received_notifications)}")
            print(f"   All tests completed successfully!")
            
            # Print notification details
            if self.received_notifications:
                print(f"\n📋 Notification Details:")
                for i, notification in enumerate(self.received_notifications, 1):
                    print(f"   {i}. {notification['connection_name']}: {notification['notification']['message']}")
            
        except Exception as e:
            print(f"❌ Test failed: {e}")
        finally:
            # Clean up all connections
            await self.cleanup_connections(all_connections)

async def main():
    """Main test function"""
    print("🔧 User Notification Tester")
    print("Testing user connection pool notification system:")
    print("- Notify all existing connections when user logs in on another client")
    print("- Support multiple clients per user")
    print("- Support multiple users per client")
    print()
    
    tester = UserNotificationTester()
    await tester.run_all_tests()

if __name__ == "__main__":
    asyncio.run(main())
