import os
from webapp import app
from webapp import db
from webapp import premium
from flask import redirect, render_template, request, session, url_for, flash
import flask_bcrypt
import re
from werkzeug.utils import secure_filename
import time
from .private_message import can_send_private_message, is_staff, is_paid_subscriber
from webapp.utils import rebuildImageUrl

@app.route('/profile/view')
def view_profile():
    # If user_id is provided in the URL, use that; otherwise use the logged-in user's ID
    target_user_id_str = request.args.get('user_id') # Renamed for clarity internally
    if not target_user_id_str and 'user_id' in session:
        print("session['user_id']:", session['user_id'])
        target_user_id_str = str(session['user_id'])

    if not target_user_id_str:
        flash("Login required to view profiles or user ID missing.", "warning")
        return redirect(url_for('login'))

    try:
        target_user_id = int(target_user_id_str)
    except ValueError:
        flash("Invalid user ID.", "danger")
        return redirect(url_for('dashboard'))
    # query profile by user_id
    profile_data, is_member = queryProfileById(target_user_id) 
    if is_member and is_member.get('note_msg') and (is_member['note_msg'].strip() != '') and is_member['note_ignore']==0:
        flash(is_member['note_msg'],"info")

    # Check if profile exists
    if not profile_data:
        flash("User profile not found", "danger")
        return redirect(url_for('dashboard'))

    current_session_user_id = session.get('user_id')
    current_session_user_role = session.get('role')

    can_view_full_profile = False
    if profile_data.get('is_public'):
        can_view_full_profile = True
    elif current_session_user_id and target_user_id == current_session_user_id:
        can_view_full_profile = True
    elif current_session_user_role == 'admin':
        can_view_full_profile = True

    recent_journeys = []
    liked_events = []

    # This is the user's original 'is_admin' logic for admin viewing another profile
    is_admin_viewing_another = False
    if current_session_user_role == 'admin' and current_session_user_id and target_user_id != current_session_user_id:
        is_admin_viewing_another = True

    if can_view_full_profile:
        try:
            with db.get_cursor() as cursor:
                # Fetch recent journeys
                journey_query_sql = """
                    SELECT j.journey_id, j.title, j.start_date, j.description,j.display,
                           j.status, j.created_at, j.updated_at,j.cover_image,
                           COUNT(e.event_id) as event_count
                    FROM journeys j
                    LEFT JOIN events e ON j.journey_id = e.journey_id
                    WHERE j.user_id = %s
                """
                journey_params = [target_user_id]

                is_owner = current_session_user_id and target_user_id == current_session_user_id
                
                if not (is_owner or current_session_user_role == 'admin'):
                    journey_query_sql += " AND j.display IN ('public', 'published')"

                journey_query_sql += """
                    GROUP BY j.journey_id
                    ORDER BY j.status = 'open' DESC, COALESCE(j.updated_at, j.created_at) DESC
                    LIMIT 5
                """
                cursor.execute(journey_query_sql, tuple(journey_params))
                recent_journeys = cursor.fetchall()

                # Fetch liked events (using event_likes table from create_table_community.sql)
                cursor.execute('''
                    SELECT 
                        e.event_id, e.journey_id, e.title, e.description, e.event_image, e.start_time, e.end_time, l.address,
                        j.title AS journey_title,
                        u.user_id AS author_user_id,         -- Journey owner's ID
                        u.username AS author_username,       -- Journey owner's username
                        u.profile_image AS author_profile_image -- Journey owner's profile image
                    FROM events e
                    JOIN locations l on e.location_id=l.location_id
                    JOIN event_likes el ON e.event_id = el.event_id
                    JOIN journeys j ON e.journey_id = j.journey_id
                    JOIN users u ON j.user_id = u.user_id  -- Join with users table to get journey owner's info
                    WHERE el.user_id = %s -- This is the user whose liked events we are fetching
                    ORDER BY el.created_at DESC
                    LIMIT 5
                ''', (target_user_id,))
                liked_events = cursor.fetchall()
                for event in liked_events:
                    cursor.execute('''
                        SELECT * from event_images where event_id=%s;
                    ''', (event['event_id'],))
                    event['event_images'] = cursor.fetchall()
                
        except Exception as e:
            app.logger.error(f"Error retrieving activity history for user {target_user_id}: {str(e)}")
            flash(f"Error retrieving activity history: {str(e)}", "danger")
    elif not profile_data.get('is_public'):
        flash("This profile is private.", "info")

    can_view_sensitive_info = (session.get('role') == 'admin') or (session.get('user_id') == profile_data['user_id'])
    current_user_can_send_pm = False
    if 'user_id' in session: # Check if a user is logged in
        current_user_can_send_pm = can_send_private_message()
    return render_template('user_profile.html', 
                           profile=profile_data, 
                           is_member=is_member,
                           is_admin=is_admin_viewing_another, # User's original variable for admin-specific template parts
                           recent_journeys=recent_journeys,
                           liked_events=liked_events,
                           can_view_full_profile=can_view_full_profile,
                           can_view_sensitive_info=can_view_sensitive_info,
                           current_user_can_send_pm=current_user_can_send_pm,)


