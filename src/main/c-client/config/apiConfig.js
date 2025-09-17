// C-Client API Configuration
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

    // NSN website configurations
    nsnWebsites: {
        // Local development NSN server
        local: {
            url: 'http://localhost:5000',
            name: 'NSN (Local Development)',
            domain: 'localhost:5000'
        },
        // Production NSN server
        production: {
            url: 'https://comp639nsn.pythonanywhere.com',
            name: 'NSN (Production)',
            domain: 'comp639nsn.pythonanywhere.com'
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
    }
};

module.exports = config;
