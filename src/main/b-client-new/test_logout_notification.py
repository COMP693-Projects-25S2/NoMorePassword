#!/usr/bin/env python3
"""
Test script for logout notification functionality
This script tests the logout notification system that notifies
all C-Client connections when a user logs out from NSN.
"""

import requests
import json
import time

class LogoutNotificationTester:
    def __init__(self):
        self.b_client_url = "http://localhost:3000"
        self.test_user_id = "4d80057e-2a27-4c08-9183-2a2ad5e20b8b"
        self.test_username = "test1"
        
    def test_logout_api(self):
        """Test B-Client logout API endpoint"""
        print("\n🧪 Testing B-Client Logout API")
        print("=" * 50)
        
        # Test data for logout request
        logout_data = {
            "request_type": 2,  # logout
            "user_id": self.test_user_id,
            "user_name": self.test_username,
            "domain_id": "localhost:5000",
            "node_id": "nsn-node-001",
            "ip_address": "127.0.0.1",
            "port": "4754"  # C-Client API port
        }
        
        print(f"📤 Sending logout request to B-Client...")
        print(f"   User ID: {self.test_user_id}")
        print(f"   Username: {self.test_username}")
        print(f"   Request data: {json.dumps(logout_data, indent=2)}")
        
        try:
            response = requests.post(
                f"{self.b_client_url}/bind",
                json=logout_data,
                timeout=10
            )
            
            print(f"📥 Response status: {response.status_code}")
            print(f"📥 Response headers: {dict(response.headers)}")
            
            if response.status_code == 200:
                result = response.json()
                print(f"📥 Response data: {json.dumps(result, indent=2)}")
                
                if result.get('success'):
                    print("✅ Logout API test successful!")
                    print(f"   Cleared cookies: {result.get('cleared_count', 0)}")
                    print(f"   C-Client notified: {result.get('c_client_notified', False)}")
                else:
                    print("❌ Logout API test failed!")
                    print(f"   Error: {result.get('error', 'Unknown error')}")
            else:
                print(f"❌ HTTP error: {response.status_code}")
                print(f"   Response: {response.text}")
                
        except Exception as e:
            print(f"❌ Request failed: {e}")
    
    def test_c_client_logout_notification(self):
        """Test C-Client logout notification endpoint"""
        print("\n🧪 Testing C-Client Logout Notification")
        print("=" * 50)
        
        notification_data = {
            "user_id": self.test_user_id,
            "username": self.test_username
        }
        
        print(f"📤 Sending logout notification to C-Client...")
        print(f"   User ID: {self.test_user_id}")
        print(f"   Username: {self.test_username}")
        
        try:
            response = requests.post(
                f"{self.b_client_url}/api/c-client/notify-logout",
                json=notification_data,
                timeout=10
            )
            
            print(f"📥 Response status: {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                print(f"📥 Response data: {json.dumps(result, indent=2)}")
                
                if result.get('success'):
                    print("✅ Logout notification test successful!")
                else:
                    print("❌ Logout notification test failed!")
                    print(f"   Error: {result.get('error', 'Unknown error')}")
            else:
                print(f"❌ HTTP error: {response.status_code}")
                print(f"   Response: {response.text}")
                
        except Exception as e:
            print(f"❌ Request failed: {e}")
    
    def test_b_client_status(self):
        """Test B-Client status endpoint"""
        print("\n🧪 Testing B-Client Status")
        print("=" * 50)
        
        try:
            response = requests.get(f"{self.b_client_url}/api/c-client/status", timeout=5)
            
            if response.status_code == 200:
                result = response.json()
                print(f"📥 B-Client status: {json.dumps(result, indent=2)}")
                
                # Check if there are active connections
                connections = result.get('connections', [])
                print(f"📊 Active connections: {len(connections)}")
                
                if connections:
                    print("✅ B-Client has active C-Client connections")
                    for conn in connections:
                        print(f"   - {conn.get('client_id', 'unknown')}: {conn.get('user_id', 'unknown')}")
                else:
                    print("⚠️ No active C-Client connections found")
                    
            else:
                print(f"❌ HTTP error: {response.status_code}")
                
        except Exception as e:
            print(f"❌ Request failed: {e}")
    
    def run_all_tests(self):
        """Run all logout notification tests"""
        print("🚀 Starting Logout Notification Tests")
        print("=" * 60)
        
        # Test B-Client status first
        self.test_b_client_status()
        
        # Wait a moment
        time.sleep(1)
        
        # Test logout notification endpoint
        self.test_c_client_logout_notification()
        
        # Wait a moment
        time.sleep(1)
        
        # Test full logout API
        self.test_logout_api()
        
        print("\n🏁 Logout Notification Tests Completed")
        print("=" * 60)

if __name__ == "__main__":
    tester = LogoutNotificationTester()
    tester.run_all_tests()
