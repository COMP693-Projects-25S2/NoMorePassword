from webapp import app
from webapp import db
from flask import redirect, render_template, request, session, url_for, flash, jsonify
from datetime import datetime
from werkzeug.utils import secure_filename
import os


@app.route('/moderation/comment/dashboard')
def moderation_comment_dashboard():
    if 'loggedin' not in session or session.get('role') not in ['admin', 'editor', 'moderator' ]:
        flash('You do not have permission to access this page.', 'danger')
        return redirect(url_for('index')) # Or your main page

    user_role = session.get('role')
   
    reports_to_fetch = ['pending', 'hidden', 'escalated', 'reviewed', 'dismissed']
    
    reported_comments = [] # Initialize in case reports_to_fetch is empty
    if reports_to_fetch: # Proceed only if there are statuses to fetch
        with db.get_cursor() as cursor:
            placeholders = ', '.join(['%s'] * len(reports_to_fetch))
            sql = f"""
                SELECT
                    cr.report_id, cr.comment_id, cr.user_id AS reporter_id, cr.reason AS report_reason,
                    cr.details AS report_details, cr.status AS report_status, cr.created_at AS report_created_at,
                    ec.content AS comment_content, ec.user_id AS comment_author_id, ec.event_id,
                    ec.is_hidden, 
                    reporter.username AS reporter_username,
                    author.username AS comment_author_username,
                    author.user_id AS author_user_id,
                    e.title AS event_title,
                    e.journey_id,
                    jny.title AS journey_title_for_report
                FROM comment_reports cr
                JOIN event_comments ec ON cr.comment_id = ec.comment_id
                JOIN users reporter ON cr.user_id = reporter.user_id
                JOIN users author ON ec.user_id = author.user_id
                JOIN events e ON ec.event_id = e.event_id
                JOIN journeys jny ON e.journey_id = jny.journey_id
                WHERE cr.status IN ({placeholders})
                ORDER BY CASE cr.status
                            WHEN 'escalated' THEN 1
                            ELSE 2
                         END, cr.created_at DESC
            """
            cursor.execute(sql, tuple(reports_to_fetch))
            reported_comments = cursor.fetchall()
        db.close_db()
    return render_template('moderation_comment_dashboard.html', reported_comments=reported_comments, current_user_role=user_role)


@app.route('/moderation/comment/action/<int:report_id>', methods=['POST'])
def moderation_comment_action(report_id):
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
            cursor.execute("SELECT comment_id, status FROM comment_reports WHERE report_id = %s", (report_id,))
            report = cursor.fetchone()
            if not report:
                return jsonify({'success': False, 'message': 'Report not found.'}), 404
            
            comment_id = report['comment_id']
            affected_reports = 0
            if action == 'hide':
                moderation_reason = request.form.get('moderation_reason', 'No reason provided.')
                # Hide the comment
                cursor.execute("""
                    UPDATE event_comments 
                    SET is_hidden = TRUE, moderation_reason = %s, moderator_id = %s, moderated_at = %s
                    WHERE comment_id = %s
                """, (moderation_reason, moderator_id, current_time, comment_id))
                # Update ALL reports for this comment to 'hidden' status
                cursor.execute("""
                    UPDATE comment_reports 
                    SET status = 'hidden', reviewed_by = %s, reviewed_at = %s 
                    WHERE comment_id = %s AND status = 'pending'
                """, (moderator_id, current_time, comment_id))
                affected_reports = cursor.rowcount
                message = 'Comment hidden successfully.'


            elif action == 'escalate_to_admin':
                # Update report status is escalated
                cursor.execute("""
                    UPDATE comment_reports 
                    SET status = 'escalated', reviewed_by = %s, reviewed_at = %s 
                    WHERE report_id = %s
                """, (moderator_id, current_time, report_id))
                affected_reports = 1
                message = 'Report escalated to admin successfully.'

            elif action == 'ban_user':
                # Check if the current user is admin
                if session.get('role') != 'admin':
                    return jsonify({'success': False, 'message': 'Only Admins can ban users.'}), 403
                
                # Get the comment author's user_id
                cursor.execute("""
                    SELECT ec.user_id 
                    FROM event_comments ec
                    JOIN comment_reports cr ON ec.comment_id = cr.comment_id
                    WHERE cr.report_id = %s
                """, (report_id,))
                comment_author = cursor.fetchone()
                
                if not comment_author:
                    return jsonify({'success': False, 'message': 'Comment author not found.'}), 404
                
                # Disable User Account
                cursor.execute("""
                    UPDATE users
                    SET status = 'banned'
                    WHERE user_id = %s
                """, (comment_author['user_id'],))
                
                # Update ALL reports for this comment to 'reviewed' status
                cursor.execute("""
                    UPDATE comment_reports 
                    SET status = 'reviewed', reviewed_by = %s, reviewed_at = %s 
                    WHERE comment_id = %s AND status IN ('pending', 'hidden', 'escalated')
                """, (moderator_id, current_time, comment_id))
                affected_reports = cursor.rowcount
                message = 'User has been banned and report marked as reviewed.'

            elif action == 'dismiss':
                #   Dismiss ALL reports for this comment
                cursor.execute("""
                    UPDATE comment_reports 
                    SET status = 'dismissed', reviewed_by = %s, reviewed_at = %s 
                    WHERE comment_id = %s AND status IN ('pending', 'hidden', 'escalated')
                """, (moderator_id, current_time, comment_id))
                affected_reports = cursor.rowcount
                message = 'Report(s) dismissed successfully.'
            
            else:
                return jsonify({'success': False, 'message': 'Invalid action.'}), 400

            conn.commit()
            return jsonify({'success': True, 'message': message, 'affected_reports': affected_reports}), 200

    except Exception as e:
        if conn:
            conn.rollback()
        print(f"Error in moderation_action: {e}") # For debugging
        return jsonify({'success': False, 'message': f'An error occurred: {str(e)}'}), 500
    finally:
        if conn:
            db.close_db() # Ensure connection is closed