"""
Edit log function module 
This module handles the editing operation records of editors and administrators on journeys and events
"""

from webapp import app, db
from flask import request, session, jsonify
from functools import wraps
from datetime import datetime


def require_editor_or_admin(f):

    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'loggedin' not in session:
            return jsonify({'error': 'Not logged in'}), 401

        user_role = session.get('role')
        if user_role not in ['editor', 'admin']:
            return jsonify({'error': 'Insufficient permissions. Only editors and admins can perform this action.'}), 403

        return f(*args, **kwargs)

    return decorated_function


def log_edit(journey_id, event_id, editor_id, edit_type, field_changed, old_value, new_value, reason):
    try:
        with db.get_cursor() as cursor:
            cursor.execute('''
                INSERT INTO edit_logs 
                (journey_id, event_id, editor_id, edit_type, field_changed, old_value, new_value, edit_reason)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ''', (journey_id, event_id, editor_id, edit_type, field_changed, old_value, new_value, reason))
            db.close_db()
            return True
    except Exception as e:
        print(f"Error logging edit: {e}")
        return False


def check_no_edits_flag(journey_id, event_id=None):
    try:
        with db.get_cursor() as cursor:
            # Check the edit-prohibited flag at the trip level and get the user's membership information
            cursor.execute('''
                SELECT j.no_edits_flag, j.user_id, j.no_edits_set_by,
                       m.m_status, m.end_time
                FROM journeys j
                LEFT JOIN members m ON j.user_id = m.user_id
                WHERE j.journey_id = %s
            ''', (journey_id,))
            journey = cursor.fetchone()

            if journey and journey.get('no_edits_flag'):
                # Check if the user setting up the protection is/was a paid subscriber
                has_subscription_history = (journey.get('m_status') in ['active', 'expired'])

                # If the user has a subscription history (including expired), the protection is still valid
                if has_subscription_history:
                    return True

            # If it is event editing, also check the event level tags
            if event_id:
                cursor.execute("SELECT no_edits_flag FROM events WHERE event_id = %s", (event_id,))
                event = cursor.fetchone()
                if event and event.get('no_edits_flag'):
                    return True

            return False
    except Exception as e:
        print(f"Error checking no_edits_flag: {e}")
        return False


def get_journey_owner(journey_id):
    try:
        with db.get_cursor() as cursor:
            cursor.execute("SELECT user_id FROM journeys WHERE journey_id = %s", (journey_id,))
            result = cursor.fetchone()
            return result['user_id'] if result else None
    except Exception as e:
        print(f"Error getting journey owner: {e}")
        return None


def validate_edit_reason(reason):
    if not reason or not reason.strip():
        return False, "Edit reason is required"

    if len(reason.strip()) < 10:
        return False, "Edit reason must be at least 10 characters long"

    return True, "Valid"


