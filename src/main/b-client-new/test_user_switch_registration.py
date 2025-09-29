#!/usr/bin/env python3
"""
Test script for user switch registration
This script tests the WebSocket re-registration when user switches:
- User switch should trigger WebSocket re-registration
- Statistics should update correctly after user switch
- Connection pools should reflect the new user
"""

import asyncio
import websockets
import json
import time
import requests

class UserSwitchRegistrationTester:
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
    
    async def simulate_user_switch(self, websocket, new_user_id, new_username, new_node_id):
        """Simulate user switch by sending re-registration message"""
        try:
            print(f"🔄 Simulating user switch to: {new_username} ({new_user_id})")
            
            # Send re-registration message with new user info
            re_register_message = {
                'type': 'c_client_register',
                'client_id': 'test_client',  # Same client ID
                'user_id': new_user_id,
                'username': new_username,
                'node_id': new_node_id,
                'domain_id': f'domain_{new_user_id}',
                'cluster_id': f'cluster_{new_user_id}',
                'channel_id': f'channel_{new_user_id}'
            }
            
            await websocket.send(json.dumps(re_register_message))
            print(f"📤 Sent re-registration: User={new_user_id}, Username={new_username}, Node={new_node_id}")
            
            # Wait for response
            registration_success = False
            notification_received = False
            
            try:
                for _ in range(10):
                    try:
                        response = await asyncio.wait_for(websocket.recv(), timeout=0.3)
                        response_data = json.loads(response)
                        print(f"📥 Received response: {response_data}")
                        
                        if response_data.get('type') == 'registration_success':
                            registration_success = True
                            print(f"✅ Re-registration successful for User={new_user_id}")
                        elif response_data.get('type') == 'user_connected_on_another_client':
                            notification_received = True
                            print(f"🔔 Received notification: {response_data.get('message', '')}")
                        elif response_data.get('type') == 'registration_rejected':
                            print(f"❌ Re-registration rejected: {response_data.get('message', '')}")
                            return False
                        
                        if registration_success:
                            break
                            
                    except asyncio.TimeoutError:
                        break
                        
            except Exception as e:
                print(f"❌ Error receiving responses: {e}")
            
            if registration_success:
                print(f"✅ User switch simulation completed successfully")
                return True
            else:
                print(f"❌ User switch simulation failed - no success message received")
                return False
                
        except Exception as e:
            print(f"❌ Error simulating user switch: {e}")
            return False
    
    async def test_user_switch_registration(self):
        """Test user switch registration functionality"""
        print("\n🧪 Test: User Switch Registration")
        print("=" * 60)
        print("📋 Scenario: User switch should trigger WebSocket re-registration")
        print("   Expected: Statistics should update to reflect new user")
        
        connections = []
        
        # Step 1: Create initial connection with user_1
        print("\n📋 Step 1: Create initial connection with user_1")
        conn1 = await self.create_test_connection("test_client", "user_1", "user1", "node_1")
        if conn1:
            connections.append(conn1)
        
        self.print_connection_status("After initial connection")
        await asyncio.sleep(1)
        
        # Step 2: Simulate user switch to user_2
        print("\n📋 Step 2: Simulate user switch to user_2")
        success = await self.simulate_user_switch(conn1, "user_2", "user2", "node_1")
        if success:
            self.print_connection_status("After user switch to user_2")
            await asyncio.sleep(1)
        
        # Step 3: Simulate user switch to user_3
        print("\n📋 Step 3: Simulate user switch to user_3")
        success = await self.simulate_user_switch(conn1, "user_3", "user3", "node_1")
        if success:
            self.print_connection_status("After user switch to user_3")
            await asyncio.sleep(1)
        
        # Step 4: Simulate user switch back to user_1
        print("\n📋 Step 4: Simulate user switch back to user_1")
        success = await self.simulate_user_switch(conn1, "user_1", "user1", "node_1")
        if success:
            self.print_connection_status("After user switch back to user_1")
            await asyncio.sleep(1)
        
        return connections
    
    async def test_multiple_client_user_switches(self):
        """Test multiple clients with user switches"""
        print("\n🧪 Test: Multiple Client User Switches")
        print("=" * 60)
        
        connections = []
        
        # Create multiple clients with different users
        test_cases = [
            ("client_1", "user_1", "user1", "node_1"),
            ("client_2", "user_2", "user2", "node_2"),
        ]
        
        for i, (client_id, user_id, username, node_id) in enumerate(test_cases, 1):
            print(f"\n📋 Step {i}: Create client {client_id} with {username}")
            conn = await self.create_test_connection(client_id, user_id, username, node_id)
            if conn:
                connections.append(conn)
            
            self.print_connection_status(f"After step {i}")
            await asyncio.sleep(1)
        
        # Simulate user switches on both clients
        print(f"\n📋 Step 3: Simulate user switches on both clients")
        
        # Client 1 switches to user_3
        print(f"   Client 1 switches to user_3")
        success1 = await self.simulate_user_switch(connections[0], "user_3", "user3", "node_1")
        
        # Client 2 switches to user_4
        print(f"   Client 2 switches to user_4")
        success2 = await self.simulate_user_switch(connections[1], "user_4", "user4", "node_2")
        
        if success1 and success2:
            self.print_connection_status("After user switches on both clients")
            await asyncio.sleep(1)
        
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
        """Run all user switch registration tests"""
        print("🚀 Starting User Switch Registration Tests")
        print("=" * 60)
        print("📋 Testing User Switch Registration:")
        print("   - User switch should trigger WebSocket re-registration")
        print("   - Statistics should update correctly")
        print("   - Connection pools should reflect new user")
        print("=" * 60)
        
        all_connections = []
        
        try:
            # Test 1: Basic user switch registration
            connections1 = await self.test_user_switch_registration()
            all_connections.extend(connections1)
            
            # Test 2: Multiple client user switches
            connections2 = await self.test_multiple_client_user_switches()
            all_connections.extend(connections2)
            
            print(f"\n📊 Test Summary:")
            print(f"   Total connections created: {len(all_connections)}")
            print(f"   All user switch registration tests completed!")
            
        except Exception as e:
            print(f"❌ Test failed: {e}")
        finally:
            # Clean up all connections
            await self.cleanup_connections(all_connections)

async def main():
    """Main test function"""
    print("🔧 User Switch Registration Tester")
    print("Testing user switch registration functionality:")
    print("- User switch should trigger WebSocket re-registration")
    print("- Statistics should update correctly")
    print("- Connection pools should reflect new user")
    print()
    
    tester = UserSwitchRegistrationTester()
    await tester.run_all_tests()

if __name__ == "__main__":
    asyncio.run(main())
