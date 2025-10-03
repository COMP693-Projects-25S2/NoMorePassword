from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from datetime import datetime, timedelta
import os
import json
import sqlite3
import requests
import re
import time
import random
import string

def safe_close_websocket(websocket, reason="Connection closed"):
    """
    安全关闭WebSocket连接的通用函数
    可以在同步和异步上下文中使用
    """
    try:
        if hasattr(websocket, 'close'):
            # 标记连接为已关闭（在尝试关闭之前）
            websocket._closed_by_logout = True
            
            # 尝试关闭连接 - 使用asyncio.run来处理异步close
            try:
                import asyncio
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                loop.run_until_complete(websocket.close(code=1000, reason=reason))
                loop.close()
                print(f"🔓 B-Client: WebSocket close() called: {reason}")
                return True
            except Exception as close_error:
                print(f"⚠️ B-Client: Error in async close: {close_error}")
                # 即使异步关闭失败，也标记为已关闭
                return True
        else:
            print(f"⚠️ B-Client: WebSocket has no close method")
            return False
    except Exception as e:
        print(f"❌ B-Client: Error closing WebSocket: {e}")
        return False
try:
    import websockets
    import asyncio
    import threading
except ImportError:
    print("⚠️  WebSocket dependencies not available. Install with: pip install websockets")
    websockets = None
    asyncio = None
    threading = None
from werkzeug.security import generate_password_hash, check_password_hash

# Import database models
from models import db, UserCookie, UserAccount, init_db

# Import service modules
from services.nsn_client import NSNClient
from services.db_operations import save_cookie_to_db as db_save_cookie, save_account_to_db as db_save_account
from services.websocket_client import CClientWebSocketClient, init_websocket_client
from services.websocket_server import start_websocket_server, init_websocket_server

# Import route blueprints
from routes.page_routes import page_routes
from routes.api_routes import api_routes, init_api_routes
from routes.nsn_api_routes import nsn_api_routes, init_nsn_api_routes
from routes.b_client_api_routes import b_client_api_routes
from routes.c_client_api_routes import c_client_api_routes, init_c_client_api_routes
from routes.bind_routes import bind_routes, init_bind_routes
from routes.node_management_routes import node_management_routes, init_node_management_routes

app = Flask(__name__)
app.config['SECRET_KEY'] = 'b-client-enterprise-secret-key'

# Use standard SQLite database
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///b_client_secure.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize database
init_db(app)

# Register blueprints
app.register_blueprint(page_routes)
app.register_blueprint(api_routes)
app.register_blueprint(nsn_api_routes)
app.register_blueprint(b_client_api_routes)
app.register_blueprint(c_client_api_routes)
app.register_blueprint(bind_routes)
app.register_blueprint(node_management_routes)

# Note: Page routes have been moved to routes/page_routes.py
# Note: Basic API routes have been moved to routes/api_routes.py
# Note: NSN API routes have been moved to routes/nsn_api_routes.py
# Note: B-Client API routes have been moved to routes/b_client_api_routes.py
# Note: C-Client API routes have been moved to routes/c_client_api_routes.py
# Note: Core bind route has been moved to routes/bind_routes.py

# Core business logic routes remain below

@app.route('/api/health')
def health():
    return jsonify({
        'status': 'ok',
        'timestamp': datetime.utcnow().isoformat(),
        'service': 'B-Client Flask API Server'
    })

