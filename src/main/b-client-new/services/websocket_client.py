"""
C-Client WebSocket Client Service
Handles WebSocket communication with C-Client
"""
from datetime import datetime
import json
import os
import time

# 导入日志系统
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from utils.logger import get_bclient_logger
try:
    import websockets
    import asyncio
    import threading
except ImportError:
    # WebSocket dependencies not available - will be handled by logger when available
    websockets = None
    asyncio = None
    threading = None

# These will be injected when initialized
app = None
db = None
UserCookie = None
UserAccount = None
send_session_to_client = None
sync_manager = None


def init_websocket_client(flask_app, database=None, user_cookie_model=None, user_account_model=None, send_session_func=None):
    """Initialize WebSocket client with Flask app and database models"""
    global app, db, UserCookie, UserAccount, send_session_to_client
    app = flask_app
    if database:
        db = database
    if user_cookie_model:
        UserCookie = user_cookie_model
    if user_account_model:
        UserAccount = user_account_model
    if send_session_func:
        send_session_to_client = send_session_func


class CClientWebSocketClient:
    def __init__(self):
        # 初始化日志系统
        self.logger = get_bclient_logger('websocket')
        
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
        
        self.logger.info("Connection pools and caches initialized with optimization")
    
    def pre_initialize_connection_pools(self):
        """Pre-initialize connection pools for instant access"""
        self.logger.info("Pre-initializing connection pools...")
        
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
        
        self.logger.info("Connection pools pre-initialized for instant access")
    
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
            self.logger.warning(f"Error loading WebSocket config: {e}")
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
            self.logger.warning("WebSocket connection disabled in config")
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
            
            self.logger.info(f"Connected to C-Client WebSocket at {uri}")
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to connect to C-Client WebSocket: {e}")
            self.is_connected = False
            return False
    
    async def start_server(self, host='0.0.0.0', port=8766):
        """Start WebSocket server for C-Client connections"""
        try:
            # Configure WebSocket server with better error handling
            server = await websockets.serve(
                self.handle_c_client_connection, 
                host, 
                port,
                # Add connection handling options
                ping_interval=20,  # Send ping every 20 seconds
                ping_timeout=10,   # Wait 10 seconds for pong
                close_timeout=10,  # Wait 10 seconds for close
                max_size=2**20,    # 1MB max message size
                max_queue=32       # Max 32 messages in queue
            )
            self.logger.info(f"WebSocket server started on ws://{host}:{port}")
            self.logger.info(f"Server configured with ping/pong and connection management")
            return server
        except Exception as e:
            self.logger.error(f"Failed to start WebSocket server: {e}")
            return None
    
    async def _handle_node_management_async(self, websocket, nmp_params):
        """Handle node management in background to allow WebSocket message loop to run"""
        try:
            self.logger.info(f"Background task: Calling node_manager.handle_new_connection()...")
            connection = await self.node_manager.handle_new_connection(
                websocket,
                nmp_params
            )
            
            self.logger.info(f"Background task: NodeManager.handle_new_connection() completed successfully")
            if connection:
                self.logger.info(f"Background task: Connection result:")
                self.logger.info(f"   Node ID: {getattr(connection, 'node_id', 'N/A')}")
                self.logger.info(f"   Domain ID: {getattr(connection, 'domain_id', 'N/A')}")
                self.logger.info(f"   Cluster ID: {getattr(connection, 'cluster_id', 'N/A')}")
                self.logger.info(f"   Channel ID: {getattr(connection, 'channel_id', 'N/A')}")
                self.logger.info(f"   Is Domain Main: {getattr(connection, 'is_domain_main_node', 'N/A')}")
                self.logger.info(f"   Is Cluster Main: {getattr(connection, 'is_cluster_main_node', 'N/A')}")
                self.logger.info(f"   Is Channel Main: {getattr(connection, 'is_channel_main_node', 'N/A')}")
            else:
                self.logger.warning(f"Background task: NodeManager.handle_new_connection() returned None")
            
            # Get and display pool stats
            stats = self.node_manager.get_pool_stats()
            self.logger.info(f"Background task: NodeManager pool stats:")
            self.logger.info(f"   Domains: {stats['domains']}")
            self.logger.info(f"   Clusters: {stats['clusters']}")
            self.logger.info(f"   Channels: {stats['channels']}")
            self.logger.info(f"   Total connections: {stats['total_connections']}")
            
        except Exception as e:
            self.logger.error(f"Background task: Error in node management: {e}")
            import traceback
            self.logger.error(f"Traceback: {traceback.format_exc()}")
    
    async def handle_c_client_connection(self, websocket, path=None):
        """Handle incoming C-Client connections"""
        try:
            self.logger.info(f"===== C-CLIENT CONNECTION RECEIVED =====")
            self.logger.info(f"C-Client connected from {websocket.remote_address}")
            self.logger.info(f"Connection path: {path}")
            self.logger.info(f"WebSocket object: {websocket}")
            
            # Wait for registration message
            self.logger.info(f"Waiting for registration message...")
            message = await websocket.recv()
            self.logger.info(f"Received message: {message}")
            
            data = json.loads(message)
            self.logger.info(f"Parsed message data: {data}")
            self.logger.info(f"Message type: {data.get('type')}")
            
            if data.get('type') == 'c_client_register':
                self.logger.info(f"===== C-CLIENT REGISTRATION MESSAGE =====")
                client_id = data.get('client_id', 'unknown')
                user_id = data.get('user_id')  # Get user_id from registration
                username = data.get('username')
                node_id = data.get('node_id')
                domain_id = data.get('domain_id')
                cluster_id = data.get('cluster_id')
                channel_id = data.get('channel_id')
                websocket_port = data.get('websocket_port')  # Get C-Client WebSocket port
                
                self.logger.info(f"Registration details:")
                self.logger.info(f"   Client ID: {client_id}")
                self.logger.info(f"   User ID: {user_id}")
                self.logger.info(f"   Username: {username}")
                self.logger.info(f"   Node ID: {node_id}")
                self.logger.info(f"   Domain ID: {domain_id}")
                self.logger.info(f"   Cluster ID: {cluster_id}")
                self.logger.info(f"   Channel ID: {channel_id}")
                self.logger.info(f"   WebSocket Port: {websocket_port}")
                
                self.logger.info(f"C-Client registered: {client_id}, user_id: {user_id}")
                self.logger.info(f"   Username: {username}")
                self.logger.info(f"   Node ID: {node_id}")
                self.logger.info(f"   Domain ID: {domain_id}")
                self.logger.info(f"   Cluster ID: {cluster_id}")
                self.logger.info(f"   Channel ID: {channel_id}")
                self.logger.info(f"   WebSocket Port: {websocket_port}")
                
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
                
                # Log unique connection identifier for debugging
                connection_id = id(websocket)
                self.logger.info(f"===== NEW WEBSOCKET CONNECTION CREATED =====")
                self.logger.info(f"Connection ID: {connection_id}")
                self.logger.info(f"Client ID: {client_id}")
                self.logger.info(f"User ID: {user_id}")
                self.logger.info(f"Node ID: {node_id}")
                self.logger.info(f"WebSocket Object: {websocket}")
                self.logger.info(f"===== END NEW CONNECTION =====")
                
                # Allow multiple connections per node - no rejection logic
                self.logger.info(f"Allowing multiple connections per node: {node_id}")
                
                # Store connection in triple pools
                # Node-based connection pool (node_id -> list of websockets)
                if node_id:
                    if node_id not in self.node_connections:
                        self.node_connections[node_id] = []
                    self.node_connections[node_id].append(websocket)
                    self.logger.info(f"Node connection added: {node_id} (total: {len(self.node_connections[node_id])})")
                    self.logger.info(f"Current node connections: {list(self.node_connections.keys())}")
                
                # Client-based connection pool (client_id -> list of websockets)
                # Handle re-registration: update existing connection or create new one
                if client_id:
                    # Check for exact duplicate registration (same node_id, client_id, user_id)
                    if self.check_duplicate_registration(node_id, client_id, user_id, websocket):
                        self.logger.info(f"Duplicate registration detected - same node_id, client_id, user_id")
                        self.logger.info(f"Node: {node_id}, Client: {client_id}, User: {user_id}")
                        self.logger.info(f"Sending success response to existing connection")
                        
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
                            
                            self.logger.info(f"Duplicate registration response sent to existing connection")
                            
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
                                self.logger.info(f"Exact duplicate registration detected")
                                self.logger.info(f"Same node ({node_id}), client ({client_id}), and user ({user_id})")
                                
                                # Send success response to existing connection
                                await self.send_message_to_websocket(existing_websocket, {
                                    'type': 'registration_success',
                                    'client_id': client_id,
                                    'user_id': user_id,
                                    'message': 'Already registered with same credentials'
                                })
                                
                                self.logger.info(f"Duplicate registration response sent to existing connection")
                                
                                # Close the new connection since it's a duplicate
                                await websocket.close(code=1000, reason="Duplicate registration - using existing connection")
                                return
                            
                            # If same node but different user, update user info (re-registration)
                            elif existing_node_id == node_id:
                                self.logger.info(f"Client {client_id} re-registering on same node {node_id}")
                                self.logger.info(f"Updating user info to {user_id} ({username})")
                                
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
                                            self.logger.info(f"Removed connection from old user pool: {uid}")
                                            # Clean up empty user connection lists
                                            if not connections:
                                                del self.user_connections[uid]
                                                self.logger.info(f"Removed empty user connection list for {uid}")
                                            break
                                    
                                    # CRITICAL FIX: Only reuse connection if it's still valid
                                    if self.is_connection_valid(existing_websocket):
                                        self.logger.info(f"Existing connection is still valid, reusing it")
                                    
                                    # Then add to new user pool
                                    if user_id not in self.user_connections:
                                        # New user - create new user pool
                                        self.user_connections[user_id] = []
                                        self.logger.info(f"Created new user pool for {user_id}")
                                    
                                    if existing_websocket not in self.user_connections[user_id]:
                                        # Add connection to user pool
                                        self.user_connections[user_id].append(existing_websocket)
                                        self.logger.info(f"Added connection to user pool: {user_id} (total: {len(self.user_connections[user_id])})")
                                    else:
                                        self.logger.info(f"Connection already in user pool: {user_id}")
                                else:
                                    self.logger.error(f"Existing connection is invalid (closed/logged out), closing new connection and not reusing")
                                    # Close the new connection since we can't reuse the old one
                                    await websocket.close(code=1000, reason="Existing connection invalid, not reusing")
                                    return
                                
                                # Send success response to existing connection
                                await self.send_message_to_websocket(existing_websocket, {
                                    'type': 'registration_success',
                                    'client_id': client_id,
                                    'user_id': user_id
                                })
                                
                                self.logger.info(f"Re-registration response sent to existing connection")
                                
                                # After successful re-registration, check if user has a saved session and send it
                                await self.send_session_if_appropriate(user_id, existing_websocket, is_reregistration=True)
                                
                                # Close the new connection since we're using the existing one
                                await websocket.close(code=1000, reason="Re-registration successful, using existing connection")
                                return
                            else:
                                # Different node - reject
                                self.logger.warning(f"Client {client_id} is already connected to node {existing_node_id}, rejecting connection to node {node_id}")
                                
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
                        self.logger.info(f"Created new client pool for {client_id}")
                    self.client_connections[client_id].append(websocket)
                    self.logger.info(f"Client connection added: {client_id} (total: {len(self.client_connections[client_id])})")
                    self.logger.info(f"Current client connections: {list(self.client_connections.keys())}")
                    
                    # Print detailed client pool status
                    self.logger.info(f"Client pool status after new registration:")
                    self.logger.info(f"   Total clients: {len(self.client_connections)}")
                    for cid, connections in self.client_connections.items():
                        self.logger.info(f"   Client {cid}: {len(connections)} connections")
                        for i, conn in enumerate(connections):
                            conn_user = getattr(conn, 'user_id', 'unknown')
                            conn_client = getattr(conn, 'client_id', 'unknown')
                            self.logger.info(f"     Connection {i+1}: user={conn_user}, client={conn_client}")
                
                # User-based connection pool (user_id -> list of websockets)
                if user_id:
                    # IMMEDIATE CHECK: Verify user logout status (DO NOT reset automatically)
                    self.logger.info(f"IMMEDIATE CHECK: Verifying user {user_id} logout status...")
                    try:
                        # Ensure we have Flask application context for database operations
                        with app.app_context():
                            user_account = UserAccount.query.filter_by(user_id=user_id).first()
                            if user_account and user_account.logout:
                                self.logger.warning(f"User {user_id} is logged out, connection will be limited")
                                self.logger.warning(f"Logout status will NOT be reset automatically - user must login manually")
                            else:
                                self.logger.info(f"User {user_id} is not logged out, proceeding with connection")
                    except Exception as e:
                        self.logger.warning(f"Error checking user logout status: {e}")
                    
                    # Check if this client already has a different user connected
                    await self.handle_client_user_switch(client_id, user_id, username, websocket)
                    
                    # Check if this node already has a different user connected
                    await self.handle_node_user_switch(node_id, user_id, username, websocket)
                    
                    # Add new connection to user pool
                    if user_id not in self.user_connections:
                        self.user_connections[user_id] = []
                        self.logger.info(f"Created new user pool for {user_id}")
                    self.user_connections[user_id].append(websocket)
                    self.logger.info(f"User connection added: {user_id} (total: {len(self.user_connections[user_id])})")
                    
                    self.logger.info(f"Current user connections: {list(self.user_connections.keys())}")
                    self.logger.info(f"User {user_id} connected on nodes: {[getattr(ws, 'node_id', 'unknown') for ws in self.user_connections[user_id]]}")
                    
                    # Print detailed user pool status
                    self.logger.info(f"User pool status after new registration:")
                    self.logger.info(f"   Total users: {len(self.user_connections)}")
                    for uid, connections in self.user_connections.items():
                        self.logger.info(f"   User {uid}: {len(connections)} connections")
                        for i, conn in enumerate(connections):
                            conn_user = getattr(conn, 'user_id', 'unknown')
                            conn_client = getattr(conn, 'client_id', 'unknown')
                            self.logger.info(f"     Connection {i+1}: user={conn_user}, client={conn_client}")
                    
                    # Check logout status before notifying existing connections
                    # Only notify if user is not logged out
                    try:
                        with app.app_context():
                            user_account = UserAccount.query.filter_by(user_id=user_id).first()
                            is_logged_out = user_account and user_account.logout
                            
                            if is_logged_out:
                                self.logger.warning(f"User {user_id} is logged out, skipping notification to existing connections")
                            else:
                                # Notify all existing connections about user login
                                # This ensures all clients are aware when a user logs in
                                existing_connections = [conn for conn in self.user_connections[user_id] if conn != websocket]
                                if existing_connections:
                                    self.logger.info(f"User {user_id} ({username}) logged in, notifying {len(existing_connections)} existing connections")
                                    await self.notify_user_connected_on_another_client(user_id, username, client_id, node_id, existing_connections)
                                else:
                                    self.logger.info(f"No existing connections to notify for user {user_id}")
                    except Exception as e:
                        self.logger.warning(f"Error checking logout status for notification: {e}")
                        # Fallback: don't notify if we can't check logout status
                        self.logger.info(f"Skipping notification due to logout status check error")
                
                # ========== NodeManager Integration ==========
                self.logger.info("=" * 80)
                self.logger.info("NODEMANAGER INTEGRATION CHECKPOINT")
                self.logger.info(f"Checking if NodeManager is available...")
                
                if hasattr(self, 'node_manager'):
                    self.logger.info(f"NodeManager found: {self.node_manager}")
                    self.logger.info(f"Preparing to call node_manager.handle_new_connection()...")
                    
                    try:
                        # Construct NMP parameters
                        nmp_params = {
                            'nmp_user_id': user_id,
                            'nmp_username': username,
                            'nmp_node_id': node_id,
                            'nmp_domain_main_node_id': data.get('domain_main_node_id'),
                            'nmp_cluster_main_node_id': data.get('cluster_main_node_id'),
                            'nmp_channel_main_node_id': data.get('channel_main_node_id'),
                            'nmp_domain_id': domain_id,
                            'nmp_cluster_id': cluster_id,
                            'nmp_channel_id': channel_id
                        }
                        
                        self.logger.info(f"NMP params for NodeManager:")
                        for key, value in nmp_params.items():
                            self.logger.info(f"   {key}: {value}")
                        
                        self.logger.info(f"Starting node_manager.handle_new_connection() in background...")
                        # Create background task to handle node management
                        # This allows the WebSocket message loop to start and receive responses
                        asyncio.create_task(self._handle_node_management_async(websocket, nmp_params))
                        self.logger.info(f"Node management task created successfully")
                        
                    except Exception as e:
                        self.logger.error(f"NodeManager integration error: {e}")
                        import traceback
                        self.logger.error(f"Traceback: {traceback.format_exc()}")
                else:
                    self.logger.error(f"NodeManager NOT FOUND on self")
                    self.logger.error(f"   Available attributes: {[attr for attr in dir(self) if not attr.startswith('_')]}")
                    self.logger.warning(f"C-Client will NOT be added to node management pools")
                
                self.logger.info("=" * 80)
                # ========== End NodeManager Integration ==========
                
                # Send registration confirmation
                await self.send_message_to_websocket(websocket, {
                    'type': 'registration_success',
                    'client_id': client_id,
                    'user_id': user_id
                })
                
                self.logger.info(f"Registration successful for Node: {node_id}, User: {user_id} ({username}), Client: {client_id}")
                self.logger.info(f"Final connection pools status:")
                self.logger.info(f"   Nodes: {len(self.node_connections)} - {list(self.node_connections.keys())}")
                self.logger.info(f"   Users: {len(self.user_connections)} - {list(self.user_connections.keys())}")
                self.logger.info(f"   Clients: {len(self.client_connections)} - {list(self.client_connections.keys())}")
                for uid, connections in self.user_connections.items():
                    node_list = [getattr(ws, 'node_id', 'unknown') for ws in connections]
                    client_list = [getattr(ws, 'client_id', 'unknown') for ws in connections]
                    self.logger.info(f"   User {uid}: {len(connections)} connections on nodes {node_list} with clients {client_list}")
                for cid, connections in self.client_connections.items():
                    user_list = [getattr(ws, 'user_id', 'unknown') for ws in connections]
                    node_list = [getattr(ws, 'node_id', 'unknown') for ws in connections]
                    self.logger.info(f"   Client {cid}: {len(connections)} connections for users {user_list} on nodes {node_list}")
                
                # After successful registration, check if user has a saved session and send it
                await self.send_session_if_appropriate(user_id, websocket, is_reregistration=False)
                
                # Handle messages from C-Client
                async for message in websocket:
                    try:
                        data = json.loads(message)
                        await self.process_c_client_message(websocket, data, client_id, user_id)
                    except json.JSONDecodeError:
                        await self.send_error(websocket, "Invalid JSON format")
                    except Exception as e:
                        self.logger.error(f"Error processing C-Client message: {e}")
                        
        except websockets.exceptions.ConnectionClosed:
            self.logger.info(f"C-Client disconnected - cleaning up connection pools")
            # CRITICAL FIX: Clean up connection pools when connection is closed
            self.remove_invalid_connection(websocket)
        except websockets.exceptions.InvalidMessage as e:
            # Handle WebSocket握手失败 - 这通常不是严重错误
            if "did not receive a valid HTTP request" in str(e):
                self.logger.debug(f"WebSocket handshake failed (connection closed before HTTP request) - this is usually normal")
            else:
                self.logger.error(f"WebSocket invalid message: {e}")
        except EOFError as e:
            # Handle connection closed unexpectedly - 这通常不是严重错误
            if "connection closed while reading HTTP request line" in str(e):
                self.logger.debug(f"WebSocket connection closed during handshake - this is usually normal")
            else:
                self.logger.warning(f"WebSocket connection closed unexpectedly: {e}")
        except Exception as e:
            self.logger.error(f"Error handling C-Client connection: {e}")
        finally:
            # Remove from all connection pools using websocket object reference
            self.remove_connection_from_all_pools(websocket)
    
    async def process_c_client_message(self, websocket, data, client_id, user_id=None):
        """Process messages from C-Client"""
        message_type = data.get('type')
        
        # Check if this is a NodeManager command response (has request_id and command_type)
        if 'request_id' in data and 'command_type' in data:
            self.logger.info(f"Received NodeManager response from C-Client {client_id}")
            self.logger.info(f"   Command type: {data.get('command_type')}")
            self.logger.info(f"   Request ID: {data.get('request_id')}")
            self.logger.info(f"   Success: {data.get('success')}")
            
            # Forward to NodeManager for processing
            if hasattr(self, 'node_manager') and self.node_manager:
                self.logger.info(f"Forwarding response to NodeManager...")
                
                # Find the actual ClientConnection object from NodeManager's pools
                node_id = data.get('data', {}).get('node_id') or getattr(websocket, 'node_id', None)
                connection = None
                
                if node_id:
                    self.logger.info(f"Looking for connection with node_id: {node_id}")
                    # Search in all pools
                    for domain_id, connections in self.node_manager.domain_pool.items():
                        for conn in connections:
                            if conn.node_id == node_id:
                                connection = conn
                                self.logger.info(f"Found connection in domain_pool[{domain_id}]")
                                break
                        if connection:
                            break
                    
                    if not connection:
                        for cluster_id, connections in self.node_manager.cluster_pool.items():
                            for conn in connections:
                                if conn.node_id == node_id:
                                    connection = conn
                                    self.logger.info(f"Found connection in cluster_pool[{cluster_id}]")
                                    break
                            if connection:
                                break
                    
                    if not connection:
                        for channel_id, connections in self.node_manager.channel_pool.items():
                            for conn in connections:
                                if conn.node_id == node_id:
                                    connection = conn
                                    self.logger.info(f"Found connection in channel_pool[{channel_id}]")
                                    break
                            if connection:
                                break
                
                if not connection:
                    self.logger.warning(f"Could not find ClientConnection object, creating temporary one")
                    # Create a minimal connection object if not found
                    from services.nodeManager import ClientConnection
                    connection = ClientConnection(
                        websocket=websocket,
                        node_id=node_id,
                        user_id=user_id,
                        username=data.get('username', ''),
                        domain_id=data.get('data', {}).get('domain_id'),
                        cluster_id=data.get('data', {}).get('cluster_id'),
                        channel_id=data.get('data', {}).get('channel_id'),
                        domain_main_node_id=None,
                        cluster_main_node_id=None,
                        channel_main_node_id=None,
                        is_domain_main_node=False,
                        is_cluster_main_node=False,
                        is_channel_main_node=False
                    )
                
                await self.node_manager.handle_c_client_response(connection, data)
                self.logger.info(f"Response forwarded to NodeManager")
            return
        
        if message_type == 'c_client_register':
            # Handle re-registration from C-Client
            self.logger.info(f"Received re-registration from C-Client {client_id}")
            await self.handle_c_client_reregistration(websocket, data)
        elif message_type == 'assignConfirmed':
            # Handle assignConfirmed notification from C-Client
            self.logger.info(f"Received assignConfirmed from C-Client {client_id}")
            assign_data = data.get('data', {})
            self.logger.info(f"   Domain ID: {assign_data.get('domain_id')}")
            self.logger.info(f"   Cluster ID: {assign_data.get('cluster_id')}")
            self.logger.info(f"   Channel ID: {assign_data.get('channel_id')}")
            self.logger.info(f"   Node ID: {assign_data.get('node_id')}")
            
            # Forward to NodeManager to update connection pools if needed
            if hasattr(self, 'node_manager') and self.node_manager:
                node_id = assign_data.get('node_id')
                if node_id:
                    self.logger.info(f"Updating connection pools for node {node_id}...")
                    # Search for connection and update its IDs
                    for domain_id, connections in self.node_manager.domain_pool.items():
                        for conn in connections:
                            if conn.node_id == node_id:
                                conn.domain_id = assign_data.get('domain_id') or conn.domain_id
                                conn.cluster_id = assign_data.get('cluster_id') or conn.cluster_id
                                conn.channel_id = assign_data.get('channel_id') or conn.channel_id
                                self.logger.info(f"Updated connection in domain_pool: domain={conn.domain_id}, cluster={conn.cluster_id}, channel={conn.channel_id}")
                                
                                # Add to cluster pool if cluster_id exists and not already there
                                if conn.cluster_id and conn.is_cluster_main_node:
                                    if conn.cluster_id not in self.node_manager.cluster_pool:
                                        self.node_manager.cluster_pool[conn.cluster_id] = []
                                    if conn not in self.node_manager.cluster_pool[conn.cluster_id]:
                                        self.node_manager.cluster_pool[conn.cluster_id].append(conn)
                                        self.logger.info(f"Added to cluster_pool[{conn.cluster_id}]")
                                
                                # Add to channel pool if channel_id exists and not already there
                                if conn.channel_id and conn.is_channel_main_node:
                                    if conn.channel_id not in self.node_manager.channel_pool:
                                        self.node_manager.channel_pool[conn.channel_id] = []
                                    if conn not in self.node_manager.channel_pool[conn.channel_id]:
                                        self.node_manager.channel_pool[conn.channel_id].append(conn)
                                        self.logger.info(f"Added to channel_pool[{conn.channel_id}]")
                                break
                    
                    # Also update WebSocket object attributes for proper cleanup on disconnect
                    websocket.domain_id = assign_data.get('domain_id') or websocket.domain_id
                    websocket.cluster_id = assign_data.get('cluster_id') or websocket.cluster_id
                    websocket.channel_id = assign_data.get('channel_id') or websocket.channel_id
                    
                    # Update main node flags based on the connection's status in NodeManager
                    # Find the connection in NodeManager to get the correct flags
                    for domain_id, connections in self.node_manager.domain_pool.items():
                        for conn in connections:
                            if conn.node_id == node_id:
                                websocket.is_domain_main_node = conn.is_domain_main_node
                                websocket.is_cluster_main_node = conn.is_cluster_main_node
                                websocket.is_channel_main_node = conn.is_channel_main_node
                                break
                    
                    self.logger.info(f"Updated WebSocket attributes: domain={websocket.domain_id}, cluster={websocket.cluster_id}, channel={websocket.channel_id}")
                    self.logger.info(f"Updated WebSocket main node flags: domain_main={websocket.is_domain_main_node}, cluster_main={websocket.is_cluster_main_node}, channel_main={websocket.is_channel_main_node}")
                    
                    self.logger.info(f"Current pool stats:")
                    self.logger.info(f"   Domains: {len(self.node_manager.domain_pool)}")
                    self.logger.info(f"   Clusters: {len(self.node_manager.cluster_pool)}")
                    self.logger.info(f"   Channels: {len(self.node_manager.channel_pool)}")
        elif message_type == 'cookie_response':
            # Handle cookie response from C-Client
            self.logger.info(f"Received cookie response from C-Client {client_id}")
        elif message_type == 'cookie_update_response':
            # Handle cookie update response from C-Client
            self.logger.info(f"Received cookie update response from C-Client {client_id}")
        elif message_type == 'user_login_notification':
            # Handle user login notification from C-Client
            self.logger.info(f"Received user login notification from C-Client {client_id}")
        elif message_type == 'user_logout_notification':
            # Handle user logout notification from C-Client
            self.logger.info(f"Received user logout notification from C-Client {client_id}")
        elif message_type == 'logout_feedback':
            # Handle logout feedback from C-Client
            self.logger.info(f"Received logout feedback from C-Client {client_id}")
            await self.handle_logout_feedback(websocket, data, client_id, user_id)
        elif message_type == 'session_feedback':
            # Handle session feedback from C-Client
            self.logger.info(f"Received session feedback from C-Client {client_id}")
            await self.handle_session_feedback(websocket, data, client_id, user_id)
        elif message_type == 'user_activities_batch':
            # Handle user activities batch from C-Client
            self.logger.info(f"Received user activities batch from C-Client {client_id}")
            if sync_manager:
                await sync_manager.handle_user_activities_batch(websocket, data.get('data', {}))
            else:
                self.logger.warning("SyncManager not initialized, cannot handle user activities batch")
        elif message_type == 'user_activities_batch_feedback':
            # Handle batch feedback from C-Client
            self.logger.info(f"Received batch feedback from C-Client {client_id}")
            if sync_manager:
                await sync_manager.handle_batch_feedback(websocket, data.get('data', {}))
            else:
                self.logger.warning("SyncManager not initialized, cannot handle batch feedback")
        else:
            self.logger.warning(f"Unknown message type from C-Client: {message_type}")
    
    async def send_message_to_c_client(self, client_id, message):
        """Send message to specific C-Client by client_id"""
        # Search in client_connections for the websocket with matching client_id
        if hasattr(self, 'client_connections') and self.client_connections:
            if client_id in self.client_connections:
                for websocket in self.client_connections[client_id]:
                    try:
                        await self.send_message_to_websocket(websocket, message)
                    except Exception as e:
                        self.logger.error(f"Error sending message to client {client_id}: {e}")
                return True
        return False
    
    async def send_message_to_node(self, node_id, message):
        """Send message to C-Client by node_id (node_id is the connection key)"""
        if hasattr(self, 'node_connections') and self.node_connections:
            if node_id in self.node_connections:
                for websocket in self.node_connections[node_id]:
                    try:
                        await self.send_message_to_websocket(websocket, message)
                        self.logger.info(f"Message sent to node {node_id}")
                    except Exception as e:
                        self.logger.error(f"Error sending message to node {node_id}: {e}")
                return True
            else:
                self.logger.error(f"No connection found for node_id: {node_id}")
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
                        # Check if websocket is still open using centralized validation
                        if not self.is_connection_valid(websocket):
                            self.logger.warning(f"Connection {i} for user {user_id} is invalid, skipping")
                            failed_connections.append(i)
                            continue
                            
                        await self.send_message_to_websocket(websocket, message)
                        success_count += 1
                        self.logger.info(f"Message sent to connection {i} for user {user_id}")
                        
                    except Exception as e:
                        self.logger.error(f"Error sending to user {user_id} connection {i}: {e}")
                        failed_connections.append(i)
                
                # Clean up failed connections
                if failed_connections:
                    self.logger.info(f"Cleaning up {len(failed_connections)} failed connections for user {user_id}")
                    # Remove failed connections from the list (in reverse order to maintain indices)
                    for i in reversed(failed_connections):
                        if i < len(user_websockets):
                            user_websockets.pop(i)
                    
                    # Update the user_connections dictionary
                    if user_websockets:
                        self.user_connections[user_id] = user_websockets
                    else:
                        del self.user_connections[user_id]
                        self.logger.info(f"Removed user {user_id} from connections (no active connections)")
                
                self.logger.info(f"Message sent to {success_count}/{len(user_websockets) + len(failed_connections)} connections for user {user_id}")
                return success_count > 0
            else:
                self.logger.error(f"No connections found for user_id: {user_id}")
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
                    self.logger.info(f"Message sent to user {user_id} on node {node_id}")
                    return True
            
            self.logger.error(f"No connection found for user {user_id} on node {node_id}")
            return False
        return False
    
    async def send_session_if_appropriate(self, user_id, websocket=None, is_reregistration=False):
        """Unified method to send session data with intelligent logout status checking"""
        try:
            self.logger.info(f"===== CHECKING FOR SAVED SESSION =====")
            self.logger.info(f"User ID: {user_id}")
            self.logger.info(f"Is re-registration: {is_reregistration}")
            
            with app.app_context():
                cookie = UserCookie.query.filter_by(user_id=user_id).first()
                if not cookie:
                    self.logger.info(f"No saved session found for user {user_id}")
                    return False
                
                self.logger.info(f"Found saved session for user {user_id}")
                
                # Check if user has logged out and if this is a legitimate reconnection
                user_account = UserAccount.query.filter_by(
                    user_id=user_id,
                    website='nsn'
                ).first()
                
                should_send_session = True
                if user_account and user_account.logout:
                    self.logger.info(f"User {user_id} had logged out (logout=True)")
                    self.logger.info(f"User is logged out, NOT sending auto-login")
                    self.logger.info(f"User must login manually to reset logout status")
                    self.logger.info(f"This prevents automatic re-login after logout")
                    should_send_session = False
                
                if should_send_session:
                    self.logger.info(f"Sending session to C-client")
                    send_result = await send_session_to_client(
                        user_id, 
                        cookie.cookie, 
                        None,  # nsn_user_id - will be extracted from cookie
                        None,  # nsn_username - will be extracted from cookie
                        reset_logout_status=False  # Already handled above
                    )
                    
                    if send_result:
                        self.logger.info(f"Session sent to C-client successfully for user {user_id}")
                        return True
                    else:
                        self.logger.warning(f"Failed to send session to C-client for user {user_id}")
                        return False
                else:
                    self.logger.info(f"Skipping session send - preventing duplicate login")
                    return False
                    
        except Exception as e:
            self.logger.error(f"Error checking/sending saved session for user {user_id}: {e}")
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
            
            self.logger.info(f"Processing re-registration for client {client_id}")
            self.logger.info(f"   New User ID: {user_id}")
            self.logger.info(f"   New Username: {username}")
            self.logger.info(f"   Node ID: {node_id}")
            
            # Check for duplicate registration first
            if self.check_duplicate_registration(node_id, client_id, user_id, websocket):
                self.logger.info(f"Duplicate re-registration detected - same node_id, client_id, user_id")
                self.logger.info(f"Node: {node_id}, Client: {client_id}, User: {user_id}")
                
                # Find the existing connection
                existing_websocket = self.find_existing_connection(node_id, client_id, user_id)
                if existing_websocket and existing_websocket != websocket:
                    self.logger.info(f"Sending success response to existing connection")
                    
                    # Send success response to existing connection
                    await self.send_message_to_websocket(existing_websocket, {
                        'type': 'registration_success',
                        'client_id': client_id,
                        'user_id': user_id,
                        'message': 'Already registered with same credentials'
                    })
                    
                    self.logger.info(f"Duplicate re-registration response sent to existing connection")
                    
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
                        self.logger.info(f"Client {client_id} re-registering on same node {node_id}")
                        self.logger.info(f"Updating user info to {user_id} ({username})")
                        
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
                                    self.logger.info(f"Removed connection from old user pool: {uid}")
                                    # Clean up empty user connection lists
                                    if not connections:
                                        del self.user_connections[uid]
                                        self.logger.info(f"Removed empty user connection list for {uid}")
                                    break
                            
                            # CRITICAL FIX: Only reuse connection if it's still valid
                            if self.is_connection_valid(existing_websocket):
                                self.logger.info(f"Existing connection is still valid, reusing it")
                            
                            # Then add to new user pool
                            if user_id not in self.user_connections:
                                # New user - create new user pool
                                self.user_connections[user_id] = []
                                self.logger.info(f"Created new user pool for {user_id}")
                            
                            if existing_websocket not in self.user_connections[user_id]:
                                # Add connection to user pool
                                self.user_connections[user_id].append(existing_websocket)
                                self.logger.info(f"Added connection to user pool: {user_id} (total: {len(self.user_connections[user_id])})")
                            else:
                                self.logger.info(f"Connection already in user pool: {user_id}")
                        else:
                            self.logger.error(f"Existing connection is invalid (closed/logged out), closing new connection and not reusing")
                            # Close the new connection since we can't reuse the old one
                            await websocket.close(code=1000, reason="Existing connection invalid, not reusing")
                        return
                    else:
                        # Different node - reject
                        self.logger.error(f"Client {client_id} trying to connect to different node")
                        await self.send_message_to_websocket(websocket, {
                            'type': 'registration_rejected',
                            'client_id': client_id,
                            'message': f'Client already connected to different node: {existing_node_id}'
                        })
                        return
                else:
                    self.logger.error(f"No existing websocket found for client {client_id}")
            else:
                self.logger.error(f"Client {client_id} not found in client connections")
                
        except Exception as e:
            self.logger.error(f"Error handling re-registration: {e}")
    
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
                        self.logger.info(f"Client {client_id} switching from user {old_user_id} ({old_username}) to {new_user_id} ({new_username})")
                        self.logger.info(f"Starting cleanup for old user {old_user_id} from client {client_id}")
                        
                        # Remove old user from user connections pool
                        await self.remove_user_from_client(old_user_id, client_id)
                        self.logger.info(f"Cleanup completed for user {old_user_id} from client {client_id}")
    
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
                        self.logger.info(f"Node {node_id} has user {old_user_id} ({old_username}) and new user {new_user_id} ({new_username})")
                        self.logger.info(f"Allowing multiple users on same node - no cleanup needed")
    
    async def remove_user_from_client(self, user_id, client_id):
        """Remove user from a specific client in user connections pool"""
        self.logger.info(f"Attempting to remove user {user_id} from client {client_id}")
        
        if user_id in self.user_connections:
            # Find and remove the websocket for this specific client
            user_websockets = self.user_connections[user_id]
            websockets_to_remove = []
            
            self.logger.info(f"User {user_id} has {len(user_websockets)} connections")
            
            for websocket in user_websockets:
                if hasattr(websocket, 'client_id') and websocket.client_id == client_id:
                    websockets_to_remove.append(websocket)
                    self.logger.info(f"Found websocket for user {user_id} on client {client_id}")
            
            # Remove the websockets
            for websocket in websockets_to_remove:
                user_websockets.remove(websocket)
                self.logger.info(f"Removed user {user_id} from client {client_id}")
            
            # Clean up empty user connection lists
            if not user_websockets:
                del self.user_connections[user_id]
                self.logger.info(f"Removed empty user connection list for {user_id}")
                self.logger.info(f"User {user_id} completely removed from system")
            else:
                self.logger.info(f"User {user_id} still has {len(user_websockets)} connections on other clients")
        else:
            self.logger.warning(f"User {user_id} not found in user connections pool")
    
    async def remove_user_from_node(self, user_id, node_id):
        """Remove user from a specific node in user connections pool"""
        self.logger.info(f"Attempting to remove user {user_id} from node {node_id}")
        
        if user_id in self.user_connections:
            # Find and remove the websocket for this specific node
            user_websockets = self.user_connections[user_id]
            websockets_to_remove = []
            
            self.logger.info(f"User {user_id} has {len(user_websockets)} connections")
            
            for websocket in user_websockets:
                if hasattr(websocket, 'node_id') and websocket.node_id == node_id:
                    websockets_to_remove.append(websocket)
                    self.logger.info(f"Found websocket for user {user_id} on node {node_id}")
            
            # Remove the websockets
            for websocket in websockets_to_remove:
                user_websockets.remove(websocket)
                self.logger.info(f"Removed user {user_id} from node {node_id}")
            
            # Clean up empty user connection lists
            if not user_websockets:
                del self.user_connections[user_id]
                self.logger.info(f"Removed empty user connection list for {user_id}")
                self.logger.info(f"User {user_id} completely removed from system")
            else:
                self.logger.info(f"User {user_id} still has {len(user_websockets)} connections on other nodes")
        else:
            self.logger.warning(f"User {user_id} not found in user connections pool")
    

    async def notify_user_connected_on_another_client(self, user_id, username, new_client_id, new_node_id, existing_connections):
        """Notify existing connections that user logged in on another client/node"""
        self.logger.info(f"===== STARTING NOTIFICATION =====")
        self.logger.info(f"notify_user_connected_on_another_client called")
        self.logger.info(f"user_id: {user_id}")
        self.logger.info(f"username: {username}")
        self.logger.info(f"new_client_id: {new_client_id}")
        self.logger.info(f"new_node_id: {new_node_id}")
        self.logger.info(f"existing_connections count: {len(existing_connections)}")
        
        notification_message = {
            'type': 'user_connected_on_another_client',
            'user_id': user_id,
            'username': username,
            'new_client_id': new_client_id,
            'new_node_id': new_node_id,
            'message': f'User {username} has logged in on another client: {new_client_id} (node: {new_node_id})',
            'timestamp': datetime.utcnow().isoformat()
        }
        
        self.logger.info(f"Notification message: {notification_message}")
        
        success_count = 0
        for i, websocket in enumerate(existing_connections):
            try:
                existing_client_id = getattr(websocket, 'client_id', 'unknown')
                existing_node_id = getattr(websocket, 'node_id', 'unknown')
                self.logger.info(f"Sending notification to connection {i+1}: client={existing_client_id}, node={existing_node_id}")
                
                await self.send_message_to_websocket(websocket, notification_message)
                success_count += 1
                self.logger.info(f"Successfully notified client {existing_client_id} (node {existing_node_id}) about user {user_id} login on client {new_client_id} (node {new_node_id})")
            except Exception as e:
                self.logger.error(f"Error notifying client about user login: {e}")
                import traceback
                self.logger.error(f"Traceback: {traceback.format_exc()}")
        
        self.logger.info(f"Notified {success_count}/{len(existing_connections)} existing connections about user {user_id} login on client {new_client_id} (node {new_node_id})")
        self.logger.info(f"===== NOTIFICATION COMPLETE =====")

    
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
                self.logger.info(f"Notified node {getattr(websocket, 'node_id', 'unknown')} about user {user_id} login on {new_node_id}")
            except Exception as e:
                self.logger.error(f"Error notifying node about user login: {e}")
        
        self.logger.info(f"Notified {success_count}/{len(existing_connections)} existing connections about user {user_id} login on {new_node_id}")
    
    async def handle_node_offline(self, node_id):
        """Handle node offline - close all clients on this node and clean up users if needed"""
        self.logger.info(f"Node {node_id} going offline - starting cleanup...")
        
        if not hasattr(self, 'node_connections') or node_id not in self.node_connections:
            self.logger.warning(f"Node {node_id} not found in connections")
            return
        
        # Get all connections on this node
        node_connections = self.node_connections[node_id]
        self.logger.info(f"Found {len(node_connections)} connections on node {node_id}")
        
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
        
        self.logger.info(f"Found {len(clients_to_close)} clients to close: {list(clients_to_close)}")
        self.logger.info(f"Found {len(users_to_check)} users to check: {list(users_to_check)}")
        
        # Close all connections on this node
        for websocket in node_connections:
            try:
                await websocket.close(code=1000, reason="Node offline")
                self.logger.info(f"Closed connection on node {node_id}")
            except Exception as e:
                self.logger.error(f"Error closing connection: {e}")
        
        # Remove node from node connections pool
        del self.node_connections[node_id]
        self.logger.info(f"Removed node {node_id} from node connections pool")
        
        # Check each user to see if they should be cleaned up
        for user_id in users_to_check:
            await self.check_and_cleanup_user_if_orphaned(user_id, node_id)
        
        # Check each client to see if they should be cleaned up
        for client_id in clients_to_close:
            await self.check_and_cleanup_client_if_orphaned(client_id, node_id)
        
        self.logger.info(f"Node {node_id} offline cleanup completed")
    
    async def check_and_cleanup_user_if_orphaned(self, user_id, offline_node_id):
        """Check if user is only connected on the offline node, if so clean up"""
        self.logger.info(f"Checking if user {user_id} is orphaned after node {offline_node_id} offline...")
        
        if user_id not in self.user_connections:
            self.logger.warning(f"User {user_id} not found in user connections")
            return
        
        user_websockets = self.user_connections[user_id]
        remaining_connections = []
        
        # Check which connections are still active (not on the offline node)
        for websocket in user_websockets:
            websocket_node_id = getattr(websocket, 'node_id', None)
            if websocket_node_id != offline_node_id:
                remaining_connections.append(websocket)
        
        self.logger.info(f"User {user_id} has {len(remaining_connections)} remaining connections after node {offline_node_id} offline")
        
        if not remaining_connections:
            # User is orphaned, clean up
            self.logger.info(f"User {user_id} is orphaned, cleaning up...")
            del self.user_connections[user_id]
            self.logger.info(f"User {user_id} completely removed from system")
        else:
            # User still has connections, update the list
            self.user_connections[user_id] = remaining_connections
            self.logger.info(f"User {user_id} still has {len(remaining_connections)} active connections")
    
    async def check_and_cleanup_client_if_orphaned(self, client_id, offline_node_id):
        """Check if client is only connected on the offline node, if so clean up"""
        self.logger.info(f"Checking if client {client_id} is orphaned after node {offline_node_id} offline...")
        
        if client_id not in self.client_connections:
            self.logger.warning(f"Client {client_id} not found in client connections")
            return
        
        client_websockets = self.client_connections[client_id]
        remaining_connections = []
        
        # Check which connections are still active (not on the offline node)
        for websocket in client_websockets:
            websocket_node_id = getattr(websocket, 'node_id', None)
            if websocket_node_id != offline_node_id:
                remaining_connections.append(websocket)
        
        self.logger.info(f"Client {client_id} has {len(remaining_connections)} remaining connections after node {offline_node_id} offline")
        
        if not remaining_connections:
            # Client is orphaned, clean up
            self.logger.info(f"Client {client_id} is orphaned, cleaning up...")
            del self.client_connections[client_id]
            self.logger.info(f"Client {client_id} completely removed from system")
        else:
            # Client still has connections, update the list
            self.client_connections[client_id] = remaining_connections
            self.logger.info(f"Client {client_id} still has {len(remaining_connections)} active connections")

    def check_duplicate_registration(self, node_id, client_id, user_id, new_websocket):
        """Check if a registration with the same node_id, client_id, and user_id already exists and is still valid"""
        self.logger.info(f"Checking for duplicate registration...")
        self.logger.info(f"Node: {node_id}, Client: {client_id}, User: {user_id}")
        
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
                                self.logger.info(f"Found valid duplicate in node connections")
                                return True
                            else:
                                self.logger.info(f"Found invalid duplicate in node connections, will allow new connection")
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
                            self.logger.info(f"Found valid duplicate in client connections")
                            return True
                        else:
                            self.logger.info(f"Found invalid duplicate in client connections, will allow new connection")
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
                            self.logger.info(f"Found valid duplicate in user connections")
                            return True
                        else:
                            self.logger.info(f"Found invalid duplicate in user connections, will allow new connection")
                            # Remove invalid connection from pool
                            self.remove_invalid_connection(conn)
        
        self.logger.info(f"No valid duplicate registration found")
        return False
    
    def is_connection_valid(self, websocket):
        """Check if a WebSocket connection is still valid"""
        try:
            # Check if connection was marked as closed by logout
            if hasattr(websocket, '_closed_by_logout') and websocket._closed_by_logout:
                return False
            
            # Check WebSocket closed attribute
            if hasattr(websocket, 'closed') and websocket.closed:
                return False
            
            # Check connection state - use multiple methods for reliability
            connection_valid = True
            
            # Method 1: Check websockets state attribute
            if hasattr(websocket, 'state'):
                state_value = websocket.state
                state_name = websocket.state.name if hasattr(websocket.state, 'name') else str(websocket.state)
                
                # Check state value (3 = CLOSED, 2 = CLOSING)
                if state_value in [2, 3] or state_name in ['CLOSED', 'CLOSING']:
                    connection_valid = False
            
            # Method 2: Check close_code
            if hasattr(websocket, 'close_code') and websocket.close_code is not None:
                connection_valid = False
            
            # Method 3: Try to send a ping to test connection (non-blocking)
            try:
                # This is a lightweight check - just accessing the websocket object
                # without actually sending data
                if hasattr(websocket, '_closed') and websocket._closed:
                    connection_valid = False
            except Exception:
                connection_valid = False
            
            return connection_valid
            
        except Exception as e:
            return False
    
    def cleanup_invalid_connections(self):
        """Clean up invalid connections from all pools"""
        total_removed = 0
        
        # Clean up node connections
        if hasattr(self, 'node_connections') and self.node_connections:
            for node_id, connections in list(self.node_connections.items()):
                invalid_connections = [ws for ws in connections if not self.is_connection_valid(ws)]
                for ws in invalid_connections:
                    connections.remove(ws)
                    total_removed += 1
                
                if not connections:
                    del self.node_connections[node_id]
        
        # Clean up user connections
        if hasattr(self, 'user_connections') and self.user_connections:
            for user_id, connections in list(self.user_connections.items()):
                invalid_connections = [ws for ws in connections if not self.is_connection_valid(ws)]
                for ws in invalid_connections:
                    connections.remove(ws)
                    total_removed += 1
                
                if not connections:
                    del self.user_connections[user_id]
        
        # Clean up client connections
        if hasattr(self, 'client_connections') and self.client_connections:
            for client_id, connections in list(self.client_connections.items()):
                invalid_connections = [ws for ws in connections if not self.is_connection_valid(ws)]
                for ws in invalid_connections:
                    connections.remove(ws)
                    total_removed += 1
                
                if not connections:
                    del self.client_connections[client_id]
        
        # Only log if connections were actually removed
        if total_removed > 0:
            self.logger.info(f"Cleaned up {total_removed} invalid connections")
    
    def remove_invalid_connection(self, websocket):
        """Remove an invalid connection from all connection pools"""
        try:
            self.logger.info(f"Removing invalid connection from all pools...")
            
            # Remove from node_connections
            if hasattr(self, 'node_connections'):
                for node_id, connections in list(self.node_connections.items()):
                    if websocket in connections:
                        connections.remove(websocket)
                        self.logger.info(f"Removed from node {node_id}")
                        if not connections:
                            del self.node_connections[node_id]
                            self.logger.info(f"Removed empty node {node_id}")
            
            # Remove from client_connections
            if hasattr(self, 'client_connections'):
                for client_id, connections in list(self.client_connections.items()):
                    if websocket in connections:
                        connections.remove(websocket)
                        self.logger.info(f"Removed from client {client_id}")
                        if not connections:
                            del self.client_connections[client_id]
                            self.logger.info(f"Removed empty client {client_id}")
            
            # Remove from user_connections
            if hasattr(self, 'user_connections'):
                for user_id, connections in list(self.user_connections.items()):
                    if websocket in connections:
                        connections.remove(websocket)
                        self.logger.info(f"Removed from user {user_id}")
                        if not connections:
                            del self.user_connections[user_id]
                            self.logger.info(f"Removed empty user {user_id}")
            
            self.logger.info(f"Invalid connection removed from all pools")
            
        except Exception as e:
            self.logger.error(f"Error removing invalid connection: {e}")
    
    def find_existing_connection(self, node_id, client_id, user_id):
        """Find existing connection with the same node_id, client_id, and user_id"""
        self.logger.info(f"Finding existing connection...")
        self.logger.info(f"Node: {node_id}, Client: {client_id}, User: {user_id}")
        
        # Search in all connection pools
        if hasattr(self, 'node_connections') and self.node_connections:
            for nid, connections in self.node_connections.items():
                if nid == node_id:
                    for conn in connections:
                        if (getattr(conn, 'client_id', None) == client_id and 
                            getattr(conn, 'user_id', None) == user_id):
                            self.logger.info(f"Found existing connection in node connections")
                            return conn
        
        if hasattr(self, 'client_connections') and self.client_connections:
            if client_id in self.client_connections:
                for conn in self.client_connections[client_id]:
                    if (getattr(conn, 'node_id', None) == node_id and 
                        getattr(conn, 'user_id', None) == user_id):
                        self.logger.info(f"Found existing connection in client connections")
                        return conn
        
        if hasattr(self, 'user_connections') and self.user_connections:
            if user_id in self.user_connections:
                for conn in self.user_connections[user_id]:
                    if (getattr(conn, 'node_id', None) == node_id and 
                        getattr(conn, 'client_id', None) == client_id):
                        self.logger.info(f"Found existing connection in user connections")
                        return conn
        
        self.logger.info(f"No existing connection found")
        return None

    def remove_connection_from_all_pools(self, websocket):
        """Remove connection from all connection pools"""
        removed_from = []
        
        # Get connection info before removal
        node_id = getattr(websocket, 'node_id', 'unknown')
        user_id = getattr(websocket, 'user_id', 'unknown')
        username = getattr(websocket, 'username', 'unknown')
        
        self.logger.info(f"Connection disconnected - Node: {node_id}, User: {user_id} ({username})")
        
        # Remove from node connections pool
        if hasattr(self, 'node_connections') and self.node_connections:
            for node_id_key, connections in list(self.node_connections.items()):
                if websocket in connections:
                    connections.remove(websocket)
                    removed_from.append(f"node({node_id_key})")
                    self.logger.info(f"Removed from node connections: {node_id_key}")
                    # Clean up empty node connection lists
                    if not connections:
                        del self.node_connections[node_id_key]
                        self.logger.info(f"Removed empty node connection list for {node_id_key}")
                    break
        
        # Remove from user connections pool
        if hasattr(self, 'user_connections') and self.user_connections:
            for user_id_key, websockets in list(self.user_connections.items()):
                if websocket in websockets:
                    websockets.remove(websocket)
                    removed_from.append(f"user({user_id_key})")
                    self.logger.info(f"Removed from user connections: {user_id_key}")
                    # Clean up empty user connection lists
                    if not websockets:
                        del self.user_connections[user_id_key]
                        self.logger.info(f"Removed empty user connection list for {user_id_key}")
                    break
        
        # Remove from client connections pool
        if hasattr(self, 'client_connections') and self.client_connections:
            for client_id_key, websockets in list(self.client_connections.items()):
                if websocket in websockets:
                    websockets.remove(websocket)
                    removed_from.append(f"client({client_id_key})")
                    self.logger.info(f"Removed from client connections: {client_id_key}")
                    # Clean up empty client connection lists
                    if not websockets:
                        del self.client_connections[client_id_key]
                        self.logger.info(f"Removed empty client connection list for {client_id_key}")
                    break
        
        # Notify NodeManager to clean up hierarchy pools
        if removed_from and hasattr(self, 'node_manager') and self.node_manager:
            try:
                self.logger.info(f"Preparing to notify NodeManager for hierarchy cleanup")
                self.logger.info(f"Connection info - node_id: {node_id}, user_id: {user_id}, username: {username}")
                
                # Get hierarchy info from websocket attributes
                domain_id = getattr(websocket, 'domain_id', None)
                cluster_id = getattr(websocket, 'cluster_id', None)
                channel_id = getattr(websocket, 'channel_id', None)
                is_domain_main_node = getattr(websocket, 'is_domain_main_node', False)
                is_cluster_main_node = getattr(websocket, 'is_cluster_main_node', False)
                is_channel_main_node = getattr(websocket, 'is_channel_main_node', False)
                
                self.logger.info(f"Hierarchy info - domain: {domain_id}, cluster: {cluster_id}, channel: {channel_id}")
                self.logger.info(f"Node types - domain_main: {is_domain_main_node}, cluster_main: {is_cluster_main_node}, channel_main: {is_channel_main_node}")
                
                # Create a ClientConnection object for NodeManager cleanup
                from services.nodeManager import ClientConnection
                connection = ClientConnection(
                    websocket=websocket,
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
                
                self.logger.info(f"Calling NodeManager.remove_connection()...")
                
                # Call NodeManager's remove_connection method
                self.node_manager.remove_connection(connection)
                self.logger.info(f"Successfully notified NodeManager to clean up hierarchy pools")
            except Exception as e:
                self.logger.error(f"Error notifying NodeManager: {e}")
                import traceback
                self.logger.error(f"Full error details: {traceback.format_exc()}")
        elif removed_from:
            self.logger.warning(f"NodeManager not available, cannot clean up hierarchy pools")
        else:
            self.logger.info(f"No connections removed, skipping NodeManager notification")
        
        if removed_from:
            self.logger.info(f"Connection cleanup completed from: {', '.join(removed_from)}")
            self.logger.info(f"Remaining nodes: {list(self.node_connections.keys()) if hasattr(self, 'node_connections') else []}")
            self.logger.info(f"Remaining users: {list(self.user_connections.keys()) if hasattr(self, 'user_connections') else []}")
            self.logger.info(f"Remaining clients: {list(self.client_connections.keys()) if hasattr(self, 'client_connections') else []}")
        else:
            self.logger.warning(f"Connection not found in any pool")
    
    async def broadcast_to_c_clients(self, message):
        """Broadcast message to all connected C-Clients"""
        if hasattr(self, 'node_connections') and self.node_connections:
            for node_id, connections in self.node_connections.items():
                for websocket in connections:
                    try:
                        await self.send_message_to_websocket(websocket, message)
                    except Exception as e:
                        self.logger.error(f"Error broadcasting to node {node_id}: {e}")
    
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
            self.logger.info("Disconnected from C-Client WebSocket")
    
    async def send_message(self, message):
        """Send message to C-Client"""
        if self.websocket and self.is_connected:
            try:
                await self.websocket.send(json.dumps(message))
            except Exception as e:
                self.logger.error(f"Error sending message to C-Client: {e}")
                self.is_connected = False
    
    async def send_message_to_websocket(self, websocket, message):
        """Send message to specific WebSocket connection"""
        try:
            await websocket.send(json.dumps(message))
        except Exception as e:
            self.logger.error(f"Error sending message to WebSocket: {e}")
    
    
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
        
        self.logger.info(f"Sending logout message to user {user_id} (WAITING FOR ALL FEEDBACK)...")
        
        # CRITICAL FIX: For logout operations, always check connections in real-time (no cache)
        user_websockets = self.get_cached_user_connections(user_id, use_cache=False)
        
        if not user_websockets:
            self.logger.warning(f"No active connections for user {user_id}")
            # Double-check by looking directly in user_connections pool
            direct_connections = self.user_connections.get(user_id, [])
            if direct_connections:
                self.logger.info(f"Found {len(direct_connections)} connections in direct pool, but all are invalid")
                # Clean up invalid connections immediately
                self.user_connections[user_id] = []
                if not self.user_connections[user_id]:
                    del self.user_connections[user_id]
            return
        
        self.logger.info(f"Sending logout message to {len(user_websockets)} connections")
        
        # Send logout message in parallel to all connections
        await self.send_logout_message_parallel(user_id, message, user_websockets)
        
        # 设置反馈跟踪机制
        feedback_received = {}
        for websocket in user_websockets:
            feedback_received[websocket] = False
        
        # 存储反馈跟踪到websocket对象
        for websocket in user_websockets:
            websocket._logout_feedback_tracking = feedback_received
        
        self.logger.info(f"Waiting for logout feedback from {len(user_websockets)} connections...")
        
        # 等待所有反馈，使用更长的超时时间确保稳定性
        timeout = timeout or 10  # 10秒超时，确保所有C端都有时间响应
        start_time = asyncio.get_event_loop().time()
        check_interval = 0.1  # 100ms检查间隔
        
        while asyncio.get_event_loop().time() - start_time < timeout:
            elapsed = asyncio.get_event_loop().time() - start_time
            
            # 检查是否所有反馈都收到了
            if all(feedback_received.values()):
                self.logger.info(f"All logout feedback received for user {user_id} in {elapsed:.2f}s")
                break
            
            # 显示进度
            received_count = sum(1 for received in feedback_received.values() if received)
            self.logger.info(f"Received {received_count}/{len(user_websockets)} feedbacks ({elapsed:.1f}s)")
            
            # 等待检查间隔
            await asyncio.sleep(check_interval)
        else:
            # 超时处理
            missing_feedback = [ws for ws, received in feedback_received.items() if not received]
            self.logger.warning(f"Logout feedback timeout for user {user_id} after {timeout}s")
            self.logger.warning(f"   Missing feedback from {len(missing_feedback)} connections")
            self.logger.warning(f"   Proceeding with logout completion anyway...")
        
        # 清理反馈跟踪
        for websocket in user_websockets:
            if hasattr(websocket, '_logout_feedback_tracking'):
                delattr(websocket, '_logout_feedback_tracking')
        
        self.logger.info(f"Logout notification process completed for user {user_id}")
        self.logger.info(f"All C-Client feedback received, safe to proceed with cleanup")
    
    def get_cached_user_connections(self, user_id, use_cache=True):
        """Get cached user connections for faster access"""
        if use_cache and user_id in self.connection_cache:
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
        if use_cache:
            valid_connections = [conn for conn in user_connections if self.is_connection_valid_cached(conn)]
            self.connection_cache[user_id] = valid_connections
        else:
            # CRITICAL FIX: For logout operations, always check connection validity in real-time
            valid_connections = [conn for conn in user_connections if self.is_connection_valid(conn)]
            self.logger.info(f"Real-time connection check for logout - found {len(valid_connections)}/{len(user_connections)} valid connections")
            for i, conn in enumerate(user_connections):
                is_valid = self.is_connection_valid(conn)
                connection_id = id(conn)
                self.logger.info(f"   Connection {i+1}: ID={connection_id}, Valid={is_valid}, State={getattr(conn, 'state', 'N/A')}, CloseCode={getattr(conn, 'close_code', 'N/A')}")
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
            self.logger.info(f"First logout for user {user_id} - using ultra-fast timeout")
            return self.logout_timeout_config['first_logout']
        else:
            # Subsequent logout - use ultra-fast timeout
            self.user_logout_history[user_id] += 1
            self.logger.info(f"Subsequent logout for user {user_id} - using ultra-fast timeout")
            return self.logout_timeout_config['subsequent_logout']
    
    async def send_logout_message_parallel(self, user_id, message, user_websockets):
        """Send logout message to all connections in parallel with delivery confirmation"""
        
        self.logger.info(f"Sending logout message in parallel to {len(user_websockets)} connections...")
        
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
                    self.logger.error(f"Message delivery failed to connection {i+1}: {result}")
                    failed_deliveries += 1
                else:
                    self.logger.info(f"Message delivered to connection {i+1}")
                    successful_deliveries += 1
            
            self.logger.info(f"Delivery summary for user {user_id}")
            self.logger.info(f"   ✅ Successful deliveries: {successful_deliveries}")
            self.logger.info(f"   ❌ Failed deliveries: {failed_deliveries}")
            self.logger.info(f"   📤 Total connections: {len(user_websockets)}")
            
        except Exception as e:
            self.logger.error(f"Error in parallel message sending: {e}")
    
    async def send_message_to_websocket_with_confirmation(self, websocket, message, connection_id):
        """Send message to websocket with delivery confirmation"""
        try:
            # CRITICAL: Check connection validity BEFORE attempting to send
            if not self.is_connection_valid(websocket):
                self.logger.error(f"Connection {connection_id} is invalid before sending, skipping")
                self.logger.error(f"Connection {connection_id} validation failed:")
                self.logger.error(f"   - Connection state: {getattr(websocket, 'state', 'N/A')}")
                self.logger.error(f"   - Connection closed: {getattr(websocket, 'closed', 'N/A')}")
                self.logger.error(f"   - Close code: {getattr(websocket, 'close_code', 'N/A')}")
                return False
            
            # Add detailed connection state logging before sending
            self.logger.debug(f"===== CONNECTION STATE BEFORE SENDING ======")
            self.logger.debug(f"Connection {connection_id} state check:")
            self.logger.debug(f"   - WebSocket object: {websocket}")
            self.logger.debug(f"   - Connection state: {getattr(websocket, 'state', 'N/A')}")
            self.logger.debug(f"   - Connection closed: {getattr(websocket, 'closed', 'N/A')}")
            self.logger.debug(f"   - Close code: {getattr(websocket, 'close_code', 'N/A')}")
            self.logger.debug(f"   - Message type: {message.get('type', 'unknown')}")
            self.logger.debug(f"===== END CONNECTION STATE CHECK ======")
            
            await self.send_message_to_websocket(websocket, message)
            self.logger.info(f"Message sent to connection {connection_id}")
            
            # Add connection state logging after sending
            self.logger.debug(f"===== CONNECTION STATE AFTER SENDING ======")
            self.logger.debug(f"Connection {connection_id} state after send:")
            self.logger.debug(f"   - Connection state: {getattr(websocket, 'state', 'N/A')}")
            self.logger.debug(f"   - Connection closed: {getattr(websocket, 'closed', 'N/A')}")
            self.logger.debug(f"   - Close code: {getattr(websocket, 'close_code', 'N/A')}")
            self.logger.debug(f"===== END POST-SEND STATE CHECK ======")
            
            return True
        except Exception as e:
            self.logger.error(f"Failed to send message to connection {connection_id}: {e}")
            self.logger.error(f"Exception type: {type(e)}")
            self.logger.error(f"Exception details: {str(e)}")
            # Add connection state logging after exception
            self.logger.debug(f"===== CONNECTION STATE AFTER EXCEPTION ======")
            self.logger.debug(f"Connection {connection_id} state after exception:")
            self.logger.debug(f"   - Connection state: {getattr(websocket, 'state', 'N/A')}")
            self.logger.debug(f"   - Connection closed: {getattr(websocket, 'closed', 'N/A')}")
            self.logger.debug(f"   - Close code: {getattr(websocket, 'close_code', 'N/A')}")
            self.logger.debug(f"===== END EXCEPTION STATE CHECK ======")
            raise e
    
    async def handle_logout_feedback(self, websocket, data, client_id, user_id):
        """Handle logout feedback from C-Client"""
        try:
            success = data.get('success', False)
            message = data.get('message', 'No message')
            timestamp = data.get('timestamp')
            immediate = data.get('immediate', False)
            feedback_client_id = data.get('client_id', 'unknown')
            
            self.logger.info(f"===== LOGOUT FEEDBACK RECEIVED =====")
            self.logger.info(f"   Client ID: {client_id}")
            self.logger.info(f"   Feedback Client ID: {feedback_client_id}")
            self.logger.info(f"   User ID: {user_id}")
            self.logger.info(f"   Success: {success}")
            self.logger.info(f"   Message: {message}")
            self.logger.info(f"   Immediate: {immediate}")
            self.logger.info(f"   Timestamp: {timestamp}")
            
            # Find the connection index for this websocket
            user_websockets = self.user_connections.get(user_id, [])
            connection_index = None
            
            for i, ws in enumerate(user_websockets):
                if ws == websocket:
                    connection_index = i
                    break
            
            if connection_index is not None:
                self.logger.info(f"Logout feedback received from connection {connection_index} for user {user_id}")
                
                # Mark this connection's feedback as received IMMEDIATELY
                if hasattr(websocket, '_logout_feedback_tracking'):
                    websocket._logout_feedback_tracking[websocket] = True
                    self.logger.info(f"IMMEDIATELY marked logout feedback as received")
                    
                    # 显示当前反馈进度
                    total_connections = len(websocket._logout_feedback_tracking)
                    received_count = sum(1 for received in websocket._logout_feedback_tracking.values() if received)
                    self.logger.info(f"Feedback progress: {received_count}/{total_connections} received")
                
                if success:
                    self.logger.info(f"Logout completed successfully on C-Client {client_id}")
                else:
                    self.logger.warning(f"Logout failed on C-Client {client_id}: {message}")
                
                # If immediate feedback, trigger fast completion
                if immediate:
                    self.logger.info(f"Immediate feedback detected from {feedback_client_id}")
            else:
                self.logger.warning(f"Received logout feedback from unknown connection for user {user_id}")
                
        except Exception as e:
            self.logger.error(f"Error handling logout feedback: {e}")
    
    async def handle_session_feedback(self, websocket, data, client_id, user_id):
        """Handle session feedback from C-Client"""
        try:
            success = data.get('success', False)
            message = data.get('message', 'No message')
            timestamp = data.get('timestamp')
            
            self.logger.info(f"===== SESSION FEEDBACK RECEIVED =====")
            self.logger.info(f"   Client ID: {client_id}")
            self.logger.info(f"   User ID: {user_id}")
            self.logger.info(f"   Success: {success}")
            self.logger.info(f"   Message: {message}")
            self.logger.info(f"   Timestamp: {timestamp}")
            
            # Mark this connection's feedback as received
            if hasattr(websocket, '_session_feedback_tracking'):
                websocket._session_feedback_tracking[websocket] = True
                self.logger.info(f"Marked session feedback as received for this connection")
            
            if success:
                self.logger.info(f"Session processing completed successfully on C-Client {client_id}")
            else:
                self.logger.warning(f"Session processing failed on C-Client {client_id}: {message}")
                
        except Exception as e:
            self.logger.error(f"Error handling session feedback: {e}")
    
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
                self.logger.info(f"Found {len(connections)} connections for user {user_id}")
                
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
                        self.logger.info(f"Session data sent to C-Client for user {user_id}")
                    except Exception as e:
                        self.logger.error(f"Failed to send session to C-Client: {e}")
            else:
                self.logger.warning(f"No WebSocket connections found for user {user_id}")
                
        except Exception as e:
            self.logger.error(f"Error sending session to C-Client: {e}")
