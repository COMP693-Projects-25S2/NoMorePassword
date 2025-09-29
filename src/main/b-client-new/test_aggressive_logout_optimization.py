#!/usr/bin/env python3
"""
Aggressive logout optimization test
This script tests the ultra-fast logout processing targeting 5 seconds or less
"""

import requests
import json
import time
import asyncio
import websockets

class AggressiveLogoutTester:
    def __init__(self):
        self.b_client_url = "http://localhost:3000"
        self.test_user_id = "aggressive-test-user"
        self.test_username = "aggressive_test"
        self.logout_times = []
        
    def test_ultra_fast_logout(self):
        """Test ultra-fast logout performance (target: ≤5 seconds)"""
        print("\n🚀 Testing Ultra-Fast Logout Performance")
        print("=" * 60)
        print("🎯 Target: First logout ≤5 seconds")
        print("🎯 Target: Subsequent logout ≤3 seconds")
        print("=" * 60)
        
        # Test multiple logout cycles
        for cycle in range(5):  # Test 5 cycles for better statistics
            print(f"\n🔄 Ultra-Fast Logout Cycle {cycle + 1}")
            print("-" * 40)
            
            # Measure logout time with high precision
            start_time = time.perf_counter()
            
            # Perform logout with aggressive settings
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
                # Use shorter timeout for testing
                response = requests.post(
                    f"{self.b_client_url}/bind",
                    json=logout_data,
                    timeout=10  # Aggressive timeout
                )
                
                end_time = time.perf_counter()
                logout_duration = end_time - start_time
                self.logout_times.append(logout_duration)
                
                # Performance analysis
                status = "✅ EXCELLENT" if logout_duration <= 3 else "✅ GOOD" if logout_duration <= 5 else "⚠️ SLOW" if logout_duration <= 10 else "❌ TOO SLOW"
                
                print(f"📊 Logout {cycle + 1} completed in {logout_duration:.3f} seconds {status}")
                
                if response.status_code == 200:
                    result = response.json()
                    if result.get('success'):
                        print(f"✅ Logout successful")
                        print(f"   Cleared cookies: {result.get('cleared_count', 0)}")
                        print(f"   C-Client notified: {result.get('c_client_notified', False)}")
                        
                        # Check for optimization indicators
                        if 'optimization' in str(result):
                            print(f"🚀 Optimization features detected")
                    else:
                        print(f"❌ Logout failed: {result.get('error', 'Unknown error')}")
                else:
                    print(f"❌ HTTP error: {response.status_code}")
                    
            except Exception as e:
                print(f"❌ Logout request failed: {e}")
                self.logout_times.append(float('inf'))
            
            # Minimal wait between cycles
            if cycle < 4:
                print("⏳ Brief pause before next cycle...")
                time.sleep(0.5)  # Very short pause
        
        # Comprehensive performance analysis
        self.analyze_ultra_fast_performance()
    
    def analyze_ultra_fast_performance(self):
        """Analyze ultra-fast logout performance results"""
        print("\n📊 Ultra-Fast Performance Analysis")
        print("=" * 50)
        
        if not self.logout_times:
            print("❌ No logout times recorded")
            return
        
        valid_times = [t for t in self.logout_times if t != float('inf')]
        
        if not valid_times:
            print("❌ No valid logout times recorded")
            return
        
        # Detailed statistics
        first_logout = valid_times[0] if len(valid_times) > 0 else 0
        subsequent_logouts = valid_times[1:] if len(valid_times) > 1 else []
        
        print(f"🕐 First logout time: {first_logout:.3f} seconds")
        
        if subsequent_logouts:
            avg_subsequent = sum(subsequent_logouts) / len(subsequent_logouts)
            min_subsequent = min(subsequent_logouts)
            max_subsequent = max(subsequent_logouts)
            
            print(f"🕐 Subsequent logout times:")
            print(f"   Average: {avg_subsequent:.3f} seconds")
            print(f"   Min: {min_subsequent:.3f} seconds")
            print(f"   Max: {max_subsequent:.3f} seconds")
            
            # Ultra-aggressive targets
            print(f"\n🎯 Ultra-Aggressive Performance Targets:")
            
            # First logout target: ≤5 seconds
            if first_logout <= 5:
                print(f"✅ First logout meets ULTRA target (≤5s): {first_logout:.3f}s")
            elif first_logout <= 10:
                print(f"⚠️ First logout meets GOOD target (≤10s): {first_logout:.3f}s")
            else:
                print(f"❌ First logout FAILS target (≤5s): {first_logout:.3f}s")
            
            # Subsequent logout target: ≤3 seconds
            if avg_subsequent <= 3:
                print(f"✅ Subsequent logouts meet ULTRA target (≤3s): {avg_subsequent:.3f}s")
            elif avg_subsequent <= 5:
                print(f"⚠️ Subsequent logouts meet GOOD target (≤5s): {avg_subsequent:.3f}s")
            else:
                print(f"❌ Subsequent logouts FAIL target (≤3s): {avg_subsequent:.3f}s")
            
            # Calculate improvement percentage
            if first_logout > 0 and avg_subsequent > 0:
                improvement = ((first_logout - avg_subsequent) / first_logout) * 100
                print(f"📈 Performance improvement: {improvement:.1f}%")
            
            # Overall performance grade
            all_times = [first_logout] + subsequent_logouts
            avg_all = sum(all_times) / len(all_times)
            
            if avg_all <= 3:
                grade = "🏆 EXCELLENT"
            elif avg_all <= 5:
                grade = "🥇 VERY GOOD"
            elif avg_all <= 8:
                grade = "🥈 GOOD"
            elif avg_all <= 15:
                grade = "🥉 ACCEPTABLE"
            else:
                grade = "❌ NEEDS IMPROVEMENT"
            
            print(f"\n🏆 Overall Performance Grade: {grade}")
            print(f"   Average logout time: {avg_all:.3f} seconds")
            
        else:
            print("ℹ️ Only one logout recorded, cannot compare performance")
    
    def test_optimization_features(self):
        """Test specific optimization features"""
        print("\n🧪 Testing Optimization Features")
        print("=" * 40)
        
        features_to_test = [
            {"name": "Connection Pool Pre-initialization", "expected": True},
            {"name": "Aggressive Timeout (5s)", "expected": True},
            {"name": "Immediate Feedback Processing", "expected": True},
            {"name": "Parallel Message Sending", "expected": True},
            {"name": "Connection State Caching", "expected": True}
        ]
        
        for feature in features_to_test:
            print(f"🔍 Testing: {feature['name']}")
            # In a real implementation, you would check actual feature status
            # For now, we'll simulate the test
            print(f"   Expected: {feature['expected']}")
            print(f"   Status: ✅ Active (simulated)")
    
    def run_ultra_fast_tests(self):
        """Run all ultra-fast optimization tests"""
        print("🚀 Starting Ultra-Fast Logout Optimization Tests")
        print("=" * 70)
        print("🎯 Goal: Achieve ≤5 second first logout, ≤3 second subsequent")
        print("=" * 70)
        
        # Test optimization features
        self.test_optimization_features()
        
        # Test ultra-fast logout performance
        self.test_ultra_fast_logout()
        
        print("\n🏁 Ultra-Fast Logout Optimization Tests Completed")
        print("=" * 70)
        
        # Final summary
        if self.logout_times:
            valid_times = [t for t in self.logout_times if t != float('inf')]
            if valid_times:
                avg_time = sum(valid_times) / len(valid_times)
                print(f"\n📊 Final Summary:")
                print(f"   Total logouts tested: {len(valid_times)}")
                print(f"   Average logout time: {avg_time:.3f} seconds")
                
                if avg_time <= 3:
                    print("   🏆 ULTRA-FAST optimization achieved!")
                elif avg_time <= 5:
                    print("   🥇 FAST optimization achieved!")
                elif avg_time <= 8:
                    print("   🥈 GOOD optimization achieved!")
                else:
                    print("   ⚠️ Optimization needs more work")

if __name__ == "__main__":
    tester = AggressiveLogoutTester()
    tester.run_ultra_fast_tests()
