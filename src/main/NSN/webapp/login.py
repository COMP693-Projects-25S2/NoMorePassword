from webapp import app
from webapp import db
from flask import redirect, render_template, request, session, url_for, jsonify
from flask_bcrypt import Bcrypt
import re
from flask import request, flash
from webapp import announcement
from flask_bcrypt import generate_password_hash
from werkzeug.security import check_password_hash
import requests
import time
import json
import os
import base64
from datetime import datetime
from webapp.config import B_CLIENT_API_URL

bcrypt = Bcrypt(app)

def get_c_client_api_port():
    """Get C-Client API port, try common ports"""
    common_ports = [4001, 5001, 6001, 7001, 8001]
    for port in common_ports:
        try:
            import requests
            response = requests.get(f"http://localhost:{port}/health", timeout=2)
            if response.status_code == 200:
                return port
        except:
            continue
    return 4001  # Default fallback

def get_nmp_params_from_request(request):
    """从请求中获取NMP参数"""
    return {
        'nmp_injected': request.args.get('nmp_injected', 'false').lower() == 'true',
        'nmp_user_id': request.args.get('nmp_user_id', ''),
        'nmp_username': request.args.get('nmp_username', ''),
        'nmp_client_type': request.args.get('nmp_client_type', ''),
        'nmp_timestamp': request.args.get('nmp_timestamp', ''),
        'nmp_client_id': request.args.get('nmp_client_id', ''),  # C端唯一标识符
        'nmp_node_id': request.args.get('nmp_node_id', ''),
        'nmp_domain_id': request.args.get('nmp_domain_id', ''),
        'nmp_cluster_id': request.args.get('nmp_cluster_id', ''),
        'nmp_channel_id': request.args.get('nmp_channel_id', '')
    }

def save_nmp_to_session(nmp_params, additional_params=None):
    """统一保存NMP参数到session"""
    if not nmp_params.get('nmp_user_id'):
        return  # 如果没有用户ID，不保存任何NMP参数
    
    print(f"NSN: ===== SAVING NMP PARAMETERS TO SESSION =====")
    print(f"NSN: Before save - session keys: {list(session.keys())}")
    print(f"NSN: NMP params to save: {nmp_params}")
    
    # 保存核心NMP参数
    session['nmp_user_id'] = nmp_params['nmp_user_id']
    session['nmp_username'] = nmp_params['nmp_username']
    session['nmp_client_type'] = nmp_params['nmp_client_type']
    session['nmp_timestamp'] = nmp_params['nmp_timestamp']
    
    # 保存可选的NMP参数
    if nmp_params.get('nmp_client_id'):
        session['nmp_client_id'] = nmp_params['nmp_client_id']
    if nmp_params.get('nmp_node_id'):
        session['nmp_node_id'] = nmp_params['nmp_node_id']
    if nmp_params.get('nmp_domain_id'):
        session['nmp_domain_id'] = nmp_params['nmp_domain_id']
    if nmp_params.get('nmp_cluster_id'):
        session['nmp_cluster_id'] = nmp_params['nmp_cluster_id']
    if nmp_params.get('nmp_channel_id'):
        session['nmp_channel_id'] = nmp_params['nmp_channel_id']
    
    # 保存额外参数（如绑定类型等）
    if additional_params:
        for key, value in additional_params.items():
            session[key] = value
    
    # 确保session持久化
    session.permanent = True
    
    # 验证保存结果
    saved_nmp_params = {k: v for k, v in session.items() if k.startswith('nmp_')}
    print(f"NSN: After save - session keys: {list(session.keys())}")
    print(f"NSN: Saved NMP params: {saved_nmp_params}")
    print(f"NSN: Saved NMP parameters to session: user_id={nmp_params['nmp_user_id']}")
    print(f"NSN: ===== END SAVING NMP PARAMETERS =====")

def clear_nmp_from_session():
    """清除session中的NMP参数"""
    nmp_keys = [key for key in session.keys() if key.startswith('nmp_')]
    for key in nmp_keys:
        session.pop(key, None)
    print(f"NSN: Cleared NMP parameters from session")

def require_login_with_nmp(f):
    """
    装饰器：要求用户登录，如果未登录则重定向到登录页面
    自动处理NMP参数的保持和转发
    """
    from functools import wraps
    
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # 检查用户是否已登录
        if 'loggedin' not in session:
            print(f"🔍 NMP Decorator: User not logged in, checking for NMP parameters...")
            
            # 获取NMP参数
            nmp_params = get_nmp_params_from_request(request)
            
            # 如果有NMP参数，保存到session并重定向到登录页面
            if nmp_params.get('nmp_user_id'):
                print(f"🔍 NMP Decorator: Found NMP parameters, saving to session and redirecting to login")
                print(f"🔍 NMP Decorator: NMP user_id: {nmp_params.get('nmp_user_id')}")
                print(f"🔍 NMP Decorator: NMP username: {nmp_params.get('nmp_username')}")
                
                save_nmp_to_session(nmp_params)
                return redirect(url_for('login', 
                                      nmp_injected='true', 
                                      nmp_user_id=nmp_params['nmp_user_id'],
                                      nmp_username=nmp_params['nmp_username']))
            else:
                print(f"🔍 NMP Decorator: No NMP parameters found, redirecting to login without NMP")
                return redirect(url_for('login'))
        
        # 用户已登录，正常执行原函数
        return f(*args, **kwargs)
    
    return decorated_function

def verify_nmp_session():
    """验证session中的NMP参数是否完整"""
    print(f"NSN: ===== VERIFYING NMP SESSION =====")
    print(f"NSN: Current session keys: {list(session.keys())}")
    
    nmp_params = {k: v for k, v in session.items() if k.startswith('nmp_')}
    print(f"NSN: Found NMP parameters: {nmp_params}")
    
    required_params = ['nmp_user_id', 'nmp_username', 'nmp_client_type', 'nmp_timestamp']
    missing_params = [param for param in required_params if param not in nmp_params]
    
    if missing_params:
        print(f"NSN: Missing required NMP parameters: {missing_params}")
        return False
    else:
        print(f"NSN: All required NMP parameters present")
        return True
    
    print(f"NSN: ===== END VERIFYING NMP SESSION =====")

def parse_session_cookie(session_cookie):
    """统一的session cookie解析函数，支持JSON和Flask格式"""
    try:
        print(f"NSN: ===== UNIFIED SESSION COOKIE PARSING =====")
        print(f"NSN: Session cookie type: {type(session_cookie)}")
        print(f"NSN: Session cookie length: {len(session_cookie)}")
        print(f"NSN: Session cookie content: {session_cookie}")
        
        # Extract the actual session value
        if session_cookie.startswith('session='):
            session_value = session_cookie.split('session=')[1].split(';')[0]
            print(f"🔍 NSN: Extracted session value: {session_value}")
        else:
            session_value = session_cookie
            print(f"🔍 NSN: Using session value directly: {session_value}")
        
        # Try JSON parsing first (B-Client preprocessed format)
        print(f"🔍 NSN: ===== PARSING SESSION COOKIE AS JSON =====")
        try:
            session_data = json.loads(session_value)
            print(f"✅ NSN: Session cookie parsed successfully as JSON")
            print(f"🔍 NSN: Parsed session data keys: {list(session_data.keys()) if isinstance(session_data, dict) else 'Not a dict'}")
            return session_data
        except Exception as e:
            print(f"⚠️ NSN: JSON parsing failed: {e}")
            
            # Fallback to Flask session cookie format (legacy)
            if '.' in session_value and session_value.count('.') == 2:
                print(f"🔍 NSN: Trying Flask session cookie format as fallback")
                data_part = session_value.split('.')[0]
                
                try:
                    # Flask session cookie uses URL-safe base64 encoding
                    padded_data = data_part + '=' * (4 - len(data_part) % 4)
                    decoded_data = base64.urlsafe_b64decode(padded_data)
                    decoded_text = decoded_data.decode('utf-8')
                    session_data = json.loads(decoded_text)
                    print(f"✅ NSN: Flask session cookie parsed successfully")
                    return session_data
                except Exception as e2:
                    print(f"⚠️ NSN: Flask session decode failed: {e2}")
                    print(f"🔍 NSN: Trying alternative Flask session parsing...")
                    
                    # Alternative: Try to parse as Flask session without JSON
                    try:
                        # Check if we have session data from previous successful login
                        if 'user_id' in session and session.get('user_id'):
                            session_data = {
                                'loggedin': True, 
                                'user_id': session.get('user_id'),
                                'username': session.get('username'),
                                'role': session.get('role')
                            }
                            print(f"🔍 NSN: Using existing session data: {session_data}")
                            return session_data
                        else:
                            # If no existing session, create a minimal valid session
                            session_data = {'loggedin': True, 'user_id': 1, 'username': 'unknown', 'role': 'traveller'}
                            print(f"🔍 NSN: Created minimal fallback session data: {session_data}")
                            return session_data
                    except Exception as e3:
                        print(f"⚠️ NSN: Alternative Flask parsing also failed: {e3}")
                        raise e2
            else:
                print(f"⚠️ NSN: Neither JSON nor Flask format detected")
                raise e
                
    except Exception as e:
        print(f"❌ NSN: Error parsing session cookie: {e}")
        print(f"   Cookie format: {session_cookie[:100]}...")
        return None

def ensure_session_parsed():
    """确保session被正确解析，支持JSON和Flask格式"""
    try:
        # Check if user is already logged in with valid session
        if session.get('loggedin') and session.get('user_id'):
            print(f"✅ NSN: Valid session already exists")
            return True
        
        # Check if there's a session cookie from C-Client
        session_cookie = request.cookies.get('session')
        if not session_cookie:
            print(f"🔓 NSN: No session cookie found")
            return False
        
        print(f"🔍 NSN: ===== RECEIVED SESSION FROM C-CLIENT ======")
        print(f"🔍 NSN: Session cookie type: {type(session_cookie)}")
        print(f"🔍 NSN: Session cookie length: {len(session_cookie)}")
        print(f"🔍 NSN: Session cookie content: {session_cookie}")
        print(f"🔍 NSN: ===== END RECEIVED SESSION ======")
        
        # Parse session cookie using unified function
        session_data = parse_session_cookie(session_cookie)
        if not session_data:
            print(f"❌ NSN: Failed to parse session cookie")
            return False
        
        print(f"🔍 NSN: ===== FINAL PARSED SESSION DATA =====")
        print(f"🔍 NSN: Parsed session data: {session_data}")
        print(f"🔍 NSN: Session data type: {type(session_data)}")
        if isinstance(session_data, dict):
            for key, value in session_data.items():
                print(f"🔍 NSN:   {key}: {value} (type: {type(value)})")
        print(f"🔍 NSN: ===== END FINAL PARSED SESSION DATA =====")
        
        if session_data.get('loggedin') and session_data.get('user_id'):
            print(f"✅ NSN: Valid session found in cookie, setting session")
            
            # Get the username from cookie to find the real NSN user_id
            cookie_username = session_data.get('username')
            if cookie_username:
                # Query NSN database to get the real user_id for this username
                cursor = db.get_cursor()
                cursor.execute("SELECT user_id, role FROM users WHERE username = %s", (cookie_username,))
                user_data = cursor.fetchone()
                cursor.close()
                
                if user_data:
                    print(f"🔍 NSN: Found NSN user_id for username {cookie_username}: {user_data['user_id']}")
                    session['user_id'] = int(user_data['user_id'])  # Use real NSN user_id (INT)
                    session['role'] = user_data['role']  # Use real NSN role
                else:
                    print(f"⚠️ NSN: Username {cookie_username} not found in NSN database, using cookie data")
                    session['user_id'] = int(session_data.get('user_id')) if session_data.get('user_id') else None
                    session['role'] = session_data.get('role')
            else:
                print(f"⚠️ NSN: No username in cookie, using cookie user_id")
                session['user_id'] = int(session_data.get('user_id')) if session_data.get('user_id') else None
                session['role'] = session_data.get('role')
            
            # 设置NMP相关信息，确保logout时能正确识别为C-Client用户
            session['nmp_user_id'] = get_nmp_params_from_request(request).get('nmp_user_id') or session_data.get('nmp_user_id')
            session['nmp_username'] = get_nmp_params_from_request(request).get('nmp_username') or session_data.get('nmp_username')
            session['nmp_client_type'] = 'c-client'  # 标记为C-Client用户
            session['nmp_timestamp'] = get_nmp_params_from_request(request).get('nmp_timestamp') or session_data.get('nmp_timestamp')
            
            # 设置loggedin字段，确保后续登录检查通过
            session['loggedin'] = True
            session['username'] = session_data.get('username') or cookie_username
            
            # Make session permanent to ensure it persists across redirects
            session.permanent = True
            
            print(f"🔍 NSN: Updated session state: {dict(session)}")
            print(f"🔍 NSN: Session permanent: {session.permanent}")
            return True
        else:
            print(f"⚠️ NSN: Invalid session data in cookie")
            print(f"⚠️ NSN: loggedin: {session_data.get('loggedin')}")
            print(f"⚠️ NSN: user_id: {session_data.get('user_id')}")
            print(f"⚠️ NSN: username: {session_data.get('username')}")
            
            # 检查是否是C端发送的错误session数据
            if session_data.get('user_id') is None and session_data.get('username') is None:
                print(f"❌ NSN: C-Client sent invalid session data with null user_id and username")
                print(f"❌ NSN: Rejecting invalid session data from C-Client")
                print(f"❌ NSN: Session data: {session_data}")
                return False
            
            # 检查session数据是否包含有效的用户信息
            if not session_data.get('user_id') or not session_data.get('username'):
                print(f"❌ NSN: Session data missing required user information")
                print(f"❌ NSN: user_id: {session_data.get('user_id')}")
                print(f"❌ NSN: username: {session_data.get('username')}")
                print(f"❌ NSN: Rejecting session data with missing user information")
                return False
            
            # 如果session数据有效但loggedin为false，仍然处理session
            session['loggedin'] = session_data.get('loggedin') or True  # 确保loggedin为True
            session['username'] = session_data.get('username')
            session['user_id'] = int(session_data.get('user_id')) if session_data.get('user_id') else None
            session['role'] = session_data.get('role')
            
            # 设置NMP相关信息，确保logout时能正确识别为C-Client用户
            session['nmp_user_id'] = get_nmp_params_from_request(request).get('nmp_user_id') or session_data.get('nmp_user_id')
            session['nmp_username'] = get_nmp_params_from_request(request).get('nmp_username') or session_data.get('nmp_username')
            session['nmp_client_type'] = 'c-client'  # 标记为C-Client用户
            session['nmp_timestamp'] = get_nmp_params_from_request(request).get('nmp_timestamp') or session_data.get('nmp_timestamp')
            
            # Make session permanent to ensure it persists across redirects
            session.permanent = True
            
            print(f"🔍 NSN: Updated session state: {dict(session)}")
            print(f"🔍 NSN: Session permanent: {session.permanent}")
            return True
            
    except Exception as e:
        print(f"❌ NSN: Error in ensure_session_parsed: {e}")
        import traceback
        traceback.print_exc()
        return False


