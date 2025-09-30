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
from models import db, UserCookie, UserAccount, DomainNode, init_db

app = Flask(__name__)
app.config['SECRET_KEY'] = 'b-client-enterprise-secret-key'

# Use standard SQLite database
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///b_client_secure.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize database
init_db(app)

# Routes
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/dashboard')
def dashboard():
    return render_template('dashboard.html')

@app.route('/history')
def history():
    return render_template('history.html')

@app.route('/config')
def config():
    return render_template('config.html')

@app.route('/nsn-test')
def nsn_test():
    return render_template('nsn_test.html')

@app.route('/c-client-test')
def c_client_test():
    """C-Client WebSocket test page"""
    return render_template('c_client_test.html')

# API Routes
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
        total_domains = DomainNode.query.count()
        
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
class CClientWebSocketClient:
    def __init__(self):
        self.websocket = None
        self.client_id = f"b-client-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        self.is_connected = False
        self.config = self.load_websocket_config()
        self.reconnect_interval = self.config.get('reconnect_interval', 30)
        
        # Initialize dual connection pools for C-Client connections with pre-allocation
        self.node_connections = {}     # Node-based connection pool (node_id -> websocket)
        self.user_connections = {}    # User-based connection pool (user_id -> list of websockets)
        self.client_connections = {}  # Client-based connection pool (client_id -> list of websockets)
        
        # Connection state cache for faster lookups
        self.connection_cache = {}
        self.connection_validity_cache = {}
        
        # Logout processing optimization - NO FEEDBACK WAITING
        self.logout_timeout_config = {
            'first_logout': 1,   # Ultra-fast: 1 second (just for message sending)
            'subsequent_logout': 1,  # Ultra-fast: 1 second (just for message sending)
            'feedback_check_interval': 0.1,  # Not used anymore
            'immediate_feedback_threshold': 0.5,  # Not used anymore
            'no_feedback_waiting': True  # 关键：不等待反馈
        }
        
        # Pre-initialize connection pools for instant access
        self.pre_initialize_connection_pools()
        
        print("✅ B-Client: Connection pools and caches initialized with optimization")
    
    def pre_initialize_connection_pools(self):
        """Pre-initialize connection pools for instant access"""
        print("🚀 B-Client: Pre-initializing connection pools...")
        
        # Pre-allocate common connection structures
        self.node_connections = {}
        self.user_connections = {}
        self.client_connections = {}
        
        # Pre-allocate cache structures
        self.connection_cache = {}
        self.connection_validity_cache = {}
        
        # Pre-allocate logout history tracking
        self.user_logout_history = {}
        
        # Pre-allocate feedback tracking structures
        self.feedback_tracking = {}
        
        print("✅ B-Client: Connection pools pre-initialized for instant access")
    
    def load_websocket_config(self):
        """Load WebSocket configuration from config.json"""
        try:
            config_path = os.path.join(os.path.dirname(__file__), 'config.json')
            if os.path.exists(config_path):
                with open(config_path, 'r') as f:
                    config = json.load(f)
                return config.get('c_client_websocket', {
                    'enabled': True,
                    'server_host': '0.0.0.0',
                    'server_port': 8766,
                    'auto_reconnect': True,
                    'reconnect_interval': 30
                })
            else:
                return {
                    'enabled': True,
                    'server_host': '0.0.0.0',
                    'server_port': 8766,
                    'auto_reconnect': True,
                    'reconnect_interval': 30
                }
        except Exception as e:
            print(f"⚠️  Error loading WebSocket config: {e}")
            return {
                'enabled': True,
                'server_host': '0.0.0.0',
                'server_port': 8766,
                'auto_reconnect': True,
                'reconnect_interval': 30
            }
        
    async def connect(self, host=None, port=None):
        """Connect to C-Client WebSocket server"""
        if not self.config.get('enabled', True):
            print("⚠️  WebSocket connection disabled in config")
            return False
            
        # Use config values if not provided
        host = host or self.config.get('host', 'localhost')
        port = port or self.config.get('port', 8765)
        
        try:
            uri = f"ws://{host}:{port}"
            self.websocket = await websockets.connect(uri)
            self.is_connected = True
            
            # Register as B-Client
            await self.send_message({
                'type': 'b_client_register',
                'client_id': self.client_id
            })
            
            print(f"🔌 B-Client: Connected to C-Client WebSocket at {uri}")
            return True
            
        except Exception as e:
            print(f"❌ B-Client: Failed to connect to C-Client WebSocket: {e}")
            self.is_connected = False
            return False
    
    async def start_server(self, host='0.0.0.0', port=8766):
        """Start WebSocket server for C-Client connections"""
        try:
            server = await websockets.serve(self.handle_c_client_connection, host, port)
            print(f"🔌 B-Client: WebSocket server started on ws://{host}:{port}")
            return server
        except Exception as e:
            print(f"❌ B-Client: Failed to start WebSocket server: {e}")
            return None
    
    async def handle_c_client_connection(self, websocket, path=None):
        """Handle incoming C-Client connections"""
        try:
            print(f"🔌 B-Client: ===== C-CLIENT CONNECTION RECEIVED =====")
            print(f"🔌 B-Client: C-Client connected from {websocket.remote_address}")
            print(f"🔌 B-Client: Connection path: {path}")
            print(f"🔌 B-Client: WebSocket object: {websocket}")
            
            # Wait for registration message
            print(f"🔌 B-Client: Waiting for registration message...")
            message = await websocket.recv()
            print(f"🔌 B-Client: Received message: {message}")
            
            data = json.loads(message)
            print(f"🔌 B-Client: Parsed message data: {data}")
            print(f"🔌 B-Client: Message type: {data.get('type')}")
            
            if data.get('type') == 'c_client_register':
                print(f"🔌 B-Client: ===== C-CLIENT REGISTRATION MESSAGE =====")
                client_id = data.get('client_id', 'unknown')
                user_id = data.get('user_id')  # Get user_id from registration
                username = data.get('username')
                node_id = data.get('node_id')
                domain_id = data.get('domain_id')
                cluster_id = data.get('cluster_id')
                channel_id = data.get('channel_id')
                websocket_port = data.get('websocket_port')  # Get C-Client WebSocket port
                
                print(f"🔌 B-Client: Registration details:")
                print(f"   Client ID: {client_id}")
                print(f"   User ID: {user_id}")
                print(f"   Username: {username}")
                print(f"   Node ID: {node_id}")
                print(f"   Domain ID: {domain_id}")
                print(f"   Cluster ID: {cluster_id}")
                print(f"   Channel ID: {channel_id}")
                print(f"   WebSocket Port: {websocket_port}")
                
                print(f"🔌 B-Client: C-Client registered: {client_id}, user_id: {user_id}")
                print(f"   Username: {username}")
                print(f"   Node ID: {node_id}")
                print(f"   Domain ID: {domain_id}")
                print(f"   Cluster ID: {cluster_id}")
                print(f"   Channel ID: {channel_id}")
                print(f"   WebSocket Port: {websocket_port}")
                
                # Store connection directly with user_id as key
                # Initialize connection pools if not exists
                if not hasattr(self, 'node_connections'):
                    self.node_connections = {}
                if not hasattr(self, 'user_connections'):
                    self.user_connections = {}
                if not hasattr(self, 'client_connections'):
                    self.client_connections = {}
                
                # Set metadata on the websocket object for reference
                websocket.user_id = user_id
                websocket.client_id = client_id
                websocket.username = username
                websocket.node_id = node_id
                websocket.domain_id = domain_id
                websocket.cluster_id = cluster_id
                websocket.channel_id = channel_id
                websocket.websocket_port = websocket_port  # Store C-Client WebSocket port
                
                # Allow multiple connections per node - no rejection logic
                print(f"🔌 B-Client: Allowing multiple connections per node: {node_id}")
                
                # Store connection in triple pools
                # Node-based connection pool (node_id -> list of websockets)
                if node_id:
                    if node_id not in self.node_connections:
                        self.node_connections[node_id] = []
                    self.node_connections[node_id].append(websocket)
                    print(f"🔌 B-Client: Node connection added: {node_id} (total: {len(self.node_connections[node_id])})")
                    print(f"📊 B-Client: Current node connections: {list(self.node_connections.keys())}")
                
                # Client-based connection pool (client_id -> list of websockets)
                # Handle re-registration: update existing connection or create new one
                if client_id:
                    # Check for exact duplicate registration (same node_id, client_id, user_id)
                    if self.check_duplicate_registration(node_id, client_id, user_id, websocket):
                        print(f"🔄 B-Client: Duplicate registration detected - same node_id, client_id, user_id")
                        print(f"🔄 B-Client: Node: {node_id}, Client: {client_id}, User: {user_id}")
                        print(f"🔄 B-Client: Sending success response to existing connection")
                        
                        # Find the existing connection
                        existing_websocket = self.find_existing_connection(node_id, client_id, user_id)
                        if existing_websocket:
                            # Send success response to existing connection
                            await self.send_message_to_websocket(existing_websocket, {
                                'type': 'registration_success',
                                'client_id': client_id,
                                'user_id': user_id,
                                'message': 'Already registered with same credentials'
                            })
                            
                            print(f"✅ B-Client: Duplicate registration response sent to existing connection")
                            
                            # Close the new connection since it's a duplicate
                            await websocket.close(code=1000, reason="Duplicate registration - using existing connection")
                            return
                    
                    # Check if this client is already connected
                    if client_id in self.client_connections:
                        existing_connections = self.client_connections[client_id]
                        existing_websocket = existing_connections[0] if existing_connections else None
                        
                        if existing_websocket:
                            existing_node_id = getattr(existing_websocket, 'node_id', None)
                            existing_user_id = getattr(existing_websocket, 'user_id', None)
                            
                            # If same node and same user, this is a duplicate
                            if existing_node_id == node_id and existing_user_id == user_id:
                                print(f"🔄 B-Client: Exact duplicate registration detected")
                                print(f"🔄 B-Client: Same node ({node_id}), client ({client_id}), and user ({user_id})")
                                
                                # Send success response to existing connection
                                await self.send_message_to_websocket(existing_websocket, {
                                    'type': 'registration_success',
                                    'client_id': client_id,
                                    'user_id': user_id,
                                    'message': 'Already registered with same credentials'
                                })
                                
                                print(f"✅ B-Client: Duplicate registration response sent to existing connection")
                                
                                # Close the new connection since it's a duplicate
                                await websocket.close(code=1000, reason="Duplicate registration - using existing connection")
                                return
                            
                            # If same node but different user, update user info (re-registration)
                            elif existing_node_id == node_id:
                                print(f"🔄 B-Client: Client {client_id} re-registering on same node {node_id}")
                                print(f"🔄 B-Client: Updating user info to {user_id} ({username})")
                                
                                # Update websocket metadata
                                existing_websocket.user_id = user_id
                                existing_websocket.username = username
                                existing_websocket.domain_id = domain_id
                                existing_websocket.cluster_id = cluster_id
                                existing_websocket.channel_id = channel_id
                                
                                # Update user connections pool based on new user_id
                                if user_id:
                                    # First, remove from old user pool if exists
                                    old_user_id = None
                                    for uid, connections in list(self.user_connections.items()):
                                        if existing_websocket in connections:
                                            old_user_id = uid
                                            connections.remove(existing_websocket)
                                            print(f"🗑️ B-Client: Removed connection from old user pool: {uid}")
                                            # Clean up empty user connection lists
                                            if not connections:
                                                del self.user_connections[uid]
                                                print(f"🗑️ B-Client: Removed empty user connection list for {uid}")
                                            break
                                    
                                    # Then add to new user pool
                                    if user_id not in self.user_connections:
                                        # New user - create new user pool
                                        self.user_connections[user_id] = []
                                        print(f"🆕 B-Client: Created new user pool for {user_id}")
                                    
                                    if existing_websocket not in self.user_connections[user_id]:
                                        # Add connection to user pool
                                        self.user_connections[user_id].append(existing_websocket)
                                        print(f"🔌 B-Client: Added connection to user pool: {user_id} (total: {len(self.user_connections[user_id])})")
                                    else:
                                        print(f"✅ B-Client: Connection already in user pool: {user_id}")
                                    
                                    if old_user_id and old_user_id != user_id:
                                        print(f"🔄 B-Client: User switched from {old_user_id} to {user_id}")
                                    
                                    # Print detailed user pool status
                                    print(f"📊 B-Client: User pool status after re-registration:")
                                    print(f"   Total users: {len(self.user_connections)}")
                                    for uid, connections in self.user_connections.items():
                                        print(f"   User {uid}: {len(connections)} connections")
                                        for i, conn in enumerate(connections):
                                            conn_user = getattr(conn, 'user_id', 'unknown')
                                            conn_client = getattr(conn, 'client_id', 'unknown')
                                            print(f"     Connection {i+1}: user={conn_user}, client={conn_client}")
                                else:
                                    print(f"⚠️ B-Client: No user_id provided for re-registration")
                                
                                print(f"✅ B-Client: Re-registration completed for client {client_id}")
                                print(f"📊 B-Client: Updated user connections: {list(self.user_connections.keys())}")
                                
                                # Send success response to existing connection
                                await self.send_message_to_websocket(existing_websocket, {
                                    'type': 'registration_success',
                                    'client_id': client_id,
                                    'user_id': user_id
                                })
                                
                                print(f"✅ B-Client: Re-registration response sent to existing connection")
                                
                                # After successful re-registration, check if user has a saved session and send it
                                print(f"🔍 B-Client: ===== CHECKING FOR SAVED SESSION AFTER RE-REGISTRATION =====")
                                try:
                                    with app.app_context():
                                        cookie = UserCookie.query.filter_by(user_id=user_id).first()
                                        if cookie:
                                            print(f"✅ B-Client: Found saved session for user {user_id}, sending to existing connection")
                                            send_result = await send_session_to_client(
                                                user_id, 
                                                cookie.cookie, 
                                                None,  # nsn_user_id - will be extracted from cookie
                                                None,  # nsn_username - will be extracted from cookie
                                                reset_logout_status=False  # Auto-triggered session send should NOT reset logout status
                                            )
                                            if send_result:
                                                print(f"✅ B-Client: Session sent to C-client successfully for user {user_id}")
                                            else:
                                                print(f"⚠️ B-Client: Failed to send session to C-client for user {user_id}")
                                        else:
                                            print(f"ℹ️ B-Client: No saved session found for user {user_id}")
                                except Exception as e:
                                    print(f"❌ B-Client: Error checking/sending saved session for user {user_id}: {e}")
                                
                                # Close the new connection since we're using the existing one
                                await websocket.close(code=1000, reason="Re-registration successful, using existing connection")
                                return
                            else:
                                # Different node - reject
                                print(f"⚠️  B-Client: Client {client_id} is already connected to node {existing_node_id}, rejecting connection to node {node_id}")
                                
                                await self.send_message_to_websocket(websocket, {
                                    'type': 'registration_rejected',
                                    'reason': 'client_already_connected_to_different_node',
                                    'message': f'Client {client_id} is already connected to node {existing_node_id}. One client can only connect to one node.',
                                    'client_id': client_id,
                                    'user_id': user_id,
                                    'username': username,
                                    'node_id': node_id,
                                    'existing_node_id': existing_node_id
                                })
                                
                                await websocket.close(code=1000, reason="Client already connected to different node")
                                return
                    
                    # Add new connection to client pool
                    if client_id not in self.client_connections:
                        self.client_connections[client_id] = []
                        print(f"🆕 B-Client: Created new client pool for {client_id}")
                    self.client_connections[client_id].append(websocket)
                    print(f"🔌 B-Client: Client connection added: {client_id} (total: {len(self.client_connections[client_id])})")
                    print(f"📊 B-Client: Current client connections: {list(self.client_connections.keys())}")
                    
                    # Print detailed client pool status
                    print(f"📊 B-Client: Client pool status after new registration:")
                    print(f"   Total clients: {len(self.client_connections)}")
                    for cid, connections in self.client_connections.items():
                        print(f"   Client {cid}: {len(connections)} connections")
                        for i, conn in enumerate(connections):
                            conn_user = getattr(conn, 'user_id', 'unknown')
                            conn_client = getattr(conn, 'client_id', 'unknown')
                            print(f"     Connection {i+1}: user={conn_user}, client={conn_client}")
                
                # User-based connection pool (user_id -> list of websockets)
                if user_id:
                    # IMMEDIATE CHECK: Verify user logout status (DO NOT reset automatically)
                    print(f"🔍 B-Client: IMMEDIATE CHECK: Verifying user {user_id} logout status...")
                    try:
                        # Ensure we have Flask application context for database operations
                        with app.app_context():
                            user_account = UserAccount.query.filter_by(user_id=user_id).first()
                            if user_account and user_account.logout:
                                print(f"🔓 B-Client: User {user_id} is logged out, connection will be limited")
                                print(f"🔓 B-Client: Logout status will NOT be reset automatically - user must login manually")
                            else:
                                print(f"✅ B-Client: User {user_id} is not logged out, proceeding with connection")
                    except Exception as e:
                        print(f"⚠️ B-Client: Error checking user logout status: {e}")
                    
                    # Check if this client already has a different user connected
                    await self.handle_client_user_switch(client_id, user_id, username, websocket)
                    
                    # Check if this node already has a different user connected
                    await self.handle_node_user_switch(node_id, user_id, username, websocket)
                    
                    # Add new connection to user pool
                    if user_id not in self.user_connections:
                        self.user_connections[user_id] = []
                        print(f"🆕 B-Client: Created new user pool for {user_id}")
                    self.user_connections[user_id].append(websocket)
                    print(f"🔌 B-Client: User connection added: {user_id} (total: {len(self.user_connections[user_id])})")
                    
                    print(f"📊 B-Client: Current user connections: {list(self.user_connections.keys())}")
                    print(f"📊 B-Client: User {user_id} connected on nodes: {[getattr(ws, 'node_id', 'unknown') for ws in self.user_connections[user_id]]}")
                    
                    # Print detailed user pool status
                    print(f"📊 B-Client: User pool status after new registration:")
                    print(f"   Total users: {len(self.user_connections)}")
                    for uid, connections in self.user_connections.items():
                        print(f"   User {uid}: {len(connections)} connections")
                        for i, conn in enumerate(connections):
                            conn_user = getattr(conn, 'user_id', 'unknown')
                            conn_client = getattr(conn, 'client_id', 'unknown')
                            print(f"     Connection {i+1}: user={conn_user}, client={conn_client}")
                    
                    # Check logout status before notifying existing connections
                    # Only notify if user is not logged out
                    try:
                        with app.app_context():
                            user_account = UserAccount.query.filter_by(user_id=user_id).first()
                            is_logged_out = user_account and user_account.logout
                            
                            if is_logged_out:
                                print(f"🔓 B-Client: User {user_id} is logged out, skipping notification to existing connections")
                            else:
                                # Notify all existing connections about user login
                                # This ensures all clients are aware when a user logs in
                                existing_connections = [conn for conn in self.user_connections[user_id] if conn != websocket]
                                if existing_connections:
                                    print(f"🔔 B-Client: User {user_id} ({username}) logged in, notifying {len(existing_connections)} existing connections")
                                    await self.notify_user_connected_on_another_client(user_id, username, client_id, node_id, existing_connections)
                                else:
                                    print(f"🔍 B-Client: No existing connections to notify for user {user_id}")
                    except Exception as e:
                        print(f"⚠️ B-Client: Error checking logout status for notification: {e}")
                        # Fallback: don't notify if we can't check logout status
                        print(f"🔍 B-Client: Skipping notification due to logout status check error")
                
                # Send registration confirmation
                await self.send_message_to_websocket(websocket, {
                    'type': 'registration_success',
                    'client_id': client_id,
                    'user_id': user_id
                })
                
                print(f"✅ B-Client: Registration successful for Node: {node_id}, User: {user_id} ({username}), Client: {client_id}")
                print(f"📊 B-Client: Final connection pools status:")
                print(f"   📊 Nodes: {len(self.node_connections)} - {list(self.node_connections.keys())}")
                print(f"   📊 Users: {len(self.user_connections)} - {list(self.user_connections.keys())}")
                print(f"   📊 Clients: {len(self.client_connections)} - {list(self.client_connections.keys())}")
                for uid, connections in self.user_connections.items():
                    node_list = [getattr(ws, 'node_id', 'unknown') for ws in connections]
                    client_list = [getattr(ws, 'client_id', 'unknown') for ws in connections]
                    print(f"   📊 User {uid}: {len(connections)} connections on nodes {node_list} with clients {client_list}")
                for cid, connections in self.client_connections.items():
                    user_list = [getattr(ws, 'user_id', 'unknown') for ws in connections]
                    node_list = [getattr(ws, 'node_id', 'unknown') for ws in connections]
                    print(f"   📊 Client {cid}: {len(connections)} connections for users {user_list} on nodes {node_list}")
                
                # After successful registration, check if user has a saved session and send it
                print(f"🔍 B-Client: ===== CHECKING FOR SAVED SESSION AFTER REGISTRATION =====")
                print(f"🔍 B-Client: Checking if user {user_id} has saved session...")
                
                try:
                    # Use app context for database operations
                    with app.app_context():
                        # Query database for user's cookie
                        cookie = UserCookie.query.filter_by(user_id=user_id).first()
                        if cookie:
                            print(f"✅ B-Client: Found saved session for user {user_id}")
                            print(f"✅ B-Client: Session username: {cookie.username}, node_id: {cookie.node_id}")
                            
                            # Check if user has logged out (prevent auto-login after logout)
                            print(f"🔍 B-Client: Checking logout status for user {user_id}...")
                            user_account = UserAccount.query.filter_by(
                                user_id=user_id,
                                website='nsn'
                            ).first()
                            
                            print(f"🔍 B-Client: user_account found: {user_account is not None}")
                            if user_account:
                                print(f"🔍 B-Client: user_account.logout value: {user_account.logout} (type: {type(user_account.logout)})")
                                print(f"🔍 B-Client: user_account.logout == True: {user_account.logout == True}")
                                print(f"🔍 B-Client: user_account.logout is True: {user_account.logout is True}")
                            
                            if user_account and not user_account.logout:
                                print(f"✅ B-Client: User {user_id} is not logged out, sending session")
                                
                                # Send session to C-client using the new send_session_to_client function
                                import asyncio
                                send_result = await send_session_to_client(
                                    user_id, 
                                    cookie.cookie, 
                                    None,  # nsn_user_id - will be extracted from cookie
                                    None,  # nsn_username - will be extracted from cookie
                                    reset_logout_status=False  # Auto-triggered session send should NOT reset logout status
                                )
                                
                                if send_result:
                                    print(f"✅ B-Client: Session sent to C-client successfully for user {user_id}")
                                else:
                                    print(f"⚠️ B-Client: Failed to send session to C-client for user {user_id}")
                            else:
                                if user_account and user_account.logout:
                                    print(f"🔓 B-Client: User {user_id} has logged out (logout=True), skipping auto-login")
                                else:
                                    print(f"🔓 B-Client: User {user_id} has no account or logged out, skipping auto-login")
                                print(f"🔓 B-Client: This prevents automatic re-login after logout")
                        else:
                            print(f"ℹ️ B-Client: No saved session found for user {user_id}")
                except Exception as e:
                    print(f"❌ B-Client: Error checking/sending saved session for user {user_id}: {e}")
                    import traceback
                    traceback.print_exc()
                
                # Handle messages from C-Client
                async for message in websocket:
                    try:
                        data = json.loads(message)
                        await self.process_c_client_message(websocket, data, client_id, user_id)
                    except json.JSONDecodeError:
                        await self.send_error(websocket, "Invalid JSON format")
                    except Exception as e:
                        print(f"❌ B-Client: Error processing C-Client message: {e}")
                        
        except websockets.exceptions.ConnectionClosed:
            print(f"🔌 B-Client: C-Client disconnected")
        except Exception as e:
            print(f"❌ B-Client: Error handling C-Client connection: {e}")
        finally:
            # Remove from all connection pools using websocket object reference
            self.remove_connection_from_all_pools(websocket)
    
    async def process_c_client_message(self, websocket, data, client_id, user_id=None):
        """Process messages from C-Client"""
        message_type = data.get('type')
        
        if message_type == 'c_client_register':
            # Handle re-registration from C-Client
            print(f"📥 B-Client: Received re-registration from C-Client {client_id}")
            await self.handle_c_client_reregistration(websocket, data)
        elif message_type == 'cookie_response':
            # Handle cookie response from C-Client
            print(f"📥 B-Client: Received cookie response from C-Client {client_id}")
        elif message_type == 'cookie_update_response':
            # Handle cookie update response from C-Client
            print(f"📥 B-Client: Received cookie update response from C-Client {client_id}")
        elif message_type == 'user_login_notification':
            # Handle user login notification from C-Client
            print(f"📥 B-Client: Received user login notification from C-Client {client_id}")
        elif message_type == 'user_logout_notification':
            # Handle user logout notification from C-Client
            print(f"📥 B-Client: Received user logout notification from C-Client {client_id}")
        elif message_type == 'logout_feedback':
            # Handle logout feedback from C-Client
            print(f"📥 B-Client: Received logout feedback from C-Client {client_id}")
            await self.handle_logout_feedback(websocket, data, client_id, user_id)
        elif message_type == 'session_feedback':
            # Handle session feedback from C-Client
            print(f"📥 B-Client: Received session feedback from C-Client {client_id}")
            await self.handle_session_feedback(websocket, data, client_id, user_id)
        else:
            print(f"📥 B-Client: Unknown message type from C-Client: {message_type}")
    
    async def send_message_to_c_client(self, client_id, message):
        """Send message to specific C-Client by client_id"""
        # Search in client_connections for the websocket with matching client_id
        if hasattr(self, 'client_connections') and self.client_connections:
            if client_id in self.client_connections:
                for websocket in self.client_connections[client_id]:
                    try:
                        await self.send_message_to_websocket(websocket, message)
                    except Exception as e:
                        print(f"❌ B-Client: Error sending message to client {client_id}: {e}")
                return True
        return False
    
    async def send_message_to_node(self, node_id, message):
        """Send message to C-Client by node_id (node_id is the connection key)"""
        if hasattr(self, 'node_connections') and self.node_connections:
            if node_id in self.node_connections:
                for websocket in self.node_connections[node_id]:
                    try:
                        await self.send_message_to_websocket(websocket, message)
                        print(f"📤 B-Client: Message sent to node {node_id}")
                    except Exception as e:
                        print(f"❌ B-Client: Error sending message to node {node_id}: {e}")
                return True
            else:
                print(f"❌ B-Client: No connection found for node_id: {node_id}")
                return False
        return False
    
    async def send_message_to_user(self, user_id, message):
        """Send message to all C-Client connections for a specific user"""
        if hasattr(self, 'user_connections') and self.user_connections:
            user_websockets = self.user_connections.get(user_id, [])
            if user_websockets:
                success_count = 0
                failed_connections = []
                
                for i, websocket in enumerate(user_websockets):
                    try:
                        # Check if websocket is still open
                        # websockets ServerConnection uses 'close_code' to check if closed
                        is_closed = False
                        try:
                            if hasattr(websocket, 'close_code') and websocket.close_code is not None:
                                is_closed = True
                        except Exception:
                            # If we can't check, assume it's open and try to send
                            pass
                        
                        if is_closed:
                            print(f"⚠️ B-Client: Connection {i} for user {user_id} is closed, skipping")
                            failed_connections.append(i)
                            continue
                            
                        await self.send_message_to_websocket(websocket, message)
                        success_count += 1
                        print(f"✅ B-Client: Message sent to connection {i} for user {user_id}")
                        
                    except Exception as e:
                        print(f"❌ B-Client: Error sending to user {user_id} connection {i}: {e}")
                        failed_connections.append(i)
                
                # Clean up failed connections
                if failed_connections:
                    print(f"🧹 B-Client: Cleaning up {len(failed_connections)} failed connections for user {user_id}")
                    # Remove failed connections from the list (in reverse order to maintain indices)
                    for i in reversed(failed_connections):
                        if i < len(user_websockets):
                            user_websockets.pop(i)
                    
                    # Update the user_connections dictionary
                    if user_websockets:
                        self.user_connections[user_id] = user_websockets
                    else:
                        del self.user_connections[user_id]
                        print(f"🗑️ B-Client: Removed user {user_id} from connections (no active connections)")
                
                print(f"📤 B-Client: Message sent to {success_count}/{len(user_websockets) + len(failed_connections)} connections for user {user_id}")
                return success_count > 0
            else:
                print(f"❌ B-Client: No connections found for user_id: {user_id}")
                return False
        return False
    
    async def send_message_to_user_node(self, user_id, node_id, message):
        """Send message to a specific user on a specific node"""
        if hasattr(self, 'user_connections') and self.user_connections:
            user_websockets = self.user_connections.get(user_id, [])
            for websocket in user_websockets:
                # Check if this websocket belongs to the specified node
                if hasattr(websocket, 'node_id') and websocket.node_id == node_id:
                    await self.send_message_to_websocket(websocket, message)
                    print(f"📤 B-Client: Message sent to user {user_id} on node {node_id}")
                    return True
            
            print(f"❌ B-Client: No connection found for user {user_id} on node {node_id}")
            return False
        return False
    
    async def handle_c_client_reregistration(self, websocket, data):
        """Handle re-registration from existing C-Client connection"""
        try:
            client_id = data.get('client_id', 'unknown')
            user_id = data.get('user_id')
            username = data.get('username')
            node_id = data.get('node_id')
            domain_id = data.get('domain_id')
            cluster_id = data.get('cluster_id')
            channel_id = data.get('channel_id')
            
            print(f"🔄 B-Client: Processing re-registration for client {client_id}")
            print(f"   New User ID: {user_id}")
            print(f"   New Username: {username}")
            print(f"   Node ID: {node_id}")
            
            # Check for duplicate registration first
            if self.check_duplicate_registration(node_id, client_id, user_id, websocket):
                print(f"🔄 B-Client: Duplicate re-registration detected - same node_id, client_id, user_id")
                print(f"🔄 B-Client: Node: {node_id}, Client: {client_id}, User: {user_id}")
                
                # Find the existing connection
                existing_websocket = self.find_existing_connection(node_id, client_id, user_id)
                if existing_websocket and existing_websocket != websocket:
                    print(f"🔄 B-Client: Sending success response to existing connection")
                    
                    # Send success response to existing connection
                    await self.send_message_to_websocket(existing_websocket, {
                        'type': 'registration_success',
                        'client_id': client_id,
                        'user_id': user_id,
                        'message': 'Already registered with same credentials'
                    })
                    
                    print(f"✅ B-Client: Duplicate re-registration response sent to existing connection")
                    
                    # Close the new connection since it's a duplicate
                    await websocket.close(code=1000, reason="Duplicate re-registration - using existing connection")
                    return
            
            # Check if this client is already connected
            if client_id in self.client_connections:
                existing_connections = self.client_connections[client_id]
                existing_websocket = existing_connections[0] if existing_connections else None
                
                if existing_websocket:
                    existing_node_id = getattr(existing_websocket, 'node_id', None)
                    
                    # If same node, update user info (re-registration)
                    if existing_node_id == node_id:
                        print(f"🔄 B-Client: Client {client_id} re-registering on same node {node_id}")
                        print(f"🔄 B-Client: Updating user info to {user_id} ({username})")
                        
                        # Update websocket metadata
                        existing_websocket.user_id = user_id
                        existing_websocket.username = username
                        existing_websocket.domain_id = domain_id
                        existing_websocket.cluster_id = cluster_id
                        existing_websocket.channel_id = channel_id
                        
                        # Update user connections pool based on new user_id
                        if user_id:
                            # First, remove from old user pool if exists
                            old_user_id = None
                            for uid, connections in list(self.user_connections.items()):
                                if existing_websocket in connections:
                                    old_user_id = uid
                                    connections.remove(existing_websocket)
                                    print(f"🗑️ B-Client: Removed connection from old user pool: {uid}")
                                    # Clean up empty user connection lists
                                    if not connections:
                                        del self.user_connections[uid]
                                        print(f"🗑️ B-Client: Removed empty user connection list for {uid}")
                                    break
                            
                            # Then add to new user pool
                            if user_id not in self.user_connections:
                                # New user - create new user pool
                                self.user_connections[user_id] = []
                                print(f"🆕 B-Client: Created new user pool for {user_id}")
                            
                            if existing_websocket not in self.user_connections[user_id]:
                                # Add connection to user pool
                                self.user_connections[user_id].append(existing_websocket)
                                print(f"🔌 B-Client: Added connection to user pool: {user_id} (total: {len(self.user_connections[user_id])})")
                            else:
                                print(f"✅ B-Client: Connection already in user pool: {user_id}")
                            
                            if old_user_id and old_user_id != user_id:
                                print(f"🔄 B-Client: User switched from {old_user_id} to {user_id}")
                            
                            # Print detailed user pool status
                            print(f"📊 B-Client: User pool status after re-registration:")
                            print(f"   Total users: {len(self.user_connections)}")
                            for uid, connections in self.user_connections.items():
                                print(f"   User {uid}: {len(connections)} connections")
                                for i, conn in enumerate(connections):
                                    conn_user = getattr(conn, 'user_id', 'unknown')
                                    conn_client = getattr(conn, 'client_id', 'unknown')
                                    print(f"     Connection {i+1}: user={conn_user}, client={conn_client}")
                        else:
                            print(f"⚠️ B-Client: No user_id provided for re-registration")
                        
                        print(f"✅ B-Client: Re-registration completed for client {client_id}")
                        print(f"📊 B-Client: Updated user connections: {list(self.user_connections.keys())}")
                        
                        # Send success response to existing connection
                        await self.send_message_to_websocket(existing_websocket, {
                            'type': 'registration_success',
                            'client_id': client_id,
                            'user_id': user_id
                        })
                        
                        print(f"✅ B-Client: Re-registration response sent to existing connection")
                        
                        # After successful re-registration, check if user has a saved session and send it
                        print(f"🔍 B-Client: ===== CHECKING FOR SAVED SESSION AFTER RE-REGISTRATION =====")
                        try:
                            with app.app_context():
                                cookie = UserCookie.query.filter_by(user_id=user_id).first()
                                if cookie:
                                    print(f"✅ B-Client: Found saved session for user {user_id}, sending to existing connection")
                                    send_result = await send_session_to_client(
                                        user_id, 
                                        cookie.cookie, 
                                        cookie.username,
                                        cookie.username,
                                        reset_logout_status=False  # Auto-triggered session send should NOT reset logout status
                                    )
                                    if send_result:
                                        print(f"✅ B-Client: Session sent to C-client successfully for user {user_id}")
                                    else:
                                        print(f"⚠️ B-Client: Failed to send session to C-client for user {user_id}")
                                else:
                                    print(f"ℹ️ B-Client: No saved session found for user {user_id}")
                        except Exception as e:
                            print(f"❌ B-Client: Error checking/sending saved session for user {user_id}: {e}")
                        
                        return
                    else:
                        # Different node - reject
                        print(f"❌ B-Client: Client {client_id} trying to connect to different node")
                        await self.send_message_to_websocket(websocket, {
                            'type': 'registration_rejected',
                            'client_id': client_id,
                            'message': f'Client already connected to different node: {existing_node_id}'
                        })
                        return
                else:
                    print(f"❌ B-Client: No existing websocket found for client {client_id}")
            else:
                print(f"❌ B-Client: Client {client_id} not found in client connections")
                
        except Exception as e:
            print(f"❌ B-Client: Error handling re-registration: {e}")
    
    async def handle_client_user_switch(self, client_id, new_user_id, new_username, websocket):
        """Handle client switching to a different user - clean up previous user records"""
        if not client_id:
            return
            
        # Check if this client already has different users connected
        if client_id in self.client_connections:
            existing_connections = self.client_connections[client_id]
            for existing_websocket in existing_connections:
                if existing_websocket != websocket:
                    old_user_id = getattr(existing_websocket, 'user_id', None)
                    old_username = getattr(existing_websocket, 'username', None)
                    
                    if old_user_id and old_user_id != new_user_id:
                        print(f"🔄 B-Client: Client {client_id} switching from user {old_user_id} ({old_username}) to {new_user_id} ({new_username})")
                        print(f"🗑️ B-Client: Starting cleanup for old user {old_user_id} from client {client_id}")
                        
                        # Remove old user from user connections pool
                        await self.remove_user_from_client(old_user_id, client_id)
                        print(f"✅ B-Client: Cleanup completed for user {old_user_id} from client {client_id}")
    
    async def handle_node_user_switch(self, node_id, new_user_id, new_username, websocket):
        """Handle node switching to a different user - clean up previous user records"""
        if not node_id:
            return
            
        # Check if this node already has different users connected
        if node_id in self.node_connections:
            existing_connections = self.node_connections[node_id]
            for existing_websocket in existing_connections:
                if existing_websocket != websocket:
                    old_user_id = getattr(existing_websocket, 'user_id', None)
                    old_username = getattr(existing_websocket, 'username', None)
                    
                    if old_user_id and old_user_id != new_user_id:
                        print(f"🔄 B-Client: Node {node_id} has user {old_user_id} ({old_username}) and new user {new_user_id} ({new_username})")
                        print(f"📊 B-Client: Allowing multiple users on same node - no cleanup needed")
    
    async def remove_user_from_client(self, user_id, client_id):
        """Remove user from a specific client in user connections pool"""
        print(f"🗑️ B-Client: Attempting to remove user {user_id} from client {client_id}")
        
        if user_id in self.user_connections:
            # Find and remove the websocket for this specific client
            user_websockets = self.user_connections[user_id]
            websockets_to_remove = []
            
            print(f"🔍 B-Client: User {user_id} has {len(user_websockets)} connections")
            
            for websocket in user_websockets:
                if hasattr(websocket, 'client_id') and websocket.client_id == client_id:
                    websockets_to_remove.append(websocket)
                    print(f"🎯 B-Client: Found websocket for user {user_id} on client {client_id}")
            
            # Remove the websockets
            for websocket in websockets_to_remove:
                user_websockets.remove(websocket)
                print(f"🗑️ B-Client: Removed user {user_id} from client {client_id}")
            
            # Clean up empty user connection lists
            if not user_websockets:
                del self.user_connections[user_id]
                print(f"🗑️ B-Client: Removed empty user connection list for {user_id}")
                print(f"📊 B-Client: User {user_id} completely removed from system")
            else:
                print(f"📊 B-Client: User {user_id} still has {len(user_websockets)} connections on other clients")
        else:
            print(f"⚠️ B-Client: User {user_id} not found in user connections pool")
    
    async def remove_user_from_node(self, user_id, node_id):
        """Remove user from a specific node in user connections pool"""
        print(f"🗑️ B-Client: Attempting to remove user {user_id} from node {node_id}")
        
        if user_id in self.user_connections:
            # Find and remove the websocket for this specific node
            user_websockets = self.user_connections[user_id]
            websockets_to_remove = []
            
            print(f"🔍 B-Client: User {user_id} has {len(user_websockets)} connections")
            
            for websocket in user_websockets:
                if hasattr(websocket, 'node_id') and websocket.node_id == node_id:
                    websockets_to_remove.append(websocket)
                    print(f"🎯 B-Client: Found websocket for user {user_id} on node {node_id}")
            
            # Remove the websockets
            for websocket in websockets_to_remove:
                user_websockets.remove(websocket)
                print(f"🗑️ B-Client: Removed user {user_id} from node {node_id}")
            
            # Clean up empty user connection lists
            if not user_websockets:
                del self.user_connections[user_id]
                print(f"🗑️ B-Client: Removed empty user connection list for {user_id}")
                print(f"📊 B-Client: User {user_id} completely removed from system")
            else:
                print(f"📊 B-Client: User {user_id} still has {len(user_websockets)} connections on other nodes")
        else:
            print(f"⚠️ B-Client: User {user_id} not found in user connections pool")
    

    async def notify_user_connected_on_another_client(self, user_id, username, new_client_id, new_node_id, existing_connections):
        """Notify existing connections that user logged in on another client/node"""
        print(f"🔔 B-Client: ===== STARTING NOTIFICATION =====")
        print(f"🔔 B-Client: notify_user_connected_on_another_client called")
        print(f"🔔 B-Client: user_id: {user_id}")
        print(f"🔔 B-Client: username: {username}")
        print(f"🔔 B-Client: new_client_id: {new_client_id}")
        print(f"🔔 B-Client: new_node_id: {new_node_id}")
        print(f"🔔 B-Client: existing_connections count: {len(existing_connections)}")
        
        notification_message = {
            'type': 'user_connected_on_another_client',
            'user_id': user_id,
            'username': username,
            'new_client_id': new_client_id,
            'new_node_id': new_node_id,
            'message': f'User {username} has logged in on another client: {new_client_id} (node: {new_node_id})',
            'timestamp': datetime.utcnow().isoformat()
        }
        
        print(f"🔔 B-Client: Notification message: {notification_message}")
        
        success_count = 0
        for i, websocket in enumerate(existing_connections):
            try:
                existing_client_id = getattr(websocket, 'client_id', 'unknown')
                existing_node_id = getattr(websocket, 'node_id', 'unknown')
                print(f"📤 B-Client: Sending notification to connection {i+1}: client={existing_client_id}, node={existing_node_id}")
                
                await self.send_message_to_websocket(websocket, notification_message)
                success_count += 1
                print(f"✅ B-Client: Successfully notified client {existing_client_id} (node {existing_node_id}) about user {user_id} login on client {new_client_id} (node {new_node_id})")
            except Exception as e:
                print(f"❌ B-Client: Error notifying client about user login: {e}")
                import traceback
                traceback.print_exc()
        
        print(f"🔔 B-Client: Notified {success_count}/{len(existing_connections)} existing connections about user {user_id} login on client {new_client_id} (node {new_node_id})")
        print(f"🔔 B-Client: ===== NOTIFICATION COMPLETE =====")

    
    async def notify_user_connected_on_another_node(self, user_id, username, new_node_id, existing_connections):
        """Notify existing connections that user logged in on another node (legacy method)"""
        notification_message = {
            'type': 'user_connected_on_another_node',
            'user_id': user_id,
            'username': username,
            'new_node_id': new_node_id,
            'message': f'User {username} has logged in on another node: {new_node_id}',
            'timestamp': datetime.utcnow().isoformat()
        }
        
        success_count = 0
        for websocket in existing_connections:
            try:
                await self.send_message_to_websocket(websocket, notification_message)
                success_count += 1
                print(f"📤 B-Client: Notified node {getattr(websocket, 'node_id', 'unknown')} about user {user_id} login on {new_node_id}")
            except Exception as e:
                print(f"❌ B-Client: Error notifying node about user login: {e}")
        
        print(f"🔔 B-Client: Notified {success_count}/{len(existing_connections)} existing connections about user {user_id} login on {new_node_id}")
    
    async def handle_node_offline(self, node_id):
        """Handle node offline - close all clients on this node and clean up users if needed"""
        print(f"🔌 B-Client: Node {node_id} going offline - starting cleanup...")
        
        if not hasattr(self, 'node_connections') or node_id not in self.node_connections:
            print(f"⚠️ B-Client: Node {node_id} not found in connections")
            return
        
        # Get all connections on this node
        node_connections = self.node_connections[node_id]
        print(f"🔍 B-Client: Found {len(node_connections)} connections on node {node_id}")
        
        # Collect all clients and users on this node
        clients_to_close = set()
        users_to_check = set()
        
        for websocket in node_connections:
            client_id = getattr(websocket, 'client_id', None)
            user_id = getattr(websocket, 'user_id', None)
            
            if client_id:
                clients_to_close.add(client_id)
            if user_id:
                users_to_check.add(user_id)
        
        print(f"📋 B-Client: Found {len(clients_to_close)} clients to close: {list(clients_to_close)}")
        print(f"📋 B-Client: Found {len(users_to_check)} users to check: {list(users_to_check)}")
        
        # Close all connections on this node
        for websocket in node_connections:
            try:
                await websocket.close(code=1000, reason="Node offline")
                print(f"🔌 B-Client: Closed connection on node {node_id}")
            except Exception as e:
                print(f"❌ B-Client: Error closing connection: {e}")
        
        # Remove node from node connections pool
        del self.node_connections[node_id]
        print(f"🗑️ B-Client: Removed node {node_id} from node connections pool")
        
        # Check each user to see if they should be cleaned up
        for user_id in users_to_check:
            await self.check_and_cleanup_user_if_orphaned(user_id, node_id)
        
        # Check each client to see if they should be cleaned up
        for client_id in clients_to_close:
            await self.check_and_cleanup_client_if_orphaned(client_id, node_id)
        
        print(f"✅ B-Client: Node {node_id} offline cleanup completed")
    
    async def check_and_cleanup_user_if_orphaned(self, user_id, offline_node_id):
        """Check if user is only connected on the offline node, if so clean up"""
        print(f"🔍 B-Client: Checking if user {user_id} is orphaned after node {offline_node_id} offline...")
        
        if user_id not in self.user_connections:
            print(f"⚠️ B-Client: User {user_id} not found in user connections")
            return
        
        user_websockets = self.user_connections[user_id]
        remaining_connections = []
        
        # Check which connections are still active (not on the offline node)
        for websocket in user_websockets:
            websocket_node_id = getattr(websocket, 'node_id', None)
            if websocket_node_id != offline_node_id:
                remaining_connections.append(websocket)
        
        print(f"📊 B-Client: User {user_id} has {len(remaining_connections)} remaining connections after node {offline_node_id} offline")
        
        if not remaining_connections:
            # User is orphaned, clean up
            print(f"🗑️ B-Client: User {user_id} is orphaned, cleaning up...")
            del self.user_connections[user_id]
            print(f"✅ B-Client: User {user_id} completely removed from system")
        else:
            # User still has connections, update the list
            self.user_connections[user_id] = remaining_connections
            print(f"📊 B-Client: User {user_id} still has {len(remaining_connections)} active connections")
    
    async def check_and_cleanup_client_if_orphaned(self, client_id, offline_node_id):
        """Check if client is only connected on the offline node, if so clean up"""
        print(f"🔍 B-Client: Checking if client {client_id} is orphaned after node {offline_node_id} offline...")
        
        if client_id not in self.client_connections:
            print(f"⚠️ B-Client: Client {client_id} not found in client connections")
            return
        
        client_websockets = self.client_connections[client_id]
        remaining_connections = []
        
        # Check which connections are still active (not on the offline node)
        for websocket in client_websockets:
            websocket_node_id = getattr(websocket, 'node_id', None)
            if websocket_node_id != offline_node_id:
                remaining_connections.append(websocket)
        
        print(f"📊 B-Client: Client {client_id} has {len(remaining_connections)} remaining connections after node {offline_node_id} offline")
        
        if not remaining_connections:
            # Client is orphaned, clean up
            print(f"🗑️ B-Client: Client {client_id} is orphaned, cleaning up...")
            del self.client_connections[client_id]
            print(f"✅ B-Client: Client {client_id} completely removed from system")
        else:
            # Client still has connections, update the list
            self.client_connections[client_id] = remaining_connections
            print(f"📊 B-Client: Client {client_id} still has {len(remaining_connections)} active connections")

    def check_duplicate_registration(self, node_id, client_id, user_id, new_websocket):
        """Check if a registration with the same node_id, client_id, and user_id already exists and is still valid"""
        print(f"🔍 B-Client: Checking for duplicate registration...")
        print(f"🔍 B-Client: Node: {node_id}, Client: {client_id}, User: {user_id}")
        
        # Check in all connection pools
        if hasattr(self, 'node_connections') and self.node_connections:
            for nid, connections in self.node_connections.items():
                if nid == node_id:
                    for conn in connections:
                        if (conn != new_websocket and 
                            getattr(conn, 'client_id', None) == client_id and 
                            getattr(conn, 'user_id', None) == user_id):
                            # Check if the existing connection is still valid
                            if self.is_connection_valid(conn):
                                print(f"🔍 B-Client: Found valid duplicate in node connections")
                                return True
                            else:
                                print(f"🔍 B-Client: Found invalid duplicate in node connections, will allow new connection")
                                # Remove invalid connection from pool
                                self.remove_invalid_connection(conn)
        
        if hasattr(self, 'client_connections') and self.client_connections:
            if client_id in self.client_connections:
                for conn in self.client_connections[client_id]:
                    if (conn != new_websocket and 
                        getattr(conn, 'node_id', None) == node_id and 
                        getattr(conn, 'user_id', None) == user_id):
                        # Check if the existing connection is still valid
                        if self.is_connection_valid(conn):
                            print(f"🔍 B-Client: Found valid duplicate in client connections")
                            return True
                        else:
                            print(f"🔍 B-Client: Found invalid duplicate in client connections, will allow new connection")
                            # Remove invalid connection from pool
                            self.remove_invalid_connection(conn)
        
        if hasattr(self, 'user_connections') and self.user_connections:
            if user_id in self.user_connections:
                for conn in self.user_connections[user_id]:
                    if (conn != new_websocket and 
                        getattr(conn, 'node_id', None) == node_id and 
                        getattr(conn, 'client_id', None) == client_id):
                        # Check if the existing connection is still valid
                        if self.is_connection_valid(conn):
                            print(f"🔍 B-Client: Found valid duplicate in user connections")
                            return True
                        else:
                            print(f"🔍 B-Client: Found invalid duplicate in user connections, will allow new connection")
                            # Remove invalid connection from pool
                            self.remove_invalid_connection(conn)
        
        print(f"🔍 B-Client: No valid duplicate registration found")
        return False
    
    def is_connection_valid(self, websocket):
        """Check if a WebSocket connection is still valid"""
        try:
            # Check if connection was marked as closed by logout
            if hasattr(websocket, '_closed_by_logout') and websocket._closed_by_logout:
                print(f"🔍 B-Client: Connection marked as closed by logout")
                return False
            
            # Check WebSocket closed attribute
            if hasattr(websocket, 'closed') and websocket.closed:
                print(f"🔍 B-Client: Connection is closed (closed=True)")
                return False
            
            # Check connection state
            if hasattr(websocket, 'state'):
                state_value = websocket.state
                state_name = websocket.state.name if hasattr(websocket.state, 'name') else str(websocket.state)
                
                # Check state value (3 = CLOSED, 2 = CLOSING)
                if state_value in [2, 3] or state_name in ['CLOSED', 'CLOSING']:
                    print(f"🔍 B-Client: Connection is in {state_name} state (value: {state_value})")
                    return False
            
            # Check close_code
            if hasattr(websocket, 'close_code') and websocket.close_code is not None:
                print(f"🔍 B-Client: Connection has close_code {websocket.close_code}")
                return False
            
            print(f"🔍 B-Client: Connection appears to be valid")
            return True
            
        except Exception as e:
            print(f"🔍 B-Client: Error checking connection validity: {e}")
            return False
    
    def cleanup_invalid_connections(self):
        """Clean up invalid connections from all pools"""
        print(f"🧹 B-Client: Cleaning up invalid connections...")
        
        # Clean up node connections
        if hasattr(self, 'node_connections') and self.node_connections:
            for node_id, connections in list(self.node_connections.items()):
                invalid_connections = [ws for ws in connections if not self.is_connection_valid(ws)]
                for ws in invalid_connections:
                    connections.remove(ws)
                    print(f"🧹 B-Client: Removed invalid connection from node {node_id}")
                
                if not connections:
                    del self.node_connections[node_id]
                    print(f"🧹 B-Client: Removed empty node {node_id}")
        
        # Clean up user connections
        if hasattr(self, 'user_connections') and self.user_connections:
            for user_id, connections in list(self.user_connections.items()):
                invalid_connections = [ws for ws in connections if not self.is_connection_valid(ws)]
                for ws in invalid_connections:
                    connections.remove(ws)
                    print(f"🧹 B-Client: Removed invalid connection from user {user_id}")
                
                if not connections:
                    del self.user_connections[user_id]
                    print(f"🧹 B-Client: Removed empty user {user_id}")
        
        # Clean up client connections
        if hasattr(self, 'client_connections') and self.client_connections:
            for client_id, connections in list(self.client_connections.items()):
                invalid_connections = [ws for ws in connections if not self.is_connection_valid(ws)]
                for ws in invalid_connections:
                    connections.remove(ws)
                    print(f"🧹 B-Client: Removed invalid connection from client {client_id}")
                
                if not connections:
                    del self.client_connections[client_id]
                    print(f"🧹 B-Client: Removed empty client {client_id}")
        
        print(f"✅ B-Client: Invalid connections cleanup completed")
    
    def remove_invalid_connection(self, websocket):
        """Remove an invalid connection from all connection pools"""
        try:
            print(f"🧹 B-Client: Removing invalid connection from all pools...")
            
            # Remove from node_connections
            if hasattr(self, 'node_connections'):
                for node_id, connections in list(self.node_connections.items()):
                    if websocket in connections:
                        connections.remove(websocket)
                        print(f"🧹 B-Client: Removed from node {node_id}")
                        if not connections:
                            del self.node_connections[node_id]
                            print(f"🧹 B-Client: Removed empty node {node_id}")
            
            # Remove from client_connections
            if hasattr(self, 'client_connections'):
                for client_id, connections in list(self.client_connections.items()):
                    if websocket in connections:
                        connections.remove(websocket)
                        print(f"🧹 B-Client: Removed from client {client_id}")
                        if not connections:
                            del self.client_connections[client_id]
                            print(f"🧹 B-Client: Removed empty client {client_id}")
            
            # Remove from user_connections
            if hasattr(self, 'user_connections'):
                for user_id, connections in list(self.user_connections.items()):
                    if websocket in connections:
                        connections.remove(websocket)
                        print(f"🧹 B-Client: Removed from user {user_id}")
                        if not connections:
                            del self.user_connections[user_id]
                            print(f"🧹 B-Client: Removed empty user {user_id}")
            
            print(f"✅ B-Client: Invalid connection removed from all pools")
            
        except Exception as e:
            print(f"❌ B-Client: Error removing invalid connection: {e}")
    
    def find_existing_connection(self, node_id, client_id, user_id):
        """Find existing connection with the same node_id, client_id, and user_id"""
        print(f"🔍 B-Client: Finding existing connection...")
        print(f"🔍 B-Client: Node: {node_id}, Client: {client_id}, User: {user_id}")
        
        # Search in all connection pools
        if hasattr(self, 'node_connections') and self.node_connections:
            for nid, connections in self.node_connections.items():
                if nid == node_id:
                    for conn in connections:
                        if (getattr(conn, 'client_id', None) == client_id and 
                            getattr(conn, 'user_id', None) == user_id):
                            print(f"🔍 B-Client: Found existing connection in node connections")
                            return conn
        
        if hasattr(self, 'client_connections') and self.client_connections:
            if client_id in self.client_connections:
                for conn in self.client_connections[client_id]:
                    if (getattr(conn, 'node_id', None) == node_id and 
                        getattr(conn, 'user_id', None) == user_id):
                        print(f"🔍 B-Client: Found existing connection in client connections")
                        return conn
        
        if hasattr(self, 'user_connections') and self.user_connections:
            if user_id in self.user_connections:
                for conn in self.user_connections[user_id]:
                    if (getattr(conn, 'node_id', None) == node_id and 
                        getattr(conn, 'client_id', None) == client_id):
                        print(f"🔍 B-Client: Found existing connection in user connections")
                        return conn
        
        print(f"🔍 B-Client: No existing connection found")
        return None

    def remove_connection_from_all_pools(self, websocket):
        """Remove connection from all connection pools"""
        removed_from = []
        
        # Get connection info before removal
        node_id = getattr(websocket, 'node_id', 'unknown')
        user_id = getattr(websocket, 'user_id', 'unknown')
        username = getattr(websocket, 'username', 'unknown')
        
        print(f"🔌 B-Client: Connection disconnected - Node: {node_id}, User: {user_id} ({username})")
        
        # Remove from node connections pool
        if hasattr(self, 'node_connections') and self.node_connections:
            for node_id_key, connections in list(self.node_connections.items()):
                if websocket in connections:
                    connections.remove(websocket)
                    removed_from.append(f"node({node_id_key})")
                    print(f"🗑️ B-Client: Removed from node connections: {node_id_key}")
                    # Clean up empty node connection lists
                    if not connections:
                        del self.node_connections[node_id_key]
                        print(f"🗑️ B-Client: Removed empty node connection list for {node_id_key}")
                    break
        
        # Remove from user connections pool
        if hasattr(self, 'user_connections') and self.user_connections:
            for user_id_key, websockets in list(self.user_connections.items()):
                if websocket in websockets:
                    websockets.remove(websocket)
                    removed_from.append(f"user({user_id_key})")
                    print(f"🗑️ B-Client: Removed from user connections: {user_id_key}")
                    # Clean up empty user connection lists
                    if not websockets:
                        del self.user_connections[user_id_key]
                        print(f"🗑️ B-Client: Removed empty user connection list for {user_id_key}")
                    break
        
        # Remove from client connections pool
        if hasattr(self, 'client_connections') and self.client_connections:
            for client_id_key, websockets in list(self.client_connections.items()):
                if websocket in websockets:
                    websockets.remove(websocket)
                    removed_from.append(f"client({client_id_key})")
                    print(f"🗑️ B-Client: Removed from client connections: {client_id_key}")
                    # Clean up empty client connection lists
                    if not websockets:
                        del self.client_connections[client_id_key]
                        print(f"🗑️ B-Client: Removed empty client connection list for {client_id_key}")
                    break
        
        if removed_from:
            print(f"✅ B-Client: Connection cleanup completed from: {', '.join(removed_from)}")
            print(f"📊 B-Client: Remaining nodes: {list(self.node_connections.keys()) if hasattr(self, 'node_connections') else []}")
            print(f"📊 B-Client: Remaining users: {list(self.user_connections.keys()) if hasattr(self, 'user_connections') else []}")
            print(f"📊 B-Client: Remaining clients: {list(self.client_connections.keys()) if hasattr(self, 'client_connections') else []}")
        else:
            print(f"⚠️ B-Client: Connection not found in any pool")
    
    async def broadcast_to_c_clients(self, message):
        """Broadcast message to all connected C-Clients"""
        if hasattr(self, 'node_connections') and self.node_connections:
            for node_id, connections in self.node_connections.items():
                for websocket in connections:
                    try:
                        await self.send_message_to_websocket(websocket, message)
                    except Exception as e:
                        print(f"❌ B-Client: Error broadcasting to node {node_id}: {e}")
    
    async def send_error(self, websocket, error_message):
        """Send error message to websocket"""
        error_response = {
            'type': 'error',
            'message': error_message,
            'timestamp': datetime.utcnow().isoformat()
        }
        await self.send_message_to_websocket(websocket, error_response)
    
    def get_connection_info(self):
        """Get information about all connected C-Clients with dual pool support - only valid connections"""
        # Clean up invalid connections before getting info
        self.cleanup_invalid_connections()
        
        # Get node connections info - only valid connections
        node_connections_info = []
        if hasattr(self, 'node_connections') and self.node_connections:
            for node_id, connections in self.node_connections.items():
                for websocket in connections:
                    # Only include valid connections
                    if self.is_connection_valid(websocket):
                        connection_info = {
                            'node_id': node_id,
                            'user_id': getattr(websocket, 'user_id', None),
                            'client_id': getattr(websocket, 'client_id', None),
                            'username': getattr(websocket, 'username', None),
                            'domain_id': getattr(websocket, 'domain_id', None),
                            'cluster_id': getattr(websocket, 'cluster_id', None),
                            'channel_id': getattr(websocket, 'channel_id', None),
                            'remote_address': str(websocket.remote_address) if hasattr(websocket, 'remote_address') else 'unknown'
                        }
                        node_connections_info.append(connection_info)
        
        # Get node connections summary - only valid connections
        node_connections = {}
        if hasattr(self, 'node_connections') and self.node_connections:
            for node_id, connections in self.node_connections.items():
                # Filter to only valid connections
                valid_connections = [ws for ws in connections if self.is_connection_valid(ws)]
                if valid_connections:  # Only include nodes with valid connections
                    node_connections[node_id] = {
                        'connection_count': len(valid_connections),
                        'users': [getattr(ws, 'user_id', None) for ws in valid_connections],
                        'clients': [getattr(ws, 'client_id', None) for ws in valid_connections],
                        'usernames': list(set([getattr(ws, 'username', None) for ws in valid_connections if hasattr(ws, 'username')]))
                    }
        
        # Get user connections summary - only valid connections
        user_connections = {}
        if hasattr(self, 'user_connections') and self.user_connections:
            for user_id, websockets in self.user_connections.items():
                # Filter to only valid connections
                valid_websockets = [ws for ws in websockets if self.is_connection_valid(ws)]
                if valid_websockets:  # Only include users with valid connections
                    user_connections[user_id] = {
                        'connection_count': len(valid_websockets),
                        'nodes': [getattr(ws, 'node_id', None) for ws in valid_websockets if hasattr(ws, 'node_id')],
                        'clients': [getattr(ws, 'client_id', None) for ws in valid_websockets if hasattr(ws, 'client_id')],
                        'usernames': list(set([getattr(ws, 'username', None) for ws in valid_websockets if hasattr(ws, 'username')]))
                    }
        
        # Get client connections summary - only valid connections
        client_connections = {}
        if hasattr(self, 'client_connections') and self.client_connections:
            for client_id, websockets in self.client_connections.items():
                # Filter to only valid connections
                valid_websockets = [ws for ws in websockets if self.is_connection_valid(ws)]
                if valid_websockets:  # Only include clients with valid connections
                    client_connections[client_id] = {
                        'connection_count': len(valid_websockets),
                        'users': [getattr(ws, 'user_id', None) for ws in valid_websockets if hasattr(ws, 'user_id')],
                        'nodes': [getattr(ws, 'node_id', None) for ws in valid_websockets if hasattr(ws, 'node_id')],
                        'usernames': list(set([getattr(ws, 'username', None) for ws in valid_websockets if hasattr(ws, 'username')]))
                    }
        
        return {
            'total_connections': len(node_connections_info),
            'node_connections_info': node_connections_info,
            'node_connections': node_connections,
            'user_connections': user_connections,
            'client_connections': client_connections,
            'summary': {
                'total_nodes': len(node_connections),
                'total_users': len(user_connections),
                'total_clients': len(client_connections),
                'total_connections': len(node_connections_info)
            }
        }
    
    async def disconnect(self):
        """Disconnect from C-Client WebSocket server"""
        if self.websocket:
            await self.websocket.close()
            self.is_connected = False
            print("🔌 B-Client: Disconnected from C-Client WebSocket")
    
    async def send_message(self, message):
        """Send message to C-Client"""
        if self.websocket and self.is_connected:
            try:
                await self.websocket.send(json.dumps(message))
            except Exception as e:
                print(f"❌ B-Client: Error sending message to C-Client: {e}")
                self.is_connected = False
    
    async def send_message_to_websocket(self, websocket, message):
        """Send message to specific WebSocket connection"""
        try:
            await websocket.send(json.dumps(message))
        except Exception as e:
            print(f"❌ B-Client: Error sending message to WebSocket: {e}")
    
    
    async def update_cookie(self, user_id, username, cookie, auto_refresh=False):
        """Update cookie in C-Client"""
        message = {
            'type': 'cookie_update',
            'user_id': user_id,
            'username': username,
            'cookie': cookie,
            'auto_refresh': auto_refresh
        }
        # Send to all connections for this user
        await self.send_message_to_user(user_id, message)
    
    async def notify_user_login(self, user_id, username, session_data=None):
        """Notify C-Client of user login"""
        message = {
            'type': 'user_login',
            'user_id': user_id,
            'username': username,
            'session_data': session_data or {}
        }
        # Send to all connections for this user
        await self.send_message_to_user(user_id, message)
    
    async def notify_user_logout(self, user_id, username, website_root_path=None, website_name=None):
        """Notify C-Client of user logout and wait for feedback"""
        # Get NSN logout URL from environment configuration
        nsn_logout_url = self.get_nsn_logout_url()
        
        message = {
            'type': 'user_logout',
            'user_id': user_id,
            'username': username,
            'website_config': {
                'root_path': website_root_path or 'http://localhost:5000',
                'name': website_name or 'NSN'
            },
            'logout_api': {
                'url': nsn_logout_url,
                'method': 'GET',
                'description': 'NSN logout endpoint for server-side session cleanup'
            }
        }
        
        # Send to all connections for this user and wait for feedback
        await self.send_message_to_user_with_feedback(user_id, message)
    
    async def send_message_to_user_with_feedback(self, user_id, message, timeout=None):
        """Send message to user and wait for ALL feedback before cleanup - 可靠的反馈机制"""
        import asyncio
        
        print(f"📤 B-Client: Sending logout message to user {user_id} (WAITING FOR ALL FEEDBACK)...")
        
        # Get cached user connections for faster access
        user_websockets = self.get_cached_user_connections(user_id)
        
        if not user_websockets:
            print(f"⚠️ B-Client: No active connections for user {user_id}")
            return
        
        print(f"🚀 B-Client: Sending logout message to {len(user_websockets)} connections")
        
        # Send logout message in parallel to all connections
        await self.send_logout_message_parallel(user_id, message, user_websockets)
        
        # 设置反馈跟踪机制
        feedback_received = {}
        for websocket in user_websockets:
            feedback_received[websocket] = False
        
        # 存储反馈跟踪到websocket对象
        for websocket in user_websockets:
            websocket._logout_feedback_tracking = feedback_received
        
        print(f"⏳ B-Client: Waiting for logout feedback from {len(user_websockets)} connections...")
        
        # 等待所有反馈，使用更长的超时时间确保稳定性
        timeout = timeout or 10  # 10秒超时，确保所有C端都有时间响应
        start_time = asyncio.get_event_loop().time()
        check_interval = 0.1  # 100ms检查间隔
        
        while asyncio.get_event_loop().time() - start_time < timeout:
            elapsed = asyncio.get_event_loop().time() - start_time
            
            # 检查是否所有反馈都收到了
            if all(feedback_received.values()):
                print(f"✅ B-Client: All logout feedback received for user {user_id} in {elapsed:.2f}s")
                break
            
            # 显示进度
            received_count = sum(1 for received in feedback_received.values() if received)
            print(f"⏳ B-Client: Received {received_count}/{len(user_websockets)} feedbacks ({elapsed:.1f}s)")
            
            # 等待检查间隔
            await asyncio.sleep(check_interval)
        else:
            # 超时处理
            missing_feedback = [ws for ws, received in feedback_received.items() if not received]
            print(f"⚠️ B-Client: Logout feedback timeout for user {user_id} after {timeout}s")
            print(f"   Missing feedback from {len(missing_feedback)} connections")
            print(f"   Proceeding with logout completion anyway...")
        
        # 清理反馈跟踪
        for websocket in user_websockets:
            if hasattr(websocket, '_logout_feedback_tracking'):
                delattr(websocket, '_logout_feedback_tracking')
        
        print(f"🏁 B-Client: Logout notification process completed for user {user_id}")
        print(f"🔧 B-Client: All C-Client feedback received, safe to proceed with cleanup")
    
    def get_cached_user_connections(self, user_id):
        """Get cached user connections for faster access"""
        if user_id in self.connection_cache:
            # Return cached connections if still valid
            cached_connections = self.connection_cache[user_id]
            valid_connections = [conn for conn in cached_connections if self.is_connection_valid_cached(conn)]
            
            if len(valid_connections) == len(cached_connections):
                return valid_connections
            else:
                # Update cache with valid connections
                self.connection_cache[user_id] = valid_connections
                return valid_connections
        
        # Fallback to direct lookup and cache the result
        user_connections = self.user_connections.get(user_id, [])
        valid_connections = [conn for conn in user_connections if self.is_connection_valid_cached(conn)]
        self.connection_cache[user_id] = valid_connections
        return valid_connections
    
    def is_connection_valid_cached(self, websocket):
        """Check connection validity using cache"""
        websocket_id = id(websocket)
        
        # Check cache first
        if websocket_id in self.connection_validity_cache:
            cache_entry = self.connection_validity_cache[websocket_id]
            # Cache is valid for 5 seconds
            if time.time() - cache_entry['timestamp'] < 5:
                return cache_entry['valid']
        
        # Perform actual validation
        is_valid = self.is_connection_valid(websocket)
        
        # Cache the result
        self.connection_validity_cache[websocket_id] = {
            'valid': is_valid,
            'timestamp': time.time()
        }
        
        return is_valid
    
    def get_optimized_logout_timeout(self, user_id):
        """Get optimized timeout based on user logout history - NO FEEDBACK WAITING"""
        # Check if this is first logout for this user
        if not hasattr(self, 'user_logout_history'):
            self.user_logout_history = {}
        
        if user_id not in self.user_logout_history:
            # First logout - use ultra-fast timeout (just for message sending)
            self.user_logout_history[user_id] = 1
            print(f"🚀 B-Client: First logout for user {user_id} - using ultra-fast timeout")
            return self.logout_timeout_config['first_logout']
        else:
            # Subsequent logout - use ultra-fast timeout
            self.user_logout_history[user_id] += 1
            print(f"🚀 B-Client: Subsequent logout for user {user_id} - using ultra-fast timeout")
            return self.logout_timeout_config['subsequent_logout']
    
    async def send_logout_message_parallel(self, user_id, message, user_websockets):
        """Send logout message to all connections in parallel with delivery confirmation"""
        import asyncio
        
        print(f"📤 B-Client: Sending logout message in parallel to {len(user_websockets)} connections...")
        
        # Create tasks for parallel sending with delivery confirmation
        send_tasks = []
        for i, websocket in enumerate(user_websockets):
            task = asyncio.create_task(self.send_message_to_websocket_with_confirmation(websocket, message, i+1))
            send_tasks.append(task)
        
        # Wait for all messages to be sent with confirmation
        try:
            results = await asyncio.gather(*send_tasks, return_exceptions=True)
            
            # Count successful deliveries
            successful_deliveries = 0
            failed_deliveries = 0
            
            for i, result in enumerate(results):
                if isinstance(result, Exception):
                    print(f"❌ B-Client: Message delivery failed to connection {i+1}: {result}")
                    failed_deliveries += 1
                else:
                    print(f"✅ B-Client: Message delivered to connection {i+1}")
                    successful_deliveries += 1
            
            print(f"📊 B-Client: Delivery summary for user {user_id}")
            print(f"   ✅ Successful deliveries: {successful_deliveries}")
            print(f"   ❌ Failed deliveries: {failed_deliveries}")
            print(f"   📤 Total connections: {len(user_websockets)}")
            
        except Exception as e:
            print(f"⚠️ B-Client: Error in parallel message sending: {e}")
    
    async def send_message_to_websocket_with_confirmation(self, websocket, message, connection_id):
        """Send message to websocket with delivery confirmation"""
        try:
            await self.send_message_to_websocket(websocket, message)
            print(f"✅ B-Client: Message sent to connection {connection_id}")
            return True
        except Exception as e:
            print(f"❌ B-Client: Failed to send message to connection {connection_id}: {e}")
            raise e
    
    async def handle_logout_feedback(self, websocket, data, client_id, user_id):
        """Handle logout feedback from C-Client"""
        try:
            success = data.get('success', False)
            message = data.get('message', 'No message')
            timestamp = data.get('timestamp')
            immediate = data.get('immediate', False)
            feedback_client_id = data.get('client_id', 'unknown')
            
            print(f"📥 B-Client: ===== LOGOUT FEEDBACK RECEIVED =====")
            print(f"   Client ID: {client_id}")
            print(f"   Feedback Client ID: {feedback_client_id}")
            print(f"   User ID: {user_id}")
            print(f"   Success: {success}")
            print(f"   Message: {message}")
            print(f"   Immediate: {immediate}")
            print(f"   Timestamp: {timestamp}")
            
            # Find the connection index for this websocket
            user_websockets = self.user_connections.get(user_id, [])
            connection_index = None
            
            for i, ws in enumerate(user_websockets):
                if ws == websocket:
                    connection_index = i
                    break
            
            if connection_index is not None:
                print(f"✅ B-Client: Logout feedback received from connection {connection_index} for user {user_id}")
                
                # Mark this connection's feedback as received IMMEDIATELY
                if hasattr(websocket, '_logout_feedback_tracking'):
                    websocket._logout_feedback_tracking[websocket] = True
                    print(f"✅ B-Client: IMMEDIATELY marked logout feedback as received")
                    
                    # 显示当前反馈进度
                    total_connections = len(websocket._logout_feedback_tracking)
                    received_count = sum(1 for received in websocket._logout_feedback_tracking.values() if received)
                    print(f"📊 B-Client: Feedback progress: {received_count}/{total_connections} received")
                
                if success:
                    print(f"✅ B-Client: Logout completed successfully on C-Client {client_id}")
                else:
                    print(f"⚠️ B-Client: Logout failed on C-Client {client_id}: {message}")
                
                # If immediate feedback, trigger fast completion
                if immediate:
                    print(f"🚀 B-Client: Immediate feedback detected from {feedback_client_id}")
            else:
                print(f"⚠️ B-Client: Received logout feedback from unknown connection for user {user_id}")
                
        except Exception as e:
            print(f"❌ B-Client: Error handling logout feedback: {e}")
    
    async def handle_session_feedback(self, websocket, data, client_id, user_id):
        """Handle session feedback from C-Client"""
        try:
            success = data.get('success', False)
            message = data.get('message', 'No message')
            timestamp = data.get('timestamp')
            
            print(f"📥 B-Client: ===== SESSION FEEDBACK RECEIVED =====")
            print(f"   Client ID: {client_id}")
            print(f"   User ID: {user_id}")
            print(f"   Success: {success}")
            print(f"   Message: {message}")
            print(f"   Timestamp: {timestamp}")
            
            # Mark this connection's feedback as received
            if hasattr(websocket, '_session_feedback_tracking'):
                websocket._session_feedback_tracking[websocket] = True
                print(f"✅ B-Client: Marked session feedback as received for this connection")
            
            if success:
                print(f"✅ B-Client: Session processing completed successfully on C-Client {client_id}")
            else:
                print(f"⚠️ B-Client: Session processing failed on C-Client {client_id}: {message}")
                
        except Exception as e:
            print(f"❌ B-Client: Error handling session feedback: {e}")
    
    def get_nsn_logout_url(self):
        """Get NSN logout URL based on current environment"""
        config_path = os.path.join(os.path.dirname(__file__), 'config.json')
        if os.path.exists(config_path):
            with open(config_path, 'r') as f:
                config = json.load(f)
            environment = config.get('current_environment', 'local')
        else:
            environment = 'local'
        
        if environment == 'local':
            return 'http://localhost:5000/logout'
        else:
            return 'https://comp639nsn.pythonanywhere.com/logout'
    
    def get_nsn_root_url(self):
        """Get NSN root URL based on current environment"""
        config_path = os.path.join(os.path.dirname(__file__), 'config.json')
        if os.path.exists(config_path):
            with open(config_path, 'r') as f:
                config = json.load(f)
            environment = config.get('current_environment', 'local')
        else:
            environment = 'local'
        
        if environment == 'local':
            return 'http://localhost:5000/'
        else:
            return 'https://comp639nsn.pythonanywhere.com/'
    
    async def sync_session(self, user_id, session_data):
        """Sync session data with C-Client"""
        message = {
            'type': 'session_sync',
            'user_id': user_id,
            'session_data': session_data
        }
        # Send to all connections for this user
        await self.send_message_to_user(user_id, message)
    
    async def send_session_to_client(self, user_id, session_data):
        """Send session data to C-Client for auto-login"""
        try:
            # 查找该用户的WebSocket连接
            if user_id in self.user_connections:
                connections = self.user_connections[user_id]
                print(f"🔍 B-Client: Found {len(connections)} connections for user {user_id}")
                
                # 发送session数据给所有该用户的连接
                for websocket in connections:
                    try:
                        message = {
                            'type': 'auto_login',
                            'user_id': user_id,
                            'session_data': session_data,
                            'message': 'Auto-login with session data'
                        }
                        await websocket.send(json.dumps(message))
                        print(f"✅ B-Client: Session data sent to C-Client for user {user_id}")
                    except Exception as e:
                        print(f"❌ B-Client: Failed to send session to C-Client: {e}")
            else:
                print(f"⚠️ B-Client: No WebSocket connections found for user {user_id}")
                
        except Exception as e:
            print(f"❌ B-Client: Error sending session to C-Client: {e}")

