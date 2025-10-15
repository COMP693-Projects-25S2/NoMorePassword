import os
from flask import Flask, render_template, session, redirect, url_for, request
from webapp import connect
from webapp import db
from .private_message import message_bp

# Load environment configuration from config.env file
def load_environment_config():
    """Load environment configuration from config.env file"""
    env_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'config.env')
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

from .config import B_CLIENT_WEBSOCKET_URL, B_CLIENT_API_URL, NSN_URL

app = Flask(__name__, template_folder='templates')
app.register_blueprint(message_bp)

app.secret_key = 'Example Secret Key (CHANGE THIS TO YOUR OWN SECRET KEY!)'

# Configure session cookie settings
app.config['SESSION_COOKIE_NAME'] = 'session'
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SECURE'] = False  # Set to True in production with HTTPS
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['PERMANENT_SESSION_LIFETIME'] = 3600  # 1 hour

# Configure JSON session serialization to prevent NMP parameter loss
# This ensures all session data (including NMP parameters) are properly serialized
app.config['SESSION_SERIALIZATION_FORMAT'] = 'json'
app.config['SESSION_TYPE'] = 'filesystem'
app.config['SESSION_FILE_DIR'] = '/tmp/flask_session'
app.config['SESSION_FILE_THRESHOLD'] = 500

# Additional session security and reliability settings
app.config['SESSION_COOKIE_MAX_SIZE'] = 4096  # 4KB max cookie size
app.config['SESSION_USE_SIGNER'] = True  # Sign session cookies for security


db.init_db(app, connect.dbuser, connect.dbpass, connect.dbhost, connect.dbname)
from webapp import announcement
from webapp import event
from webapp import journey
from webapp import location
from webapp import login
from webapp import profile
from webapp import user
from webapp import populate
from webapp import premium
from webapp import content_moderation
from webapp import comment_moderation
from webapp import departure_board
from webapp import appeals
from webapp import announcement
from webapp import help_requests

# Environment variables API endpoint
@app.route('/api/nsn_websocket_env')
def nsn_websocket_env():
    """Return current environment variables for B-Client and WebSocket configuration"""
    return {
        'B_CLIENT_API_URL': B_CLIENT_API_URL,
        'B_CLIENT_WEBSOCKET_URL': B_CLIENT_WEBSOCKET_URL,
        'NSN_URL': NSN_URL,
        'environment': os.getenv('NSN_ENVIRONMENT', 'local')
    }

# Global template variable injector for WebSocket connection
@app.context_processor
def inject_nmp_and_websocket_vars():
    """Inject NMP parameters and WebSocket connection variables into all templates"""
    # Check if NMP parameters are present in request
    nmp_injected = bool(request.args.get('nmp_injected') or session.get('nmp_user_id'))
    
    if nmp_injected:
        # Get NMP parameters from request args or session
        nmp_user_id = request.args.get('nmp_user_id') or session.get('nmp_user_id', '')
        nmp_username = request.args.get('nmp_username') or session.get('nmp_username', '')
        nmp_client_type = request.args.get('nmp_client_type') or session.get('nmp_client_type', '')
        nmp_timestamp = request.args.get('nmp_timestamp') or session.get('nmp_timestamp', '')
        nmp_ip_address = request.args.get('nmp_ip_address') or session.get('nmp_ip_address', '')
        nmp_port = request.args.get('nmp_port') or session.get('nmp_port', '')
        nmp_node_id = request.args.get('nmp_node_id') or session.get('nmp_node_id', '')
        nmp_domain_id = request.args.get('nmp_domain_id') or session.get('nmp_domain_id', '')
        nmp_cluster_id = request.args.get('nmp_cluster_id') or session.get('nmp_cluster_id', '')
        nmp_channel_id = request.args.get('nmp_channel_id') or session.get('nmp_channel_id', '')
        
        # B-Client configuration
        b_client_url = B_CLIENT_API_URL
        websocket_url = B_CLIENT_WEBSOCKET_URL
        has_cookie = bool(session.get('loggedin') and session.get('user_id'))
        has_node = True  # Assume node is available
        needs_registration = True  # Always allow registration
        
        return {
            'nmp_injected': True,
            'nmp_user_id': nmp_user_id,
            'nmp_username': nmp_username,
            'nmp_client_type': nmp_client_type,
            'nmp_timestamp': nmp_timestamp,
            'nmp_ip_address': nmp_ip_address,
            'nmp_port': nmp_port,
            'nmp_node_id': nmp_node_id,
            'nmp_domain_id': nmp_domain_id,
            'nmp_cluster_id': nmp_cluster_id,
            'nmp_channel_id': nmp_channel_id,
            'b_client_url': b_client_url,
            'websocket_url': websocket_url,
            'has_cookie': has_cookie,
            'has_node': has_node,
            'needs_registration': needs_registration,
            'registration_info': {
                'b_client_url': b_client_url,
                'websocket_url': websocket_url
            }
        }
    else:
        # No NMP parameters, return empty values
        return {
            'nmp_injected': False,
            'nmp_user_id': '',
            'nmp_username': '',
            'nmp_client_type': '',
            'nmp_timestamp': '',
            'nmp_ip_address': '',
            'nmp_port': '',
            'nmp_node_id': '',
            'nmp_domain_id': '',
            'nmp_cluster_id': '',
            'nmp_channel_id': '',
            'b_client_url': B_CLIENT_API_URL,
            'websocket_url': B_CLIENT_WEBSOCKET_URL,
            'has_cookie': False,
            'has_node': False,
            'needs_registration': False,
            'registration_info': {
                'b_client_url': B_CLIENT_API_URL,
                'websocket_url': B_CLIENT_WEBSOCKET_URL
            }
        }


