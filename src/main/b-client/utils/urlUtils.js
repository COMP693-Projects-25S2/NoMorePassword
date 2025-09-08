const { URL } = require('url');

// B-Client (Enterprise) URL utility functions
const UrlUtils = {
    /**
     * Extract domain from URL
     */
    extractDomain(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname;
        } catch (error) {
            console.error('B-Client: Failed to extract domain from URL:', url, error);
            return null;
        }
    },

    /**
     * Check if URL is valid
     */
    isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    },

    /**
     * Normalize URL
     */
    normalizeUrl(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.href;
        } catch (error) {
            console.error('B-Client: Failed to normalize URL:', url, error);
            return url;
        }
    },

    /**
     * Get URL path
     */
    getPath(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.pathname;
        } catch (error) {
            console.error('B-Client: Failed to get path from URL:', url, error);
            return '';
        }
    },

    /**
     * Get URL query parameters
     */
    getQueryParams(url) {
        try {
            const urlObj = new URL(url);
            const params = {};
            urlObj.searchParams.forEach((value, key) => {
                params[key] = value;
            });
            return params;
        } catch (error) {
            console.error('B-Client: Failed to get query params from URL:', url, error);
            return {};
        }
    },

    /**
     * Build URL with query parameters
     */
    buildUrl(baseUrl, params = {}) {
        try {
            const url = new URL(baseUrl);
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined && value !== null) {
                    url.searchParams.set(key, value);
                }
            });
            return url.href;
        } catch (error) {
            console.error('B-Client: Failed to build URL:', baseUrl, params, error);
            return baseUrl;
        }
    },

    /**
     * Check if URL is relative
     */
    isRelativeUrl(url) {
        return !url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('//');
    },

    /**
     * Resolve relative URL against base URL
     */
    resolveUrl(baseUrl, relativeUrl) {
        try {
            const base = new URL(baseUrl);
            const resolved = new URL(relativeUrl, base);
            return resolved.href;
        } catch (error) {
            console.error('B-Client: Failed to resolve URL:', baseUrl, relativeUrl, error);
            return relativeUrl;
        }
    },

    /**
     * Check if URL is same origin
     */
    isSameOrigin(url1, url2) {
        try {
            const origin1 = new URL(url1).origin;
            const origin2 = new URL(url2).origin;
            return origin1 === origin2;
        } catch (error) {
            console.error('B-Client: Failed to check same origin:', url1, url2, error);
            return false;
        }
    },

    /**
     * Get URL protocol
     */
    getProtocol(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.protocol;
        } catch (error) {
            console.error('B-Client: Failed to get protocol from URL:', url, error);
            return '';
        }
    },

    /**
     * Check if URL uses HTTPS
     */
    isHttps(url) {
        return this.getProtocol(url) === 'https:';
    },

    /**
     * Check if URL uses HTTP
     */
    isHttp(url) {
        return this.getProtocol(url) === 'http:';
    },

    /**
     * Remove query parameters from URL
     */
    removeQueryParams(url) {
        try {
            const urlObj = new URL(url);
            urlObj.search = '';
            return urlObj.href;
        } catch (error) {
            console.error('B-Client: Failed to remove query params from URL:', url, error);
            return url;
        }
    },

    /**
     * Add query parameter to URL
     */
    addQueryParam(url, key, value) {
        try {
            const urlObj = new URL(url);
            urlObj.searchParams.set(key, value);
            return urlObj.href;
        } catch (error) {
            console.error('B-Client: Failed to add query param to URL:', url, key, value, error);
            return url;
        }
    },

    /**
     * Remove query parameter from URL
     */
    removeQueryParam(url, key) {
        try {
            const urlObj = new URL(url);
            urlObj.searchParams.delete(key);
            return urlObj.href;
        } catch (error) {
            console.error('B-Client: Failed to remove query param from URL:', url, key, error);
            return url;
        }
    },

    /**
     * Check if URL has query parameter
     */
    hasQueryParam(url, key) {
        try {
            const urlObj = new URL(url);
            return urlObj.searchParams.has(key);
        } catch (error) {
            console.error('B-Client: Failed to check query param in URL:', url, key, error);
            return false;
        }
    },

    /**
     * Get query parameter value
     */
    getQueryParam(url, key) {
        try {
            const urlObj = new URL(url);
            return urlObj.searchParams.get(key);
        } catch (error) {
            console.error('B-Client: Failed to get query param from URL:', url, key, error);
            return null;
        }
    },

    /**
     * Check if URL should be excluded from history
     */
    shouldExclude(url, excludePatterns = []) {
        if (!url || !excludePatterns || excludePatterns.length === 0) {
            return false;
        }

        try {
            const urlObj = new URL(url);
            const domain = urlObj.hostname;
            const path = urlObj.pathname;

            return excludePatterns.some(pattern => {
                if (pattern.includes('*')) {
                    // Handle wildcard patterns
                    const regexPattern = pattern.replace(/\*/g, '.*');
                    const regex = new RegExp(regexPattern, 'i');
                    return regex.test(domain) || regex.test(path);
                } else {
                    // Exact match
                    return domain.includes(pattern) || path.includes(pattern);
                }
            });
        } catch (error) {
            console.error('B-Client: Failed to check URL exclusion:', url, error);
            return false;
        }
    },

    /**
     * Check if URL is history-related page
     */
    isHistoryRelatedPage(url) {
        if (!url) return false;

        try {
            const urlObj = new URL(url);
            const path = urlObj.pathname.toLowerCase();
            const hostname = urlObj.hostname.toLowerCase();

            // Check for history-related paths
            const historyPaths = [
                '/history',
                '/browsing-history',
                '/visited',
                '/recent',
                '/timeline'
            ];

            // Check for history-related hostnames
            const historyHostnames = [
                'history.google.com',
                'myactivity.google.com',
                'chrome://history',
                'about:history'
            ];

            // Check if path contains history-related keywords
            const hasHistoryPath = historyPaths.some(pathItem => path.includes(pathItem));

            // Check if hostname is history-related
            const hasHistoryHostname = historyHostnames.some(hostItem => hostname.includes(hostItem));

            return hasHistoryPath || hasHistoryHostname;
        } catch (error) {
            console.error('B-Client: Failed to check if URL is history-related:', url, error);
            return false;
        }
    },

    /**
     * Check if URL should be blocked (Enterprise-specific)
     */
    shouldBlock(url, blockedDomains) {
        if (!url || !blockedDomains || !Array.isArray(blockedDomains)) {
            return false;
        }

        try {
            const domain = this.extractDomain(url);
            if (!domain) return false;

            const domainLower = domain.toLowerCase();
            return blockedDomains.some(blockedDomain =>
                domainLower.includes(blockedDomain.toLowerCase())
            );
        } catch (error) {
            console.error('B-Client: Error checking if URL should be blocked:', url, error);
            return false;
        }
    },

    /**
     * Check if URL is enterprise-related
     */
    isEnterpriseUrl(url) {
        if (!url) return false;

        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname.toLowerCase();

            // Enterprise-related domains
            const enterpriseDomains = [
                'office.com',
                'microsoft.com',
                'google.com',
                'salesforce.com',
                'slack.com',
                'teams.microsoft.com',
                'sharepoint.com',
                'onedrive.com'
            ];

            return enterpriseDomains.some(domain => hostname.includes(domain));
        } catch (error) {
            console.error('B-Client: Failed to check if URL is enterprise-related:', url, error);
            return false;
        }
    },

    /**
     * Get URL category for enterprise analytics
     */
    getUrlCategory(url) {
        if (!url) return 'unknown';

        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname.toLowerCase();
            const path = urlObj.pathname.toLowerCase();

            // Define categories
            if (hostname.includes('google.com')) return 'search';
            if (hostname.includes('youtube.com')) return 'video';
            if (hostname.includes('github.com')) return 'development';
            if (hostname.includes('stackoverflow.com')) return 'development';
            if (hostname.includes('office.com') || hostname.includes('microsoft.com')) return 'productivity';
            if (hostname.includes('salesforce.com')) return 'crm';
            if (hostname.includes('slack.com') || hostname.includes('teams.microsoft.com')) return 'communication';
            if (hostname.includes('linkedin.com')) return 'professional';
            if (hostname.includes('amazon.com')) return 'shopping';
            if (hostname.includes('facebook.com') || hostname.includes('twitter.com')) return 'social';
            if (path.includes('/admin') || path.includes('/dashboard')) return 'administration';
            if (path.includes('/api/')) return 'api';
            if (path.includes('/login') || path.includes('/auth')) return 'authentication';

            return 'general';
        } catch (error) {
            console.error('B-Client: Failed to get URL category:', url, error);
            return 'unknown';
        }
    }
};

module.exports = UrlUtils;
