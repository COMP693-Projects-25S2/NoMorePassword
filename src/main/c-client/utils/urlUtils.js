const { URL } = require('url');

// URL utility functions
const UrlUtils = {
    /**
     * Extract domain from URL
     */
    extractDomain(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname;
        } catch (error) {
            console.error('Failed to extract domain from URL:', url, error);
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
     * Normalize URL for history storage (removes NMP params and www prefix)
     */
    normalizeUrlForHistory(url) {
        try {
            const urlObj = new URL(url);

            // Remove NMP parameters
            const nmpParams = [
                'nmp_user_id', 'nmp_username', 'nmp_client_type',
                'nmp_timestamp', 'nmp_injected', 'nmp_client_id',
                'nmp_node_id', 'nmp_domain_id', 'nmp_cluster_id', 'nmp_channel_id'
            ];
            nmpParams.forEach(param => urlObj.searchParams.delete(param));

            // Remove www. prefix from hostname for consistency
            let hostname = urlObj.hostname.toLowerCase();
            if (hostname.startsWith('www.')) {
                hostname = hostname.substring(4);
                urlObj.hostname = hostname;
            }

            // Build pathname (remove trailing slash for consistency, except for root)
            let pathname = urlObj.pathname;
            if (pathname !== '/' && pathname.endsWith('/')) {
                pathname = pathname.slice(0, -1);
            }

            // Build clean URL with all components
            let cleanUrl = urlObj.origin + pathname;

            // Add search params if they exist
            const searchParams = urlObj.searchParams.toString();
            if (searchParams) {
                cleanUrl += '?' + searchParams;
            }

            // Add hash if it exists
            if (urlObj.hash) {
                cleanUrl += urlObj.hash;
            }

            return cleanUrl;
        } catch (error) {
            console.error('Failed to normalize URL for history:', url, error);
            return url;
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
            console.error('Failed to normalize URL:', url, error);
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
            console.error('Failed to get path from URL:', url, error);
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
            console.error('Failed to get query params from URL:', url, error);
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
            console.error('Failed to build URL:', baseUrl, params, error);
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
            console.error('Failed to resolve URL:', baseUrl, relativeUrl, error);
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
            console.error('Failed to check same origin:', url1, url2, error);
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
            console.error('Failed to get protocol from URL:', url, error);
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
            console.error('Failed to remove query params from URL:', url, error);
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
            console.error('Failed to add query param to URL:', url, key, value, error);
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
            console.error('Failed to remove query param from URL:', url, key, error);
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
            console.error('Failed to check query param in URL:', url, key, error);
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
            console.error('Failed to get query param from URL:', url, key, error);
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
            console.error('Failed to check URL exclusion:', url, error);
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
            console.error('Failed to check if URL is history-related:', url, error);
            return false;
        }
    },

    /**
     * Check if URL should be blocked
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
            console.error('Error checking if URL should be blocked:', url, error);
            return false;
        }
    }
};

module.exports = UrlUtils;