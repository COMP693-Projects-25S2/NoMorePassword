#!/usr/bin/env python3
"""
Initialize encrypted SQLite database for B-Client
"""

import os
import sqlite3
from sqlalchemy import create_engine, text

def init_encrypted_database():
    """Initialize encrypted SQLite database with SQLCipher"""
    
    # Database file path
    db_path = 'b_client_secure.db'
    
    # Remove existing database if it exists
    if os.path.exists(db_path):
        os.remove(db_path)
        print(f"🗑️  Removed existing database: {db_path}")
    
    # Create encrypted database
    try:
        # Create engine with SQLCipher
        engine = create_engine(
            'sqlite+pysqlcipher3:///b_client_secure.db',
            connect_args={'key': 'b_client_enterprise_password'}
        )
        
        # Test connection
        with engine.connect() as conn:
            # Enable SQLCipher
            conn.execute(text("PRAGMA key = 'b_client_enterprise_password'"))
            conn.execute(text("PRAGMA cipher_page_size = 4096"))
            conn.execute(text("PRAGMA kdf_iter = 64000"))
            conn.execute(text("PRAGMA cipher_hmac_algorithm = HMAC_SHA1"))
            conn.execute(text("PRAGMA cipher_kdf_algorithm = PBKDF2_HMAC_SHA1"))
            
            print("✅ Encrypted database connection successful")
            
            # Create tables
            create_tables(conn)
            
        print("🔐 Encrypted database initialized successfully!")
        print("🔑 Encryption key: b_client_enterprise_password")
        print("📁 Database file: b_client_secure.db")
        
    except Exception as e:
        print(f"❌ Error initializing encrypted database: {e}")
        return False
    
    return True

def create_tables(conn):
    """Create database tables"""
    
    # Create user_cookies table
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS user_cookies (
            user_id VARCHAR(50),
            username TEXT,
            node_id VARCHAR(50),
            cookie TEXT,
            auto_refresh BOOLEAN DEFAULT 0,
            refresh_time TIMESTAMP,
            create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, username)
        )
    """))
    
    # Create user_accounts table
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS user_accounts (
            user_id VARCHAR(50),
            username TEXT,
            website TEXT,
            account VARCHAR(50),
            password TEXT,
            email TEXT,
            first_name TEXT,
            last_name TEXT,
            location TEXT,
            registration_method VARCHAR(20) DEFAULT 'manual',
            auto_generated BOOLEAN DEFAULT 0,
            create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, username, website, account)
        )
    """))
    
    # Create domain_nodes table
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS domain_nodes (
            domain_id VARCHAR(50) PRIMARY KEY,
            node_id VARCHAR(50),
            ip_address VARCHAR(20),
            port INTEGER DEFAULT 3000,
            refresh_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """))
    
    # Set database optimization
    conn.execute(text("PRAGMA journal_mode = WAL"))
    conn.execute(text("PRAGMA synchronous = NORMAL"))
    conn.execute(text("PRAGMA cache_size = 2000"))
    conn.execute(text("PRAGMA temp_store = memory"))
    conn.execute(text("PRAGMA foreign_keys = OFF"))
    
    print("✅ Database tables created successfully")

if __name__ == '__main__':
    print("🚀 Initializing B-Client Encrypted Database...")
    print("🔐 Using SQLCipher encryption")
    print("=" * 50)
    
    if init_encrypted_database():
        print("\n🎉 Database initialization completed!")
        print("🔒 Your database is now encrypted with AES-256")
        print("📊 Ready to use with B-Client Flask application")
    else:
        print("\n❌ Database initialization failed!")
        print("💡 Make sure pysqlcipher3 is installed: pip install pysqlcipher3")
