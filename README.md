# No More Password - Distributed Authentication System

A comprehensive distributed authentication system that eliminates the need for traditional passwords through cluster-based verification and secure data synchronization.

##  Features

- **Passwordless Authentication**: No more remembering complex passwords
- **Distributed Architecture**: Multi-node cluster verification system
- **Real-time Synchronization**: Secure data sync across devices
- **WebSocket Communication**: Real-time communication between components
- **Cross-platform Support**: Windows, macOS, and Linux compatibility
- **Secure Data Storage**: Encrypted local database with SQLite
- **Cluster Verification**: Multi-device authentication verification

##  System Architecture

The system consists of three main components:

1. **NSN (No More Password Server)**: Web application server
2. **B-Client**: Backend service for cluster management and data synchronization
3. **C-Client**: Desktop client application for end users

##  Prerequisites

- Python 3.8+
- Node.js 18.19+ (for C-Client)
- MySQL 8.0+ (for B-Client)
- WebSocket support (for B-Client deployment)

##  Deployment Guide

### 1. NSN Deployment on PythonAnywhere

#### Step 1: Prepare the NSN Application

1. **Clone the repository**:
   ```bash
   git clone https://github.com/COMP693-Projects-25S2/NoMorePassword.git
   cd NoMorePassword/src/main/NSN
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure the application**:
   ```python
   # config.py
   import os
   
   class Config:
       SECRET_KEY = os.environ.get('SECRET_KEY') or 'your-secret-key-here'
       MYSQL_HOST = os.environ.get('MYSQL_HOST') or 'your-mysql-host'
       MYSQL_USER = os.environ.get('MYSQL_USER') or 'your-mysql-username'
       MYSQL_PASSWORD = os.environ.get('MYSQL_PASSWORD') or 'your-mysql-password'
       MYSQL_DATABASE = os.environ.get('MYSQL_DATABASE') or 'your-database-name'
       
       # Production settings
       DEBUG = False
       TESTING = False
   ```

#### Step 2: Deploy to PythonAnywhere

1. **Upload your code** to PythonAnywhere using Git or file upload
2. **Set up a virtual environment**:
   ```bash
   mkvirtualenv --python=/usr/bin/python3.8 nmp-env
   workon nmp-env
   pip install -r requirements.txt
   ```

3. **Configure environment variables** in PythonAnywhere dashboard:
   ```
   SECRET_KEY=your-secret-key-here
   MYSQL_HOST=your-mysql-host
   MYSQL_USER=your-mysql-username
   MYSQL_PASSWORD=your-mysql-password
   MYSQL_DATABASE=your-database-name
   ```

4. **Set up the web app**:
   - Source code: `/home/yourusername/NoMorePassword/src/main/NSN`
   - WSGI file: `/home/yourusername/NoMorePassword/src/main/NSN/wsgi.py`
   - Working directory: `/home/yourusername/NoMorePassword/src/main/NSN`

5. **Create the WSGI file**:
   ```python
   # wsgi.py
   import sys
   import os
   
   # Add your project directory to the Python path
   sys.path.append('/home/yourusername/NoMorePassword/src/main/NSN')
   
   from webapp import app as application
   
   if __name__ == "__main__":
       application.run()
   ```

6. **Initialize the database**:
   ```bash
   python init_db.py
   ```

#### Step 3: Configure for Production

1. **Update database configuration** in `webapp/__init__.py`:
   ```python
   app.config['MYSQL_HOST'] = 'your-mysql-host'
   app.config['MYSQL_USER'] = 'your-mysql-username'
   app.config['MYSQL_PASSWORD'] = 'your-mysql-password'
   app.config['MYSQL_DATABASE'] = 'your-database-name'
   ```

2. **Set production environment**:
   ```python
   # In your main application file
   import os
   
   if os.environ.get('FLASK_ENV') == 'production':
       app.config['DEBUG'] = False
       app.config['TESTING'] = False
   ```

### 2. B-Client Deployment on WebSocket-Supported Platform

#### Recommended Platforms:
- **Heroku** (with WebSocket add-ons)
- **Railway**
- **DigitalOcean App Platform**
- **AWS Elastic Beanstalk**
- **Google Cloud Run**

#### Step 1: Prepare B-Client for Deployment

1. **Navigate to B-Client directory**:
   ```bash
   cd src/main/b-client-new
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure for production**:
   ```python
   # config.py
   import os
   
   class ProductionConfig:
       # Database configuration (SQLite)
       DATABASE_URI = 'sqlite:///b_client_secure.db'
       
       # WebSocket configuration
       WEBSOCKET_HOST = '0.0.0.0'
       WEBSOCKET_PORT = int(os.environ.get('PORT', 3000))
       
       # NSN API configuration
       NSN_API_URL = os.environ.get('NSN_API_URL', 'https://comp693nsnproject.pythonanywhere.com')
       
       # Logging
       LOG_LEVEL = 'INFO'
   ```

