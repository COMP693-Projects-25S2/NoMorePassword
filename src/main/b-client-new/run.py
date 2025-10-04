#!/usr/bin/env python3
"""
B-Client Flask Application
Enterprise-level client for NoMorePassword Backend Service
"""

import os
import sys
from app import app
from services.models import db

# 导入日志系统
from utils.logger import get_bclient_logger, setup_print_redirect

# 立即设置日志重定向（在模块导入时就生效）
logger = get_bclient_logger('main')
print_redirect = setup_print_redirect('main')

# 重定向print到日志
import builtins
builtins.print = print_redirect

logger.info("B-Client run.py module imported")

def create_database():
    """Create database tables if they don't exist"""
    try:
        with app.app_context():
            db.create_all()
            logger.info("Database tables created successfully")
    except Exception as e:
        logger.warning(f"Database creation warning: {e}")
        logger.info("If using SQLCipher, make sure pysqlcipher3 is installed")
        logger.info("Run: pip install pysqlcipher3")

def main():
    """Main entry point for the B-Client Flask application"""
    logger.info("🚀 Starting B-Client Flask Application...")
    logger.info("📊 Enterprise-level client for NoMorePassword Backend Service")
    
    # Create database tables
    create_database()
    
    # Get configuration
    host = os.environ.get('HOST', '0.0.0.0')
    port = int(os.environ.get('PORT', 3000))
    debug = os.environ.get('DEBUG', 'False').lower() == 'true'
    
    logger.info(f"🌐 Server will start on http://{host}:{port}")
    logger.info(f"🔧 Debug mode: {debug}")
    print("📱 Access the application at:")
    print(f"   - Main page: http://localhost:{port}")
    print(f"   - Dashboard: http://localhost:{port}/dashboard")
    print(f"   - History: http://localhost:{port}/history")
    print(f"   - API Health: http://localhost:{port}/api/health")
    print("\n" + "="*60)
    
    try:
        app.run(host=host, port=port, debug=debug)
    except KeyboardInterrupt:
        logger.info("\n👋 B-Client Flask Application stopped")
    except Exception as e:
        logger.error(f"Error starting B-Client Flask Application: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
