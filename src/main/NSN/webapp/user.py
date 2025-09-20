from webapp import app
from webapp import db
from flask import redirect, render_template, request, session, url_for, jsonify
from flask_bcrypt import Bcrypt
import re
from webapp.utils import rebuildImageUrl
# Create an instance of the Bcrypt class, which we'll be using to hash user
# passwords during login and registration.
flask_bcrypt = Bcrypt(app)



@app.route('/user/view', methods=['GET', 'POST'])
def view_users():
    # Authentication check
    if 'user_id' not in session:
        return redirect(url_for('login'))
        
    # Check user role
    with db.get_cursor() as cursor:
        cursor.execute(
            'SELECT role FROM users WHERE user_id = %s',
            (session['user_id'],)
        )
        result = cursor.fetchone()
        db.close_db()
    
    user_role = result['role'] if result else None
    is_admin_user = user_role == 'admin'
    is_support_tech = user_role == 'support_tech'
    # Only admin and support_tech can access user management
    # if not (is_admin_user or is_support_tech):
    #     return redirect(url_for('dashboard'))
    
    # Get search query and role filter if any
    search_query = request.args.get('search', '')
    role_filter = request.args.get('role', '')
    
    # get page number from query string
    try:
        page = int(request.args.get('page', 1))
        if page < 1:
            page = 1
    except ValueError:
        page = 1
    per_page = 15
    offset = (page - 1) * per_page

    # Get user list
    user_list = []
    admin_users = []
    editor_users = []
    moderator_users = []
    traveller_users = []
    admin_count = 0
    total_users = 0
    total_pages = 1
    traveller_page = int(request.args.get('traveller_page', 1))
    traveller_per_page = 15
    traveller_total = 0
    traveller_total_pages = 1

    try:
        with db.get_cursor() as cursor:
            # Count admins
            cursor.execute('SELECT COUNT(*) as admin_count FROM users WHERE role = "admin"')
            admin_result = cursor.fetchone()
            admin_count = admin_result['admin_count'] if admin_result else 0
            
            # Base query
            base_query = 'SELECT user_id, username, email, first_name, last_name, profile_image, description, role, status FROM users'
            count_query = 'SELECT COUNT(*) as total FROM users'
            where_clauses = []
            params = []
            count_params = []
            
            # Add search conditions if search is provided
            if search_query:
                where_clauses.append('(username LIKE %s OR email LIKE %s OR first_name LIKE %s OR last_name LIKE %s)')
                search_param = f"%{search_query}%"
                params.extend([search_param, search_param, search_param, search_param])
                count_params.extend([search_param, search_param, search_param, search_param])
            
            # Add role filter if provided (only for admin users)
            if role_filter and is_admin_user:
                if role_filter == 'staff':
                    where_clauses.append('(role = "admin" OR role = "editor" OR role = "moderator"OR role = "support_tech")')
                else:
                    where_clauses.append('role = %s')
                    params.append(role_filter)
                    count_params.append(role_filter)
            
            # For non-admin users, only show active users and public profiles
            if not (is_admin_user or is_support_tech):
                where_clauses.append('status = "active" AND (is_public = 1 OR user_id = %s)')
                params.append(session['user_id'])
                count_params.append(session['user_id'])

            # Construct the WHERE clause
            if where_clauses:
                where_sql = ' WHERE ' + ' AND '.join(where_clauses)
                base_query += where_sql
                count_query += where_sql

            # pagination
            base_query += ' LIMIT %s OFFSET %s'
            params_for_query = params + [per_page, offset]
            cursor.execute(base_query, tuple(params_for_query))
            user_list = cursor.fetchall()

            for user in user_list:
             user['avatar_url'] = rebuildImageUrl(user['profile_image'])
            

            # Count total users
            cursor.execute(count_query, tuple(params))
            total_result = cursor.fetchone()
            total_users = total_result['total'] if total_result else 0
            total_pages = max(1, (total_users + per_page - 1) // per_page)
            
            # If no specific filter is applied and we're an admin, fetch separate role-specific lists
            if is_admin_user and not search_query and not role_filter:
                # Get admin users
                cursor.execute('SELECT user_id, username, email, first_name, last_name, role, status FROM users WHERE role = "admin"')
                admin_users = cursor.fetchall()
                
                # Get editor users
                cursor.execute('SELECT user_id, username, email, first_name, last_name, role, status FROM users WHERE role = "editor"')
                editor_users = cursor.fetchall()

                 # Get moderator users 
                cursor.execute('SELECT user_id, username, email, first_name, last_name, role, status FROM users WHERE role = "moderator"')
                moderator_users = cursor.fetchall()
                
                # Get traveller users
                cursor.execute('SELECT COUNT(*) as total FROM users WHERE role = "traveller"')
                traveller_total = cursor.fetchone()['total']
                traveller_total_pages = max(1, (traveller_total + traveller_per_page - 1) // traveller_per_page)
                cursor.execute(
                    'SELECT user_id, username, email, first_name, last_name, role, status FROM users WHERE role = "traveller" LIMIT %s OFFSET %s',
                    (traveller_per_page, (traveller_page - 1) * traveller_per_page)
                )
                traveller_users = cursor.fetchall()
            
            
            db.close_db()
            
        # If no data is retrieved and no filters applied, add a test user (for admin only)
        if not user_list and not search_query and not role_filter and is_admin_user:
            user_list = [
                {
                    'user_id': session['user_id'],
                    'username': session['username'],
                    'email': 'test@example.com',
                    'first_name': 'Test',
                    'last_name': 'User',
                    'role': 'admin',
                    'status': 'active'
                }
            ]
    except Exception as e:
        print(f"Error fetching users: {e}")
        # Add a test user to ensure the page can render (for admin only)
        if not search_query and not role_filter and is_admin_user:
            user_list = [
                {
                    'user_id': session['user_id'],
                    'username': session['username'],
                    'email': 'test@example.com',
                    'first_name': 'Test',
                    'last_name': 'User',
                    'role': 'admin',
                    'status': 'active'
                }
            ]
    # Only admin can edit roles
    can_edit_role = is_admin_user
    return render_template('users.html', 
                          user_list=user_list, 
                          admin_users=admin_users,
                          editor_users=editor_users,
                          moderator_users=moderator_users,
                          traveller_users=traveller_users,
                          admin_count=admin_count, 
                          admin=is_admin_user,
                          support_tech=is_support_tech,
                          can_edit_role=can_edit_role,
                          show_role_lists=is_admin_user and not search_query and not role_filter,
                          page=page,
                          total_pages=total_pages,
                          total_users=total_users,
                          traveller_page=traveller_page,
                          traveller_total_pages=traveller_total_pages,
                          traveller_total=traveller_total)

@app.route('/user/status/batch', methods=['GET', 'POST'])
def batch_user_status():
    # param: user_id_list,  status
    user_list={}
    #redirect to users.html, admin mode
    return render_template('users.html', user_list=user_list, admin=True)

@app.route('/user/role/update', methods=['POST'])
def update_user_role():
    # Authentication check
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 403
        
    # Check if the user is admin
    with db.get_cursor() as cursor:
        cursor.execute(
            'SELECT role FROM users WHERE user_id = %s',
            (session['user_id'],)
        )
        result = cursor.fetchone()
        db.close_db()
    
    if not result or result['role'] != 'admin':
        return jsonify({'error': 'Unauthorized'}), 403
    
    # Get request data
    data = request.get_json()
    user_id = data.get('user_id')
    new_role = data.get('role')
    
    # Validate input
    if not user_id or not new_role:
        return jsonify({'error': 'Missing required fields'}), 400
        
    if new_role not in ['admin', 'editor', 'traveller', 'moderator', 'support_tech']:
        return jsonify({'error': 'Invalid role'}), 400
    
    # Check if this is an admin being demoted and if they're the last admin
    with db.get_cursor() as cursor:
        # Get current role of the user
        cursor.execute(
            'SELECT role FROM users WHERE user_id = %s',
            (user_id,)
        )
        user_role_result = cursor.fetchone()
        
        # If current role is admin and new role is not admin, check admin count
        if user_role_result and user_role_result['role'] == 'admin' and new_role != 'admin':
            cursor.execute('SELECT COUNT(*) as admin_count FROM users WHERE role = "admin"')
            admin_count_result = cursor.fetchone()
            admin_count = admin_count_result['admin_count'] if admin_count_result else 0
            
            if admin_count <= 1:
                return jsonify({'error': 'Cannot remove the last administrator. Please create another admin account first.'}), 400
        
        db.close_db()
    
    try:
        # Update user role
        conn = db.get_db()
        with db.get_cursor() as cursor:
            cursor.execute(
                'UPDATE users SET role = %s WHERE user_id = %s',
                (new_role, user_id)
            )
            conn.commit()
        return jsonify({'message': 'Role updated successfully'}), 200
    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/user/status/update', methods=['POST'])
def update_user_status():
    # Authentication check
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 403
        
    # Check if the user is admin
    with db.get_cursor() as cursor:
        cursor.execute(
            'SELECT role FROM users WHERE user_id = %s',
            (session['user_id'],)
        )
        result = cursor.fetchone()
        db.close_db()
    
    if not result or result['role'] not in ['admin', 'support_tech']:
        return jsonify({'error': 'Unauthorized'}), 403
    
    # Get request data
    data = request.get_json()
    user_id = data.get('user_id')
    new_status = data.get('status')
    
    # Validate input
    if not user_id or not new_status:
        return jsonify({'error': 'Missing required fields'}), 400
        
    if new_status not in ['active','inactive', 'banned']:
        return jsonify({'error': 'Invalid status'}), 400
    
    # Check if trying to ban an admin user
    with db.get_cursor() as cursor:
        cursor.execute(
            'SELECT role FROM users WHERE user_id = %s',
            (user_id,)
        )
        user_result = cursor.fetchone()
        db.close_db()
    
    if user_result and user_result['role'] == 'admin' and new_status == 'banned':
        return jsonify({'error': 'Cannot ban administrator accounts'}), 400
        
    try:
        # Update user status
        conn = db.get_db()
        with db.get_cursor() as cursor:
            cursor.execute(
                'UPDATE users SET status = %s WHERE user_id = %s',
                (new_status, user_id)
            )
            conn.commit()
        return jsonify({'message': 'Status updated successfully'}), 200
    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({'error': str(e)}), 500

def is_admin(user_id):
    # Check if the user is admin
    with db.get_cursor() as cursor:
        cursor.execute(
            'SELECT role FROM users WHERE user_id = %s',
            (user_id,)
        )
        result = cursor.fetchone()
        db.close_db()
    
    return result and result['role'] == 'admin'

def check_user_report_permissions(user_id):
    try:
        with db.get_cursor() as cursor:
            cursor.execute('''
                SELECT status, role 
                FROM users 
                WHERE user_id = %s
            ''', (user_id,))

            user = cursor.fetchone()
            db.close_db()

            if not user:
                return False

            # Disabled users cannot report
            if user['status'] == 'banned':
                return False

            return True

    except Exception as e:
        print(f"Error checking user report permissions: {e}")
        return False


# Database migration check function
def check_journey_reports_table():
    """检查journey_reports表是否存在，如果不存在则创建"""
    try:
        with db.get_cursor() as cursor:
            # Check if the table exists
            cursor.execute("""
                SELECT COUNT(*) as table_count
                FROM information_schema.tables 
                WHERE table_schema = DATABASE() 
                AND table_name = 'journey_reports'
            """)

            result = cursor.fetchone()

            if result['table_count'] == 0:
                print("Creating journey_reports table...")

                cursor.execute("""
                    CREATE TABLE journey_reports (
                        report_id INT AUTO_INCREMENT PRIMARY KEY,
                        journey_id INT NOT NULL,
                        reporter_id INT NOT NULL COMMENT '报告者的用户ID',
                        reason ENUM('spam', 'inappropriate_content', 'false_information', 'copyright_violation', 'offensive_language', 'other') NOT NULL COMMENT '报告原因',
                        details TEXT NOT NULL COMMENT '详细说明（必填，最少10字符）',
                        status ENUM('pending', 'reviewed', 'dismissed', 'hidden') DEFAULT 'pending' COMMENT '报告状态',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        reviewed_at TIMESTAMP NULL,
                        reviewed_by INT DEFAULT NULL COMMENT '处理报告的管理员/编辑ID',
                        admin_response TEXT DEFAULT NULL COMMENT '管理员回复',

                        FOREIGN KEY (journey_id) REFERENCES journeys(journey_id) ON DELETE CASCADE,
                        FOREIGN KEY (reporter_id) REFERENCES users(user_id) ON DELETE CASCADE,
                        FOREIGN KEY (reviewed_by) REFERENCES users(user_id) ON DELETE SET NULL,

                        INDEX idx_journey_id (journey_id),
                        INDEX idx_reporter_id (reporter_id),
                        INDEX idx_status (status),
                        INDEX idx_created_at (created_at),

                        UNIQUE KEY unique_report (journey_id, reporter_id)
                    )
                """)

                db.close_db()
                print("journey_reports table created successfully!")
                return True
            else:
                print("journey_reports table already exists")
                return True

    except Exception as e:
        print(f"Error checking/creating journey_reports table: {e}")
        return False


def initialize_journey_reports():
    """初始化journey报告功能"""
    print("Initializing journey reports system...")

    if check_journey_reports_table():
        print("Journey reports system initialized successfully!")
        return True
    else:
        print("Failed to initialize journey reports system!")
        return False