def queryProfileById(user_id):
    print("queryProfileById function called with user_id:", user_id)
    profile_data = None # Initialize to ensure it's defined
    is_member = None
    print("user_id type:", type(user_id))
    print("user_id content:", user_id)
    user_id = int(user_id) # Ensure user_id is an integer
    with db.get_cursor() as cursor:
        cursor.execute('''SELECT u.user_id, u.username, u.password_hash, u.email, u.first_name, u.last_name, 
                        l.address, u.profile_image, u.description, u.role, u.status,
                        u.favorite_destinations, u.is_public
                FROM users u 
                LEFT JOIN locations l ON u.location_id = l.location_id
                WHERE u.user_id = %s;''',
            (user_id,))
        profile_data = cursor.fetchone()

        if profile_data and profile_data.get('profile_image'):
            profile_data['profile_image'] = rebuildImageUrl(profile_data['profile_image'])
            
        is_member = premium.checkMember(user_id)
        if is_member is None:
            is_member = {}
        elif not isinstance(is_member, dict):
            is_member = {}
            
    print("is_member type:", type(is_member))
    print("is_member content:", is_member)
    return profile_data, is_member


@ app.route('/profile/edit')
def edit_profile():
    if 'loggedin' not in session:
        flash("Please log in to edit your profile.", "danger")
        return redirect(url_for('login'))
    
    user_id_str = request.args.get('user_id')

    if not user_id_str and 'user_id' in session: # Default to own profile
        user_id_str = str(session['user_id'])
    elif not user_id_str:
        flash("User ID not specified for editing.", "danger")
        return redirect(url_for('dashboard'))

    try:
        user_id = int(user_id_str)
    except ValueError:
        flash("Invalid user ID for editing.", "danger")
        return redirect(url_for('dashboard'))

    # Security check: Allow editing only own profile or if admin
    session_user_id = session.get('user_id')
    session_user_role = session.get('role')
    if not (user_id == session_user_id or session_user_role == 'admin'):
        flash("You are not authorized to edit this profile.", "danger")
        return redirect(url_for('view_profile', user_id=user_id))

    profile_data, _ = queryProfileById(user_id) # Unpack, we only need profile_data here

    if not profile_data:
        flash("Profile to edit not found.", "danger")
        return redirect(url_for('dashboard'))

    return render_template('user_profile_edit.html', profile=profile_data) # Pass the dict


