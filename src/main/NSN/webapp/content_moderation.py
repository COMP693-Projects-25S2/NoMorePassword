from webapp import app
from webapp import db
from flask import redirect, render_template, request, session, url_for, flash, jsonify
from datetime import datetime
from werkzeug.utils import secure_filename
import os

# Modify the moderation_dashboard function to ensure that reports for all states can be seen
@app.route('/moderation/content/dashboard')
def moderation_content_dashboard():
    """统一的管理面板 - 只显示Journey Reports"""
    if 'loggedin' not in session or session.get('role') not in ['admin', 'editor', 'moderator']:
        flash('You do not have permission to access this page.', 'danger')
        return redirect(url_for('index'))

    user_role = session.get('role')
    reported_journeys = []

    try:
        with db.get_cursor() as cursor:
            # Get all journey reports
            cursor.execute('''
                SELECT 
                    jr.report_id,
                    jr.journey_id,
                    jr.reason,
                    jr.details,
                    jr.status,
                    jr.created_at as report_created_at,
                    jr.reviewed_at,
                    jr.admin_response,
                    j.title as journey_title,
                    j.description as journey_description,
                    j.user_id as journey_owner_id,
                    j.status as journey_status,
                    reporter.username as reporter_username,
                    reporter.user_id as reporter_id,
                    owner.username as journey_owner_username,
                    reviewer.username as reviewer_username
                FROM journey_reports jr
                JOIN journeys j ON jr.journey_id = j.journey_id
                JOIN users reporter ON jr.reporter_id = reporter.user_id
                JOIN users owner ON j.user_id = owner.user_id
                LEFT JOIN users reviewer ON jr.reviewed_by = reviewer.user_id
                WHERE jr.status IN ('pending', 'reviewed', 'dismissed')
                ORDER BY 
                    CASE jr.status 
                        WHEN 'pending' THEN 1 
                        ELSE 2 
                    END,
                    jr.created_at DESC
            ''')

            reported_journeys = cursor.fetchall()
            db.close_db()

    except Exception as e:
        print(f"Error fetching journey reports: {e}")
        flash('Error loading journey reports.', 'danger')
        reported_journeys = []

    return render_template('moderation_content_dashboard.html',
                           reported_journeys=reported_journeys,
                           current_user_role=user_role)

# Modify the moderation_action function and add a new action type
@app.route('/moderation/content/action/<int:report_id>', methods=['POST'])
def moderation_content_action(report_id):
    if 'loggedin' not in session or session.get('role') not in ['admin', 'editor', 'moderator']:
        return jsonify({'success': False, 'message': 'Permission denied.'}), 403

    action = request.form.get('action')
    moderator_id = session['user_id']
    current_time = datetime.now()
    conn = None

    try:
        conn = db.get_db()
        with db.get_cursor() as cursor:
            # Get report details, including comment_id
            cursor.execute("SELECT * FROM journey_reports WHERE report_id = %s", (report_id,))
            report = cursor.fetchone()
            if not report:
                return jsonify({'success': False, 'message': 'Report not found.'}), 404
            
            journey_id = report['journey_id']

            if action == 'hide_journey':
                admin_response = request.form.get('admin_response', 'No admin response provided.')
                # Hide the journey
                cursor.execute("""
                    UPDATE journeys 
                    SET status = 'hidden'
                    WHERE journey_id = %s
                """, (journey_id,))

                # Update the report status to hidden
                cursor.execute("""
                    UPDATE journey_reports 
                    SET status = 'hidden', admin_response = %s, reviewed_at = %s, reviewed_by = %s
                    WHERE report_id = %s
                """, (admin_response, current_time, moderator_id, report_id,))
               
                message = 'Content hidden successfully.'

            elif action == 'dismiss':
                admin_response = request.form.get('admin_response', 'No admin response provided.')
                # Update report status to dismissed
                cursor.execute("""
                    UPDATE journey_reports 
                    SET status = 'dismissed',admin_response = %s, reviewed_by = %s, reviewed_at = %s 
                    WHERE report_id = %s
                """, (admin_response, moderator_id, current_time, report_id,))
                message = 'Report dismissed successfully.'

            elif action == 'ban_user':
                admin_response = request.form.get('admin_response', 'No admin response provided.')
                # Check if the current user is admin
                if session.get('role') != 'admin':
                    return jsonify({'success': False, 'message': 'Only Admins can ban users.'}), 403
                
                # Get the journey's user_id
                cursor.execute("""
                    SELECT j.user_id
                    from journey_reports jr
                    join journeys j on jr.journey_id=j.journey_id
                    WHERE jr.report_id = %s
                """, (report_id,))
                journey_author = cursor.fetchone()
                
                if not journey_author:
                    return jsonify({'success': False, 'message': 'Comment author not found.'}), 404
                
                # Disable User Account
                cursor.execute("""
                    UPDATE users
                    SET status = 'banned'
                    WHERE user_id = %s
                """, (journey_author['user_id'],))
                
                # Update report status to reviewed
                cursor.execute("""
                    UPDATE journey_reports 
                    SET status = 'reviewed',admin_response = %s, reviewed_by = %s, reviewed_at = %s 
                    WHERE report_id = %s
                """, (admin_response,moderator_id, current_time, report_id,))
                
                message = 'User has been banned and report marked as reviewed.'

            
            else:
                return jsonify({'success': False, 'message': 'Invalid action.'}), 400

            conn.commit()
            return jsonify({'success': True, 'message': message})

    except Exception as e:
        if conn:
            conn.rollback()
        print(f"Error in moderation_action: {e}") # For debugging
        return jsonify({'success': False, 'message': f'An error occurred: {str(e)}'}), 500
    finally:
        if conn:
            db.close_db() # Ensure connection is closed


