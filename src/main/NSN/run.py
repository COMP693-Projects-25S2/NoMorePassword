import socket
import os
from flask import Flask, request, make_response
from webapp import app

# Load environment configuration
def load_environment_config():
    """Load environment configuration from config.env file"""
    env_file = os.path.join(os.path.dirname(__file__), 'config.env')
    if os.path.exists(env_file):
        print(f"Loading environment configuration from {env_file}")
        with open(env_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#'):
                    if '=' in line:
                        key, value = line.split('=', 1)
                        os.environ[key] = value
                        if key == 'B_CLIENT_API_URL':
                            print(f"B-Client URL set to: {value}")
                        elif key == 'NSN_ENVIRONMENT':
                            print(f"NSN Environment set to: {value}")
    else:
        print("No config.env file found, using default configuration")

# Load environment configuration
load_environment_config()

def find_free_port():
   """Find an available port automatically"""
   with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
       s.bind(('', 0))
       s.listen(1)
       port = s.getsockname()[1]
   return port

def is_port_in_use(port):
   """Check if a specific port is already in use"""
   with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
       return s.connect_ex(('localhost', port)) == 0

@app.before_request
def handle_preflight():
   """Handle CORS preflight OPTIONS requests"""
   if request.method == "OPTIONS":
       response = make_response()
       response.headers.add("Access-Control-Allow-Origin", request.headers.get('Origin', '*'))
       response.headers.add('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin')
       response.headers.add('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD')
       response.headers.add('Access-Control-Allow-Credentials', 'true')
       response.headers.add('Access-Control-Max-Age', '0')  # Don't cache preflight results
       return response

@app.after_request
def after_request(response):
   """Add headers to prevent caching and CORS issues"""
   
   # Handle CORS headers
   origin = request.headers.get('Origin')
   if origin:
       response.headers['Access-Control-Allow-Origin'] = origin
   else:
       response.headers['Access-Control-Allow-Origin'] = '*'
   
   response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS, HEAD'
   response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With, Accept, Origin'
   response.headers['Access-Control-Allow-Credentials'] = 'true'
   response.headers['Access-Control-Max-Age'] = '0'  # Critical: Don't cache CORS policies
   
   # Prevent all types of caching that might cause "Access Denied" issues
   response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, proxy-revalidate'
   response.headers['Pragma'] = 'no-cache'
   response.headers['Expires'] = '0'
   response.headers['Surrogate-Control'] = 'no-store'
   
   # Remove security headers that might cause caching issues
   security_headers_to_remove = [
       'Strict-Transport-Security',  # Prevents HSTS caching issues
       'X-Frame-Options',
       'X-Content-Type-Options',
       'Content-Security-Policy'
   ]
   
   for header in security_headers_to_remove:
       response.headers.pop(header, None)
   
   # Tell browser this response varies by origin and request headers
   response.headers['Vary'] = 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers'
   
   # Add timestamp to prevent browser from using cached responses
   import time
   response.headers['X-Timestamp'] = str(int(time.time()))
   
   return response

if __name__ == '__main__':
   port = 5000
   
   # Check if port is available, find alternative if needed
   if is_port_in_use(port):
       print(f"Port {port} is in use, finding available port...")
       port = find_free_port()
   
   print(f"Starting server on port {port}")
   print(f"Access your app at: http://127.0.0.1:{port}")
   
   # Use 127.0.0.1 instead of localhost to avoid IPv6 issues
   # disable reloader to prevent port conflicts during development
   app.run(host='127.0.0.1', port=port, debug=True, use_reloader=False)