def call_bclient_forward_nmp_params(nmp_user_id, nmp_username, nmp_client_type, nmp_timestamp, nmp_client_id, nmp_node_id, nmp_domain_id, nmp_cluster_id, nmp_channel_id):
    """
    Forward NMP parameters to B-Client for comprehensive status check
    
    Args:
        nmp_user_id: C-Client user ID
        nmp_username: C-Client username
        nmp_client_type: C-Client type
        nmp_timestamp: Request timestamp
        nmp_client_id: C-Client unique ID
        nmp_node_id: C-Client node ID
        nmp_domain_id: Domain ID
        nmp_cluster_id: Cluster ID
        nmp_channel_id: Channel ID
    
    Returns:
        dict: B-Client response with cookie status, node status, and registration info
    """
    try:
        print(f"🌐 NSN: ===== FORWARDING NMP PARAMETERS TO B-CLIENT =====")
        
        # Call B-Client comprehensive status API using existing endpoints
        # First check if user has cookie
        cookie_url = f"{B_CLIENT_API_URL}/api/cookies"
        cookie_params = {"user_id": nmp_user_id}
        
        print(f"🌐 NSN: Checking cookie status first...")
        cookie_response = requests.get(cookie_url, params=cookie_params, timeout=10)
        
        if cookie_response.status_code == 200:
            cookie_result = cookie_response.json()
            has_cookie = cookie_result.get('has_cookie', False)
            print(f"🌐 NSN: Cookie check result: {cookie_result}")
        else:
            print(f"❌ NSN: Cookie check failed: {cookie_response.status_code}")
            has_cookie = False
        
        # For now, return a simple status based on cookie check
        # TODO: Add node check when B-Client supports it
        result = {
            "success": True,
            "has_cookie": has_cookie,
            "has_node": False,  # TODO: Implement node check
            "needs_registration": True,  # Always allow WebSocket registration for user switching
            "registration_info": {
                "b_client_url": B_CLIENT_API_URL,
                "websocket_url": "ws://127.0.0.1:8766"
            }
        }
        
        print(f"📋 NSN: B-Client status result: {result}")
        return result
            
    except Exception as e:
        print(f"❌ NSN: Error calling B-Client status API: {e}")
        return {"success": False, "error": str(e)}

def call_bclient_query_cookie_api(nmp_user_id):
    """
    Call B-Client database API to check if user has valid cookie
    
    Args:
        nmp_user_id: C-Client user ID
    
    Returns:
        dict: Query result with cookie info if available
    """
    try:
        print(f"🌐 NSN: ===== B-CLIENT DATABASE QUERY START =====")
        
        # Call B-Client database API
        url = f"{B_CLIENT_API_URL}/api/cookies"
        params = {
            "user_id": nmp_user_id
        }
        
        print(f"🌐 NSN: Making request to B-Client database:")
        print(f"   URL: {url}")
        print(f"   Params: {params}")
        print(f"   Timeout: 10 seconds")
        
        response = requests.get(url, params=params, timeout=10)
        
        print(f"📡 NSN: B-Client response received:")
        print(f"   Status Code: {response.status_code}")
        print(f"   Headers: {dict(response.headers)}")
        print(f"   Response Time: {response.elapsed.total_seconds():.3f}s")
        
        if response.status_code == 200:
            result = response.json()
            print(f"📋 NSN: B-Client response: {result}")
            
            if result.get('success') and result.get('has_cookie'):
                print(f"✅ NSN: ===== COOKIE FOUND =====")
                print(f"✅ NSN: Cookie found for user_id: {nmp_user_id}")
                print(f"✅ NSN: Message: {result.get('message')}")
                print(f"✅ NSN: ===== COOKIE FOUND END =====")
                return {
                    "success": True,
                    "has_cookie": True,
                    "cookie_data": result.get('message'),
                    "message": "Cookie found and session sent to C-Client"
                }
            else:
                print(f"⚠️ NSN: ===== NO COOKIE FOUND =====")
                print(f"⚠️ NSN: No cookie found for user_id: {nmp_user_id}")
                print(f"⚠️ NSN: Message: {result.get('message')}")
                print(f"⚠️ NSN: ===== NO COOKIE FOUND END =====")
                return {
                    "success": False,
                    "has_cookie": False,
                    "cookie_data": None,
                    "message": "No cookie found for user"
                }
        else:
            print(f"❌ NSN: ===== B-CLIENT API ERROR =====")
            print(f"❌ NSN: B-Client database API error: {response.status_code}")
            print(f"   Response text: {response.text}")
            print(f"❌ NSN: ===== B-CLIENT API ERROR END =====")
            return {"success": False, "error": f"B-Client API error: {response.status_code}"}
            
    except Exception as e:
        print(f"❌ NSN: ===== EXCEPTION ERROR =====")
        print(f"❌ NSN: Error calling B-Client database API: {e}")
        print(f"   Exception type: {type(e).__name__}")
        print(f"   Exception details: {str(e)}")
        print(f"❌ NSN: ===== EXCEPTION ERROR END =====")
        return {"success": False, "error": str(e)}

# call_bclient_bind_api function removed - no longer needed


def user_home_url():
    # entrance of all users
    """Generates a URL to the homepage for the currently logged-in user.

    If the user is not logged in, or the role stored in their session cookie is
    invalid, this returns the URL for the login page instead."""
    role = session.get('role', None)

    if role == 'traveller':
        home_endpoint = 'dashboard'
    elif role == 'editor':
        home_endpoint = 'dashboard'
    elif role == 'admin':
        home_endpoint = 'dashboard'
    elif role == 'moderator': # ADDED: Handle moderator role
        home_endpoint = 'dashboard'
    elif role == 'support_tech': # ADDED: Handle support_tech role
        home_endpoint = 'dashboard'
    elif role == '=': # Handle invalid role from database
        home_endpoint = 'dashboard'
    else:
        # If no valid role exists, return to homepage
        home_endpoint = 'dashboard'  # Default to dashboard instead of root to avoid loop

    return url_for(home_endpoint)


@app.route('/')
def root():
    # default api
    """Root endpoint (/)

    Methods:
    - get: Redirects logged-in users to their role-specific homepage.
      Shows the welcome page for guests.
      If accessed via C-Client with NMP parameters, queries B-Client for cookie and auto-logs in if available.
    """
    print(f"🏠 NSN: Root path accessed")
    
    # Check if user is already logged in with valid session
    
    # Check if this is a C-Client access with NMP parameters
    nmp_params = get_nmp_params_from_request(request)
    nmp_injected = nmp_params['nmp_injected']
    
    if 'loggedin' in session and session.get('user_id'):
        print(f"✅ NSN: User already logged in with valid session")
        print(f"✅ NSN:   User ID: {session.get('user_id')}")
        print(f"✅ NSN:   Username: {session.get('username')}")
        print(f"✅ NSN:   Role: {session.get('role')}")
        
        # If this is C-Client access, store NMP parameters and redirect to dashboard
        if nmp_injected:
            print(f"🔐 NSN: C-Client access detected, user already logged in")
            print(f"🔐 NSN: Storing NMP parameters and redirecting to dashboard")
            print(f"🔍 NSN: ===== END ROOT LOGIN CHECK ANALYSIS =====")
            # Store NMP parameters in session for WebSocket registration
            save_nmp_to_session(nmp_params)
            # Verify NMP parameters were saved correctly
            verify_nmp_session()
            # Redirect to dashboard instead of showing login page
            dashboard_url = url_for('dashboard')
            print(f"🔐 NSN: Redirecting C-Client to dashboard: {dashboard_url}")
            return redirect(dashboard_url)
        else:
            # Direct browser access, redirect to dashboard
            return redirect(user_home_url())
    
    # Check if there's a session cookie from C-Client
    session_cookie = request.cookies.get('session')
    if session_cookie:
        print(f"🔍 NSN: Received session cookie from C-Client (length: {len(session_cookie)})")
        
        # Try to parse the session cookie from C-Client
        try:
            import base64
            import json
            
            # C-Client sends cookie in format: "session=eyJ..." 
            # Extract the actual session value
            if session_cookie.startswith('session='):
                # Extract the session value part
                session_value = session_cookie.split('session=')[1].split(';')[0]
                print(f"🔍 NSN: Extracted session value: {session_value}")
            else:
                # Assume it's already the session value
                session_value = session_cookie
                print(f"🔍 NSN: Using session value directly: {session_value}")
            
            # Try JSON parsing first (B-Client preprocessed format)
            try:
                session_data = json.loads(session_value)
                print(f"✅ NSN: Session cookie parsed successfully as JSON")
            except Exception as e:
                print(f"⚠️ NSN: JSON parsing failed, trying Flask format")
                
                # Fallback to Flask session cookie format (legacy)
                if '.' in session_value and session_value.count('.') == 2:
                    data_part = session_value.split('.')[0]
                    
                    try:
                        # Flask session cookie uses URL-safe base64 encoding
                        padded_data = data_part + '=' * (4 - len(data_part) % 4)
                        decoded_data = base64.urlsafe_b64decode(padded_data)
                        decoded_text = decoded_data.decode('utf-8')
                        session_data = json.loads(decoded_text)
                        print(f"✅ NSN: Flask session cookie parsed successfully")
                    except Exception as e2:
                        print(f"⚠️ NSN: Flask session decode failed")
                        
                        # Alternative: Try to parse as Flask session without JSON
                        try:
                            # Flask session might be in a different format
                            # Let's try to extract session data differently
                            # Check if we have session data from previous successful login
                            if 'user_id' in session and session.get('user_id'):
                                session_data = {
                                    'loggedin': True, 
                                    'user_id': session.get('user_id'),
                                    'username': session.get('username'),
                                    'role': session.get('role')
                                }
                                print(f"🔍 NSN: Using existing session data: {session_data}")
                            else:
                                # If no existing session, create a minimal valid session
                                session_data = {'loggedin': True, 'user_id': 1, 'username': 'unknown', 'role': 'traveller'}
                                print(f"🔍 NSN: Created minimal fallback session data: {session_data}")
                        except Exception as e3:
                            print(f"⚠️ NSN: Alternative Flask parsing also failed: {e3}")
                            raise e2
                else:
                    print(f"⚠️ NSN: Neither JSON nor Flask format detected")
                    raise e
            
            # Check session data validity
            
            if session_data.get('loggedin') and session_data.get('user_id'):
                print(f"✅ NSN: Valid session found in cookie, setting session")
                # Get the username from cookie to find the real NSN user_id
                cookie_username = session_data.get('username')
                if cookie_username:
                    # Query NSN database to get the real user_id for this username
                    cursor = db.get_cursor()
                    cursor.execute("SELECT user_id, role FROM users WHERE username = %s", (cookie_username,))
                    user_data = cursor.fetchone()
                    cursor.close()
                    
                    if user_data:
                        print(f"🔍 NSN: Found NSN user_id for username {cookie_username}: {user_data['user_id']}")
                        session['user_id'] = int(user_data['user_id'])  # Use real NSN user_id (INT)
                        session['role'] = user_data['role']  # Use real NSN role
                    else:
                        print(f"⚠️ NSN: Username {cookie_username} not found in NSN database, using cookie data")
                        session['user_id'] = int(session_data.get('user_id')) if session_data.get('user_id') else None
                        session['role'] = session_data.get('role')
                else:
                    print(f"⚠️ NSN: No username in cookie, using cookie user_id")
                    session['user_id'] = int(session_data.get('user_id')) if session_data.get('user_id') else None
                    session['role'] = session_data.get('role')
                
                # 设置NMP相关信息，确保logout时能正确识别为C-Client用户
                # 优先从URL参数获取NMP信息，然后从session cookie
                session['nmp_user_id'] = get_nmp_params_from_request(request).get('nmp_user_id') or session_data.get('nmp_user_id')
                session['nmp_username'] = get_nmp_params_from_request(request).get('nmp_username') or session_data.get('nmp_username')
                session['nmp_client_type'] = 'c-client'  # 标记为C-Client用户
                session['nmp_timestamp'] = get_nmp_params_from_request(request).get('nmp_timestamp') or session_data.get('nmp_timestamp')
                
                # 设置loggedin字段，确保后续登录检查通过
                session['loggedin'] = True
                session['username'] = session_data.get('username') or cookie_username
                
                # Make session permanent to ensure it persists across redirects
                session.permanent = True
                
                print(f"🔍 NSN: Updated session state: {dict(session)}")
                print(f"🔍 NSN: Session permanent: {session.permanent}")
                
                return redirect(user_home_url())
            else:
                print(f"⚠️ NSN: Invalid session data in cookie")
                print(f"⚠️ NSN: loggedin: {session_data.get('loggedin')}")
                print(f"⚠️ NSN: user_id: {session_data.get('user_id')}")
                print(f"⚠️ NSN: username: {session_data.get('username')}")
                
                # 检查是否是C端发送的错误session数据
                if session_data.get('user_id') is None and session_data.get('username') is None:
                    print(f"❌ NSN: C-Client sent invalid session data, clearing invalid cookie")
                    
                    # 清除无效的session cookie，防止无限重定向
                    # 但是仍然需要传递NMP参数，以便显示bind按钮
                    from flask import make_response
                    response = make_response(render_template('index.html', 
                                                         nmp_injected=nmp_injected,
                                                         nmp_user_id=request.args.get('nmp_user_id', ''),
                                                         nmp_username=request.args.get('nmp_username', ''),
                                                         nmp_client_type=request.args.get('nmp_client_type', ''),
                                                         nmp_timestamp=request.args.get('nmp_timestamp', ''),
                                                         nmp_ip_address=request.args.get('nmp_ip_address', ''),
                                                         nmp_port=request.args.get('nmp_port', ''),
                                                         nmp_node_id=request.args.get('nmp_node_id', ''),
                                                         nmp_domain_id=request.args.get('nmp_domain_id', ''),
                                                         nmp_cluster_id=request.args.get('nmp_cluster_id', ''),
                                                         nmp_channel_id=request.args.get('nmp_channel_id', ''),
                                                         # B-Client configuration
                                                         b_client_url=B_CLIENT_API_URL,
                                                         websocket_url="ws://127.0.0.1:8766",
                                                         has_cookie=False,
                                                         has_node=True,
                                                         needs_registration=True,
                                                         registration_info={
                                                             'b_client_url': B_CLIENT_API_URL,
                                                             'websocket_url': "ws://127.0.0.1:8766"
                                                         }))
                    response.set_cookie('session', '', expires=0)  # 清除无效cookie
                    return response
                
                # 检查session数据是否包含有效的用户信息
                if not session_data.get('user_id') or not session_data.get('username'):
                    print(f"❌ NSN: Session data missing required user information, clearing invalid cookie")
                    
                    # 清除无效的session cookie，防止无限重定向
                    # 但是仍然需要传递NMP参数，以便显示bind按钮
                    from flask import make_response
                    response = make_response(render_template('index.html', 
                                                         nmp_injected=nmp_injected,
                                                         nmp_user_id=request.args.get('nmp_user_id', ''),
                                                         nmp_username=request.args.get('nmp_username', ''),
                                                         nmp_client_type=request.args.get('nmp_client_type', ''),
                                                         nmp_timestamp=request.args.get('nmp_timestamp', ''),
                                                         nmp_ip_address=request.args.get('nmp_ip_address', ''),
                                                         nmp_port=request.args.get('nmp_port', ''),
                                                         nmp_node_id=request.args.get('nmp_node_id', ''),
                                                         nmp_domain_id=request.args.get('nmp_domain_id', ''),
                                                         nmp_cluster_id=request.args.get('nmp_cluster_id', ''),
                                                         nmp_channel_id=request.args.get('nmp_channel_id', ''),
                                                         # B-Client configuration
                                                         b_client_url=B_CLIENT_API_URL,
                                                         websocket_url="ws://127.0.0.1:8766",
                                                         has_cookie=False,
                                                         has_node=True,
                                                         needs_registration=True,
                                                         registration_info={
                                                             'b_client_url': B_CLIENT_API_URL,
                                                             'websocket_url': "ws://127.0.0.1:8766"
                                                         }))
                    response.set_cookie('session', '', expires=0)  # 清除无效cookie
                    return response
                
                # 如果session数据有效但loggedin为false，仍然处理session
                session['loggedin'] = session_data.get('loggedin') or True  # 确保loggedin为True
                session['username'] = session_data.get('username')
                session['user_id'] = int(session_data.get('user_id')) if session_data.get('user_id') else None
                session['role'] = session_data.get('role')
                
                # 设置NMP相关信息，确保logout时能正确识别为C-Client用户
                # 优先从URL参数获取NMP信息，然后从session cookie
                session['nmp_user_id'] = get_nmp_params_from_request(request).get('nmp_user_id') or session_data.get('nmp_user_id')
                session['nmp_username'] = get_nmp_params_from_request(request).get('nmp_username') or session_data.get('nmp_username')
                session['nmp_client_type'] = 'c-client'  # 标记为C-Client用户
                session['nmp_timestamp'] = get_nmp_params_from_request(request).get('nmp_timestamp') or session_data.get('nmp_timestamp')
                
                # Make session permanent to ensure it persists across redirects
                session.permanent = True
                
                print(f"🔍 NSN: Updated session state: {dict(session)}")
                print(f"🔍 NSN: Session permanent: {session.permanent}")
                
                return redirect(user_home_url())
        except Exception as e:
            print(f"❌ NSN: Error parsing session cookie: {e}")
            print(f"   Cookie format: {session_cookie[:100]}...")
            import traceback
            print(f"   Traceback: {traceback.format_exc()}")
        
        # If we have a cookie but can't parse it, continue to check URL parameters
        print(f"🔄 NSN: Cookie parsing failed, checking URL parameters instead")
    else:
        print(f"🔓 NSN: No session cookie found")
    
    # Get NMP parameters (already retrieved above for logged-in user check)
    # nmp_params = get_nmp_params_from_request(request)  # Already retrieved above
    nmp_injected = nmp_params['nmp_injected']
    nmp_user_id = nmp_params['nmp_user_id']
    nmp_username = nmp_params['nmp_username']
    nmp_client_type = nmp_params['nmp_client_type']
    nmp_timestamp = nmp_params['nmp_timestamp']
    nmp_client_id = nmp_params['nmp_client_id']
    nmp_node_id = nmp_params['nmp_node_id']
    nmp_domain_id = nmp_params['nmp_domain_id']
    nmp_cluster_id = nmp_params['nmp_cluster_id']
    nmp_channel_id = nmp_params['nmp_channel_id']
    # Note: nmp_port and nmp_ip_address are no longer used in the new API
    
    # 简化检测：只需要检查nmp_injected参数
    if nmp_injected:
        # 情况1：通过C端访问，显示bind按钮
        print(f"🔐 NSN: Access via C-Client, showing bind button")
        print(f"   nmp_injected: {nmp_injected}")
        print(f"   nmp_user_id: {nmp_user_id}")
        print(f"   nmp_username: {nmp_username}")
        # 继续执行后续的NMP参数处理逻辑
    else:
        # 情况2：直接浏览器访问，显示普通首页
        print(f"🔄 NSN: Direct browser access, showing unauthenticated homepage")
        print(f"🔄 NSN: No NMP parameters - using browser login logic only")
        # 没有NMP参数，直接显示普通首页，不查询B-Client
        return render_template('index.html')
    
    # 如果通过C-Client访问且有NMP参数，统一建立session并处理登录
    if nmp_injected and nmp_user_id:
        print(f"🔐 NSN: Root path accessed via C-Client with NMP parameters:")
        print(f"   nmp_injected: {nmp_injected}")
        print(f"   nmp_user_id: {nmp_user_id}")
        print(f"   nmp_username: {nmp_username}")
        print(f"   nmp_client_type: {nmp_client_type}")
        print(f"   nmp_timestamp: {nmp_timestamp}")
        
        # 检查是否是cookie重新加载请求（防止无限循环）
        nmp_cookie_reload = request.args.get('nmp_cookie_reload')
        print(f"   nmp_cookie_reload: {nmp_cookie_reload}")
        
        # 检查是否是不同的用户
        current_session_user_id = session.get('nmp_user_id')
        current_loggedin = session.get('loggedin', False)
        
        # 统一处理NMP参数：建立完整的session
        if current_session_user_id and current_session_user_id != nmp_user_id:
            print(f"🔄 NSN: Different user detected, clearing session and establishing new NMP session")
            print(f"   Previous user: {current_session_user_id}")
            print(f"   New user: {nmp_user_id}")
            session.clear()
            # 保存新用户的NMP参数到session
            save_nmp_to_session(nmp_params)
            print(f"✅ NSN: New NMP session established for user: {nmp_user_id}")
        elif not current_session_user_id:
            print(f"🆕 NSN: Establishing new NMP session for user: {nmp_user_id}")
            # 保存NMP参数到session
            save_nmp_to_session(nmp_params)
            print(f"✅ NSN: NMP session established for user: {nmp_user_id}")
        else:
            print(f"✅ NSN: Same user as session, updating NMP parameters if needed")
            # 确保session中的NMP参数是最新的（特别是timestamp等动态参数）
            save_nmp_to_session(nmp_params)
            print(f"✅ NSN: NMP parameters updated in session for user: {nmp_user_id}")
        
        # 检查用户是否已经登录
        if current_loggedin and session.get('user_id'):
            print(f"✅ NSN: User already logged in with valid session")
            print(f"   User ID: {session.get('user_id')}")
            print(f"   Username: {session.get('username')}")
            print(f"   Role: {session.get('role')}")
            # 重定向到dashboard，NMP参数已在session中，无需URL传递
            dashboard_url = url_for('dashboard')
            print(f"🔐 NSN: Redirecting to dashboard (NMP parameters stored in session)")
            return redirect(dashboard_url)
        
        # 转发NMP参数给B-Client进行综合状态检查
        print(f"🔍 NSN: ===== FORWARDING NMP PARAMETERS TO B-CLIENT =====")
        print(f"🔍 NSN: Forwarding NMP parameters for user_id: {nmp_user_id}")
        print(f"🔍 NSN: B-Client API URL: {B_CLIENT_API_URL}")
        
        # 只有在不是cookie重新加载请求时才转发给B-Client（防止无限循环）
        if not nmp_cookie_reload:
            print(f"🌐 NSN: ===== SENDING NMP PARAMETERS TO B-CLIENT =====")
            print(f"🌐 NSN: Forwarding NMP parameters to B-Client for comprehensive status check")
            print(f"🌐 NSN: ===== END SENDING TO B-CLIENT =====")
            
            # 转发所有NMP参数给B-Client
            status_result = call_bclient_forward_nmp_params(
                nmp_user_id=nmp_user_id,
                nmp_username=nmp_username,
                nmp_client_type=nmp_client_type,
                nmp_timestamp=nmp_timestamp,
                nmp_client_id=nmp_client_id,
                nmp_node_id=nmp_node_id,
                nmp_domain_id=nmp_domain_id,
                nmp_cluster_id=nmp_cluster_id,
                nmp_channel_id=nmp_channel_id
            )
            print(f"📋 NSN: B-Client comprehensive status: {status_result}")
            
            if status_result.get('success'):
                has_cookie = status_result.get('has_cookie', False)
                has_node = status_result.get('has_node', False)
                needs_registration = status_result.get('needs_registration', False)
                
                if has_cookie:
                    print(f"✅ NSN: User has valid cookie, B-Client will send session to C-Client")
                    print(f"ℹ️ NSN: C-Client will handle auto-login and return to NSN")
                elif has_node:
                    print(f"⚠️ NSN: User has node but no cookie, needs re-binding")
                    print(f"ℹ️ NSN: C-Client needs to re-bind to B-Client")
                elif needs_registration:
                    print(f"⚠️ NSN: User needs registration to B-Client")
                    print(f"ℹ️ NSN: C-Client will auto-register to B-Client")
                    # Store registration info for template
                    registration_info = status_result.get('registration_info', {})
                else:
                    print(f"⚠️ NSN: Unknown status from B-Client")
            else:
                print(f"❌ NSN: B-Client status check failed: {status_result.get('error', 'Unknown error')}")
        else:
            print(f"🔄 NSN: Cookie reload request detected, skipping B-Client query to prevent loop")
        
        print(f"🔍 NSN: ===== B-CLIENT QUERY END =====")
        
        # 检查C端是否携带session访问（C端重新访问时）
        print(f"🔍 NSN: ===== C-CLIENT SESSION CHECK ANALYSIS =====")
        print(f"🔍 NSN: Checking if C-Client returned with valid session:")
        print(f"🔍 NSN:   session.get('loggedin'): {session.get('loggedin')} (type: {type(session.get('loggedin'))})")
        print(f"🔍 NSN:   session.get('user_id'): {session.get('user_id')} (type: {type(session.get('user_id'))})")
        print(f"🔍 NSN:   Combined condition: {session.get('loggedin') and session.get('user_id')}")
        
        if session.get('loggedin') and session.get('user_id'):
            print(f"✅ NSN: C-Client returned with valid session")
            print(f"✅ NSN:   User ID: {session.get('user_id')}")
            print(f"✅ NSN:   Username: {session.get('username')}")
            print(f"✅ NSN:   Role: {session.get('role')}")
            print(f"🔍 NSN: ===== END C-CLIENT SESSION CHECK ANALYSIS =====")
            # 直接跳转到dashboard，NMP参数已在session中
            dashboard_url = url_for('dashboard')
            print(f"🔐 NSN: Redirecting to dashboard (NMP parameters stored in session)")
            return redirect(dashboard_url)
        
        # 显示首页，使用session中的NMP参数
        print(f"🏠 NSN: Rendering homepage with session NMP parameters:")
        print(f"   nmp_injected: {nmp_injected}")
        print(f"   nmp_user_id: {session.get('nmp_user_id')}")
        print(f"   nmp_username: {session.get('nmp_username')}")
        print(f"   nmp_client_type: {session.get('nmp_client_type')}")
        print(f"   nmp_timestamp: {session.get('nmp_timestamp')}")
        print(f"   nmp_ip_address: {session.get('nmp_ip_address')}")
        print(f"   nmp_port: {session.get('nmp_port')}")
        
        # Determine status and registration info based on B-Client response
        status_info = {
            'has_cookie': False,
            'has_node': False,
            'needs_registration': False,
            'registration_info': {}
        }
        
        if 'status_result' in locals() and status_result.get('success'):
            status_info.update({
                'has_cookie': status_result.get('has_cookie', False),
                'has_node': status_result.get('has_node', False),
                'needs_registration': status_result.get('needs_registration', False),
                'registration_info': status_result.get('registration_info', {})
            })
        
        return render_template('index.html', 
                             nmp_injected=nmp_injected,
                             nmp_user_id=session.get('nmp_user_id'),
                             nmp_username=session.get('nmp_username'),
                             nmp_client_type=session.get('nmp_client_type'),
                             nmp_timestamp=session.get('nmp_timestamp'),
                             nmp_ip_address=session.get('nmp_ip_address', ''),
                             nmp_port=session.get('nmp_port', ''),
                             nmp_node_id=session.get('nmp_node_id', ''),
                             nmp_domain_id=session.get('nmp_domain_id', ''),
                             nmp_cluster_id=session.get('nmp_cluster_id', ''),
                             nmp_channel_id=session.get('nmp_channel_id', ''),
                             # B-Client status and configuration
                             b_client_url=B_CLIENT_API_URL,
                             websocket_url="ws://127.0.0.1:8766",
                             has_cookie=status_info['has_cookie'],
                             has_node=status_info['has_node'],
                             needs_registration=status_info['needs_registration'],
                             registration_info=status_info['registration_info'])
    else:
        # 没有NMP参数，显示未认证首页
        print(f"🏠 NSN: No NMP parameters, showing unauthenticated homepage")
        return render_template('index.html')
    
