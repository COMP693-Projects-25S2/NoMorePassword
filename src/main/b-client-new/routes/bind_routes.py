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
import requests

# 导入日志系统
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from utils.logger import get_bclient_logger

# Create blueprint for bind routes
bind_routes = Blueprint('bind_routes', __name__)

# 初始化日志系统
logger = get_bclient_logger('bind_routes')

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
    
    # 初始化日志系统
    global logger
    logger = get_bclient_logger('routes')
    
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
        logger.info(f"===== BIND API CALLED =====")
        logger.info(f"Request timestamp: {datetime.now()}")
        logger.info(f"Request IP: {request.remote_addr}")
        logger.info(f"Request method: {request.method}")
        logger.info(f"Request content type: {request.content_type}")
        
        data = request.get_json()
        logger.info(f"Raw request data: {data}")
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
        
        logger.info(f"===== BIND API REQUEST =====")
        logger.info(f"Request timestamp: {datetime.utcnow().isoformat()}")
        logger.info(f"Request data: {data}")
        logger.info(f"nmp_user_id: {nmp_user_id}")
        logger.info(f"nmp_username: {nmp_username}")
        logger.info(f"request_type: {request_type} ({'signup' if request_type == 0 else 'logout' if request_type == 2 else 'bind'})")
        logger.info(f"domain_id: {domain_id}")
        logger.info(f"node_id: {node_id}")
        logger.info(f"auto_refresh: {auto_refresh}")
        # login_source logging removed
        logger.info(f"provided_account: {provided_account}")
        logger.info(f"provided_password: {'*' * len(provided_password) if provided_password else 'None'}")
        logger.info(f"nsn_session_cookie: {'provided' if nsn_session_cookie else 'None'}")
        logger.info(f"nsn_user_id: {nsn_user_id}")
        logger.info(f"nsn_username: {nsn_username}")
        logger.info(f"===== END BIND API REQUEST =====")
        
        if not nmp_user_id or not nmp_username:
            return jsonify({
                'success': False,
                'error': 'user_id and user_name are required'
            }), 400
        
        # Handle logout request (request_type = 2)
        if request_type == 2:  # logout
            logger.info(f"===== STEP 0: LOGOUT REQUEST =====")
            logger.info(f"Processing logout request for user {nmp_user_id}")
            logger.info(f"Username: {nmp_username}")
            
            try:
                # Step 1: Delete user_cookies records for this user
                logger.info(f"Step 1: Deleting user_cookies records...")
                deleted_cookies_count = UserCookie.query.filter_by(user_id=nmp_user_id).delete()
                db.session.commit()
                logger.info(f"Deleted {deleted_cookies_count} user_cookies records")
                
                # Step 2: Mark user_accounts as logged out to prevent auto-login (IMMEDIATE)
                logger.info(f"Step 2: Immediately marking user_accounts as logged out...")
                updated_accounts_count = UserAccount.query.filter_by(user_id=nmp_user_id).update({'logout': True})
                db.session.commit()
                logger.info(f"Step 2: IMMEDIATELY marked {updated_accounts_count} user_accounts records as logged out")
                
                # Force database flush to ensure changes are immediately visible
                db.session.flush()
                logger.info(f"Database changes flushed to ensure immediate visibility")
                
                # Step 3: Notify C-client to clear session via WebSocket
                logger.info(f"Step 3: Notifying C-client to clear session...")
                
                # Check if there are active connections for this user before attempting notification
                has_active_connections = False
                if hasattr(c_client_ws, 'user_connections') and c_client_ws.user_connections:
                    user_connections = c_client_ws.user_connections.get(nmp_user_id, [])
                    # Check connection status - websockets ServerConnection uses different attributes
                    active_connections = []
                    for ws in user_connections:
                        try:
                            # Use the centralized connection validation method
                            if c_client_ws.is_connection_valid(ws):
                                active_connections.append(ws)
                        except Exception as e:
                            logger.warning(f"Error checking connection status: {e}")
                            # If we can't check, assume it's closed
                            pass
                    has_active_connections = len(active_connections) > 0
                    logger.info(f"Checking connections for user {nmp_user_id}:")
                    logger.info(f"   Total connections: {len(user_connections)}")
                    logger.info(f"   Active connections: {len(active_connections)}")
                    logger.info(f"   Has active connections: {has_active_connections}")
                
                logger.info(f"===== WEBSOCKET CONNECTION POOL STATUS ======")
                logger.info(f"user_connections exists: {hasattr(c_client_ws, 'user_connections')}")
                if hasattr(c_client_ws, 'user_connections'):
                    logger.info(f"user_connections keys: {list(c_client_ws.user_connections.keys())}")
                    logger.info(f"user_connections total users: {len(c_client_ws.user_connections)}")
                logger.info(f"node_connections exists: {hasattr(c_client_ws, 'node_connections')}")
                if hasattr(c_client_ws, 'node_connections'):
                    logger.info(f"node_connections keys: {list(c_client_ws.node_connections.keys())}")
                    logger.info(f"node_connections total nodes: {len(c_client_ws.node_connections)}")
                logger.info(f"client_connections exists: {hasattr(c_client_ws, 'client_connections')}")
                if hasattr(c_client_ws, 'client_connections'):
                    logger.info(f"client_connections keys: {list(c_client_ws.client_connections.keys())}")
                    logger.info(f"client_connections total clients: {len(c_client_ws.client_connections)}")
                logger.info(f"===== END WEBSOCKET CONNECTION POOL STATUS ======")
                
                if has_active_connections:
                    # Use app context for WebSocket operations
                    with app.app_context():
                        # Send logout notification to C-client via WebSocket
                        import asyncio
                        loop = asyncio.new_event_loop()
                        asyncio.set_event_loop(loop)
                        
                        try:
                            # Send logout notification to all C-client connections for this user
                            logger.info(f"===== SENDING LOGOUT NOTIFICATION ======")
                            logger.info(f"Target user: {nmp_user_id}")
                            logger.info(f"Target username: {nmp_username}")
                            logger.info(f"Website: NSN (http://localhost:5000)")
                            
                            notify_result = loop.run_until_complete(c_client_ws.notify_user_logout(
                           nmp_user_id, 
                           nmp_username,
                           website_root_path='http://localhost:5000',
                           website_name='NSN'
                       ))
                            logger.info(f"C-client logout notification result: {notify_result}")
                            
                            if notify_result:
                                logger.info(f"Successfully notified C-client to clear session")
                                logger.info(f"C-Client should now disconnect WebSocket connection")
                            else:
                                logger.warning(f"Failed to notify C-client (notification failed)")
                                logger.warning(f"C-Client may not have received logout notification")
                            
                        except Exception as e:
                            logger.error(f"Error notifying C-client: {e}")
                            logger.error(f"Error type: {type(e)}")
                            logger.error(f"Error details: {str(e)}")
                        finally:
                            loop.close()
                            
                            # Clean up invalid connections after logout notification is sent
                            logger.info(f"Cleaning up invalid connections after logout notification...")
                            c_client_ws.cleanup_invalid_connections()
                            logger.info(f"Invalid connections cleanup completed after logout notification")
                else:
                    logger.warning(f"No active C-client connections found for user {nmp_user_id}")
                    logger.info(f"Skipping logout notification (user may have already disconnected)")
                    
                    # Clean up invalid connections even if no notification was sent
                    logger.info(f"Cleaning up invalid connections (no notification sent)...")
                    c_client_ws.cleanup_invalid_connections()
                    logger.info(f"Invalid connections cleanup completed (no notification sent)")
                
                # Step 4: Clear any remaining session data to prevent auto-login
                logger.info(f"Step 4: Clearing remaining session data to prevent auto-login...")
                try:
                    # Clear any remaining cookies for this user
                    remaining_cookies = UserCookie.query.filter_by(user_id=nmp_user_id).all()
                    for cookie in remaining_cookies:
                        db.session.delete(cookie)
                    db.session.commit()
                    logger.info(f"Cleared {len(remaining_cookies)} remaining cookies")
                except Exception as e:
                    logger.warning(f"Error clearing remaining cookies: {e}")
                
                # Step 5: Clear WebSocket connection pool to prevent cached session data
                logger.info(f"Step 5: Clearing WebSocket connection pool to prevent cached session data...")
                try:
                    # Clear user from all connection pools to prevent cached session data
                    if hasattr(c_client_ws, 'user_connections') and nmp_user_id in c_client_ws.user_connections:
                        user_connections = c_client_ws.user_connections[nmp_user_id]
                        logger.info(f"Found {len(user_connections)} connections for user {nmp_user_id}")
                        logger.debug(f"WebSocket connection details:")
                        for i, ws in enumerate(user_connections):
                            logger.debug(f"   Connection {i+1}: {type(ws)}")
                            logger.debug(f"   Connection {i+1}: close_code = {getattr(ws, 'close_code', 'N/A')}")
                            logger.debug(f"   Connection {i+1}: closed = {getattr(ws, 'closed', 'N/A')}")
                            logger.debug(f"   Connection {i+1}: state = {getattr(ws, 'state', 'N/A')}")
                        
                        # FIXED: Mark connections as closed by logout AFTER logout notification is sent
                        logger.info(f"Marking WebSocket connections as closed by logout for user {nmp_user_id}...")
                        for i, ws in enumerate(user_connections):
                            try:
                                logger.info(f"Marking connection {i+1} as closed by logout")
                                logger.debug(f"Connection {i+1} state: {getattr(ws, 'state', 'N/A')}")
                                
                                # Mark the connection as closed by logout
                                ws._closed_by_logout = True
                                
                                # FIXED: Clear connection cache to prevent stale connections
                                websocket_id = id(ws)
                                if hasattr(c_client_ws, 'connection_validity_cache') and websocket_id in c_client_ws.connection_validity_cache:
                                    del c_client_ws.connection_validity_cache[websocket_id]
                                    logger.debug(f"Cleared connection validity cache for connection {i+1}")
                                
                                logger.info(f"Connection {i+1} marked as closed by logout")
                                
                            except Exception as e:
                                logger.error(f"Error marking connection {i+1}: {e}")
                        
                        # FIXED: Remove user from connection pools BEFORE cleanup to prevent stale connections
                        if nmp_user_id in c_client_ws.user_connections:
                            del c_client_ws.user_connections[nmp_user_id]
                            logger.info(f"Immediately removed user {nmp_user_id} from user_connections pool")
                        
                        # FIXED: Clear user connection cache to prevent stale connections
                        if hasattr(c_client_ws, 'connection_cache') and nmp_user_id in c_client_ws.connection_cache:
                            del c_client_ws.connection_cache[nmp_user_id]
                            logger.debug(f"Cleared user connection cache for user {nmp_user_id}")
                        
                        # Clean up invalid connections after removing from pools
                        logger.info(f"Cleaning up invalid connections after removing user from pools...")
                        c_client_ws.cleanup_invalid_connections()
                        logger.info(f"Invalid connections cleanup completed after removing user from pools")
                        
                        # Notify NodeManager to clean up hierarchy pools for each connection
                        logger.info(f"Notifying NodeManager to clean up hierarchy pools for {len(user_connections)} connections...")
                        for i, ws in enumerate(user_connections):
                            try:
                                # Get connection info from websocket attributes
                                node_id = getattr(ws, 'node_id', 'unknown')
                                user_id = getattr(ws, 'user_id', 'unknown')
                                username = getattr(ws, 'username', 'unknown')
                                domain_id = getattr(ws, 'domain_id', None)
                                cluster_id = getattr(ws, 'cluster_id', None)
                                channel_id = getattr(ws, 'channel_id', None)
                                is_domain_main_node = getattr(ws, 'is_domain_main_node', False)
                                is_cluster_main_node = getattr(ws, 'is_cluster_main_node', False)
                                is_channel_main_node = getattr(ws, 'is_channel_main_node', False)
                                
                                # Create ClientConnection object for NodeManager cleanup
                                from services.nodeManager import ClientConnection
                                connection = ClientConnection(
                                    websocket=ws,
                                    node_id=node_id,
                                    user_id=user_id,
                                    username=username,
                                    domain_id=domain_id,
                                    cluster_id=cluster_id,
                                    channel_id=channel_id,
                                    is_domain_main_node=is_domain_main_node,
                                    is_cluster_main_node=is_cluster_main_node,
                                    is_channel_main_node=is_channel_main_node
                                )
                                
                                # Call NodeManager's remove_connection method
                                if hasattr(c_client_ws, 'node_manager') and c_client_ws.node_manager:
                                    c_client_ws.node_manager.remove_connection(connection)
                                    logger.debug(f"Notified NodeManager to clean up hierarchy pools for connection {i+1}")
                                else:
                                    logger.warning(f"NodeManager not available for connection {i+1}")
                                    
                            except Exception as e:
                                logger.warning(f"Error notifying NodeManager for connection {i+1}: {e}")
                        
                        logger.info(f"NodeManager hierarchy cleanup completed for all connections")
                        
                        # Wait a moment for the close to propagate
                        logger.info(f"Waiting for WebSocket close to propagate...")
                        time.sleep(1.0)  # Wait 1 second for close to propagate
                        logger.info(f"WebSocket close propagation wait completed")
                    
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
                                logger.debug(f"Removed user {nmp_user_id} connection from node {node_id}")
                            
                            # If no connections left for this node, mark for removal
                            if not connections:
                                nodes_to_remove.append(node_id)
                        
                        # Remove empty node connections
                        for node_id in nodes_to_remove:
                            del c_client_ws.node_connections[node_id]
                            logger.debug(f"Removed empty node {node_id} from node_connections")
                    
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
                                logger.debug(f"Removed user {nmp_user_id} connection from client {client_id}")
                            
                            # If no connections left for this client, mark for removal
                            if not connections:
                                clients_to_remove.append(client_id)
                        
                        # Remove empty client connections
                        for client_id in clients_to_remove:
                            del c_client_ws.client_connections[client_id]
                            logger.debug(f"Removed empty client {client_id} from client_connections")
                    
                    logger.info(f"WebSocket connection pool cleared for user {nmp_user_id}")
                    
                    # Verify connection pool cleanup
                    logger.debug(f"===== POST-CLEANUP WEBSOCKET CONNECTION POOL STATUS ======")
                    logger.debug(f"user_connections exists: {hasattr(c_client_ws, 'user_connections')}")
                    if hasattr(c_client_ws, 'user_connections'):
                        logger.debug(f"user_connections keys: {list(c_client_ws.user_connections.keys())}")
                        logger.info(f"user_connections total users: {len(c_client_ws.user_connections)}")
                        if nmp_user_id in c_client_ws.user_connections:
                            logger.error(f"ERROR: User {nmp_user_id} still in user_connections after cleanup!")
                        else:
                            logger.info(f"User {nmp_user_id} successfully removed from user_connections")
                    logger.info(f"node_connections exists: {hasattr(c_client_ws, 'node_connections')}")
                    if hasattr(c_client_ws, 'node_connections'):
                        logger.info(f"node_connections keys: {list(c_client_ws.node_connections.keys())}")
                        logger.info(f"node_connections total nodes: {len(c_client_ws.node_connections)}")
                    logger.info(f"client_connections exists: {hasattr(c_client_ws, 'client_connections')}")
                    if hasattr(c_client_ws, 'client_connections'):
                        logger.info(f"client_connections keys: {list(c_client_ws.client_connections.keys())}")
                        logger.info(f"client_connections total clients: {len(c_client_ws.client_connections)}")
                    logger.debug(f"===== END POST-CLEANUP WEBSOCKET CONNECTION POOL STATUS ======")
                    
                except Exception as e:
                    logger.warning(f"Error clearing WebSocket connection pool: {e}")
                
                # Step 6: Clear B-Client internal session cache to prevent auto-login
                logger.info(f"Step 6: Clearing B-Client internal session cache to prevent auto-login...")
                try:
                    # Clear any cached session data for this user
                    if hasattr(c_client_ws, 'user_sessions'):
                        if nmp_user_id in c_client_ws.user_sessions:
                            del c_client_ws.user_sessions[nmp_user_id]
                            logger.debug(f"Cleared cached session data for user {nmp_user_id}")
                    
                    # Clear any cached cookie data for this user
                    if hasattr(c_client_ws, 'user_cookies'):
                        if nmp_user_id in c_client_ws.user_cookies:
                            del c_client_ws.user_cookies[nmp_user_id]
                            logger.debug(f"Cleared cached cookie data for user {nmp_user_id}")
                    
                    # Clear any cached auto-login data for this user
                    if hasattr(c_client_ws, 'auto_login_cache'):
                        if nmp_user_id in c_client_ws.auto_login_cache:
                            del c_client_ws.auto_login_cache[nmp_user_id]
                            logger.debug(f"Cleared cached auto-login data for user {nmp_user_id}")
                    
                    logger.info(f"B-Client internal session cache cleared for user {nmp_user_id}")
                    
                except Exception as e:
                    logger.warning(f"Error clearing B-Client internal session cache: {e}")
                
                # Step 6: Return success response
                logger.info(f"===== LOGOUT SUCCESS =====")
                logger.info(f"User {nmp_user_id} logged out successfully")
                logger.info(f"Deleted {deleted_cookies_count} cookies, preserved accounts")
                
                return jsonify({
                    'success': True,
                    'message': 'User logged out successfully',
                    'cleared_count': deleted_cookies_count,
                    'c_client_notified': True,
                    'user_id': nmp_user_id,
                    'username': nmp_username
                })
                
            except Exception as e:
                logger.error(f"Error during logout process: {e}")
                import traceback
                traceback.print_exc()
                return jsonify({
                    'success': False,
                    'error': f'Logout failed: {str(e)}'
                }), 500
        
        # 0. 处理NSN已经登录成功的情况（新流程）
        if nsn_session_cookie and nsn_user_id and nsn_username:
            logger.info(f"===== STEP 0: NSN SESSION PROVIDED =====")
            logger.info(f"Processing NSN session provided after successful login")
            logger.info(f"NSN user ID: {nsn_user_id}, Username: {nsn_username}")
            
            # 重置logout状态，允许用户重新登录
            logger.info(f"===== RESETTING LOGOUT STATUS =====")
            try:
                updated_accounts = UserAccount.query.filter_by(
                    user_id=nmp_user_id,
                    website='nsn'
                ).update({'logout': False})
                db.session.commit()
                logger.info(f"Reset logout status for {updated_accounts} user_accounts records")
            except Exception as e:
                logger.warning(f"Failed to reset logout status: {e}")
            
            # 保存session到user_cookies（复用save_cookie_to_db函数）
            logger.info(f"===== SAVING SESSION TO DATABASE =====")
            try:
                save_cookie_to_db_func(nmp_user_id, nsn_username, nsn_session_cookie, node_id, auto_refresh, nsn_user_id, nsn_username)
                logger.info(f"Session saved to database successfully")
            except Exception as e:
                logger.error(f"Failed to save session to database: {e}")
                return jsonify({
                    'success': False,
                    'error': 'Failed to save session to database'
                }), 500
            
            # 发送给C-Client（复用send_session_to_client函数）
            logger.info(f"===== SENDING SESSION TO C-CLIENT =====")
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
                logger.info(f"Session send result: {send_result}")
                logger.info(f"Session sent to C-Client for user {nmp_user_id}")
            except Exception as e:
                logger.warning(f"Failed to send session to C-Client: {e}")
            
            response_data = {
                'success': True,
                'login_success': True,
                'complete_session_data': nsn_session_cookie,
                'message': 'NSN session saved and sent to C-Client'
            }
            logger.info(f"===== RETURNING RESPONSE =====")
            logger.info(f"Response data: {response_data}")
            return jsonify(response_data)
        
        # 1. 查询 user_cookies
        logger.info(f"===== STEP 1: CHECKING USER_COOKIES =====")
        logger.info(f"Querying user_cookies table for user_id='{nmp_user_id}'")
        
        # 查询该用户的所有cookie记录，因为username可能是NSN用户名而不是NMP用户名
        existing_cookies = UserCookie.query.filter_by(user_id=nmp_user_id).all()
        existing_cookie = existing_cookies[0] if existing_cookies else None
        
        if existing_cookies:
            logger.info(f"Found {len(existing_cookies)} cookie record(s) for user {nmp_user_id}")
            for i, cookie in enumerate(existing_cookies):
                logger.debug(f"Cookie {i+1}: user_id={cookie.user_id}, username={cookie.username}, create_time={cookie.create_time}")
        else:
            logger.info(f"No cookie records found for user {nmp_user_id}")
        
        if existing_cookie:
            logger.info(f"===== EXISTING COOKIE FOUND =====")
            logger.info(f"Cookie record found for user {nmp_user_id}")
            logger.info(f"Cookie ID: {existing_cookie.user_id}")
            logger.info(f"Cookie username: {existing_cookie.username}")
            logger.info(f"Cookie node_id: {existing_cookie.node_id}")
            logger.info(f"Cookie auto_refresh: {existing_cookie.auto_refresh}")
            logger.info(f"Cookie create_time: {existing_cookie.create_time}")
            logger.info(f"Cookie refresh_time: {existing_cookie.refresh_time}")
            logger.info(f"Cookie data length: {len(existing_cookie.cookie) if existing_cookie.cookie else 0}")
            logger.debug(f"Cookie data preview: {existing_cookie.cookie[:100]}...")
            
            # 发送 session 给 C-Client
            logger.info(f"===== SENDING SESSION TO C-CLIENT =====")
            logger.info(f"Attempting to send session to C-Client for user {nmp_user_id}")
            try:
                import asyncio
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                # For existing cookies, we need to extract NSN user info from the cookie
                # The cookie contains the NSN username, we need to query for user_id
                nsn_username = existing_cookie.username  # This is the NSN username
                logger.info(f"NSN username from cookie: {nsn_username}")
                
                # Query NSN to get the user_id for this username
                try:
                    nsn_user_info = nsn_client.query_user_info(nsn_username)
                    if nsn_user_info.get('success'):
                        nsn_user_id = nsn_user_info.get('user_id')
                        logger.info(f"NSN user info - ID: {nsn_user_id}, Username: {nsn_username}")
                    else:
                        logger.warning(f"Failed to get NSN user info for {nsn_username}")
                        nsn_user_id = None
                except Exception as e:
                    logger.warning(f"Error querying NSN user info: {e}")
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
                logger.info(f"Session send result: {send_result}")
                logger.info(f"Session sent to C-Client for user {nmp_user_id}")
            except Exception as e:
                logger.warning(f"Failed to send session to C-Client: {e}")
                import traceback
                traceback.print_exc()
            
            response_data = {
                'success': True,
                'login_success': True,
                'complete_session_data': existing_cookie.cookie,
                'message': 'Existing session found and sent to C-Client'
            }
            logger.info(f"===== RETURNING RESPONSE =====")
            logger.info(f"Response data: {response_data}")
            return jsonify(response_data)
        else:
            logger.info(f"No existing cookie found for user {nmp_user_id}")
            logger.info(f"===== END STEP 1: NO COOKIE FOUND =====")
        
        # 2. 检查NSN是否有session数据（Login with NMP场景）
        if not provided_account and not provided_password and request_type == 1:
            logger.info(f"===== STEP 2: CHECKING NSN SESSION DATA =====")
            logger.info(f"No credentials provided, checking if NSN has session data")
            logger.info(f"Request type: {request_type} (1=login, 0=signup)")
            logger.info(f"Provided account: {provided_account}")
            logger.info(f"Provided password: {'***' if provided_password else None}")
            
            try:
                session_data_url = "http://localhost:5000/api/nmp-session-data"
                session_response = requests.get(session_data_url, timeout=10)
                
                if session_response.status_code == 200:
                    session_data = session_response.json()
                    if session_data.get('success'):
                        nsn_session_cookie = session_data.get('session_cookie')
                        nsn_user_id = session_data.get('nsn_user_id')
                        nsn_username = session_data.get('nsn_username')
                        logger.info(f"NSN session data found: {nsn_username} (ID: {nsn_user_id})")
                        
                        # 保存session到user_cookies
                        logger.info(f"===== SAVING NSN SESSION TO DATABASE =====")
                        try:
                            save_cookie_to_db_func(nmp_user_id, nsn_username, nsn_session_cookie, node_id, auto_refresh, nsn_user_id, nsn_username)
                            logger.info(f"NSN session saved to database successfully")
                        except Exception as e:
                            logger.error(f"Failed to save NSN session to database: {e}")
                            return jsonify({
                                'success': False,
                                'error': 'Failed to save NSN session to database'
                            }), 500
                        
                        # 发送session给C-Client
                        logger.info(f"===== SENDING NSN SESSION TO C-CLIENT =====")
                        try:
                            import asyncio
                            loop = asyncio.new_event_loop()
                            asyncio.set_event_loop(loop)
                            
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
                            logger.info(f"NSN session send result: {send_result}")
                            logger.info(f"NSN session sent to C-Client for user {nmp_user_id}")
                        except Exception as e:
                            logger.warning(f"Failed to send NSN session to C-Client: {e}")
                        
                        response_data = {
                            'success': True,
                            'login_success': True,
                            'complete_session_data': nsn_session_cookie,
                            'message': 'NSN session retrieved and sent to C-Client'
                        }
                        logger.info(f"===== RETURNING NSN RESPONSE =====")
                        logger.info(f"Response data: {response_data}")
                        return jsonify(response_data)
                    else:
                        logger.warning(f"No NSN session data available: {session_data.get('error')}")
                else:
                    logger.warning(f"Failed to get NSN session data: {session_response.status_code}")
            except Exception as e:
                logger.warning(f"Failed to check NSN session data: {e}")
            
            logger.info(f"===== END STEP 2: NO NSN SESSION DATA =====")

        # 3. 处理NSN表单登录（如果提供了账号密码）
        if provided_account and provided_password:
            logger.info(f"===== STEP 3: NSN FORM LOGIN =====")
            logger.info(f"Processing NSN form login with provided credentials")
            logger.info(f"Account: {provided_account}")
            
            # 使用提供的账号密码尝试登录NSN
            nmp_params = {
                'nmp_user_id': nmp_user_id,
                'nmp_username': nmp_username,
                'nmp_client_type': 'c-client',
                'nmp_timestamp': str(int(time.time() * 1000)),
                'nmp_injected': 'true'  # 添加这个参数让NSN识别为B-Client请求
            }
            
            logger.info(f"Attempting NSN login with provided credentials...")
            login_result = nsn_client.login_with_nmp(provided_account, provided_password, nmp_params)
            logger.info(f"NSN login result: {login_result}")
            
            if login_result['success']:
                logger.info(f"===== NSN FORM LOGIN SUCCESSFUL =====")
                logger.info(f"NSN login successful for user {nmp_user_id}")
                
                # 提取NSN用户信息
                nsn_user_id = login_result.get('user_info', {}).get('user_id')
                nsn_username = login_result.get('user_info', {}).get('username')
                logger.info(f"NSN user info - ID: {nsn_user_id}, Username: {nsn_username}")
                
                # 如果NSN用户信息为空，使用NMP用户信息作为fallback
                if not nsn_username:
                    nsn_username = nmp_username
                    logger.info(f"Using NMP username as fallback: {nsn_username}")
                if not nsn_user_id:
                    nsn_user_id = nmp_user_id
                    logger.info(f"Using NMP user_id as fallback: {nsn_user_id}")
                
                # 保存session到user_cookies（复用save_cookie_to_db函数）
                logger.info(f"===== SAVING SESSION TO DATABASE =====")
                try:
                    save_cookie_to_db_func(nmp_user_id, nsn_username, login_result['session_cookie'], node_id, auto_refresh, nsn_user_id, nsn_username)
                    logger.info(f"Session saved to database successfully")
                except Exception as e:
                    logger.error(f"Failed to save session to database: {e}")
                
                # 发送给C-Client（复用send_session_to_client函数）
                logger.info(f"===== SENDING SESSION TO C-CLIENT =====")
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
                    logger.info(f"Session send result: {send_result}")
                    logger.info(f"Session sent to C-Client for user {nmp_user_id}")
                except Exception as e:
                    logger.warning(f"Failed to send session to C-Client: {e}")
                
                # 注意：不保存账号密码到user_accounts表（按设计要求）
                logger.info(f"Skipping account save to user_accounts (as per design requirements)")
                
                response_data = {
                    'success': True,
                    'login_success': True,
                    'complete_session_data': login_result['session_cookie'],
                    'message': 'NSN form login successful and session sent to C-Client'
                }
                logger.info(f"===== RETURNING RESPONSE =====")
                logger.info(f"Response data: {response_data}")
                return jsonify(response_data)
            else:
                logger.error(f"===== NSN FORM LOGIN FAILED =====")
                logger.error(f"NSN login failed for user {nmp_user_id}: {login_result.get('error')}")
                error_response = {
                    'success': False,
                    'error': 'Wrong account or password, please try again or sign up with NMP'
                }
                logger.info(f"===== RETURNING ERROR RESPONSE =====")
                logger.info(f"Error response: {error_response}")
                return jsonify(error_response), 400

        # 4. 查询 user_accounts
        logger.info(f"===== STEP 4: CHECKING USER_ACCOUNTS =====")
        logger.info(f"Querying user_accounts table for user_id='{nmp_user_id}', website='nsn'")
        
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
            logger.info(f"===== EXISTING ACCOUNT FOUND =====")
            logger.info(f"Account record found for user {nmp_user_id}")
            logger.info(f"Account ID: {existing_account.user_id}")
            logger.info(f"Account username: {existing_account.username}")
            logger.info(f"Account website: {existing_account.website}")
            logger.info(f"Account account: {existing_account.account}")
            logger.info(f"Account email: {existing_account.email}")
            logger.info(f"Account first_name: {existing_account.first_name}")
            logger.info(f"Account last_name: {existing_account.last_name}")
            logger.info(f"Account location: {existing_account.location}")
            logger.info(f"Account registration_method: {existing_account.registration_method}")
            logger.info(f"Account auto_generated: {existing_account.auto_generated}")
            logger.info(f"Account create_time: {existing_account.create_time}")
            logger.info(f"Account password length: {len(existing_account.password) if existing_account.password else 0}")
            
            # 检查是否有有效的NSN凭据
            logger.info(f"===== CHECKING NSN CREDENTIALS =====")
            logger.info(f"Account: {existing_account.account}")
            logger.info(f"Password length: {len(existing_account.password) if existing_account.password else 0}")
            
            # 检查是否有有效的NSN凭据
            if not existing_account.password or len(existing_account.password) == 0:
                logger.error(f"===== NO VALID NSN CREDENTIALS =====")
                logger.error(f"User {nmp_user_id} has no valid NSN credentials")
                logger.error(f"This user needs to sign up with NMP first")
                error_response = {
                    'success': False,
                    'error': 'No valid NSN credentials found. Please sign up with NMP first.'
                }
                logger.info(f"===== RETURNING ERROR RESPONSE =====")
                logger.info(f"Error response: {error_response}")
                return jsonify(error_response), 400
            
            # 使用 account/password 登录 NSN
            logger.info(f"===== ATTEMPTING NSN LOGIN =====")
            logger.info(f"Using existing account to login to NSN")
            logger.info(f"Login account: {existing_account.account}")
            
            nmp_params = {
                'nmp_user_id': nmp_user_id,
                'nmp_username': nmp_username,
                'nmp_client_type': 'c-client',
                'nmp_timestamp': str(int(time.time() * 1000)),
                'nmp_injected': 'true'  # 添加这个参数让NSN识别为B-Client请求
            }
            logger.info(f"NMP parameters: {nmp_params}")
            
            logger.info(f"Calling nsn_client.login_with_nmp()...")
            logger.debug(f"Login credentials - username: {existing_account.account}, password length: {len(existing_account.password) if existing_account.password else 0}")
            logger.debug(f"NMP parameters: {nmp_params}")
            login_result = nsn_client.login_with_nmp(
                existing_account.account,
                existing_account.password,
                nmp_params
            )
            logger.info(f"NSN login result: {login_result}")
            
            if login_result['success']:
                logger.info(f"===== NSN LOGIN SUCCESSFUL =====")
                logger.info(f"NSN login successful for user {nmp_user_id}")
                logger.info(f"Session cookie length: {len(login_result['session_cookie']) if login_result.get('session_cookie') else 0}")
                logger.debug(f"Session cookie preview: {login_result['session_cookie'][:100] if login_result.get('session_cookie') else 'None'}...")
                
                # Extract NSN user info from login result
                nsn_user_id = login_result.get('user_info', {}).get('user_id')
                nsn_username = login_result.get('user_info', {}).get('username')
                logger.info(f"NSN user info - ID: {nsn_user_id}, Username: {nsn_username}")
                
                # 如果NSN用户信息为空，使用NMP用户信息作为fallback
                if not nsn_username:
                    nsn_username = nmp_username
                    logger.info(f"Using NMP username as fallback: {nsn_username}")
                if not nsn_user_id:
                    nsn_user_id = nmp_user_id
                    logger.info(f"Using NMP user_id as fallback: {nsn_user_id}")
                
                # 重置logout状态，允许用户重新登录
                logger.info(f"===== RESETTING LOGOUT STATUS =====")
                try:
                    updated_accounts = UserAccount.query.filter_by(
                        user_id=nmp_user_id,
                        website='nsn'
                    ).update({'logout': False})
                    db.session.commit()
                    logger.info(f"Reset logout status for {updated_accounts} user_accounts records")
                except Exception as e:
                    logger.warning(f"Failed to reset logout status: {e}")
                
                # 保存 session 到 user_cookies（预处理后保存）
                logger.info(f"===== SAVING SESSION TO DATABASE =====")
                logger.info(f"Saving preprocessed session cookie to user_cookies table")
                try:
                    save_cookie_to_db_func(nmp_user_id, nsn_username, login_result['session_cookie'], node_id, auto_refresh, nsn_user_id, nsn_username)
                    logger.info(f"Session saved to database successfully")
                except Exception as e:
                    logger.error(f"Failed to save session to database: {e}")
                    import traceback
                    traceback.print_exc()
                
                # 发送给 C-Client
                logger.info(f"===== SENDING SESSION TO C-CLIENT =====")
                logger.info(f"Attempting to send session to C-Client for user {nmp_user_id}")
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
                    logger.info(f"Session send result: {send_result}")
                    logger.info(f"Session sent to C-Client for user {nmp_user_id}")
                except Exception as e:
                    logger.warning(f"Failed to send session to C-Client: {e}")
                    import traceback
                    traceback.print_exc()
                
                response_data = {
                    'success': True,
                    'login_success': True,
                    'complete_session_data': login_result['session_cookie'],
                    'message': 'Logged in with existing account and session sent to C-Client'
                }
                logger.info(f"===== RETURNING RESPONSE =====")
                logger.info(f"Response data: {response_data}")
                return jsonify(response_data)
            else:
                logger.error(f"===== NSN LOGIN FAILED =====")
                logger.error(f"NSN login failed for user {nmp_user_id}: {login_result.get('error')}")
                logger.info(f"===== END STEP 2: LOGIN FAILED =====")
        else:
            logger.info(f"No existing account found for user {nmp_user_id}")
            logger.info(f"===== END STEP 2: NO ACCOUNT FOUND =====")
        
        # 5. 调用 NSN 注册接口
        if request_type == 0:  # signup
            logger.info(f"===== STEP 5: SIGNUP WITH NMP =====")
            logger.info(f"Processing signup request for user {nmp_user_id}")
            
            # 1. 检查user_accounts表是否已有账号
            logger.info(f"===== CHECKING EXISTING ACCOUNT =====")
            existing_account = UserAccount.query.filter_by(
                user_id=nmp_user_id,
                website='nsn'
            ).first()
            
            if existing_account:
                logger.info(f"Found existing account for user {nmp_user_id}")
                logger.info(f"Account username: {existing_account.nsn_username}")
                logger.info(f"Account password length: {len(existing_account.password)}")
                
                # 使用现有账号信息
                unique_username = existing_account.nsn_username
                generated_password = existing_account.password
            else:
                logger.info(f"No existing account found, creating new account")
                
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
            logger.info(f"===== SAVING NEW ACCOUNT TO DATABASE =====")
            try:
                save_account_to_db_func(nmp_user_id, nmp_username, unique_username, generated_password, signup_data)
                logger.info(f"New account saved to database successfully")
            except Exception as e:
                logger.error(f"Failed to save new account to database: {e}")
                import traceback
                traceback.print_exc()
                return jsonify({
                    'success': False,
                    'error': 'Failed to create account'
                }), 500
            
            # 2. 尝试向NSN注册（fire-and-forget）
            logger.info(f"===== ATTEMPTING NSN REGISTRATION =====")
            logger.info(f"Username: {unique_username}")
            logger.info(f"Password: {generated_password[:3]}...")
            
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
                logger.info(f"NSN registration request sent (status: {response.status_code})")
            except Exception as e:
                logger.warning(f"NSN registration request failed (expected): {e}")
            
            # 3. 假设NSN注册成功，立即进行登录
            logger.info("Assuming NSN registration successful, proceeding with login...")
            
            # 验证用户是否真的在NSN数据库中创建了
            logger.info(f"===== VERIFYING USER CREATION IN NSN =====")
            try:
                # 尝试通过NSN的API查询用户信息
                user_info_url = f"http://localhost:5000/api/user-info"
                user_info_data = {"username": unique_username}
                user_info_response = requests.post(user_info_url, json=user_info_data, timeout=10)
                
                if user_info_response.status_code == 200:
                    user_info = user_info_response.json()
                    if user_info.get('success'):
                        logger.info(f"User {unique_username} confirmed in NSN database (ID: {user_info.get('user_id')})")
                    else:
                        logger.warning(f"User {unique_username} not found in NSN database yet")
                        logger.warning(f"Proceeding with login attempt anyway...")
                else:
                    logger.warning(f"Failed to verify user creation: {user_info_response.status_code}")
                    logger.warning(f"Proceeding with login attempt anyway...")
            except Exception as e:
                logger.warning(f"Error verifying user creation: {e}")
                logger.warning(f"Proceeding with login attempt anyway...")
            
            # 4. 尝试登录到NSN
            logger.info(f"===== ATTEMPTING NSN LOGIN =====")
            logger.info(f"Attempting to login with username: {unique_username}")
            logger.info(f"Password length: {len(generated_password)}")
            logger.debug(f"Password preview: {generated_password[:3]}...")
            
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
                
                logger.info(f"Login response status: {login_response.status_code}")
                
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
                        logger.debug(f"Session cookie extracted: {session_cookie[:50]}...")
                
                # 检查登录是否成功
                if login_response.status_code == 302 or (login_response.status_code == 200 and session_cookie):
                    logger.info("NSN login successful after registration")
                    
                    # 从NSN获取session数据（避免循环依赖）
                    try:
                        session_data_url = "http://localhost:5000/api/nmp-session-data"
                        session_response = requests.get(session_data_url, timeout=10)
                        
                        if session_response.status_code == 200:
                            session_data = session_response.json()
                            if session_data.get('success'):
                                session_cookie = session_data.get('session_cookie')
                                nsn_user_id = session_data.get('nsn_user_id')
                                nsn_username = session_data.get('nsn_username')
                                logger.info(f"Session data retrieved: {nsn_username} (ID: {nsn_user_id})")
                            else:
                                logger.warning(f"No session data available: {session_data.get('error')}")
                                nsn_user_id = None
                                nsn_username = unique_username
                        else:
                            logger.warning(f"Failed to get session data: {session_response.status_code}")
                            nsn_user_id = None
                            nsn_username = unique_username
                    except Exception as e:
                        logger.warning(f"Failed to get session data: {e}")
                        nsn_user_id = None
                        nsn_username = unique_username
                    
                    # 保存session到数据库
                    logger.info(f"===== SAVING SESSION TO DATABASE =====")
                    try:
                        save_cookie_to_db_func(nmp_user_id, nsn_username, session_cookie, node_id, auto_refresh, nsn_user_id, nsn_username)
                        logger.info(f"Session saved to database successfully")
                    except Exception as e:
                        logger.error(f"Failed to save session to database: {e}")
                        import traceback
                        traceback.print_exc()
                
                    # 发送session给C-Client（异步）
                    logger.info(f"===== SENDING SESSION TO C-CLIENT (ASYNC) =====")
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
                                logger.info(f"Async session send result: {send_result}")
                                logger.info(f"Session sent to C-Client for user {nmp_user_id}")
                            except Exception as e:
                                logger.warning(f"Failed to send session to C-Client: {e}")
                            finally:
                                loop.close()
                        
                        # 启动异步发送线程
                        thread = threading.Thread(target=send_session_async)
                        thread.daemon = True
                        thread.start()
                        logger.info(f"Started async session sending thread for user {nmp_user_id}")
                        
                    except Exception as e:
                        logger.warning(f"Failed to start async session sending: {e}")
                        import traceback
                        traceback.print_exc()
                    
                    # 返回成功响应
                    response_data = {
                        'success': True,
                        'login_success': True,
                        'complete_session_data': session_cookie,
                        'message': 'User registered and logged in successfully'
                    }
                    logger.info(f"===== RETURNING SUCCESS RESPONSE =====")
                    logger.info(f"Response data: {response_data}")
                    return jsonify(response_data)
                        
                else:
                    logger.error(f"NSN login failed with status {login_response.status_code}")
                    logger.error(f"Login response text: {login_response.text[:500]}...")
                    
                    # 登录失败，返回注册失败提示
                    error_response = {
                        'success': False,
                        'error': 'Signup to website failed: Login failed after registration'
                    }
                    logger.info(f"===== RETURNING ERROR RESPONSE =====")
                    logger.info(f"Error response: {error_response}")
                    return jsonify(error_response), 400
                    
            except Exception as e:
                logger.error(f"Error during NSN login attempt: {e}")
                import traceback
                traceback.print_exc()
                
                error_response = {
                    'success': False,
                    'error': f'Signup to website failed: {str(e)}'
                }
                logger.info(f"===== RETURNING ERROR RESPONSE =====")
                logger.info(f"Error response: {error_response}")
                return jsonify(error_response), 400
        else:
            # request_type == 1 (bind) but no existing account found
            logger.error(f"===== NO ACCOUNT FOUND FOR BIND REQUEST =====")
            logger.error(f"No existing account found for user {nmp_user_id} and bind request")
            error_response = {
                'success': False,
                'error': 'Wrong account or password, please try again or sign up with NMP'
            }
            logger.info(f"===== RETURNING ERROR RESPONSE =====")
            logger.info(f"Error response: {error_response}")
            return jsonify(error_response), 400  # 使用400而不是404
        
    except Exception as e:
        logger.error(f"Bind API error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