@app.route('/profile/save', methods=['POST']) # Changed to only POST
def save_profile():
    if 'loggedin' not in session:
        flash("Please log in to save your profile.", "danger")
        return redirect(url_for('login'))
    
    user_id_str = request.form.get('user_id')
    try:
        user_id = int(user_id_str)
    except (ValueError, TypeError):
        flash("Invalid user ID submitted.", "danger")
        return redirect(url_for('dashboard')) # Or back to edit page with user_id if possible

    # Security check: Allow saving only own profile or if admin
    session_user_id = session.get('user_id')
    session_user_role = session.get('role')
    if not (user_id == session_user_id or session_user_role == 'admin'):
        flash("You are not authorized to save this profile.", "danger")
        return redirect(url_for('view_profile', user_id=user_id))

    username = request.form.get('username')
    email = request.form.get('email')
    original_password = request.form.get('password')
    new_password = request.form.get('new_password')
    confirm_password = request.form.get('confirm_password')
    first_name = request.form.get('first_name')
    last_name = request.form.get('last_name')
    description = request.form.get('description', '')
    location = request.form.get('location') # This is address string
    favorite_destinations = request.form.get('favorite_destinations', '')
    is_public = 'is_public' in request.form

    location_id = None # Initialize

    username_error = None
    email_error = None
    first_name_error = None
    last_name_error = None
    location_error = None
    original_password_error = None
    new_password_error = None
    confirm_password_error = None

    profile_data_before_edit, _ = queryProfileById(user_id) # Get current state for comparison and fallback
    if not profile_data_before_edit:
        flash("Could not retrieve current profile data to save.", "danger")
        return redirect(url_for('edit_profile', user_id=user_id))

    # Location handling
    if location: # If a new location address is provided
        with db.get_cursor() as cursor:
            cursor.execute("SELECT location_id FROM locations WHERE address = %s", (location,))
            location_id_result = cursor.fetchone()
        if location_id_result:
            location_id = location_id_result['location_id']
        else:
            try:
                with db.get_cursor() as cursor: # New cursor for insert
                    cursor.execute("INSERT INTO locations (address) VALUES (%s)", (location,))
                    location_id = cursor.lastrowid
                    db.get_db().commit()
            except Exception as e:
                location_error = f"Error saving new location: {str(e)}"
                app.logger.error(f"Error inserting location '{location}': {e}")
    elif profile_data_before_edit.get('location_id'): # No new location string, keep existing
        location_id = profile_data_before_edit['location_id']
    
    # Validation logic (similar to your existing, ensure profile_data_before_edit is used for comparisons)
    if profile_data_before_edit['username'] != username or profile_data_before_edit['email'] != email:
        with db.get_cursor() as cursor:
            # Check if new username or email is taken by *another* user
            query = 'SELECT user_id, username, email FROM users WHERE (username = %s OR email = %s) AND user_id != %s;'
            cursor.execute(query, (username, email, user_id))
            existing_user = cursor.fetchone()
        if existing_user:
            if existing_user['username'] == username:
                 username_error = 'Username is already registered by another user.'
            if existing_user['email'] == email:
                 email_error = 'Email is already registered by another user.'

    if not username: username_error = "Username is required."
    elif len(username) > 20: username_error = 'Your username cannot exceed 20 characters.'
    elif not re.match(r'^[A-Za-z0-9]+$', username): username_error = 'Your username can only contain letters and numbers.'

    if not email: email_error = "Email is required."
    elif len(email) > 320: email_error = 'Your email address cannot exceed 320 characters.'
    elif not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', email): email_error = 'Invalid email address.'
    
    if new_password: # Only validate if new password is provided
        if not original_password:
            original_password_error = 'Original password is required to set a new password.'
        elif not flask_bcrypt.check_password_hash(profile_data_before_edit['password_hash'], original_password):
            original_password_error = 'Wrong original password!'
        
        if len(new_password) < 8: new_password_error = 'Please choose a longer password (min 8 chars)!'
        elif not re.match(r'^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@#$%^&+=!]).{8,}$', new_password):
            new_password_error = 'Password must be at least 8 characters, with uppercase, lowercase, number, and special character.'
        if new_password != confirm_password: confirm_password_error = 'New passwords do not match.'

    if not first_name or len(first_name) > 50: first_name_error = 'First name is required and cannot exceed 50 characters.'
    if not last_name or len(last_name) > 50: last_name_error = 'Last name is required and cannot exceed 50 characters.'

    if (username_error or email_error or first_name_error or last_name_error or location_error or 
        original_password_error or new_password_error or confirm_password_error):
        
        # Prepare data to re-render form, using submitted values or original if not submitted
        profile_for_template = profile_data_before_edit.copy() # Start with original
        profile_for_template.update({ # Override with submitted values
            'username': username, 'email': email, 'first_name': first_name, 
            'last_name': last_name, 'description': description, 
            'address': location, # The form field for location address
            'favorite_destinations': favorite_destinations, 'is_public': is_public
        })
        return render_template('user_profile_edit.html', profile=profile_for_template,
                               username_error=username_error, email_error=email_error,
                               first_name_error=first_name_error, last_name_error=last_name_error,
                               location_error=location_error,
                               original_password_error=original_password_error,
                               new_password_error=new_password_error,
                               confirm_password_error=confirm_password_error)
    else:
        try:
            with db.get_cursor() as cursor:
                if new_password:
                    password_hash = flask_bcrypt.generate_password_hash(new_password).decode('utf-8')
                    cursor.execute('''
                        UPDATE users SET username=%s, password_hash=%s, email=%s, first_name=%s, 
                                       last_name=%s, location_id=%s, description=%s,
                                       favorite_destinations=%s, is_public=%s
                        WHERE user_id=%s;
                    ''', (username, password_hash, email, first_name, last_name, location_id, 
                          description, favorite_destinations, is_public, user_id))
                else:
                    cursor.execute('''
                        UPDATE users SET username=%s, email=%s, first_name=%s, last_name=%s, 
                                       location_id=%s, description=%s,
                                       favorite_destinations=%s, is_public=%s
                        WHERE user_id=%s;
                    ''', (username, email, first_name, last_name, location_id, description,
                          favorite_destinations, is_public, user_id))
                db.get_db().commit()
            flash("Profile updated successfully!", "success")
            return redirect(url_for('view_profile', user_id=user_id))
        except Exception as e:
            app.logger.error(f"Error saving profile for user {user_id}: {str(e)}")
            flash(f"An error occurred while saving the profile: {str(e)}", "danger")
            # Re-render edit form with current values and error
            profile_for_template = profile_data_before_edit.copy()
            profile_for_template.update({
                'username': username, 'email': email, 'first_name': first_name,
                'last_name': last_name, 'description': description,
                'address': location,
                'favorite_destinations': favorite_destinations, 'is_public': is_public
            })
            return render_template('user_profile_edit.html', profile=profile_for_template)
            
    # Fallback, should ideally not be reached if POST and validation handled
    return redirect(url_for('view_profile', user_id=user_id))