#### Step 2: Deploy to Heroku (Example)

1. **Create Heroku app**:
   ```bash
   heroku create your-bclient-app
   ```

2. **Set environment variables**:
   ```bash
   heroku config:set MYSQL_HOST=your-mysql-host
   heroku config:set MYSQL_USER=your-mysql-username
   heroku config:set MYSQL_PASSWORD=your-mysql-password
   heroku config:set MYSQL_DATABASE=your-database-name
   heroku config:set NSN_API_URL=https://comp693nsnproject.pythonanywhere.com
   ```

3. **Create Procfile**:
   ```
   web: python app.py
   ```

4. **Deploy**:
   ```bash
   git add .
   git commit -m "Deploy B-Client"
   git push heroku main
   ```

#### Step 3: Configure WebSocket Support

1. **Enable WebSocket** in your platform settings
2. **Update C-Client configuration** to point to your B-Client URL
3. **Test WebSocket connection**:
   ```bash
   curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: x3JJHMbDL1EzLkh9GBhXDw==" https://nomorepassword.herokuapp.com/ws
   ```

### 3. C-Client Installation

#### Download and Install

1. **Download the installer**:
   - Visit the [Releases page](https://github.com/COMP693-Projects-25S2/NoMorePassword/releases)
   - Download `No More Password Setup 1.0.0.exe` from the latest release
   - Or download the portable version `No More Password.exe` for direct execution

2. **Installation Options**:

   **Option A: Full Installation (Recommended)**:
   - Run `No More Password Setup 1.0.0.exe`
   - Follow the installation wizard
   - Choose installation directory
   - Create desktop and start menu shortcuts
   - Complete the installation

   **Option B: Portable Version**:
   - Download `No More Password.exe` from the release
   - Place it in your desired folder
   - Run directly without installation

3. **Configure the client**:
   - Open the C-Client application
   - Go to Settings/Configuration
   - Update the following settings:
     ```
     B-Client URL: https://nomorepassword.herokuapp.com
     NSN URL: https://comp693nsnproject.pythonanywhere.com/
     Environment: Production
     ```

## ⚙️ Configuration Management

### Environment Switching

#### Method 1: Configuration File

1. **Create environment-specific config files**:
   ```python
   # config/development.py
   class DevelopmentConfig:
       DEBUG = True
       MYSQL_HOST = 'localhost'
       MYSQL_USER = 'root'
       MYSQL_PASSWORD = 'password'
       MYSQL_DATABASE = 'nmp_dev'
   
   # config/production.py
   class ProductionConfig:
       DEBUG = False
       MYSQL_HOST = os.environ.get('MYSQL_HOST')
       MYSQL_USER = os.environ.get('MYSQL_USER')
       MYSQL_PASSWORD = os.environ.get('MYSQL_PASSWORD')
       MYSQL_DATABASE = os.environ.get('MYSQL_DATABASE')
   ```

2. **Switch environments**:
   ```python
   # In your main application
   import os
   
   if os.environ.get('FLASK_ENV') == 'production':
       from config.production import ProductionConfig
       app.config.from_object(ProductionConfig)
   else:
       from config.development import DevelopmentConfig
       app.config.from_object(DevelopmentConfig)
   ```

#### Method 2: Environment Variables

1. **Set environment variables**:
   ```bash
   # Development
   export FLASK_ENV=development
   export MYSQL_HOST=localhost
   export MYSQL_USER=root
   export MYSQL_PASSWORD=password
   
   # Production
   export FLASK_ENV=production
   export MYSQL_HOST=your-production-host
   export MYSQL_USER=your-production-user
   export MYSQL_PASSWORD=your-production-password
   ```

2. **Restart the application** to apply changes

#### Method 3: Runtime Configuration

1. **Use configuration management**:
   ```python
   # config_manager.py
   class ConfigManager:
       @staticmethod
       def switch_to_production():
           app.config.update({
               'DEBUG': False,
               'MYSQL_HOST': os.environ.get('MYSQL_HOST'),
               'MYSQL_USER': os.environ.get('MYSQL_USER'),
               'MYSQL_PASSWORD': os.environ.get('MYSQL_PASSWORD'),
               'MYSQL_DATABASE': os.environ.get('MYSQL_DATABASE')
           })
   ```

2. **Call from application**:
   ```python
   from config_manager import ConfigManager
   
   # Switch to production
   ConfigManager.switch_to_production()
   ```

## 🔧 Development Setup

### Local Development

1. **Clone the repository**:
   ```bash
   git clone https://github.com/COMP693-Projects-25S2/NoMorePassword.git
   cd NoMorePassword
   ```

2. **Set up NSN**:
   ```bash
   cd src/main/NSN
   pip install -r requirements.txt
   python init_db.py
   python app.py
   ```

3. **Set up B-Client**:
   ```bash
   cd src/main/b-client-new
   pip install -r requirements.txt
   python app.py
   ```

4. **Set up C-Client**:
   ```bash
   cd src/main/c-client
   npm install
   npm start
   ```

##  Usage

### For End Users

1. **Download C-Client** from the [Releases page](https://github.com/COMP693-Projects-25S2/NoMorePassword/releases)
   - Choose between full installer or portable version
   - Full installer: `No More Password Setup 1.0.0.exe` (recommended)
   - Portable version: `No More Password.exe` (no installation required)

2. **Install and configure** the application:
   - Run the installer or portable executable
   - Configure B-Client and NSN URLs in settings
   - Register a new account or login with existing credentials

3. **Start using** the application:
   - Your browsing activities will be automatically synchronized across devices
   - Enjoy passwordless authentication through cluster verification

### For Administrators

1. **Deploy NSN** to PythonAnywhere
2. **Deploy B-Client** to a WebSocket-supported platform
3. **Configure database connections** and environment variables
4. **Monitor system health** through the B-Client dashboard

##  Security Features

- **Encrypted Data Storage**: All local data is encrypted using SQLite encryption
- **Secure Communication**: WebSocket connections use TLS encryption
- **Cluster Verification**: Multi-device authentication prevents unauthorized access
- **Data Integrity**: Cryptographic verification of data consistency
- **Session Management**: Secure session handling with automatic timeout

##  Troubleshooting

### Common Issues

1. **WebSocket Connection Failed**:
   - Check if your B-Client platform supports WebSockets
   - Verify the B-Client URL in C-Client configuration
   - Check firewall settings

2. **Database Connection Error**:
   - Verify MySQL credentials
   - Check database server accessibility
   - Ensure database exists and is properly configured

3. **NSN API Connection Failed**:
   - Verify NSN URL in C-Client configuration
   - Check if NSN is properly deployed and accessible
   - Verify SSL certificates

### Log Files

- **C-Client logs**: Located in `%APPDATA%/NoMorePassword/logs/` (Windows)
- **B-Client logs**: Check your deployment platform logs
- **NSN logs**: Check PythonAnywhere logs in the dashboard

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

##  Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

##  Support

For support and questions:
- Create an issue on GitHub
- Contact the development team
- Check the documentation wiki

##  Roadmap

- [ ] Mobile app support (iOS/Android)
- [ ] Browser extension
- [ ] Advanced security features
- [ ] Multi-language support
- [ ] Enterprise features

---

**No More Password** - Making authentication secure and simple.