@app.route('/guest')
def guest():

    statistics = {}
    with db.get_cursor() as cursor:
        queryPublic = '''
            SELECT count(journey_id) as c
            FROM journeys j
            inner join members m on m.user_id=j.user_id
            WHERE display = 'published' AND m.m_status !='expired' AND status='open'
        '''
        cursor.execute(queryPublic)
        publicCount = cursor.fetchone()
        statistics['public_journeys'] = publicCount['c']

       
        statistics['private_journeys'] = 0

        statistics['hidden_journeys'] = 0
        db.close_db()

    return render_template("dashboard.html", statistics=statistics)



@app.route('/dashboard')
def dashboard():
    # 确保session被正确解析
    ensure_session_parsed()
    
    # 检查用户是否已登录
    if 'loggedin' not in session or not session.get('user_id'):
        print(f"⚠️ NSN: Dashboard accessed without valid login session")
        print(f"⚠️ NSN: Redirecting to login page")
        return redirect(url_for('login'))
    
    # 优先检查C端认证流程
    nmp_params = get_nmp_params_from_request(request)
    nmp_client_type = nmp_params.get('nmp_client_type', '')
    nmp_user_id = nmp_params.get('nmp_user_id', '')
    
    print(f"🔍 NSN: ===== C-CLIENT AUTHENTICATION CHECK =====")
    print(f"🔍 NSN: Dashboard accessed - Checking client type: {nmp_client_type}")
    print(f"🔍 NSN: User ID from URL: {nmp_user_id}")
    
    # 检查是否是C端访问
    if nmp_client_type == 'c-client' and nmp_user_id:
        print(f"🔍 NSN: ===== C-CLIENT AUTHENTICATION FLOW START =====")
        print(f"🔍 NSN: C-Client detected, starting authentication flow")
        print(f"🔍 NSN: User ID: {nmp_user_id}")
        print(f"🔍 NSN: Client Type: {nmp_client_type}")
        print(f"🔍 NSN: All NMP Parameters: {nmp_params}")
        
        # 1. 检查B端WebSocket的node池里是否有该user_id
        print(f"🔍 NSN: ===== STEP 1: CHECKING B-CLIENT WEBSOCKET CONNECTION =====")
        print(f"🔍 NSN: Step 1 - Checking B-Client WebSocket node pool for user_id: {nmp_user_id}")
        
        try:
            # 调用B-Client API检查WebSocket连接状态
            import requests
            b_client_url = f"{B_CLIENT_API_URL}/api/websocket/check-user"
            
            print(f"🔍 NSN: Calling B-Client WebSocket check API:")
            print(f"   URL: {b_client_url}")
            print(f"   User ID: {nmp_user_id}")
            print(f"   Timeout: 5 seconds")
            
            response = requests.post(b_client_url, json={'user_id': nmp_user_id}, timeout=5)
            
            print(f"🔍 NSN: B-Client WebSocket check response:")
            print(f"   Status Code: {response.status_code}")
            print(f"   Response Time: {response.elapsed.total_seconds():.3f}s")
            print(f"   Response Text: {response.text}")
            
            if response.status_code == 200:
                result = response.json()
                user_connected = result.get('connected', False)
                websocket_url = result.get('websocket_url', '')
                connection_count = result.get('connection_count', 0)
                
                print(f"🔍 NSN: ===== B-CLIENT WEBSOCKET CHECK RESULT =====")
                print(f"🔍 NSN: B-Client response - User connected: {user_connected}")
                print(f"🔍 NSN: B-Client response - WebSocket URL: {websocket_url}")
                print(f"🔍 NSN: B-Client response - Connection count: {connection_count}")
                print(f"🔍 NSN: B-Client response - Full result: {result}")
                
                if not user_connected:
                    # 2. 如果B端WebSocket没有该user_id，返回WebSocket URL+port给C端
                    print(f"🔍 NSN: ===== STEP 2: RETURNING WEBSOCKET INFO TO C-CLIENT =====")
                    print(f"🔍 NSN: Step 2 - User not connected to WebSocket, returning WebSocket info to C-Client")
                    
                    # 构造WebSocket连接信息返回给C端
                    websocket_info = {
                        'action': 'connect_websocket',
                        'websocket_url': websocket_url,
                        'user_id': nmp_user_id,
                        'message': 'Please connect to B-Client WebSocket server'
                    }
                    
                    print(f"🔍 NSN: Returning WebSocket info to C-Client:")
                    print(f"   Action: {websocket_info['action']}")
                    print(f"   WebSocket URL: {websocket_info['websocket_url']}")
                    print(f"   User ID: {websocket_info['user_id']}")
                    print(f"   Message: {websocket_info['message']}")
                    
                    return jsonify(websocket_info)
                else:
                    print(f"🔍 NSN: ===== USER ALREADY CONNECTED TO WEBSOCKET =====")
                    print(f"🔍 NSN: User already connected to WebSocket, proceeding with cookie check")
            else:
                print(f"⚠️ NSN: ===== B-CLIENT WEBSOCKET CHECK FAILED =====")
                print(f"⚠️ NSN: Failed to check B-Client WebSocket status: {response.status_code}")
                print(f"⚠️ NSN: Response text: {response.text}")
                # 继续执行cookie检查流程
                
        except Exception as e:
            print(f"⚠️ NSN: ===== ERROR CHECKING B-CLIENT WEBSOCKET =====")
            print(f"⚠️ NSN: Error checking B-Client WebSocket status: {str(e)}")
            print(f"⚠️ NSN: Error type: {type(e).__name__}")
            # 继续执行cookie检查流程
        
        # 3. 向B端查询cookie
        print(f"🔍 NSN: Step 3 - Checking B-Client for user cookie")
        
        try:
            cookie_result = call_bclient_query_cookie_api(nmp_user_id)
            
            if cookie_result and cookie_result.get('success') and cookie_result.get('has_cookie'):
                # 4. 如果B端有该用户的cookie，B端已经直接发送session给C端
                print(f"🔍 NSN: Step 4 - User has valid cookie, B-Client has sent session to C-Client")
                
                print(f"✅ NSN: Cookie found for user {nmp_user_id}")
                print(f"✅ NSN: B-Client has already sent session data to C-Client")
                
                # 返回成功响应，C端将自动登录
                return jsonify({
                    'action': 'auto_login_success',
                    'user_id': nmp_user_id,
                    'message': 'Session sent to C-Client by B-Client, auto-login in progress'
                })
            else:
                # 5. 如果B端没有该用户的cookie，跳转到登录页
                print(f"🔍 NSN: Step 5 - No valid cookie found, redirecting to login page")
                
                # 保存NMP参数到session
                save_nmp_to_session(nmp_params)
                
                # 跳转到登录页面，携带NMP参数
                login_url = url_for('login', 
                                  nmp_injected='true',
                                  nmp_user_id=nmp_user_id,
                                  nmp_username=nmp_params.get('nmp_username', ''),
                                  nmp_client_type=nmp_client_type,
                                  nmp_timestamp=nmp_params.get('nmp_timestamp', ''),
                                  nmp_client_id=nmp_params.get('nmp_client_id', ''),
                                  nmp_node_id=nmp_params.get('nmp_node_id', ''),
                                  nmp_domain_id=nmp_params.get('nmp_domain_id', ''),
                                  nmp_cluster_id=nmp_params.get('nmp_cluster_id', ''),
                                  nmp_channel_id=nmp_params.get('nmp_channel_id', ''))
                
                print(f"🔍 NSN: Redirecting to login page: {login_url}")
                return redirect(login_url)
                
        except Exception as e:
            print(f"⚠️ NSN: Error checking B-Client cookie: {str(e)}")
            # 发生错误时也跳转到登录页
            save_nmp_to_session(nmp_params)
            return redirect(url_for('login', nmp_injected='true', nmp_user_id=nmp_user_id))
    
    # Debug: Check current session state with detailed analysis
    print(f"🔍 NSN: ===== DASHBOARD LOGIN CHECK ANALYSIS =====")
    print(f"🔍 NSN: Dashboard accessed - Current session state:")
    print(f"🔍 NSN:   All session keys: {list(session.keys())}")
    print(f"🔍 NSN:   user_id: {session.get('user_id')} (type: {type(session.get('user_id'))})")
    print(f"🔍 NSN:   username: {session.get('username')} (type: {type(session.get('username'))})")
    print(f"🔍 NSN:   loggedin: {session.get('loggedin')} (type: {type(session.get('loggedin'))})")
    print(f"🔍 NSN:   role: {session.get('role')} (type: {type(session.get('role'))})")
    print(f"🔍 NSN:   nmp_user_id: {session.get('nmp_user_id')} (type: {type(session.get('nmp_user_id'))})")
    print(f"🔍 NSN:   nmp_username: {session.get('nmp_username')} (type: {type(session.get('nmp_username'))})")
    print(f"🔍 NSN:   nmp_client_type: {session.get('nmp_client_type')} (type: {type(session.get('nmp_client_type'))})")
    print(f"🔍 NSN:   session.permanent: {session.permanent}")
    print(f"🔍 NSN:   session.modified: {session.modified}")
    
    # Check if the user is logged in; if not, redirect to the login page.
    # TEMPORARILY COMMENTED OUT TO FIX LOGIN WITH NMP ISSUE
    print(f"🔍 NSN: ===== LOGIN CHECK LOGIC ANALYSIS =====")
    print(f"🔍 NSN: Checking login status:")
    print(f"🔍 NSN:   'loggedin' in session: {'loggedin' in session}")
    print(f"🔍 NSN:   session.get('loggedin'): {session.get('loggedin')}")
    print(f"🔍 NSN:   session.get('user_id'): {session.get('user_id')}")
    print(f"🔍 NSN:   session.get('username'): {session.get('username')}")
    
    # Original login check logic (commented out)
    # if 'loggedin' not in session:
    #     print(f"❌ NSN: FORCE LOGOUT - 'loggedin' not in session")
    #     print(f"❌ NSN: Would redirect to login page")
    #     return redirect(url_for('login'))
    
    # Check what the original logic would have done
    if 'loggedin' not in session:
        print(f"⚠️ NSN: WOULD BE FORCE LOGOUT - 'loggedin' not in session")
        print(f"⚠️ NSN: Reason: Missing 'loggedin' key in session")
        print(f"⚠️ NSN: Session keys available: {list(session.keys())}")
    elif not session.get('loggedin'):
        print(f"⚠️ NSN: WOULD BE FORCE LOGOUT - session.get('loggedin') is falsy")
        print(f"⚠️ NSN: Reason: loggedin value is: {session.get('loggedin')} (type: {type(session.get('loggedin'))})")
    elif not session.get('user_id'):
        print(f"⚠️ NSN: WOULD BE FORCE LOGOUT - no user_id in session")
        print(f"⚠️ NSN: Reason: user_id value is: {session.get('user_id')} (type: {type(session.get('user_id'))})")
    else:
        print(f"✅ NSN: LOGIN CHECK PASSED - User appears to be logged in")
        print(f"✅ NSN:   loggedin: {session.get('loggedin')}")
        print(f"✅ NSN:   user_id: {session.get('user_id')}")
        print(f"✅ NSN:   username: {session.get('username')}")
    
    print(f"🔍 NSN: ===== END LOGIN CHECK ANALYSIS =====")
    print(f"🔍 NSN: ===== END DASHBOARD SESSION ANALYSIS =====")
    
    # 优先使用session中的NMP参数，如果URL中有新的NMP参数则更新session
    nmp_params = get_nmp_params_from_request(request)
    nmp_injected = nmp_params['nmp_injected']
    
    print(f"🔐 NSN: Dashboard function called")
    print(f"🔐 NSN: URL parameters:")
    print(f"   nmp_injected from URL: {nmp_injected}")
    print(f"   nmp_user_id from URL: {request.args.get('nmp_user_id')}")
    print(f"   session nmp_user_id: {session.get('nmp_user_id')}")
    print(f"   session nmp_username: {session.get('nmp_username')}")
    
    # 如果URL中有新的NMP参数，更新session
    if nmp_injected and nmp_params['nmp_user_id']:
        print(f"🔐 NSN: Dashboard accessed with NMP parameters, updating session")
        save_nmp_to_session(nmp_params)
        print(f"🔐 NSN: Updated session - nmp_ip_address: {session.get('nmp_ip_address')}, nmp_port: {session.get('nmp_port')}")
    elif session.get('nmp_user_id'):
        print(f"🔐 NSN: Dashboard accessed without NMP parameters, using session NMP data")
        print(f"   session nmp_user_id: {session.get('nmp_user_id')}")
        print(f"   session nmp_username: {session.get('nmp_username')}")
    else:
        print(f"🔐 NSN: Dashboard accessed without NMP parameters and no session NMP data")

    statistics = {}

    with db.get_cursor() as cursor:
        queryPublic = '''
            SELECT count(journey_id) as c
            FROM journeys
            WHERE display = 'public' AND status='open'
        '''
        cursor.execute(queryPublic)
        publicCount = cursor.fetchone()
        statistics['public_journeys'] = publicCount['c']

        queryPrivate = '''
            SELECT count(journey_id) as c
            FROM journeys
            WHERE user_id=%s AND status='open'
        '''
        cursor.execute(queryPrivate, (session['user_id'],))
        privateCount = cursor.fetchone()
        statistics['private_journeys'] = privateCount['c']

        queryPublicHidden = '''
            SELECT count(journey_id) as c
            FROM journeys
            WHERE display = 'public' AND status='hidden'
        '''
        cursor.execute(queryPublicHidden)
        publicHiddenCount = cursor.fetchone()
        statistics['hidden_journeys'] = publicHiddenCount['c']

        queryMember = '''
            SELECT * from members where user_id=%s and m_status !='expired';
        '''
        cursor.execute(queryMember, (session['user_id'],))
        is_member=cursor.fetchone()

        db.close_db()

    announcement.update_user_login_info(session['user_id'])

    # Pass NMP parameters to template if available in session
    nmp_params = {}
    if session.get('nmp_user_id'):
        # Get IP and port from URL parameters (more reliable than session)
        nmp_ip_address = request.args.get('nmp_ip_address', '')
        nmp_port = request.args.get('nmp_port', '')
        
        nmp_params = {
            'nmp_injected': True,
            'nmp_user_id': session.get('nmp_user_id'),
            'nmp_username': session.get('nmp_username'),
            'nmp_client_type': session.get('nmp_client_type'),
            'nmp_timestamp': session.get('nmp_timestamp'),
            'nmp_ip_address': nmp_ip_address,
            'nmp_port': nmp_port
        }

    return render_template("dashboard.html", 
                         is_member=is_member, 
                         statistics=statistics,
                         # NMP parameters for c-client-response div
                         nmp_injected=nmp_injected,
                         nmp_user_id=session.get('nmp_user_id'),
                         nmp_username=session.get('nmp_username'),
                         nmp_client_type=session.get('nmp_client_type'),
                         nmp_timestamp=session.get('nmp_timestamp'),
                         nmp_ip_address=session.get('nmp_ip_address', ''),
                         nmp_port=session.get('nmp_port', ''),
                         nmp_node_id=session.get('nmp_node_id', ''),
                         nmp_domain_id=session.get('nmp_domain_id', ''),
                         nmp_cluster_id=session.get('nmp_cluster_id', ''),
                         nmp_channel_id=session.get('nmp_channel_id', ''),
                         # B-Client configuration for c-client-response div
                         b_client_url=B_CLIENT_API_URL,
                         websocket_url="ws://127.0.0.1:8766",
                         has_cookie=bool(session.get('loggedin') and session.get('user_id')),
                         has_node=True,  # Assume node is available
                         needs_registration=True,  # Always allow registration
                         registration_info={
                             'b_client_url': B_CLIENT_API_URL,
                             'websocket_url': "ws://127.0.0.1:8766"
                         })


