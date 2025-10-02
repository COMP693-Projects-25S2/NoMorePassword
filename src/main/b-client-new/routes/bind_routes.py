"""
Bind Routes
Handles the core NMP bind API endpoint for signup/login integration
"""
from flask import Blueprint, request, jsonify, current_app as app
from datetime import datetime
import json
import time
import threading
import asyncio

# Create blueprint for bind routes
bind_routes = Blueprint('bind_routes', __name__)

# These will be injected when blueprint is registered
db = None
UserCookie = None
UserAccount = None
nsn_client = None
c_client_ws = None
save_cookie_to_db_func = None
save_account_to_db_func = None
send_session_to_client_func = None


def init_bind_routes(database, user_cookie_model, user_account_model, nsn_service, websocket_client, save_cookie_func, save_account_func, send_session_func):
    """Initialize bind routes with database models and services"""
    global db, UserCookie, UserAccount, nsn_client, c_client_ws
    global save_cookie_to_db_func, save_account_to_db_func, send_session_to_client_func
    
    db = database
    UserCookie = user_cookie_model
    UserAccount = user_account_model
    nsn_client = nsn_service
    c_client_ws = websocket_client
    save_cookie_to_db_func = save_cookie_func
    save_account_to_db_func = save_account_func
    send_session_to_client_func = send_session_func



@bind_routes.route('/bind', methods=['POST'])
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
                save_cookie_to_db_func(nmp_user_id, nsn_username, nsn_session_cookie, node_id, auto_refresh, nsn_user_id, nsn_username)
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
                
                send_result = loop.run_until_complete(send_session_to_client_func(
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
                
                send_result = loop.run_until_complete(send_session_to_client_func(
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
                    save_cookie_to_db_func(nmp_user_id, nsn_username, login_result['session_cookie'], node_id, auto_refresh, nsn_user_id, nsn_username)
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
                    
                    send_result = loop.run_until_complete(send_session_to_client_func(
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
                    save_cookie_to_db_func(nmp_user_id, nsn_username, login_result['session_cookie'], node_id, auto_refresh, nsn_user_id, nsn_username)
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
                    
                    send_result = loop.run_until_complete(send_session_to_client_func(nmp_user_id, processed_session, nsn_user_id, nsn_username, reset_logout_status=True))  # Manual login should reset logout status
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
                save_account_to_db_func(nmp_user_id, nmp_username, unique_username, generated_password, signup_data)
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
                        save_cookie_to_db_func(nmp_user_id, nsn_username, session_cookie, node_id, auto_refresh, nsn_user_id, nsn_username)
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
                                send_result = loop.run_until_complete(send_session_to_client_func(
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

