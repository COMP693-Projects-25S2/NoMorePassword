"""
NSN Client Service
Handles all NSN API integration and communication
"""
import os
import json
import requests
import re
import time
import secrets
import string


class NSNClient:
    def __init__(self):
        self.base_url = self.get_nsn_url()
        self.session = requests.Session()
    
    def get_nsn_url(self):
        """Get NSN URL based on current environment"""
        config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'config.json')
        if os.path.exists(config_path):
            with open(config_path, 'r') as f:
                config = json.load(f)
            environment = config.get('current_environment', 'local')
        else:
            environment = 'local'
        
        if environment == 'local':
            return 'http://localhost:5000'
        else:
            return 'https://comp639nsn.pythonanywhere.com'
    
    def query_user_info(self, username):
        """Query user information from NSN"""
        try:
            url = f"{self.base_url}/api/user-info"
            data = {'username': username}
            response = self.session.post(url, json=data, timeout=30)
            
            if response.status_code == 200:
                return response.json()
            else:
                return {'success': False, 'error': f'HTTP {response.status_code}'}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def get_current_user(self, session_cookie):
        """Get current user from NSN using session cookie"""
        try:
            url = f"{self.base_url}/api/current-user"
            
            # Ensure proper cookie format
            if session_cookie and not session_cookie.startswith('session='):
                session_cookie = f"session={session_cookie}"
            
            headers = {'Cookie': session_cookie}
            response = self.session.get(url, headers=headers, timeout=30)
            
            print(f"🔍 B-Client: Current user API response status: {response.status_code}")
            print(f"🔍 B-Client: Current user API response content: {response.text[:200] if response.text else 'Empty'}")
            
            if response.status_code == 200:
                return response.json()
            else:
                return {'success': False, 'error': f'HTTP {response.status_code}'}
        except Exception as e:
            print(f"❌ B-Client: get_current_user error: {e}")
            return {'success': False, 'error': str(e)}
    
    def get_current_user_from_session(self):
        """Get current user from NSN using the same session object that was used for login"""
        try:
            url = f"{self.base_url}/api/current-user"
            response = self.session.get(url, timeout=5)
            
            print(f"🔍 B-Client: Current user API (from session) response status: {response.status_code}")
            print(f"🔍 B-Client: Current user API (from session) response content: {response.text[:200] if response.text else 'Empty'}")
            
            if response.status_code == 200:
                return response.json()
            else:
                return {'success': False, 'error': f'HTTP {response.status_code}'}
        except Exception as e:
            print(f"❌ B-Client: get_current_user_from_session error: {e}")
            return {'success': False, 'error': str(e)}
    
    def login_with_nmp(self, username, password, nmp_params):
        """Login to NSN with NMP parameters"""
        try:
            url = f"{self.base_url}/login"
            
            # Prepare login data with NMP parameters (matching original B-Client)
            data = {
                'username': username,
                'password': password
            }
            
            # Add NMP parameters if provided
            if nmp_params:
                data.update(nmp_params)
            else:
                # Add default NMP parameters like original B-Client
                data.update({
                    'nmp_bind': 'true',
                    'nmp_bind_type': 'bind',
                    'nmp_auto_refresh': 'true',
                    'nmp_client_type': 'c-client',
                    'nmp_timestamp': str(int(time.time() * 1000))
                })
            
            # Use form-encoded data like original B-Client
            print(f"🔍 B-Client: Sending login request to NSN: {url}")
            print(f"🔍 B-Client: Request data keys: {list(data.keys())}")
            print(f"🔍 B-Client: Username: {data.get('username', 'NOT_SET')}")
            print(f"🔍 B-Client: Password length: {len(data.get('password', ''))}")
            print(f"🔍 B-Client: NMP parameters: {[k for k in data.keys() if k.startswith('nmp_')]}")
            
            response = self.session.post(url, data=data, timeout=30, allow_redirects=False)
            
            print(f"🔐 NSN login response status: {response.status_code}")
            print(f"🔍 B-Client: Response headers: {dict(response.headers)}")
            print(f"🔍 B-Client: Response content length: {len(response.content) if response.content else 0}")
            
            # Extract session cookie from response headers
            session_cookie = None
            if 'set-cookie' in response.headers:
                cookies = response.headers['set-cookie']
                if isinstance(cookies, list):
                    cookies = '; '.join(cookies)
                
                # Extract session cookie
                session_match = re.search(r'session=([^;]+)', cookies)
                if session_match:
                    session_cookie = f"session={session_match.group(1)}"
                    print(f"🍪 Session cookie extracted: {session_cookie}")
            
            # NSN login success is indicated by 302 redirect or 200 with session cookie
            is_success = response.status_code == 302 or (response.status_code == 200 and session_cookie)
            
            if is_success:
                print("✅ NSN login successful, getting user info...")
                
                # Get user information from NSN using the same session object
                # This ensures the session cookie is properly maintained
                user_info = self.get_current_user_from_session()
                
                return {
                    'success': True,
                    'session_cookie': session_cookie,
                    'redirect_url': response.headers.get('Location', url),
                    'user_info': user_info
                }
            else:
                return {'success': False, 'error': f'Login failed with HTTP {response.status_code}'}
        except Exception as e:
            print(f"❌ NSN login error: {e}")
            return {'success': False, 'error': str(e)}
    
    def register_user(self, signup_data, nmp_params=None):
        """Register a new user with NSN and then login to get session"""
        try:
            print(f"🆕 NSN: ===== REGISTERING NEW USER =====")
            print(f"🆕 NSN: Signup data: {signup_data}")
            print(f"🆕 NSN: NMP params: {nmp_params}")
            
            # Generate a secure password for NMP registration
            import secrets
            import string
            
            # Generate a password that meets NSN requirements:
            # - At least 8 characters
            # - At least one uppercase letter
            # - At least one lowercase letter  
            # - At least one number
            # - At least one special character
            def generate_secure_password():
                # Define character sets
                uppercase = string.ascii_uppercase
                lowercase = string.ascii_lowercase
                digits = string.digits
                special_chars = '@#$%^&+=!'
                
                # Ensure at least one character from each required set
                password = [
                    secrets.choice(uppercase),
                    secrets.choice(lowercase),
                    secrets.choice(digits),
                    secrets.choice(special_chars)
                ]
                
                # Fill the rest with random characters from all sets
                all_chars = uppercase + lowercase + digits + special_chars
                for _ in range(4):  # Total length will be 8
                    password.append(secrets.choice(all_chars))
                
                # Shuffle the password
                secrets.SystemRandom().shuffle(password)
                return ''.join(password)
            
            generated_password = generate_secure_password()
            print(f"🔐 NSN: Generated secure password for NMP registration: {generated_password}")
            
            # Generate unique username to avoid conflicts
            import secrets
            import string
            import re
            
            base_username = signup_data.get('username')
            
            # Clean base username: remove non-alphanumeric characters
            clean_base = re.sub(r'[^A-Za-z0-9]', '', base_username)
            
            # Ensure base username doesn't exceed 16 characters (leave space for suffix)
            if len(clean_base) > 16:
                clean_base = clean_base[:16]
            
            # Generate a random suffix (4 characters: 2 letters + 2 digits)
            random_suffix = ''.join(secrets.choice(string.ascii_lowercase) for _ in range(2)) + \
                           ''.join(secrets.choice(string.digits) for _ in range(2))
            
            # Combine username, ensuring total length doesn't exceed 20 characters
            unique_username = f"{clean_base}{random_suffix}"
            
            # Final length check
            if len(unique_username) > 20:
                unique_username = unique_username[:20]
            
            print(f"🔐 NSN: Generated unique username: {unique_username}")
            print(f"🔐 NSN: Username length: {len(unique_username)}")
            print(f"🔐 NSN: Username validation: {'PASS' if re.match(r'^[A-Za-z0-9]+$', unique_username) and len(unique_username) <= 20 else 'FAIL'}")
            
            # Prepare registration data
            registration_data = {
                'username': unique_username,
                'email': signup_data.get('email'),
                'first_name': signup_data.get('first_name'),
                'last_name': signup_data.get('last_name'),
                'location': signup_data.get('location'),
                'password': generated_password,
                'confirm_password': generated_password
            }
            
            # Add NMP parameters if provided
            if nmp_params:
                registration_data.update(nmp_params)
            
            print(f"🆕 NSN: Registration data: {registration_data}")
            print(f"🆕 NSN: ===== CALLING NSN SIGNUP ENDPOINT =====")
            print(f"🆕 NSN: Signup URL: {self.base_url}/signup")
            print(f"🆕 NSN: Request method: POST")
            print(f"🆕 NSN: Request data keys: {list(registration_data.keys())}")
            print(f"🆕 NSN: NMP parameters included: {bool(nmp_params)}")
            print(f"🆕 NSN: ===== END CALLING NSN SIGNUP ENDPOINT =====")
            
            # Call NSN signup endpoint (without B-Client headers to get normal HTML response)
            signup_url = f"{self.base_url}/signup"
            
            print(f"🆕 NSN: ===== CALLING NSN SIGNUP ENDPOINT =====")
            print(f"🆕 NSN: Signup URL: {signup_url}")
            print(f"🆕 NSN: Username: {unique_username}")
            print(f"🆕 NSN: Password: {generated_password[:3]}...")
            print(f"🆕 NSN: ===== END CALLING NSN SIGNUP ENDPOINT =====")
            
            # Call NSN signup endpoint (fire and forget - don't wait for response)
            try:
                response = self.session.post(signup_url, data=registration_data, timeout=5, allow_redirects=False)
                print(f"🆕 NSN: Registration request sent (status: {response.status_code})")
            except Exception as e:
                print(f"⚠️ NSN: Registration request failed (expected): {e}")
            
            # Assume registration is successful, proceed immediately
            print("✅ NSN: Assuming registration successful, proceeding with login...")
            
            # Now login with the registered user credentials to get session
            username = unique_username  # Use the unique username
            password = generated_password  # Use the generated password
            
            print(f"🔐 NSN: Attempting to login with username: {username}")
            print(f"🔐 NSN: Login password length: {len(password)}")
            print(f"🔐 NSN: Login password preview: {password[:3]}...")
            
            # Prepare login data
            login_data = {
                'username': username,
                'password': password
            }
            
            # Add NMP parameters if provided
            if nmp_params:
                login_data.update(nmp_params)
            
            # Call NSN login endpoint
            login_url = f"{self.base_url}/login"
            login_response = self.session.post(login_url, data=login_data, timeout=30, allow_redirects=False)
            
            print(f"🔐 NSN: Login response status: {login_response.status_code}")
            print(f"🔐 NSN: Login response headers: {dict(login_response.headers)}")
            
            # Extract session cookie from login response
            session_cookie = None
            if 'set-cookie' in login_response.headers:
                cookies = login_response.headers['set-cookie']
                if isinstance(cookies, list):
                    cookies = '; '.join(cookies)
                
                # Extract session cookie
                session_match = re.search(r'session=([^;]+)', cookies)
                if session_match:
                    session_cookie = f"session={session_match.group(1)}"
                    print(f"🍪 NSN: Session cookie extracted from login: {session_cookie[:50]}...")
            
            # Check if login was successful (302 redirect or 200 with session cookie)
            if login_response.status_code == 302 or (login_response.status_code == 200 and session_cookie):
                print("✅ NSN: Login successful after registration")
                
                # Get user information to confirm login
                user_info = self.get_current_user(session_cookie)
                if user_info.get('success'):
                        print(f"✅ NSN: User info confirmed: {user_info.get('username')} (ID: {user_info.get('user_id')})")
                        
                        return {
                            'success': True,
                            'session_cookie': session_cookie,
                            'user_info': user_info,
                            'redirect_url': signup_url,
                            'generated_password': generated_password,
                            'unique_username': unique_username
                        }
                else:
                    print(f"⚠️ NSN: Login successful but user info retrieval failed: {user_info.get('error')}")
                    return {
                        'success': True,
                        'session_cookie': session_cookie,
                        'user_info': None,
                        'redirect_url': signup_url,
                        'generated_password': generated_password,
                        'unique_username': unique_username
                    }
            else:
                print(f"❌ NSN: Login failed after registration with status {login_response.status_code}")
                print(f"❌ NSN: Login response text: {login_response.text[:500]}...")
                return {'success': False, 'error': f'Signup to website failed: Login failed with HTTP {login_response.status_code}'}
                
        except Exception as e:
            print(f"❌ NSN: Registration error: {e}")
            import traceback
            traceback.print_exc()
            return {'success': False, 'error': str(e)}