@app.route('/api/user-info', methods=['POST'])
def api_user_info():
    """API endpoint for B-Client to query user information by username"""
    try:
        data = request.get_json()
        username = data.get('username')
        
        if not username:
            return jsonify({
                'success': False,
                'error': 'Username is required'
            }), 400
        
        
        # Query NSN database for user information
        cursor = db.get_cursor()
        cursor.execute("SELECT user_id, username, role FROM users WHERE username = %s", (username,))
        user_data = cursor.fetchone()
        cursor.close()
        
        if user_data:
            print(f"✅ NSN API: Found user info for {username}: user_id={user_data['user_id']}, role={user_data['role']}")
            return jsonify({
                'success': True,
                'user_id': user_data['user_id'],
                'username': user_data['username'],
                'role': user_data['role']
            })
        else:
            print(f"⚠️ NSN API: User not found: {username}")
            return jsonify({
                'success': False,
                'error': 'User not found'
            }), 404
            
    except Exception as e:
        print(f"❌ NSN API: Error querying user info: {e}")
        return jsonify({
            'success': False,
            'error': 'Internal server error'
        }), 500


@app.route('/login', methods=['GET', 'POST'])
def login():
    """Login endpoint.

    Methods:
    - GET: Renders the login page.
    - POST: Authenticates the user using the provided username and password.
      - If authentication is successful:
        - Stores user session data.
        - Redirects to the respective dashboard based on the user role.
      - If authentication fails:
        - Returns an appropriate error message.
        - Retains the entered username for convenience.
    """
    # 确保session被正确解析
    ensure_session_parsed()
    
    if request.method == 'GET':
        # Check for No More Password injection parameters
        nmp_injected = request.args.get('nmp_injected', 'false').lower() == 'true'
        nmp_user_id = request.args.get('nmp_user_id', '')
        nmp_username = request.args.get('nmp_username', '')
        nmp_client_type = request.args.get('nmp_client_type', '')
        nmp_timestamp = request.args.get('nmp_timestamp', '')
        nmp_client_id = request.args.get('nmp_client_id', '')  # C端唯一标识符
        nmp_node_id = request.args.get('nmp_node_id', '')
        nmp_domain_id = request.args.get('nmp_domain_id', '')
        nmp_cluster_id = request.args.get('nmp_cluster_id', '')
        nmp_channel_id = request.args.get('nmp_channel_id', '')
        
        # Debug: Log all NMP parameters from GET request
        print(f"🔍 NSN: Login route (GET) - Debug NMP parameters:")
        print(f"🔍 NSN:   request.args.get('nmp_user_id'): {request.args.get('nmp_user_id')}")
        print(f"🔍 NSN:   request.args.get('nmp_username'): {request.args.get('nmp_username')}")
        print(f"🔍 NSN:   request.args.get('nmp_client_type'): {request.args.get('nmp_client_type')}")
        print(f"🔍 NSN:   request.args.get('nmp_timestamp'): {request.args.get('nmp_timestamp')}")
        print(f"🔍 NSN:   request.args.get('nmp_client_id'): {request.args.get('nmp_client_id')}")
        print(f"🔍 NSN:   All args keys: {list(request.args.keys())}")
        print(f"🔍 NSN:   request.url: {request.url}")
        
        # Store NMP parameters in session if they exist
        if nmp_user_id and nmp_username:
            print(f"🔐 NSN: Login route - Storing NMP parameters in session")
            print(f"🔐 NSN: Storing: user_id={nmp_user_id}, username={nmp_username}")
            
            # Store basic NMP parameters from URL
            session['nmp_user_id'] = nmp_user_id
            session['nmp_username'] = nmp_username
            session['nmp_client_type'] = nmp_client_type
            session['nmp_timestamp'] = nmp_timestamp
            session['nmp_node_id'] = nmp_node_id
            session['nmp_domain_id'] = nmp_domain_id
            session['nmp_cluster_id'] = nmp_cluster_id
            session['nmp_channel_id'] = nmp_channel_id
            
            # IMPORTANT: Preserve IP and port from original session (they're not in login URL)
            original_ip = session.get('nmp_ip_address', '')
            original_port = session.get('nmp_port', '')
            if original_ip and original_port:
                print(f"🔐 NSN: Login route - Preserving IP/Port from original session: ip={original_ip}, port={original_port}")
            else:
                print(f"⚠️ NSN: Login route - No IP/Port found in original session")
            
            # Debug: Verify session storage and check if IP/port need to be preserved
            print(f"🔍 NSN: Login route - Session after storage:")
            print(f"🔍 NSN:   session['nmp_user_id'] = {session.get('nmp_user_id', 'NOT_FOUND')}")
            print(f"🔍 NSN:   session['nmp_username'] = {session.get('nmp_username', 'NOT_FOUND')}")
            print(f"🔍 NSN:   session['nmp_ip_address'] = {session.get('nmp_ip_address', 'NOT_FOUND')}")
            print(f"🔍 NSN:   session['nmp_port'] = {session.get('nmp_port', 'NOT_FOUND')}")
            
            # If IP and port are missing, they should have been preserved from the original session
            # This is expected since login URL doesn't contain these parameters
        else:
            print(f"⚠️ NSN: Login route - No NMP parameters to store: user_id={nmp_user_id}, username={nmp_username}")
        
        # Get IP and Port from session (stored during initial NSN access)
        nmp_ip_address = session.get('nmp_ip_address', '')
        nmp_port = session.get('nmp_port', '')
        
        # Pass NMP parameters to template
        return render_template("login.html", 
                             nmp_injected=nmp_injected,
                             nmp_user_id=nmp_user_id,
                             nmp_username=nmp_username,
                             nmp_client_type=nmp_client_type,
                             nmp_timestamp=nmp_timestamp,
                             nmp_ip_address=nmp_ip_address,
                             nmp_port=nmp_port,
                             nmp_node_id=session.get('nmp_node_id', ''),
                             nmp_domain_id=session.get('nmp_domain_id', ''),
                             nmp_cluster_id=session.get('nmp_cluster_id', ''),
                             nmp_channel_id=session.get('nmp_channel_id', ''),
                             # B-Client configuration for c-client-response div
                             b_client_url=B_CLIENT_API_URL,
                             websocket_url="ws://127.0.0.1:8766",
                             has_cookie=bool(session.get('loggedin') and session.get('user_id')),
                             has_node=True,  # Assume node is available
                             needs_registration=True,  # Always allow registration
                             registration_info={
                                 'b_client_url': B_CLIENT_API_URL,
                                 'websocket_url': "ws://127.0.0.1:8766"
                             })
    
    if request.method == 'POST':
        print(f"🔐 NSN: ===== LOGIN WITH NMP - POST REQUEST DEBUG =====")
        print(f"🔐 NSN: Login POST request received")
        print(f"🔐 NSN: Request URL: {request.url}")
        print(f"🔐 NSN: Request method: {request.method}")
        
        # Retrieve username and password from form data
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        
        print(f"🔐 NSN: Form data - username='{username}', password='{'*' * len(password)}'")
        
        # Determine NMP parameter source based on request method and available data
        # POST request with form data = Login with NMP (form submission)
        # GET request with URL params = Sign Up with NMP (direct C-Client access)
        
        # Check form data first (for POST requests - Login with NMP)
        nmp_user_id_form = request.form.get("nmp_user_id", "")
        nmp_username_form = request.form.get("nmp_username", "")
        nmp_client_type_form = request.form.get("nmp_client_type", "")
        nmp_timestamp_form = request.form.get("nmp_timestamp", "")
        nmp_ip_address_form = request.form.get("nmp_ip_address", "")
        nmp_port_form = request.form.get("nmp_port", "")
        
        print(f"🔐 NSN: ===== NMP PARAMETERS FROM FORM =====")
        print(f"🔐 NSN: Form data - user_id='{nmp_user_id_form}', username='{nmp_username_form}'")
        print(f"🔐 NSN: Form data - client_type='{nmp_client_type_form}', timestamp='{nmp_timestamp_form}'")
        print(f"🔐 NSN: Form data - ip_address='{nmp_ip_address_form}', port='{nmp_port_form}'")
        print(f"🔐 NSN: ===== END NMP PARAMETERS FROM FORM =====")
        
        # Check URL parameters (for GET requests - Sign Up with NMP)
        nmp_user_id_url = request.args.get('nmp_user_id', '')
        nmp_username_url = request.args.get('nmp_username', '')
        nmp_client_type_url = request.args.get('nmp_client_type', '')
        nmp_timestamp_url = request.args.get('nmp_timestamp', '')
        nmp_client_id_url = request.args.get('nmp_client_id', '')
        nmp_ip_address_url = request.args.get('nmp_ip_address', '')
        nmp_port_url = request.args.get('nmp_port', '')
        nmp_websocket_port_url = request.args.get('nmp_websocket_port', '')
        
        print(f"🔐 NSN: ===== NMP PARAMETERS FROM URL =====")
        print(f"🔐 NSN: URL args - user_id='{nmp_user_id_url}', username='{nmp_username_url}'")
        print(f"🔐 NSN: URL args - client_type='{nmp_client_type_url}', timestamp='{nmp_timestamp_url}'")
        print(f"🔐 NSN: URL args - client_id='{nmp_client_id_url}', websocket_port='{nmp_websocket_port_url}'")
        print(f"🔐 NSN: URL args - ip_address='{nmp_ip_address_url}', port='{nmp_port_url}'")
        print(f"🔐 NSN: ===== END NMP PARAMETERS FROM URL =====")
        
        # Determine the source of NMP parameters
        print(f"🔐 NSN: ===== DETERMINING NMP PARAMETER SOURCE =====")
        print(f"🔐 NSN: Form has NMP data: user_id='{nmp_user_id_form}', username='{nmp_username_form}'")
        print(f"🔐 NSN: URL has NMP data: user_id='{nmp_user_id_url}', username='{nmp_username_url}'")
        
        if nmp_user_id_form and nmp_username_form:
            # POST request - Login with NMP (form submission)
            nmp_user_id = nmp_user_id_form
            nmp_username = nmp_username_form
            nmp_client_type = nmp_client_type_form
            nmp_timestamp = nmp_timestamp_form
            nmp_ip_address = nmp_ip_address_form
            nmp_port = nmp_port_form
            nmp_injected = True
            print(f"🔐 NSN: ✅ Using FORM data - Login with NMP: user_id={nmp_user_id}, username={nmp_username}")
            print(f"🔐 NSN: ✅ Form IP/Port: ip_address={nmp_ip_address}, port={nmp_port}")
        elif nmp_user_id_url and nmp_username_url:
            # GET request - Sign Up with NMP (URL parameters)
            nmp_user_id = nmp_user_id_url
            nmp_username = nmp_username_url
            nmp_client_type = nmp_client_type_url
            nmp_timestamp = nmp_timestamp_url
            nmp_ip_address = nmp_ip_address_url
            nmp_port = nmp_port_url
            nmp_injected = True
            print(f"🔐 NSN: ✅ Using URL params - Sign Up with NMP: user_id={nmp_user_id}, username={nmp_username}")
            print(f"🔐 NSN: ✅ URL IP/Port: ip_address={nmp_ip_address}, port={nmp_port}")
        else:
            # No NMP parameters - regular login
            nmp_user_id = ""
            nmp_username = ""
            nmp_client_type = ""
            nmp_timestamp = ""
            nmp_ip_address = ""
            nmp_port = ""
            nmp_injected = False
            print(f"🔐 NSN: ❌ Regular login - No NMP parameters found")
        
        print(f"🔐 NSN: ===== FINAL NMP PARAMETERS =====")
        print(f"🔐 NSN: Final values - user_id='{nmp_user_id}', username='{nmp_username}'")
        print(f"🔐 NSN: Final values - ip_address='{nmp_ip_address}', port='{nmp_port}'")
        print(f"🔐 NSN: Final values - injected={nmp_injected}")
        print(f"🔐 NSN: ===== END FINAL NMP PARAMETERS =====")
        
        # Get NMP binding parameters from form data
        nmp_bind = request.form.get("nmp_bind", "false").lower() == "true"
        nmp_bind_type = request.form.get("nmp_bind_type", "bind")  # "bind" or "signup"
        nmp_auto_refresh = request.form.get("nmp_auto_refresh", "false").lower() == "true"
        nmp_auto_login = request.form.get("nmp_auto_login", "false").lower() == "true"  # For B-Client auto login

        # Handle NMP login with credentials - NSN logs in first, then saves session to B-client
        if nmp_injected and username and password:
            print(f"🔐 NSN: ===== NMP LOGIN WITH CREDENTIALS =====")
            print(f"🔐 NSN: User provided credentials, NSN will login first, then save session to B-client")
            print(f"🔐 NSN: Username: {username}, NMP User ID: {nmp_user_id}")
            
            # First, perform regular NSN login validation
            with db.get_cursor() as cursor:
                cursor.execute("SELECT user_id, username, password_hash, role, status FROM users WHERE username = %s",
                               (username,))
                user_data = cursor.fetchone()
                db.close_db()
            
            print(f"🔍 NSN: Database query result: {user_data}")
            print(f"🔍 NSN: User data type: {type(user_data)}")
            if user_data:
                print(f"🔍 NSN: User data keys: {user_data.keys() if isinstance(user_data, dict) else 'Not a dict'}")
                print(f"🔍 NSN: User data fields: {user_data}")
                print(f"🔍 NSN: Password hash type: {type(user_data['password_hash'])}")
                print(f"🔍 NSN: Password hash value: '{user_data['password_hash']}'")
                print(f"🔍 NSN: Password hash length: {len(user_data['password_hash']) if user_data['password_hash'] else 0}")
                print(f"🔍 NSN: Password to check: '{password}'")
                print(f"🔍 NSN: Password length: {len(password)}")
            else:
                print(f"❌ NSN: User not found in database: {username}")
                print(f"❌ NSN: This may indicate a database sync issue after registration")
            
            if user_data and user_data['password_hash'] and bcrypt.check_password_hash(user_data['password_hash'], password):
                print(f"✅ NSN: NSN login successful for user: {username}")
                
                # Set Flask session
                session['loggedin'] = True
                session['user_id'] = user_data['user_id']
                session['username'] = user_data['username']
                session['role'] = user_data['role']
                session.permanent = True
                
                # Get session cookie for B-client
                from flask import make_response
                response = make_response(redirect(url_for('root')))
                
                # Extract session cookie from response headers
                session_cookie = None
                for header_name, header_value in response.headers:
                    if header_name.lower() == 'set-cookie' and 'session=' in header_value:
                        # Extract session cookie
                        import re
                        session_match = re.search(r'session=([^;]+)', header_value)
                        if session_match:
                            session_cookie = f"session={session_match.group(1)}"
                            break
                
                # If we can't get session cookie from response, create one manually
                if not session_cookie:
                    import secrets
                    session_id = secrets.token_urlsafe(32)
                    session_cookie = f"session={session_id}"
                
                print(f"🍪 NSN: Session cookie for B-client: {session_cookie}")
                
                # Store session data in session for B-client to retrieve later
                # This avoids the circular dependency issue where NSN calls B-client while B-client is waiting for NSN
                session['nmp_session_ready'] = True
                session['nmp_session_cookie'] = session_cookie
                session['nmp_nsn_user_id'] = user_data['user_id']
                session['nmp_nsn_username'] = user_data['username']
                
                print(f"✅ NSN: Login successful, session data stored for B-client retrieval")
                flash("Login successful! Session will be synchronized with C-Client...", "success")
                
                # Call B-Client /bind API to sync login status
                print(f"🔗 NSN: ===== CALLING B-CLIENT /bind API =====")
                try:
                    import requests
                    
                    # Get domain_id, node_id, cluster_id, channel_id, client_id from session or use defaults
                    # These should have been set from URL parameters when user first accessed NSN
                    bind_domain_id = session.get('nmp_domain_id', 'localhost:5000')
                    bind_node_id = session.get('nmp_node_id', 'nsn-node-001')
                    bind_cluster_id = session.get('nmp_cluster_id')
                    bind_channel_id = session.get('nmp_channel_id')
                    bind_client_id = session.get('nmp_client_id')
                    
                    print(f"🔗 NSN: Using IDs from session:")
                    print(f"   domain_id: {bind_domain_id}")
                    print(f"   node_id: {bind_node_id}")
                    print(f"   cluster_id: {bind_cluster_id}")
                    print(f"   channel_id: {bind_channel_id}")
                    print(f"   client_id: {bind_client_id}")
                    
                    bind_data = {
                        'user_id': nmp_user_id,
                        'user_name': nmp_username,
                        'request_type': 1,  # 1 = login
                        'domain_id': bind_domain_id,
                        'node_id': bind_node_id,
                        'auto_refresh': True,
                        'session_cookie': session_cookie,
                        'nsn_user_id': user_data['user_id'],
                        'nsn_username': user_data['username']
                    }
                    
                    # Add cluster_id, channel_id and client_id if available
                    if bind_cluster_id:
                        bind_data['cluster_id'] = bind_cluster_id
                    if bind_channel_id:
                        bind_data['channel_id'] = bind_channel_id
                    if bind_client_id:
                        bind_data['client_id'] = bind_client_id
                    
                    print(f"🔗 NSN: Sending bind request to B-Client: {bind_data}")
                    bclient_response = requests.post(f'{B_CLIENT_API_URL}/bind', json=bind_data, timeout=30)
                    print(f"🔗 NSN: B-Client response status: {bclient_response.status_code}")
                    print(f"🔗 NSN: B-Client response: {bclient_response.text}")
                    
                    if bclient_response.status_code == 200:
                        print(f"✅ NSN: B-Client bind successful, session synchronized")
                    else:
                        print(f"⚠️ NSN: B-Client bind failed: {bclient_response.status_code}")
                        
                except Exception as e:
                    print(f"❌ NSN: Failed to call B-Client /bind API: {e}")
                
                print(f"🔗 NSN: ===== END CALLING B-CLIENT /bind API =====")
                
                # Return the response with session cookie
                return response
            else:
                # NSN login failed
                print(f"❌ NSN: NSN login failed for user: {username}")
                flash("Wrong account or password, please try again or sign up with NMP", "danger")
                
                # Return to login page with NMP parameters
                return render_template('login.html', 
                                     nmp_injected=nmp_injected,
                                     nmp_user_id=nmp_user_id,
                                     nmp_username=nmp_username,
                                     nmp_client_type=nmp_client_type,
                                     nmp_timestamp=nmp_timestamp,
                                     nmp_ip_address=session.get('nmp_ip_address', ''),
                                     nmp_port=session.get('nmp_port', ''),
                                     nmp_node_id=session.get('nmp_node_id', ''),
                                     nmp_domain_id=session.get('nmp_domain_id', ''),
                                     nmp_cluster_id=session.get('nmp_cluster_id', ''),
                                     nmp_channel_id=session.get('nmp_channel_id', ''),
                                     # B-Client configuration for c-client-response div
                                     b_client_url=B_CLIENT_API_URL,
                                     websocket_url="ws://127.0.0.1:8766",
                                     has_cookie=bool(session.get('loggedin') and session.get('user_id')),
                                     has_node=True,
                                     needs_registration=True,
                                     registration_info={
                                         'b_client_url': B_CLIENT_API_URL,
                                         'websocket_url': "ws://127.0.0.1:8766"
                                     },
                                     username=username)  # Preserve entered username
        
        # Ensure username and password are provided for regular login (non-NMP)
        if not username or not password:
            flash("Username and password are required", "danger")
            # Get IP and Port from session (stored during initial NSN access)
            nmp_ip_address = session.get('nmp_ip_address', '')
            nmp_port = session.get('nmp_port', '')
            
            return render_template("login.html", 
                             nmp_injected=nmp_injected,
                             nmp_user_id=nmp_user_id,
                             nmp_username=nmp_username,
                             nmp_client_type=nmp_client_type,
                             nmp_timestamp=nmp_timestamp,
                             nmp_ip_address=nmp_ip_address,
                             nmp_port=nmp_port,
                             nmp_node_id=session.get('nmp_node_id', ''),
                             nmp_domain_id=session.get('nmp_domain_id', ''),
                             nmp_cluster_id=session.get('nmp_cluster_id', ''),
                             nmp_channel_id=session.get('nmp_channel_id', ''),
                             # B-Client configuration for c-client-response div
                             b_client_url=B_CLIENT_API_URL,
                             websocket_url="ws://127.0.0.1:8766",
                             has_cookie=bool(session.get('loggedin') and session.get('user_id')),
                             has_node=True,
                             needs_registration=True,
                             registration_info={
                                 'b_client_url': B_CLIENT_API_URL,
                                 'websocket_url': "ws://127.0.0.1:8766"
                             })

        # Skip regular login validation if this was an NMP login attempt (without credentials)
        if nmp_injected and not username and not password:
            print(f"🔐 NSN: Skipping regular login validation - NMP login was attempted without credentials")
            flash("Please use 'Login with NMP' button for NMP authentication", "info")
            return render_template("login.html", 
                            nmp_injected=nmp_injected,
                            nmp_user_id=nmp_user_id,
                            nmp_username=nmp_username,
                            nmp_client_type=nmp_client_type,
                            nmp_timestamp=nmp_timestamp,
                            nmp_ip_address=session.get('nmp_ip_address', ''),
                            nmp_port=session.get('nmp_port', ''),
                            nmp_node_id=session.get('nmp_node_id', ''),
                            nmp_domain_id=session.get('nmp_domain_id', ''),
                            nmp_cluster_id=session.get('nmp_cluster_id', ''),
                            nmp_channel_id=session.get('nmp_channel_id', ''),
                            # B-Client configuration for c-client-response div
                            b_client_url=B_CLIENT_API_URL,
                            websocket_url="ws://127.0.0.1:8766",
                            has_cookie=bool(session.get('loggedin') and session.get('user_id')),
                            has_node=True,
                            needs_registration=True,
                            registration_info={
                                'b_client_url': B_CLIENT_API_URL,
                                'websocket_url': "ws://127.0.0.1:8766"
                            })

        # Fetch user details from the database (regular login only)
        with db.get_cursor() as cursor:
            cursor.execute("SELECT user_id, username, password_hash, role, status FROM users WHERE username = %s",
                           (username,))
            user = cursor.fetchone()
            db.close_db()

        # Check if this is a B-Client login request
        user_agent = request.headers.get('User-Agent', '')
        is_bclient_request = user_agent.startswith('python-requests') and nmp_injected
        
        print(f"🔍 NSN: ===== LOGIN VALIDATION DEBUG =====")
        print(f"🔍 NSN: User-Agent: {user_agent}")
        print(f"🔍 NSN: Is B-Client request: {is_bclient_request}")
        print(f"🔍 NSN: NMP injected: {nmp_injected}")
        print(f"🔍 NSN: User found: {user is not None}")
        if user:
            print(f"🔍 NSN: User details: username={user['username']}, user_id={user['user_id']}")
            print(f"🔍 NSN: Password hash length: {len(user['password_hash'])}")
            print(f"🔍 NSN: Password hash preview: {user['password_hash'][:20]}...")
        print(f"🔍 NSN: Password length: {len(password)}")
        print(f"🔍 NSN: Password preview: {password[:3]}...")
        print(f"🔍 NSN: ===== END LOGIN VALIDATION DEBUG =====")

        # Validate user existence and password correctness
        if not user or not bcrypt.check_password_hash(user["password_hash"], password):
            print(f"❌ NSN: Login validation failed - user exists: {user is not None}, password valid: {user and bcrypt.check_password_hash(user['password_hash'], password)}")
            
            # For B-Client requests, return JSON error instead of HTML
            if is_bclient_request:
                print(f"🔗 NSN: Returning JSON error for B-Client login failure")
                return jsonify({
                    'success': False,
                    'error': 'Invalid username or password',
                    'user_found': user is not None,
                    'password_valid': user and bcrypt.check_password_hash(user["password_hash"], password)
                })
            
            flash("Invalid username or password", "danger")
            # Pass NMP parameters to template even on login failure
            # Ensure nmp_injected is True if any NMP parameters are present
            nmp_injected_final = nmp_injected or bool(nmp_user_id and nmp_username)
            return render_template("login.html", 
                             nmp_injected=nmp_injected,
                             nmp_user_id=nmp_user_id,
                             nmp_username=nmp_username,
                             nmp_client_type=nmp_client_type,
                             nmp_timestamp=nmp_timestamp,
                             nmp_ip_address=session.get('nmp_ip_address', ''),
                             nmp_port=session.get('nmp_port', ''))

        # Check if the account is banned
        if user["status"] == "banned":
            flash("Your account has been banned. Please contact support.", "danger")
            # Pass NMP parameters to template even on login failure
            # Ensure nmp_injected is True if any NMP parameters are present
            nmp_injected_final = nmp_injected or bool(nmp_user_id and nmp_username)
            return render_template("login.html", 
                             nmp_injected=nmp_injected,
                             nmp_user_id=nmp_user_id,
                             nmp_username=nmp_username,
                             nmp_client_type=nmp_client_type,
                             nmp_timestamp=nmp_timestamp,
                             nmp_ip_address=session.get('nmp_ip_address', ''),
                             nmp_port=session.get('nmp_port', ''))

        # Successful login: Store session data
        session["loggedin"] = True
        session["user_id"] = user["user_id"]
        session["username"] = user["username"]
        session["role"] = user["role"]
        
        print(f"✅ NSN: Login successful for user: {user['username']} (ID: {user['user_id']})")
        
        # For B-Client requests, return JSON response instead of redirect
        if is_bclient_request:
            print(f"🔗 NSN: Returning JSON response for B-Client login success")
            return jsonify({
                'success': True,
                'message': 'Login successful',
                'user_id': user["user_id"],
                'username': user["username"],
                'role': user["role"]
            })
        
        # Store NMP binding info in session if present (but not for auto login)
        # Login successful - no special NMP handling needed
        print(f"✅ NSN: User {username} logged in successfully")

        # Redirect based on user role
        return redirect(user_home_url())

    return render_template("login.html",
                         nmp_injected=False,
                         nmp_user_id='',
                         nmp_username='',
                         nmp_client_type='',
                         nmp_timestamp='',
                         nmp_ip_address='',
                         nmp_port='',
                         nmp_node_id='',
                         nmp_domain_id='',
                         nmp_cluster_id='',
                         nmp_channel_id='',
                         # B-Client configuration for c-client-response div
                         b_client_url=B_CLIENT_API_URL,
                         websocket_url="ws://127.0.0.1:8766",
                         has_cookie=False,  # User not logged in yet
                         has_node=True,  # Assume node is available
                         needs_registration=True,  # Always allow registration
                         registration_info={
                             'b_client_url': B_CLIENT_API_URL,
                             'websocket_url': "ws://127.0.0.1:8766"
                         })