@app.route('/api/user/logout-status', methods=['GET'])
def get_user_logout_status():
    """Get user logout status for C-Client to check before auto-login"""
    try:
        user_id = request.args.get('user_id')
        if not user_id:
            return jsonify({'error': 'user_id parameter is required'}), 400
        
        print(f"🔍 B-Client: Checking logout status for user: {user_id}")
        
        # Query user_accounts table for logout status
        user_account = UserAccount.query.filter_by(
            user_id=user_id,
            website='nsn'
        ).first()
        
        if user_account:
            logout_status = user_account.logout
            print(f"🔍 B-Client: User {user_id} logout status: {logout_status}")
            print(f"🔍 B-Client: User account details - user_id: {user_account.user_id}, website: {user_account.website}")
            print(f"🔍 B-Client: Logout field type: {type(logout_status)}, value: {logout_status}")
            return jsonify({
                'user_id': user_id,
                'logout': logout_status,
                'found': True
            })
        else:
            print(f"⚠️ B-Client: No user account found for user: {user_id}")
            return jsonify({
                'user_id': user_id,
                'logout': False,
                'found': False
            })
            
    except Exception as e:
        print(f"❌ B-Client: Error checking logout status: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/stats')
def get_stats():
    try:
        auto_refresh_count = UserCookie.query.filter_by(auto_refresh=True).count()
        auto_register_count = UserAccount.query.filter_by(auto_generated=True).count()
        total_cookies_count = UserCookie.query.count()
        
        return jsonify({
            'autoRefreshUsers': auto_refresh_count,
            'autoRegisteredUsers': auto_register_count,
            'totalCookies': total_cookies_count
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/config')
def get_config():
    try:
        # Load configuration from config.json if exists
        config_path = os.path.join(os.path.dirname(__file__), 'config.json')
        if os.path.exists(config_path):
            with open(config_path, 'r') as f:
                config = json.load(f)
        else:
            # Default configuration
            config = {
                "network": {
                    "use_public_ip": False,
                    "public_ip": "121.74.37.6",
                    "local_ip": "127.0.0.1"
                },
                "api": {
                    "nsn_port": 5000,
                    "c_client_port_range": {
                        "min": 3001,
                        "max": 6000
                    }
                },
                "targetWebsites": {
                    "localhost:5000": {
                        "name": "Local Development",
                        "homeUrl": "http://localhost:5000",
                        "realTitle": "NSN Local Development",
                        "images": {
                            "favicon": "/static/favicon.ico",
                            "logo": "/static/logo.png"
                        }
                    },
                    "comp639nsn.pythonanywhere.com": {
                        "name": "NSN Production",
                        "homeUrl": "https://comp639nsn.pythonanywhere.com",
                        "realTitle": "NSN Production Server",
                        "images": {
                            "favicon": "/static/favicon.ico",
                            "logo": "/static/logo.png"
                        }
                    }
                },
                "default": {
                    "autoRefreshIntervalMinutes": 30
                }
            }
        
        return jsonify(config)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/cookies', methods=['GET'])
def get_cookies():
    try:
        user_id = request.args.get('user_id')
        if not user_id:
            return jsonify({'error': 'user_id is required'}), 400
        
        # 查询用户的cookie（应该只有一条记录）
        cookie = UserCookie.query.filter_by(user_id=user_id).first()
        
        if cookie:
            # 找到cookie：只返回状态，不立即发送session
            # Session将在WebSocket注册完成后发送
            print(f"🔍 B-Client: Found cookie for user {user_id}")
            print(f"🔍 B-Client: Cookie details - username: {cookie.username}, node_id: {cookie.node_id}")
            print(f"🔍 B-Client: Session will be sent after WebSocket registration completes")
            
            return jsonify({
                'success': True,
                'has_cookie': True,
                'message': 'Cookie found and session sent to C-Client'
            })
        else:
            # 未找到cookie：返回失败响应
            print(f"🔍 B-Client: No cookie found for user {user_id}")
            return jsonify({
                'success': False,
                'has_cookie': False,
                'message': 'No cookie found for user'
            })
            
    except Exception as e:
        print(f"❌ B-Client: Error querying cookies: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/cookies', methods=['POST'])
def add_cookie():
    try:
        data = request.get_json()
        required_fields = ['user_id', 'username', 'cookie']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'{field} is required'}), 400
        
        # Delete existing cookies for this user_id
        UserCookie.query.filter_by(user_id=data['user_id']).delete()
        
        # Add new cookie
        cookie = UserCookie(
            user_id=data['user_id'],
            username=data['username'],
            node_id=data.get('node_id'),
            cookie=data['cookie'],
            auto_refresh=data.get('auto_refresh', False),
            refresh_time=datetime.fromisoformat(data['refresh_time']) if data.get('refresh_time') else None
        )
        
        db.session.add(cookie)
        db.session.commit()
        
        return jsonify({'message': 'Cookie added successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/accounts', methods=['GET'])
def get_accounts():
    try:
        user_id = request.args.get('user_id')
        if not user_id:
            return jsonify({'error': 'user_id is required'}), 400
        
        accounts = UserAccount.query.filter_by(user_id=user_id).all()
        result = []
        for account in accounts:
            result.append({
                'user_id': account.user_id,
                'username': account.username,
                'website': account.website,
                'account': account.account,
                'email': account.email,
                'first_name': account.first_name,
                'last_name': account.last_name,
                'location': account.location,
                'registration_method': account.registration_method,
                'auto_generated': account.auto_generated,
                'create_time': account.create_time.isoformat()
            })
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/accounts', methods=['POST'])
def add_account():
    try:
        data = request.get_json()
        required_fields = ['user_id', 'username', 'website', 'account', 'password']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'{field} is required'}), 400
        
        # Check if account already exists
        existing = UserAccount.query.filter_by(
            user_id=data['user_id'],
            username=data['username'],
            website=data['website'],
            account=data['account']
        ).first()
        
        if existing:
            # Update existing account
            existing.password = data['password']
            existing.email = data.get('email')
            existing.first_name = data.get('first_name')
            existing.last_name = data.get('last_name')
            existing.location = data.get('location')
            existing.registration_method = data.get('registration_method', 'manual')
            existing.auto_generated = data.get('auto_generated', False)
        else:
            # Create new account
            account = UserAccount(
                user_id=data['user_id'],
                username=data['username'],
                website=data['website'],
                account=data['account'],
                password=data['password'],
                email=data.get('email'),
                first_name=data.get('first_name'),
                last_name=data.get('last_name'),
                location=data.get('location'),
                registration_method=data.get('registration_method', 'manual'),
                auto_generated=data.get('auto_generated', False)
            )
            db.session.add(account)
        
        db.session.commit()
        return jsonify({'message': 'Account saved successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/accounts/<user_id>/<username>/<website>/<account>', methods=['DELETE'])
def delete_account(user_id, username, website, account):
    try:
        account_obj = UserAccount.query.filter_by(
            user_id=user_id,
            username=username,
            website=website,
            account=account
        ).first()
        
        if not account_obj:
            return jsonify({'error': 'Account not found'}), 404
        
        db.session.delete(account_obj)
        db.session.commit()
        
        return jsonify({'message': 'Account deleted successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

# Configuration API Routes
@app.route('/api/config/environment', methods=['POST'])
def set_environment():
    try:
        data = request.get_json()
        environment = data.get('environment', 'local')
        
        # Save environment to config file
        config_path = os.path.join(os.path.dirname(__file__), 'config.json')
        if os.path.exists(config_path):
            with open(config_path, 'r') as f:
                config = json.load(f)
        else:
            config = {}
        
        config['current_environment'] = environment
        
        with open(config_path, 'w') as f:
            json.dump(config, f, indent=2)
        
        return jsonify({'message': f'Environment set to {environment}'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/config/environment', methods=['GET'])
def get_environment():
    try:
        config_path = os.path.join(os.path.dirname(__file__), 'config.json')
        if os.path.exists(config_path):
            with open(config_path, 'r') as f:
                config = json.load(f)
            environment = config.get('current_environment', 'local')
        else:
            environment = 'local'
        
        return jsonify({'environment': environment})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/database/info')
def database_info():
    try:
        # Get database statistics
        total_cookies = UserCookie.query.count()
        total_accounts = UserAccount.query.count()
        # Get domain count from NodeManager connection pools instead of database
        if hasattr(c_client_ws, 'node_manager') and c_client_ws.node_manager:
            total_domains = len(c_client_ws.node_manager.domain_pool)
        else:
            total_domains = 0
        
        # Get recent activity
        recent_cookies = UserCookie.query.order_by(UserCookie.create_time.desc()).limit(5).all()
        recent_accounts = UserAccount.query.order_by(UserAccount.create_time.desc()).limit(5).all()
        
        return jsonify({
            'database_stats': {
                'total_cookies': total_cookies,
                'total_accounts': total_accounts,
                'total_domains': total_domains
            },
            'recent_cookies': [
                {
                    'user_id': cookie.user_id,
                    'username': cookie.username,
                    'create_time': cookie.create_time.isoformat()
                } for cookie in recent_cookies
            ],
            'recent_accounts': [
                {
                    'user_id': account.user_id,
                    'username': account.username,
                    'website': account.website,
                    'create_time': account.create_time.isoformat()
                } for account in recent_accounts
            ]
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/node/offline', methods=['POST'])
def trigger_node_offline():
    """Trigger node offline cleanup"""
    try:
        data = request.get_json()
        node_id = data.get('node_id')
        
        if not node_id:
            return jsonify({'error': 'node_id is required'}), 400
        
        # Trigger node offline cleanup
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            loop.run_until_complete(c_client_ws.handle_node_offline(node_id))
            return jsonify({
                'success': True,
                'message': f'Node {node_id} offline cleanup completed',
                'node_id': node_id
            })
        finally:
            loop.close()
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# NSN API Integration
class NSNClient:
    def __init__(self):
        self.base_url = self.get_nsn_url()
        self.session = requests.Session()
    
    def get_nsn_url(self):
        """Get NSN URL based on current environment"""
        config_path = os.path.join(os.path.dirname(__file__), 'config.json')
        if os.path.exists(config_path):
            with open(config_path, 'r') as f:
                config = json.load(f)
            environment = config.get('current_environment', 'local')
        else:
            environment = 'local'
        
        if environment == 'local':
            return 'http://localhost:5000'
        else:
            return 'https://comp639nsn.pythonanywhere.com'
    
    def query_user_info(self, username):
        """Query user information from NSN"""
        try:
            url = f"{self.base_url}/api/user-info"
            data = {'username': username}
            response = self.session.post(url, json=data, timeout=30)
            
            if response.status_code == 200:
                return response.json()
            else:
                return {'success': False, 'error': f'HTTP {response.status_code}'}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def get_current_user(self, session_cookie):
        """Get current user from NSN using session cookie"""
        try:
            url = f"{self.base_url}/api/current-user"
            
            # Ensure proper cookie format
            if session_cookie and not session_cookie.startswith('session='):
                session_cookie = f"session={session_cookie}"
            
            headers = {'Cookie': session_cookie}
            response = self.session.get(url, headers=headers, timeout=30)
            
            print(f"🔍 B-Client: Current user API response status: {response.status_code}")
            print(f"🔍 B-Client: Current user API response content: {response.text[:200] if response.text else 'Empty'}")
            
            if response.status_code == 200:
                return response.json()
            else:
                return {'success': False, 'error': f'HTTP {response.status_code}'}
        except Exception as e:
            print(f"❌ B-Client: get_current_user error: {e}")
            return {'success': False, 'error': str(e)}
    
    def get_current_user_from_session(self):
        """Get current user from NSN using the same session object that was used for login"""
        try:
            url = f"{self.base_url}/api/current-user"
            response = self.session.get(url, timeout=5)
            
            print(f"🔍 B-Client: Current user API (from session) response status: {response.status_code}")
            print(f"🔍 B-Client: Current user API (from session) response content: {response.text[:200] if response.text else 'Empty'}")
            
            if response.status_code == 200:
                return response.json()
            else:
                return {'success': False, 'error': f'HTTP {response.status_code}'}
        except Exception as e:
            print(f"❌ B-Client: get_current_user_from_session error: {e}")
            return {'success': False, 'error': str(e)}
    
    def login_with_nmp(self, username, password, nmp_params):
        """Login to NSN with NMP parameters"""
        try:
            url = f"{self.base_url}/login"
            
            # Prepare login data with NMP parameters (matching original B-Client)
            data = {
                'username': username,
                'password': password
            }
            
            # Add NMP parameters if provided
            if nmp_params:
                data.update(nmp_params)
            else:
                # Add default NMP parameters like original B-Client
                data.update({
                    'nmp_bind': 'true',
                    'nmp_bind_type': 'bind',
                    'nmp_auto_refresh': 'true',
                    'nmp_client_type': 'c-client',
                    'nmp_timestamp': str(int(time.time() * 1000))
                })
            
            # Use form-encoded data like original B-Client
            print(f"🔍 B-Client: Sending login request to NSN: {url}")
            print(f"🔍 B-Client: Request data keys: {list(data.keys())}")
            print(f"🔍 B-Client: Username: {data.get('username', 'NOT_SET')}")
            print(f"🔍 B-Client: Password length: {len(data.get('password', ''))}")
            print(f"🔍 B-Client: NMP parameters: {[k for k in data.keys() if k.startswith('nmp_')]}")
            
            response = self.session.post(url, data=data, timeout=30, allow_redirects=False)
            
            print(f"🔐 NSN login response status: {response.status_code}")
            print(f"🔍 B-Client: Response headers: {dict(response.headers)}")
            print(f"🔍 B-Client: Response content length: {len(response.content) if response.content else 0}")
            
            # Extract session cookie from response headers
            session_cookie = None
            if 'set-cookie' in response.headers:
                cookies = response.headers['set-cookie']
                if isinstance(cookies, list):
                    cookies = '; '.join(cookies)
                
                # Extract session cookie
                session_match = re.search(r'session=([^;]+)', cookies)
                if session_match:
                    session_cookie = f"session={session_match.group(1)}"
                    print(f"🍪 Session cookie extracted: {session_cookie}")
            
            # NSN login success is indicated by 302 redirect or 200 with session cookie
            is_success = response.status_code == 302 or (response.status_code == 200 and session_cookie)
            
            if is_success:
                print("✅ NSN login successful, getting user info...")
                
                # Get user information from NSN using the same session object
                # This ensures the session cookie is properly maintained
                user_info = self.get_current_user_from_session()
                
                return {
                    'success': True,
                    'session_cookie': session_cookie,
                    'redirect_url': response.headers.get('Location', url),
                    'user_info': user_info
                }
            else:
                return {'success': False, 'error': f'Login failed with HTTP {response.status_code}'}
        except Exception as e:
            print(f"❌ NSN login error: {e}")
            return {'success': False, 'error': str(e)}
    
    def register_user(self, signup_data, nmp_params=None):
        """Register a new user with NSN and then login to get session"""
        try:
            print(f"🆕 NSN: ===== REGISTERING NEW USER =====")
            print(f"🆕 NSN: Signup data: {signup_data}")
            print(f"🆕 NSN: NMP params: {nmp_params}")
            
            # Generate a secure password for NMP registration
            import secrets
            import string
            
            # Generate a password that meets NSN requirements:
            # - At least 8 characters
            # - At least one uppercase letter
            # - At least one lowercase letter  
            # - At least one number
            # - At least one special character
            def generate_secure_password():
                # Define character sets
                uppercase = string.ascii_uppercase
                lowercase = string.ascii_lowercase
                digits = string.digits
                special_chars = '@#$%^&+=!'
                
                # Ensure at least one character from each required set
                password = [
                    secrets.choice(uppercase),
                    secrets.choice(lowercase),
                    secrets.choice(digits),
                    secrets.choice(special_chars)
                ]
                
                # Fill the rest with random characters from all sets
                all_chars = uppercase + lowercase + digits + special_chars
                for _ in range(4):  # Total length will be 8
                    password.append(secrets.choice(all_chars))
                
                # Shuffle the password
                secrets.SystemRandom().shuffle(password)
                return ''.join(password)
            
            generated_password = generate_secure_password()
            print(f"🔐 NSN: Generated secure password for NMP registration: {generated_password}")
            
            # Generate unique username to avoid conflicts
            import secrets
            import string
            import re
            
            base_username = signup_data.get('username')
            
            # Clean base username: remove non-alphanumeric characters
            clean_base = re.sub(r'[^A-Za-z0-9]', '', base_username)
            
            # Ensure base username doesn't exceed 16 characters (leave space for suffix)
            if len(clean_base) > 16:
                clean_base = clean_base[:16]
            
            # Generate a random suffix (4 characters: 2 letters + 2 digits)
            random_suffix = ''.join(secrets.choice(string.ascii_lowercase) for _ in range(2)) + \
                           ''.join(secrets.choice(string.digits) for _ in range(2))
            
            # Combine username, ensuring total length doesn't exceed 20 characters
            unique_username = f"{clean_base}{random_suffix}"
            
            # Final length check
            if len(unique_username) > 20:
                unique_username = unique_username[:20]
            
            print(f"🔐 NSN: Generated unique username: {unique_username}")
            print(f"🔐 NSN: Username length: {len(unique_username)}")
            print(f"🔐 NSN: Username validation: {'PASS' if re.match(r'^[A-Za-z0-9]+$', unique_username) and len(unique_username) <= 20 else 'FAIL'}")
            
            # Prepare registration data
            registration_data = {
                'username': unique_username,
                'email': signup_data.get('email'),
                'first_name': signup_data.get('first_name'),
                'last_name': signup_data.get('last_name'),
                'location': signup_data.get('location'),
                'password': generated_password,
                'confirm_password': generated_password
            }
            
            # Add NMP parameters if provided
            if nmp_params:
                registration_data.update(nmp_params)
            
            print(f"🆕 NSN: Registration data: {registration_data}")
            print(f"🆕 NSN: ===== CALLING NSN SIGNUP ENDPOINT =====")
            print(f"🆕 NSN: Signup URL: {self.base_url}/signup")
            print(f"🆕 NSN: Request method: POST")
            print(f"🆕 NSN: Request data keys: {list(registration_data.keys())}")
            print(f"🆕 NSN: NMP parameters included: {bool(nmp_params)}")
            print(f"🆕 NSN: ===== END CALLING NSN SIGNUP ENDPOINT =====")
            
            # Call NSN signup endpoint (without B-Client headers to get normal HTML response)
            signup_url = f"{self.base_url}/signup"
            
            print(f"🆕 NSN: ===== CALLING NSN SIGNUP ENDPOINT =====")
            print(f"🆕 NSN: Signup URL: {signup_url}")
            print(f"🆕 NSN: Username: {unique_username}")
            print(f"🆕 NSN: Password: {generated_password[:3]}...")
            print(f"🆕 NSN: ===== END CALLING NSN SIGNUP ENDPOINT =====")
            
            # Call NSN signup endpoint (fire and forget - don't wait for response)
            try:
                response = self.session.post(signup_url, data=registration_data, timeout=5, allow_redirects=False)
                print(f"🆕 NSN: Registration request sent (status: {response.status_code})")
            except Exception as e:
                print(f"⚠️ NSN: Registration request failed (expected): {e}")
            
            # Assume registration is successful, proceed immediately
            print("✅ NSN: Assuming registration successful, proceeding with login...")
            
            # Now login with the registered user credentials to get session
            username = unique_username  # Use the unique username
            password = generated_password  # Use the generated password
            
            print(f"🔐 NSN: Attempting to login with username: {username}")
            print(f"🔐 NSN: Login password length: {len(password)}")
            print(f"🔐 NSN: Login password preview: {password[:3]}...")
            
            # Prepare login data
            login_data = {
                'username': username,
                'password': password
            }
            
            # Add NMP parameters if provided
            if nmp_params:
                login_data.update(nmp_params)
            
            # Call NSN login endpoint
            login_url = f"{self.base_url}/login"
            login_response = self.session.post(login_url, data=login_data, timeout=30, allow_redirects=False)
            
            print(f"🔐 NSN: Login response status: {login_response.status_code}")
            print(f"🔐 NSN: Login response headers: {dict(login_response.headers)}")
            
            # Extract session cookie from login response
            session_cookie = None
            if 'set-cookie' in login_response.headers:
                cookies = login_response.headers['set-cookie']
                if isinstance(cookies, list):
                    cookies = '; '.join(cookies)
                
                # Extract session cookie
                session_match = re.search(r'session=([^;]+)', cookies)
                if session_match:
                    session_cookie = f"session={session_match.group(1)}"
                    print(f"🍪 NSN: Session cookie extracted from login: {session_cookie[:50]}...")
            
            # Check if login was successful (302 redirect or 200 with session cookie)
            if login_response.status_code == 302 or (login_response.status_code == 200 and session_cookie):
                print("✅ NSN: Login successful after registration")
                
                # Get user information to confirm login
                user_info = self.get_current_user(session_cookie)
                if user_info.get('success'):
                        print(f"✅ NSN: User info confirmed: {user_info.get('username')} (ID: {user_info.get('user_id')})")
                        
                        return {
                            'success': True,
                            'session_cookie': session_cookie,
                            'user_info': user_info,
                            'redirect_url': signup_url,
                            'generated_password': generated_password,
                            'unique_username': unique_username
                        }
                else:
                    print(f"⚠️ NSN: Login successful but user info retrieval failed: {user_info.get('error')}")
                    return {
                        'success': True,
                        'session_cookie': session_cookie,
                        'user_info': None,
                        'redirect_url': signup_url,
                        'generated_password': generated_password,
                        'unique_username': unique_username
                    }
            else:
                print(f"❌ NSN: Login failed after registration with status {login_response.status_code}")
                print(f"❌ NSN: Login response text: {login_response.text[:500]}...")
                return {'success': False, 'error': f'Signup to website failed: Login failed with HTTP {login_response.status_code}'}
                
        except Exception as e:
            print(f"❌ NSN: Registration error: {e}")
            import traceback
            traceback.print_exc()
            return {'success': False, 'error': str(e)}

# Initialize NSN client
nsn_client = NSNClient()

# WebSocket Client for C-Client communication

# Note: CClientWebSocketClient class has been moved to services/websocket_client.py
# Note: WebSocket server startup has been moved to services/websocket_server.py


# Initialize C-Client WebSocket client (without send_session_to_client, will inject later)
init_websocket_client(app, db, UserCookie, UserAccount)
c_client_ws = CClientWebSocketClient() if websockets else None

# Initialize WebSocket server
init_websocket_server(websockets, asyncio, c_client_ws)

# Initialize API routes with database models and services
init_api_routes(db, UserCookie, UserAccount, c_client_ws)
init_nsn_api_routes(db, UserCookie, nsn_client)
init_c_client_api_routes(c_client_ws)
# Note: init_bind_routes and send_session_to_client injection will be called after send_session_to_client is defined

# Start WebSocket server when app starts
start_websocket_server()

# NSN API Routes
@app.route('/api/nsn/user-info', methods=['POST'])
def nsn_user_info():
    """Query user information from NSN"""
    try:
        data = request.get_json()
        username = data.get('username')
        
        if not username:
            return jsonify({'success': False, 'error': 'Username is required'}), 400
        
        result = nsn_client.query_user_info(username)
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/nsn/current-user', methods=['POST'])
def nsn_current_user():
    """Get current user from NSN"""
    try:
        data = request.get_json()
        session_cookie = data.get('session_cookie')
        
        if not session_cookie:
            return jsonify({'success': False, 'error': 'Session cookie is required'}), 400
        
        result = nsn_client.get_current_user(session_cookie)
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/nsn/login', methods=['POST'])
def nsn_login():
    """Login to NSN with NMP parameters"""
    try:
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        nmp_params = data.get('nmp_params', {})
        user_id = data.get('user_id')
        
        if not username or not password:
            return jsonify({'success': False, 'error': 'Username and password are required'}), 400
        
        # Perform NSN login
        result = nsn_client.login_with_nmp(username, password, nmp_params)
        
        if result['success']:
            # Store session data in database (like original B-Client)
            session_data = {
                'nsn_session_data': {
                    'loggedin': True,
                    'user_id': result.get('user_info', {}).get('user_id'),
                    'username': username,
                    'role': result.get('user_info', {}).get('role', 'traveller'),
                    'nmp_user_id': nmp_params.get('nmp_user_id'),
                    'nmp_username': nmp_params.get('nmp_username'),
                    'nmp_client_type': 'c-client',
                    'nmp_timestamp': str(int(time.time() * 1000))
                },
                'nsn_user_id': result.get('user_info', {}).get('user_id'),
                'nsn_username': username,
                'nsn_role': result.get('user_info', {}).get('role', 'traveller'),
                'timestamp': int(time.time() * 1000)
            }
            
            # Store in user_cookies table
            if user_id:
                try:
                    # Delete existing cookie for this user
                    UserCookie.query.filter_by(user_id=user_id).delete()
                    
                    # Add new cookie
                    cookie = UserCookie(
                        user_id=user_id,
                        username=username,
                        cookie=json.dumps(session_data),
                        auto_refresh=True,
                        refresh_time=datetime.now()
                    )
                    
                    db.session.add(cookie)
                    db.session.commit()
                    
                    result['session_data'] = session_data
                    print(f"✅ Stored NSN session for user: {username}")
                except Exception as e:
                    print(f"⚠️  Failed to store session: {e}")
        
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/nsn/status')
def nsn_status():
    """Check NSN server status"""
    try:
        url = f"{nsn_client.base_url}/api/health"
        response = requests.get(url, timeout=5)

        if response.status_code == 200:
            return jsonify({
                'success': True,
                'nsn_url': nsn_client.base_url,
                'status': 'online',
                'response_time': response.elapsed.total_seconds()
            })
        else:
            return jsonify({
                'success': False,
                'nsn_url': nsn_client.base_url,
                'status': 'offline',
                'error': f'HTTP {response.status_code}'
            })
    except Exception as e:
        return jsonify({
            'success': False,
            'nsn_url': nsn_client.base_url,
            'status': 'offline',
            'error': str(e)
        })

@app.route('/api/b-client/info')
def b_client_info():
    """Return B-Client configuration information for C-Client connections"""
    try:
        # Get current environment
        config_path = os.path.join(os.path.dirname(__file__), 'config.json')
        if os.path.exists(config_path):
            with open(config_path, 'r') as f:
                config = json.load(f)
            environment = config.get('current_environment', 'local')
        else:
            environment = 'local'
        
        # Get B-Client WebSocket server configuration
        websocket_config = {
            'enabled': True,
            'host': '0.0.0.0',  # B-Client WebSocket server host
            'port': 8766,       # B-Client WebSocket server port
            'environment': environment
        }
        
        # Get network information
        import socket
        hostname = socket.gethostname()
        local_ip = socket.gethostbyname(hostname)
        
        return jsonify({
            'success': True,
            'b_client_info': {
                'websocket': websocket_config,
                'environment': environment,
                'hostname': hostname,
                'local_ip': local_ip,
                'api_port': 3000,  # B-Client API port
                'timestamp': int(time.time() * 1000)
            }
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })

# C-Client WebSocket API Routes
@app.route('/api/c-client/status')
def c_client_status():
    """Check C-Client WebSocket server status and connected clients"""
    if not c_client_ws:
        return jsonify({
            'success': False,
            'error': 'WebSocket functionality not available',
            'connected': False,
            'timestamp': datetime.utcnow().isoformat()
        })
    
    # Get connection info using the new method
    connection_info = c_client_ws.get_connection_info()
    
    return jsonify({
        'success': True,
        'websocket_server': {
            'enabled': True,
            'host': c_client_ws.config.get('server_host', '0.0.0.0'),
            'port': c_client_ws.config.get('server_port', 8766),
            'status': 'running'
        },
        'connected_clients': connection_info,
        'timestamp': datetime.utcnow().isoformat()
    })


@app.route('/api/c-client/update-cookie', methods=['POST'])
def c_client_update_cookie():
    """Update cookie in C-Client via WebSocket"""
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        username = data.get('username')
        cookie = data.get('cookie')
        auto_refresh = data.get('auto_refresh', False)

        if not all([user_id, username, cookie]):
            return jsonify({'success': False, 'error': 'user_id, username, and cookie are required'}), 400

        # Send WebSocket message
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(c_client_ws.update_cookie(user_id, username, cookie, auto_refresh))
        loop.close()

        return jsonify({
            'success': True,
            'message': 'Cookie update sent to C-Client',
            'user_id': user_id,
            'username': username
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/c-client/notify-login', methods=['POST'])
def c_client_notify_login():
    """Notify C-Client of user login via WebSocket"""
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        username = data.get('username')
        session_data = data.get('session_data', {})

        if not user_id or not username:
            return jsonify({'success': False, 'error': 'user_id and username are required'}), 400

        # Send WebSocket message
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(c_client_ws.notify_user_login(user_id, username, session_data))
        loop.close()

        return jsonify({
            'success': True,
            'message': 'Login notification sent to C-Client',
            'user_id': user_id,
            'username': username
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/c-client/notify-logout', methods=['POST'])
def c_client_notify_logout():
    """Notify C-Client of user logout via WebSocket"""
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        username = data.get('username')

        if not user_id or not username:
            return jsonify({'success': False, 'error': 'user_id and username are required'}), 400

        # Send WebSocket message
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(c_client_ws.notify_user_logout(user_id, username))
        loop.close()

        return jsonify({
            'success': True,
            'message': 'Logout notification sent to C-Client',
            'user_id': user_id,
            'username': username
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/c-client/sync-session', methods=['POST'])
def c_client_sync_session():
    """Sync session data with C-Client via WebSocket"""
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        session_data = data.get('session_data', {})

        if not user_id:
            return jsonify({'success': False, 'error': 'user_id is required'}), 400

        # Send WebSocket message
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(c_client_ws.sync_session(user_id, session_data))
        loop.close()

        return jsonify({
            'success': True,
            'message': 'Session sync sent to C-Client',
            'user_id': user_id
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/websocket/check-user', methods=['POST'])
def websocket_check_user():
    """Check if a user is connected to the WebSocket server"""
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        
        if not user_id:
            return jsonify({'success': False, 'error': 'user_id is required'}), 400
        
        print(f"🔍 B-Client: Checking WebSocket connection for user_id: {user_id}")
        
        # Check if user exists in user_connections pool
        user_connected = user_id in c_client_ws.user_connections
        websocket_url = f"ws://127.0.0.1:8766"  # B-Client WebSocket URL
        
        if user_connected:
            connections = c_client_ws.user_connections.get(user_id, [])
            print(f"🔍 B-Client: User {user_id} is connected with {len(connections)} connections")
        else:
            print(f"🔍 B-Client: User {user_id} is not connected to WebSocket")
        
        return jsonify({
            'success': True,
            'connected': user_connected,
            'websocket_url': websocket_url,
            'user_id': user_id,
            'connection_count': len(c_client_ws.user_connections.get(user_id, [])) if user_connected else 0
        })
        
    except Exception as e:

# Note: NMP Bind API Endpoint has been moved to routes/bind_routes.py
# This is the core business logic endpoint that handles signup/login integration

        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

def save_cookie_to_db(user_id, username, raw_session_cookie, node_id, auto_refresh, nsn_user_id=None, nsn_username=None):
    """Save preprocessed session cookie to user_cookies table"""
    try:
        print(f"💾 B-Client: ===== SAVING COOKIE TO DATABASE =====")
        print(f"💾 B-Client: User ID: {user_id}")
        print(f"💾 B-Client: Username: {username}")
        print(f"💾 B-Client: Node ID: {node_id}")
        print(f"💾 B-Client: Auto refresh: {auto_refresh}")
        print(f"💾 B-Client: NSN User ID: {nsn_user_id}")
        print(f"💾 B-Client: NSN Username: {nsn_username}")
        print(f"💾 B-Client: Raw session cookie length: {len(raw_session_cookie) if raw_session_cookie else 0}")
        print(f"💾 B-Client: Raw session cookie preview: {raw_session_cookie[:100] if raw_session_cookie else 'None'}...")
        
        # 预处理 session 数据为 JSON 格式
        print(f"💾 B-Client: ===== PREPROCESSING SESSION DATA =====")
        session_data_json = {
            'loggedin': True,
            'user_id': nsn_user_id or user_id,  # Use NMP user_id as fallback
            'username': nsn_username or username,  # Use NMP username as fallback
            'role': 'traveller',
            'nmp_user_id': user_id,
            'nmp_username': username,
            'nmp_client_type': 'c-client',
            'nmp_timestamp': str(int(time.time() * 1000))
        }
        
        # 编码为 JSON 字符串
        processed_cookie = json.dumps(session_data_json)
        print(f"💾 B-Client: Preprocessed session data: {processed_cookie}")
        print(f"💾 B-Client: Preprocessed cookie length: {len(processed_cookie)}")
        
        # 删除现有记录
        print(f"💾 B-Client: Deleting existing cookie records...")
        deleted_count = UserCookie.query.filter_by(user_id=user_id, username=username).delete()
        print(f"💾 B-Client: Deleted {deleted_count} existing cookie records")
        
        # 创建新记录（保存预处理后的 JSON 字符串）
        print(f"💾 B-Client: Creating new cookie record with preprocessed data...")
        user_cookie = UserCookie(
            user_id=user_id,
            username=username,
            node_id=node_id,
            cookie=processed_cookie,  # 保存预处理后的 JSON 字符串
            auto_refresh=auto_refresh,
            refresh_time=datetime.utcnow()
        )
        print(f"💾 B-Client: Cookie record created: {user_cookie}")
        
        print(f"💾 B-Client: Adding cookie record to session...")
        db.session.add(user_cookie)
        
        print(f"💾 B-Client: Committing transaction...")
        db.session.commit()
        print(f"✅ B-Client: Cookie saved to database successfully for user {user_id}")
        print(f"💾 B-Client: ===== END SAVING COOKIE TO DATABASE =====")
        
    except Exception as e:
        print(f"❌ B-Client: Failed to save cookie to database: {e}")
        print(f"💾 B-Client: Rolling back transaction...")
        db.session.rollback()
        import traceback
        traceback.print_exc()
        raise e

def save_account_to_db(user_id, username, account, password, account_data):
    """Save account information to user_accounts table"""
    try:
        print(f"💾 B-Client: ===== SAVING ACCOUNT TO DATABASE =====")
        print(f"💾 B-Client: User ID: {user_id}")
        print(f"💾 B-Client: Username: {username}")
        print(f"💾 B-Client: Account: {account}")
        print(f"💾 B-Client: Password length: {len(password) if password else 0}")
        print(f"💾 B-Client: Account data: {account_data}")
        
        # 删除现有记录
        print(f"💾 B-Client: Deleting existing account records...")
        deleted_count = UserAccount.query.filter_by(
            user_id=user_id, 
            username=username, 
            website='nsn'
        ).delete()
        print(f"💾 B-Client: Deleted {deleted_count} existing account records")
        
        # 创建新记录
        print(f"💾 B-Client: Creating new account record...")
        user_account = UserAccount(
            user_id=user_id,
            username=username,
            website='nsn',
            account=account,
            password=password,
            email=account_data.get('email'),
            first_name=account_data.get('first_name'),
            last_name=account_data.get('last_name'),
            location=account_data.get('location'),
            registration_method='nmp_auto',
            auto_generated=True,
            logout=False  # Reset logout status for new registration
        )
        print(f"💾 B-Client: Account record created: {user_account}")
        
        print(f"💾 B-Client: Adding account record to session...")
        db.session.add(user_account)
        
        print(f"💾 B-Client: Committing transaction...")
        db.session.commit()
        print(f"✅ B-Client: Account saved to database successfully for user {user_id}")
        print(f"💾 B-Client: ===== END SAVING ACCOUNT TO DATABASE =====")
        
    except Exception as e:
        print(f"❌ B-Client: Failed to save account to database: {e}")
        print(f"💾 B-Client: Rolling back transaction...")
        db.session.rollback()
        import traceback
        traceback.print_exc()
        raise e

async def send_session_to_client(user_id, processed_session_cookie, nsn_user_id=None, nsn_username=None, website_root_path=None, website_name=None, session_partition=None, max_retries=3, reset_logout_status=False):
    """Send preprocessed session data to C-Client via WebSocket with feedback and retry"""
    try:
        print(f"📤 B-Client: ===== SENDING SESSION TO C-CLIENT WITH FEEDBACK =====")
        print(f"📤 B-Client: User ID: {user_id}")
        print(f"📤 B-Client: Max retries: {max_retries}")
        print(f"📤 B-Client: Reset logout status: {reset_logout_status}")
        print(f"📤 B-Client: Processed session cookie length: {len(processed_session_cookie) if processed_session_cookie else 0}")
        print(f"📤 B-Client: Processed session cookie: {processed_session_cookie}")
        
        # Reset logout status if requested (for manual login triggered session sends)
        if reset_logout_status:
            print(f"🔄 B-Client: ===== RESETTING LOGOUT STATUS FOR SESSION SEND =====")
            try:
                with app.app_context():
                    user_account = UserAccount.query.filter_by(
                        user_id=user_id,
                        website='nsn'
                    ).first()
                    
                    if user_account:
                        print(f"🔄 B-Client: Found user account, resetting logout status from {user_account.logout} to False")
                        user_account.logout = False
                        db.session.commit()
                        print(f"✅ B-Client: Logout status reset successfully")
                    else:
                        print(f"⚠️ B-Client: No user account found for user {user_id}")
            except Exception as e:
                print(f"❌ B-Client: Error resetting logout status: {e}")
        
        if not c_client_ws:
            print(f"⚠️ B-Client: WebSocket client not available")
            print(f"📤 B-Client: ===== END SENDING SESSION: NO WEBSOCKET CLIENT =====")
            return False
            
        print(f"📤 B-Client: WebSocket client available: {c_client_ws}")
        print(f"📤 B-Client: User connections: {c_client_ws.user_connections}")
        
        # 查找该用户的WebSocket连接
        if user_id in c_client_ws.user_connections:
            connections = c_client_ws.user_connections[user_id]
            print(f"🔍 B-Client: Found {len(connections)} connections for user {user_id}")
            
            # 尝试发送session数据，支持重试
            for attempt in range(max_retries):
                print(f"🔄 B-Client: ===== SESSION SEND ATTEMPT {attempt + 1}/{max_retries} =====")
                
                success_count = 0
                feedback_received = {}
                
                # 设置feedback跟踪
                for websocket in connections:
                    feedback_received[websocket] = False
                    websocket._session_feedback_tracking = feedback_received
                
                # 发送session数据给所有该用户的连接
                for i, websocket in enumerate(connections):
                    try:
                        print(f"📤 B-Client: Checking connection {i+1}/{len(connections)} (attempt {attempt + 1})")
                        
                        # 检查连接是否仍然有效 - 优先检查我们的标记
                        if hasattr(websocket, '_closed_by_logout') and websocket._closed_by_logout:
                            print(f"⚠️ B-Client: Connection {i+1} was closed by logout, skipping")
                            continue
                        
                        # 检查WebSocket的closed属性
                        if hasattr(websocket, 'closed') and websocket.closed:
                            print(f"⚠️ B-Client: Connection {i+1} is closed (closed=True), skipping")
                            continue
                        
                        # 检查连接状态 - 更严格的检查
                        if hasattr(websocket, 'state'):
                            state_value = websocket.state
                            state_name = websocket.state.name if hasattr(websocket.state, 'name') else str(websocket.state)
                            
                            # 检查状态值（3 = CLOSED, 2 = CLOSING）
                            if state_value in [2, 3] or state_name in ['CLOSED', 'CLOSING']:
                                print(f"⚠️ B-Client: Connection {i+1} is in {state_name} state (value: {state_value}), skipping")
                                continue
                        
                        # 检查close_code - 如果设置了close_code，说明连接已经关闭
                        if hasattr(websocket, 'close_code') and websocket.close_code is not None:
                            print(f"⚠️ B-Client: Connection {i+1} has close_code {websocket.close_code}, skipping")
                            continue
                        
                        # 尝试发送测试消息来验证连接是否真的有效
                        try:
                            # 发送一个简单的ping消息来测试连接
                            test_message = {'type': 'ping', 'timestamp': int(time.time() * 1000)}
                            await websocket.send(json.dumps(test_message))
                            print(f"✅ B-Client: Connection {i+1} ping successful, connection is valid")
                        except Exception as ping_error:
                            print(f"⚠️ B-Client: Connection {i+1} ping failed: {ping_error}, skipping")
                            continue
                        
                        print(f"📤 B-Client: Connection {i+1} is valid, sending session")
                        
                        # 从cookie中提取NSN用户信息
                        nsn_user_id_from_cookie = None
                        nsn_username_from_cookie = None
                        
                        try:
                            cookie_data = json.loads(processed_session_cookie)
                            nsn_user_id_from_cookie = cookie_data.get('user_id')
                            nsn_username_from_cookie = cookie_data.get('username')
                            print(f"🔍 B-Client: Extracted from cookie - nsn_user_id: {nsn_user_id_from_cookie}, nsn_username: {nsn_username_from_cookie}")
                        except Exception as e:
                            print(f"⚠️ B-Client: Failed to parse cookie data: {e}")
                            # 使用传入的参数作为fallback
                            nsn_user_id_from_cookie = nsn_user_id
                            nsn_username_from_cookie = nsn_username
                        
                        # 使用从cookie中提取的信息，如果提取失败则使用传入的参数
                        final_nsn_user_id = nsn_user_id_from_cookie or nsn_user_id
                        final_nsn_username = nsn_username_from_cookie or nsn_username
                        
                        # 直接使用预处理后的 session 数据
                        processed_session_data = {
                            'session_cookie': processed_session_cookie,  # 直接使用预处理后的 JSON 字符串
                            'nsn_user_id': final_nsn_user_id,
                            'nsn_username': final_nsn_username,
                            'loggedin': True,
                            'role': 'traveller'
                        }
                        
                        # 添加网站配置信息
                        website_config = {
                            'root_path': website_root_path or 'http://localhost:5000',
                            'name': website_name or 'NSN',
                            'session_partition': session_partition or 'persist:nsn',
                            'root_url': c_client_ws.get_nsn_root_url()  # 添加NSN root URL
                        }
                        
                        message = {
                            'type': 'auto_login',
                            'user_id': user_id,
                            'session_data': processed_session_data,
                            'website_config': website_config,
                            'nsn_user_id': final_nsn_user_id,
                            'nsn_username': final_nsn_username,
                            'message': 'Auto-login with pre-processed session data from B-Client',
                            'timestamp': datetime.utcnow().isoformat()
                        }
                        
                        # Check if WebSocket connection is still open
                        try:
                            # For websockets library, check if connection is closed differently
                            if hasattr(websocket, 'closed') and websocket.closed:
                                print(f"⚠️ B-Client: WebSocket connection {i+1} is closed, skipping...")
                                continue
                        except AttributeError:
                            # ServerConnection doesn't have 'closed' attribute, try to send anyway
                            pass
                        
                        message_json = json.dumps(message)
                        await websocket.send(message_json)
                        print(f"✅ B-Client: Session data sent to C-Client connection {i+1} for user {user_id}")
                        success_count += 1
                        
                    except websockets.exceptions.ConnectionClosed:
                        print(f"⚠️ B-Client: WebSocket connection {i+1} is closed, removing from pool...")
                        # Remove closed connection from pool
                        if user_id in c_client_ws.user_connections:
                            c_client_ws.user_connections[user_id] = [
                                conn for conn in c_client_ws.user_connections[user_id] 
                                if conn != websocket
                            ]
                        continue
                    except Exception as e:
                        print(f"❌ B-Client: Failed to send session to C-Client connection {i+1}: {e}")
                        # Don't print full traceback for connection errors
                        if "ConnectionClosed" not in str(e):
                            import traceback
                            traceback.print_exc()
                
                if success_count == 0:
                    print(f"❌ B-Client: Failed to send to any connections on attempt {attempt + 1}")
                    continue
                
                # 等待feedback - 只等待实际发送成功的连接
                successful_connections = [conn for i, conn in enumerate(connections) if i < success_count]
                print(f"⏳ B-Client: Waiting for session feedback from {len(successful_connections)} successful connections...")
                import asyncio
                start_time = asyncio.get_event_loop().time()
                timeout = 30  # 30秒超时
                
                # 只跟踪成功发送的连接
                successful_feedback_received = {conn: False for conn in successful_connections}
                
                while asyncio.get_event_loop().time() - start_time < timeout:
                    if all(successful_feedback_received.values()):
                        print(f"✅ B-Client: All session feedback received for user {user_id} on attempt {attempt + 1}")
                        # 清理feedback跟踪
                        for websocket in successful_connections:
                            if hasattr(websocket, '_session_feedback_tracking'):
                                delattr(websocket, '_session_feedback_tracking')
                        
                        print(f"📤 B-Client: ===== END SENDING SESSION: SUCCESS =====")
                        return True
                    
                    await asyncio.sleep(0.5)
                else:
                    # 超时
                    missing_feedback = [ws for ws, received in successful_feedback_received.items() if not received]
                    print(f"⚠️ B-Client: Session feedback timeout on attempt {attempt + 1}")
                    print(f"   Missing feedback from {len(missing_feedback)} connections")
                    
                    # 清理feedback跟踪
                    for websocket in successful_connections:
                        if hasattr(websocket, '_session_feedback_tracking'):
                            delattr(websocket, '_session_feedback_tracking')
                    
                    if attempt < max_retries - 1:
                        print(f"🔄 B-Client: Retrying session send... ({attempt + 2}/{max_retries})")
                        await asyncio.sleep(2)  # 等待2秒后重试
                        continue
                    else:
                        print(f"❌ B-Client: Max retries reached, giving up")
                        break
            
            print(f"📤 B-Client: ===== END SENDING SESSION: FAILED AFTER {max_retries} ATTEMPTS =====")
            return False
        else:
            print(f"⚠️ B-Client: No WebSocket connections found for user {user_id}")
            print(f"📤 B-Client: Available user connections: {list(c_client_ws.user_connections.keys())}")
            print(f"📤 B-Client: ===== END SENDING SESSION: NO CONNECTIONS =====")
            return False
            
    except Exception as e:
        print(f"❌ B-Client: Error sending session to C-Client: {e}")
        import traceback
        traceback.print_exc()
        print(f"📤 B-Client: ===== END SENDING SESSION: ERROR =====")
        return False


# Inject send_session_to_client into WebSocket client after it's defined
init_websocket_client(app, db, UserCookie, UserAccount, send_session_to_client)

# Initialize bind routes after send_session_to_client is defined
init_bind_routes(db, UserCookie, UserAccount, nsn_client, c_client_ws, 
                 save_cookie_to_db, save_account_to_db, send_session_to_client)

# Initialize node manager for node management system
print("=" * 80)
print("🔧 Initializing NodeManager for node management system...")
from nodeManager import NodeManager
node_manager = NodeManager()
print(f"✅ NodeManager instance created: {node_manager}")
print("🔧 Registering node management routes...")
init_node_management_routes(node_manager)
print("✅ Node management routes registered")

# Inject NodeManager into WebSocket client for C-Client registration
print("🔧 Injecting NodeManager into WebSocket client...")
c_client_ws.node_manager = node_manager
print(f"✅ NodeManager injected into c_client_ws")
print(f"   c_client_ws.node_manager = {c_client_ws.node_manager}")
print("=" * 80)


if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True, host='0.0.0.0', port=3000)
