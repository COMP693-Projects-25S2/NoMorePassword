# from webapp import app
from webapp import db
from flask import Blueprint, redirect, render_template, request, session, url_for, flash, jsonify
from datetime import datetime
from werkzeug.utils import secure_filename
import os
from webapp.utils import rebuildImageUrl


def is_staff():
    return session.get('role') in ('admin', 'editor', 'moderator')


def is_paid_subscriber(user_id):
    with db.get_cursor() as cursor:
        cursor.execute('''
            SELECT 1 FROM members
            WHERE user_id = %s AND m_status = 'subscribed' AND end_time > NOW()
        ''', (user_id,))
        return cursor.fetchone() is not None
    

def can_send_private_message():
    user_id = session.get('user_id')
    
    return is_staff() or is_paid_subscriber(user_id)

message_bp = Blueprint('message', __name__)

@message_bp.route('/message/send', methods=['POST'])
def send_message():
    if not can_send_private_message():
        return jsonify({'success': False, 'message': 'Only premium or staff can send messages.'}), 403
    sender_id = session['user_id']
    recipient_id = int(request.form['recipient_id'])
    content = request.form['content'].strip()
    if not content:
        return jsonify({'success': False, 'message': 'Message cannot be empty.'}), 400

    # Find or create a session
    with db.get_cursor() as cursor:
        cursor.execute('''
            SELECT conversation_id FROM conversations 
            WHERE (user1_id=%s AND user2_id=%s) OR (user1_id=%s AND user2_id=%s)
        ''', (sender_id, recipient_id, recipient_id, sender_id))
        row = cursor.fetchone()
        if row:
            conversation_id = row['conversation_id']
            cursor.execute('UPDATE conversations SET last_message_at=NOW() WHERE conversation_id=%s', (conversation_id,))
        else:
            cursor.execute('INSERT INTO conversations (user1_id, user2_id) VALUES (%s, %s)', 
                           (min(sender_id, recipient_id), max(sender_id, recipient_id)))
            conversation_id = cursor.lastrowid

        cursor.execute('''
            INSERT INTO private_messages (conversation_id, sender_id, recipient_id, content)
            VALUES (%s, %s, %s, %s)
        ''', (conversation_id, sender_id, recipient_id, content))
        db.close_db()
      
    return jsonify({'success': True, 'message': 'Message sent.'})

@message_bp.route('/message/inbox')
def inbox():
    if 'loggedin' not in session:
        return redirect(url_for('login'))
    user_id = session['user_id']
    with db.get_cursor() as cursor:
        cursor.execute('''
            SELECT c.conversation_id, 
                   u1.user_id as user1_id, u1.username as user1, u1.profile_image as user1_image,
                   u2.user_id as user2_id, u2.username as user2, u2.profile_image as user2_image,
                   c.last_message_at,
                   pm.content AS last_message_preview,
                   COALESCE(unread.unread_count, 0) as unread_count
            FROM conversations c
            JOIN users u1 ON c.user1_id = u1.user_id
            JOIN users u2 ON c.user2_id = u2.user_id
            LEFT JOIN (
                SELECT pm1.conversation_id, pm1.content
                FROM private_messages pm1
                INNER JOIN (
                    SELECT conversation_id, MAX(created_at) AS max_created
                    FROM private_messages
                    GROUP BY conversation_id
                ) pm2 ON pm1.conversation_id = pm2.conversation_id AND pm1.created_at = pm2.max_created
            ) pm ON pm.conversation_id = c.conversation_id
            LEFT JOIN (
                SELECT conversation_id, COUNT(*) as unread_count
                FROM private_messages
                WHERE recipient_id = %s AND is_read = 0
                GROUP BY conversation_id
            ) unread ON unread.conversation_id = c.conversation_id
            WHERE c.user1_id = %s OR c.user2_id = %s
            ORDER BY c.last_message_at DESC
        ''', (user_id, user_id, user_id))
        conversations = cursor.fetchall()

        for convo in conversations:
            # Set other user info and avatar
            if convo['user1_id'] == user_id:
                convo['other_user_avatar_url'] = rebuildImageUrl(convo['user2_image'])
            else:
                convo['other_user_avatar_url'] = rebuildImageUrl(convo['user1_image'])
            
            # Set unread flag
            convo['has_unread'] = convo['unread_count'] > 0

        db.close_db()

    return render_template('inbox.html', conversations=conversations)