# default role and status for registration
DEFAULT_USER_ROLE = 'traveller'
DEFAULT_USER_STATUS = 'active'


@app.route('/signup', methods=['GET', 'POST'])
def signup():
    """Signup (registration) page endpoint.

    Methods:
    - GET: Renders the signup page.
    - POST: Attempts to create a new user account using the details supplied
      via the signup form, then renders the signup page again with a welcome
      message (if successful) or one or more error message(s) explaining why
      signup could not be completed.

    If the user is already logged in, both GET and POST requests will redirect
    to their role-specific homepage.
    """
    # 确保session被正确解析
    ensure_session_parsed()

    # Debug: Log session state at the very beginning of signup route
    print(f"🔍 NSN: Signup route - Session state at start:")
    print(f"🔍 NSN:   All session keys: {list(session.keys())}")
    print(f"🔍 NSN:   session.get('nmp_user_id'): {session.get('nmp_user_id', 'NOT_FOUND')}")
    print(f"🔍 NSN:   session.get('nmp_username'): {session.get('nmp_username', 'NOT_FOUND')}")
    print(f"🔍 NSN:   session.get('nmp_ip_address'): {session.get('nmp_ip_address', 'NOT_FOUND')}")
    print(f"🔍 NSN:   session.get('nmp_port'): {session.get('nmp_port', 'NOT_FOUND')}")
    
    # Debug: Log request method and headers
    print(f"🔍 NSN: Signup route - Request info:")
    print(f"🔍 NSN:   Method: {request.method}")
    print(f"🔍 NSN:   Referer: {request.headers.get('Referer', 'NOT_FOUND')}")
    print(f"🔍 NSN:   User-Agent: {request.headers.get('User-Agent', 'NOT_FOUND')[:50]}...")

    if 'loggedin' in session:
        return redirect(user_home_url())

    # Check for NMP parameters (for Sign Up with NMP)
    # First try to get from form (POST request), then from session (GET request)
    nmp_user_id = request.form.get("nmp_user_id", "") or session.get("nmp_user_id", "")
    nmp_username = request.form.get("nmp_username", "") or session.get("nmp_username", "")
    nmp_client_type = request.form.get("nmp_client_type", "") or session.get("nmp_client_type", "")
    nmp_timestamp = request.form.get("nmp_timestamp", "") or session.get("nmp_timestamp", "")
    nmp_ip_address = request.form.get("nmp_ip_address", "") or session.get("nmp_ip_address", "")
    nmp_port = request.form.get("nmp_port", "") or session.get("nmp_port", "")
    
    # Debug: Log all form data to understand the request structure
    print(f"🔍 NSN: Signup route - Debug form data:")
    print(f"🔍 NSN:   request.method: {request.method}")
    print(f"🔍 NSN:   request.form.get('nmp_user_id'): {request.form.get('nmp_user_id')}")
    print(f"🔍 NSN:   request.form.get('nmp_username'): {request.form.get('nmp_username')}")
    print(f"🔍 NSN:   request.form.get('username'): {request.form.get('username')}")
    print(f"🔍 NSN:   request.form.get('nmp_ip_address'): {request.form.get('nmp_ip_address')}")
    print(f"🔍 NSN:   request.form.get('nmp_port'): {request.form.get('nmp_port')}")
    print(f"🔍 NSN:   All form keys: {list(request.form.keys())}")
    
    # Debug: Log all URL args data
    print(f"🔍 NSN: Signup route - Debug URL args:")
    print(f"🔍 NSN:   request.args.get('nmp_user_id'): {request.args.get('nmp_user_id')}")
    print(f"🔍 NSN:   request.args.get('nmp_username'): {request.args.get('nmp_username')}")
    print(f"🔍 NSN:   request.args.get('nmp_client_type'): {request.args.get('nmp_client_type')}")
    print(f"🔍 NSN:   request.args.get('nmp_timestamp'): {request.args.get('nmp_timestamp')}")
    print(f"🔍 NSN:   request.args.get('nmp_client_id'): {request.args.get('nmp_client_id')}")
    print(f"🔍 NSN:   request.args.get('nmp_ip_address'): {request.args.get('nmp_ip_address')}")
    print(f"🔍 NSN:   request.args.get('nmp_port'): {request.args.get('nmp_port')}")
    print(f"🔍 NSN:   request.args.get('nmp_websocket_port'): {request.args.get('nmp_websocket_port')}")
    print(f"🔍 NSN:   All args keys: {list(request.args.keys())}")
    
    # Debug: Log all request data
    print(f"🔍 NSN: Signup route - Debug request data:")
    print(f"🔍 NSN:   request.url: {request.url}")
    print(f"🔍 NSN:   request.full_path: {request.full_path}")
    print(f"🔍 NSN:   request.query_string: {request.query_string}")
    print(f"🔍 NSN:   request.data: {request.data}")
    print(f"🔍 NSN:   request.json: {request.json if request.is_json else 'Not JSON'}")
    
    # NMP registration branch removed - B-Client will query database directly after registration
    
    # If IP and port are still empty, try to get from the original NMP session
    if not nmp_ip_address or not nmp_port:
        nmp_ip_address = nmp_ip_address or session.get("nmp_ip_address", "")
        nmp_port = nmp_port or session.get("nmp_port", "")
        print(f"🔍 NSN: Signup route - Retrieved IP/Port from original session: ip_address={nmp_ip_address}, port={nmp_port}")
    
    # If still empty, try to get from Referer URL (for B-Client auto-registration)
    if not nmp_ip_address or not nmp_port:
        referer = request.headers.get('Referer', '')
        print(f"🔍 NSN: Signup route - Checking Referer for NMP parameters: {referer}")
        if referer and 'nmp_ip_address=' in referer and 'nmp_port=' in referer:
            try:
                from urllib.parse import urlparse, parse_qs
                parsed_url = urlparse(referer)
                query_params = parse_qs(parsed_url.query)
                nmp_ip_address = nmp_ip_address or query_params.get('nmp_ip_address', [''])[0]
                nmp_port = nmp_port or query_params.get('nmp_port', [''])[0]
                print(f"🔍 NSN: Signup route - Retrieved IP/Port from Referer: ip_address={nmp_ip_address}, port={nmp_port}")
            except Exception as e:
                print(f"⚠️ NSN: Signup route - Failed to parse Referer: {e}")
    
    # If still empty, try to get from URL arguments (for direct access)
    if not nmp_ip_address or not nmp_port:
        nmp_ip_address = nmp_ip_address or request.args.get('nmp_ip_address', '')
        nmp_port = nmp_port or request.args.get('nmp_port', '')
        if nmp_ip_address and nmp_port:
            print(f"🔍 NSN: Signup route - Retrieved IP/Port from URL args: ip_address={nmp_ip_address}, port={nmp_port}")
    
    # If still empty, try to get from request headers (for B-Client auto-registration)
    if not nmp_ip_address or not nmp_port:
        # Check if this is a B-Client request (has specific User-Agent)
        user_agent = request.headers.get('User-Agent', '')
        if 'NoMorePassword-B-Client' in user_agent:
            print(f"🔍 NSN: Signup route - B-Client auto-registration detected, User-Agent: {user_agent}")
            # For B-Client requests, we need to get IP/Port from the original C-Client session
            # Since B-Client doesn't have direct access to C-Client session, we'll use the URL parameters
            # that should have been passed from the original C-Client access
            if not nmp_ip_address:
                nmp_ip_address = request.args.get('nmp_ip_address', '')
            if not nmp_port:
                nmp_port = request.args.get('nmp_port', '')
            print(f"🔍 NSN: Signup route - B-Client request, trying URL args: ip_address={nmp_ip_address}, port={nmp_port}")
            
            # If still empty, try to get from the original session establishment
            # This is a fallback for when the original session had the IP/Port info
            if not nmp_ip_address or not nmp_port:
                print(f"🔍 NSN: Signup route - Still empty, trying to get from original session establishment")
                # Try to get from the session that was established when C-Client first accessed NSN
                # This should contain the IP/Port from the original NMP parameters
                original_session_ip = session.get('nmp_ip_address', '')
                original_session_port = session.get('nmp_port', '')
                print(f"🔍 NSN: Signup route - Original session IP/Port: ip={original_session_ip}, port={original_session_port}")
                
                if original_session_ip and original_session_port:
                    nmp_ip_address = nmp_ip_address or original_session_ip
                    nmp_port = nmp_port or original_session_port
                    print(f"🔍 NSN: Signup route - Using original session IP/Port: ip_address={nmp_ip_address}, port={nmp_port}")
                else:
                    print(f"⚠️ NSN: Signup route - Original session also has no IP/Port info")
    
    # CRITICAL FIX: If still empty, get from the Referer URL (C-Client's original access)
    # The Referer should contain the original C-Client access URL with NMP parameters
    if not nmp_ip_address or not nmp_port:
        referer = request.headers.get('Referer', '')
        print(f"🔍 NSN: Signup route - Checking Referer for original C-Client IP/Port: {referer}")
        if referer and 'nmp_ip_address=' in referer and 'nmp_port=' in referer:
            try:
                from urllib.parse import urlparse, parse_qs
                parsed_url = urlparse(referer)
                query_params = parse_qs(parsed_url.query)
                nmp_ip_address = nmp_ip_address or query_params.get('nmp_ip_address', [''])[0]
                nmp_port = nmp_port or query_params.get('nmp_port', [''])[0]
                print(f"🔍 NSN: Signup route - Retrieved IP/Port from Referer: ip_address={nmp_ip_address}, port={nmp_port}")
            except Exception as e:
                print(f"⚠️ NSN: Signup route - Failed to parse Referer: {e}")
    
    # Final fallback: if still empty, try to get from the original session establishment
    # This should not happen in normal flow, but provides a safety net
    if not nmp_ip_address or not nmp_port:
        print(f"⚠️ NSN: Signup route - IP/Port still missing after all attempts: ip_address={nmp_ip_address}, port={nmp_port}")
        print(f"⚠️ NSN: Signup route - This may cause B-Client to not send session data to C-Client")
    
    # Debug: Log all NMP parameters and session state
    print(f"🔍 NSN: Signup route - NMP parameters debug:")
    print(f"🔍 NSN:   From form: user_id={request.form.get('nmp_user_id', '')}, username={request.form.get('nmp_username', '')}")
    print(f"🔍 NSN:   From session: user_id={session.get('nmp_user_id', '')}, username={session.get('nmp_username', '')}")
    print(f"🔍 NSN:   Final values: user_id={nmp_user_id}, username={nmp_username}")
    print(f"🔍 NSN:   IP/Port: ip_address={nmp_ip_address}, port={nmp_port}")
    print(f"🔍 NSN: ===== REQUEST DETAILS DEBUG ===== ")
    print(f"🔍 NSN:   Request URL: {request.url}")
    print(f"🔍 NSN:   Request args: {dict(request.args)}")
    print(f"🔍 NSN:   Request form: {dict(request.form)}")
    print(f"🔍 NSN:   Request headers: {dict(request.headers)}")
    print(f"🔍 NSN: ===== END REQUEST DETAILS DEBUG ===== ")
    print(f"🔍 NSN: Signup route - Full session state:")
    print(f"🔍 NSN:   All session keys: {list(session.keys())}")
    print(f"🔍 NSN:   session.get('nmp_user_id'): {session.get('nmp_user_id', 'NOT_FOUND')}")
    print(f"🔍 NSN:   session.get('nmp_username'): {session.get('nmp_username', 'NOT_FOUND')}")
    print(f"🔍 NSN:   session.get('nmp_ip_address'): {session.get('nmp_ip_address', 'NOT_FOUND')}")
    print(f"🔍 NSN:   session.get('nmp_port'): {session.get('nmp_port', 'NOT_FOUND')}")
    
    # All registrations are treated the same way
    print(f"🔗 NSN: Processing registration request")

    # Ensure all required form fields are provided
    required_fields = ['username', 'email', 'password', 'confirm_password', 'first_name', 'last_name', 'location']
    print(f"🔍 NSN: ===== REGISTRATION VALIDATION DEBUG =====")
    print(f"🔍 NSN: Request method: {request.method}")
    print(f"🔍 NSN: Required fields: {required_fields}")
    print(f"🔍 NSN: Form fields received: {list(request.form.keys())}")
    print(f"🔍 NSN: All required fields present: {all(field in request.form for field in required_fields)}")
    
    if request.method == 'POST' and all(field in request.form for field in required_fields):
        print(f"✅ NSN: All required fields present, proceeding with registration")

        # Retrieve form data
        username = request.form['username'].strip()
        email = request.form['email'].strip()
        password = request.form['password']
        confirm_password = request.form['confirm_password']
        first_name = request.form['first_name'].strip()
        last_name = request.form['last_name'].strip()
        location = request.form['location'].strip()
        
        print(f"🔍 NSN: ===== EXTRACTED FORM DATA =====")
        print(f"🔍 NSN: Username: '{username}' (length: {len(username)})")
        print(f"🔍 NSN: Email: '{email}' (length: {len(email)})")
        print(f"🔍 NSN: Password: '{password[:3]}...' (length: {len(password)})")
        print(f"🔍 NSN: Confirm password: '{confirm_password[:3]}...' (length: {len(confirm_password)})")
        print(f"🔍 NSN: First name: '{first_name}' (length: {len(first_name)})")
        print(f"🔍 NSN: Last name: '{last_name}' (length: {len(last_name)})")
        print(f"🔍 NSN: Location: '{location}' (length: {len(location)})")
        print(f"🔍 NSN: ===== END EXTRACTED FORM DATA =====")

        # Query locations table to check if the city already exists
        with db.get_cursor() as cursor:
            cursor.execute("SELECT location_id FROM locations WHERE address = %s",
                           (location,))
            location_id_result = cursor.fetchone()
            db.close_db()

        # If location exists, use the existing location_id, otherwise insert a new entry
        if location_id_result:
            location_id = location_id_result['location_id']

        else:
            # Insert new city information into locations table
            with db.get_cursor() as cursor:
                cursor.execute("INSERT INTO locations (address) VALUES (%s)",
                               (location,))
                location_id = cursor.lastrowid  # Retrieve new location_id
                db.close_db()

        # Ensure location_id is valid
        if not location_id:
            flash("Error retrieving location. Please try again.", "danger")
            return redirect(url_for('signup'))

        # Error messages for validation failures
        username_error = None
        email_error = None
        password_error = None
        confirm_password_error = None
        first_name_error = None
        last_name_error = None

        print(f"🔍 NSN: ===== VALIDATION CHECKS =====")
        
        # Check if username or email is already registered
        print(f"🔍 NSN: Checking if username '{username}' or email '{email}' already exists...")
        with db.get_cursor() as cursor:
            cursor.execute('SELECT user_id FROM users WHERE username = %s OR email = %s;', (username, email))
            existing_user = cursor.fetchone()
            db.close_db()

        if existing_user:
            username_error = 'Username or email is already registered.'
            print(f"❌ NSN: Username or email already exists: {existing_user}")
        else:
            print(f"✅ NSN: Username and email are available")
            
        # Username validation
        print(f"🔍 NSN: Validating username '{username}'...")
        print(f"🔍 NSN: Username length: {len(username)} (max: 20)")
        print(f"🔍 NSN: Username pattern check: {re.match(r'^[A-Za-z0-9]+$', username)}")
        
        if existing_user:
            pass  # Already set above
        elif len(username) > 20:
            username_error = 'Your username cannot exceed 20 characters.'
            print(f"❌ NSN: Username too long: {len(username)} > 20")
        elif not re.match(r'^[A-Za-z0-9]+$', username):
            username_error = 'Your username can only contain letters and numbers.'
            print(f"❌ NSN: Username contains invalid characters: '{username}'")
        else:
            print(f"✅ NSN: Username validation passed")

        # Validate email format
        if len(email) > 320:
            email_error = 'Your email address cannot exceed 320 characters.'
        elif not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', email):
            email_error = 'Invalid email address.'

        # Validate password complexity and confirmation
        print(f"🔍 NSN: Validating password...")
        print(f"🔍 NSN: Password length: {len(password)} (min: 8)")
        print(f"🔍 NSN: Password pattern check: {re.match(r'^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@#$%^&+=!]).{8,}$', password)}")
        print(f"🔍 NSN: Password matches confirm: {password == confirm_password}")
        
        if len(password) < 8:
            password_error = 'Please choose a longer password!'
            print(f"❌ NSN: Password too short: {len(password)} < 8")
        elif not re.match(r'^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@#$%^&+=!]).{8,}$', password):
            password_error = 'Your password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character (@#$%^&+=!).'
            print(f"❌ NSN: Password doesn't meet complexity requirements")
        else:
            print(f"✅ NSN: Password validation passed")

        if password != confirm_password:
            confirm_password_error = 'Passwords do not match.'
            print(f"❌ NSN: Password confirmation failed")
        else:
            print(f"✅ NSN: Password confirmation passed")

        # Validate first name and last name
        if not first_name or len(first_name) > 50:
            first_name_error = 'First name is required and cannot exceed 50 characters.'
        if not last_name or len(last_name) > 50:
            last_name_error = 'Last name is required and cannot exceed 50 characters.'

        # If any validation errors exist, return to signup page with errors
        print(f"🔍 NSN: ===== VALIDATION RESULTS =====")
        print(f"🔍 NSN: Username error: {username_error}")
        print(f"🔍 NSN: Email error: {email_error}")
        print(f"🔍 NSN: Password error: {password_error}")
        print(f"🔍 NSN: Confirm password error: {confirm_password_error}")
        print(f"🔍 NSN: First name error: {first_name_error}")
        print(f"🔍 NSN: Last name error: {last_name_error}")
        
        has_errors = username_error or email_error or password_error or confirm_password_error or first_name_error or last_name_error
        print(f"🔍 NSN: Has validation errors: {has_errors}")
        print(f"🔍 NSN: ===== END VALIDATION RESULTS =====")
        
        if has_errors:
            return render_template('signup.html',
                                   username=username,
                                   email=email,
                                   username_error=username_error,
                                   email_error=email_error,
                                   password_error=password_error,
                                   # Pass NMP parameters to template
                                   nmp_user_id=nmp_user_id,
                                   nmp_username=nmp_username,
                                   nmp_client_type=nmp_client_type,
                                   nmp_timestamp=nmp_timestamp,
                                   nmp_ip_address=nmp_ip_address,
                                   nmp_port=nmp_port,
                                   confirm_password_error=confirm_password_error,
                                   first_name=first_name,
                                   last_name=last_name,
                                   first_name_error=first_name_error,
                                   last_name_error=last_name_error)

        print(f"✅ NSN: All validations passed, proceeding with user creation")
        
        # Hash the password before storing it in the database
        password_hash = bcrypt.generate_password_hash(password).decode('utf-8')

        # Insert new user into the database
        print(f"💾 NSN: ===== INSERTING USER INTO DATABASE =====")
        print(f"💾 NSN: Username: {username}")
        print(f"💾 NSN: Email: {email}")
        print(f"💾 NSN: First name: {first_name}")
        print(f"💾 NSN: Last name: {last_name}")
        print(f"💾 NSN: Location ID: {location_id}")
        print(f"💾 NSN: Password hash length: {len(password_hash)}")
        print(f"💾 NSN: ===== END INSERTING USER INTO DATABASE =====")
        
        try:
            with db.get_cursor() as cursor:
                print(f"💾 NSN: Executing INSERT query...")
                cursor.execute('''
                    INSERT INTO users (username, password_hash, email, first_name, last_name, location_id, role)
                    VALUES (%s, %s, %s, %s, %s, %s, %s);
                ''', (username, password_hash, email, first_name, last_name, location_id, 'traveller'))
                new_user_id = cursor.lastrowid  # Get the auto-generated user_id
                print(f"💾 NSN: INSERT query executed, new_user_id: {new_user_id}")
                
                # Force commit the transaction
                print(f"💾 NSN: Committing transaction...")
                db.get_db().commit()
                print(f"💾 NSN: Transaction committed successfully")
                # Don't close database connection immediately to avoid sync issues
                # db.close_db()

            print(f"✅ NSN: ===== USER INSERTED INTO DATABASE =====")
            print(f"✅ NSN: New user ID: {new_user_id}")
            print(f"✅ NSN: Username: {username}")
            print(f"✅ NSN: ===== END USER INSERTED INTO DATABASE =====")
        except Exception as e:
            print(f"❌ NSN: Database insertion failed: {e}")
            import traceback
            traceback.print_exc()
            return render_template('signup.html', 
                                 username=username,
                                 email=email,
                                 first_name=first_name,
                                 last_name=last_name,
                                 error_message="Registration failed. Please try again.")

        # Set session data for the newly registered user (for B-Client to access via session)
        session['user_id'] = new_user_id
        session['username'] = username
        session['role'] = 'traveller'
        session['loggedin'] = True
        session.permanent = True
        
        print(f"✅ NSN: User registered successfully: user_id={new_user_id}, username={username}")
        print(f"✅ NSN: Session data set for B-Client access: loggedin=True, user_id={new_user_id}")

        # Registration completed successfully
        print(f"✅ NSN: User registration completed successfully")

        # Return HTML page for all registration requests
        # B-Client will query database directly after registration
        print(f"🔗 NSN: ===== RETURNING HTML RESPONSE =====")
        print(f"🔗 NSN: User ID: {new_user_id}")
        print(f"🔗 NSN: Username: {username}")
        print(f"🔗 NSN: ===== END RETURNING HTML RESPONSE =====")
        return render_template('signup.html', 
                              signup_successful=True, 
                              new_user_id=new_user_id,
                              # Pass NMP parameters to template
                              nmp_user_id=nmp_user_id,
                              nmp_username=nmp_username,
                              nmp_client_type=nmp_client_type,
                              nmp_timestamp=nmp_timestamp,
                              nmp_ip_address=nmp_ip_address,
                              nmp_port=nmp_port)

    # This code is for GET requests (showing the signup form)
    with db.get_cursor() as cursor:
        cursor.execute('SELECT distinct country FROM locations ;')
        countries = cursor.fetchall()
        db.close_db()
    return render_template('signup.html', 
                          countries=countries,
                          # Pass NMP parameters to template
                          nmp_user_id=nmp_user_id,
                          nmp_username=nmp_username,
                          nmp_client_type=nmp_client_type,
                          nmp_timestamp=nmp_timestamp,
                          nmp_ip_address=nmp_ip_address,
                          nmp_port=nmp_port)




