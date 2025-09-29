#!/usr/bin/env python3
"""
No-Feedback Logout Test
This script tests the ultra-fast logout without waiting for C-Client feedback
Since C-Client calls NSN logout API directly and disconnects, no feedback is needed
"""

import requests
import json
import time
import asyncio

class NoFeedbackLogoutTester:
    def __init__(self):
        self.b_client_url = "http://localhost:3000"
        self.test_user_id = "no-feedback-test-user"
        self.test_username = "no_feedback_test"
        self.logout_times = []
        
    def test_no_feedback_logout(self):
        """Test ultra-fast logout without feedback waiting"""
        print("\n🚀 Testing No-Feedback Logout Performance")
        print("=" * 60)
        print("🎯 Target: ≤1 second (no feedback waiting)")
        print("💡 Logic: C端直接调用NSN logout，连接断开，无需等待反馈")
        print("=" * 60)
        
        # Test multiple logout cycles
        for cycle in range(5):
            print(f"\n🔄 No-Feedback Logout Cycle {cycle + 1}")
            print("-" * 40)
            
            # Measure logout time with high precision
            start_time = time.perf_counter()
            
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
                # Use very short timeout since we don't wait for feedback
                response = requests.post(
                    f"{self.b_client_url}/bind",
                    json=logout_data,
                    timeout=3  # Very short timeout
                )
                
                end_time = time.perf_counter()
                logout_duration = end_time - start_time
                self.logout_times.append(logout_duration)
                
                # Performance analysis
                if logout_duration <= 0.5:
                    status = "🏆 ULTRA-FAST"
                elif logout_duration <= 1.0:
                    status = "✅ EXCELLENT"
                elif logout_duration <= 2.0:
                    status = "✅ GOOD"
                else:
                    status = "⚠️ SLOW"
                
                print(f"📊 Logout {cycle + 1} completed in {logout_duration:.3f} seconds {status}")
                
                if response.status_code == 200:
                    result = response.json()
                    if result.get('success'):
                        print(f"✅ Logout successful")
                        print(f"   Cleared cookies: {result.get('cleared_count', 0)}")
                        print(f"   C-Client notified: {result.get('c_client_notified', False)}")
                        print(f"   💡 C端将直接调用NSN logout，无需反馈")
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
                time.sleep(0.2)  # Very short pause
        
        # Analyze results
        self.analyze_no_feedback_performance()
    
    def analyze_no_feedback_performance(self):
        """Analyze no-feedback logout performance results"""
        print("\n📊 No-Feedback Performance Analysis")
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
            
            # Ultra-fast targets (no feedback waiting)
            print(f"\n🎯 No-Feedback Performance Targets:")
            
            # First logout target: ≤1 second
            if first_logout <= 0.5:
                print(f"🏆 First logout ULTRA-FAST (≤0.5s): {first_logout:.3f}s")
            elif first_logout <= 1.0:
                print(f"✅ First logout EXCELLENT (≤1s): {first_logout:.3f}s")
            elif first_logout <= 2.0:
                print(f"⚠️ First logout GOOD (≤2s): {first_logout:.3f}s")
            else:
                print(f"❌ First logout SLOW (>2s): {first_logout:.3f}s")
            
            # Subsequent logout target: ≤1 second
            if avg_subsequent <= 0.5:
                print(f"🏆 Subsequent logouts ULTRA-FAST (≤0.5s): {avg_subsequent:.3f}s")
            elif avg_subsequent <= 1.0:
                print(f"✅ Subsequent logouts EXCELLENT (≤1s): {avg_subsequent:.3f}s")
            elif avg_subsequent <= 2.0:
                print(f"⚠️ Subsequent logouts GOOD (≤2s): {avg_subsequent:.3f}s")
            else:
                print(f"❌ Subsequent logouts SLOW (>2s): {avg_subsequent:.3f}s")
            
            # Calculate improvement percentage
            if first_logout > 0 and avg_subsequent > 0:
                improvement = ((first_logout - avg_subsequent) / first_logout) * 100
                print(f"📈 Performance improvement: {improvement:.1f}%")
            
            # Overall performance grade
            all_times = [first_logout] + subsequent_logouts
            avg_all = sum(all_times) / len(all_times)
            
            if avg_all <= 0.5:
                grade = "🏆 ULTRA-FAST"
            elif avg_all <= 1.0:
                grade = "🥇 EXCELLENT"
            elif avg_all <= 2.0:
                grade = "🥈 GOOD"
            else:
                grade = "❌ NEEDS IMPROVEMENT"
            
            print(f"\n🏆 Overall Performance Grade: {grade}")
            print(f"   Average logout time: {avg_all:.3f} seconds")
            
        else:
            print("ℹ️ Only one logout recorded, cannot compare performance")
    
    def test_no_feedback_logic(self):
        """Test the no-feedback logic explanation"""
        print("\n🧠 No-Feedback Logout Logic")
        print("=" * 40)
        
        logic_points = [
            "1. B端发送logout消息给C端",
            "2. C端接收消息后直接调用NSN logout API",
            "3. C端清理本地会话和标签页",
            "4. C端断开WebSocket连接",
            "5. B端无需等待反馈，立即完成logout",
            "6. 整个过程应该在1秒内完成"
        ]
        
        for point in logic_points:
            print(f"   {point}")
        
        print(f"\n💡 关键优势:")
        print(f"   ✅ 无需等待C端反馈")
        print(f"   ✅ 连接断开是正常行为")
        print(f"   ✅ 第一次和后续logout速度一致")
        print(f"   ✅ 目标：≤1秒完成")
    
    def run_no_feedback_tests(self):
        """Run all no-feedback optimization tests"""
        print("🚀 Starting No-Feedback Logout Optimization Tests")
        print("=" * 70)
        print("🎯 Goal: Achieve ≤1 second logout (no feedback waiting)")
        print("💡 Logic: C端直接调用NSN logout，连接断开，无需等待反馈")
        print("=" * 70)
        
        # Test no-feedback logic
        self.test_no_feedback_logic()
        
        # Test no-feedback logout performance
        self.test_no_feedback_logout()
        
        print("\n🏁 No-Feedback Logout Optimization Tests Completed")
        print("=" * 70)
        
        # Final summary
        if self.logout_times:
            valid_times = [t for t in self.logout_times if t != float('inf')]
            if valid_times:
                avg_time = sum(valid_times) / len(valid_times)
                print(f"\n📊 Final Summary:")
                print(f"   Total logouts tested: {len(valid_times)}")
                print(f"   Average logout time: {avg_time:.3f} seconds")
                
                if avg_time <= 0.5:
                    print("   🏆 ULTRA-FAST no-feedback optimization achieved!")
                elif avg_time <= 1.0:
                    print("   🥇 EXCELLENT no-feedback optimization achieved!")
                elif avg_time <= 2.0:
                    print("   🥈 GOOD no-feedback optimization achieved!")
                else:
                    print("   ⚠️ No-feedback optimization needs more work")

if __name__ == "__main__":
    tester = NoFeedbackLogoutTester()
    tester.run_no_feedback_tests()