# @message_bp.route('/message/conversation/<int:conversation_id>')
# def conversation(conversation_id):
#     if 'loggedin' not in session:
#         return redirect(url_for('login'))
#     user_id = session['user_id']

#     other_user_id = None
#     conversation_partner_username = None
#     with db.get_cursor() as cursor:
#         cursor.execute('''
#             SELECT * FROM private_messages
#             WHERE conversation_id=%s
#             ORDER BY created_at ASC
#         ''', (conversation_id,))
#         messages = cursor.fetchall()
#         # 标记为已读
#         cursor.execute('''
#             UPDATE private_messages SET is_read=1
#             WHERE conversation_id=%s AND recipient_id=%s
#         ''', (conversation_id, user_id))
#         db.close_db()
#     return render_template('conversation.html', messages=messages)

@message_bp.route('/message/conversation/<int:conversation_id>')
def conversation(conversation_id):
    if 'loggedin' not in session:
        return redirect(url_for('login'))
    user_id = session['user_id']
    
    other_user_id = None
    conversation_partner_username = None

    with db.get_cursor() as cursor:
        cursor.execute('''
            SELECT 
                c.user1_id, c.user2_id, 
                u1.username as user1_username, 
                u2.username as user2_username,
                u1.profile_image as user1_image,
                u2.profile_image as user2_image
            FROM conversations c
            JOIN users u1 ON c.user1_id = u1.user_id
            JOIN users u2 ON c.user2_id = u2.user_id
            WHERE c.conversation_id = %s AND (c.user1_id = %s OR c.user2_id = %s)
        ''', (conversation_id, user_id, user_id))
        conv_info = cursor.fetchone()

        if not conv_info:
            flash('Conversation not found or you do not have access.', 'danger')
            return redirect(url_for('message.inbox'))

        if conv_info['user1_id'] == user_id:
            other_user_id = conv_info['user2_id']
            conversation_partner_username = conv_info['user2_username']
            other_user_avatar = conv_info['user2_image']
        else:
            other_user_id = conv_info['user1_id']
            conversation_partner_username = conv_info['user1_username']
            other_user_avatar = conv_info['user1_image']

        # Fetch messages in the conversation, join sender's profile_image
        cursor.execute('''
            SELECT pm.*, sender.username AS sender_username, sender.profile_image AS sender_image
            FROM private_messages pm
            JOIN users sender ON pm.sender_id = sender.user_id
            WHERE pm.conversation_id=%s
            ORDER BY pm.created_at ASC
        ''', (conversation_id,))
        messages = cursor.fetchall()

        # Add sender_avatar_url field to each message
        for msg in messages:
            msg['sender_avatar_url'] = rebuildImageUrl(msg['sender_image'])
            msg['is_self'] = (msg['sender_id'] == user_id)

        cursor.execute('''
            UPDATE private_messages SET is_read=1
            WHERE conversation_id=%s AND recipient_id=%s AND is_read=0
        ''', (conversation_id, user_id))
        db.close_db()

    return render_template('conversation.html', 
                           messages=messages, 
                           conversation_id=conversation_id,
                           can_send_message=can_send_private_message(),
                           other_user_id=other_user_id,
                           conversation_partner_username=conversation_partner_username,
                           is_new_conversation=False)