@app.route('/profile/role/change', methods=['POST'])
def change_user_role():
    """Update user role or status"""
    # Authentication check
    if 'user_id' not in session or 'role' not in session or session['role'] != 'admin':
        flash("Unauthorized access", "danger")
        return redirect(url_for('dashboard'))
    
    user_id = request.form.get('user_id', type=int)
    new_role = request.form.get('role')
    new_status = request.form.get('status')
    
    if not user_id:
        flash("Invalid user ID", "danger")
        return redirect(url_for('dashboard'))
    
    try:
        with db.get_cursor() as cursor:
            # Check if trying to modify own role
            if user_id == session['user_id']:
                flash("You cannot modify your own role", "warning")
                return redirect(url_for('view_profile', user_id=user_id))
            
            # Check if this would remove the last admin
            if new_role and new_role != 'admin':
                cursor.execute('SELECT COUNT(*) as admin_count FROM users WHERE role = %s', ('admin',))
                result = cursor.fetchone()
                admin_count = result['admin_count']
                
                cursor.execute('SELECT role FROM users WHERE user_id = %s', (user_id,))
                current_user = cursor.fetchone()
                
                if admin_count <= 1 and current_user and current_user['role'] == 'admin':
                    flash("Cannot remove the last administrator", "danger")
                    return redirect(url_for('view_profile', user_id=user_id))
            
            # Update role if provided
            if new_role:
                cursor.execute('UPDATE users SET role = %s WHERE user_id = %s', (new_role, user_id))
                flash(f"User role updated to {new_role}", "success")
            
            # Update status if provided
            if new_status:
                cursor.execute('UPDATE users SET status = %s WHERE user_id = %s', (new_status, user_id))
                flash(f"User status updated to {new_status}", "success")
            
            db.get_db().commit()
            
    except Exception as e:
        flash("An error occurred while updating user role/status", "danger")
    
    return redirect(url_for('view_profile', user_id=user_id))


