#!/usr/bin/env python3
"""
Database Migration Script: Add logout field to user_accounts table
This script adds a 'logout' boolean field to the user_accounts table to track logout status.
"""

import sqlite3
import os
from datetime import datetime

def migrate_database():
    """Add logout field to user_accounts table"""
    
    # Database file path
    db_path = os.path.join(os.path.dirname(__file__), 'instance', 'b_client_secure.db')
    
    if not os.path.exists(db_path):
        print(f"❌ Database file not found: {db_path}")
        return False
    
    try:
        # Connect to database
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        print(f"🔧 Starting database migration: Add logout field to user_accounts table")
        print(f"📁 Database path: {db_path}")
        
        # Check if logout column already exists
        cursor.execute("PRAGMA table_info(user_accounts)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'logout' in columns:
            print(f"✅ Logout column already exists in user_accounts table")
            return True
        
        # Add logout column
        print(f"🔧 Adding logout column to user_accounts table...")
        cursor.execute("ALTER TABLE user_accounts ADD COLUMN logout BOOLEAN DEFAULT 0")
        
        # Commit changes
        conn.commit()
        
        print(f"✅ Successfully added logout column to user_accounts table")
        print(f"📊 Migration completed at: {datetime.now()}")
        
        return True
        
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        return False
        
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    success = migrate_database()
    if success:
        print(f"🎉 Database migration completed successfully!")
    else:
        print(f"💥 Database migration failed!")
        exit(1)