@message_bp.route('/message/user/<int:recipient_user_id>')
def start_conversation_with_user(recipient_user_id):
    if 'loggedin' not in session:
        return redirect(url_for('login'))
    sender_id = session['user_id']

    if sender_id == recipient_user_id:
        flash("You cannot start a conversation with yourself.", 'info')
        # Assuming you have a profile view route like 'profile.view_profile'
        return redirect(url_for('profile.view_profile', user_id=sender_id)) 

    # Determine user1_id and user2_id for consistent conversation lookup/creation
    # user1_id is always the smaller ID, user2_id is the larger.
    user1 = min(sender_id, recipient_user_id)
    user2 = max(sender_id, recipient_user_id)

    existing_conversation_id = None
    with db.get_cursor() as cursor:
        cursor.execute('''
            SELECT conversation_id FROM conversations
            WHERE user1_id = %s AND user2_id = %s
        ''', (user1, user2))
        row = cursor.fetchone()
        if row:
            existing_conversation_id = row['conversation_id']

    if existing_conversation_id:
        return redirect(url_for('message.conversation', conversation_id=existing_conversation_id))
    else:
        # No existing conversation, prepare to render conversation page for a new message.
        recipient_username = None
        with db.get_cursor() as cursor:
            cursor.execute("SELECT username FROM users WHERE user_id = %s", (recipient_user_id,))
            user_row = cursor.fetchone()
            if not user_row:
                flash("Recipient user not found.", "danger")
                return redirect(request.referrer or url_for('dashboard')) # Or your main page
            recipient_username = user_row['username']

        return render_template('conversation.html',
                               messages=[], # No messages yet
                               conversation_id=None, # Important: No existing conversation ID
                               can_send_message=can_send_private_message(),
                               other_user_id=recipient_user_id,
                               conversation_partner_username=recipient_username,
                               is_new_conversation=True) # Flag for the template

@message_bp.route('/message/unread_count')
def unread_count():
    # Check if user is logged in
    if 'user_id' not in session:
        return jsonify({'count': 0})
    
    user_id = session['user_id']
    with db.get_cursor() as cursor:
        cursor.execute('SELECT COUNT(*) as cnt FROM private_messages WHERE recipient_id=%s AND is_read=0', (user_id,))
        count = cursor.fetchone()['cnt']
        db.close_db()
    return jsonify({'count': count})

@message_bp.route('/message/conversation_data/<int:conversation_id>')
def conversation_data(conversation_id):
    if 'loggedin' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'})
    
    user_id = session['user_id']
    
    with db.get_cursor() as cursor:
        # verify user has access to the conversation
        cursor.execute('''
            SELECT user1_id, user2_id FROM conversations 
            WHERE conversation_id = %s AND (user1_id = %s OR user2_id = %s)
        ''', (conversation_id, user_id, user_id))
        conv_info = cursor.fetchone()
        
        if not conv_info:
            return jsonify({'success': False, 'message': 'Access denied'})

        # fetch messages in the conversation
        cursor.execute('''
            SELECT pm.*, sender.username AS sender_username, sender.profile_image AS sender_image
            FROM private_messages pm
            JOIN users sender ON pm.sender_id = sender.user_id
            WHERE pm.conversation_id=%s
            ORDER BY pm.created_at ASC
        ''', (conversation_id,))
        messages = cursor.fetchall()

        # add sender avatar URLs and self-check
        for msg in messages:
            msg['sender_avatar_url'] = rebuildImageUrl(msg['sender_image'])
            msg['is_self'] = (msg['sender_id'] == user_id)

        # mark messages as read
        cursor.execute('''
            UPDATE private_messages SET is_read=1
            WHERE conversation_id=%s AND recipient_id=%s AND is_read=0
        ''', (conversation_id, user_id))
        db.close_db()

    # render the messages into HTML
    html = render_template('conversation_messages.html', messages=messages)
    return jsonify({
        'success': True, 
        'messages': messages,
        'html': html
    })