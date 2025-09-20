from flask import redirect, render_template, request, session, url_for, flash, jsonify
from webapp import app, db

def is_logged_in():
    """Check if user is logged in"""
    return 'loggedin' in session

def is_support_staff():
    """Check if user is support staff (admin, editor, or support_tech)"""
    return session.get('role') in ('admin', 'editor', 'support_tech')

@app.route('/help', methods=['GET', 'POST'])
def submit_help_request():
    """Handle help request submission page and form processing"""
    if not is_logged_in():
        flash("Please login to submit a help request.", "warning")
        return redirect(url_for('login'))
    
    if request.method == 'POST':
        # Get form data
        subject = request.form.get('subject', '').strip()
        description = request.form.get('description', '').strip()
        category = request.form.get('category', 'other').strip()
        
        # Validate required fields
        if not subject:
            flash("Please enter a subject for your request.", "danger")
            return render_template('help_request_form.html')
        
        if not description:
            flash("Please enter a description of your issue.", "danger")
            return render_template('help_request_form.html')
        
        if category not in ['bug_report', 'technical_issue', 'account_help', 'feature_request', 'other']:
            category = 'other'
        
        # Insert help request into database
        try:
            with db.get_cursor() as cursor:
                insert_query = """
                    INSERT INTO help_requests (user_id, subject, description, category, status, priority)
                    VALUES (%s, %s, %s, %s, 'new', 'medium')
                """
                cursor.execute(insert_query, (session['user_id'], subject, description, category))
                db.close_db()
            
            flash("Your help request has been submitted successfully! Our support team will handle it soon.", "success")
            return redirect(url_for('my_requests'))
            
        except Exception as e:
            flash("An error occurred while submitting your request. Please try again later.", "danger")
            print(f"Error submitting help request: {e}")
            return render_template('help_request_form.html')
    
    # GET request - show the form
    return render_template('help_request_form.html')

@app.route('/help/my-requests')
def my_requests():
    """Show user's own help requests"""
    if not is_logged_in():
        flash("Please login to view your requests.", "warning")
        return redirect(url_for('login'))
    
    try:
        with db.get_cursor() as cursor:
            query = """
                SELECT hr.*, u.username as assigned_to_username,
                       COALESCE(hr.status_changed_at, hr.created_at) as last_update
                FROM help_requests hr
                LEFT JOIN users u ON hr.assigned_to = u.user_id
                WHERE hr.user_id = %s
                ORDER BY COALESCE(hr.status_changed_at, hr.created_at) DESC
            """
            cursor.execute(query, (session['user_id'],))
            requests = cursor.fetchall()
            db.close_db()
        
        return render_template('help_my_requests.html', requests=requests)
        
    except Exception as e:
        flash("An error occurred while fetching your requests.", "danger")
        print(f"Error fetching user requests: {e}")
        return redirect(url_for('dashboard'))