@app.route('/moderation/connent/journey_batch_action', methods=['POST'])
def journey_batch_moderation_action():
    """批量处理journey报告"""
    if 'loggedin' not in session or session.get('role') not in ['admin', 'editor']:
        return jsonify({'success': False, 'message': 'Permission denied.'}), 403

    data = request.get_json()
    report_ids = data.get('report_ids', [])
    action = data.get('action')

    if not report_ids or not action:
        return jsonify({'success': False, 'message': 'Missing required parameters.'}), 400

    if action not in ['dismiss', 'hide_journey']:
        return jsonify({'success': False, 'message': 'Invalid action.'}), 400

    moderator_id = session['user_id']
    current_time = datetime.now()
    processed_count = 0

    try:
        conn = db.get_db()
        with db.get_cursor() as cursor:
            for report_id in report_ids:
                # Get report information
                cursor.execute('''
                    SELECT jr.journey_id, jr.status 
                    FROM journey_reports jr
                    WHERE jr.report_id = %s AND jr.status = 'pending'
                ''', (report_id,))

                report = cursor.fetchone()
                if not report:
                    continue

                if action == 'dismiss':
                    cursor.execute('''
                        UPDATE journey_reports 
                        SET status = 'dismissed', reviewed_by = %s, reviewed_at = %s, admin_response = %s
                        WHERE report_id = %s
                    ''', (moderator_id, current_time, 'Batch dismissed by moderator', report_id))

                elif action == 'hide_journey':
                    # Hide Journey
                    cursor.execute('''
                        UPDATE journeys 
                        SET status = 'hidden' 
                        WHERE journey_id = %s
                    ''', (report['journey_id'],))

                    # Update report status
                    cursor.execute('''
                        UPDATE journey_reports 
                        SET status = 'reviewed', reviewed_by = %s, reviewed_at = %s, admin_response = %s
                        WHERE report_id = %s
                    ''', (moderator_id, current_time, 'Journey hidden via batch action', report_id))

                processed_count += 1

            conn.commit()

        return jsonify({
            'success': True,
            'message': f'Successfully processed {processed_count} reports.'
        })

    except Exception as e:
        if conn:
            conn.rollback()
        print(f"Error in batch journey moderation: {e}")
        return jsonify({'success': False, 'message': f'An error occurred: {str(e)}'}), 500

    finally:
        if conn:
            db.close_db()