# Editing a journey's API route
@app.route('/api/admin/journey/<int:journey_id>/edit', methods=['POST'])
@require_editor_or_admin
def admin_edit_journey_with_logging(journey_id):
    """管理员/编辑者编辑旅程接口（带编辑日志）- 增强版"""
    try:
        data = request.get_json()

        # Verify Edit Reason
        edit_reason = data.get('edit_reason', '').strip()
        is_valid, message = validate_edit_reason(edit_reason)
        if not is_valid:
            return jsonify({'error': message}), 400

        # Enhanced No Editing Check
        user_role = session.get('role')
        editor_id = session['user_id']

        with db.get_cursor() as cursor:
            # Get trip information and protection status
            cursor.execute('''
                SELECT j.no_edits_flag, j.user_id, j.title,
                       m.m_status, m.end_time
                FROM journeys j
                LEFT JOIN members m ON j.user_id = m.user_id
                WHERE j.journey_id = %s
            ''', (journey_id,))
            journey_info = cursor.fetchone()

            if not journey_info:
                return jsonify({'error': 'Journey not found'}), 404

            # Check No Edits protection
            if journey_info['no_edits_flag']:
                has_subscription_history = journey_info['m_status'] in ['active', 'expired']

                if has_subscription_history and user_role != 'admin':
                    return jsonify({
                        'error': 'This journey is protected by No-Edits setting. Only administrators can override this protection.'
                    }), 403
                elif has_subscription_history and user_role == 'admin':
                    # Administrator override protection, record special logs
                    log_edit(journey_id, None, editor_id, 'admin_override',
                             'no_edits_protection', 'protected', 'admin_override',
                             f"Admin override of No-Edits protection: {edit_reason}")

        # Get current trip data
        with db.get_cursor() as cursor:
            cursor.execute('''
                SELECT title, description, start_date, display, status 
                FROM journeys WHERE journey_id = %s
            ''', (journey_id,))
            current_journey = cursor.fetchone()

            if not current_journey:
                return jsonify({'error': 'Journey not found'}), 404

        # Compare and log changes
        changes_made = []
        update_fields = []
        update_values = []

        # Check the changes in each field
        field_mappings = {
            'title': 'title',
            'description': 'description',
            'start_date': 'start_date',
            'display': 'display',
            'status': 'status'
        }

        for field_name, db_field in field_mappings.items():
            new_value = data.get(field_name)
            if new_value is not None and str(new_value).strip() != str(current_journey[db_field]):
                # Record edit log
                log_edit(journey_id, None, editor_id, 'journey_edit', field_name,
                         str(current_journey[db_field]), str(new_value), edit_reason)
                changes_made.append(field_name)
                update_fields.append(f'{db_field} = %s')
                update_values.append(new_value)

        if not changes_made:
            return jsonify({'error': 'No changes detected'}), 400

        # Update trip data
        update_values.append(journey_id)
        with db.get_cursor() as cursor:
            cursor.execute(f'''
                UPDATE journeys 
                SET {', '.join(update_fields)}
                WHERE journey_id = %s
            ''', update_values)
            db.close_db()

        return jsonify({
            'success': True,
            'message': f'Journey updated successfully. Changes: {", ".join(changes_made)}',
            'changes': changes_made,
            'admin_override': journey_info['no_edits_flag'] and user_role == 'admin'
        })

    except Exception as e:
        print(f"Error in admin_edit_journey_with_logging: {e}")
        return jsonify({'error': 'An internal error occurred'}), 500


# Adding new helper functions
def get_user_subscription_status(user_id):
    try:
        with db.get_cursor() as cursor:
            cursor.execute('''
                SELECT m.m_status, m.end_time, u.role
                FROM users u
                LEFT JOIN members m ON u.user_id = m.user_id
                WHERE u.user_id = %s
            ''', (user_id,))
            result = cursor.fetchone()
            db.close_db()

            if not result:
                return {'is_staff': False, 'is_active_subscriber': False, 'has_subscription_history': False}

            is_staff = result['role'] in ['admin', 'editor', 'moderator']
            is_active_subscriber = (result['m_status'] == 'active' and
                                    result['end_time'] and
                                    result['end_time'] > datetime.now())
            has_subscription_history = result['m_status'] in ['active', 'expired']

            return {
                'is_staff': is_staff,
                'is_active_subscriber': is_active_subscriber,
                'has_subscription_history': has_subscription_history,
                'subscription_status': result['m_status'],
                'end_time': result['expiry_date']
            }
    except Exception as e:
        print(f"Error getting subscription status: {e}")
        return {'is_staff': False, 'is_active_subscriber': False, 'has_subscription_history': False}