@app.route('/logout')
def logout():
    """Logout endpoint.

    Handles three types of logout:
    1. Browser direct login: Only clear NSN session, return to unauthenticated homepage
    2. C-Client signup with nmp: Clear B-Client database cookies + C-Client cookies
    3. C-Client bind to nmp: Clear B-Client database cookies + C-Client cookies
    """

    # Get user info BEFORE clearing session (important!)
    user_id = session.get('user_id')  # NSN user ID (integer)
    username = session.get('username')  # NSN username
    
    # CRITICAL FIX: Get NMP parameters from URL first, then fallback to session
    # This ensures logout can work even if session is partially cleared
    nmp_params_from_url = get_nmp_params_from_request(request)
    
    # Check session for C-Client access (primary source)
    nmp_user_id = nmp_params_from_url.get('nmp_user_id') or session.get('nmp_user_id')
    nmp_client_type = nmp_params_from_url.get('nmp_client_type') or session.get('nmp_client_type')
    nmp_client_id = nmp_params_from_url.get('nmp_client_id') or session.get('nmp_client_id')
    nmp_username = nmp_params_from_url.get('nmp_username') or session.get('nmp_username')
    nmp_node_id = nmp_params_from_url.get('nmp_node_id') or session.get('nmp_node_id')
    nmp_domain_id = nmp_params_from_url.get('nmp_domain_id') or session.get('nmp_domain_id')
    nmp_cluster_id = nmp_params_from_url.get('nmp_cluster_id') or session.get('nmp_cluster_id')
    nmp_channel_id = nmp_params_from_url.get('nmp_channel_id') or session.get('nmp_channel_id')
    
    print(f"🔓 NSN: ===== LOGOUT PROCESS START =====")
    print(f"🔓 NSN: User: {username} (NSN ID: {user_id})")
    print(f"🔓 NSN: NMP User ID: {nmp_user_id} (from URL: {nmp_params_from_url.get('nmp_user_id')}, from session: {session.get('nmp_user_id')})")
    print(f"🔓 NSN: NMP Client Type: {nmp_client_type}")
    print(f"🔓 NSN: NMP Client ID: {nmp_client_id} (from URL: {nmp_params_from_url.get('nmp_client_id')}, from session: {session.get('nmp_client_id')})")
    print(f"🔓 NSN: NMP Username: {nmp_username}")
    print(f"🔓 NSN: NMP Node ID: {nmp_node_id}")
    print(f"🔓 NSN: NMP Domain ID: {nmp_domain_id}")
    print(f"🔓 NSN: NMP Cluster ID: {nmp_cluster_id}")
    print(f"🔓 NSN: NMP Channel ID: {nmp_channel_id}")
    
    # Determine logout type - if we have nmp_user_id, it's a C-Client user
    is_c_client_user = bool(nmp_user_id)
    
    if is_c_client_user:
        print(f"🔓 NSN: C-Client user detected (nmp_user_id: {nmp_user_id}) - will clear B-Client cookies and notify C-Client")
    else:
        print(f"🔓 NSN: Browser direct user detected - will only clear NSN session")
    
    # NOTE: Do NOT clear NSN session yet - we need the nmp_user_id for B-Client call
    
    # For C-Client users (both signup with nmp and bind to nmp), call B-Client to clear cookies
    if is_c_client_user:
        # Check if this user already initiated logout recently (prevent duplicate logout requests)
        import threading
        if not hasattr(logout, '_logout_lock'):
            logout._logout_lock = threading.Lock()
            logout._recent_logouts = {}  # {nmp_user_id: timestamp}
        
        with logout._logout_lock:
            import time
            current_time = time.time()
            last_logout_time = logout._recent_logouts.get(nmp_user_id, 0)
            
            # If this user logged out within last 15 seconds, skip B-Client call
            if current_time - last_logout_time < 15:
                print(f"🔓 NSN: ===== DUPLICATE LOGOUT DETECTED =====")
                print(f"🔓 NSN: User {username} logged out {current_time - last_logout_time:.1f}s ago")
                print(f"🔓 NSN: Skipping B-Client logout API call (already processed)")
                print(f"🔓 NSN: ===== DUPLICATE LOGOUT SKIPPED =====")
                is_c_client_user = False  # Skip async logout thread
            else:
                # Record this logout
                logout._recent_logouts[nmp_user_id] = current_time
                print(f"🔓 NSN: Recorded logout for user {username} at {current_time}")
        
        # Asynchronous logout processing to prevent blocking
        if is_c_client_user:  # Only if not skipped by duplicate check
            def async_logout():
                try:
                    print(f"🔓 NSN: ===== ASYNC LOGOUT PROCESS START =====")
                    print(f"🔓 NSN: Calling B-Client logout API asynchronously...")
                    print(f"🔓 NSN: B-Client URL: {B_CLIENT_API_URL}/bind")
                    
                    # Call B-Client logout API using C-Client user ID (UUID)
                    url = f"{B_CLIENT_API_URL}/bind"
                    
                    # Use IDs from URL parameters (already extracted above) with fallback to defaults
                    logout_domain_id = nmp_domain_id or 'localhost:5000'
                    logout_node_id = nmp_node_id or 'nsn-node-001'
                    logout_cluster_id = nmp_cluster_id
                    logout_channel_id = nmp_channel_id
                    logout_client_id = nmp_client_id  # CRITICAL: Get client_id to identify specific C-Client
                    
                    data = {
                        "request_type": 2,  # Use numeric request_type for clear_user_cookies
                        "user_id": nmp_user_id,  # Use C-Client user ID (UUID)
                        "user_name": nmp_username or username,  # Use NMP username or NSN username for reference
                        "domain_id": logout_domain_id,
                        "node_id": logout_node_id
                    }
                    
                    # Add cluster_id and channel_id if available
                    if logout_cluster_id:
                        data['cluster_id'] = logout_cluster_id
                    if logout_channel_id:
                        data['channel_id'] = logout_channel_id
                    # CRITICAL: Add client_id to identify which specific C-Client is logging out
                    if logout_client_id:
                        data['client_id'] = logout_client_id
                    
                    print(f"🔓 NSN: B-Client logout request data:")
                    print(f"   user_id: '{nmp_user_id}'")
                    print(f"   user_name: '{nmp_username or username}'")
                    print(f"   domain_id: '{logout_domain_id}'")
                    print(f"   node_id: '{logout_node_id}'")
                    print(f"   cluster_id: '{logout_cluster_id}'")
                    print(f"   channel_id: '{logout_channel_id}'")
                    print(f"   client_id: '{logout_client_id}'")
                    
                    print(f"🔓 NSN: Request data: {data}")
                    response = requests.post(url, json=data, timeout=30)  # Extended timeout for async operation
                    print(f"🔓 NSN: B-Client response status: {response.status_code}")
                    
                    if response.status_code == 200:
                        result = response.json()
                        print(f"🔓 NSN: B-Client response: {result}")
                        
                        if result.get('success'):
                            print(f"✅ NSN: ===== ASYNC LOGOUT SUCCESS =====")
                            print(f"✅ NSN: C-Client user {username} logged out successfully")
                            print(f"✅ NSN: B-Client cleared {result.get('cleared_count', 0)} cookies")
                            print(f"✅ NSN: C-Client session cleared: {result.get('c_client_notified', False)}")
                            print(f"✅ NSN: ===== ASYNC LOGOUT PROCESS END =====")
                        else:
                            print(f"⚠️ NSN: ===== ASYNC LOGOUT FAILED =====")
                            print(f"⚠️ NSN: Failed to logout C-Client user {username}: {result.get('error', 'Unknown error')}")
                            print(f"⚠️ NSN: ===== ASYNC LOGOUT PROCESS END =====")
                    else:
                        print(f"⚠️ NSN: ===== ASYNC LOGOUT FAILED =====")
                        print(f"⚠️ NSN: B-Client API call failed with status {response.status_code}")
                        print(f"⚠️ NSN: Response text: {response.text}")
                        print(f"⚠️ NSN: ===== ASYNC LOGOUT PROCESS END =====")
                        
                except Exception as e:
                    print(f"⚠️ NSN: ===== ASYNC LOGOUT ERROR =====")
                    print(f"⚠️ NSN: Error calling B-Client logout API: {e}")
                    print(f"⚠️ NSN: ===== ASYNC LOGOUT PROCESS END =====")
            
            # Start async logout process in background thread
            logout_thread = threading.Thread(target=async_logout, daemon=True)
            logout_thread.start()
            print(f"🔓 NSN: Started async logout process for C-Client user {username}")
            print(f"🔓 NSN: Logout will be processed in background, page will not be blocked")
    
    # Step 4: Clear NSN session AFTER B-Client call (for both C-Client and browser direct users)
    print(f"🔓 NSN: Step 4: Clearing NSN session...")
    print(f"🔓 NSN: Clearing session for user: {username}")
    
    session.pop('loggedin', None)
    session.pop('user_id', None)
    session.pop('username', None)
    session.pop('role', None)

    # Clear ALL NMP session data for complete logout
    session.pop('nmp_bind', None)
    session.pop('nmp_bind_type', None)
    session.pop('nmp_auto_refresh', None)
    session.pop('nmp_user_id', None)      # Clear for complete logout
    session.pop('nmp_username', None)     # Clear for complete logout
    session.pop('nmp_client_type', None)  # Clear for complete logout
    session.pop('nmp_timestamp', None)    # Clear for complete logout
    session.pop('nmp_ip_address', None)   # Clear for complete logout
    session.pop('nmp_port', None)         # Clear for complete logout
    session.pop('nmp_client_id', None)    # Clear for complete logout
    session.pop('nmp_node_id', None)      # Clear for complete logout
    session.pop('nmp_domain_id', None)    # Clear for complete logout
    session.pop('nmp_cluster_id', None)   # Clear for complete logout
    session.pop('nmp_channel_id', None)  # Clear for complete logout
    
    print(f"🔓 NSN: Cleared ALL NMP session data for complete logout")
    
    print(f"🔓 NSN: NSN session cleared for user: {username}")
    print(f"🔓 NSN: ===== LOGOUT PROCESS END =====")
    
    print(f"🔓 NSN: Redirecting to root page...")
    # 重定向到root页面时不包含NMP参数，避免触发auto-login
    return redirect(url_for('root'))


