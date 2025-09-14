// B-Client Node Database - For storing domain_nodes data
const db = require('./initDatabase');

class NodeDatabase {
    constructor() {
        // B-Client domain nodes management
    }

    // Domain nodes management methods
    addDomainNode(domainId, nodeId = null, ipAddress = null, refreshTime = null) {
        try {
            const stmt = db.prepare(`
                INSERT OR REPLACE INTO domain_nodes (domain_id, node_id, ip_address, refresh_time)
                VALUES (?, ?, ?, ?)
            `);
            return stmt.run(domainId, nodeId, ipAddress, refreshTime || new Date().toISOString());
        } catch (error) {
            console.error('Error adding domain node:', error);
            return null;
        }
    }

    getDomainNode(domainId) {
        try {
            const stmt = db.prepare(`
                SELECT * FROM domain_nodes 
                WHERE domain_id = ?
            `);
            return stmt.get(domainId);
        } catch (error) {
            console.error('Error getting domain node:', error);
            return null;
        }
    }

    getDomainNodeByNodeId(nodeId) {
        try {
            const stmt = db.prepare(`
                SELECT * FROM domain_nodes 
                WHERE node_id = ?
            `);
            return stmt.get(nodeId);
        } catch (error) {
            console.error('Error getting domain node by node_id:', error);
            return null;
        }
    }

    updateDomainNode(domainId, nodeId = null, ipAddress = null, refreshTime = null) {
        try {
            const stmt = db.prepare(`
                UPDATE domain_nodes 
                SET node_id = COALESCE(?, node_id), 
                    ip_address = COALESCE(?, ip_address), 
                    refresh_time = ?
                WHERE domain_id = ?
            `);
            return stmt.run(nodeId, ipAddress, refreshTime || new Date().toISOString(), domainId);
        } catch (error) {
            console.error('Error updating domain node:', error);
            return null;
        }
    }

    updateDomainNodeByNodeId(nodeId, domainId = null, ipAddress = null, refreshTime = null) {
        try {
            const stmt = db.prepare(`
                UPDATE domain_nodes 
                SET domain_id = COALESCE(?, domain_id), 
                    ip_address = COALESCE(?, ip_address), 
                    refresh_time = ?
                WHERE node_id = ?
            `);
            return stmt.run(domainId, ipAddress, refreshTime || new Date().toISOString(), nodeId);
        } catch (error) {
            console.error('Error updating domain node by node_id:', error);
            return null;
        }
    }

    deleteDomainNode(domainId) {
        try {
            const stmt = db.prepare(`
                DELETE FROM domain_nodes 
                WHERE domain_id = ?
            `);
            return stmt.run(domainId);
        } catch (error) {
            console.error('Error deleting domain node:', error);
            return null;
        }
    }

    deleteDomainNodeByNodeId(nodeId) {
        try {
            const stmt = db.prepare(`
                DELETE FROM domain_nodes 
                WHERE node_id = ?
            `);
            return stmt.run(nodeId);
        } catch (error) {
            console.error('Error deleting domain node by node_id:', error);
            return null;
        }
    }

    getAllDomainNodes() {
        try {
            const stmt = db.prepare(`
                SELECT * FROM domain_nodes 
                ORDER BY refresh_time DESC
            `);
            return stmt.all();
        } catch (error) {
            console.error('Error getting all domain nodes:', error);
            return [];
        }
    }

    updateDomainNodeRefreshTime(domainId, refreshTime = null) {
        try {
            const stmt = db.prepare(`
                UPDATE domain_nodes 
                SET refresh_time = ?
                WHERE domain_id = ?
            `);
            return stmt.run(refreshTime || new Date().toISOString(), domainId);
        } catch (error) {
            console.error('Error updating domain node refresh time:', error);
            return null;
        }
    }

    // Get domain nodes by IP address
    getDomainNodesByIP(ipAddress) {
        try {
            const stmt = db.prepare(`
                SELECT * FROM domain_nodes 
                WHERE ip_address = ?
                ORDER BY refresh_time DESC
            `);
            return stmt.all(ipAddress);
        } catch (error) {
            console.error('Error getting domain nodes by IP:', error);
            return [];
        }
    }

