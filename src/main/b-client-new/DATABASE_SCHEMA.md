# B-Client Database Schema

## Overview
This document describes the database schema for the B-Client Flask Application. The database uses SQLite with SQLAlchemy ORM for data management.

## Database Configuration
- **Database Type**: SQLite
- **Database File**: `b_client_secure.db`
- **ORM**: SQLAlchemy
- **Models File**: `models.py`

## Table Definitions

### 1. UserCookie Table (`user_cookies`)
**Purpose**: Manages user cookie information for automatic login and session management.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `user_id` | String(50) | Primary Key | - | User identifier |
| `username` | String(255) | Primary Key | - | Username |
| `node_id` | String(50) | - | - | Node ID where cookie was created |
| `cookie` | Text | - | - | Cookie content (encrypted) |
| `auto_refresh` | Boolean | - | False | Enable automatic cookie refresh |
| `refresh_time` | DateTime | - | - | Last refresh timestamp |
| `create_time` | DateTime | - | Current Time | Record creation time |

**Relationships**:
- Links to `user_accounts` via `user_id` and `username`
- Links to `domain_nodes` via `node_id`

### 2. UserAccount Table (`user_accounts`)
**Purpose**: Stores detailed user account information including passwords and personal details.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `user_id` | String(50) | Primary Key | - | User identifier |
| `username` | String(255) | Primary Key | - | Username |
| `website` | String(255) | Primary Key | - | Website domain |
| `account` | String(50) | Primary Key | - | Account identifier |
| `password` | Text | - | - | Encrypted password |
| `email` | String(255) | - | - | Email address |
| `first_name` | String(255) | - | - | First name |
| `last_name` | String(255) | - | - | Last name |
| `location` | String(255) | - | - | User location |
| `registration_method` | String(20) | - | 'manual' | Registration method |
| `auto_generated` | Boolean | - | False | Whether account was auto-generated |
| `create_time` | DateTime | - | Current Time | Account creation time |

**Relationships**:
- Links to `user_cookies` via `user_id` and `username`

### 3. DomainNode Table (`domain_nodes`)
**Purpose**: Manages domain-to-node mappings and node configuration.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `domain_id` | String(50) | Primary Key | - | Domain identifier |
| `node_id` | String(50) | - | - | Associated node ID |
| `refresh_time` | DateTime | - | Current Time | Last status update time |

**Relationships**:
- Links to `user_cookies` via `node_id`

## Database Initialization

### Automatic Initialization
The database is automatically initialized when the application starts:

```python
# In models.py
def init_db(app):
    """Initialize database with Flask app context"""
    db.init_app(app)
    
    with app.app_context():
        db.create_all()
```

### Manual Initialization
You can also manually initialize the database:

```python
from models import init_db, db
from app import app

# Initialize database
init_db(app)

# Or manually create tables
with app.app_context():
    db.create_all()
```

## Usage Examples

### Creating Records
```python
from models import UserCookie, UserAccount, DomainNode

# Create a new user cookie
cookie = UserCookie(
    user_id='user123',
    username='john_doe',
    node_id='node456',
    cookie='encrypted_cookie_data',
    auto_refresh=True
)
db.session.add(cookie)
db.session.commit()

# Create a new user account
account = UserAccount(
    user_id='user123',
    username='john_doe',
    website='example.com',
    account='john@example.com',
    password='hashed_password',
    email='john@example.com',
    first_name='John',
    last_name='Doe'
)
db.session.add(account)
db.session.commit()
```

### Querying Records
```python
# Get all cookies for a user
user_cookies = UserCookie.query.filter_by(user_id='user123').all()

# Get user account by website
account = UserAccount.query.filter_by(
    user_id='user123',
    website='example.com'
).first()

# Get domain node information
domain_node = DomainNode.query.filter_by(domain_id='domain123').first()
```

## File Structure
```
src/main/b-client-new/
├── models.py              # Database models and initialization
├── app.py                 # Main Flask application
├── run.py                 # Application entry point
├── DATABASE_SCHEMA.md     # This documentation
└── b_client_secure.db     # SQLite database file (created automatically)
```

## Notes
- All tables use composite primary keys for data integrity
- Timestamps are automatically managed by SQLAlchemy
- Database file is created automatically on first run
- Models include proper relationships and constraints
- All sensitive data (passwords, cookies) should be encrypted before storage
