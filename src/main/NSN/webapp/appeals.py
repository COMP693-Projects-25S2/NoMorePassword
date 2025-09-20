"""
申诉系统模块
此模块处理用户对内容限制的申诉功能
"""

from webapp import app, db
from flask import request, session, jsonify, render_template, redirect, url_for, flash
from functools import wraps
from datetime import datetime


def require_login(f):

    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'loggedin' not in session:
            flash('Please log in to access this feature.', 'warning')
            return redirect(url_for('login'))
        return f(*args, **kwargs)

    return decorated_function


def require_staff(f):

    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'loggedin' not in session:
            return jsonify({'error': 'Not logged in'}), 401

        user_role = session.get('role')
        if user_role not in ['editor', 'admin', 'moderator']:
            return jsonify({'error': 'Insufficient permissions. Only staff can access this feature.'}), 403

        return f(*args, **kwargs)

    return decorated_function


def get_user_restrictions(user_id):
    try:
        with db.get_cursor() as cursor:
            # Check the user's basic status
            cursor.execute('''
                SELECT status, sharing_blocked FROM users WHERE user_id = %s
            ''', (user_id,))
            user_info = cursor.fetchone()

            if not user_info:
                return None

            restrictions = []

            # Check site blocking
            if user_info['status'] == 'banned':
                restrictions.append({
                    'type': 'site_ban',
                    'description': 'Your account has been banned from the site',
                    'reference_id': None
                })

            # Check sharing restrictions
            if user_info.get('sharing_blocked'):
                restrictions.append({
                    'type': 'sharing_block',
                    'description': 'You are blocked from sharing content',
                    'reference_id': None
                })

            # Check out the hidden journey
            cursor.execute('''
                SELECT journey_id, title FROM journeys 
                WHERE user_id = %s AND status = 'hidden'
            ''', (user_id,))
            hidden_journeys = cursor.fetchall()

            for journey in hidden_journeys:
                restrictions.append({
                    'type': 'hidden_journey',
                    'description': f'Your journey "{journey["title"]}" has been hidden',
                    'reference_id': journey['journey_id']
                })

            return restrictions

    except Exception as e:
        print(f"Error getting user restrictions: {e}")
        return None


def validate_appeal_data(data):
    """验证申诉数据"""
    appeal_type = data.get('appeal_type')
    justification = data.get('justification', '').strip()
    reference_id = data.get('reference_id')

    # Verification Appeal Type
    if appeal_type not in ['hidden_journey', 'sharing_block', 'site_ban']:
        return False, "Invalid appeal type"

    # Verify the grounds for appeal
    if not justification or len(justification) < 20:
        return False, "Justification must be at least 20 characters long"

    # If it is a hidden_journey type, reference_id must be provided
    if appeal_type == 'hidden_journey' and not reference_id:
        return False, "Journey ID is required for hidden journey appeals"

    return True, "Valid"


