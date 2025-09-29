#!/usr/bin/env python3
"""
检查登出后的数据库状态
"""
import sqlite3
import sys
import os

def check_database_status():
    """检查数据库中的登出状态"""
    db_path = "instance/b_client_secure.db"
    
    if not os.path.exists(db_path):
        print(f"❌ 数据库文件不存在: {db_path}")
        return
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        print("🔍 检查 user_accounts 表:")
        cursor.execute("SELECT user_id, username, website, logout FROM user_accounts")
        accounts = cursor.fetchall()
        
        if accounts:
            print(f"📊 找到 {len(accounts)} 个账户记录:")
            for account in accounts:
                user_id, username, website, logout = account
                logout_status = "已登出" if logout else "未登出"
                print(f"   - 用户ID: {user_id}, 用户名: {username}, 网站: {website}, 状态: {logout_status}")
        else:
            print("❌ 没有找到 user_accounts 记录")
        
        print("\n🔍 检查 user_cookies 表:")
        cursor.execute("SELECT user_id, username, node_id FROM user_cookies")
        cookies = cursor.fetchall()
        
        if cookies:
            print(f"📊 找到 {len(cookies)} 个cookie记录:")
            for cookie in cookies:
                user_id, username, node_id = cookie
                print(f"   - 用户ID: {user_id}, 用户名: {username}, 节点ID: {node_id}")
        else:
            print("✅ 没有找到 user_cookies 记录 (已清理)")
        
        conn.close()
        
    except Exception as e:
        print(f"❌ 检查数据库时出错: {e}")

if __name__ == "__main__":
    check_database_status()
