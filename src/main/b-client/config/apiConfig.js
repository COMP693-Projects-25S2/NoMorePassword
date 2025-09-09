// B-Client API Configuration
module.exports = {
    // Target website configurations
    targetWebsites: {
        'comp639nsn.pythonanywhere.com': {
            name: 'TravelTales (NSN)',
            loginUrl: 'https://comp639nsn.pythonanywhere.com/login',
            signupUrl: 'https://comp639nsn.pythonanywhere.com/signup',
            dashboardUrl: 'https://comp639nsn.pythonanywhere.com/dashboard',
            homeUrl: 'https://comp639nsn.pythonanywhere.com/',
            domain: 'comp639nsn.pythonanywhere.com'
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
        port: 3000,
        cors: {
            origin: '*',
            methods: ['GET', 'POST', 'PUT', 'DELETE'],
            allowedHeaders: ['Content-Type', 'Authorization']
        }
    }
};