@app.route('/help/manage')
def manage_requests():
    """Support staff interface to manage help requests"""
    if not is_support_staff():
        flash("You don't have permission to access this page.", "danger")
        return redirect(url_for('dashboard'))
    
    # Get filter parameters
    status_filter = request.args.get('status', '')
    category_filter = request.args.get('category', '')
    unassigned_only = request.args.get('unassigned', '')
    page = int(request.args.get('page', 1))
    per_page = 20
    
    try:
        with db.get_cursor() as cursor:
            # Build query with filters
            where_conditions = []
            params = []
            
            if status_filter:
                where_conditions.append("hr.status = %s")
                params.append(status_filter)
            
            if category_filter:
                where_conditions.append("hr.category = %s")
                params.append(category_filter)
            
            if unassigned_only:
                where_conditions.append("hr.assigned_to IS NULL AND hr.status = 'new'")
            
            where_clause = ""
            if where_conditions:
                where_clause = "WHERE " + " AND ".join(where_conditions)
            
            # Get total count for pagination
            count_query = f"SELECT COUNT(*) as total FROM help_requests hr {where_clause}"
            cursor.execute(count_query, params)
            total_requests = cursor.fetchone()['total']
            
            # Get requests with pagination
            offset = (page - 1) * per_page
            query = f"""
                SELECT hr.*, 
                       u.username as submitter_username,
                       u.email as submitter_email,
                       u.role as submitter_role,
                       assigned_user.username as assigned_to_username,
                       CASE 
                           WHEN m.m_status = 'subscribed' AND m.end_time > NOW() THEN 1
                           ELSE 0
                       END as is_premium_user
                FROM help_requests hr
                JOIN users u ON hr.user_id = u.user_id
                LEFT JOIN users assigned_user ON hr.assigned_to = assigned_user.user_id
                LEFT JOIN members m ON u.user_id = m.user_id
                {where_clause}
                ORDER BY 
                    CASE WHEN hr.assigned_to IS NULL AND hr.status = 'new' THEN 0 ELSE 1 END,
                    CASE hr.status 
                        WHEN 'new' THEN 1 
                        WHEN 'open' THEN 2 
                        WHEN 'stalled' THEN 3 
                        WHEN 'resolved' THEN 4 
                    END,
                    hr.priority = 'urgent' DESC,
                    hr.priority = 'high' DESC,
                    hr.priority = 'medium' DESC,
                    hr.created_at DESC
                LIMIT %s OFFSET %s
            """
            cursor.execute(query, params + [per_page, offset])
            requests = cursor.fetchall()
            
            # Calculate pagination info
            total_pages = (total_requests + per_page - 1) // per_page
            
            # Get support staff for assignment dropdown
            cursor.execute("SELECT user_id, username FROM users WHERE role IN ('admin','editor', 'support_tech') AND status = 'active'")
            support_staff = cursor.fetchall()
            db.close_db()
        
        return render_template('help_manage_list.html', 
                             requests=requests,
                             support_staff=support_staff,
                             current_page=page,
                             total_pages=total_pages,
                             total_requests=total_requests,
                             status_filter=status_filter,
                             category_filter=category_filter,
                             unassigned_only=unassigned_only)
        
    except Exception as e:
        flash("An error occurred while fetching help requests.", "danger")
        print(f"Error fetching help requests for management: {e}")
        return redirect(url_for('dashboard'))

