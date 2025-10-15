import os

# NSN Environment Configuration
# Environment: local, production
NSN_ENVIRONMENT = os.getenv('NSN_ENVIRONMENT', 'local')

# B-Client API URL
# Local development
B_CLIENT_API_URL = os.getenv('B_CLIENT_API_URL', 'http://localhost:3000')
B_CLIENT_WEBSOCKET_URL = os.getenv('B_CLIENT_WEBSOCKET_URL', 'ws://127.0.0.1:8766')

# NSN URL
# Local development
NSN_URL = os.getenv('NSN_URL', 'http://localhost:5000')