@app.route('/profile/upload', methods=['POST'])
def upload_profile_image():
    """Handles profile image upload logic:
      1. Check if user is logged in.
      2. Check if the user is uploading for their own profile or if they are an admin.
      3. Validate the uploaded file (only JPG/PNG/GIF, <= 5MB).
      4. Store file and update the database record.
    """
    if 'loggedin' not in session:
        flash("Please log in first.", "danger")
        return redirect(url_for('login'))

    target_user_id_str = request.form.get('user_id')
    file = request.files.get('profile_image')

    if not target_user_id_str:
        flash("User ID missing for upload.", "danger")
        return redirect(request.referrer or url_for('view_profile', user_id=session.get('user_id','')))
    
    try:
        target_user_id = int(target_user_id_str)
    except ValueError:
        flash("Invalid User ID for upload.", "danger")
        return redirect(request.referrer or url_for('view_profile', user_id=session.get('user_id','')))

    if not file or file.filename == '':
        flash("No selected file. Please choose an image to upload.", "danger")
        return redirect(url_for('view_profile', user_id=target_user_id))

    # Security Check: User can only upload for themselves, or admin can upload for anyone
    session_user_id = session.get('user_id')
    session_user_role = session.get('role')
    if not (target_user_id == session_user_id or session_user_role == 'admin'):
        flash("Unauthorized action to upload profile image.", "danger")
        return redirect(url_for('view_profile', user_id=target_user_id))

    # Validate file size
    file.seek(0, os.SEEK_END)
    file_length = file.tell()
    file.seek(0, 0)  # Reset file pointer
    if file_length > 5 * 1024 * 1024:  # 5MB limit
        flash("File is too large. Maximum allowed size is 5MB.", "danger")
        return redirect(url_for('view_profile', user_id=target_user_id))

    # Validate file extension
    allowed_extensions = {'png', 'jpg', 'jpeg', 'gif'}
    if '.' not in file.filename or \
       file.filename.rsplit('.', 1)[1].lower() not in allowed_extensions:
        flash("Only PNG, JPG, JPEG, and GIF files are allowed.", "danger")
        return redirect(url_for('view_profile', user_id=target_user_id))

    # Generate a secure filename
    filename = secure_filename(file.filename)
    timestamp = int(time.time())
    unique_filename = f"{timestamp}_{filename}"
    
    # Ensure upload directory exists
    upload_folder = os.path.join(app.root_path, "static", "avatars")
    if not os.path.exists(upload_folder):
        try:
            os.makedirs(upload_folder)
        except Exception as e:
            flash(f"Error creating upload directory: {str(e)}", "danger")
            app.logger.error(f"Error creating upload directory: {str(e)}")
            return redirect(url_for('view_profile', user_id=target_user_id))

    # Get current profile image to delete if exists
    try:
        with db.get_cursor() as cursor:
            cursor.execute('SELECT profile_image FROM users WHERE user_id = %s', (target_user_id,))
            result = cursor.fetchone()
            old_image = result['profile_image'] if result else None
            
            # Delete old image if exists
            if old_image:
                old_image_path = os.path.join(upload_folder, old_image)
                if os.path.exists(old_image_path):
                    try:
                        os.remove(old_image_path)
                    except Exception as e:
                        app.logger.error(f"Error deleting old image: {str(e)}")
                        # Continue with upload even if old image deletion fails
            
            # Save new image
            try:
                file.save(os.path.join(upload_folder, unique_filename))
            except Exception as e:
                flash(f"Error saving image: {str(e)}", "danger")
                app.logger.error(f"Error saving image: {str(e)}")
                return redirect(url_for('view_profile', user_id=target_user_id))
            
            # Update database
            cursor.execute('UPDATE users SET profile_image = %s WHERE user_id = %s', 
                         (unique_filename, target_user_id))
            db.get_db().commit()
            
        flash("Profile image updated successfully!", "success")
    except Exception as e:
        flash(f"Error updating profile image: {str(e)}", "danger")
        app.logger.error(f"Error in upload_profile_image: {str(e)}")
        # Try to clean up the uploaded file if database update fails
        try:
            new_image_path = os.path.join(upload_folder, unique_filename)
            if os.path.exists(new_image_path):
                os.remove(new_image_path)
        except:
            pass
    
    return redirect(url_for('view_profile', user_id=target_user_id))