@app.route('/appeals/submit', methods=['GET', 'POST'])
@require_login
def submit_appeal():
    """用户提交申诉"""
    user_id = session['user_id']

    if request.method == 'GET':
        # Get the user's current restriction status
        restrictions = get_user_restrictions(user_id)

        if not restrictions:
            flash('You currently have no restrictions to appeal.', 'info')
            return redirect(url_for('dashboard'))

        # Check if there are any pending appeals
        try:
            with db.get_cursor() as cursor:
                cursor.execute('''
                    SELECT appeal_type, reference_id FROM appeals 
                    WHERE user_id = %s AND status = 'pending'
                ''', (user_id,))
                pending_appeals = cursor.fetchall()

                # Marking a restriction with a pending appeal
                for restriction in restrictions:
                    restriction['has_pending'] = any(
                        appeal['appeal_type'] == restriction['type'] and
                        appeal['reference_id'] == restriction['reference_id']
                        for appeal in pending_appeals
                    )
        except Exception as e:
            print(f"Error checking pending appeals: {e}")
            flash('Error loading appeal status. Please try again.', 'danger')
            return redirect(url_for('dashboard'))

        return render_template('submit_appeal.html', restrictions=restrictions)

    # POST Request for processing of appeal submission
    try:
        data = request.get_json() or request.form

        # Verify data
        is_valid, message = validate_appeal_data(data)
        if not is_valid:
            if request.is_json:
                return jsonify({'error': message}), 400
            flash(message, 'danger')
            return redirect(url_for('submit_appeal'))

        appeal_type = data.get('appeal_type')
        justification = data.get('justification', '').strip()
        reference_id = data.get('reference_id') if appeal_type == 'hidden_journey' else None

        # Check if there is already a pending appeal for the same issue
        with db.get_cursor() as cursor:
            cursor.execute('''
                SELECT appeal_id FROM appeals 
                WHERE user_id = %s AND appeal_type = %s 
                AND (reference_id = %s OR (reference_id IS NULL AND %s IS NULL))
                AND status = 'pending'
            ''', (user_id, appeal_type, reference_id, reference_id))

            existing_appeal = cursor.fetchone()
            if existing_appeal:
                message = 'You already have a pending appeal for this restriction.'
                if request.is_json:
                    return jsonify({'error': message}), 400
                flash(message, 'warning')
                return redirect(url_for('submit_appeal'))

            # Submit a new appeal
            cursor.execute('''
                INSERT INTO appeals (user_id, appeal_type, reference_id, justification)
                VALUES (%s, %s, %s, %s)
            ''', (user_id, appeal_type, reference_id, justification))

            db.get_db().commit()

        message = 'Your appeal has been submitted successfully. You will be notified once it is reviewed.'
        if request.is_json:
            return jsonify({'success': True, 'message': message})

        flash(message, 'success')
        return redirect(url_for('dashboard'))

    except Exception as e:
        print(f"Error submitting appeal: {e}")
        message = 'An error occurred while submitting your appeal. Please try again.'
        if request.is_json:
            return jsonify({'error': message}), 500
        flash(message, 'danger')
        return redirect(url_for('submit_appeal'))


@app.route('/appeals/my_appeals')
@require_login
def my_appeals():
    """用户查看自己的申诉历史"""
    user_id = session['user_id']

    try:
        with db.get_cursor() as cursor:
            cursor.execute('''
                SELECT a.*, j.title as journey_title,
                       u.username as reviewer_username
                FROM appeals a
                LEFT JOIN journeys j ON a.reference_id = j.journey_id AND a.appeal_type = 'hidden_journey'
                LEFT JOIN users u ON a.reviewed_by = u.user_id
                WHERE a.user_id = %s
                ORDER BY a.created_at DESC
            ''', (user_id,))

            appeals = cursor.fetchall()

            # Formatting complaint data
            for appeal in appeals:
                appeal['type_display'] = {
                    'hidden_journey': 'Hidden Journey',
                    'sharing_block': 'Sharing Block',
                    'site_ban': 'Site Ban'
                }.get(appeal['appeal_type'], appeal['appeal_type'])

                if appeal['appeal_type'] == 'hidden_journey' and appeal['journey_title']:
                    appeal['description'] = f'Journey: "{appeal["journey_title"]}"'
                else:
                    appeal['description'] = appeal['type_display']

        return render_template('my_appeals.html', appeals=appeals)

    except Exception as e:
        print(f"Error loading user appeals: {e}")
        flash('Error loading your appeals. Please try again.', 'danger')
        return redirect(url_for('dashboard'))


@app.route('/appeals/queue')
@require_staff
def appeals_queue():
    """管理员查看申诉队列"""
    try:
        # Get filter parameters
        status_filter = request.args.get('status', 'pending')
        type_filter = request.args.get('type', '')

        with db.get_cursor() as cursor:
            # Constructing a query
            query = '''
                SELECT a.*, u.username, u.email,
                       j.title as journey_title,
                       reviewer.username as reviewer_username
                FROM appeals a
                JOIN users u ON a.user_id = u.user_id
                LEFT JOIN journeys j ON a.reference_id = j.journey_id AND a.appeal_type = 'hidden_journey'
                LEFT JOIN users reviewer ON a.reviewed_by = reviewer.user_id
                WHERE 1=1
            '''
            params = []

            if status_filter:
                query += ' AND a.status = %s'
                params.append(status_filter)

            if type_filter:
                query += ' AND a.appeal_type = %s'
                params.append(type_filter)

            query += ' ORDER BY a.created_at ASC'

            cursor.execute(query, params)
            appeals = cursor.fetchall()

            # Formatting complaint data
            for appeal in appeals:
                appeal['type_display'] = {
                    'hidden_journey': 'Hidden Journey',
                    'sharing_block': 'Sharing Block',
                    'site_ban': 'Site Ban'
                }.get(appeal['appeal_type'], appeal['appeal_type'])

        return render_template('appeals_queue.html',
                               appeals=appeals,
                               current_status=status_filter,
                               current_type=type_filter)

    except Exception as e:
        print(f"Error loading appeals queue: {e}")
        flash('Error loading appeals queue. Please try again.', 'danger')
        return redirect(url_for('dashboard'))


