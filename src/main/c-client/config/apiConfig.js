// C-Client API Configuration
const fs = require('fs');
const path = require('path');

// Load configuration from config.json
function loadConfig() {
    try {
        const configPath = path.join(__dirname, '../config.json');
        if (fs.existsSync(configPath)) {
            const configData = fs.readFileSync(configPath, 'utf8');
            return JSON.parse(configData);
        }
    } catch (error) {
        console.warn('Failed to load config.json, using defaults:', error.message);
    }
    return null;
}

const configData = loadConfig();

const config = {
    // Current environment configuration
    currentEnvironment: process.env.C_CLIENT_ENVIRONMENT || 'local', // 'local' or 'production'

    // B-Client API configurations
    bClientApi: {
        // Local development B-Client
        local: {
            url: 'http://localhost:3000',
            port: 3000,
            name: 'B-Client (Local Development)'
        },
        // Production B-Client (if needed)
        production: {
            url: 'http://localhost:3000', // Fixed port for B-Client
            port: 3000,
            name: 'B-Client (Production)'
        }
    },

    // NSN website configurations - loaded from config.json
    nsnWebsites: {
        // Local development NSN server
        local: {
            url: configData?.nmp_cooperative_website?.local?.url || 'http://localhost:5000',
            host: configData?.nmp_cooperative_website?.local?.host || 'localhost',
            port: configData?.nmp_cooperative_website?.local?.port || 5000,
            name: configData?.nmp_cooperative_website?.local?.name || 'NSN (Local Development)',
            domain: 'localhost:5000'
        },
        // Production NSN server
        production: {
            url: configData?.nmp_cooperative_website?.production?.url || 'https://comp693nsnproject.pythonanywhere.com',
            host: configData?.nmp_cooperative_website?.production?.host || 'comp693nsnproject.pythonanywhere.com',
            port: configData?.nmp_cooperative_website?.production?.port || 443,
            name: configData?.nmp_cooperative_website?.production?.name || 'NSN (Production)',
            domain: 'comp693nsnproject.pythonanywhere.com'
        }
    },

    // Get current B-Client API configuration
    getCurrentBClientApi: function () {
        // Re-read environment variable in case it was updated
        const currentEnv = process.env.C_CLIENT_ENVIRONMENT || this.currentEnvironment;
        return this.bClientApi[currentEnv] || this.bClientApi.local;
    },

    // Get current NSN website configuration
    getCurrentNsnWebsite: function () {
        // Re-read environment variable in case it was updated
        const currentEnv = process.env.C_CLIENT_ENVIRONMENT || this.currentEnvironment;
        return this.nsnWebsites[currentEnv] || this.nsnWebsites.local;
    },

    // Set current environment
    setCurrentEnvironment: function (environment) {
        if (['local', 'production'].includes(environment)) {
            this.currentEnvironment = environment;
            process.env.C_CLIENT_ENVIRONMENT = environment; // Also update environment variable
            return true;
        }
        return false;
    },

    // Get NSN host
    getNsnHost: function () {
        const currentNsn = this.getCurrentNsnWebsite();
        return currentNsn.host || 'localhost';
    },

    // Get NSN port
    getNsnPort: function () {
        const currentNsn = this.getCurrentNsnWebsite();
        return currentNsn.port || 5000;
    },

    // Get NSN URL
    getNsnUrl: function () {
        const currentNsn = this.getCurrentNsnWebsite();
        return currentNsn.url || 'http://localhost:5000';
    }
};

module.exports = config;
