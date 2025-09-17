/**
 * Port Management Utility
 * Manages port allocation for C-Client and B-Client applications
 */

const net = require('net');

class PortManager {
    constructor() {
        this.cClientPorts = new Set(); // Track C-Client ports
        this.bClientPort = 3000; // Fixed B-Client port
    }

    /**
     * Check if a port is available
     * @param {number} port - Port number to check
     * @returns {Promise<boolean>} - True if port is available
     */
    async isPortAvailable(port) {
        return new Promise((resolve) => {
            const server = net.createServer();

            server.listen(port, () => {
                server.once('close', () => {
                    resolve(true);
                });
                server.close();
            });

            server.on('error', () => {
                resolve(false);
            });
        });
    }

    /**
     * Find an available port for C-Client
     * @param {number} startPort - Starting port number (default: 3001)
     * @returns {Promise<number>} - Available port number
     */
    async findAvailableCClientPort(startPort = 3001) {
        let port = startPort;
        const maxPort = startPort + 100; // Try up to 100 ports

        while (port <= maxPort) {
            // Skip B-Client fixed port
            if (port === this.bClientPort) {
                port++;
                continue;
            }

            const isAvailable = await this.isPortAvailable(port);
            if (isAvailable) {
                this.cClientPorts.add(port);
                console.log(`🔌 PortManager: Found available C-Client port: ${port}`);
                return port;
            }
            port++;
        }

        throw new Error(`No available ports found in range ${startPort}-${maxPort}`);
    }

    /**
     * Reserve B-Client port
     * @returns {Promise<number>} - B-Client port number
     */
    async reserveBClientPort() {
        const isAvailable = await this.isPortAvailable(this.bClientPort);
        if (!isAvailable) {
            throw new Error(`B-Client port ${this.bClientPort} is not available. Please stop other B-Client instances.`);
        }

        console.log(`🔌 PortManager: Reserved B-Client port: ${this.bClientPort}`);
        return this.bClientPort;
    }

    /**
     * Release a C-Client port
     * @param {number} port - Port number to release
     */
    releaseCClientPort(port) {
        this.cClientPorts.delete(port);
        console.log(`🔌 PortManager: Released C-Client port: ${port}`);
    }

    /**
     * Get B-Client fixed port
     * @returns {number} - B-Client port number
     */
    getBClientPort() {
        return this.bClientPort;
    }

    /**
     * Get all active C-Client ports
     * @returns {Array<number>} - Array of active C-Client ports
     */
    getActiveCClientPorts() {
        return Array.from(this.cClientPorts);
    }
}

module.exports = PortManager;
