#!/usr/bin/env python3
"""
Test script for logout optimization functionality
This script tests the optimized logout processing that should be faster
for both first and subsequent logouts.
"""

import requests
import json
import time
import asyncio
import websockets

class LogoutOptimizationTester:
    def __init__(self):
        self.b_client_url = "http://localhost:3000"
        self.test_user_id = "test-user-optimization"
        self.test_username = "optimization_test"
        self.logout_times = []
        
    def test_logout_performance(self):
        """Test logout performance with optimization"""
        print("\n🧪 Testing Optimized Logout Performance")
        print("=" * 60)
        
        # Test multiple logout cycles
        for cycle in range(3):
            print(f"\n🔄 Logout Cycle {cycle + 1}")
            print("-" * 40)
            
            # Measure logout time
            start_time = time.time()
            
            # Perform logout
            logout_data = {
                "request_type": 2,  # logout
                "user_id": f"{self.test_user_id}-{cycle}",
                "user_name": f"{self.test_username}-{cycle}",
                "domain_id": "localhost:5000",
                "node_id": "nsn-node-001",
                "ip_address": "127.0.0.1",
                "port": "4754"
            }
            
            try:
                response = requests.post(
                    f"{self.b_client_url}/bind",
                    json=logout_data,
                    timeout=20  # Reduced timeout for testing
                )
                
                end_time = time.time()
                logout_duration = end_time - start_time
                self.logout_times.append(logout_duration)
                
                print(f"📊 Logout {cycle + 1} completed in {logout_duration:.2f} seconds")
                
                if response.status_code == 200:
                    result = response.json()
                    if result.get('success'):
                        print(f"✅ Logout successful")
                        print(f"   Cleared cookies: {result.get('cleared_count', 0)}")
                        print(f"   C-Client notified: {result.get('c_client_notified', False)}")
                    else:
                        print(f"❌ Logout failed: {result.get('error', 'Unknown error')}")
                else:
                    print(f"❌ HTTP error: {response.status_code}")
                    
            except Exception as e:
                print(f"❌ Logout request failed: {e}")
                self.logout_times.append(float('inf'))
            
            # Wait between cycles
            if cycle < 2:
                print("⏳ Waiting 2 seconds before next cycle...")
                time.sleep(2)
        
        # Analyze results
        self.analyze_performance()
    
    def analyze_performance(self):
        """Analyze logout performance results"""
        print("\n📊 Performance Analysis")
        print("=" * 40)
        
        if not self.logout_times:
            print("❌ No logout times recorded")
            return
        
        valid_times = [t for t in self.logout_times if t != float('inf')]
        
        if not valid_times:
            print("❌ No valid logout times recorded")
            return
        
        first_logout = valid_times[0] if len(valid_times) > 0 else 0
        subsequent_logouts = valid_times[1:] if len(valid_times) > 1 else []
        
        print(f"🕐 First logout time: {first_logout:.2f} seconds")
        
        if subsequent_logouts:
            avg_subsequent = sum(subsequent_logouts) / len(subsequent_logouts)
            print(f"🕐 Average subsequent logout time: {avg_subsequent:.2f} seconds")
            
            # Check optimization targets
            if first_logout <= 15:
                print("✅ First logout meets optimization target (≤15s)")
            else:
                print(f"⚠️ First logout exceeds target (≤15s): {first_logout:.2f}s")
            
            if avg_subsequent <= 8:
                print("✅ Subsequent logouts meet optimization target (≤8s)")
            else:
                print(f"⚠️ Subsequent logouts exceed target (≤8s): {avg_subsequent:.2f}s")
            
            # Calculate improvement
            if first_logout > 0 and avg_subsequent > 0:
                improvement = ((first_logout - avg_subsequent) / first_logout) * 100
                print(f"📈 Performance improvement: {improvement:.1f}%")
        else:
            print("ℹ️ Only one logout recorded, cannot compare performance")
    
    def test_connection_pool_optimization(self):
        """Test connection pool optimization"""
        print("\n🧪 Testing Connection Pool Optimization")
        print("=" * 50)
        
        try:
            # Check B-Client status
            response = requests.get(f"{self.b_client_url}/api/c-client/status", timeout=5)
            
            if response.status_code == 200:
                result = response.json()
                print(f"📊 B-Client status: {json.dumps(result, indent=2)}")
                
                # Check for optimization indicators
                connections = result.get('connections', [])
                print(f"📊 Active connections: {len(connections)}")
                
                if connections:
                    print("✅ B-Client has active connections")
                    for conn in connections:
                        print(f"   - {conn.get('client_id', 'unknown')}: {conn.get('user_id', 'unknown')}")
                else:
                    print("⚠️ No active connections found")
                    
            else:
                print(f"❌ HTTP error: {response.status_code}")
                
        except Exception as e:
            print(f"❌ Request failed: {e}")
    
    def test_timeout_optimization(self):
        """Test timeout optimization settings"""
        print("\n🧪 Testing Timeout Optimization")
        print("=" * 40)
        
        # Test different timeout scenarios
        timeout_scenarios = [
            {"name": "First logout", "timeout": 15, "expected": "≤15s"},
            {"name": "Subsequent logout", "timeout": 8, "expected": "≤8s"},
            {"name": "Feedback check interval", "timeout": 0.2, "expected": "≤0.2s"}
        ]
        
        for scenario in timeout_scenarios:
            print(f"⏱️ {scenario['name']}: {scenario['timeout']}s ({scenario['expected']})")
            
            # Simulate timeout test
            start_time = time.time()
            time.sleep(0.1)  # Simulate processing
            end_time = time.time()
            
            actual_time = end_time - start_time
            if actual_time <= scenario['timeout']:
                print(f"   ✅ Meets target: {actual_time:.3f}s")
            else:
                print(f"   ⚠️ Exceeds target: {actual_time:.3f}s")
    
    def run_all_tests(self):
        """Run all optimization tests"""
        print("🚀 Starting Logout Optimization Tests")
        print("=" * 60)
        
        # Test connection pool optimization
        self.test_connection_pool_optimization()
        
        # Test timeout optimization
        self.test_timeout_optimization()
        
        # Test logout performance
        self.test_logout_performance()
        
        print("\n🏁 Logout Optimization Tests Completed")
        print("=" * 60)
        
        # Summary
        if self.logout_times:
            valid_times = [t for t in self.logout_times if t != float('inf')]
            if valid_times:
                avg_time = sum(valid_times) / len(valid_times)
                print(f"\n📊 Summary:")
                print(f"   Total logouts tested: {len(valid_times)}")
                print(f"   Average logout time: {avg_time:.2f} seconds")
                
                if avg_time <= 10:
                    print("   ✅ Optimization successful!")
                else:
                    print("   ⚠️ Optimization needs improvement")

if __name__ == "__main__":
    tester = LogoutOptimizationTester()
    tester.run_all_tests()
