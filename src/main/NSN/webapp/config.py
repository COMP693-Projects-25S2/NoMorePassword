"""
NSN Web Application Configuration
"""
import os

# Environment configuration
ENVIRONMENT = os.environ.get('NSN_ENVIRONMENT', 'local')

# B-Client API configuration based on environment
if ENVIRONMENT == 'production':
    # Production environment - to be configured
    B_CLIENT_API_URL = os.environ.get('B_CLIENT_API_URL', '')
    if not B_CLIENT_API_URL:
        raise ValueError("B_CLIENT_API_URL must be set in production environment")
else:
    # Local development environment
    B_CLIENT_API_URL = os.environ.get('B_CLIENT_API_URL', 'http://localhost:3000')

print(f"NSN: Environment: {ENVIRONMENT}")
print(f"NSN: B-Client API URL: {B_CLIENT_API_URL}")
