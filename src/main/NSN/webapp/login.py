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

def call_bclient_query_cookie_api(nmp_user_id, nmp_api_port=None):
    """
    Call B-Client query-cookie API to check if user has valid cookie
    
    Args:
        nmp_user_id: C-Client user ID
        nmp_api_port: C-Client API port for B-Client to send cookie to
    
    Returns:
        dict: Query result with cookie info if available
    """
    try:
        
        # Call B-Client query-cookie API
        url = f"{B_CLIENT_API_URL}/api/query-cookie"
        data = {
            "user_id": nmp_user_id
        }
        
        # Add API port information if available
        if nmp_api_port:
            data["c_client_api_port"] = nmp_api_port
        
        print(f"🌐 NSN: Making request to B-Client:")
        print(f"   URL: {url}")
        print(f"   Data: {data}")
        
        response = requests.post(url, json=data, timeout=10)
        
        print(f"📡 NSN: B-Client response received:")
        print(f"   Status Code: {response.status_code}")
        print(f"   Headers: {dict(response.headers)}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"📋 NSN: B-Client JSON response: {result}")
            
            if result.get('success') and result.get('has_cookie'):
                print(f"✅ NSN: Cookie found for user_id: {nmp_user_id}")
                print(f"   Username: {result.get('username')}")
                print(f"   Cookie: {result.get('cookie', '')[:50]}..." if result.get('cookie') else "   Cookie: None")
                return result
            else:
                print(f"⚠️ NSN: No cookie found for user_id: {nmp_user_id}")
                print(f"   Success: {result.get('success')}")
                print(f"   Has Cookie: {result.get('has_cookie')}")
                return result
        else:
            print(f"❌ NSN: B-Client query-cookie API error: {response.status_code}")
            print(f"   Response text: {response.text}")
            return {"success": False, "error": f"B-Client API error: {response.status_code}"}
            
    except Exception as e:
        print(f"❌ NSN: Error calling B-Client query-cookie API: {e}")
        print(f"   Exception type: {type(e).__name__}")
        print(f"   Exception details: {str(e)}")
        return {"success": False, "error": str(e)}

def call_bclient_bind_api(nmp_user_id, nmp_username, nsn_username, nsn_password, bind_type="login", auto_refresh=True):
    """
    Call B-Client bind API to register the user binding
    
    Args:
        nmp_user_id: C-Client user ID
        nmp_username: C-Client username
        nsn_username: NSN username
        nsn_password: NSN password
        bind_type: "login" for existing users, "signup" for new users
        auto_refresh: Whether to enable auto-refresh
    """
    try:
        print(f"🔗 NSN: Calling B-Client bind API for user {nsn_username} (type: {bind_type})")
        
        # Determine request type based on bind_type
        # Both "bind" and "signup" should use "bind_user" since the user already exists in NSN
        request_type = "bind_user"
        
        bind_data = {
            "request_type": request_type,
            "user_id": nmp_user_id,
            "user_name": nmp_username,
            "domain_id": "localhost:5000",  # Use the correct domain from B-Client config
            "node_id": "nsn-node-001",
            "auto_refresh": auto_refresh
        }
        
        # Add account/password for existing users
        if bind_type == "login":
            bind_data.update({
                "account": nsn_username,
                "password": nsn_password
            })
        # For new users, B-Client will handle account creation
        elif bind_type == "signup":
            # B-Client will create account with NMP user info
            bind_data.update({
                "username": nsn_username,  # This will be the new NSN username
                "email": f"{nmp_username}@nomorepassword.local",  # Generate email
                "first_name": nmp_username.split('-')[0] if '-' in nmp_username else nmp_username,
                "last_name": "NMP User",
                "location": "Unknown"
            })
        
        response = requests.post(
            f"{B_CLIENT_API_URL}/bind",
            json=bind_data,
            headers={'Content-Type': 'application/json'},
            timeout=10
        )
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ NSN: B-Client bind API success: {result}")
            return {"success": True, "data": result}
        else:
            print(f"❌ NSN: B-Client bind API error: {response.status_code} - {response.text}")
            return {"success": False, "error": f"B-Client API error: {response.status_code}"}
            
    except requests.exceptions.ConnectionError:
        print(f"❌ NSN: Cannot connect to B-Client API ({B_CLIENT_API_URL})")
        return {"success": False, "error": f"Cannot connect to B-Client API ({B_CLIENT_API_URL})"}
    except requests.exceptions.Timeout:
        print("❌ NSN: B-Client API request timeout")
        return {"success": False, "error": "B-Client API request timeout"}
    except Exception as e:
        print(f"❌ NSN: B-Client API error: {str(e)}")
        return {"success": False, "error": str(e)}


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
    if 'loggedin' in session and session.get('user_id'):
        print(f"✅ NSN: User already logged in with valid session")
        print(f"   User ID: {session.get('user_id')}")
        print(f"   Username: {session.get('username')}")
        print(f"   Role: {session.get('role')}")
        return redirect(user_home_url())
    
    # Check if there's a complete session data cookie from C-Client (new format)
    nmp_session_cookie = request.cookies.get('nmp_session_data')
    print(f"🔍 NSN: Checking for nmp_session_data cookie...")
    print(f"🔍 NSN: All cookies: {dict(request.cookies)}")
    
    if nmp_session_cookie:
        print(f"🍪 NSN: Found NMP session data cookie from C-Client: {nmp_session_cookie[:50]}...")
        print(f"⚠️ NSN: WARNING - nmp_session_data cookie still exists after logout!")
        
        # Try to parse the complete session data from C-Client
        try:
            import json
            
            # Parse the JSON session data directly (not Flask session cookie format)
            session_data = json.loads(nmp_session_cookie)
            print(f"🔍 NSN: Parsed complete session data from cookie: {session_data}")
            
            if session_data.get('loggedin') and session_data.get('user_id'):
                print(f"✅ NSN: Valid complete session found in cookie, setting session")
                
                # Use the complete session data directly
                session['loggedin'] = session_data.get('loggedin')
                session['user_id'] = int(session_data.get('user_id')) if session_data.get('user_id') else None  # NSN user_id
                session['username'] = session_data.get('username')  # NSN username
                session['role'] = session_data.get('role')  # NSN role
                
                # Store NMP information for reference
                session['nmp_user_id'] = session_data.get('nmp_user_id')
                session['nmp_username'] = session_data.get('nmp_username')
                session['nmp_node_id'] = session_data.get('nmp_node_id')
                session['nmp_domain_id'] = session_data.get('nmp_domain_id')
                session['nmp_cluster_id'] = session_data.get('nmp_cluster_id')
                session['nmp_channel_id'] = session_data.get('nmp_channel_id')
                
                # Make session permanent to ensure it persists across redirects
                session.permanent = True
                
                print(f"🔍 NSN: Updated session state with complete data: {dict(session)}")
                print(f"🔍 NSN: Session permanent: {session.permanent}")
                
                return redirect(user_home_url())
            else:
                print(f"⚠️ NSN: Invalid complete session data in cookie")
                print(f"   Missing loggedin: {not session_data.get('loggedin')}")
                print(f"   Missing user_id: {not session_data.get('user_id')}")
                print(f"   Available keys: {list(session_data.keys())}")
        except Exception as e:
            print(f"❌ NSN: Error parsing NMP session data cookie: {e}")
            import traceback
            print(f"   Traceback: {traceback.format_exc()}")
        
        # If we have a cookie but can't parse it, continue to check other formats
        print(f"🔄 NSN: NMP session data parsing failed, checking other cookie formats")
    else:
        print(f"✅ NSN: No nmp_session_data cookie found - logout successful")
    
    # Check if there's a session cookie from C-Client (legacy format)
    session_cookie = request.cookies.get('session')
    if session_cookie:
        print(f"🍪 NSN: Found session cookie from C-Client: {session_cookie[:50]}...")
        
        # Try to parse the session cookie from C-Client
        try:
            import base64
            import json
            
            # C-Client sends cookie in format: "session=eyJ..." 
            # Extract the actual session value
            if session_cookie.startswith('session='):
                # Extract the session value part
                session_value = session_cookie.split('session=')[1].split(';')[0]
                print(f"🔍 NSN: Extracted session value: {session_value[:50]}...")
            else:
                # Assume it's already the session value
                session_value = session_cookie
                print(f"🔍 NSN: Using session value directly: {session_value[:50]}...")
            
            # Check if this is a Flask session cookie (format: data.timestamp.signature)
            if '.' in session_value and session_value.count('.') == 2:
                # Flask session cookie format: data.timestamp.signature
                print(f"🔍 NSN: Detected Flask session cookie format")
                data_part = session_value.split('.')[0]
                print(f"🔍 NSN: Extracted data part: {data_part[:50]}...")
                
                # Add padding if needed for base64 decoding
                padded_data = data_part + '=' * (4 - len(data_part) % 4)
                decoded_data = base64.b64decode(padded_data)
                session_data = json.loads(decoded_data)
            else:
                # C-Client sends base64 encoded JSON directly (not Flask format)
                print(f"🔍 NSN: Detected direct base64 JSON format")
                # Add padding if needed
                padded_cookie = session_value + '=' * (4 - len(session_value) % 4)
                decoded_data = base64.b64decode(padded_cookie)
                session_data = json.loads(decoded_data)
            
            print(f"🔍 NSN: Parsed session data from cookie: {session_data}")
            
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
                
                session['loggedin'] = session_data.get('loggedin')
                session['username'] = session_data.get('username')
                
                # Make session permanent to ensure it persists across redirects
                session.permanent = True
                
                print(f"🔍 NSN: Updated session state: {dict(session)}")
                print(f"🔍 NSN: Session permanent: {session.permanent}")
                
                return redirect(user_home_url())
            else:
                print(f"⚠️ NSN: Invalid session data in cookie")
        except Exception as e:
            print(f"❌ NSN: Error parsing session cookie: {e}")
            print(f"   Cookie format: {session_cookie[:100]}...")
            import traceback
            print(f"   Traceback: {traceback.format_exc()}")
        
        # If we have a cookie but can't parse it, continue to check URL parameters
        print(f"🔄 NSN: Cookie parsing failed, checking URL parameters instead")
    else:
        print(f"🔓 NSN: No session cookie found")
    
    # Check for No More Password injection parameters
    nmp_injected_raw = request.args.get('nmp_injected', 'false')
    nmp_injected = nmp_injected_raw.lower() == 'true'
    nmp_user_id = request.args.get('nmp_user_id', '')
    nmp_username = request.args.get('nmp_username', '')
    nmp_client_type = request.args.get('nmp_client_type', '')
    nmp_timestamp = request.args.get('nmp_timestamp', '')
    nmp_node_id = request.args.get('nmp_node_id', '')
    nmp_domain_id = request.args.get('nmp_domain_id', '')
    nmp_cluster_id = request.args.get('nmp_cluster_id', '')
    nmp_channel_id = request.args.get('nmp_channel_id', '')
    nmp_api_port = request.args.get('nmp_api_port', '')
    
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
        # 没有NMP参数，直接显示普通首页
        return render_template('index.html')
    
    # 如果通过C-Client访问且有NMP参数，检查B-Client的cookie并自动登录
    if nmp_injected and nmp_user_id:
        print(f"🔐 NSN: Root path accessed via C-Client with NMP parameters:")
        print(f"   nmp_injected: {nmp_injected}")
        print(f"   nmp_user_id: {nmp_user_id}")
        print(f"   nmp_username: {nmp_username}")
        print(f"   nmp_client_type: {nmp_client_type}")
        print(f"   nmp_timestamp: {nmp_timestamp}")
        
        # 检查是否是不同的用户
        current_session_user_id = session.get('nmp_user_id')
        current_loggedin = session.get('loggedin', False)
        
        # 只有在不同用户时才清除session，新用户不清除
        if current_session_user_id and current_session_user_id != nmp_user_id:
            print(f"🔄 NSN: Different user detected, clearing session")
            print(f"   Previous user: {current_session_user_id}")
            print(f"   New user: {nmp_user_id}")
            session.clear()
        elif not current_session_user_id and current_loggedin:
            print(f"🔄 NSN: No NMP user_id in session but user is logged in, clearing session")
            print(f"   This prevents new users from inheriting old login state")
            session.clear()
        elif not current_session_user_id:
            print(f"🆕 NSN: New user session, no existing NMP user_id in session")
        else:
            print(f"✅ NSN: Same user as session, keeping existing session")
            
        # 存储当前NMP用户ID到session中供将来参考
        session['nmp_user_id'] = nmp_user_id
        print(f"💾 NSN: Stored nmp_user_id in session: {session.get('nmp_user_id')}")
        
        # 检查用户是否已经登录
        if current_loggedin and session.get('user_id'):
            print(f"✅ NSN: User already logged in with valid session")
            print(f"   User ID: {session.get('user_id')}")
            print(f"   Username: {session.get('username')}")
            print(f"   Role: {session.get('role')}")
            return redirect(url_for('dashboard'))
        
        # 查询B-Client获取用户cookie
        print(f"🔍 NSN: Querying B-Client for cookie for user_id: {nmp_user_id}")
        cookie_result = call_bclient_query_cookie_api(nmp_user_id, nmp_api_port)
        print(f"📋 NSN: B-Client response: {cookie_result}")
        
        # 严格检查cookie是否存在且有效
        print(f"🔍 NSN: Validating cookie result:")
        print(f"   success: {cookie_result.get('success')}")
        print(f"   has_cookie: {cookie_result.get('has_cookie')}")
        print(f"   cookie: {cookie_result.get('cookie', '')[:50]}..." if cookie_result.get('cookie') else "   cookie: None")
        print(f"   username: {cookie_result.get('username')}")
        
        if (cookie_result.get('success') and 
            cookie_result.get('has_cookie') and 
            cookie_result.get('username')):
            
            # 检查B-Client是否成功发送cookie到C-Client
            if cookie_result.get('message') == 'Cookie sent to C-Client, C-Client will handle login':
                print(f"✅ NSN: B-Client successfully sent cookie to C-Client for user {nmp_user_id}")
                actual_username = cookie_result.get('username')
                
                # B-Client已发送cookie到C-Client，C-Client将处理登录
                # C-Client将导航回NSN根路径触发自动登录
                print(f"ℹ️ NSN: C-Client will navigate back to NSN to trigger auto-login")
                # 继续正常流程 - 显示未认证首页
                # C-Client将重新加载此页面并设置cookie
            
            # 回退：B-Client返回cookie到NSN（旧行为）
            elif cookie_result.get('cookie'):
                print(f"✅ NSN: B-Client returned cookie to NSN for user {nmp_user_id} (fallback)")
                actual_username = cookie_result.get('username')
                cookie_data = cookie_result.get('cookie')
                
                # B-Client返回cookie到NSN（回退行为）
                # 这是旧行为，C-Client应该直接处理登录
                print(f"ℹ️ NSN: B-Client returned cookie to NSN (fallback behavior)")
                # 继续正常登录流程
            
            # 回退：使用实际用户名查询NSN数据库中的现有用户
            cursor = db.get_cursor()
            cursor.execute("SELECT user_id, role FROM users WHERE username = %s", (actual_username,))
            user_data = cursor.fetchone()
            cursor.close()
            
            print(f"🔍 NSN: Database query result: {user_data}")
            
            if user_data:
                print(f"✅ NSN: Found user in database: {actual_username}, user_id: {user_data['user_id']}, role: {user_data['role']}")
                
                # 使用NSN数据库中的真实用户数据执行自动登录
                print(f"🔐 NSN: Setting session data:")
                print(f"   user_id: {user_data['user_id']}")
                print(f"   username: {actual_username}")
                print(f"   role: {user_data['role']}")
                
                session['user_id'] = int(user_data['user_id'])  # 确保user_id是整数
                session['loggedin'] = True
                session['username'] = actual_username  # 使用实际注册用户名
                session['role'] = user_data['role']  # 使用数据库中的真实角色
                
                print(f"✅ NSN: Auto-login successful for user {actual_username}")
                print(f"🔍 NSN: Final session state: {dict(session)}")
                return redirect(user_home_url())
            else:
                print(f"⚠️ NSN: User {actual_username} not found in NSN database, showing unauthenticated homepage")
        else:
            print(f"⚠️ NSN: No valid cookie found for user {nmp_user_id}")
            print(f"🔍 NSN: Cookie validation failed - missing required fields")
            print(f"⚠️ NSN: Showing unauthenticated homepage")
        
        # 显示首页（已认证或未认证）
        print(f"🏠 NSN: Rendering homepage with parameters:")
        print(f"   nmp_injected: {nmp_injected}")
        print(f"   nmp_user_id: {nmp_user_id}")
        print(f"   nmp_username: {nmp_username}")
        print(f"   nmp_client_type: {nmp_client_type}")
        print(f"   nmp_timestamp: {nmp_timestamp}")
        
        return render_template('index.html', 
                             nmp_injected=nmp_injected,
                             nmp_user_id=nmp_user_id,
                             nmp_username=nmp_username,
                             nmp_client_type=nmp_client_type,
                             nmp_timestamp=nmp_timestamp)
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
    # Check if the user is logged in; if not, redirect to the login page.
    if 'loggedin' not in session:
        return redirect(url_for('login'))

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

    return render_template("dashboard.html",is_member=is_member, statistics=statistics)


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
    if request.method == 'GET':
        # Check for No More Password injection parameters
        nmp_injected = request.args.get('nmp_injected', 'false').lower() == 'true'
        nmp_user_id = request.args.get('nmp_user_id', '')
        nmp_username = request.args.get('nmp_username', '')
        nmp_client_type = request.args.get('nmp_client_type', '')
        nmp_timestamp = request.args.get('nmp_timestamp', '')
        nmp_node_id = request.args.get('nmp_node_id', '')
        nmp_domain_id = request.args.get('nmp_domain_id', '')
        nmp_cluster_id = request.args.get('nmp_cluster_id', '')
        nmp_channel_id = request.args.get('nmp_channel_id', '')
        
        # Pass NMP parameters to template
        return render_template("login.html", 
                             nmp_injected=nmp_injected,
                             nmp_user_id=nmp_user_id,
                             nmp_username=nmp_username,
                             nmp_client_type=nmp_client_type,
                             nmp_timestamp=nmp_timestamp)
    
    if request.method == 'POST':
        # Retrieve username and password from form data
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        
        # Check for No More Password binding parameters from URL (for C-Client access)
        nmp_injected = request.args.get('nmp_injected', 'false').lower() == 'true'
        nmp_user_id = request.args.get('nmp_user_id', '')
        nmp_username = request.args.get('nmp_username', '')
        nmp_client_type = request.args.get('nmp_client_type', '')
        nmp_timestamp = request.args.get('nmp_timestamp', '')
        
        
        # Also check form data for NMP parameters (for direct form submission)
        nmp_bind = request.form.get("nmp_bind", "false").lower() == "true"
        nmp_bind_type = request.form.get("nmp_bind_type", "bind")  # "bind" or "signup"
        nmp_auto_refresh = request.form.get("nmp_auto_refresh", "false").lower() == "true"
        nmp_auto_login = request.form.get("nmp_auto_login", "false").lower() == "true"  # For B-Client auto login

        # Ensure username and password are provided
        if not username or not password:
            flash("Username and password are required", "danger")
            return render_template("login.html", username=username)

        # Fetch user details from the database
        with db.get_cursor() as cursor:
            cursor.execute("SELECT user_id, username, password_hash, role, status FROM users WHERE username = %s",
                           (username,))
            user = cursor.fetchone()
            db.close_db()

        # Validate user existence and password correctness
        if not user or not bcrypt.check_password_hash(user["password_hash"], password):
            flash("Invalid username or password", "danger")
            # Pass NMP parameters to template even on login failure
            # Ensure nmp_injected is True if any NMP parameters are present
            nmp_injected_final = nmp_injected or bool(nmp_user_id and nmp_username)
            return render_template("login.html", 
                                 username=username,
                                 nmp_injected=nmp_injected_final,
                                 nmp_user_id=nmp_user_id,
                                 nmp_username=nmp_username,
                                 nmp_client_type=nmp_client_type,
                                 nmp_timestamp=nmp_timestamp)

        # Check if the account is banned
        if user["status"] == "banned":
            flash("Your account has been banned. Please contact support.", "danger")
            # Pass NMP parameters to template even on login failure
            # Ensure nmp_injected is True if any NMP parameters are present
            nmp_injected_final = nmp_injected or bool(nmp_user_id and nmp_username)
            return render_template("login.html", 
                                 username=username,
                                 nmp_injected=nmp_injected_final,
                                 nmp_user_id=nmp_user_id,
                                 nmp_username=nmp_username,
                                 nmp_client_type=nmp_client_type,
                                 nmp_timestamp=nmp_timestamp)

        # Successful login: Store session data
        session["loggedin"] = True
        session["user_id"] = user["user_id"]
        session["username"] = user["username"]
        session["role"] = user["role"]
        
        # Store NMP binding info in session if present (but not for auto login)
        if nmp_bind and nmp_user_id and nmp_username and not nmp_auto_login:
            session["nmp_bind"] = True
            session["nmp_bind_type"] = nmp_bind_type
            session["nmp_auto_refresh"] = nmp_auto_refresh
            session["nmp_user_id"] = nmp_user_id
            session["nmp_username"] = nmp_username
            session["nmp_client_type"] = nmp_client_type
            session["nmp_timestamp"] = nmp_timestamp
            print(f"🔐 NMP Binding info stored in session: user_id={nmp_user_id}, username={nmp_username}, type={nmp_bind_type}, auto_refresh={nmp_auto_refresh}")
            
            # Call B-Client bind API based on binding type
            print(f"🔗 NSN: User {username} requested NMP binding (type: {nmp_bind_type}), calling B-Client API...")
            bind_result = call_bclient_bind_api(nmp_user_id, nmp_username, username, password, nmp_bind_type, nmp_auto_refresh)
            
            if bind_result["success"]:
                print(f"✅ NSN: Successfully bound user {username} to NMP system")
                print(f"🔍 NSN: B-Client response structure: {list(bind_result.keys())}")
                
                # Check if B-Client provided complete session data for auto-login
                complete_session_data = bind_result.get("data", {}).get("complete_session_data")
                login_success = bind_result.get("data", {}).get("login_success", False)
                
                print(f"🔍 NSN: Complete session data from B-Client: {complete_session_data}")
                print(f"🔍 NSN: Login success from B-Client: {login_success}")
                print(f"🔍 NSN: Full data: {bind_result.get('data', {})}")
                
                if complete_session_data and login_success:
                    print(f"🔐 NSN: B-Client provided complete session data for user {username}")
                    print(f"   Complete session data: {complete_session_data}")
                    
                    # B-Client has sent complete session data to C-Client
                    # NSN should not set session here - C-Client will handle the login
                    print(f"ℹ️ NSN: B-Client sent complete session data to C-Client")
                    print(f"ℹ️ NSN: C-Client will handle auto-login to NSN")
                    flash("Successfully bound to No More Password system!", "success")
                else:
                    print(f"ℹ️ NSN: No complete session data provided by B-Client")
                    flash("Successfully bound to No More Password system!", "success")
            else:
                print(f"❌ NSN: Failed to bind user {username} to NMP system: {bind_result['error']}")
                flash(f"Failed to bind to No More Password: {bind_result['error']}", "warning")

        # Redirect based on user role
        return redirect(user_home_url())

    return render_template("login.html")


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

    if 'loggedin' in session:
        return redirect(user_home_url())

    # Ensure all required form fields are provided
    required_fields = ['username', 'email', 'password', 'confirm_password', 'first_name', 'last_name', 'location']
    if request.method == 'POST' and all(field in request.form for field in required_fields):

        # Retrieve form data
        username = request.form['username'].strip()
        email = request.form['email'].strip()
        password = request.form['password']
        confirm_password = request.form['confirm_password']
        first_name = request.form['first_name'].strip()
        last_name = request.form['last_name'].strip()
        location = request.form['location'].strip()

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

        # Check if username or email is already registered
        with db.get_cursor() as cursor:
            cursor.execute('SELECT user_id FROM users WHERE username = %s OR email = %s;', (username, email))
            existing_user = cursor.fetchone()
            db.close_db()

        if existing_user:
            username_error = 'Username or email is already registered.'
        elif len(username) > 20:
            username_error = 'Your username cannot exceed 20 characters.'
        elif not re.match(r'^[A-Za-z0-9]+$', username):
            username_error = 'Your username can only contain letters and numbers.'

        # Validate email format
        if len(email) > 320:
            email_error = 'Your email address cannot exceed 320 characters.'
        elif not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', email):
            email_error = 'Invalid email address.'

        # Validate password complexity and confirmation
        if len(password) < 8:
            password_error = 'Please choose a longer password!'
        elif not re.match(r'^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@#$%^&+=!]).{8,}$', password):
            password_error = 'Your password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character (@#$%^&+=!).'

        if password != confirm_password:
            confirm_password_error = 'Passwords do not match.'

        # Validate first name and last name
        if not first_name or len(first_name) > 50:
            first_name_error = 'First name is required and cannot exceed 50 characters.'
        if not last_name or len(last_name) > 50:
            last_name_error = 'Last name is required and cannot exceed 50 characters.'

        # If any validation errors exist, return to signup page with errors
        if username_error or email_error or password_error or confirm_password_error or first_name_error or last_name_error:
            return render_template('signup.html',
                                   username=username,
                                   email=email,
                                   username_error=username_error,
                                   email_error=email_error,
                                   password_error=password_error,
                                   confirm_password_error=confirm_password_error,
                                   first_name=first_name,
                                   last_name=last_name,
                                   first_name_error=first_name_error,
                                   last_name_error=last_name_error)

        # Hash the password before storing it in the database
        password_hash = bcrypt.generate_password_hash(password).decode('utf-8')

        # Insert new user into the database
        with db.get_cursor() as cursor:
            cursor.execute('''
                INSERT INTO users (username, password_hash, email, first_name, last_name, location_id, role)
                VALUES (%s, %s, %s, %s, %s, %s, %s);
            ''', (username, password_hash, email, first_name, last_name, location_id, 'traveller'))
            new_user_id = cursor.lastrowid  # Get the auto-generated user_id
            db.close_db()

        # Return to signup page with success message and user_id
        return render_template('signup.html', signup_successful=True, new_user_id=new_user_id)

    with db.get_cursor() as cursor:
        cursor.execute('SELECT distinct country FROM locations ;')
        countries = cursor.fetchall()
        db.close_db()
    return render_template('signup.html', countries=countries)




@app.route('/logout')
def logout():
    """Logout endpoint.

    Methods:
    - get: Logs the current user out (if they were logged in to begin with),
        calls B-Client to clear user cookies, and redirects them to the login page.
    """

    # Get user info before clearing session
    user_id = session.get('user_id')
    username = session.get('username')
    nmp_user_id = session.get('nmp_user_id')  # Get NMP user ID (UUID) for B-Client
    
    # Clear NSN session
    session.pop('loggedin', None)
    session.pop('user_id', None)
    session.pop('username', None)
    session.pop('role', None)

    # Clear NMP session data if present
    session.pop('nmp_bind', None)
    session.pop('nmp_bind_type', None)
    session.pop('nmp_auto_refresh', None)
    session.pop('nmp_user_id', None)
    session.pop('nmp_username', None)
    session.pop('nmp_client_type', None)
    session.pop('nmp_timestamp', None)
    
    # Call B-Client to handle logout (clear cookies and notify C-Client)
    if nmp_user_id and username:
        try:
            print(f"🔓 NSN: ===== LOGOUT PROCESS START =====")
            print(f"🔓 NSN: User: {username} (NSN ID: {user_id}, NMP ID: {nmp_user_id})")
            print(f"🔓 NSN: Step 1: Calling B-Client logout API...")
            print(f"🔓 NSN: B-Client URL: {B_CLIENT_API_URL}/bind")
            
            # Call B-Client logout API using NMP user ID (UUID)
            url = f"{B_CLIENT_API_URL}/bind"
            data = {
                "request_type": "logout_user",
                "user_id": nmp_user_id,  # Use NMP user ID (UUID) instead of NSN user ID (number)
                "user_name": username
            }
            
            print(f"🔓 NSN: Request data: {data}")
            response = requests.post(url, json=data, timeout=5)
            print(f"🔓 NSN: B-Client response status: {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                print(f"🔓 NSN: B-Client response: {result}")
                
                if result.get('success'):
                    print(f"✅ NSN: ===== LOGOUT SUCCESS =====")
                    print(f"✅ NSN: User {username} logged out successfully")
                    print(f"✅ NSN: B-Client cleared {result.get('cleared_count', 0)} cookies")
                    print(f"✅ NSN: C-Client session cleared: {result.get('c_client_notified', False)}")
                    print(f"✅ NSN: ===== LOGOUT PROCESS END =====")
                else:
                    print(f"⚠️ NSN: ===== LOGOUT FAILED =====")
                    print(f"⚠️ NSN: Failed to logout user {username}: {result.get('error', 'Unknown error')}")
                    print(f"⚠️ NSN: ===== LOGOUT PROCESS END =====")
            else:
                print(f"⚠️ NSN: ===== LOGOUT FAILED =====")
                print(f"⚠️ NSN: B-Client API call failed with status {response.status_code}")
                print(f"⚠️ NSN: Response text: {response.text}")
                print(f"⚠️ NSN: ===== LOGOUT PROCESS END =====")
                
        except Exception as e:
            print(f"⚠️ NSN: ===== LOGOUT ERROR =====")
            print(f"⚠️ NSN: Error calling B-Client logout API: {e}")
            print(f"⚠️ NSN: ===== LOGOUT PROCESS END =====")
    else:
        print(f"🔓 NSN: ===== LOGOUT PROCESS START =====")
        print(f"🔓 NSN: No user_id or username found, skipping B-Client call")
        print(f"🔓 NSN: ===== LOGOUT PROCESS END =====")
    
    print(f"🔓 NSN: Redirecting to root page...")
    return redirect(url_for('root'))


@app.route('/api/current-user', methods=['GET'])
def api_current_user():
    """API endpoint for B-Client to get current user information from session.
    
    This endpoint returns the current user's information based on the session cookie.
    B-Client can call this after successful login to get user_id and role.
    
    Returns:
        JSON response containing current user information.
    """
    try:
        print(f"🔍 NSN: Current user API called")
        
        # Check if user is logged in
        if not session.get('loggedin') or not session.get('user_id'):
            print(f"❌ NSN: No valid session found")
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

