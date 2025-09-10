// B-Client Node Database - For storing domain_nodes data
const db = require('./initDatabase');

class NodeDatabase {
    constructor() {
        // B-Client domain nodes management
    }

    // Domain nodes management methods
    addDomainNode(domainId, ipAddress, refreshTime = null) {
        try {
            const stmt = db.prepare(`
                INSERT OR REPLACE INTO domain_nodes (domain_id, ip_address, refresh_time)
                VALUES (?, ?, ?)
            `);
            return stmt.run(domainId, ipAddress, refreshTime || new Date().toISOString());
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

    updateDomainNode(domainId, ipAddress, refreshTime = null) {
        try {
            const stmt = db.prepare(`
                UPDATE domain_nodes 
                SET ip_address = ?, refresh_time = ?
                WHERE domain_id = ?
            `);
            return stmt.run(ipAddress, refreshTime || new Date().toISOString(), domainId);
        } catch (error) {
            console.error('Error updating domain node:', error);
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
}

module.exports = NodeDatabase;
