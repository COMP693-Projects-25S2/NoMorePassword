#!/usr/bin/env python3
"""
Test script for user switch statistics update
This script tests that statistics update correctly when users switch
"""

import asyncio
import websockets
import json
import time
import requests

class UserSwitchStatsTester:
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
            registration_success = False
            
            try:
                for _ in range(10):
                    try:
                        response = await asyncio.wait_for(websocket.recv(), timeout=0.3)
                        response_data = json.loads(response)
                        print(f"📥 Received response: {response_data}")
                        
                        if response_data.get('type') == 'registration_success':
                            registration_success = True
                            print(f"✅ Registration successful for Client={client_id}, User={user_id}, Node={node_id}")
                            break
                        elif response_data.get('type') == 'user_connected_on_another_client':
                            print(f"🔔 Received notification: {response_data.get('message', '')}")
                        
                    except asyncio.TimeoutError:
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
            
            try:
                for _ in range(10):
                    try:
                        response = await asyncio.wait_for(websocket.recv(), timeout=0.3)
                        response_data = json.loads(response)
                        print(f"📥 Received response: {response_data}")
                        
                        if response_data.get('type') == 'registration_success':
                            registration_success = True
                            print(f"✅ Re-registration successful for User={new_user_id}")
                            break
                        elif response_data.get('type') == 'user_connected_on_another_client':
                            print(f"🔔 Received notification: {response_data.get('message', '')}")
                        elif response_data.get('type') == 'registration_rejected':
                            print(f"❌ Re-registration rejected: {response_data.get('message', '')}")
                            return False
                        
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
    
    async def test_user_switch_statistics(self):
        """Test user switch statistics update"""
        print("\n🧪 Test: User Switch Statistics Update")
        print("=" * 60)
        print("📋 Scenario: User switch should update statistics correctly")
        
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
    
    async def cleanup_connections(self, connections):
        """Clean up all test connections"""
        print(f"\n🧹 Cleaning up {len(connections)} connections...")
        for websocket in connections:
            try:
                await websocket.close()
            except:
                pass
        print("✅ Cleanup completed")
    
    async def run_test(self):
        """Run user switch statistics test"""
        print("🚀 Starting User Switch Statistics Test")
        print("=" * 60)
        print("📋 Testing User Switch Statistics:")
        print("   - User switch should update statistics correctly")
        print("   - Connection pools should reflect new user")
        print("   - Manual refresh should show updated data")
        print("=" * 60)
        
        connections = []
        
        try:
            # Test user switch statistics
            connections = await self.test_user_switch_statistics()
            
            print(f"\n📊 Test Summary:")
            print(f"   Total connections created: {len(connections)}")
            print(f"   User switch statistics test completed!")
            
        except Exception as e:
            print(f"❌ Test failed: {e}")
        finally:
            # Clean up all connections
            await self.cleanup_connections(connections)

async def main():
    """Main test function"""
    print("🔧 User Switch Statistics Tester")
    print("Testing user switch statistics update:")
    print("- User switch should update statistics correctly")
    print("- Connection pools should reflect new user")
    print("- Manual refresh should show updated data")
    print()
    
    tester = UserSwitchStatsTester()
    await tester.run_test()

if __name__ == "__main__":
    asyncio.run(main())
