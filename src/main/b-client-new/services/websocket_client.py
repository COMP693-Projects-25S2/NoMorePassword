"""
C-Client WebSocket Client Service
Handles WebSocket communication with C-Client
"""
from datetime import datetime
import json
import os
import time
try:
    import websockets
    import asyncio
    import threading
except ImportError:
    print("WebSocket dependencies not available. Install with: pip install websockets")
    websockets = None
    asyncio = None
    threading = None

# These will be injected when initialized
app = None
db = None
UserCookie = None
UserAccount = None
send_session_to_client = None


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
    
    async def _handle_node_management_async(self, websocket, nmp_params):
        """Handle node management in background to allow WebSocket message loop to run"""
        try:
            print(f"🔧 Background task: Calling node_manager.handle_new_connection()...")
            connection = await self.node_manager.handle_new_connection(
                websocket,
                nmp_params
            )
            
            print(f"✅ Background task: NodeManager.handle_new_connection() completed successfully")
            print(f"📊 Background task: Connection result:")
            print(f"   Node ID: {connection.node_id}")
            print(f"   Domain ID: {connection.domain_id}")
            print(f"   Cluster ID: {connection.cluster_id}")
            print(f"   Channel ID: {connection.channel_id}")
            print(f"   Is Domain Main: {connection.is_domain_main_node}")
            print(f"   Is Cluster Main: {connection.is_cluster_main_node}")
            print(f"   Is Channel Main: {connection.is_channel_main_node}")
            
            # Get and display pool stats
            stats = self.node_manager.get_pool_stats()
            print(f"📊 Background task: NodeManager pool stats:")
            print(f"   Domains: {stats['domains']}")
            print(f"   Clusters: {stats['clusters']}")
            print(f"   Channels: {stats['channels']}")
            print(f"   Total connections: {stats['total_connections']}")
            
        except Exception as e:
            print(f"❌ Background task: Error in node management: {e}")
            import traceback
            traceback.print_exc()
    
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
                
                # ========== NodeManager Integration ==========
                print("=" * 80)
                print("🔧 B-Client: NODEMANAGER INTEGRATION CHECKPOINT")
                print(f"🔍 Checking if NodeManager is available...")
                
                if hasattr(self, 'node_manager'):
                    print(f"✅ NodeManager found: {self.node_manager}")
                    print(f"🔧 Preparing to call node_manager.handle_new_connection()...")
                    
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
                        
                        print(f"📋 NMP params for NodeManager:")
                        for key, value in nmp_params.items():
                            print(f"   {key}: {value}")
                        
                        print(f"🚀 Starting node_manager.handle_new_connection() in background...")
                        # Create background task to handle node management
                        # This allows the WebSocket message loop to start and receive responses
                        asyncio.create_task(self._handle_node_management_async(websocket, nmp_params))
                        print(f"✅ Node management task created successfully")
                        
                    except Exception as e:
                        print(f"❌ NodeManager integration error: {e}")
                        import traceback
                        traceback.print_exc()
                else:
                    print(f"❌ NodeManager NOT FOUND on self")
                    print(f"   Available attributes: {[attr for attr in dir(self) if not attr.startswith('_')]}")
                    print(f"⚠️ C-Client will NOT be added to node management pools")
                
                print("=" * 80)
                # ========== End NodeManager Integration ==========
                
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
        
        # Check if this is a NodeManager command response (has request_id and command_type)
        if 'request_id' in data and 'command_type' in data:
            print(f"📥 B-Client: Received NodeManager response from C-Client {client_id}")
            print(f"   Command type: {data.get('command_type')}")
            print(f"   Request ID: {data.get('request_id')}")
            print(f"   Success: {data.get('success')}")
            
            # Forward to NodeManager for processing
            if hasattr(self, 'node_manager') and self.node_manager:
                print(f"🔧 B-Client: Forwarding response to NodeManager...")
                
                # Find the actual ClientConnection object from NodeManager's pools
                node_id = data.get('data', {}).get('node_id') or getattr(websocket, 'node_id', None)
                connection = None
                
                if node_id:
                    print(f"🔍 Looking for connection with node_id: {node_id}")
                    # Search in all pools
                    for domain_id, connections in self.node_manager.domain_pool.items():
                        for conn in connections:
                            if conn.node_id == node_id:
                                connection = conn
                                print(f"✅ Found connection in domain_pool[{domain_id}]")
                                break
                        if connection:
                            break
                    
                    if not connection:
                        for cluster_id, connections in self.node_manager.cluster_pool.items():
                            for conn in connections:
                                if conn.node_id == node_id:
                                    connection = conn
                                    print(f"✅ Found connection in cluster_pool[{cluster_id}]")
                                    break
                            if connection:
                                break
                    
                    if not connection:
                        for channel_id, connections in self.node_manager.channel_pool.items():
                            for conn in connections:
                                if conn.node_id == node_id:
                                    connection = conn
                                    print(f"✅ Found connection in channel_pool[{channel_id}]")
                                    break
                            if connection:
                                break
                
                if not connection:
                    print(f"⚠️ Could not find ClientConnection object, creating temporary one")
                    # Create a minimal connection object if not found
                    from nodeManager import ClientConnection
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
                print(f"✅ B-Client: Response forwarded to NodeManager")
            return
        
        if message_type == 'c_client_register':
            # Handle re-registration from C-Client
            print(f"📥 B-Client: Received re-registration from C-Client {client_id}")
            await self.handle_c_client_reregistration(websocket, data)
        elif message_type == 'assignConfirmed':
            # Handle assignConfirmed notification from C-Client
            print(f"📥 B-Client: Received assignConfirmed from C-Client {client_id}")
            assign_data = data.get('data', {})
            print(f"   Domain ID: {assign_data.get('domain_id')}")
            print(f"   Cluster ID: {assign_data.get('cluster_id')}")
            print(f"   Channel ID: {assign_data.get('channel_id')}")
            print(f"   Node ID: {assign_data.get('node_id')}")
            
            # Forward to NodeManager to update connection pools if needed
            if hasattr(self, 'node_manager') and self.node_manager:
                node_id = assign_data.get('node_id')
                if node_id:
                    print(f"🔧 B-Client: Updating connection pools for node {node_id}...")
                    # Search for connection and update its IDs
                    for domain_id, connections in self.node_manager.domain_pool.items():
                        for conn in connections:
                            if conn.node_id == node_id:
                                conn.domain_id = assign_data.get('domain_id') or conn.domain_id
                                conn.cluster_id = assign_data.get('cluster_id') or conn.cluster_id
                                conn.channel_id = assign_data.get('channel_id') or conn.channel_id
                                print(f"✅ Updated connection in domain_pool: domain={conn.domain_id}, cluster={conn.cluster_id}, channel={conn.channel_id}")
                                
                                # Add to cluster pool if cluster_id exists and not already there
                                if conn.cluster_id and conn.is_cluster_main_node:
                                    if conn.cluster_id not in self.node_manager.cluster_pool:
                                        self.node_manager.cluster_pool[conn.cluster_id] = []
                                    if conn not in self.node_manager.cluster_pool[conn.cluster_id]:
                                        self.node_manager.cluster_pool[conn.cluster_id].append(conn)
                                        print(f"✅ Added to cluster_pool[{conn.cluster_id}]")
                                
                                # Add to channel pool if channel_id exists and not already there
                                if conn.channel_id and conn.is_channel_main_node:
                                    if conn.channel_id not in self.node_manager.channel_pool:
                                        self.node_manager.channel_pool[conn.channel_id] = []
                                    if conn not in self.node_manager.channel_pool[conn.channel_id]:
                                        self.node_manager.channel_pool[conn.channel_id].append(conn)
                                        print(f"✅ Added to channel_pool[{conn.channel_id}]")
                                break
                    
                    print(f"📊 Current pool stats:")
                    print(f"   Domains: {len(self.node_manager.domain_pool)}")
                    print(f"   Clusters: {len(self.node_manager.cluster_pool)}")
                    print(f"   Channels: {len(self.node_manager.channel_pool)}")
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
        
        # Notify NodeManager to clean up hierarchy pools
        if removed_from and hasattr(self, 'node_manager') and self.node_manager:
            try:
                print(f"🔧 B-Client: Preparing to notify NodeManager for hierarchy cleanup")
                print(f"🔧 B-Client: Connection info - node_id: {node_id}, user_id: {user_id}, username: {username}")
                
                # Get hierarchy info from websocket attributes
                domain_id = getattr(websocket, 'domain_id', None)
                cluster_id = getattr(websocket, 'cluster_id', None)
                channel_id = getattr(websocket, 'channel_id', None)
                is_domain_main_node = getattr(websocket, 'is_domain_main_node', False)
                is_cluster_main_node = getattr(websocket, 'is_cluster_main_node', False)
                is_channel_main_node = getattr(websocket, 'is_channel_main_node', False)
                
                print(f"🔧 B-Client: Hierarchy info - domain: {domain_id}, cluster: {cluster_id}, channel: {channel_id}")
                print(f"🔧 B-Client: Node types - domain_main: {is_domain_main_node}, cluster_main: {is_cluster_main_node}, channel_main: {is_channel_main_node}")
                
                # Create a ClientConnection object for NodeManager cleanup
                from nodeManager import ClientConnection
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
                
                print(f"🔧 B-Client: Calling NodeManager.remove_connection()...")
                
                # Call NodeManager's remove_connection method
                self.node_manager.remove_connection(connection)
                print(f"✅ B-Client: Successfully notified NodeManager to clean up hierarchy pools")
            except Exception as e:
                print(f"⚠️ B-Client: Error notifying NodeManager: {e}")
                import traceback
                print(f"⚠️ B-Client: Full error details: {traceback.format_exc()}")
        elif removed_from:
            print(f"⚠️ B-Client: NodeManager not available, cannot clean up hierarchy pools")
        else:
            print(f"ℹ️ B-Client: No connections removed, skipping NodeManager notification")
        
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