@app.route('/help/manage/<int:request_id>', methods=['GET', 'POST'])
def manage_single_request(request_id):
    """View and update a single help request"""
    if not is_support_staff():
        flash("You don't have permission to access this page.", "danger")
        return redirect(url_for('dashboard'))
    
    if request.method == 'POST':
        # Handle request update
        new_status = request.form.get('status')
        new_priority = request.form.get('priority')
        assigned_to = request.form.get('assigned_to')
        admin_notes = request.form.get('admin_notes', '').strip()
        
        if assigned_to == '':
            assigned_to = None
            
        # Validate input
        valid_statuses = ['new', 'open', 'stalled', 'resolved']
        valid_priorities = ['low', 'medium', 'high', 'urgent']
        
        if new_status not in valid_statuses:
            flash("Invalid status selected.", "danger")
            return redirect(url_for('manage_single_request', request_id=request_id))
        
        if new_priority not in valid_priorities:
            flash("Invalid priority selected.", "danger")
            return redirect(url_for('manage_single_request', request_id=request_id))
        
        try:
            with db.get_cursor() as cursor:
                # Get current request to validate status transition and check assignment changes
                cursor.execute("SELECT status, assigned_to FROM help_requests WHERE request_id = %s", (request_id,))
                current_request = cursor.fetchone()
                
                if not current_request:
                    flash("Help request not found.", "danger")
                    return redirect(url_for('manage_requests'))
                
                current_status = current_request['status']
                current_assigned_to = current_request['assigned_to']
                
                # Validate status transition - prevent going back from open to new
                if current_status == 'open' and new_status == 'new':
                    flash("Cannot change status back to 'New' once it has been opened.", "warning")
                    return redirect(url_for('manage_single_request', request_id=request_id))
                
                # Check if assignment is being changed
                assignment_changed = False
                if assigned_to != current_assigned_to:
                    assignment_changed = True
                    # Convert empty string to None for comparison
                    if assigned_to == '' or assigned_to is None:
                        assigned_to = None
                    if current_assigned_to == '' or current_assigned_to is None:
                        current_assigned_to = None
                
                # Check if status is being changed to resolved
                status_changed = current_status != new_status
                if new_status == 'resolved':
                    update_query = """
                        UPDATE help_requests 
                        SET status = %s, priority = %s, assigned_to = %s, admin_notes = %s, 
                            resolved_at = NOW(), status_changed_at = NOW(), status_changed_by = %s
                        WHERE request_id = %s
                    """
                    cursor.execute(update_query, (new_status, new_priority, assigned_to, admin_notes, session['user_id'], request_id))
                elif status_changed:
                    update_query = """
                        UPDATE help_requests 
                        SET status = %s, priority = %s, assigned_to = %s, admin_notes = %s,
                            status_changed_at = NOW(), status_changed_by = %s
                        WHERE request_id = %s
                    """
                    cursor.execute(update_query, (new_status, new_priority, assigned_to, admin_notes, session['user_id'], request_id))
                else:
                    # Only update other fields if status hasn't changed
                    update_query = """
                        UPDATE help_requests 
                        SET priority = %s, assigned_to = %s, admin_notes = %s
                        WHERE request_id = %s
                    """
                    cursor.execute(update_query, (new_priority, assigned_to, admin_notes, request_id))
                
                # Send notification if assignment changed and someone was assigned
                if assignment_changed and assigned_to is not None:
                    # Get request details for notification
                    cursor.execute("SELECT subject FROM help_requests WHERE request_id = %s", (request_id,))
                    request_info = cursor.fetchone()
                    
                    # Get assigner name
                    cursor.execute("SELECT username FROM users WHERE user_id = %s", (session['user_id'],))
                    assigner_info = cursor.fetchone()
                    
                    if request_info and assigner_info:
                        notification_message = f"You have been assigned to Help Request #{request_id}: {request_info['subject']} (assigned by {assigner_info['username']})"
                        
                        cursor.execute("""
                            INSERT INTO help_desk_notifications (user_id, request_id, message, assigned_by)
                            VALUES (%s, %s, %s, %s)
                        """, (assigned_to, request_id, notification_message, session['user_id']))
                
                db.close_db()
            
            if status_changed:
                flash(f"Request status updated to '{new_status.title()}' successfully.", "success")
            else:
                flash("Request updated successfully.", "success")
            return redirect(url_for('manage_requests'))
            
        except Exception as e:
            flash("An error occurred while updating the request.", "danger")
            print(f"Error updating help request: {e}")
    
    # GET request - show request details
    try:
        with db.get_cursor() as cursor:
            query = """
                SELECT hr.*, 
                       u.username as submitter_username,
                       u.email as submitter_email,
                       u.first_name as submitter_first_name,
                       u.last_name as submitter_last_name,
                       assigned_user.username as assigned_to_username
                FROM help_requests hr
                JOIN users u ON hr.user_id = u.user_id
                LEFT JOIN users assigned_user ON hr.assigned_to = assigned_user.user_id
                WHERE hr.request_id = %s
            """
            cursor.execute(query, (request_id,))
            help_request = cursor.fetchone()
            
            if not help_request:
                flash("Help request not found.", "danger")
                return redirect(url_for('manage_requests'))
            
            # Get support staff for assignment dropdown
            cursor.execute("SELECT user_id, username FROM users WHERE role IN ('admin','editor', 'support_tech') AND status = 'active'")
            support_staff = cursor.fetchall()
            
            # Get conversation replies
            cursor.execute("""
                SELECT r.*, u.username, u.first_name, u.last_name, u.role
                FROM help_request_replies r
                JOIN users u ON r.user_id = u.user_id
                WHERE r.request_id = %s
                ORDER BY r.created_at ASC
            """, (request_id,))
            replies = cursor.fetchall()
            
            db.close_db()
        
        return render_template('help_manage_detail.html', 
                             help_request=help_request,
                             support_staff=support_staff,
                             replies=replies)
        
    except Exception as e:
        flash("An error occurred while fetching request details.", "danger")
        print(f"Error fetching help request details: {e}")
        return redirect(url_for('manage_requests'))