# Initialize C-Client WebSocket client
c_client_ws = CClientWebSocketClient() if websockets else None

# Global flag to track if WebSocket server has been started
websocket_server_started = False

# Start WebSocket server for C-Client connections
def start_websocket_server():
    """Start WebSocket server for C-Client connections in background thread"""
    global websocket_server_started
    
    if websocket_server_started:
        print("⚠️  WebSocket server already started, skipping...")
        return
        
    if not websockets or not asyncio or not threading:
        print("⚠️  WebSocket functionality disabled - dependencies not available")
        return
        
    if not c_client_ws.config.get('enabled', True):
        print("⚠️  WebSocket server disabled in config")
        return
        
    def run_websocket_server():
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            # B-Client 作为服务器，使用配置的地址和端口
            host = c_client_ws.config.get('server_host', '0.0.0.0')
            port = c_client_ws.config.get('server_port', 8766)
            print(f"🔌 B-Client: Starting WebSocket server on {host}:{port}")
            
            # Start the server and keep it running
            server = loop.run_until_complete(c_client_ws.start_server(host=host, port=port))
            if server:
                print(f"✅ B-Client: WebSocket server started successfully on {host}:{port}")
                # Keep the server running
                loop.run_forever()
            else:
                print(f"❌ B-Client: Failed to start WebSocket server")
        except Exception as e:
            print(f"❌ B-Client: WebSocket server error: {e}")
            import traceback
            traceback.print_exc()
    
    thread = threading.Thread(target=run_websocket_server, daemon=True)
    thread.start()
    websocket_server_started = True

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
        print(f"⚠️ B-Client: Error checking WebSocket user connection: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

# NMP Bind API Endpoint
@app.route('/bind', methods=['POST'])
def bind():
    """B-Client bind API endpoint for NMP signup/login"""
    try:
        data = request.get_json()
        nmp_user_id = data.get('user_id')
        nmp_username = data.get('user_name')
        request_type = data.get('request_type', 1)  # 0=signup, 1=bind
        domain_id = data.get('domain_id', 'localhost:5000')
        node_id = data.get('node_id', 'nsn-node-001')
        auto_refresh = data.get('auto_refresh', True)
        # login_source parameter removed - using reset_logout_status in send_session_to_client instead
        provided_account = data.get('account', '')  # Account from NSN form
        provided_password = data.get('password', '')  # Password from NSN form
        nsn_session_cookie = data.get('session_cookie', '')  # Session cookie from NSN after successful login
        nsn_user_id = data.get('nsn_user_id', '')  # NSN user ID from successful login
        nsn_username = data.get('nsn_username', '')  # NSN username from successful login
        
        print(f"🔗 B-Client: ===== BIND API REQUEST =====")
        print(f"🔗 B-Client: Request timestamp: {datetime.utcnow().isoformat()}")
        print(f"🔗 B-Client: Request data: {data}")
        print(f"🔗 B-Client: nmp_user_id: {nmp_user_id}")
        print(f"🔗 B-Client: nmp_username: {nmp_username}")
        print(f"🔗 B-Client: request_type: {request_type} ({'signup' if request_type == 0 else 'logout' if request_type == 2 else 'bind'})")
        print(f"🔗 B-Client: domain_id: {domain_id}")
        print(f"🔗 B-Client: node_id: {node_id}")
        print(f"🔗 B-Client: auto_refresh: {auto_refresh}")
        # login_source logging removed
        print(f"🔗 B-Client: provided_account: {provided_account}")
        print(f"🔗 B-Client: provided_password: {'*' * len(provided_password) if provided_password else 'None'}")
        print(f"🔗 B-Client: nsn_session_cookie: {'provided' if nsn_session_cookie else 'None'}")
        print(f"🔗 B-Client: nsn_user_id: {nsn_user_id}")
        print(f"🔗 B-Client: nsn_username: {nsn_username}")
        print(f"🔗 B-Client: ===== END BIND API REQUEST =====")
        
        if not nmp_user_id or not nmp_username:
            return jsonify({
                'success': False,
                'error': 'user_id and user_name are required'
            }), 400
        
        # Handle logout request (request_type = 2)
        if request_type == 2:  # logout
            print(f"🔓 B-Client: ===== STEP 0: LOGOUT REQUEST =====")
            print(f"🔓 B-Client: Processing logout request for user {nmp_user_id}")
            print(f"🔓 B-Client: Username: {nmp_username}")
            
            try:
                # Step 1: Delete user_cookies records for this user
                print(f"🔓 B-Client: Step 1: Deleting user_cookies records...")
                deleted_cookies_count = UserCookie.query.filter_by(user_id=nmp_user_id).delete()
                db.session.commit()
                print(f"🔓 B-Client: Deleted {deleted_cookies_count} user_cookies records")
                
                # Step 2: Mark user_accounts as logged out to prevent auto-login (IMMEDIATE)
                print(f"🔓 B-Client: Step 2: Immediately marking user_accounts as logged out...")
                updated_accounts_count = UserAccount.query.filter_by(user_id=nmp_user_id).update({'logout': True})
                db.session.commit()
                print(f"🔓 B-Client: Step 2: IMMEDIATELY marked {updated_accounts_count} user_accounts records as logged out")
                
                # Force database flush to ensure changes are immediately visible
                db.session.flush()
                print(f"🔓 B-Client: Database changes flushed to ensure immediate visibility")
                
                # Step 3: Notify C-client to clear session via WebSocket
                print(f"🔓 B-Client: Step 3: Notifying C-client to clear session...")
                
                # Check if there are active connections for this user before attempting notification
                has_active_connections = False
                if hasattr(c_client_ws, 'user_connections') and c_client_ws.user_connections:
                    user_connections = c_client_ws.user_connections.get(nmp_user_id, [])
                    # Check connection status - websockets ServerConnection uses different attributes
                    active_connections = []
                    for ws in user_connections:
                        try:
                            # Try to access the connection state
                            # websockets ServerConnection uses 'close_code' and 'close_reason' to check if closed
                            if hasattr(ws, 'close_code') and ws.close_code is None:
                                active_connections.append(ws)
                            elif not hasattr(ws, 'close_code'):
                                # If no close_code attribute, assume it's still open
                                active_connections.append(ws)
                        except Exception as e:
                            print(f"⚠️ B-Client: Error checking connection status: {e}")
                            # If we can't check, assume it's closed
                            pass
                    has_active_connections = len(active_connections) > 0
                    print(f"🔍 B-Client: Checking connections for user {nmp_user_id}:")
                    print(f"   Total connections: {len(user_connections)}")
                    print(f"   Active connections: {len(active_connections)}")
                    print(f"   Has active connections: {has_active_connections}")
                
                print(f"🔓 B-Client: ===== WEBSOCKET CONNECTION POOL STATUS ======")
                print(f"🔓 B-Client: user_connections exists: {hasattr(c_client_ws, 'user_connections')}")
                if hasattr(c_client_ws, 'user_connections'):
                    print(f"🔓 B-Client: user_connections keys: {list(c_client_ws.user_connections.keys())}")
                    print(f"🔓 B-Client: user_connections total users: {len(c_client_ws.user_connections)}")
                print(f"🔓 B-Client: node_connections exists: {hasattr(c_client_ws, 'node_connections')}")
                if hasattr(c_client_ws, 'node_connections'):
                    print(f"🔓 B-Client: node_connections keys: {list(c_client_ws.node_connections.keys())}")
                    print(f"🔓 B-Client: node_connections total nodes: {len(c_client_ws.node_connections)}")
                print(f"🔓 B-Client: client_connections exists: {hasattr(c_client_ws, 'client_connections')}")
                if hasattr(c_client_ws, 'client_connections'):
                    print(f"🔓 B-Client: client_connections keys: {list(c_client_ws.client_connections.keys())}")
                    print(f"🔓 B-Client: client_connections total clients: {len(c_client_ws.client_connections)}")
                print(f"🔓 B-Client: ===== END WEBSOCKET CONNECTION POOL STATUS ======")
                
                if has_active_connections:
                    # Use app context for WebSocket operations
                    with app.app_context():
                        # Send logout notification to C-client via WebSocket
                        import asyncio
                        loop = asyncio.new_event_loop()
                        asyncio.set_event_loop(loop)
                        
                        try:
                            # Send logout notification to all C-client connections for this user
                            print(f"🔓 B-Client: ===== SENDING LOGOUT NOTIFICATION ======")
                            print(f"🔓 B-Client: Target user: {nmp_user_id}")
                            print(f"🔓 B-Client: Target username: {nmp_username}")
                            print(f"🔓 B-Client: Website: NSN (http://localhost:5000)")
                            
                            notify_result = loop.run_until_complete(c_client_ws.notify_user_logout(
                           nmp_user_id, 
                           nmp_username,
                           website_root_path='http://localhost:5000',
                           website_name='NSN'
                       ))
                            print(f"🔓 B-Client: C-client logout notification result: {notify_result}")
                            
                            if notify_result:
                                print(f"✅ B-Client: Successfully notified C-client to clear session")
                                print(f"✅ B-Client: C-Client should now disconnect WebSocket connection")
                            else:
                                print(f"⚠️ B-Client: Failed to notify C-client (notification failed)")
                                print(f"⚠️ B-Client: C-Client may not have received logout notification")
                            
                        except Exception as e:
                            print(f"❌ B-Client: Error notifying C-client: {e}")
                            print(f"❌ B-Client: Error type: {type(e)}")
                            print(f"❌ B-Client: Error details: {str(e)}")
                        finally:
                            loop.close()
                            
                            # Clean up invalid connections after logout notification is sent
                            print(f"🧹 B-Client: Cleaning up invalid connections after logout notification...")
                            c_client_ws.cleanup_invalid_connections()
                            print(f"✅ B-Client: Invalid connections cleanup completed after logout notification")
                else:
                    print(f"⚠️ B-Client: No active C-client connections found for user {nmp_user_id}")
                    print(f"ℹ️ B-Client: Skipping logout notification (user may have already disconnected)")
                    
                    # Clean up invalid connections even if no notification was sent
                    print(f"🧹 B-Client: Cleaning up invalid connections (no notification sent)...")
                    c_client_ws.cleanup_invalid_connections()
                    print(f"✅ B-Client: Invalid connections cleanup completed (no notification sent)")
                
                # Step 4: Clear any remaining session data to prevent auto-login
                print(f"🔓 B-Client: Step 4: Clearing remaining session data to prevent auto-login...")
                try:
                    # Clear any remaining cookies for this user
                    remaining_cookies = UserCookie.query.filter_by(user_id=nmp_user_id).all()
                    for cookie in remaining_cookies:
                        db.session.delete(cookie)
                    db.session.commit()
                    print(f"🔓 B-Client: Cleared {len(remaining_cookies)} remaining cookies")
                except Exception as e:
                    print(f"⚠️ B-Client: Error clearing remaining cookies: {e}")
                
                # Step 5: Clear WebSocket connection pool to prevent cached session data
                print(f"🔓 B-Client: Step 5: Clearing WebSocket connection pool to prevent cached session data...")
                try:
                    # Clear user from all connection pools to prevent cached session data
                    if hasattr(c_client_ws, 'user_connections') and nmp_user_id in c_client_ws.user_connections:
                        user_connections = c_client_ws.user_connections[nmp_user_id]
                        print(f"🔓 B-Client: Found {len(user_connections)} connections for user {nmp_user_id}")
                        print(f"🔓 B-Client: WebSocket connection details:")
                        for i, ws in enumerate(user_connections):
                            print(f"   Connection {i+1}: {type(ws)}")
                            print(f"   Connection {i+1}: close_code = {getattr(ws, 'close_code', 'N/A')}")
                            print(f"   Connection {i+1}: closed = {getattr(ws, 'closed', 'N/A')}")
                            print(f"   Connection {i+1}: state = {getattr(ws, 'state', 'N/A')}")
                        
                        # FIXED: Mark connections as closed by logout AFTER logout notification is sent
                        print(f"🔓 B-Client: Marking WebSocket connections as closed by logout for user {nmp_user_id}...")
                        for i, ws in enumerate(user_connections):
                            try:
                                print(f"🔓 B-Client: Marking connection {i+1} as closed by logout")
                                print(f"🔓 B-Client: Connection {i+1} state: {getattr(ws, 'state', 'N/A')}")
                                
                                # Mark the connection as closed by logout
                                ws._closed_by_logout = True
                                
                                # FIXED: Clear connection cache to prevent stale connections
                                websocket_id = id(ws)
                                if hasattr(c_client_ws, 'connection_validity_cache') and websocket_id in c_client_ws.connection_validity_cache:
                                    del c_client_ws.connection_validity_cache[websocket_id]
                                    print(f"🧹 B-Client: Cleared connection validity cache for connection {i+1}")
                                
                                print(f"✅ B-Client: Connection {i+1} marked as closed by logout")
                                
                            except Exception as e:
                                print(f"❌ B-Client: Error marking connection {i+1}: {e}")
                        
                        # FIXED: Remove user from connection pools BEFORE cleanup to prevent stale connections
                        if nmp_user_id in c_client_ws.user_connections:
                            del c_client_ws.user_connections[nmp_user_id]
                            print(f"🔓 B-Client: Immediately removed user {nmp_user_id} from user_connections pool")
                        
                        # FIXED: Clear user connection cache to prevent stale connections
                        if hasattr(c_client_ws, 'connection_cache') and nmp_user_id in c_client_ws.connection_cache:
                            del c_client_ws.connection_cache[nmp_user_id]
                            print(f"🧹 B-Client: Cleared user connection cache for user {nmp_user_id}")
                        
                        # Clean up invalid connections after removing from pools
                        print(f"🧹 B-Client: Cleaning up invalid connections after removing user from pools...")
                        c_client_ws.cleanup_invalid_connections()
                        print(f"✅ B-Client: Invalid connections cleanup completed after removing user from pools")
                        
                        # Wait a moment for the close to propagate
                        print(f"🔓 B-Client: Waiting for WebSocket close to propagate...")
                        time.sleep(1.0)  # Wait 1 second for close to propagate
                        print(f"🔓 B-Client: WebSocket close propagation wait completed")
                    
                    # Also clear from node_connections if needed
                    if hasattr(c_client_ws, 'node_connections'):
                        nodes_to_remove = []
                        for node_id, connections in c_client_ws.node_connections.items():
                            connections_to_remove = []
                            for ws in connections:
                                if hasattr(ws, 'user_id') and ws.user_id == nmp_user_id:
                                    connections_to_remove.append(ws)
                            
                            for ws in connections_to_remove:
                                connections.remove(ws)
                                print(f"🔓 B-Client: Removed user {nmp_user_id} connection from node {node_id}")
                            
                            # If no connections left for this node, mark for removal
                            if not connections:
                                nodes_to_remove.append(node_id)
                        
                        # Remove empty node connections
                        for node_id in nodes_to_remove:
                            del c_client_ws.node_connections[node_id]
                            print(f"🔓 B-Client: Removed empty node {node_id} from node_connections")
                    
                    # Clear from client_connections if needed
                    if hasattr(c_client_ws, 'client_connections'):
                        clients_to_remove = []
                        for client_id, connections in c_client_ws.client_connections.items():
                            connections_to_remove = []
                            for ws in connections:
                                if hasattr(ws, 'user_id') and ws.user_id == nmp_user_id:
                                    connections_to_remove.append(ws)
                            
                            for ws in connections_to_remove:
                                connections.remove(ws)
                                print(f"🔓 B-Client: Removed user {nmp_user_id} connection from client {client_id}")
                            
                            # If no connections left for this client, mark for removal
                            if not connections:
                                clients_to_remove.append(client_id)
                        
                        # Remove empty client connections
                        for client_id in clients_to_remove:
                            del c_client_ws.client_connections[client_id]
                            print(f"🔓 B-Client: Removed empty client {client_id} from client_connections")
                    
                    print(f"✅ B-Client: WebSocket connection pool cleared for user {nmp_user_id}")
                    
                    # Verify connection pool cleanup
                    print(f"🔓 B-Client: ===== POST-CLEANUP WEBSOCKET CONNECTION POOL STATUS ======")
                    print(f"🔓 B-Client: user_connections exists: {hasattr(c_client_ws, 'user_connections')}")
                    if hasattr(c_client_ws, 'user_connections'):
                        print(f"🔓 B-Client: user_connections keys: {list(c_client_ws.user_connections.keys())}")
                        print(f"🔓 B-Client: user_connections total users: {len(c_client_ws.user_connections)}")
                        if nmp_user_id in c_client_ws.user_connections:
                            print(f"❌ B-Client: ERROR: User {nmp_user_id} still in user_connections after cleanup!")
                        else:
                            print(f"✅ B-Client: User {nmp_user_id} successfully removed from user_connections")
                    print(f"🔓 B-Client: node_connections exists: {hasattr(c_client_ws, 'node_connections')}")
                    if hasattr(c_client_ws, 'node_connections'):
                        print(f"🔓 B-Client: node_connections keys: {list(c_client_ws.node_connections.keys())}")
                        print(f"🔓 B-Client: node_connections total nodes: {len(c_client_ws.node_connections)}")
                    print(f"🔓 B-Client: client_connections exists: {hasattr(c_client_ws, 'client_connections')}")
                    if hasattr(c_client_ws, 'client_connections'):
                        print(f"🔓 B-Client: client_connections keys: {list(c_client_ws.client_connections.keys())}")
                        print(f"🔓 B-Client: client_connections total clients: {len(c_client_ws.client_connections)}")
                    print(f"🔓 B-Client: ===== END POST-CLEANUP WEBSOCKET CONNECTION POOL STATUS ======")
                    
                except Exception as e:
                    print(f"⚠️ B-Client: Error clearing WebSocket connection pool: {e}")
                
                # Step 6: Clear B-Client internal session cache to prevent auto-login
                print(f"🔓 B-Client: Step 6: Clearing B-Client internal session cache to prevent auto-login...")
                try:
                    # Clear any cached session data for this user
                    if hasattr(c_client_ws, 'user_sessions'):
                        if nmp_user_id in c_client_ws.user_sessions:
                            del c_client_ws.user_sessions[nmp_user_id]
                            print(f"🔓 B-Client: Cleared cached session data for user {nmp_user_id}")
                    
                    # Clear any cached cookie data for this user
                    if hasattr(c_client_ws, 'user_cookies'):
                        if nmp_user_id in c_client_ws.user_cookies:
                            del c_client_ws.user_cookies[nmp_user_id]
                            print(f"🔓 B-Client: Cleared cached cookie data for user {nmp_user_id}")
                    
                    # Clear any cached auto-login data for this user
                    if hasattr(c_client_ws, 'auto_login_cache'):
                        if nmp_user_id in c_client_ws.auto_login_cache:
                            del c_client_ws.auto_login_cache[nmp_user_id]
                            print(f"🔓 B-Client: Cleared cached auto-login data for user {nmp_user_id}")
                    
                    print(f"✅ B-Client: B-Client internal session cache cleared for user {nmp_user_id}")
                    
                except Exception as e:
                    print(f"⚠️ B-Client: Error clearing B-Client internal session cache: {e}")
                
                # Step 6: Return success response
                print(f"✅ B-Client: ===== LOGOUT SUCCESS =====")
                print(f"✅ B-Client: User {nmp_user_id} logged out successfully")
                print(f"✅ B-Client: Deleted {deleted_cookies_count} cookies, preserved accounts")
                
                return jsonify({
                    'success': True,
                    'message': 'User logged out successfully',
                    'cleared_count': deleted_cookies_count,
                    'c_client_notified': True,
                    'user_id': nmp_user_id,
                    'username': nmp_username
                })
                
            except Exception as e:
                print(f"❌ B-Client: Error during logout process: {e}")
                import traceback
                traceback.print_exc()
                return jsonify({
                    'success': False,
                    'error': f'Logout failed: {str(e)}'
                }), 500
        
        # 0. 处理NSN已经登录成功的情况（新流程）
        if nsn_session_cookie and nsn_user_id and nsn_username:
            print(f"🔐 B-Client: ===== STEP 0: NSN SESSION PROVIDED =====")
            print(f"🔐 B-Client: Processing NSN session provided after successful login")
            print(f"🔐 B-Client: NSN user ID: {nsn_user_id}, Username: {nsn_username}")
            
            # 重置logout状态，允许用户重新登录
            print(f"🔄 B-Client: ===== RESETTING LOGOUT STATUS =====")
            try:
                updated_accounts = UserAccount.query.filter_by(
                    user_id=nmp_user_id,
                    website='nsn'
                ).update({'logout': False})
                db.session.commit()
                print(f"✅ B-Client: Reset logout status for {updated_accounts} user_accounts records")
            except Exception as e:
                print(f"⚠️ B-Client: Failed to reset logout status: {e}")
            
            # 保存session到user_cookies（复用save_cookie_to_db函数）
            print(f"💾 B-Client: ===== SAVING SESSION TO DATABASE =====")
            try:
                save_cookie_to_db(nmp_user_id, nsn_username, nsn_session_cookie, node_id, auto_refresh, nsn_user_id, nsn_username)
                print(f"✅ B-Client: Session saved to database successfully")
            except Exception as e:
                print(f"❌ B-Client: Failed to save session to database: {e}")
                return jsonify({
                    'success': False,
                    'error': 'Failed to save session to database'
                }), 500
            
            # 发送给C-Client（复用send_session_to_client函数）
            print(f"📤 B-Client: ===== SENDING SESSION TO C-CLIENT =====")
            try:
                import asyncio
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                
                # 预处理session数据（复用现有逻辑）
                session_data_json = {
                    'loggedin': True,
                    'user_id': nsn_user_id,
                    'username': nsn_username,
                    'role': 'traveller',
                    'nmp_user_id': nmp_user_id,
                    'nmp_username': nmp_username,
                    'nmp_client_type': 'c-client',
                    'nmp_timestamp': str(int(time.time() * 1000))
                }
                processed_session = json.dumps(session_data_json)
                
                send_result = loop.run_until_complete(send_session_to_client(
                    nmp_user_id, 
                    processed_session, 
                    nsn_user_id, 
                    nsn_username,
                    website_root_path='http://localhost:5000',
                    website_name='NSN',
                    session_partition='persist:nsn',
                    reset_logout_status=True  # Manual login should reset logout status
                ))
                print(f"📤 B-Client: Session send result: {send_result}")
                print(f"✅ B-Client: Session sent to C-Client for user {nmp_user_id}")
            except Exception as e:
                print(f"⚠️ B-Client: Failed to send session to C-Client: {e}")
            
            response_data = {
                'success': True,
                'login_success': True,
                'complete_session_data': nsn_session_cookie,
                'message': 'NSN session saved and sent to C-Client'
            }
            print(f"📤 B-Client: ===== RETURNING RESPONSE =====")
            print(f"📤 B-Client: Response data: {response_data}")
            return jsonify(response_data)
        
        # 1. 查询 user_cookies
        print(f"🔍 B-Client: ===== STEP 1: CHECKING USER_COOKIES =====")
        print(f"🔍 B-Client: Querying user_cookies table for user_id='{nmp_user_id}', username='{nmp_username}'")
        
        existing_cookie = UserCookie.query.filter_by(
            user_id=nmp_user_id, 
            username=nmp_username
        ).first()
        
        if existing_cookie:
            print(f"✅ B-Client: ===== EXISTING COOKIE FOUND =====")
            print(f"✅ B-Client: Cookie record found for user {nmp_user_id}")
            print(f"✅ B-Client: Cookie ID: {existing_cookie.user_id}")
            print(f"✅ B-Client: Cookie username: {existing_cookie.username}")
            print(f"✅ B-Client: Cookie node_id: {existing_cookie.node_id}")
            print(f"✅ B-Client: Cookie auto_refresh: {existing_cookie.auto_refresh}")
            print(f"✅ B-Client: Cookie create_time: {existing_cookie.create_time}")
            print(f"✅ B-Client: Cookie refresh_time: {existing_cookie.refresh_time}")
            print(f"✅ B-Client: Cookie data length: {len(existing_cookie.cookie) if existing_cookie.cookie else 0}")
            print(f"✅ B-Client: Cookie data preview: {existing_cookie.cookie[:100]}...")
            
            # 发送 session 给 C-Client
            print(f"📤 B-Client: ===== SENDING SESSION TO C-CLIENT =====")
            print(f"📤 B-Client: Attempting to send session to C-Client for user {nmp_user_id}")
            try:
                import asyncio
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                # For existing cookies, we need to extract NSN user info from the cookie
                # The cookie contains the NSN username, we need to query for user_id
                nsn_username = existing_cookie.username  # This is the NSN username
                print(f"📤 B-Client: NSN username from cookie: {nsn_username}")
                
                # Query NSN to get the user_id for this username
                try:
                    nsn_user_info = nsn_client.query_user_info(nsn_username)
                    if nsn_user_info.get('success'):
                        nsn_user_id = nsn_user_info.get('user_id')
                        print(f"📤 B-Client: NSN user info - ID: {nsn_user_id}, Username: {nsn_username}")
                    else:
                        print(f"⚠️ B-Client: Failed to get NSN user info for {nsn_username}")
                        nsn_user_id = None
                except Exception as e:
                    print(f"⚠️ B-Client: Error querying NSN user info: {e}")
                    nsn_user_id = None
                
                send_result = loop.run_until_complete(send_session_to_client(
                    nmp_user_id, 
                    existing_cookie.cookie, 
                    nsn_user_id, 
                    nsn_username,
                    website_root_path='http://localhost:5000',
                    website_name='NSN',
                    session_partition='persist:nsn',
                    reset_logout_status=True  # Manual login should reset logout status
                ))
                print(f"📤 B-Client: Session send result: {send_result}")
                print(f"✅ B-Client: Session sent to C-Client for user {nmp_user_id}")
            except Exception as e:
                print(f"⚠️ B-Client: Failed to send session to C-Client: {e}")
                import traceback
                traceback.print_exc()
            
            response_data = {
                'success': True,
                'login_success': True,
                'complete_session_data': existing_cookie.cookie,
                'message': 'Existing session found and sent to C-Client'
            }
            print(f"📤 B-Client: ===== RETURNING RESPONSE =====")
            print(f"📤 B-Client: Response data: {response_data}")
            return jsonify(response_data)
        else:
            print(f"❌ B-Client: No existing cookie found for user {nmp_user_id}")
            print(f"🔍 B-Client: ===== END STEP 1: NO COOKIE FOUND =====")
        
        # 2. 处理NSN表单登录（如果提供了账号密码）
        if provided_account and provided_password:
            print(f"🔐 B-Client: ===== STEP 2: NSN FORM LOGIN =====")
            print(f"🔐 B-Client: Processing NSN form login with provided credentials")
            print(f"🔐 B-Client: Account: {provided_account}")
            
            # 使用提供的账号密码尝试登录NSN
            nmp_params = {
                'nmp_user_id': nmp_user_id,
                'nmp_username': nmp_username,
                'nmp_client_type': 'c-client',
                'nmp_timestamp': str(int(time.time() * 1000)),
                'nmp_injected': 'true'  # 添加这个参数让NSN识别为B-Client请求
            }
            
            print(f"🔐 B-Client: Attempting NSN login with provided credentials...")
            login_result = nsn_client.login_with_nmp(provided_account, provided_password, nmp_params)
            print(f"🔐 B-Client: NSN login result: {login_result}")
            
            if login_result['success']:
                print(f"✅ B-Client: ===== NSN FORM LOGIN SUCCESSFUL =====")
                print(f"✅ B-Client: NSN login successful for user {nmp_user_id}")
                
                # 提取NSN用户信息
                nsn_user_id = login_result.get('user_info', {}).get('user_id')
                nsn_username = login_result.get('user_info', {}).get('username')
                print(f"💾 B-Client: NSN user info - ID: {nsn_user_id}, Username: {nsn_username}")
                
                # 如果NSN用户信息为空，使用NMP用户信息作为fallback
                if not nsn_username:
                    nsn_username = nmp_username
                    print(f"💾 B-Client: Using NMP username as fallback: {nsn_username}")
                if not nsn_user_id:
                    nsn_user_id = nmp_user_id
                    print(f"💾 B-Client: Using NMP user_id as fallback: {nsn_user_id}")
                
                # 保存session到user_cookies（复用save_cookie_to_db函数）
                print(f"💾 B-Client: ===== SAVING SESSION TO DATABASE =====")
                try:
                    save_cookie_to_db(nmp_user_id, nsn_username, login_result['session_cookie'], node_id, auto_refresh, nsn_user_id, nsn_username)
                    print(f"✅ B-Client: Session saved to database successfully")
                except Exception as e:
                    print(f"❌ B-Client: Failed to save session to database: {e}")
                
                # 发送给C-Client（复用send_session_to_client函数）
                print(f"📤 B-Client: ===== SENDING SESSION TO C-CLIENT =====")
                try:
                    import asyncio
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    
                    # 预处理session数据（复用现有逻辑）
                    session_data_json = {
                        'loggedin': True,
                        'user_id': nsn_user_id,
                        'username': nsn_username,
                        'role': 'traveller',
                        'nmp_user_id': nmp_user_id,
                        'nmp_username': nmp_username,
                        'nmp_client_type': 'c-client',
                        'nmp_timestamp': str(int(time.time() * 1000))
                    }
                    processed_session = json.dumps(session_data_json)
                    
                    send_result = loop.run_until_complete(send_session_to_client(
                        nmp_user_id, 
                        processed_session, 
                        nsn_user_id, 
                        nsn_username,
                        website_root_path='http://localhost:5000',
                        website_name='NSN',
                        session_partition='persist:nsn',
                        reset_logout_status=True  # Manual login should reset logout status
                    ))
                    print(f"📤 B-Client: Session send result: {send_result}")
                    print(f"✅ B-Client: Session sent to C-Client for user {nmp_user_id}")
                except Exception as e:
                    print(f"⚠️ B-Client: Failed to send session to C-Client: {e}")
                
                # 注意：不保存账号密码到user_accounts表（按设计要求）
                print(f"ℹ️ B-Client: Skipping account save to user_accounts (as per design requirements)")
                
                response_data = {
                    'success': True,
                    'login_success': True,
                    'complete_session_data': login_result['session_cookie'],
                    'message': 'NSN form login successful and session sent to C-Client'
                }
                print(f"📤 B-Client: ===== RETURNING RESPONSE =====")
                print(f"📤 B-Client: Response data: {response_data}")
                return jsonify(response_data)
            else:
                print(f"❌ B-Client: ===== NSN FORM LOGIN FAILED =====")
                print(f"❌ B-Client: NSN login failed for user {nmp_user_id}: {login_result.get('error')}")
                error_response = {
                    'success': False,
                    'error': 'Wrong account or password, please try again or sign up with NMP'
                }
                print(f"📤 B-Client: ===== RETURNING ERROR RESPONSE =====")
                print(f"📤 B-Client: Error response: {error_response}")
                return jsonify(error_response), 400

        # 2. 查询 user_accounts
        print(f"🔍 B-Client: ===== STEP 2: CHECKING USER_ACCOUNTS =====")
        print(f"🔍 B-Client: Querying user_accounts table for user_id='{nmp_user_id}', website='nsn'")
        
        # Logout status will be reset in send_session_to_client function when reset_logout_status=True
        # For manual login, don't filter by logout status since we will reset it
        # For auto-login (WebSocket registration), we should filter by logout=False
        if request_type == 1:  # Manual login or C-Client reconnection - don't filter by logout
            existing_account = UserAccount.query.filter_by(
                user_id=nmp_user_id,
                website='nsn'
            ).first()
        else:  # Auto-login - filter by logout status
            existing_account = UserAccount.query.filter_by(
                user_id=nmp_user_id,
                website='nsn',
                logout=False  # Skip logged out accounts
            ).first()
        
        if existing_account:
            print(f"✅ B-Client: ===== EXISTING ACCOUNT FOUND =====")
            print(f"✅ B-Client: Account record found for user {nmp_user_id}")
            print(f"✅ B-Client: Account ID: {existing_account.user_id}")
            print(f"✅ B-Client: Account username: {existing_account.username}")
            print(f"✅ B-Client: Account website: {existing_account.website}")
            print(f"✅ B-Client: Account account: {existing_account.account}")
            print(f"✅ B-Client: Account email: {existing_account.email}")
            print(f"✅ B-Client: Account first_name: {existing_account.first_name}")
            print(f"✅ B-Client: Account last_name: {existing_account.last_name}")
            print(f"✅ B-Client: Account location: {existing_account.location}")
            print(f"✅ B-Client: Account registration_method: {existing_account.registration_method}")
            print(f"✅ B-Client: Account auto_generated: {existing_account.auto_generated}")
            print(f"✅ B-Client: Account create_time: {existing_account.create_time}")
            print(f"✅ B-Client: Account password length: {len(existing_account.password) if existing_account.password else 0}")
            
            # 检查是否有有效的NSN凭据
            print(f"🔐 B-Client: ===== CHECKING NSN CREDENTIALS =====")
            print(f"🔐 B-Client: Account: {existing_account.account}")
            print(f"🔐 B-Client: Password length: {len(existing_account.password) if existing_account.password else 0}")
            
            # 检查是否有有效的NSN凭据
            if not existing_account.password or len(existing_account.password) == 0:
                print(f"❌ B-Client: ===== NO VALID NSN CREDENTIALS =====")
                print(f"❌ B-Client: User {nmp_user_id} has no valid NSN credentials")
                print(f"❌ B-Client: This user needs to sign up with NMP first")
                error_response = {
                    'success': False,
                    'error': 'No valid NSN credentials found. Please sign up with NMP first.'
                }
                print(f"📤 B-Client: ===== RETURNING ERROR RESPONSE =====")
                print(f"📤 B-Client: Error response: {error_response}")
                return jsonify(error_response), 400
            
            # 使用 account/password 登录 NSN
            print(f"🔐 B-Client: ===== ATTEMPTING NSN LOGIN =====")
            print(f"🔐 B-Client: Using existing account to login to NSN")
            print(f"🔐 B-Client: Login account: {existing_account.account}")
            
            nmp_params = {
                'nmp_user_id': nmp_user_id,
                'nmp_username': nmp_username,
                'nmp_client_type': 'c-client',
                'nmp_timestamp': str(int(time.time() * 1000)),
                'nmp_injected': 'true'  # 添加这个参数让NSN识别为B-Client请求
            }
            print(f"🔐 B-Client: NMP parameters: {nmp_params}")
            
            print(f"🔐 B-Client: Calling nsn_client.login_with_nmp()...")
            print(f"🔍 B-Client: Login credentials - username: {existing_account.account}, password length: {len(existing_account.password) if existing_account.password else 0}")
            print(f"🔍 B-Client: NMP parameters: {nmp_params}")
            login_result = nsn_client.login_with_nmp(
                existing_account.account,
                existing_account.password,
                nmp_params
            )
            print(f"🔐 B-Client: NSN login result: {login_result}")
            
            if login_result['success']:
                print(f"✅ B-Client: ===== NSN LOGIN SUCCESSFUL =====")
                print(f"✅ B-Client: NSN login successful for user {nmp_user_id}")
                print(f"✅ B-Client: Session cookie length: {len(login_result['session_cookie']) if login_result.get('session_cookie') else 0}")
                print(f"✅ B-Client: Session cookie preview: {login_result['session_cookie'][:100] if login_result.get('session_cookie') else 'None'}...")
                
                # Extract NSN user info from login result
                nsn_user_id = login_result.get('user_info', {}).get('user_id')
                nsn_username = login_result.get('user_info', {}).get('username')
                print(f"💾 B-Client: NSN user info - ID: {nsn_user_id}, Username: {nsn_username}")
                
                # 如果NSN用户信息为空，使用NMP用户信息作为fallback
                if not nsn_username:
                    nsn_username = nmp_username
                    print(f"💾 B-Client: Using NMP username as fallback: {nsn_username}")
                if not nsn_user_id:
                    nsn_user_id = nmp_user_id
                    print(f"💾 B-Client: Using NMP user_id as fallback: {nsn_user_id}")
                
                # 重置logout状态，允许用户重新登录
                print(f"🔄 B-Client: ===== RESETTING LOGOUT STATUS =====")
                try:
                    updated_accounts = UserAccount.query.filter_by(
                        user_id=nmp_user_id,
                        website='nsn'
                    ).update({'logout': False})
                    db.session.commit()
                    print(f"✅ B-Client: Reset logout status for {updated_accounts} user_accounts records")
                except Exception as e:
                    print(f"⚠️ B-Client: Failed to reset logout status: {e}")
                
                # 保存 session 到 user_cookies（预处理后保存）
                print(f"💾 B-Client: ===== SAVING SESSION TO DATABASE =====")
                print(f"💾 B-Client: Saving preprocessed session cookie to user_cookies table")
                try:
                    save_cookie_to_db(nmp_user_id, nsn_username, login_result['session_cookie'], node_id, auto_refresh, nsn_user_id, nsn_username)
                    print(f"✅ B-Client: Session saved to database successfully")
                except Exception as e:
                    print(f"❌ B-Client: Failed to save session to database: {e}")
                    import traceback
                    traceback.print_exc()
                
                # 发送给 C-Client
                print(f"📤 B-Client: ===== SENDING SESSION TO C-CLIENT =====")
                print(f"📤 B-Client: Attempting to send session to C-Client for user {nmp_user_id}")
                try:
                    import asyncio
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    
                    # 预处理 session 数据
                    session_data_json = {
                        'loggedin': True,
                        'user_id': nsn_user_id,
                        'username': nsn_username,
                        'role': 'traveller',
                        'nmp_user_id': nmp_user_id,
                        'nmp_username': nmp_username,
                        'nmp_client_type': 'c-client',
                        'nmp_timestamp': str(int(time.time() * 1000))
                    }
                    processed_session = json.dumps(session_data_json)
                    
                    send_result = loop.run_until_complete(send_session_to_client(nmp_user_id, processed_session, nsn_user_id, nsn_username, reset_logout_status=True))  # Manual login should reset logout status
                    print(f"📤 B-Client: Session send result: {send_result}")
                    print(f"✅ B-Client: Session sent to C-Client for user {nmp_user_id}")
                except Exception as e:
                    print(f"⚠️ B-Client: Failed to send session to C-Client: {e}")
                    import traceback
                    traceback.print_exc()
                
                response_data = {
                    'success': True,
                    'login_success': True,
                    'complete_session_data': login_result['session_cookie'],
                    'message': 'Logged in with existing account and session sent to C-Client'
                }
                print(f"📤 B-Client: ===== RETURNING RESPONSE =====")
                print(f"📤 B-Client: Response data: {response_data}")
                return jsonify(response_data)
            else:
                print(f"❌ B-Client: ===== NSN LOGIN FAILED =====")
                print(f"❌ B-Client: NSN login failed for user {nmp_user_id}: {login_result.get('error')}")
                print(f"🔍 B-Client: ===== END STEP 2: LOGIN FAILED =====")
        else:
            print(f"❌ B-Client: No existing account found for user {nmp_user_id}")
            print(f"🔍 B-Client: ===== END STEP 2: NO ACCOUNT FOUND =====")
        
        # 3. 调用 NSN 注册接口
        if request_type == 0:  # signup
            print(f"🆕 B-Client: ===== STEP 3: SIGNUP WITH NMP =====")
            print(f"🆕 B-Client: Processing signup request for user {nmp_user_id}")
            
            # 1. 检查user_accounts表是否已有账号
            print(f"🔍 B-Client: ===== CHECKING EXISTING ACCOUNT =====")
            existing_account = UserAccount.query.filter_by(
                user_id=nmp_user_id,
                website='nsn'
            ).first()
            
            if existing_account:
                print(f"✅ B-Client: Found existing account for user {nmp_user_id}")
                print(f"✅ B-Client: Account username: {existing_account.nsn_username}")
                print(f"✅ B-Client: Account password length: {len(existing_account.password)}")
                
                # 使用现有账号信息
                unique_username = existing_account.nsn_username
                generated_password = existing_account.password
            else:
                print(f"🆕 B-Client: No existing account found, creating new account")
                
                # 生成新的用户名和密码
                # NSN要求用户名只能包含字母和数字，不能包含下划线
                unique_username = f"{nmp_username}{int(time.time())}"
                # 生成符合NSN密码要求的密码：至少8位，包含大小写字母、数字和特殊字符
                import random
                import string
                
                # 确保密码包含所有必需字符类型
                uppercase = random.choice(string.ascii_uppercase)
                lowercase = random.choice(string.ascii_lowercase)
                digit = random.choice(string.digits)
                special = random.choice('@#$%^&+=!')
                
                # 生成其余字符
                remaining_chars = ''.join(random.choices(
                    string.ascii_letters + string.digits + '@#$%^&+=!', 
                    k=8
                ))
                
                # 组合所有字符并打乱顺序
                password_chars = list(uppercase + lowercase + digit + special + remaining_chars)
                random.shuffle(password_chars)
                generated_password = ''.join(password_chars)
            
            # 准备注册数据
            signup_data = {
                'username': unique_username,
                'email': f"{nmp_username}@nomorepassword.local",
                'first_name': nmp_username.split('-')[0] if '-' in nmp_username else nmp_username,
                'last_name': 'NMP User',
                'location': 'Unknown',
                'password': generated_password,
                'confirm_password': generated_password  # 添加确认密码字段
            }
            
            # 保存新账号到数据库
            print(f"💾 B-Client: ===== SAVING NEW ACCOUNT TO DATABASE =====")
            try:
                save_account_to_db(nmp_user_id, nmp_username, unique_username, generated_password, signup_data)
                print(f"✅ B-Client: New account saved to database successfully")
            except Exception as e:
                print(f"❌ B-Client: Failed to save new account to database: {e}")
                import traceback
                traceback.print_exc()
                return jsonify({
                    'success': False,
                    'error': 'Failed to create account'
                }), 500
            
            # 2. 尝试向NSN注册（fire-and-forget）
            print(f"🆕 B-Client: ===== ATTEMPTING NSN REGISTRATION =====")
            print(f"🆕 B-Client: Username: {unique_username}")
            print(f"🆕 B-Client: Password: {generated_password[:3]}...")
            
            # 准备注册数据
            signup_data = {
                'username': unique_username,
                'email': f"{nmp_username}@nomorepassword.local",
                'first_name': nmp_username.split('-')[0] if '-' in nmp_username else nmp_username,
                'last_name': 'NMP User',
                'location': 'Unknown',
                'password': generated_password,
                'confirm_password': generated_password  # 添加确认密码字段
            }
            
            # 准备 NMP 参数
            nmp_params = {
                'nmp_user_id': nmp_user_id,
                'nmp_username': nmp_username,
                'nmp_client_type': 'c-client',
                'nmp_timestamp': str(int(time.time() * 1000)),
                'nmp_injected': 'true'  # 添加这个参数让NSN识别为B-Client请求
            }
            
            # 发送NSN注册请求（fire-and-forget）
            try:
                import requests
                signup_url = "http://localhost:5000/signup"
                response = requests.post(signup_url, data=signup_data, timeout=5, allow_redirects=False)
                print(f"🆕 B-Client: NSN registration request sent (status: {response.status_code})")
            except Exception as e:
                print(f"⚠️ B-Client: NSN registration request failed (expected): {e}")
            
            # 3. 假设NSN注册成功，立即进行登录
            print("✅ B-Client: Assuming NSN registration successful, proceeding with login...")
            
            # 验证用户是否真的在NSN数据库中创建了
            print(f"🔍 B-Client: ===== VERIFYING USER CREATION IN NSN =====")
            try:
                # 尝试通过NSN的API查询用户信息
                user_info_url = f"http://localhost:5000/api/user-info"
                user_info_data = {"username": unique_username}
                user_info_response = requests.post(user_info_url, json=user_info_data, timeout=10)
                
                if user_info_response.status_code == 200:
                    user_info = user_info_response.json()
                    if user_info.get('success'):
                        print(f"✅ B-Client: User {unique_username} confirmed in NSN database (ID: {user_info.get('user_id')})")
                    else:
                        print(f"⚠️ B-Client: User {unique_username} not found in NSN database yet")
                        print(f"⚠️ B-Client: Proceeding with login attempt anyway...")
                else:
                    print(f"⚠️ B-Client: Failed to verify user creation: {user_info_response.status_code}")
                    print(f"⚠️ B-Client: Proceeding with login attempt anyway...")
            except Exception as e:
                print(f"⚠️ B-Client: Error verifying user creation: {e}")
                print(f"⚠️ B-Client: Proceeding with login attempt anyway...")
            
            # 4. 尝试登录到NSN
            print(f"🔐 B-Client: ===== ATTEMPTING NSN LOGIN =====")
            print(f"🔐 B-Client: Attempting to login with username: {unique_username}")
            print(f"🔐 B-Client: Password length: {len(generated_password)}")
            print(f"🔐 B-Client: Password preview: {generated_password[:3]}...")
            
            try:
                # 准备登录数据
                login_data = {
                    'username': unique_username,
                    'password': generated_password
                }
                
                # 添加NMP参数
                login_data.update(nmp_params)
                
                # 调用NSN登录
                login_url = "http://localhost:5000/login"
                login_response = requests.post(login_url, data=login_data, timeout=30, allow_redirects=False)
                
                print(f"🔐 B-Client: Login response status: {login_response.status_code}")
                
                # 提取session cookie
                session_cookie = None
                if 'set-cookie' in login_response.headers:
                    cookies = login_response.headers['set-cookie']
                    if isinstance(cookies, list):
                        cookies = '; '.join(cookies)
                    
                    import re
                    session_match = re.search(r'session=([^;]+)', cookies)
                    if session_match:
                        session_cookie = f"session={session_match.group(1)}"
                        print(f"🍪 B-Client: Session cookie extracted: {session_cookie[:50]}...")
                
                # 检查登录是否成功
                if login_response.status_code == 302 or (login_response.status_code == 200 and session_cookie):
                    print("✅ B-Client: NSN login successful after registration")
                    
                    # 获取用户信息确认登录
                    try:
                        user_info_url = "http://localhost:5000/api/current-user"
                        user_info_response = requests.get(user_info_url, headers={'Cookie': session_cookie}, timeout=10)
                        
                        if user_info_response.status_code == 200:
                            user_info = user_info_response.json()
                            nsn_user_id = user_info.get('user_id')
                            nsn_username = user_info.get('username')
                            print(f"✅ B-Client: User info confirmed: {nsn_username} (ID: {nsn_user_id})")
                        else:
                            print(f"⚠️ B-Client: Failed to get user info: {user_info_response.status_code}")
                            nsn_user_id = None
                            nsn_username = unique_username
                    except Exception as e:
                        print(f"⚠️ B-Client: Failed to get user info: {e}")
                        nsn_user_id = None
                        nsn_username = unique_username
                    
                    # 保存session到数据库
                    print(f"💾 B-Client: ===== SAVING SESSION TO DATABASE =====")
                    try:
                        save_cookie_to_db(nmp_user_id, nsn_username, session_cookie, node_id, auto_refresh, nsn_user_id, nsn_username)
                        print(f"✅ B-Client: Session saved to database successfully")
                    except Exception as e:
                        print(f"❌ B-Client: Failed to save session to database: {e}")
                        import traceback
                        traceback.print_exc()
                
                    # 发送session给C-Client（异步）
                    print(f"📤 B-Client: ===== SENDING SESSION TO C-CLIENT (ASYNC) =====")
                    try:
                        # 预处理session数据
                        session_data_json = {
                            'loggedin': True,
                            'user_id': nsn_user_id,
                            'username': nsn_username,
                            'role': 'traveller',
                            'nmp_user_id': nmp_user_id,
                            'nmp_username': nmp_username,
                            'nmp_client_type': 'c-client',
                            'nmp_timestamp': str(int(time.time() * 1000))
                        }
                        processed_session = json.dumps(session_data_json)
                        
                        # 异步发送session
                        import threading
                        def send_session_async():
                            try:
                                import asyncio
                                loop = asyncio.new_event_loop()
                                asyncio.set_event_loop(loop)
                                send_result = loop.run_until_complete(send_session_to_client(
                                    nmp_user_id, 
                                    processed_session, 
                                    nsn_user_id, 
                                    nsn_username,
                                    website_root_path='http://localhost:5000',
                                    website_name='NSN',
                                    session_partition='persist:nsn',
                                    reset_logout_status=True  # Manual login should reset logout status
                                ))
                                print(f"📤 B-Client: Async session send result: {send_result}")
                                print(f"✅ B-Client: Session sent to C-Client for user {nmp_user_id}")
                            except Exception as e:
                                print(f"⚠️ B-Client: Failed to send session to C-Client: {e}")
                            finally:
                                loop.close()
                        
                        # 启动异步发送线程
                        thread = threading.Thread(target=send_session_async)
                        thread.daemon = True
                        thread.start()
                        print(f"🚀 B-Client: Started async session sending thread for user {nmp_user_id}")
                        
                    except Exception as e:
                        print(f"⚠️ B-Client: Failed to start async session sending: {e}")
                        import traceback
                        traceback.print_exc()
                    
                    # 返回成功响应
                    response_data = {
                        'success': True,
                        'login_success': True,
                        'complete_session_data': session_cookie,
                        'message': 'User registered and logged in successfully'
                    }
                    print(f"📤 B-Client: ===== RETURNING SUCCESS RESPONSE =====")
                    print(f"📤 B-Client: Response data: {response_data}")
                    return jsonify(response_data)
                        
                else:
                    print(f"❌ B-Client: NSN login failed with status {login_response.status_code}")
                    print(f"❌ B-Client: Login response text: {login_response.text[:500]}...")
                    
                    # 登录失败，返回注册失败提示
                    error_response = {
                        'success': False,
                        'error': 'Signup to website failed: Login failed after registration'
                    }
                    print(f"📤 B-Client: ===== RETURNING ERROR RESPONSE =====")
                    print(f"📤 B-Client: Error response: {error_response}")
                    return jsonify(error_response), 400
                    
            except Exception as e:
                print(f"❌ B-Client: Error during NSN login attempt: {e}")
                import traceback
                traceback.print_exc()
                
                error_response = {
                    'success': False,
                    'error': f'Signup to website failed: {str(e)}'
                }
                print(f"📤 B-Client: ===== RETURNING ERROR RESPONSE =====")
                print(f"📤 B-Client: Error response: {error_response}")
                return jsonify(error_response), 400
        else:
            # request_type == 1 (bind) but no existing account found
            print(f"❌ B-Client: ===== NO ACCOUNT FOUND FOR BIND REQUEST =====")
            print(f"❌ B-Client: No existing account found for user {nmp_user_id} and bind request")
            error_response = {
                'success': False,
                'error': 'Wrong account or password, please try again or sign up with NMP'
            }
            print(f"📤 B-Client: ===== RETURNING ERROR RESPONSE =====")
            print(f"📤 B-Client: Error response: {error_response}")
            return jsonify(error_response), 400  # 使用400而不是404
        
    except Exception as e:
        print(f"❌ B-Client: Bind API error: {e}")
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


if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True, host='0.0.0.0', port=3000)