@app.route('/profile/remove_avatar')
def remove_avatar():
    
    if 'loggedin' not in session:
        return redirect(url_for('login'))
    
    user_id=request.args.get('user_id')
    
    try:
        # Get current avatar filename
        with db.get_cursor() as cursor:
            cursor.execute('SELECT profile_image FROM users WHERE user_id = %s', (user_id,))
            result = cursor.fetchone()
            
            if not result or not result['profile_image']:
                flash("No avatar found for this user", "warning")
                return redirect(url_for('view_profile', user_id=user_id))
            
            avatar_filename = result['profile_image']
            
            # Remove avatar from database
            cursor.execute('UPDATE users SET profile_image = NULL WHERE user_id = %s', (user_id,))
            db.get_db().commit()
            
            # Attempt to delete the file (if it exists)
            avatar_path = os.path.join(app.root_path, 'static/avatars', avatar_filename)
            if os.path.exists(avatar_path):
                os.remove(avatar_path)
                
            flash("Avatar removed successfully", "dark")
            
    except Exception as e:
        flash(f"An error occurred while removing the avatar {e}", "danger")
        flash("An error occurred while removing the avatar", "danger")
    
    return redirect(url_for('view_profile', user_id=user_id))


@app.route('/profile/admin/edit_description/<int:user_id>', methods=['POST'])
def admin_edit_description(user_id):
    """Admin route to edit a user's description/biography"""
    
    # Authentication check
    if 'user_id' not in session or 'role' not in session or session['role'] != 'admin':
        flash("Unauthorized access", "danger")
        return redirect(url_for('dashboard'))
    
    description = request.form.get('description', '')
    
    try:
        # Update description in database
        with db.get_cursor() as cursor:
            cursor.execute('UPDATE users SET description = %s WHERE user_id = %s', (description, user_id))
            db.get_db().commit()
            
        flash("User biography updated successfully", "success")
        
    except Exception as e:
        flash("An error occurred while updating the biography", "danger")
    
    return redirect(url_for('view_profile', user_id=user_id))



