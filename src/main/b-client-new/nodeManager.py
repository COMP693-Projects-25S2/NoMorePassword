import uuid
import asyncio
import logging
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass
from websockets.exceptions import ConnectionClosed

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class ClientConnection:
    """Represents a WebSocket connection to a C-Client"""
    websocket: Any
    node_id: Optional[str] = None
    user_id: Optional[str] = None
    username: Optional[str] = None
    domain_id: Optional[str] = None
    cluster_id: Optional[str] = None
    channel_id: Optional[str] = None
    # Main node IDs for determining node type
    domain_main_node_id: Optional[str] = None
    cluster_main_node_id: Optional[str] = None
    channel_main_node_id: Optional[str] = None
    # Node type flags
    is_domain_main_node: bool = False
    is_cluster_main_node: bool = False
    is_channel_main_node: bool = False

class NodeManager:
    """
    B-Client Node Management System
    Manages hierarchical node structure with connection pools
    """
    
    def __init__(self):
        # Connection pools: key -> list of ClientConnection
        self.domain_pool: Dict[str, List[ClientConnection]] = {}
        self.cluster_pool: Dict[str, List[ClientConnection]] = {}
        self.channel_pool: Dict[str, List[ClientConnection]] = {}
        
        # Request tracking for async operations
        self.pending_requests: Dict[str, asyncio.Future] = {}
        
        logger.info("NodeManager initialized with connection pools")
    
    # ===================== C-Client Registration =====================
    
    async def handle_new_connection(self, websocket: Any, nmp_params: Dict[str, Any]) -> ClientConnection:
        """
        Handle new C-Client WebSocket connection
        Register client and assign to node structure if needed
        
        Args:
            websocket: WebSocket connection
            nmp_params: NMP parameters from URL
            
        Returns:
            ClientConnection instance
        """
        try:
            logger.info("=" * 80)
            logger.info("🔧 NODEMANAGER: handle_new_connection() CALLED")
            logger.info(f"📋 NMP Parameters received: {nmp_params}")
            logger.info("=" * 80)
            
            # Register the C-Client
            logger.info("📝 Step 1: Calling register_c_client()...")
            connection = self.register_c_client(websocket, nmp_params)
            logger.info(f"✅ Step 1 completed: Connection created for node {connection.node_id}")
            
            # Check if client needs node assignment
            logger.info(f"🔍 Step 2: Checking if assignment needed...")
            logger.info(f"   connection.domain_id = {connection.domain_id}")
            logger.info(f"   connection.cluster_id = {connection.cluster_id}")
            logger.info(f"   connection.channel_id = {connection.channel_id}")
            
            # Check if full hierarchy exists
            needs_assignment = False
            
            if not connection.domain_id:
                logger.info(f"⚠️ Client missing domain_id, needs full assignment")
                needs_assignment = True
            elif not connection.cluster_id:
                logger.info(f"⚠️ Client has domain but missing cluster_id, needs cluster/channel assignment")
                needs_assignment = True
            elif not connection.channel_id:
                logger.info(f"⚠️ Client has domain/cluster but missing channel_id, needs channel assignment")
                needs_assignment = True
            
            if needs_assignment:
                logger.info("📍 Step 3: Calling assign_new_client()...")
                await self.assign_new_client(connection)
                logger.info("✅ Step 3 completed: Client assigned to node structure")
            else:
                logger.info(f"✅ Client already has full hierarchy (domain/cluster/channel), skipping assignment")
            
            logger.info("=" * 80)
            logger.info("🎉 NODEMANAGER: handle_new_connection() COMPLETED")
            logger.info(f"   Node ID: {connection.node_id}")
            logger.info(f"   Domain ID: {connection.domain_id}")
            logger.info(f"   Cluster ID: {connection.cluster_id}")
            logger.info(f"   Channel ID: {connection.channel_id}")
            logger.info(f"   Is Domain Main: {connection.is_domain_main_node}")
            logger.info(f"   Is Cluster Main: {connection.is_cluster_main_node}")
            logger.info(f"   Is Channel Main: {connection.is_channel_main_node}")
            logger.info("=" * 80)
            
            return connection
            
        except Exception as e:
            logger.error("=" * 80)
            logger.error(f"❌ NODEMANAGER: ERROR in handle_new_connection()")
            logger.error(f"   Error: {e}")
            import traceback
            traceback.print_exc()
            logger.error("=" * 80)
            raise
    
    async def assign_new_client(self, connection: ClientConnection) -> bool:
        """
        Assign a new C-Client to node structure
        Creates domain/cluster/channel hierarchy if needed
        
        Args:
            connection: ClientConnection instance
            
        Returns:
            True if assignment successful
        """
        try:
            logger.info("─" * 80)
            logger.info(f"🆕 NODEMANAGER: assign_new_client() STARTED")
            logger.info(f"   Client node_id: {connection.node_id}")
            logger.info(f"   Current state: domain_id={connection.domain_id}, cluster_id={connection.cluster_id}, channel_id={connection.channel_id}")
            
            # Check what level needs to be created
            if not connection.domain_id:
                # No domain - create full hierarchy
                logger.info("📍 No domain_id - need to create full hierarchy")
                logger.info(f"🔍 Checking domain_pool...")
                logger.info(f"   domain_pool size: {len(self.domain_pool)}")
                logger.info(f"   domain_pool keys: {list(self.domain_pool.keys())}")
                
                if len(self.domain_pool) == 0:
                    logger.info("📍 No domains exist, creating first domain node")
                    logger.info("🏗️ Calling new_domain_node() to create full hierarchy...")
                    result = await self.new_domain_node(connection)
                    logger.info(f"─" * 80)
                    return result
                
                # Try to assign to existing domain
                logger.info(f"📍 Found {len(self.domain_pool)} existing domain(s), trying to assign...")
                for domain_id, domain_connections in self.domain_pool.items():
                    if len(domain_connections) == 0:
                        continue
                    domain_main_connection = domain_connections[0]
                    success = await self.assign_to_domain(connection, domain_id, domain_main_connection.node_id)
                    if success:
                        logger.info(f"✅ Successfully assigned to domain {domain_id}")
                        logger.info(f"─" * 80)
                        return True
                
                # All domains full, create new
                logger.info("📍 All domains full, creating new domain")
                result = await self.new_domain_node(connection)
                logger.info(f"─" * 80)
                return result
                
            elif not connection.cluster_id:
                # Has domain but no cluster - create cluster and channel
                logger.info(f"📍 Has domain_id but no cluster_id - need to create cluster/channel")
                logger.info(f"🏗️ Calling new_cluster_node() for domain {connection.domain_id}...")
                result = await self.new_cluster_node(connection, connection.domain_id)
                logger.info(f"─" * 80)
                return result
                
            elif not connection.channel_id:
                # Has domain/cluster but no channel - create channel only
                logger.info(f"📍 Has domain/cluster but no channel_id - need to create channel")
                logger.info(f"🏗️ Calling new_channel_node() for cluster {connection.cluster_id}...")
                result = await self.new_channel_node(connection, connection.domain_id, connection.cluster_id)
                logger.info(f"─" * 80)
                return result
            
            # Should not reach here
            logger.warning("⚠️ Client has full hierarchy but assign_new_client was called")
            logger.info(f"─" * 80)
            return True
            
        except Exception as e:
            logger.error(f"❌ NODEMANAGER: ERROR in assign_new_client()")
            logger.error(f"   Error: {e}")
            import traceback
            traceback.print_exc()
            logger.error(f"─" * 80)
            return False
    
    def register_c_client(self, websocket: Any, nmp_params: Dict[str, Any]) -> ClientConnection:
        """
        Register a C-Client connection with NMP parameters
        Determines node type based on main node IDs and adds to appropriate pools
        
        Args:
            websocket: WebSocket connection
            nmp_params: NMP parameters including:
                - nmp_user_id
                - nmp_username
                - nmp_node_id
                - nmp_domain_main_node_id
                - nmp_cluster_main_node_id
                - nmp_channel_main_node_id
                - nmp_domain_id
                - nmp_cluster_id
                - nmp_channel_id
        
        Returns:
            ClientConnection instance
        """
        try:
            logger.info("─" * 80)
            logger.info("📝 NODEMANAGER: register_c_client() STARTED")
            
            # Extract parameters
            node_id = nmp_params.get('nmp_node_id')
            user_id = nmp_params.get('nmp_user_id')
            username = nmp_params.get('nmp_username')
            domain_main_node_id = nmp_params.get('nmp_domain_main_node_id')
            cluster_main_node_id = nmp_params.get('nmp_cluster_main_node_id')
            channel_main_node_id = nmp_params.get('nmp_channel_main_node_id')
            domain_id = nmp_params.get('nmp_domain_id')
            cluster_id = nmp_params.get('nmp_cluster_id')
            channel_id = nmp_params.get('nmp_channel_id')
            
            logger.info(f"📋 Registering C-Client: node_id={node_id}")
            logger.info(f"📋 NMP Parameters:")
            logger.info(f"   node_id: {node_id}")
            logger.info(f"   user_id: {user_id}")
            logger.info(f"   username: {username}")
            logger.info(f"   domain_main_node_id: {domain_main_node_id}")
            logger.info(f"   cluster_main_node_id: {cluster_main_node_id}")
            logger.info(f"   channel_main_node_id: {channel_main_node_id}")
            logger.info(f"   domain_id: {domain_id}")
            logger.info(f"   cluster_id: {cluster_id}")
            logger.info(f"   channel_id: {channel_id}")
            
            # Create connection object
            connection = ClientConnection(
                websocket=websocket,
                node_id=node_id,
                user_id=user_id,
                username=username,
                domain_id=domain_id,
                cluster_id=cluster_id,
                channel_id=channel_id,
                domain_main_node_id=domain_main_node_id,
                cluster_main_node_id=cluster_main_node_id,
                channel_main_node_id=channel_main_node_id
            )
            
            logger.info("🔍 Determining node type by ID comparison...")
            
            # Determine node type by comparing node_id with main node IDs
            logger.info(f"🔍 Checking if Domain main node:")
            logger.info(f"   node_id ({node_id}) == domain_main_node_id ({domain_main_node_id})?")
            if domain_main_node_id and node_id == domain_main_node_id:
                connection.is_domain_main_node = True
                logger.info(f"  ✅ YES - Node {node_id} is a DOMAIN main node")
            else:
                logger.info(f"  ❌ NO - Not a domain main node")
            
            logger.info(f"🔍 Checking if Cluster main node:")
            logger.info(f"   node_id ({node_id}) == cluster_main_node_id ({cluster_main_node_id})?")
            if cluster_main_node_id and node_id == cluster_main_node_id:
                connection.is_cluster_main_node = True
                logger.info(f"  ✅ YES - Node {node_id} is a CLUSTER main node")
            else:
                logger.info(f"  ❌ NO - Not a cluster main node")
            
            logger.info(f"🔍 Checking if Channel main node:")
            logger.info(f"   node_id ({node_id}) == channel_main_node_id ({channel_main_node_id})?")
            if channel_main_node_id and node_id == channel_main_node_id:
                connection.is_channel_main_node = True
                logger.info(f"  ✅ YES - Node {node_id} is a CHANNEL main node")
            else:
                logger.info(f"  ❌ NO - Not a channel main node")
            
            logger.info("📦 Adding to connection pools...")
            logger.info(f"  📋 Node type: Domain={'MAIN' if connection.is_domain_main_node else 'REGULAR'}, Cluster={'MAIN' if connection.is_cluster_main_node else 'REGULAR'}, Channel={'MAIN' if connection.is_channel_main_node else 'REGULAR'}")
            
            # Add to domain pool if domain_id exists (main node or regular node)
            if domain_id:
                self.add_to_domain_pool(domain_id, connection)
                node_type = "MAIN" if connection.is_domain_main_node else "regular"
                logger.info(f"  ✅ Added {node_type} node to domain_pool[{domain_id}]")
            
            # Add to cluster pool if cluster_id exists (main node or regular node)
            if cluster_id:
                self.add_to_cluster_pool(cluster_id, connection)
                node_type = "MAIN" if connection.is_cluster_main_node else "regular"
                logger.info(f"  ✅ Added {node_type} node to cluster_pool[{cluster_id}]")
            
            # Add to channel pool if channel_id exists (main node or regular node)
            if channel_id:
                self.add_to_channel_pool(channel_id, connection)
                node_type = "MAIN" if connection.is_channel_main_node else "regular"
                logger.info(f"  ✅ Added {node_type} node to channel_pool[{channel_id}]")
            
            # If not a main node at any level, add to channel pool as regular node
            if not (connection.is_domain_main_node or connection.is_cluster_main_node or connection.is_channel_main_node):
                logger.info(f"  ℹ️ Not a main node at any level")
                if channel_id:
                    self.add_to_channel_pool(channel_id, connection)
                    logger.info(f"  ✅ Added to channel_pool[{channel_id}] as regular node")
                else:
                    logger.warning(f"  ⚠️ Regular node without channel_id, NOT added to any pool")
            
            # Display pool stats
            stats = self.get_pool_stats()
            logger.info(f"📊 Current pool stats after registration:")
            logger.info(f"   Total domains: {stats['domains']}")
            logger.info(f"   Total clusters: {stats['clusters']}")
            logger.info(f"   Total channels: {stats['channels']}")
            logger.info(f"   Total connections: {stats['total_connections']}")
            
            logger.info(f"✅ NODEMANAGER: register_c_client() COMPLETED for {node_id}")
            logger.info("─" * 80)
            return connection
            
        except Exception as e:
            logger.error(f"Error registering C-Client: {e}")
            raise
    
    # ===================== Connection Pool Management =====================
    
    def add_to_domain_pool(self, domain_id: str, connection: ClientConnection):
        """Add connection to domain pool"""
        if domain_id not in self.domain_pool:
            self.domain_pool[domain_id] = []
        
        # Check if this connection already exists in the pool
        existing_connection = None
        for existing_conn in self.domain_pool[domain_id]:
            if existing_conn.node_id == connection.node_id:
                existing_connection = existing_conn
                break
        
        if existing_connection:
            # Connection already exists, update it instead of adding duplicate
            logger.info(f"Connection for node {connection.node_id} already exists in domain pool {domain_id}, updating...")
            # Update the existing connection with new websocket and user info
            existing_connection.websocket = connection.websocket
            existing_connection.user_id = connection.user_id
            existing_connection.username = connection.username
            existing_connection.is_domain_main_node = connection.is_domain_main_node
            existing_connection.is_cluster_main_node = connection.is_cluster_main_node
            existing_connection.is_channel_main_node = connection.is_channel_main_node
            logger.info(f"Updated existing connection for node {connection.node_id} in domain pool {domain_id}")
        else:
            # New connection, add it to the pool
            self.domain_pool[domain_id].append(connection)
            connection.domain_id = domain_id
            logger.info(f"Added new connection to domain pool {domain_id}")
    
    def add_to_cluster_pool(self, cluster_id: str, connection: ClientConnection):
        """Add connection to cluster pool"""
        if cluster_id not in self.cluster_pool:
            self.cluster_pool[cluster_id] = []
        
        # Check if this connection already exists in the pool
        existing_connection = None
        for existing_conn in self.cluster_pool[cluster_id]:
            if existing_conn.node_id == connection.node_id:
                existing_connection = existing_conn
                break
        
        if existing_connection:
            # Connection already exists, update it instead of adding duplicate
            logger.info(f"Connection for node {connection.node_id} already exists in cluster pool {cluster_id}, updating...")
            # Update the existing connection with new websocket and user info
            existing_connection.websocket = connection.websocket
            existing_connection.user_id = connection.user_id
            existing_connection.username = connection.username
            existing_connection.is_domain_main_node = connection.is_domain_main_node
            existing_connection.is_cluster_main_node = connection.is_cluster_main_node
            existing_connection.is_channel_main_node = connection.is_channel_main_node
            logger.info(f"Updated existing connection for node {connection.node_id} in cluster pool {cluster_id}")
        else:
            # New connection, add it to the pool
            self.cluster_pool[cluster_id].append(connection)
            connection.cluster_id = cluster_id
            logger.info(f"Added new connection to cluster pool {cluster_id}")
    
    def add_to_channel_pool(self, channel_id: str, connection: ClientConnection):
        """Add connection to channel pool"""
        if channel_id not in self.channel_pool:
            self.channel_pool[channel_id] = []
        
        # Check if this connection already exists in the pool
        existing_connection = None
        for existing_conn in self.channel_pool[channel_id]:
            if existing_conn.node_id == connection.node_id:
                existing_connection = existing_conn
                break
        
        if existing_connection:
            # Connection already exists, update it instead of adding duplicate
            logger.info(f"Connection for node {connection.node_id} already exists in channel pool {channel_id}, updating...")
            # Update the existing connection with new websocket and user info
            existing_connection.websocket = connection.websocket
            existing_connection.user_id = connection.user_id
            existing_connection.username = connection.username
            existing_connection.is_domain_main_node = connection.is_domain_main_node
            existing_connection.is_cluster_main_node = connection.is_cluster_main_node
            existing_connection.is_channel_main_node = connection.is_channel_main_node
            logger.info(f"Updated existing connection for node {connection.node_id} in channel pool {channel_id}")
        else:
            # New connection, add it to the pool
            self.channel_pool[channel_id].append(connection)
            connection.channel_id = channel_id
            logger.info(f"Added new connection to channel pool {channel_id}")
    
    def remove_connection(self, connection: ClientConnection):
        """Remove connection from all pools"""
        # Remove from domain pool
        if connection.domain_id and connection.domain_id in self.domain_pool:
            self.domain_pool[connection.domain_id] = [
                conn for conn in self.domain_pool[connection.domain_id] 
                if conn.websocket != connection.websocket
            ]
            if not self.domain_pool[connection.domain_id]:
                del self.domain_pool[connection.domain_id]
        
        # Remove from cluster pool
        if connection.cluster_id and connection.cluster_id in self.cluster_pool:
            self.cluster_pool[connection.cluster_id] = [
                conn for conn in self.cluster_pool[connection.cluster_id] 
                if conn.websocket != connection.websocket
            ]
            if not self.cluster_pool[connection.cluster_id]:
                del self.cluster_pool[connection.cluster_id]
        
        # Remove from channel pool
        if connection.channel_id and connection.channel_id in self.channel_pool:
            self.channel_pool[connection.channel_id] = [
                conn for conn in self.channel_pool[connection.channel_id] 
                if conn.websocket != connection.websocket
            ]
            if not self.channel_pool[connection.channel_id]:
                del self.channel_pool[connection.channel_id]
        
        logger.info(f"Removed connection from all pools")
    
    # ===================== WebSocket Communication =====================
    
    async def send_to_c_client(self, connection: ClientConnection, command: Dict[str, Any]) -> Dict[str, Any]:
        """Send command to C-Client and wait for response"""
        try:
            request_id = str(uuid.uuid4())
            command['request_id'] = request_id
            
            # Create future for response
            future = asyncio.Future()
            self.pending_requests[request_id] = future
            
            # Send command
            import json
            await connection.websocket.send(json.dumps(command))
            logger.info(f"Sent command {command['type']} to C-Client with request_id: {request_id}")
            
            # Wait for response with timeout
            try:
                logger.info(f"⏳ Waiting for response (timeout: 30s)...")
                response = await asyncio.wait_for(future, timeout=30.0)
                logger.info(f"✅ Received response for {command['type']}")
                logger.info(f"📋 Response data: {response}")
                # Clean up on success
                if request_id in self.pending_requests:
                    del self.pending_requests[request_id]
                return response
            except asyncio.TimeoutError:
                logger.error(f"❌ Timeout waiting for response to {command['type']} (request_id: {request_id})")
                logger.error(f"   No response received after 30 seconds")
                logger.error(f"   Keeping request_id in pending_requests for late response handling")
                # Don't delete yet - allow late response to be processed
                return {"success": False, "error": "Timeout"}
                    
        except ConnectionClosed:
            logger.error("Connection closed while sending command")
            return {"success": False, "error": "Connection closed"}
        except Exception as e:
            logger.error(f"Error sending command: {e}")
            return {"success": False, "error": str(e)}
    
    async def handle_c_client_response(self, connection: ClientConnection, response: Dict[str, Any]):
        """Handle response from C-Client"""
        request_id = response.get('request_id')
        command_type = response.get('command_type')
        
        logger.info(f"📥 NODEMANAGER: handle_c_client_response() CALLED")
        logger.info(f"   Request ID: {request_id}")
        logger.info(f"   Command type: {command_type}")
        logger.info(f"   Success: {response.get('success')}")
        
        if request_id and request_id in self.pending_requests:
            future = self.pending_requests[request_id]
            if not future.done():
                logger.info(f"✅ Setting result for pending request {request_id}")
                future.set_result(response)
            else:
                logger.warning(f"⚠️ Future for request {request_id} already done (likely timed out)")
                logger.info(f"   Processing late response manually...")
                
                # Handle late response - process the result even though timeout occurred
                if response.get('success') and command_type:
                    await self._process_late_response(connection, command_type, response)
            
            # Clean up after handling
            del self.pending_requests[request_id]
            logger.info(f"✅ Cleaned up request_id: {request_id}")
        else:
            logger.warning(f"⚠️ No pending request found for request_id: {request_id}")
    
    async def _process_late_response(self, connection: ClientConnection, command_type: str, response: Dict[str, Any]):
        """Process a late response that arrived after timeout"""
        try:
            logger.info(f"🔄 PROCESSING LATE RESPONSE for {command_type}")
            data = response.get('data', {})
            
            if command_type == 'new_domain_node':
                domain_id = data.get('domain_id')
                if domain_id:
                    logger.info(f"   Late response: domain_id = {domain_id}")
                    connection.domain_id = domain_id
                    # Continue with cluster creation
                    logger.info(f"   Continuing to create cluster...")
                    await self.new_cluster_node(connection, domain_id)
                    
            elif command_type == 'new_cluster_node':
                cluster_id = data.get('cluster_id')
                if cluster_id:
                    logger.info(f"   Late response: cluster_id = {cluster_id}")
                    connection.cluster_id = cluster_id
                    # Continue with channel creation
                    logger.info(f"   Continuing to create channel...")
                    await self.new_channel_node(connection, connection.domain_id, cluster_id)
                    
            elif command_type == 'new_channel_node':
                channel_id = data.get('channel_id')
                if channel_id:
                    logger.info(f"   Late response: channel_id = {channel_id}")
                    connection.channel_id = channel_id
                    # Add to channel pool
                    if connection.is_channel_main_node:
                        if channel_id not in self.channel_pool:
                            self.channel_pool[channel_id] = []
                        self.channel_pool[channel_id].append(connection)
                        logger.info(f"   ✅ Added to channel_pool[{channel_id}]")
                    logger.info(f"   ✅ Full hierarchy completed via late response!")
                    
            logger.info(f"✅ Late response processed successfully")
        except Exception as e:
            logger.error(f"❌ Error processing late response: {e}")
    
    # ===================== Count Peers Methods =====================
    
    async def count_peers(self, connection: ClientConnection, domain_id: Optional[str] = None, 
                         cluster_id: Optional[str] = None, channel_id: Optional[str] = None) -> int:
        """Count peers at specified level"""
        try:
            command = {
                "type": "count_peers_amount",
                "data": {
                    "domain_id": domain_id,
                    "cluster_id": cluster_id,
                    "channel_id": channel_id
                }
            }
            
            response = await self.send_to_c_client(connection, command)
            
            if response.get("success"):
                return response.get("data", {}).get("count", 0)
            else:
                logger.error(f"Failed to count peers: {response.get('error')}")
                return 0
                
        except Exception as e:
            logger.error(f"Error in count_peers: {e}")
            return 0
    
    # ===================== Assign To Methods =====================
    
    async def assign_to_channel(self, connection: ClientConnection, channel_id: str, 
                               channel_node_id: str) -> bool:
        """Assign C-Client to channel"""
        try:
            # Get channel pool object (should exist even if main node is offline)
            channel_connections = self.channel_pool.get(channel_id, [])
            
            # Try to count peers through ANY connection in the pool (main node or regular node)
            node_count = 0
            if channel_connections:
                logger.info(f"📊 Channel pool has {len(channel_connections)} connection(s)")
                logger.info(f"   → Attempting to count peers through available connections...")
                
                # Try to count through any available connection
                count_success = False
                for conn in channel_connections:
                    try:
                        node_count = await self.count_peers(conn, None, None, None)
                        logger.info(f"✅ Successfully counted peers through node {conn.node_id}: {node_count} nodes")
                        count_success = True
                        break
                    except Exception as e:
                        logger.warning(f"⚠️ Failed to count through node {conn.node_id}: {e}")
                        continue
                
                if count_success:
                    if node_count >= 1000:
                        logger.info(f"❌ Channel {channel_id} is full ({node_count} nodes)")
                        return False
                    else:
                        logger.info(f"✅ Channel {channel_id} has capacity ({node_count} < 1000)")
                else:
                    logger.warning(f"⚠️ All connections failed to count peers, proceeding with assignment anyway")
            else:
                logger.info(f"⚠️ Channel pool {channel_id} is empty (no connections)")
                logger.info(f"   → Skipping peer count, directly assigning (assuming available)")
            
            # Send assignToChannel command
            command = {
                "type": "assign_to_channel",
                "data": {
                    "channel_id": channel_id,
                    "node_id": connection.node_id
                }
            }
            
            response = await self.send_to_c_client(connection, command)
            
            if response.get("success"):
                # Add to channel pool
                self.add_to_channel_pool(channel_id, connection)
                
                # Notify all channel nodes about new peer
                await self.add_new_node_to_peers(
                    response.get("data", {}).get("domain_id"),
                    response.get("data", {}).get("cluster_id"),
                    channel_id,
                    connection.node_id
                )
                
                logger.info(f"✅ Successfully assigned {connection.node_id} to channel {channel_id}")
                return True
            else:
                logger.error(f"❌ Failed to assign to channel: {response.get('error')}")
                return False
                
        except Exception as e:
            logger.error(f"❌ Error in assign_to_channel: {e}")
            return False
    
    async def assign_to_cluster(self, connection: ClientConnection, cluster_id: str, 
                               cluster_node_id: str) -> bool:
        """Assign C-Client to cluster"""
        try:
            # Get cluster pool object (should exist even if main node is offline)
            cluster_connections = self.cluster_pool.get(cluster_id, [])
            
            # Try to count peers through ANY connection in the pool (main node or regular node)
            channel_count = 0
            if cluster_connections:
                logger.info(f"📊 Cluster pool has {len(cluster_connections)} connection(s)")
                logger.info(f"   → Attempting to count peers through available connections...")
                
                # Try to count through any available connection
                count_success = False
                for conn in cluster_connections:
                    try:
                        channel_count = await self.count_peers(conn, None, cluster_id, None)
                        logger.info(f"✅ Successfully counted peers through node {conn.node_id}: {channel_count} channels")
                        count_success = True
                        break
                    except Exception as e:
                        logger.warning(f"⚠️ Failed to count through node {conn.node_id}: {e}")
                        continue
                
                if count_success:
                    if channel_count >= 1000:
                        logger.info(f"❌ Cluster {cluster_id} is full ({channel_count} channels)")
                        return False
                    else:
                        logger.info(f"✅ Cluster {cluster_id} has capacity ({channel_count} < 1000)")
                else:
                    logger.warning(f"⚠️ All connections failed to count peers, proceeding with assignment anyway")
            else:
                logger.info(f"⚠️ Cluster pool {cluster_id} is empty (no connections)")
                logger.info(f"   → Skipping peer count, directly assigning (assuming available)")
            
            # Send assignToCluster command
            command = {
                "type": "assign_to_cluster",
                "data": {
                    "cluster_id": cluster_id,
                    "node_id": connection.node_id
                }
            }
            
            response = await self.send_to_c_client(connection, command)
            
            if response.get("success"):
                # Add to cluster pool
                self.add_to_cluster_pool(cluster_id, connection)
                
                # Try to assign to existing channel
                for channel_connection in self.cluster_pool.get(cluster_id, []):
                    if channel_connection.channel_id:
                        if await self.assign_to_channel(connection, channel_connection.channel_id, 
                                                       channel_connection.node_id):
                            return True
                
                # No available channel, create new one
                domain_id = response.get("data", {}).get("domain_id")
                if domain_id:
                    await self.new_channel_node(connection, domain_id, cluster_id)
                    # Assign to own channel
                    if connection.channel_id:
                        return await self.assign_to_channel(connection, connection.channel_id, 
                                                          connection.node_id)
                
                logger.info(f"✅ Successfully assigned {connection.node_id} to cluster {cluster_id}")
                return True
            else:
                logger.error(f"❌ Failed to assign to cluster: {response.get('error')}")
                return False
                
        except Exception as e:
            logger.error(f"❌ Error in assign_to_cluster: {e}")
            return False
    
    async def assign_to_domain(self, connection: ClientConnection, domain_id: str, 
                              domain_node_id: str) -> bool:
        """Assign C-Client to domain"""
        try:
            # Get domain pool object (should exist even if main node is offline)
            domain_connections = self.domain_pool.get(domain_id, [])
            
            # Try to count peers through ANY connection in the pool (main node or regular node)
            cluster_count = 0
            if domain_connections:
                logger.info(f"📊 Domain pool has {len(domain_connections)} connection(s)")
                logger.info(f"   → Attempting to count peers through available connections...")
                
                # Try to count through any available connection
                count_success = False
                for conn in domain_connections:
                    try:
                        cluster_count = await self.count_peers(conn, domain_id, None, None)
                        logger.info(f"✅ Successfully counted peers through node {conn.node_id}: {cluster_count} clusters")
                        count_success = True
                        break
                    except Exception as e:
                        logger.warning(f"⚠️ Failed to count through node {conn.node_id}: {e}")
                        continue
                
                if count_success:
                    if cluster_count >= 1000:
                        logger.info(f"❌ Domain {domain_id} is full ({cluster_count} clusters)")
                        return False
                    else:
                        logger.info(f"✅ Domain {domain_id} has capacity ({cluster_count} < 1000)")
                else:
                    logger.warning(f"⚠️ All connections failed to count peers, proceeding with assignment anyway")
            else:
                logger.info(f"⚠️ Domain pool {domain_id} is empty (no connections)")
                logger.info(f"   → Skipping peer count, directly assigning (assuming available)")
            
            # Send assignToDomain command
            command = {
                "type": "assign_to_domain",
                "data": {
                    "domain_id": domain_id,
                    "node_id": connection.node_id
                }
            }
            
            response = await self.send_to_c_client(connection, command)
            
            if response.get("success"):
                # Add to domain pool
                self.add_to_domain_pool(domain_id, connection)
                
                # Try to assign to existing cluster
                for cluster_connection in self.domain_pool.get(domain_id, []):
                    if cluster_connection.cluster_id:
                        if await self.assign_to_cluster(connection, cluster_connection.cluster_id, 
                                                       cluster_connection.node_id):
                            return True
                
                # No available cluster, create new one
                if domain_id:
                    await self.new_cluster_node(connection, domain_id)
                    # Assign to own cluster
                    if connection.cluster_id:
                        return await self.assign_to_cluster(connection, connection.cluster_id, 
                                                          connection.node_id)
                
                logger.info(f"✅ Successfully assigned {connection.node_id} to domain {domain_id}")
                return True
            else:
                logger.error(f"❌ Failed to assign to domain: {response.get('error')}")
                return False
                
        except Exception as e:
            logger.error(f"❌ Error in assign_to_domain: {e}")
            return False
    
    # ===================== New Node Methods =====================
    
    async def new_channel_node(self, connection: ClientConnection, domain_id: str, 
                              cluster_id: str) -> bool:
        """Create new channel node (final level)"""
        try:
            logger.info(f"🏗️ Creating new channel node for {connection.node_id} in cluster {cluster_id}")
            
            command = {
                "type": "new_channel_node",
                "data": {
                    "domain_id": domain_id,
                    "cluster_id": cluster_id
                }
            }
            
            response = await self.send_to_c_client(connection, command)
            
            if not response.get("success"):
                logger.error(f"Failed to create channel node: {response.get('error')}")
                return False
            
            # Get channel_id from response
            channel_id = response.get("data", {}).get("channel_id")
            if not channel_id:
                logger.error("No channel_id in response")
                return False
            
            # Update connection
            connection.channel_id = channel_id
            connection.is_channel_main_node = True
            
            # Add to channel pool
            self.add_to_channel_pool(channel_id, connection)
            logger.info(f"✅ Created channel node: {channel_id}")
            logger.info(f"🎉 Full node hierarchy completed for {connection.node_id}")
            logger.info(f"   Domain: {domain_id}")
            logger.info(f"   Cluster: {cluster_id}")
            logger.info(f"   Channel: {channel_id}")
            
            return True
                
        except Exception as e:
            logger.error(f"Error in new_channel_node: {e}")
            return False
    
    async def new_cluster_node(self, connection: ClientConnection, domain_id: str) -> bool:
        """Create new cluster node and complete hierarchy"""
        try:
            logger.info(f"🏗️ Creating new cluster node for {connection.node_id} in domain {domain_id}")
            
            # Step 1: Create cluster
            command = {
                "type": "new_cluster_node",
                "data": {
                    "domain_id": domain_id
                }
            }
            
            response = await self.send_to_c_client(connection, command)
            
            if not response.get("success"):
                logger.error(f"Failed to create cluster node: {response.get('error')}")
                return False
            
            # Get cluster_id from response
            cluster_id = response.get("data", {}).get("cluster_id")
            if not cluster_id:
                logger.error("No cluster_id in response")
                return False
            
            # Update connection
            connection.cluster_id = cluster_id
            connection.is_cluster_main_node = True
            
            # Add to cluster pool
            self.add_to_cluster_pool(cluster_id, connection)
            logger.info(f"✅ Created cluster node: {cluster_id}")
            
            # Step 2: Create channel
            logger.info(f"🏗️ Creating channel for cluster {cluster_id}")
            channel_result = await self.new_channel_node(connection, domain_id, cluster_id)
            
            if not channel_result:
                logger.warning("Failed to create channel, but cluster created successfully")
                return True  # Cluster is created, so return True
            
            logger.info(f"✅ Successfully created cluster node with full hierarchy: {cluster_id}")
            return True
                
        except Exception as e:
            logger.error(f"Error in new_cluster_node: {e}")
            return False
    
    async def new_domain_node(self, connection: ClientConnection) -> bool:
        """Create new domain node and complete hierarchy"""
        try:
            logger.info(f"🏗️ Creating new domain node for {connection.node_id}")
            
            # Step 1: Create domain
            command = {
                "type": "new_domain_node",
                "data": {}
            }
            
            response = await self.send_to_c_client(connection, command)
            
            if not response.get("success"):
                logger.error(f"Failed to create domain node: {response.get('error')}")
                return False
            
            # Get domain_id from response
            domain_id = response.get("data", {}).get("domain_id")
            if not domain_id:
                logger.error("No domain_id in response")
                return False
            
            # Update connection
            connection.domain_id = domain_id
            connection.is_domain_main_node = True
            
            # Add to domain pool
            self.add_to_domain_pool(domain_id, connection)
            logger.info(f"✅ Created domain node: {domain_id}")
            
            # Step 2: Create cluster
            logger.info(f"🏗️ Creating cluster for domain {domain_id}")
            cluster_result = await self.new_cluster_node(connection, domain_id)
            
            if not cluster_result:
                logger.warning("Failed to create cluster, but domain created successfully")
                return True  # Domain is created, so return True
            
            logger.info(f"✅ Successfully created domain node with full hierarchy: {domain_id}")
            return True
                
        except Exception as e:
            logger.error(f"Error in new_domain_node: {e}")
            return False
    
    # ===================== Add Peers Methods =====================
    
    async def add_new_node_to_peers(self, domain_id: str, cluster_id: str, 
                                   channel_id: str, node_id: str):
        """Notify all nodes in channel about new peer"""
        try:
            if channel_id not in self.channel_pool:
                logger.warning(f"Channel pool {channel_id} not found")
                return
            
            command = {
                "type": "add_new_node_to_peers",
                "data": {
                    "domain_id": domain_id,
                    "cluster_id": cluster_id,
                    "channel_id": channel_id,
                    "node_id": node_id
                }
            }
            
            # Send to all connections in channel
            tasks = []
            for connection in self.channel_pool[channel_id]:
                task = self.send_to_c_client(connection, command)
                tasks.append(task)
            
            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)
                logger.info(f"Notified {len(tasks)} nodes in channel {channel_id} about new peer {node_id}")
                
        except Exception as e:
            logger.error(f"Error in add_new_node_to_peers: {e}")
    
    async def add_new_channel_to_peers(self, domain_id: str, cluster_id: str, 
                                      channel_id: str, node_id: str):
        """Notify all nodes in cluster about new channel"""
        try:
            if cluster_id not in self.cluster_pool:
                logger.warning(f"Cluster pool {cluster_id} not found")
                return
            
            command = {
                "type": "add_new_channel_to_peers",
                "data": {
                    "domain_id": domain_id,
                    "cluster_id": cluster_id,
                    "channel_id": channel_id,
                    "node_id": node_id
                }
            }
            
            # Send to all connections in cluster
            tasks = []
            for connection in self.cluster_pool[cluster_id]:
                task = self.send_to_c_client(connection, command)
                tasks.append(task)
            
            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)
                logger.info(f"Notified {len(tasks)} nodes in cluster {cluster_id} about new channel {channel_id}")
                
        except Exception as e:
            logger.error(f"Error in add_new_channel_to_peers: {e}")
    
    async def add_new_cluster_to_peers(self, domain_id: str, cluster_id: str, node_id: str):
        """Notify all nodes in domain about new cluster"""
        try:
            if domain_id not in self.domain_pool:
                logger.warning(f"Domain pool {domain_id} not found")
                return
            
            command = {
                "type": "add_new_cluster_to_peers",
                "data": {
                    "domain_id": domain_id,
                    "cluster_id": cluster_id,
                    "node_id": node_id
                }
            }
            
            # Send to all connections in domain
            tasks = []
            for connection in self.domain_pool[domain_id]:
                task = self.send_to_c_client(connection, command)
                tasks.append(task)
            
            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)
                logger.info(f"Notified {len(tasks)} nodes in domain {domain_id} about new cluster {cluster_id}")
                
        except Exception as e:
            logger.error(f"Error in add_new_cluster_to_peers: {e}")
    
    async def add_new_domain_to_peers(self, domain_id: str, node_id: str):
        """Notify all domain nodes about new domain"""
        try:
            command = {
                "type": "add_new_domain_to_peers",
                "data": {
                    "domain_id": domain_id,
                    "node_id": node_id
                }
            }
            
            # Send to all domain connections
            tasks = []
            for connections in self.domain_pool.values():
                for connection in connections:
                    task = self.send_to_c_client(connection, command)
                    tasks.append(task)
            
            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)
                logger.info(f"Notified {len(tasks)} domain nodes about new domain {domain_id}")
                
        except Exception as e:
            logger.error(f"Error in add_new_domain_to_peers: {e}")
    
    # ===================== Utility Methods =====================
    
    def get_pool_stats(self) -> Dict[str, Any]:
        """Get statistics about connection pools"""
        return {
            "domains": len(self.domain_pool),
            "clusters": len(self.cluster_pool),
            "channels": len(self.channel_pool),
            "total_connections": sum(
                len(connections) 
                for connections in self.domain_pool.values()
            ),
            "domain_details": {
                domain_id: len(connections) 
                for domain_id, connections in self.domain_pool.items()
            },
            "cluster_details": {
                cluster_id: len(connections) 
                for cluster_id, connections in self.cluster_pool.items()
            },
            "channel_details": {
                channel_id: len(connections) 
                for channel_id, connections in self.channel_pool.items()
            }
        }
    
    async def cleanup_disconnected_connections(self):
        """Clean up disconnected connections from pools"""
        disconnected_connections = []
        
        # Check all connections in all pools
        for connections in self.domain_pool.values():
            for connection in connections:
                if connection.websocket.closed:
                    disconnected_connections.append(connection)
        
        # Remove disconnected connections
        for connection in disconnected_connections:
            self.remove_connection(connection)
            logger.info(f"Removed disconnected connection: {connection.node_id}")
        
        return len(disconnected_connections)