@app.route('/help/manage/<int:request_id>/reply', methods=['POST'])
def add_reply(request_id):
    """Add a reply to a help request"""
    if not is_support_staff():
        flash("You don't have permission to reply to requests.", "danger")
        return redirect(url_for('manage_single_request', request_id=request_id))
    
    message = request.form.get('message', '').strip()
    if not message:
        flash("Reply message cannot be empty.", "danger")
        return redirect(url_for('manage_single_request', request_id=request_id))
    
    try:
        with db.get_cursor() as cursor:
            # Verify the request exists
            cursor.execute("SELECT * FROM help_requests WHERE request_id = %s", (request_id,))
            help_request = cursor.fetchone()
            
            if not help_request:
                flash("Help request not found.", "danger")
                return redirect(url_for('manage_requests'))
            
            # Insert the reply
            cursor.execute("""
                INSERT INTO help_request_replies (request_id, user_id, message, is_staff_reply)
                VALUES (%s, %s, %s, %s)
            """, (request_id, session['user_id'], message, True))
            
            # Update request status if it's still new and assign to current user
            if help_request['status'] == 'new' and help_request['assigned_to'] is None:
                cursor.execute("""
                    UPDATE help_requests 
                    SET status = 'open', assigned_to = %s, status_changed_at = NOW(), status_changed_by = %s
                    WHERE request_id = %s
                """, (session['user_id'], session['user_id'], request_id))
            
            db.close_db()
            
        flash("Reply posted successfully.", "success")
        
    except Exception as e:
        flash("An error occurred while posting the reply.", "danger")
        print(f"Error adding reply: {e}")
    
    return redirect(url_for('manage_single_request', request_id=request_id))

@app.route('/help/<int:request_id>/user-reply', methods=['POST'])
def add_user_reply(request_id):
    """Add a reply from the user who submitted the request"""
    if not is_logged_in():
        flash("Please login to reply.", "warning")
        return redirect(url_for('login'))
    
    message = request.form.get('message', '').strip()
    if not message:
        flash("Reply message cannot be empty.", "danger")
        return redirect(url_for('my_requests'))
    
    try:
        with db.get_cursor() as cursor:
            # Verify the request exists and belongs to the current user
            cursor.execute("""
                SELECT * FROM help_requests 
                WHERE request_id = %s AND user_id = %s
            """, (request_id, session['user_id']))
            help_request = cursor.fetchone()
            
            if not help_request:
                flash("Help request not found or you don't have permission to reply.", "danger")
                return redirect(url_for('my_requests'))
            
            # Insert the reply
            cursor.execute("""
                INSERT INTO help_request_replies (request_id, user_id, message, is_staff_reply)
                VALUES (%s, %s, %s, %s)
            """, (request_id, session['user_id'], message, False))
            
            # Send notification to assigned staff if any
            if help_request['assigned_to']:
                # Get user name for notification
                cursor.execute("SELECT username FROM users WHERE user_id = %s", (session['user_id'],))
                user_info = cursor.fetchone()
                
                if user_info:
                    notification_message = f"New reply from {user_info['username']} on Help Request #{request_id}: {help_request['subject']}"
                    
                    cursor.execute("""
                        INSERT INTO help_desk_notifications (user_id, request_id, message, assigned_by)
                        VALUES (%s, %s, %s, %s)
                    """, (help_request['assigned_to'], request_id, notification_message, session['user_id']))
            
            # Reopen the request if it was resolved
            if help_request['status'] == 'resolved':
                cursor.execute("""
                    UPDATE help_requests 
                    SET status = 'open', status_changed_at = NOW()
                    WHERE request_id = %s
                """, (request_id,))
                flash("Your reply has reopened this request.", "info")
            
            db.close_db()
            
        flash("Reply posted successfully.", "success")
        
    except Exception as e:
        flash("An error occurred while posting the reply.", "danger")
        print(f"Error adding user reply: {e}")
    
    return redirect(url_for('view_request_detail', request_id=request_id))

@app.route('/help/request/<int:request_id>')
def view_request_detail(request_id):
    """View detailed help request with conversation for the user who submitted it"""
    if not is_logged_in():
        flash("Please login to view your requests.", "warning")
        return redirect(url_for('login'))
    
    try:
        with db.get_cursor() as cursor:
            # Get the request details
            query = """
                SELECT hr.*, 
                       assigned_user.username as assigned_to_username,
                       assigned_user.first_name as assigned_first_name,
                       assigned_user.last_name as assigned_last_name
                FROM help_requests hr
                LEFT JOIN users assigned_user ON hr.assigned_to = assigned_user.user_id
                WHERE hr.request_id = %s AND hr.user_id = %s
            """
            cursor.execute(query, (request_id, session['user_id']))
            help_request = cursor.fetchone()
            
            if not help_request:
                flash("Help request not found.", "danger")
                return redirect(url_for('my_requests'))
            
            # Get conversation replies
            cursor.execute("""
                SELECT r.*, u.username, u.first_name, u.last_name, u.role
                FROM help_request_replies r
                JOIN users u ON r.user_id = u.user_id
                WHERE r.request_id = %s
                ORDER BY r.created_at ASC
            """, (request_id,))
            replies = cursor.fetchall()
            
            db.close_db()
        
        return render_template('help_request_detail.html', 
                             help_request=help_request,
                             replies=replies)
        
    except Exception as e:
        flash("An error occurred while fetching request details.", "danger")
        print(f"Error fetching request details: {e}")
        return redirect(url_for('my_requests'))