@app.route('/user/follow/<int:user_id>', methods=['POST'])
def follow_user(user_id):
    """Follow a user to see all their journey events on departure board"""
    
    # Check if user is logged in
    if 'loggedin' not in session:
        flash("Please log in to follow users.", "warning")
        return redirect(url_for('login'))
    
    follower_id = session.get('user_id')
    role = session.get('role', '')
    
    # Check if user has permission (paid subscriber or staff)
    is_member = premium.checkMember(follower_id)
    has_premium = is_member and is_member.get('m_status') != 'expired'
    is_staff = role in ['admin', 'editor']
    
    if not (is_staff or has_premium):
        flash("Only premium members and staff can follow users.", "warning")
        return redirect(url_for('view_profile', user_id=user_id))
    
    # Check if trying to follow themselves
    if follower_id == user_id:
        flash("You cannot follow yourself.", "info")
        return redirect(url_for('view_profile', user_id=user_id))
    
    try:
        with db.get_cursor() as cursor:
            # Check if user exists
            cursor.execute('SELECT user_id, username FROM users WHERE user_id = %s', (user_id,))
            target_user = cursor.fetchone()
            
            if not target_user:
                flash("User not found.", "danger")
                return redirect(url_for('view_profile', user_id=user_id))
            
            # Check if already following
            cursor.execute('''
                SELECT follow_id FROM user_follows 
                WHERE follower_id = %s AND followed_id = %s
            ''', (follower_id, user_id))
            existing_follow = cursor.fetchone()
            
            if existing_follow:
                flash("You are already following this user.", "info")
            else:
                # Add follow relationship
                cursor.execute('''
                    INSERT INTO user_follows (follower_id, followed_id) 
                    VALUES (%s, %s)
                ''', (follower_id, user_id))
                
                flash(f"You are now following {target_user['username']}! Their journey events will appear on your Departure Board.", "success")
            
            db.close_db()
            
    except Exception as e:
        flash("An error occurred while following the user. Please try again.", "danger")
        print(f"Error following user: {e}")  # For debugging
    
    return redirect(url_for('view_profile', user_id=user_id))


@app.route('/user/unfollow/<int:user_id>', methods=['POST'])
def unfollow_user(user_id):
    """Unfollow a user and remove their journey events from departure board"""
    
    # Check if user is logged in
    if 'loggedin' not in session:
        return redirect(url_for('login'))
    
    follower_id = session.get('user_id')
    
    try:
        with db.get_cursor() as cursor:
            # Check if user is following this user
            cursor.execute('''
                SELECT uf.follow_id, u.username 
                FROM user_follows uf
                JOIN users u ON uf.followed_id = u.user_id
                WHERE uf.follower_id = %s AND uf.followed_id = %s
            ''', (follower_id, user_id))
            follow_record = cursor.fetchone()
            
            if not follow_record:
                flash("You are not following this user.", "info")
            else:
                # Remove user follow relationship
                cursor.execute('''
                    DELETE FROM user_follows 
                    WHERE follower_id = %s AND followed_id = %s
                ''', (follower_id, user_id))
                
                # Remove all journey follows from this user's journeys
                cursor.execute('''
                    DELETE jf FROM journey_follows jf
                    JOIN journeys j ON jf.journey_id = j.journey_id
                    WHERE jf.user_id = %s AND j.user_id = %s
                ''', (follower_id, user_id))
                
                flash(f"You have unfollowed {follow_record['username']}. Their events will no longer appear on your Departure Board.", "success")
            
            db.close_db()
            
    except Exception as e:
        flash("An error occurred while unfollowing the user. Please try again.", "danger")
        print(f"Error unfollowing user: {e}")  # For debugging
    
    return redirect(url_for('view_profile', user_id=user_id))


@app.route('/api/check_user_follow_status/<int:user_id>')
def check_user_follow_status(user_id):
    """Check if current user is following a specific user
    
    Returns JSON response with follow status for AJAX requests.
    """
    if 'loggedin' not in session:
        return {'following': False, 'error': 'Not logged in'}
    
    follower_id = session.get('user_id')
    
    try:
        with db.get_cursor() as cursor:
            cursor.execute('''
                SELECT follow_id FROM user_follows 
                WHERE follower_id = %s AND followed_id = %s
            ''', (follower_id, user_id))
            follow_record = cursor.fetchone()
            db.close_db()
            
            return {'following': bool(follow_record)}
            
    except Exception as e:
        return {'following': False, 'error': 'Database error'}


