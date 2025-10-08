"""
B-Client Sync Manager
Manages user activity history synchronization between C-clients
"""

import asyncio
import json
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from uuid import uuid4

# 导入日志系统
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from utils.logger import get_bclient_logger


class SyncManager:
    """B-Client Sync Manager for user activity synchronization"""
    
    def __init__(self, websocket_client, node_manager):
        """
        Initialize Sync Manager
        
        Args:
            websocket_client: WebSocket client instance for communication
            node_manager: NodeManager instance for connection management
        """
        self.websocket_client = websocket_client
        self.node_manager = node_manager
        self.logger = get_bclient_logger('sync_manager')
        
        # Track pending batches for feedback
        self.pending_batches: Dict[str, Dict] = {}
        
        self.logger.info("SyncManager initialized")
    
    async def handle_user_activities_batch(self, websocket, batch_data: Dict) -> None:
        """
        Handle incoming user activities batch from C-client
        
        Args:
            websocket: Source WebSocket connection
            batch_data: Batch data containing activities
        """
        try:
            batch_id = batch_data.get('batch_id')
            user_id = batch_data.get('user_id')
            # 只支持新的数据格式：sync_data
            activities = batch_data.get('sync_data', [])
            batch_timestamp = batch_data.get('timestamp', 'N/A')
            
            self.logger.info(f"🔄 [SyncManager] ===== RECEIVED USER ACTIVITIES BATCH =====")
            self.logger.info(f"📦 [SyncManager] Batch ID: {batch_id}")
            self.logger.info(f"👤 [SyncManager] User ID: {user_id}")
            self.logger.info(f"📊 [SyncManager] Activities Count: {len(activities)}")
            self.logger.info(f"⏰ [SyncManager] Batch Timestamp: {batch_timestamp}")
            self.logger.info(f"🔗 [SyncManager] Source WebSocket: {id(websocket)}")
            
            # Log sample activities for debugging
            if activities:
                self.logger.info(f"📝 [SyncManager] Sample activities:")
                for i, activity in enumerate(activities[:3]):  # Show first 3 activities
                    self.logger.info(f"   Activity {i+1}: {activity.get('title', 'No title')} - {activity.get('url', 'No URL')}")
                if len(activities) > 3:
                    self.logger.info(f"   ... and {len(activities) - 3} more activities")
            
            # Store batch info for feedback tracking
            self.pending_batches[batch_id] = {
                'source_websocket': websocket,
                'user_id': user_id,
                'batch_data': batch_data,
                'timestamp': datetime.utcnow(),
                'forwarded_count': 0,
                'feedback_received': 0
            }
            
            self.logger.info(f"💾 [SyncManager] Stored batch {batch_id} in pending_batches")
            self.logger.info(f"📊 [SyncManager] Total pending batches: {len(self.pending_batches)}")
            
            # Start async operations without waiting
            self.logger.info(f"🚀 [SyncManager] Starting forward process to channel nodes...")
            forward_task = asyncio.create_task(self._forward_to_channel_nodes(user_id, batch_data))
            
            # Send initial feedback to sender asynchronously (don't wait)
            self.logger.info(f"📤 [SyncManager] Sending initial feedback to sender...")
            feedback_task = asyncio.create_task(
                self._send_batch_feedback(websocket, batch_id, True, "Batch received and forwarded")
            )
            
            # Wait for forward operation to complete (but don't block feedback)
            await forward_task
            
            self.logger.info(f"✅ [SyncManager] ===== BATCH PROCESSING COMPLETED =====")
            
        except Exception as e:
            self.logger.error(f"❌ [SyncManager] Error handling user activities batch: {e}")
            # Send error feedback
            await self._send_batch_feedback(websocket, batch_id, False, str(e))
    
    async def handle_batch_feedback(self, websocket, feedback_data: Dict) -> None:
        """
        Handle feedback from C-client about batch processing
        
        Args:
            websocket: Source WebSocket connection
            feedback_data: Feedback data
        """
        try:
            batch_id = feedback_data.get('batch_id')
            success = feedback_data.get('success', False)
            message = feedback_data.get('message', '')
            timestamp = feedback_data.get('timestamp', 'N/A')
            
            self.logger.info(f"📨 [SyncManager] ===== RECEIVED BATCH FEEDBACK =====")
            self.logger.info(f"📦 [SyncManager] Batch ID: {batch_id}")
            self.logger.info(f"✅ [SyncManager] Success: {success}")
            self.logger.info(f"💬 [SyncManager] Message: {message}")
            self.logger.info(f"⏰ [SyncManager] Timestamp: {timestamp}")
            self.logger.info(f"🔗 [SyncManager] Source WebSocket: {id(websocket)}")
            
            if batch_id in self.pending_batches:
                batch_info = self.pending_batches[batch_id]
                batch_info['feedback_received'] += 1
                
                # Check if all expected feedback has been received
                expected_feedback = batch_info['forwarded_count']
                received_feedback = batch_info['feedback_received']
                user_id = batch_info.get('user_id', 'unknown')
                
                self.logger.info(f"📊 [SyncManager] ===== FEEDBACK PROGRESS =====")
                self.logger.info(f"📦 [SyncManager] Batch: {batch_id}")
                self.logger.info(f"👤 [SyncManager] User: {user_id}")
                self.logger.info(f"📈 [SyncManager] Progress: {received_feedback}/{expected_feedback} feedback received")
                self.logger.info(f"⏱️ [SyncManager] Processing time: {datetime.utcnow() - batch_info['timestamp']}")
                
                # Log individual feedback status
                status_icon = "✅" if success else "❌"
                self.logger.info(f"{status_icon} [SyncManager] Node feedback: {message}")
                
                # Clean up if all feedback received
                if received_feedback >= expected_feedback:
                    self.logger.info(f"🎉 [SyncManager] ===== BATCH COMPLETED =====")
                    self.logger.info(f"📦 [SyncManager] Batch ID: {batch_id}")
                    self.logger.info(f"👤 [SyncManager] User ID: {user_id}")
                    self.logger.info(f"✅ [SyncManager] Total successful feedback: {received_feedback}")
                    self.logger.info(f"⏱️ [SyncManager] Total processing time: {datetime.utcnow() - batch_info['timestamp']}")
                    
                    del self.pending_batches[batch_id]
                    self.logger.info(f"🧹 [SyncManager] Cleaned up completed batch {batch_id}")
                    self.logger.info(f"📊 [SyncManager] Remaining pending batches: {len(self.pending_batches)}")
                else:
                    remaining = expected_feedback - received_feedback
                    self.logger.info(f"⏳ [SyncManager] Waiting for {remaining} more feedback responses...")
            else:
                self.logger.warning(f"⚠️ [SyncManager] Received feedback for unknown batch: {batch_id}")
                self.logger.warning(f"📊 [SyncManager] Current pending batches: {list(self.pending_batches.keys())}")
            
        except Exception as e:
            self.logger.error(f"❌ [SyncManager] Error handling batch feedback: {e}")
    
    async def _forward_to_channel_nodes(self, user_id: str, batch_data: Dict) -> None:
        """
        Forward batch data to all nodes in the same channel
        
        Args:
            user_id: User ID to find channel nodes
            batch_data: Batch data to forward
        """
        try:
            batch_id = batch_data.get('batch_id')
            
            self.logger.info(f"🔍 [SyncManager] ===== FINDING USER CONNECTION =====")
            self.logger.info(f"👤 [SyncManager] Searching for user: {user_id}")
            
            # Find the user's connection to get channel information
            user_connection = None
            for domain_id, connections in self.node_manager.domain_pool.items():
                self.logger.debug(f"🔍 [SyncManager] Checking domain {domain_id} with {len(connections)} connections")
                for conn in connections:
                    if conn.user_id == user_id:
                        user_connection = conn
                        self.logger.info(f"✅ [SyncManager] Found user connection in domain {domain_id}")
                        self.logger.info(f"📊 [SyncManager] Connection details: node_id={conn.node_id}, channel_id={conn.channel_id}")
                        break
                if user_connection:
                    break
            
            if not user_connection:
                self.logger.warning(f"⚠️ [SyncManager] No connection found for user {user_id}")
                return
            
            channel_id = user_connection.channel_id
            if not channel_id:
                self.logger.warning(f"⚠️ [SyncManager] No channel_id found for user {user_id}")
                return
            
            self.logger.info(f"🎯 [SyncManager] Target channel: {channel_id}")
            
            # Get all connections in the same channel
            channel_connections = self.node_manager.channel_pool.get(channel_id, [])
            
            self.logger.info(f"📡 [SyncManager] ===== CHANNEL NODES DISCOVERY =====")
            self.logger.info(f"🎯 [SyncManager] Channel {channel_id} has {len(channel_connections)} total connections")
            
            # Log all connections in the channel
            for i, conn in enumerate(channel_connections):
                is_sender = conn.user_id == user_id
                self.logger.info(f"   Node {i+1}: user_id={conn.user_id}, node_id={conn.node_id} {'(SENDER - will skip)' if is_sender else ''}")
            
            # Forward to all nodes in the channel (excluding the sender)
            self.logger.info(f"🚀 [SyncManager] ===== STARTING FORWARD PROCESS =====")
            forwarded_count = 0
            failed_count = 0
            
            for i, conn in enumerate(channel_connections):
                if conn.user_id != user_id and conn.websocket:  # Exclude sender
                    self.logger.info(f"📤 [SyncManager] Forwarding to node {i+1}: {conn.user_id} (node_id: {conn.node_id})")
                    try:
                        # 直接转发batch_data（已经是新格式）
                        await self._send_to_node(conn.websocket, batch_data)
                        forwarded_count += 1
                        self.logger.info(f"✅ [SyncManager] Successfully forwarded to node {conn.user_id}")
                    except Exception as e:
                        failed_count += 1
                        self.logger.error(f"❌ [SyncManager] Failed to forward to node {conn.node_id}: {e}")
                elif conn.user_id == user_id:
                    self.logger.info(f"⏭️ [SyncManager] Skipping sender node: {conn.user_id}")
                elif not conn.websocket:
                    self.logger.warning(f"⚠️ [SyncManager] Node {conn.user_id} has no WebSocket connection")
            
            # Update pending batch info
            if batch_id in self.pending_batches:
                self.pending_batches[batch_id]['forwarded_count'] = forwarded_count
            
            self.logger.info(f"📊 [SyncManager] ===== FORWARD SUMMARY =====")
            self.logger.info(f"✅ [SyncManager] Successfully forwarded to: {forwarded_count} nodes")
            self.logger.info(f"❌ [SyncManager] Failed to forward to: {failed_count} nodes")
            self.logger.info(f"⏭️ [SyncManager] Sender excluded: 1 node")
            self.logger.info(f"📦 [SyncManager] Batch ID: {batch_id}")
            
        except Exception as e:
            self.logger.error(f"❌ [SyncManager] Error forwarding to channel nodes: {e}")
    
    async def _send_to_node(self, websocket, batch_data: Dict) -> None:
        """
        Send batch data to a specific node
        
        Args:
            websocket: Target WebSocket connection
            batch_data: Batch data to send (format: {user_id, batch_id, sync_data: [activities]})
        """
        try:
            batch_id = batch_data.get('batch_id')
            user_id = batch_data.get('user_id')
            sync_data = batch_data.get('sync_data', [])
            activities_count = len(sync_data)
            
            self.logger.info(f"📤 [SyncManager] Preparing to send batch {batch_id} to node")
            self.logger.info(f"📊 [SyncManager] Batch contains {activities_count} activities for user {user_id}")
            self.logger.info(f"📋 [SyncManager] Sync data type: {type(sync_data)}")
            self.logger.info(f"📋 [SyncManager] Sync data length: {len(sync_data) if sync_data else 0}")
            
            # 转发时保持相同的格式：{user_id, batch_id, sync_data: [activities]}
            forward_data = {
                'user_id': user_id,
                'batch_id': batch_id,
                'sync_data': sync_data
            }
            
            self.logger.info(f"📤 [SyncManager] Forward data created: {forward_data.keys()}")
            self.logger.info(f"📤 [SyncManager] Forward sync_data length: {len(forward_data.get('sync_data', []))}")
            
            message = {
                'type': 'user_activities_batch_forward',
                'data': forward_data
            }
            
            # Log message size for performance monitoring
            message_str = json.dumps(message)
            message_size = len(message_str.encode('utf-8'))
            self.logger.debug(f"📏 [SyncManager] Message size: {message_size} bytes")
            
            await websocket.send(message_str)
            self.logger.debug(f"✅ [SyncManager] Successfully sent batch {batch_id} to node (WebSocket ID: {id(websocket)})")
            
        except Exception as e:
            batch_id = batch_data.get('batch_id', 'unknown')
            self.logger.error(f"❌ [SyncManager] Error sending batch {batch_id} to node: {e}")
            self.logger.error(f"🔗 [SyncManager] WebSocket ID: {id(websocket)}")
            raise
    
    async def _send_batch_feedback(self, websocket, batch_id: str, success: bool, message: str) -> None:
        """
        Send feedback to C-client about batch processing
        
        Args:
            websocket: Target WebSocket connection
            batch_id: Batch ID
            success: Success status
            message: Feedback message
        """
        try:
            status_icon = "✅" if success else "❌"
            self.logger.info(f"📤 [SyncManager] ===== SENDING BATCH FEEDBACK =====")
            self.logger.info(f"📦 [SyncManager] Batch ID: {batch_id}")
            self.logger.info(f"{status_icon} [SyncManager] Success: {success}")
            self.logger.info(f"💬 [SyncManager] Message: {message}")
            self.logger.info(f"🔗 [SyncManager] Target WebSocket: {id(websocket)}")
            
            feedback_message = {
                'type': 'user_activities_batch_feedback',
                'data': {
                    'batch_id': batch_id,
                    'success': success,
                    'message': message,
                    'timestamp': datetime.utcnow().isoformat()
                }
            }
            
            # Log message size for performance monitoring
            message_str = json.dumps(feedback_message)
            message_size = len(message_str.encode('utf-8'))
            self.logger.debug(f"📏 [SyncManager] Feedback message size: {message_size} bytes")
            
            await websocket.send(message_str)
            self.logger.info(f"✅ [SyncManager] Successfully sent feedback for batch {batch_id}")
            self.logger.info(f"📤 [SyncManager] ===== FEEDBACK SENT =====")
            
        except Exception as e:
            self.logger.error(f"❌ [SyncManager] Error sending batch feedback: {e}")
            self.logger.error(f"📦 [SyncManager] Batch ID: {batch_id}")
            self.logger.error(f"🔗 [SyncManager] WebSocket ID: {id(websocket)}")
    
    def get_sync_stats(self) -> Dict:
        """
        Get synchronization statistics
        
        Returns:
            Dictionary with sync statistics
        """
        self.logger.info(f"📊 [SyncManager] ===== SYNC STATISTICS =====")
        
        stats = {
            'pending_batches': len(self.pending_batches),
            'batch_details': []
        }
        
        if self.pending_batches:
            self.logger.info(f"📦 [SyncManager] Currently tracking {len(self.pending_batches)} pending batches:")
            
            for batch_id, batch_info in self.pending_batches.items():
                batch_detail = {
                    'batch_id': batch_id,
                    'user_id': batch_info['user_id'],
                    'forwarded_count': batch_info['forwarded_count'],
                    'feedback_received': batch_info['feedback_received'],
                    'timestamp': batch_info['timestamp'].isoformat(),
                    'processing_time': str(datetime.utcnow() - batch_info['timestamp'])
                }
                stats['batch_details'].append(batch_detail)
                
                # Log individual batch status
                progress = f"{batch_info['feedback_received']}/{batch_info['forwarded_count']}"
                self.logger.info(f"   📦 {batch_id[:8]}... | User: {batch_info['user_id'][:8]}... | Progress: {progress} | Time: {batch_detail['processing_time']}")
        else:
            self.logger.info(f"✅ [SyncManager] No pending batches - all sync operations completed")
        
        self.logger.info(f"📊 [SyncManager] ===== END SYNC STATISTICS =====")
        return stats
    
    def cleanup_old_batches(self, max_age_hours: int = 24) -> None:
        """
        Clean up old pending batches
        
        Args:
            max_age_hours: Maximum age in hours before cleanup
        """
        
        self.logger.info(f"🧹 [SyncManager] ===== CLEANING UP OLD BATCHES =====")
        self.logger.info(f"⏰ [SyncManager] Max age threshold: {max_age_hours} hours")
        
        cutoff_time = datetime.utcnow() - timedelta(hours=max_age_hours)
        old_batches = []
        
        self.logger.info(f"🔍 [SyncManager] Checking {len(self.pending_batches)} pending batches for age...")
        
        for batch_id, batch_info in self.pending_batches.items():
            batch_age = datetime.utcnow() - batch_info['timestamp']
            age_hours = batch_age.total_seconds() / 3600
            
            if batch_info['timestamp'] < cutoff_time:
                old_batches.append(batch_id)
                self.logger.info(f"⏰ [SyncManager] Old batch found: {batch_id[:8]}... (age: {age_hours:.1f} hours)")
            else:
                self.logger.debug(f"✅ [SyncManager] Batch still fresh: {batch_id[:8]}... (age: {age_hours:.1f} hours)")
        
        if old_batches:
            self.logger.info(f"🗑️ [SyncManager] Cleaning up {len(old_batches)} old batches...")
            for batch_id in old_batches:
                batch_info = self.pending_batches[batch_id]
                user_id = batch_info.get('user_id', 'unknown')
                batch_age = datetime.utcnow() - batch_info['timestamp']
                
                del self.pending_batches[batch_id]
                self.logger.info(f"🗑️ [SyncManager] Cleaned up batch: {batch_id[:8]}... | User: {user_id[:8]}... | Age: {batch_age}")
            
            self.logger.info(f"✅ [SyncManager] Cleanup completed: {len(old_batches)} batches removed")
            self.logger.info(f"📊 [SyncManager] Remaining pending batches: {len(self.pending_batches)}")
        else:
            self.logger.info(f"✅ [SyncManager] No old batches found - all batches are within age limit")
        
        self.logger.info(f"🧹 [SyncManager] ===== CLEANUP COMPLETED =====")
