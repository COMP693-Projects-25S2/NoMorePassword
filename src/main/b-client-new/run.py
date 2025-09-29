#!/usr/bin/env python3
"""
B-Client Flask Application
Enterprise-level client for NoMorePassword Backend Service
"""

import os
import sys
from app import app
from models import db

def create_database():
    """Create database tables if they don't exist"""
    try:
        with app.app_context():
            db.create_all()
            print("✅ Database tables created successfully")
    except Exception as e:
        print(f"⚠️  Database creation warning: {e}")
        print("💡 If using SQLCipher, make sure pysqlcipher3 is installed")
        print("🔧 Run: pip install pysqlcipher3")

def main():
    """Main entry point for the B-Client Flask application"""
    print("🚀 Starting B-Client Flask Application...")
    print("📊 Enterprise-level client for NoMorePassword Backend Service")
    
    # Create database tables
    create_database()
    
    # Get configuration
    host = os.environ.get('HOST', '0.0.0.0')
    port = int(os.environ.get('PORT', 3000))
    debug = os.environ.get('DEBUG', 'False').lower() == 'true'
    
    print(f"🌐 Server will start on http://{host}:{port}")
    print(f"🔧 Debug mode: {debug}")
    print("📱 Access the application at:")
    print(f"   - Main page: http://localhost:{port}")
    print(f"   - Dashboard: http://localhost:{port}/dashboard")
    print(f"   - History: http://localhost:{port}/history")
    print(f"   - API Health: http://localhost:{port}/api/health")
    print("\n" + "="*60)
    
    try:
        app.run(host=host, port=port, debug=debug)
    except KeyboardInterrupt:
        print("\n👋 B-Client Flask Application stopped")
    except Exception as e:
        print(f"❌ Error starting B-Client Flask Application: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