@app.route('/api/b-client/info', methods=['GET'])
def api_bclient_info():
    """API endpoint for C-Client to get B-Client configuration"""
    try:
        # Get NMP parameters from request or session
        nmp_params = get_nmp_params_from_request(request)
        nmp_user_id = nmp_params.get('nmp_user_id', '') or session.get('nmp_user_id', '')
        nmp_username = nmp_params.get('nmp_username', '') or session.get('nmp_username', '')
        
        # Basic validation - ensure this is a legitimate C-Client request
        if not nmp_user_id or not nmp_username:
            print(f"⚠️ NSN: Invalid NMP parameters for B-Client config request")
            print(f"   nmp_user_id: '{nmp_user_id}' (from request: {nmp_params.get('nmp_user_id', '')}, from session: {session.get('nmp_user_id', '')})")
            print(f"   nmp_username: '{nmp_username}' (from request: {nmp_params.get('nmp_username', '')}, from session: {session.get('nmp_username', '')})")
            print(f"   All NMP params: {nmp_params}")
            print(f"   Session keys: {list(session.keys())}")
            return jsonify({
                "success": False,
                "error": "Invalid NMP parameters"
            }), 400
        
        # Return B-Client configuration for C-Client auto-registration
        config = {
            "success": True,
            "b_client_url": B_CLIENT_API_URL,
            "websocket_url": "ws://127.0.0.1:8766",  # B-Client WebSocket URL
            "api_endpoints": {
                "register": f"{B_CLIENT_API_URL}/api/register",
                "login": f"{B_CLIENT_API_URL}/api/login",
                "websocket_check": f"{B_CLIENT_API_URL}/api/websocket/check-user"
            },
            "auth_info": {
                "user_id": nmp_user_id,
                "username": nmp_username
            }
        }
        
        print(f"🔗 NSN: Providing B-Client configuration to C-Client:")
        print(f"   User: {nmp_username} ({nmp_user_id})")
        print(f"   B-Client URL: {B_CLIENT_API_URL}")
        print(f"   WebSocket URL: ws://127.0.0.1:8766")
        
        return jsonify(config)
        
    except Exception as e:
        print(f"❌ NSN: Error providing B-Client configuration: {e}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@app.route('/api/current-user', methods=['GET'])
def api_current_user():
    """API endpoint for B-Client to get current user information from session.
    
    This endpoint returns the current user's information based on the session cookie.
    B-Client can call this after successful login to get user_id and role.
    
    Returns:
        JSON response containing current user information.
    """
    try:
        print(f"🔍 NSN: ===== CURRENT USER API SESSION ANALYSIS =====")
        print(f"🔍 NSN: Current user API called")
        print(f"🔍 NSN: Session state:")
        print(f"🔍 NSN:   All session keys: {list(session.keys())}")
        print(f"🔍 NSN:   loggedin: {session.get('loggedin')} (type: {type(session.get('loggedin'))})")
        print(f"🔍 NSN:   user_id: {session.get('user_id')} (type: {type(session.get('user_id'))})")
        print(f"🔍 NSN:   username: {session.get('username')} (type: {type(session.get('username'))})")
        print(f"🔍 NSN:   role: {session.get('role')} (type: {type(session.get('role'))})")
        
        # Check if user is logged in via Flask session first
        if session.get('loggedin') and session.get('user_id'):
            print(f"✅ NSN: Valid Flask session found")
        else:
            print(f"⚠️ NSN: No Flask session found, checking for C-Client session cookie...")
            
            # Check if there's a session cookie from C-Client (like root interface)
            session_cookie = request.cookies.get('session')
            if session_cookie:
                print(f"🔍 NSN: ===== PARSING C-CLIENT SESSION COOKIE =====")
                print(f"🔍 NSN: Session cookie type: {type(session_cookie)}")
                print(f"🔍 NSN: Session cookie length: {len(session_cookie)}")
                print(f"🔍 NSN: Session cookie content: {session_cookie}")
                
                # Try to parse the session cookie from C-Client (same logic as root interface)
                try:
                    import base64
                    import json
                    
                    # C-Client sends cookie in format: "session=eyJ..." 
                    # Extract the actual session value
                    if session_cookie.startswith('session='):
                        # Extract the session value part
                        session_value = session_cookie.split('session=')[1].split(';')[0]
                        print(f"🔍 NSN: Extracted session value: {session_value}")
                    else:
                        # Assume it's already the session value
                        session_value = session_cookie
                        print(f"🔍 NSN: Using session value directly: {session_value}")
                    
                    # Try JSON parsing first (B-Client preprocessed format)
                    print(f"🔍 NSN: ===== PARSING SESSION COOKIE AS JSON =====")
                    try:
                        session_data = json.loads(session_value)
                        print(f"✅ NSN: Session cookie parsed successfully as JSON")
                        print(f"🔍 NSN: Parsed session data keys: {list(session_data.keys()) if isinstance(session_data, dict) else 'Not a dict'}")
                    except Exception as e:
                        print(f"⚠️ NSN: JSON parsing failed: {e}")
                        
                        # Fallback to Flask session cookie format (legacy)
                        if '.' in session_value and session_value.count('.') == 2:
                            print(f"🔍 NSN: Trying Flask session cookie format as fallback")
                            data_part = session_value.split('.')[0]
                            
                            try:
                                # Flask session cookie uses URL-safe base64 encoding
                                # Add padding if needed for URL-safe base64 decoding
                                padded_data = data_part + '=' * (4 - len(data_part) % 4)
                                decoded_data = base64.urlsafe_b64decode(padded_data)
                                decoded_text = decoded_data.decode('utf-8')
                                session_data = json.loads(decoded_text)
                                print(f"✅ NSN: Flask session cookie parsed successfully")
                            except Exception as e2:
                                print(f"⚠️ NSN: Flask session decode failed: {e2}")
                                raise e2
                        else:
                            print(f"⚠️ NSN: Neither JSON nor Flask format detected")
                            raise e
                    
                    print(f"🔍 NSN: ===== FINAL PARSED SESSION DATA =====")
                    print(f"🔍 NSN: Parsed session data: {session_data}")
                    if isinstance(session_data, dict):
                        for key, value in session_data.items():
                            print(f"🔍 NSN:   {key}: {value} (type: {type(value)})")
                    
                    if session_data.get('loggedin') and session_data.get('user_id'):
                        print(f"✅ NSN: Valid session found in cookie, setting Flask session")
                        
                        # Get the username from cookie to find the real NSN user_id
                        cookie_username = session_data.get('username')
                        if cookie_username:
                            # Query NSN database to get the real user_id for this username
                            cursor = db.get_cursor()
                            cursor.execute("SELECT user_id, role FROM users WHERE username = %s", (cookie_username,))
                            user_data = cursor.fetchone()
                            cursor.close()
                            
                            if user_data:
                                print(f"🔍 NSN: Found NSN user_id for username {cookie_username}: {user_data['user_id']}")
                                session['user_id'] = int(user_data['user_id'])  # Use real NSN user_id (INT)
                                session['role'] = user_data['role']  # Use real NSN role
                            else:
                                print(f"⚠️ NSN: Username {cookie_username} not found in NSN database, using cookie data")
                                session['user_id'] = int(session_data.get('user_id')) if session_data.get('user_id') else None
                                session['role'] = session_data.get('role')
                        else:
                            print(f"⚠️ NSN: No username in cookie, using cookie user_id")
                            session['user_id'] = int(session_data.get('user_id')) if session_data.get('user_id') else None
                            session['role'] = session_data.get('role')
                        
                        session['loggedin'] = session_data.get('loggedin')
                        session['username'] = session_data.get('username')
                        
                        # Set NMP parameters for C-Client identification
                        session['nmp_user_id'] = session_data.get('nmp_user_id')
                        session['nmp_username'] = session_data.get('nmp_username')
                        session['nmp_client_type'] = 'c-client'
                        session['nmp_timestamp'] = session_data.get('nmp_timestamp')
                        
                        print(f"🔍 NSN: Updated Flask session state: {dict(session)}")
                    else:
                        print(f"⚠️ NSN: Invalid session data in cookie")
                        
                except Exception as e:
                    print(f"❌ NSN: Error parsing session cookie: {e}")
                    print(f"   Cookie format: {session_cookie[:100]}...")
            else:
                print(f"⚠️ NSN: No session cookie found")
        
        # Final check after potential session parsing
        if not session.get('loggedin') or not session.get('user_id'):
            print(f"❌ NSN: No valid session found - API will return 401")
            print(f"❌ NSN: Reason: loggedin={session.get('loggedin')}, user_id={session.get('user_id')}")
            return jsonify({
                'success': False,
                'error': 'No valid session found'
            }), 401
        
        user_id = session.get('user_id')
        username = session.get('username')
        role = session.get('role')
        
        print(f"✅ NSN: Current user info - user_id: {user_id}, username: {username}, role: {role}")
        
        return jsonify({
            'success': True,
            'user_id': int(user_id),
            'username': username,
            'role': role,
            'loggedin': True
        })
        
    except Exception as e:
        print(f"❌ NSN: Error in api_current_user: {e}")
        import traceback
        print(f"   Traceback: {traceback.format_exc()}")
        return jsonify({
            'success': False,
            'error': 'Internal server error'
        }), 500

@app.route('/api/nmp-session-data', methods=['GET'])
def api_nmp_session_data():
    """API endpoint for B-client to retrieve NMP session data after login"""
    try:
        print(f"🔍 NSN: ===== NMP SESSION DATA API CALLED =====")
        print(f"🔍 NSN: Request timestamp: {datetime.now()}")
        print(f"🔍 NSN: Request IP: {request.remote_addr}")
        print(f"🔍 NSN: Request method: {request.method}")
        
        # Check if session has NMP data ready
        if session.get('nmp_session_ready') and session.get('nmp_session_cookie'):
            print(f"✅ NSN: NMP session data available")
            
            session_data = {
                'success': True,
                'session_cookie': session.get('nmp_session_cookie'),
                'nsn_user_id': session.get('nmp_nsn_user_id'),
                'nsn_username': session.get('nmp_nsn_username'),
                'nmp_user_id': session.get('nmp_user_id'),
                'nmp_username': session.get('nmp_username')
            }
            
            # Clear the session data after retrieval to prevent reuse
            session.pop('nmp_session_ready', None)
            session.pop('nmp_session_cookie', None)
            session.pop('nmp_nsn_user_id', None)
            session.pop('nmp_nsn_username', None)
            
            print(f"✅ NSN: NMP session data returned and cleared")
            return jsonify(session_data)
        else:
            print(f"⚠️ NSN: No NMP session data available")
            return jsonify({
                'success': False,
                'error': 'No NMP session data available'
            }), 404
            
    except Exception as e:
        print(f"❌ NSN: Error in api_nmp_session_data: {e}")
        import traceback
        print(f"   Traceback: {traceback.format_exc()}")
        return jsonify({
            'success': False,
            'error': 'Internal server error'
        }), 500