    // Get domain nodes that need refresh (older than specified time)
    getDomainNodesNeedingRefresh(maxAgeHours = 24) {
        try {
            const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString();
            const stmt = db.prepare(`
                SELECT * FROM domain_nodes 
                WHERE refresh_time < ?
                ORDER BY refresh_time ASC
            `);
            return stmt.all(cutoffTime);
        } catch (error) {
            console.error('Error getting domain nodes needing refresh:', error);
            return [];
        }
    }

    // Clear all domain nodes
    clearAllDomainNodes() {
        try {
            const stmt = db.prepare(`DELETE FROM domain_nodes`);
            return stmt.run();
        } catch (error) {
            console.error('Error clearing all domain nodes:', error);
            return null;
        }
    }

    // Get domain nodes count
    getDomainNodesCount() {
        try {
            const stmt = db.prepare(`SELECT COUNT(*) as count FROM domain_nodes`);
            const result = stmt.get();
            return result ? result.count : 0;
        } catch (error) {
            console.error('Error getting domain nodes count:', error);
            return 0;
        }
    }

    // Additional methods for node_id based operations

    // Check if node_id exists
    nodeIdExists(nodeId) {
        try {
            const stmt = db.prepare(`
                SELECT COUNT(*) as count FROM domain_nodes 
                WHERE node_id = ?
            `);
            const result = stmt.get(nodeId);
            return result ? result.count > 0 : false;
        } catch (error) {
            console.error('Error checking if node_id exists:', error);
            return false;
        }
    }

    // Get domain nodes with node_id (exclude null node_id)
    getDomainNodesWithNodeId() {
        try {
            const stmt = db.prepare(`
                SELECT * FROM domain_nodes 
                WHERE node_id IS NOT NULL
                ORDER BY refresh_time DESC
            `);
            return stmt.all();
        } catch (error) {
            console.error('Error getting domain nodes with node_id:', error);
            return [];
        }
    }

    // Get domain nodes without node_id (null node_id)
    getDomainNodesWithoutNodeId() {
        try {
            const stmt = db.prepare(`
                SELECT * FROM domain_nodes 
                WHERE node_id IS NULL
                ORDER BY refresh_time DESC
            `);
            return stmt.all();
        } catch (error) {
            console.error('Error getting domain nodes without node_id:', error);
            return [];
        }
    }

    // Search domain nodes by partial node_id match
    searchDomainNodesByNodeId(partialNodeId) {
        try {
            const stmt = db.prepare(`
                SELECT * FROM domain_nodes 
                WHERE node_id LIKE ?
                ORDER BY refresh_time DESC
            `);
            return stmt.all(`%${partialNodeId}%`);
        } catch (error) {
            console.error('Error searching domain nodes by node_id:', error);
            return [];
        }
    }

    // Get domain nodes by multiple node_ids
    getDomainNodesByNodeIds(nodeIds) {
        try {
            if (!Array.isArray(nodeIds) || nodeIds.length === 0) {
                return [];
            }

            const placeholders = nodeIds.map(() => '?').join(',');
            const stmt = db.prepare(`
                SELECT * FROM domain_nodes 
                WHERE node_id IN (${placeholders})
                ORDER BY refresh_time DESC
            `);
            return stmt.all(...nodeIds);
        } catch (error) {
            console.error('Error getting domain nodes by node_ids:', error);
            return [];
        }
    }

    // Update node_id for existing domain node
    updateNodeId(domainId, newNodeId) {
        try {
            const stmt = db.prepare(`
                UPDATE domain_nodes 
                SET node_id = ?
                WHERE domain_id = ?
            `);
            return stmt.run(newNodeId, domainId);
        } catch (error) {
            console.error('Error updating node_id:', error);
            return null;
        }
    }
}

module.exports = NodeDatabase;