# Editing the API route for an event
@app.route('/api/admin/event/<int:event_id>/edit', methods=['POST'])
@require_editor_or_admin
def admin_edit_event_with_logging(event_id):
    """管理员/编辑者编辑事件接口（带编辑日志）"""
    try:
        data = request.get_json()

        # Verify Edit Reason
        edit_reason = data.get('edit_reason', '').strip()
        is_valid, message = validate_edit_reason(edit_reason)
        if not is_valid:
            return jsonify({'error': message}), 400

        # Get the current event data and the corresponding journey ID
        with db.get_cursor() as cursor:
            cursor.execute('''
                SELECT e.journey_id, e.title, e.description, e.start_time, e.end_time, e.location_id, e.display
                FROM events e WHERE e.event_id = %s
            ''', (event_id,))
            current_event = cursor.fetchone()

            if not current_event:
                return jsonify({'error': 'Event not found'}), 404

        journey_id = current_event['journey_id']

        # Check the No Editing flag
        if check_no_edits_flag(journey_id, event_id):
            return jsonify({'error': 'This event is protected from editing'}), 403

        # Compare and log changes
        editor_id = session['user_id']
        changes_made = []
        update_fields = []
        update_values = []

        # Check the changes in each field
        field_mappings = {
            'title': 'title',
            'description': 'description',
            'start_time': 'start_time',
            'end_time': 'end_time',
            'location_id': 'location_id',
            'display': 'display'
        }

        for field_name, db_field in field_mappings.items():
            new_value = data.get(field_name)
            if new_value is not None and str(new_value) != str(current_event[db_field]):
                # Record edit log
                log_edit(journey_id, event_id, editor_id, 'event_edit', field_name,
                         str(current_event[db_field]), str(new_value), edit_reason)
                changes_made.append(field_name)
                update_fields.append(f'{db_field} = %s')
                update_values.append(new_value)

        if not changes_made:
            return jsonify({'error': 'No changes detected'}), 400

        # Update event data
        update_values.append(event_id)
        with db.get_cursor() as cursor:
            cursor.execute(f'''
                UPDATE events 
                SET {', '.join(update_fields)}
                WHERE event_id = %s
            ''', update_values)
            db.close_db()

        return jsonify({
            'success': True,
            'message': f'Event updated successfully. Changes: {", ".join(changes_made)}',
            'changes': changes_made
        })

    except Exception as e:
        print(f"Error in admin_edit_event_with_logging: {e}")
        return jsonify({'error': 'An internal error occurred'}), 500


# API route for getting edit history
@app.route('/api/journey/<int:journey_id>/edit_logs')
def get_journey_edit_logs(journey_id):
    try:
        # Check User Permissions
        if 'loggedin' not in session:
            return jsonify({'error': 'Not logged in'}), 401

        user_id = session['user_id']
        user_role = session.get('role')

        # Check if you are the journey owner, paid subscriber, or administrator
        journey_owner_id = get_journey_owner(journey_id)
        if not journey_owner_id:
            return jsonify({'error': 'Journey not found'}), 404

        # Permission check: Journey owner, admin or editor can view
        if user_id != journey_owner_id and user_role not in ['admin', 'editor']:
            return jsonify({'error': 'Permission denied'}), 403

        # Get edit history
        with db.get_cursor() as cursor:
            cursor.execute('''
                SELECT 
                    el.log_id,
                    el.edit_type,
                    el.field_changed,
                    el.old_value,
                    el.new_value,
                    el.edit_reason,
                    el.created_at,
                    u.username as editor_name,
                    u.first_name,
                    u.last_name,
                    e.title as event_title
                FROM edit_logs el
                JOIN users u ON el.editor_id = u.user_id
                LEFT JOIN events e ON el.event_id = e.event_id
                WHERE el.journey_id = %s
                ORDER BY el.created_at DESC
                LIMIT 50
            ''', (journey_id,))

            logs = cursor.fetchall()

            # Formatting returned data
            formatted_logs = []
            for log in logs:
                formatted_log = {
                    'log_id': log['log_id'],
                    'edit_type': log['edit_type'],
                    'field_changed': log['field_changed'],
                    'old_value': log['old_value'],
                    'new_value': log['new_value'],
                    'edit_reason': log['edit_reason'],
                    'created_at': log['created_at'].isoformat() if log['created_at'] else None,
                    'editor_name': log['editor_name'],
                    'editor_full_name': f"{log['first_name']} {log['last_name']}" if log['first_name'] and log[
                        'last_name'] else log['editor_name'],
                    'event_title': log['event_title']
                }
                formatted_logs.append(formatted_log)

            return jsonify({
                'success': True,
                'journey_id': journey_id,
                'logs': formatted_logs,
                'total_logs': len(formatted_logs)
            })

    except Exception as e:
        print(f"Error getting edit logs: {e}")
        return jsonify({'error': 'An internal error occurred'}), 500