@app.route('/appeals/<int:appeal_id>/review', methods=['POST'])
@require_staff
def review_appeal(appeal_id):
    """管理员处理申诉"""
    try:
        data = request.get_json() or request.form
        decision = data.get('decision')  # 'approved' or 'rejected'
        admin_response = data.get('admin_response', '').strip()

        if decision not in ['approved', 'rejected']:
            return jsonify({'error': 'Invalid decision'}), 400

        if not admin_response or len(admin_response) < 10:
            return jsonify({'error': 'Admin response must be at least 10 characters long'}), 400

        reviewer_id = session['user_id']

        with db.get_cursor() as cursor:
            # Get complaint information
            cursor.execute('''
                SELECT * FROM appeals WHERE appeal_id = %s
            ''', (appeal_id,))
            appeal = cursor.fetchone()

            if not appeal:
                return jsonify({'error': 'Appeal not found'}), 404

            if appeal['status'] != 'pending':
                return jsonify({'error': 'This appeal has already been reviewed'}), 400

            # Update appeal status
            cursor.execute('''
                UPDATE appeals 
                SET status = %s, reviewed_at = %s, reviewed_by = %s, admin_response = %s
                WHERE appeal_id = %s
            ''', (decision, datetime.now(), reviewer_id, admin_response, appeal_id))

            # If the appeal is approved, remove the restrictions
            if decision == 'approved':
                if appeal['appeal_type'] == 'site_ban':
                    cursor.execute('''
                        UPDATE users SET status = 'active' WHERE user_id = %s
                    ''', (appeal['user_id'],))

                elif appeal['appeal_type'] == 'sharing_block':
                    cursor.execute('''
                        UPDATE users SET sharing_blocked = FALSE WHERE user_id = %s
                    ''', (appeal['user_id'],))

                elif appeal['appeal_type'] == 'hidden_journey':
                    cursor.execute('''
                        UPDATE journeys SET status = 'open' WHERE journey_id = %s
                    ''', (appeal['reference_id'],))

            db.get_db().commit()

        # Notify users (you can add email notifications, etc. here)
        flash(f'Appeal has been {decision}. User will be notified.', 'success')

        return jsonify({
            'success': True,
            'message': f'Appeal {decision} successfully',
            'decision': decision
        })

    except Exception as e:
        print(f"Error reviewing appeal: {e}")
        return jsonify({'error': 'An error occurred while processing the appeal'}), 500


@app.route('/api/appeals/stats')
@require_staff
def appeals_stats():
    """获取申诉统计信息（可选功能）"""
    try:
        with db.get_cursor() as cursor:
            # Count the number of complaints in each status
            cursor.execute('''
                SELECT status, COUNT(*) as count 
                FROM appeals 
                GROUP BY status
            ''')
            status_stats = {row['status']: row['count'] for row in cursor.fetchall()}

            # Statistics on the number of complaints of various types
            cursor.execute('''
                SELECT appeal_type, COUNT(*) as count 
                FROM appeals 
                GROUP BY appeal_type
            ''')
            type_stats = {row['appeal_type']: row['count'] for row in cursor.fetchall()}

            return jsonify({
                'status_stats': status_stats,
                'type_stats': type_stats
            })

    except Exception as e:
        print(f"Error getting appeals stats: {e}")
        return jsonify({'error': 'Error loading statistics'}), 500


