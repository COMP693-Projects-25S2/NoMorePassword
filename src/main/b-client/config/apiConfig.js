// B-Client API Configuration
const config = {
    // Current environment configuration
    currentEnvironment: process.env.B_CLIENT_ENVIRONMENT || 'local', // 'local' or 'production'

    // Target website configurations
    targetWebsites: {
        // Production NSN website
        'comp639nsn.pythonanywhere.com': {
            name: 'TravelTales (NSN) - Production',
            loginUrl: 'https://comp639nsn.pythonanywhere.com/login',
            signupUrl: 'https://comp639nsn.pythonanywhere.com/signup',
            dashboardUrl: 'https://comp639nsn.pythonanywhere.com/dashboard',
            homeUrl: 'https://comp639nsn.pythonanywhere.com/',
            domain: 'comp639nsn.pythonanywhere.com'
        },

        // Local development NSN server
        'localhost:5000': {
            name: 'TravelTales (NSN) - Local Development',
            loginUrl: 'http://localhost:5000/login',
            signupUrl: 'http://localhost:5000/signup',
            dashboardUrl: 'http://localhost:5000/dashboard',
            homeUrl: 'http://localhost:5000/',
            domain: 'localhost:5000'
        },

        // Alternative local development server
        '127.0.0.1:5000': {
            name: 'TravelTales (NSN) - Local Development (127.0.0.1)',
            loginUrl: 'http://127.0.0.1:5000/login',
            signupUrl: 'http://127.0.0.1:5000/signup',
            dashboardUrl: 'http://127.0.0.1:5000/dashboard',
            homeUrl: 'http://127.0.0.1:5000/',
            domain: '127.0.0.1:5000'
        }

        // Add more target websites here as needed
        // 'example.com': {
        //     name: 'Example Website',
        //     loginUrl: 'https://example.com/login',
        //     signupUrl: 'https://example.com/signup',
        //     domain: 'example.com'
        // }
    },

    // Default configuration
    default: {
        autoRefreshHours: 24,
        cookieExpiryHours: 24,
        requestTimeout: 30000, // 30 seconds
        userAgent: 'NoMorePassword-B-Client/1.0',
        autoRefreshIntervalMinutes: 30  // Auto-refresh scheduler interval (minutes)
    },

    // API Server configuration
    server: {
        port: 3000, // Fixed port for B-Client API server
        cors: {
            origin: '*',
            methods: ['GET', 'POST', 'PUT', 'DELETE'],
            allowedHeaders: ['Content-Type', 'Authorization']
        }
    },

    // Get current environment domain
    getCurrentEnvironmentDomain: function () {
        // Re-read environment variable in case it was updated
        const currentEnv = process.env.B_CLIENT_ENVIRONMENT || this.currentEnvironment;

        if (currentEnv === 'local') {
            // Local development environment - try localhost:5000 first, then 127.0.0.1:5000
            if (this.targetWebsites['localhost:5000']) {
                return 'localhost:5000';
            } else if (this.targetWebsites['127.0.0.1:5000']) {
                return '127.0.0.1:5000';
            }
        }

        // Default to production environment
        return 'comp639nsn.pythonanywhere.com';
    },

    // Set current environment
    setCurrentEnvironment: function (environment) {
        if (['local', 'production'].includes(environment)) {
            this.currentEnvironment = environment;
            process.env.B_CLIENT_ENVIRONMENT = environment; // Also update environment variable
            console.log(`[API Config] Environment set to: ${environment}`);
            return true;
        }
        return false;
    }
};

module.exports = config;