@app.route('/api/help/stats')
def get_help_stats():
    """API endpoint to get help request statistics for dashboard"""
    if not is_support_staff():
        return jsonify({'error': 'Unauthorized'}), 403
    
    try:
        with db.get_cursor() as cursor:
            # Get counts by status
            cursor.execute("""
                SELECT status, COUNT(*) as count 
                FROM help_requests 
                GROUP BY status
            """)
            status_counts = {row['status']: row['count'] for row in cursor.fetchall()}
            
            # Get counts by category
            cursor.execute("""
                SELECT category, COUNT(*) as count 
                FROM help_requests 
                GROUP BY category
            """)
            category_counts = {row['category']: row['count'] for row in cursor.fetchall()}
            
            # Get urgent requests count
            cursor.execute("""
                SELECT COUNT(*) as count 
                FROM help_requests 
                WHERE priority = 'urgent' AND status IN ('new', 'open', 'stalled')
            """)
            urgent_count = cursor.fetchone()['count']
            
            # Get unassigned requests count
            cursor.execute("""
                SELECT COUNT(*) as count 
                FROM help_requests 
                WHERE assigned_to IS NULL AND status = 'new'
            """)
            unassigned_count = cursor.fetchone()['count']
            db.close_db()
        
        return jsonify({
            'status_counts': status_counts,
            'category_counts': category_counts,
            'urgent_count': urgent_count,
            'unassigned_count': unassigned_count
        })
        
    except Exception as e:
        print(f"Error fetching help stats: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/help/notifications')
def get_notifications():
    """Get unread notifications for current user"""
    if not is_logged_in():
        return jsonify({'error': 'Unauthorized'}), 403
    
    try:
        with db.get_cursor() as cursor:
            cursor.execute("""
                SELECT notification_id, request_id, message, created_at
                FROM help_desk_notifications 
                WHERE user_id = %s AND is_read = FALSE
                ORDER BY created_at DESC
                LIMIT 10
            """, (session['user_id'],))
            notifications = cursor.fetchall()
            
            # Get count of unread notifications
            cursor.execute("""
                SELECT COUNT(*) as count 
                FROM help_desk_notifications 
                WHERE user_id = %s AND is_read = FALSE
            """, (session['user_id'],))
            count_result = cursor.fetchone()
            
            db.close_db()
        
        # Format notifications
        formatted_notifications = []
        for notif in notifications:
            formatted_notifications.append({
                'id': notif['notification_id'],
                'request_id': notif['request_id'],
                'message': notif['message'],
                'created_at': notif['created_at'].strftime('%Y-%m-%d %H:%M')
            })
        
        return jsonify({
            'notifications': formatted_notifications,
            'count': count_result['count'] if count_result else 0
        })
        
    except Exception as e:
        print(f"Error fetching notifications: {e}")
        return jsonify({'error': 'Failed to fetch notifications'}), 500

@app.route('/api/help/notifications/<int:notification_id>/mark-read', methods=['POST'])
def mark_notification_read(notification_id):
    """Mark a notification as read"""
    if not is_logged_in():
        return jsonify({'error': 'Unauthorized'}), 403
    
    try:
        with db.get_cursor() as cursor:
            cursor.execute("""
                UPDATE help_desk_notifications 
                SET is_read = TRUE, read_at = NOW()
                WHERE notification_id = %s AND user_id = %s
            """, (notification_id, session['user_id']))
            
            db.close_db()
        
        return jsonify({'success': True})
        
    except Exception as e:
        print(f"Error marking notification as read: {e}")
        return jsonify({'error': 'Failed to mark notification as read'}), 500 