# Helper function: Check if the user can submit a complaint
def can_user_appeal(user_id, appeal_type, reference_id=None):
    """检查用户是否可以提交特定类型的申诉"""
    try:
        with db.get_cursor() as cursor:
            # Check if there is already a pending appeal for the same issue
            cursor.execute('''
                SELECT appeal_id FROM appeals 
                WHERE user_id = %s AND appeal_type = %s 
                AND (reference_id = %s OR (reference_id IS NULL AND %s IS NULL))
                AND status = 'pending'
            ''', (user_id, appeal_type, reference_id, reference_id))

            return cursor.fetchone() is None

    except Exception as e:
        print(f"Error checking appeal eligibility: {e}")
        return False


# Add the following additional routes to the end of the appeals.py file

@app.route('/api/user/restrictions')
@require_login
def check_user_restrictions():
    """API端点：检查用户是否有限制（用于dashboard显示）"""
    user_id = session['user_id']
    restrictions = get_user_restrictions(user_id)

    return jsonify({
        'has_restrictions': bool(restrictions),
        'restriction_count': len(restrictions) if restrictions else 0,
        'restrictions': restrictions
    })


@app.route('/appeals/bulk_review', methods=['POST'])
@require_staff
def bulk_review_appeals():
    """批量处理申诉（可选功能）"""
    try:
        data = request.get_json()
        appeal_ids = data.get('appeal_ids', [])
        decision = data.get('decision')  # 'approved' or 'rejected'
        admin_response = data.get('admin_response', '').strip()

        if not appeal_ids:
            return jsonify({'error': 'No appeals selected'}), 400

        if decision not in ['approved', 'rejected']:
            return jsonify({'error': 'Invalid decision'}), 400

        if not admin_response or len(admin_response) < 10:
            return jsonify({'error': 'Admin response must be at least 10 characters long'}), 400

        reviewer_id = session['user_id']
        processed_count = 0

        with db.get_cursor() as cursor:
            for appeal_id in appeal_ids:
                # Get complaint information
                cursor.execute('SELECT * FROM appeals WHERE appeal_id = %s AND status = "pending"', (appeal_id,))
                appeal = cursor.fetchone()

                if appeal:
                    # Update appeal status
                    cursor.execute('''
                        UPDATE appeals 
                        SET status = %s, reviewed_at = %s, reviewed_by = %s, admin_response = %s
                        WHERE appeal_id = %s
                    ''', (decision, datetime.now(), reviewer_id, admin_response, appeal_id))

                    # If approved, remove restrictions
                    if decision == 'approved':
                        if appeal['appeal_type'] == 'site_ban':
                            cursor.execute('UPDATE users SET status = "active" WHERE user_id = %s',
                                           (appeal['user_id'],))
                        elif appeal['appeal_type'] == 'sharing_block':
                            cursor.execute('UPDATE users SET sharing_blocked = FALSE WHERE user_id = %s',
                                           (appeal['user_id'],))
                        elif appeal['appeal_type'] == 'hidden_journey':
                            cursor.execute('UPDATE journeys SET status = "open" WHERE journey_id = %s',
                                           (appeal['reference_id'],))

                    processed_count += 1

            db.get_db().commit()

        return jsonify({
            'success': True,
            'message': f'{processed_count} appeals processed successfully',
            'processed_count': processed_count
        })

    except Exception as e:
        print(f"Error in bulk review: {e}")
        return jsonify({'error': 'An error occurred during bulk processing'}), 500


# Add limit checking helper functions to other related modules
def check_sharing_restrictions(user_id):
    """检查用户是否被限制分享"""
    try:
        with db.get_cursor() as cursor:
            cursor.execute('SELECT sharing_blocked FROM users WHERE user_id = %s', (user_id,))
            result = cursor.fetchone()
            return result and result.get('sharing_blocked', False)
    except Exception as e:
        print(f"Error checking sharing restrictions: {e}")
        return False


def check_site_ban(user_id):
    """检查用户是否被站点封禁"""
    try:
        with db.get_cursor() as cursor:
            cursor.execute('SELECT status FROM users WHERE user_id = %s', (user_id,))
            result = cursor.fetchone()
            return result and result.get('status') == 'banned'
    except Exception as e:
        print(f"Error checking site ban: {e}")
        return False