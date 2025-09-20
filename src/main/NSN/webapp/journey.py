from webapp import app, announcement as a, event as e
from webapp import db
from webapp import premium
from flask import redirect, render_template, request, session, url_for, flash, jsonify
from datetime import datetime
from werkzeug.utils import secure_filename
import os

ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png'}
MAX_CONTENT_LENGTH = 5 * 1024 * 1024

def allowed_file(filename):
    """Check if the filename has a valid extension (JPG/PNG)."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


@app.route('/journey/private/view', methods=['GET', 'POST'])
def private_journey():
    """Private Journey Viewing Endpoint

    Allows users to view their private journeys and events, supports keyword search.
    """
    # Ensure the user is logged in; redirect to login page if not
    if 'loggedin' not in session:
        return redirect(url_for('login'))

    # Initialize empty lists for journeys and events
    journey_list = []
    event_successful=request.args.get("event_successful")# a label for private_event redirection
    journey_successful=request.args.get("journey_successful")# a label for private_event redirection

    user_id = request.form.get('user_id', '').strip()  # Get search keyword from form
    if user_id=='':
        user_id=session['user_id']
    
    # Use a cursor with dictionary results for easier data handling
    with db.get_cursor() as cursor:
        # Define the base query to retrieve private journeys for the current user
        query = '''
            SELECT distinct j.journey_id, j.title, j.start_date, j.description,
            j.cover_image, j.display, j.status,j.created_at, j.no_edits_flag
            FROM journeys j
            left join events e on j.journey_id=e.journey_id 
            left join locations l on e.location_id=l.location_id
            WHERE j.user_id = %s 
            
        '''
        params = [user_id]  # Parameter for the current user's ID

        # Handle keyword search if the request is a POST
        if request.method == 'POST':
            keyword = request.form.get('keyword', '').strip()  # Get search keyword from form
            filter = request.form.get('filter', '').strip()  # Get search keyword from form
            
            if filter=="content" and keyword !='':
                # Extend query to filter by title or description
                query += ' AND (j.title LIKE %s OR j.description LIKE %s)'
                params.extend([f'%{keyword}%', f'%{keyword}%'])  # Add wildcard search terms
            
            if filter=="location" and keyword !='':
                query = ''' And l.address like %s'''
                params = [user_id, f'%{keyword}%']


        query += ' ORDER BY  j.created_at DESC;'  # Show newest journeys first
        # Execute the journey query and fetch all results


        cursor.execute(query, params)
        journey_list = cursor.fetchall()

        db.close_db()

        is_member = premium.checkMember(session['user_id'])
        if is_member and is_member.get('note_msg') and is_member.get('note_msg').strip() and is_member.get(
                'note_ignore') == 0:
            flash(is_member['note_msg'], "info")

    # Display a message if the user has no private journeys
    if not journey_list:
        flash("You haven't added any journeys yet. Click 'Add Journey' to create one!", "dark")

    # Render the private journey page with journey and event data.
    # The template should check if event_list is empty and display a "No events added yet" message.

    return render_template('private_journey.html', is_member=is_member,journey_list=journey_list,
                            journey_successful=journey_successful,
                           event_successful=event_successful)



# Update your existing public_journey route with this enhanced version

@app.route('/journey/public/view', methods=['GET', 'POST'])
def public_journey():
    """Public Journey Viewing Endpoint
    
    Allows all logged-in users to view public journeys
    Journeys are displayed from most recently updated to least recently updated.
    """
    
    loggedin = 'loggedin' in session
    
    # Initialize empty lists for journeys and announcements.
    journey_list = []
    announcement_list = []
    keyword = ''
    filter_type = 'content'  # Add default value
    
    # Check user permissions for following journeys
    can_follow = False
    if loggedin:
        user_id = session.get('user_id')
        role = session.get('role', '')
        
        # Check if user is staff
        if role in ['admin', 'editor']:
            can_follow = True
        else:
            # Check premium status
            is_member = premium.checkMember(user_id)
            if is_member and is_member.get('m_status') != 'expired':
                can_follow = True
                # Store premium status in session for template access
                session['premium'] = 1
            else:
                session['premium'] = 0
    
    # Add handling of GET parameters
    if request.method == 'POST':
        keyword = request.form.get('keyword', '').strip()
        filter_type = request.form.get('filter', 'content').strip()
    else:  # GET request
        keyword = request.args.get('keyword', '').strip()
        filter_type = request.args.get('filter', 'content').strip()
    
    with db.get_cursor() as cursor:
        # Define the base query to retrieve journeys marked as 'public'
        query = '''
            SELECT distinct j.journey_id, j.user_id, j.title, j.start_date, j.description,j.cover_image, 
                   j.display, j.status,j.created_at, j.updated_at, j.no_edits_flag, u.username
            FROM journeys j 
            left join events e on j.journey_id=e.journey_id 
            left join locations l on e.location_id=l.location_id
            inner join users u on j.user_id=u.user_id
            left join members m on m.user_id=u.user_id
            WHERE j.status='open' and u.status='active'
        '''
        params = []  

        # Handle search criteria
        if filter_type == "content" and keyword != '':
            # Extend query to filter by title or description
            query += ' AND (j.title LIKE %s OR j.description LIKE %s)'
            params.extend([f'%{keyword}%', f'%{keyword}%'])  # Add wildcard search terms
        
        if filter_type == "location" and keyword != '':
            # Extend query to filter by location in events
            query += " AND l.address like %s"
            params.append(f'%{keyword}%')

        # Check loggedin 
        if loggedin:
            query += '''  AND (j.display = 'public' or j.display = 'published') '''
        else:
            query += '''  AND  j.display = 'published' AND m.m_status !='expired' '''

        query += ' ORDER BY  j.created_at DESC;'  # Show newest journeys first
        
        # Execute the query and fetch the list of public journeys.
        cursor.execute(query, params)
        journey_list = cursor.fetchall()
        
        # Retrieve active announcements
        cursor.execute('''
            SELECT a_id, title, content, start_date, end_date
            FROM announcements
            WHERE start_date <= NOW() AND end_date >= NOW()
            ORDER BY start_date DESC
        ''')
        announcement_list = cursor.fetchall()
        db.close_db()
    
    # Render the page and submit the current search keyword and filter
    return render_template('public_journey.html', 
                          journey_list=journey_list, 
                          announcement_list=announcement_list,
                          keyword=keyword,
                          filter=filter_type,
                          can_follow=can_follow)

@app.route('/journey/view/<int:journey_id>', methods=['GET'])
def view_journey(journey_id):
    """View Journey Details Endpoint

    Allows users to view the details of a specific journey.
    Public journeys are visible to all logged-in users.
    Private journeys are only visible to their owner.
    """
    # Ensure the user is logged in; redirect to login page if not
    if 'loggedin' not in session:
        return redirect(url_for('login'))

    # Initialize journey and event list
    journey = None
    event_list = []

    with db.get_cursor() as cursor:
        # Query the journey details
        query = '''
            SELECT j.journey_id, j.title, j.description,j.cover_image, j.start_date, 
                   j.display, j.status, u.username, u.user_id,
                   COALESCE(j.updated_at, j.start_date) as last_update
            FROM journeys j
            JOIN users u ON j.user_id = u.user_id
            WHERE j.journey_id = %s
        '''
        cursor.execute(query, (journey_id,))
        journey = cursor.fetchone()

        # If journey doesn't exist, show an error
        if not journey:
            flash("Journey not found!", "danger")
            return redirect(url_for('public_journey'))

        # Check visibility
        if journey['display'] == 'private':
            if journey['user_id'] != session['user_id']:
                flash("This journey is no longer available. It has been changed to private by the owner.", "danger")
                return redirect(url_for('public_journey'))

        # Query events associated with this journey
        cursor.execute('''
            SELECT e.event_id, e.title, e.description, e.start_time, e.end_time, l.address, e.event_image
            FROM events e inner join locations l on e.location_id=l.location_id
            WHERE e.journey_id = %s
            ORDER BY e.start_time ASC
        ''', (journey_id,))
        event_list = cursor.fetchall()

        db.close_db()

    # Render the journey details page
    return render_template('view_journey.html', journey=journey, event_list=event_list)

@app.route('/journey/add', methods=['GET', 'POST'])
def add_journey():
    """Journey creation endpoint.
    
    Allows users to add a new journey, including title, description, and start date.
    """
    
    # Ensure user is logged in
    if 'loggedin' not in session:
        return redirect(url_for('login'))

    user_id = session.get("user_id")
    if not user_id:
        flash("Session expired. Please log in again.", "danger")
        return redirect(url_for('login'))

    if request.method == 'POST':

        # Retrieve form data
        title = request.form.get("title", "").strip()
        description = request.form.get("description", "").strip()
        start_date = request.form.get("start_date", "").strip()
        display = request.form.get("display", "private").strip()  # Default to 'private'
        cover_image_file = request.files.get('cover_image')

        # Validate title
        if not title or len(title) > 100:
            flash("Title is required and must be ≤ 100 characters", "danger")
            return redirect(url_for('add_journey'))

        # Validate and format start_date
        try:
            start_date = f"{start_date} {datetime.strftime(datetime.now(), '%H:%M')}"
        except ValueError:
            flash("Invalid date format. Please use YYYY-MM-DD.", "danger")
            return redirect(url_for('add_journey'))

        try:
            with db.get_cursor() as cursor:
                cursor.execute('''
                    INSERT INTO journeys (user_id, title, description, start_date, display, status)
                    VALUES (%s, %s, %s, %s, %s, 'open');
                ''', (user_id, title, description, start_date, display))
                journey_id=cursor.lastrowid
                db.close_db()

                if cover_image_file and cover_image_file.filename:
                    uploadJourneyCoverImage(user_id, journey_id, cover_image_file)
            flash("Journey added successfully!", "dark")

            return redirect(url_for('private_journey', journey_successful=True))  # Redirect to journey list
        except Exception as e:
            
            flash(f"An error occurred while adding the journey. Please try again.", "danger")
            return redirect(url_for('private_journey'))
        
        

    # Render the add journey form
    return redirect(url_for('private_journey'))

@app.route('/journey/edit/traveller', methods=['GET', 'POST'])
def traveller_edit_journey():

    # Ensure user is logged in
    if 'loggedin' not in session:
        return redirect(url_for('login'))

    user_id = session.get("user_id")
    if not user_id:
        flash("Session expired. Please log in again.", "danger")
        return redirect(url_for('login'))
    
    if request.method == 'POST':
        # Retrieve form data
        journey_id = request.form.get("journey_id").strip()
        title = request.form.get("title", "").strip()
        description = request.form.get("description", "").strip()
        start_date = request.form.get("start_date", "").strip()
        display = request.form.get("display", "private").strip()  # Default to 'private'
        coverImage = request.files.get('cover_image')


    # Validate title
        if not title or len(title) > 100:
            flash("Title is required and must be ≤ 100 characters", "danger")
            return redirect(url_for('private_journey'))

        # Validate and format start_date
        try:
            start_date = datetime.strptime(start_date, '%Y-%m-%d').strftime('%Y-%m-%d')
        except ValueError:
            flash("Invalid date format. Please use YYYY-MM-DD.", "danger")
            return redirect(url_for('private_journey'))
        

        try:
            with db.get_cursor() as cursor:
                cursor.execute('''
                    UPDATE journeys set title=%s, description=%s, start_date=%s, display=%s where journey_id=%s;
                ''', ( title, description, start_date, display,journey_id,))
                if coverImage and coverImage.filename:
                    uploadJourneyCoverImage(user_id, journey_id, coverImage)

                db.close_db()
            flash("Journey updated successfully!", "dark")
            return redirect(url_for('private_journey'))  # Redirect to journey list
        except Exception as e:
            flash(f"{e}", "danger")
            return redirect(url_for('private_journey'))

    #redirect to journey.html, private mode
    return render_template('private_journey.html')

@app.route('/journey/delete/traveller')
def traveller_delete_journey():
    """Delete a journey created by traveller
    
    Parameters:
    journey_id: The ID of the journey to be deleted
    
    Returns:
    Redirects to the private_journey page with success or error message
    """
    # Ensure user is logged in
    if 'loggedin' not in session:
        return redirect(url_for('login'))
    
    user_id = session.get("user_id")
    if not user_id:
        flash("Session expired. Please log in again.", "danger")
        return redirect(url_for('login'))
    
    # Get journey_id from request parameters
    journey_id = request.args.get('journey_id')
    if not journey_id:
        flash("Journey ID is required", "danger")
        return redirect(url_for('private_journey'))
    
    try:
        # Verify journey exists and belongs to current user
        with db.get_cursor() as cursor:
            cursor.execute('SELECT user_id FROM journeys WHERE journey_id = %s', (journey_id,))
            journey = cursor.fetchone()
            
            if not journey:
                flash("Journey not found", "danger")
                return redirect(url_for('private_journey'))
            
            if journey['user_id'] != session['user_id']:
                flash("You can only delete your own journeys", "danger")
                return redirect(url_for('private_journey'))
            
            # First delete all events associated with this journey
            cursor.execute('DELETE FROM events WHERE journey_id = %s', (journey_id,))
            
            # Then delete the journey
            cursor.execute('DELETE FROM journeys WHERE journey_id = %s', (journey_id,))
            db.close_db()
        
        flash("Journey deleted successfully", "success")
    except Exception as e:
        flash(f"Error deleting journey: {e}", "danger")
    
    # Redirect to private journey page
    return redirect(url_for('private_journey'))

@app.route('/journey/remove_cover/traveller')
def traveller_remove_cover_journey():
    if 'loggedin' not in session:
        return redirect(url_for('login'))
    
    user_id = session.get("user_id")
    if not user_id:
        flash("Session expired. Please log in again.", "danger")
        return redirect(url_for('login'))
    
    # Get journey_id from request parameters
    journey_id = request.args.get('journey_id')
    if not journey_id:
        flash("Journey ID is required", "danger")
        return redirect(url_for('private_journey'))
    
    removeJourneyCoverImage(user_id,journey_id)

    # Redirect to private journey page
    return redirect(url_for('private_journey'))

# @app.route('/journey/edit/admin', methods=['GET', 'POST'])
# def admin_edit_journey():

#     # Ensure user is logged in
#     if 'loggedin' not in session:
#         return redirect(url_for('login'))

#     role = session.get("role")
#     if role !="admin" and role !="editor":
#         flash("Role error. Only Admin or Editor can edit others' journey.", "danger")
#         return redirect(url_for('public_journey'))

#     if request.method == 'POST':
#         # Retrieve form data
#         journey_id = request.form.get("journey_id").strip()
#         title = request.form.get("title", "").strip()
#         description = request.form.get("description", "").strip()
#         status = request.form.get("status", "open").strip()  # Default to 'private'

#     # Validate title
#         if not title or len(title) > 100:
#             flash("Title is required and must be ≤ 100 characters", "danger")
#             return redirect(url_for('public_journey'))

#         try:
#             with db.get_cursor() as cursor:
#                 cursor.execute('''
#                     UPDATE journeys set title=%s, description=%s, status=%s where journey_id=%s;
#                 ''', ( title, description, status,journey_id,))
#                 db.close_db()
#             flash("Journey updated successfully!", "dark")
#             return redirect(url_for('public_journey'))  # Redirect to journey list
#         except Exception as e:
#             flash(f"{e}", "danger")
#             return redirect(url_for('public_journey'))

#     #redirect to journey.html, public mode
#     return render_template('public_journey.html')

@app.route('/journey/remove_cover/admin')
def admin_remove_cover_journey():
    if 'loggedin' not in session:
        return redirect(url_for('login'))
    
    user_id = request.args.get('user_id')
    if not user_id:
        flash("User_id is missing.", "danger")
        return redirect(url_for('public_journey'))
    
    # Get journey_id from request parameters
    journey_id = request.args.get('journey_id')
    if not journey_id:
        flash("Journey ID is required", "danger")
        return redirect(url_for('public_journey'))
    
    removeJourneyCoverImage(user_id,journey_id)

    # Redirect to private journey page
    return redirect(url_for('public_journey'))

@app.route('/journey/delete/admin')
def admin_delete_journey():
    """Delete a journey created by admin
    
    Parameters:
    journey_id: The ID of the journey to be deleted
    
    Returns:
    Redirects to the private_journey page with success or error message
    """
    # Ensure user is logged in
    if 'loggedin' not in session:
        return redirect(url_for('login'))
    
    role = session.get("role")
    if role !="admin" and role !="editor":
        flash("Role error. Only Admin or Editor can edit others' journey.", "danger")
        return redirect(url_for('public_journey'))
    
    # Get journey_id from request parameters
    journey_id = request.args.get('journey_id')
    if not journey_id:
        flash("Journey ID is required", "danger")
        return redirect(url_for('public_journey'))
    
    try:
        # Verify journey exists and belongs to current user
        with db.get_cursor() as cursor:
            cursor.execute('SELECT user_id FROM journeys WHERE journey_id = %s', (journey_id,))
            journey = cursor.fetchone()
            
            if not journey:
                flash("Journey not found", "danger")
                return redirect(url_for('public_journey'))
            
            # First delete all events associated with this journey
            cursor.execute('DELETE FROM events WHERE journey_id = %s', (journey_id,))
            
            # Then delete the journey
            cursor.execute('DELETE FROM journeys WHERE journey_id = %s', (journey_id,))
            db.close_db()
        
        flash("Journey deleted successfully", "success")
    except Exception as e:
        flash(f"Error deleting journey: {e}", "danger")
    
    # Redirect to private journey page
    return redirect(url_for('public_journey'))

@app.route('/journey/hide/admin')
def admin_hide_journey():

    #this is the interface of hidding target journey by admin or editor
    
    #params: journey_id, status

    journey_list={}
    

    return render_template('public_journey.html', journey_list=journey_list)

#remove cover image 
def removeJourneyCoverImage(user_id,journey_id):
    if  not journey_id :
        flash("Missing required parameters.", "danger")
        return
    
    try:
        with db.get_cursor() as cursor:
            cursor.execute('''
                SELECT *
                FROM journeys j 
                JOIN users u ON u.user_id = %s
                WHERE j.journey_id = %s;
            ''', (user_id, journey_id))
            journey_record = cursor.fetchone()
            db.close_db()
    except Exception as e:
        flash("Database error: " + str(e), "danger")
        return
        
    if not journey_record:
        flash("Journey not found or you lack permission.", "danger")
        return
    
    # 1. Delete old graphs (database + disk)
    try:
        with db.get_cursor() as cursor:
            cursor.execute('SELECT cover_image FROM journeys WHERE journey_id = %s', (journey_id,))
            old_image = cursor.fetchone()
            if old_image['cover_image'] is not None :
                if str(old_image['cover_image']).strip()!="":
                    img_path = os.path.join(app.root_path, "static", "journeys", old_image['cover_image'])
                    if os.path.exists(img_path):
                        os.remove(img_path)

                    cursor.execute('UPDATE journeys set cover_image="" WHERE journey_id = %s', (journey_id,))

            db.close_db()
    except Exception as e:
        flash("Failed to remove old images: " + str(e), "danger")
        return

#save cover image to upload
def uploadJourneyCoverImage(user_id,journey_id,file):
    
    """
    Handles event image upload logic:
      1. Validate the uploaded file (only JPG/PNG, <= 5MB).
      2. Store file and update the database record.
    """
    if  not journey_id or not file:
        flash("No file provided or invalid parameters",'danger')
        return
       
    try:
        with db.get_cursor() as cursor:
            cursor.execute('''
                SELECT *
                FROM journeys j 
                JOIN users u ON u.user_id = %s
                WHERE j.journey_id = %s;
            ''', (user_id, journey_id))
            journey_record = cursor.fetchone()
            db.close_db()
    except Exception as e:
        flash("Database error: " + str(e), "danger")
        return
        
    if not journey_record:
        flash("Journey not found or you lack permission.", "danger")
        return
    
    # 1. Delete old graphs (database + disk)
    try:
        with db.get_cursor() as cursor:
            cursor.execute('SELECT cover_image FROM journeys WHERE journey_id = %s', (journey_id,))
            old_image = cursor.fetchone()
            if old_image['cover_image'] is not None :
                if str(old_image['cover_image']).strip()!="":
                    img_path = os.path.join(app.root_path, "static", "journeys", old_image['cover_image'])
                    if os.path.exists(img_path):
                        os.remove(img_path)

                    cursor.execute('UPDATE journeys set cover_image="" WHERE journey_id = %s', (journey_id,))

            db.close_db()
    except Exception as e:
        flash("Failed to remove old images: " + str(e), "danger")
        return
    
    # 2. uploaded files
    upload_folder = os.path.join(app.root_path, "static", "journeys")
    if not os.path.exists(upload_folder):
        os.makedirs(upload_folder)
        
    
    if file.filename == '':
        flash("File is missing.", "danger")
        return
    
    # Validate file size (simple check example – can refine as needed)
    file.seek(0, os.SEEK_END)
    file_length = file.tell()
    file.seek(0, 0)  # Reset file pointer
    if file_length > MAX_CONTENT_LENGTH:
        flash("File is too large. Maximum allowed size is 5MB.", "danger")
        return
        

    # Validate file extension
    if not allowed_file(file.filename):
        flash("Only JPG/PNG image files are allowed.", "danger")
        return
        

    # Generate a secure filename
    filename = secure_filename(file.filename)
    
    # Example storage path: "static/uploads/events"
    # Ensure the directory exists
    upload_folder = os.path.join(app.root_path, "static", "journeys")
    if not os.path.exists(upload_folder):
        os.makedirs(upload_folder)

    # To prevent filename collisions, append a timestamp (or a random string)
    import time
    unique_filename = f"{int(time.time())}_{filename}"
    save_path = os.path.join(upload_folder, unique_filename)

    try:
        file.save(save_path)
    except Exception as e:
        flash("Error saving file: " + str(e), "danger")
        return
        
    # 5) Update the database record (event_image field)
    try:
        with db.get_cursor() as cursor:
            cursor.execute('''UPDATE journeys set cover_image=%s WHERE journey_id = %s; 
            ''', (unique_filename,journey_id, ))
            db.close_db()
    except Exception as e:
        flash("Error updating database: " + str(e), "danger")



       # Add this route to your existing Flask routes file

@app.route('/journey/follow/<int:journey_id>', methods=['POST'])
def follow_journey(journey_id):
    """Follow a public journey
    
    Allows paid subscribers and staff to follow journeys and see their events
    on the departure board.
    """
    # Check if user is logged in
    if 'loggedin' not in session:
        flash("Please log in to follow journeys.", "warning")
        return redirect(url_for('login'))
    
    user_id = session.get('user_id')
    role = session.get('role', '')
    
    # Check if user has permission (paid subscriber or staff)
    is_member = premium.checkMember(user_id)
    has_premium = is_member and is_member.get('m_status') != 'expired'
    is_staff = role in ['admin', 'editor']
    
    if not (is_staff or has_premium):
        flash("Only premium members and staff can follow journeys.", "warning")
        return redirect(url_for('public_journey'))
    
    try:
        with db.get_cursor() as cursor:
            # Check if journey exists and is public
            cursor.execute('''
                SELECT journey_id, title, user_id, display, status 
                FROM journeys 
                WHERE journey_id = %s AND status = 'open' 
                AND (display = 'public' OR display = 'published')
            ''', (journey_id,))
            journey = cursor.fetchone()
            
            if not journey:
                flash("Journey not found or not available for following.", "danger")
                return redirect(url_for('public_journey'))
            
            # Check if user is trying to follow their own journey
            if journey['user_id'] == user_id:
                flash("You cannot follow your own journey.", "info")
                return redirect(url_for('public_journey'))
            
            # Check if already following
            cursor.execute('''
                SELECT follow_id FROM journey_follows 
                WHERE user_id = %s AND journey_id = %s
            ''', (user_id, journey_id))
            existing_follow = cursor.fetchone()
            
            if existing_follow:
                flash("You are already following this journey.", "info")
            else:
                # Add follow relationship
                cursor.execute('''
                    INSERT INTO journey_follows (user_id, journey_id) 
                    VALUES (%s, %s)
                ''', (user_id, journey_id))
                flash(f"You are now following '{journey['title']}'!", "success")
            
            db.close_db()
            
    except Exception as e:
        flash("An error occurred while following the journey. Please try again.", "danger")
        print(f"Error following journey: {e}")  # For debugging
    
    return redirect(url_for('public_journey'))


@app.route('/journey/unfollow/<int:journey_id>', methods=['POST'])
def unfollow_journey(journey_id):
    """Unfollow a journey
    
    Removes a journey from user's follow list.
    """
    # Check if user is logged in
    if 'loggedin' not in session:
        return redirect(url_for('login'))
    
    user_id = session.get('user_id')
    
    try:
        with db.get_cursor() as cursor:
            # Check if user is following this journey
            cursor.execute('''
                SELECT jf.follow_id, j.title 
                FROM journey_follows jf
                JOIN journeys j ON jf.journey_id = j.journey_id
                WHERE jf.user_id = %s AND jf.journey_id = %s
            ''', (user_id, journey_id))
            follow_record = cursor.fetchone()
            
            if not follow_record:
                flash("You are not following this journey.", "info")
            else:
                # Remove follow relationship
                cursor.execute('''
                    DELETE FROM journey_follows 
                    WHERE user_id = %s AND journey_id = %s
                ''', (user_id, journey_id))
                flash(f"You have unfollowed '{follow_record['title']}'.", "success")
            
            db.close_db()
            
    except Exception as e:
        flash("An error occurred while unfollowing the journey. Please try again.", "danger")
        print(f"Error unfollowing journey: {e}")  # For debugging
    
    # Check if request came from departure board
    if request.referrer and 'departure_board' in request.referrer:
        return redirect(url_for('departure_board'))
    else:
        return redirect(url_for('public_journey'))


@app.route('/api/check_follow_status/<int:journey_id>')
def check_follow_status(journey_id):
    """Check if current user is following a specific journey
    
    Returns JSON response with follow status for AJAX requests.
    """
    if 'loggedin' not in session:
        return {'following': False, 'error': 'Not logged in'}
    
    user_id = session.get('user_id')
    
    try:
        with db.get_cursor() as cursor:
            cursor.execute('''
                SELECT follow_id FROM journey_follows 
                WHERE user_id = %s AND journey_id = %s
            ''', (user_id, journey_id))
            follow_record = cursor.fetchone()
            db.close_db()
            
            return {'following': bool(follow_record)}
            
    except Exception as e:
        return {'following': False, 'error': 'Database error'}
    
# Add edit log helper function
def log_journey_edit(journey_id, editor_id, field_changed, old_value, new_value, reason):
    """记录旅程编辑日志"""
    try:
        with db.get_cursor() as cursor:
            cursor.execute('''
                INSERT INTO edit_logs 
                (journey_id, event_id, editor_id, edit_type, field_changed, old_value, new_value, edit_reason)
                VALUES (%s, NULL, %s, 'journey_edit', %s, %s, %s, %s)
            ''', (journey_id, editor_id, field_changed, old_value, new_value, reason))
            db.close_db()
        return True
    except Exception as e:
        print(f"Error logging journey edit: {e}")
        return False


def check_journey_no_edits_flag(journey_id):
    """检查旅程是否设置了禁止编辑标记"""
    try:
        with db.get_cursor() as cursor:
            cursor.execute("SELECT no_edits_flag FROM journeys WHERE journey_id = %s", (journey_id,))
            result = cursor.fetchone()
            return result and result.get('no_edits_flag', False)
    except Exception as e:
        print(f"Error checking no_edits_flag: {e}")
        return False


# Modify the existing admin_edit_journey function to add the edit log function
@app.route('/journey/edit/admin', methods=['GET', 'POST'])
def admin_edit_journey():
    """管理员/编辑者编辑旅程 - 增强No-Edits检查"""
    if 'loggedin' not in session:
        return redirect(url_for('login'))

    role = session.get("role")
    if role not in ["admin", "editor"]:
        flash("Role error. Only Admin or Editor can edit others' journey.", "danger")
        return redirect(url_for('public_journey'))

    if request.method == 'POST':
        journey_id = request.form.get("journey_id").strip()
        title = request.form.get("title", "").strip()
        description = request.form.get("description", "").strip()
        status = request.form.get("status", "open").strip()
        edit_reason = request.form.get("edit_reason", "").strip()

        print(f"DEBUG EDIT: Attempting to edit journey {journey_id}")
        print(f"DEBUG EDIT: User role = {role}, User ID = {session['user_id']}")

        # Verify Edit Reason
        if not edit_reason or len(edit_reason) < 10:
            flash("Edit reason is required and must be at least 10 characters long.", "danger")
            return redirect(url_for('public_journey'))

        try:
            # Check No-Edits protection status
            with db.get_cursor() as cursor:
                cursor.execute('''
                    SELECT j.no_edits_flag, j.user_id, j.title,
                           m.m_status, m.end_time, u.username
                    FROM journeys j
                    LEFT JOIN members m ON j.user_id = m.user_id
                    LEFT JOIN users u ON j.user_id = u.user_id
                    WHERE j.journey_id = %s
                ''', (journey_id,))

                journey_info = cursor.fetchone()

                if not journey_info:
                    flash("Journey not found.", "danger")
                    return redirect(url_for('public_journey'))

                print(f"DEBUG EDIT: Journey {journey_id} no_edits_flag = {journey_info.get('no_edits_flag')}")

                # Check No-Edits Protection
                if journey_info.get('no_edits_flag'):
                    # Check if there is any subscription history (including expired ones)
                    has_subscription_history = journey_info.get('m_status') in ['active', 'expired']

                    if has_subscription_history:
                        if role == 'editor':
                            flash(
                                f"⚠️ This journey is protected by No-Edits setting from {journey_info.get('username', 'owner')}. Editors cannot modify protected content.",
                                "danger")
                            return redirect(url_for('public_journey'))
                        elif role == 'admin':
                            flash(
                                "⚠️ You are overriding No-Edits protection as an administrator. This action will be logged.",
                                "warning")
                            # Recording administrator override logs
                            log_journey_edit(journey_id, session['user_id'], 'admin_override',
                                             'no_edits_protection', 'protected', 'admin_override',
                                             f"Admin override: {edit_reason}")

            # Verify Title
            if not title or len(title) > 100:
                flash("Title is required and must be ≤ 100 characters", "danger")
                return redirect(url_for('public_journey'))

            # Get current data for comparison
            with db.get_cursor() as cursor:
                cursor.execute('''
                    SELECT title, description, status 
                    FROM journeys WHERE journey_id = %s
                ''', (journey_id,))
                current_data = cursor.fetchone()

            editor_id = session['user_id']
            changes_made = []

            # Review and record changes
            if title != current_data['title']:
                log_journey_edit(journey_id, editor_id, 'title',
                                 current_data['title'], title, edit_reason)
                changes_made.append('title')

            if description != (current_data['description'] or ''):
                log_journey_edit(journey_id, editor_id, 'description',
                                 current_data['description'] or '', description, edit_reason)
                changes_made.append('description')

            if status != current_data['status']:
                log_journey_edit(journey_id, editor_id, 'status',
                                 current_data['status'], status, edit_reason)
                changes_made.append('status')

            # Update trip data
            with db.get_cursor() as cursor:
                cursor.execute('''
                    UPDATE journeys SET title=%s, description=%s, status=%s 
                    WHERE journey_id=%s
                ''', (title, description, status, journey_id))
                db.close_db()

            if changes_made:
                flash(f"Journey updated successfully! Changes logged: {', '.join(changes_made)}", "success")
            else:
                flash("No changes were made.", "info")

            return redirect(url_for('public_journey'))

        except Exception as e:
            print(f"ERROR in admin_edit_journey: {e}")
            flash(f"Error updating journey: {e}", "danger")
            return redirect(url_for('public_journey'))

    return render_template('public_journey.html')

# New: Get the route of the trip editing history
@app.route('/journey/<int:journey_id>/edit_history')
def view_journey_edit_history(journey_id):
    # ake sure the user is logged in
    if 'loggedin' not in session:
        return redirect(url_for('login'))

    user_id = session['user_id']
    user_role = session.get('role')

    try:
        # Check permissions: Journey owners, admins, or editors can view
        with db.get_cursor() as cursor:
            cursor.execute('SELECT user_id, title FROM journeys WHERE journey_id = %s', (journey_id,))
            journey = cursor.fetchone()

            if not journey:
                flash("Journey not found.", "danger")
                return redirect(url_for('public_journey'))

            # Permission Check
            if user_id != journey['user_id'] and user_role not in ['admin', 'editor']:
                flash("You don't have permission to view the edit history of this journey.", "danger")
                return redirect(url_for('public_journey'))

            # Get edit history
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
                    u.role as editor_role,
                    e.title as event_title
                FROM edit_logs el
                JOIN users u ON el.editor_id = u.user_id
                LEFT JOIN events e ON el.event_id = e.event_id
                WHERE el.journey_id = %s
                ORDER BY el.created_at DESC
            ''', (journey_id,))

            edit_logs = cursor.fetchall()
            db.close_db()

        return render_template('journey_edit_history.html',
                               journey=journey,
                               edit_logs=edit_logs,
                               journey_id=journey_id)

    except Exception as e:
        flash(f"Error retrieving edit history: {e}", "danger")
        return redirect(url_for('public_journey'))


# New: Set routes that prohibit editing tags
@app.route('/api/journey/<int:journey_id>/toggle_no_edits', methods=['POST'])
def toggle_journey_no_edits(journey_id):
    if 'loggedin' not in session:
        return jsonify({'error': 'Not logged in'}), 401

    user_id = session['user_id']

    # Add detailed logging
    print(f"=== Toggle No-Edits Debug ===")
    print(f"Journey ID: {journey_id}")
    print(f"User ID: {user_id}")

    try:
        # Using transactions to ensure data consistency
        conn = db.get_db()

        conn.begin()

        try:
            with db.get_cursor() as cursor:
                # 1. Check if a trip exists and get information about it
                cursor.execute('''
                    SELECT j.user_id, j.no_edits_flag, j.title,
                           m.m_status, m.end_time
                    FROM journeys j
                    LEFT JOIN members m ON j.user_id = m.user_id
                    WHERE j.journey_id = %s
                ''', (journey_id,))
                journey = cursor.fetchone()

                print(f"Journey data: {journey}")

                if not journey:
                    conn.rollback()
                    return jsonify({'error': 'Journey not found'}), 404

                # 2. Permission check: Only the trip owner can set protection
                if user_id != journey['user_id']:
                    conn.rollback()
                    return jsonify({'error': 'Only the journey owner can set No-Edits protection'}), 403

                # 3. Check if the user has subscription history (current or expired subscriber)
                has_subscription_history = journey.get('m_status') in ['active', 'expired']
                print(f"Subscription status: {journey.get('m_status')}, Has history: {has_subscription_history}")

                if not has_subscription_history:
                    conn.rollback()
                    return jsonify({
                        'error': 'No-Edits protection is only available for current and former subscribers',
                        'requires_subscription': True
                    }), 403

                # 4. Get the current mark status
                current_flag = bool(journey['no_edits_flag']) if journey['no_edits_flag'] is not None else False
                new_flag = not current_flag

                print(f"Current flag: {current_flag} (type: {type(journey['no_edits_flag'])})")
                print(f"New flag: {new_flag}")

                # 5. Update the database
                if new_flag:
                    # Enable protection
                    cursor.execute('''
                        UPDATE journeys 
                        SET no_edits_flag = %s, 
                            no_edits_set_at = %s, 
                            no_edits_set_by = %s 
                        WHERE journey_id = %s
                    ''', (True, datetime.now(), user_id, journey_id))
                else:
                    # Disable protection
                    cursor.execute('''
                        UPDATE journeys 
                        SET no_edits_flag = %s, 
                            no_edits_set_at = %s, 
                            no_edits_set_by = %s 
                        WHERE journey_id = %s
                    ''', (False, None, None, journey_id))

                # 6. Check if the update was successful
                affected_rows = cursor.rowcount
                print(f"Affected rows: {affected_rows}")

                if affected_rows == 0:
                    conn.rollback()
                    return jsonify({'error': 'Failed to update journey'}), 500

                # 7. Verify the update result
                cursor.execute('''
                    SELECT no_edits_flag, no_edits_set_at, no_edits_set_by 
                    FROM journeys 
                    WHERE journey_id = %s
                ''', (journey_id,))
                updated_journey = cursor.fetchone()

                print(f"Updated journey data: {updated_journey}")

                if updated_journey:
                    actual_flag = bool(updated_journey['no_edits_flag'])
                    print(f"Actual flag after update: {actual_flag}")

                    # Verify that the update was correct
                    if actual_flag != new_flag:
                        conn.rollback()
                        return jsonify({
                            'error': f'Update verification failed. Expected: {new_flag}, Got: {actual_flag}'
                        }), 500
                else:
                    conn.rollback()
                    return jsonify({'error': 'Failed to verify update'}), 500

            # 8. Committing a transaction
            conn.commit()
            print(f"Transaction committed successfully")

            return jsonify({
                'success': True,
                'no_edits_flag': new_flag,
                'journey_id': journey_id,
                'message': f"No-edits protection {'enabled' if new_flag else 'disabled'} successfully",
                'debug_info': {
                    'original_flag': current_flag,
                    'new_flag': new_flag,
                    'actual_flag': actual_flag,
                    'affected_rows': affected_rows
                }
            })

        except Exception as e:
            # rollback
            conn.rollback()
            print(f"Transaction rolled back due to error: {e}")
            raise e

    except Exception as e:
        print(f"Error toggling no_edits flag: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'An internal error occurred: {str(e)}'}), 500

# Database debugging functions added to journey.py
@app.route('/api/journey/<int:journey_id>/debug_no_edits', methods=['GET'])
def debug_no_edits_status(journey_id):
    if 'loggedin' not in session:
        return jsonify({'error': 'Not logged in'}), 401

    try:
        with db.get_cursor() as cursor:
            cursor.execute('''
                SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT, IS_NULLABLE
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 'journeys'
                AND COLUMN_NAME IN ('no_edits_flag', 'no_edits_set_at', 'no_edits_set_by')
            ''')
            table_structure = cursor.fetchall()

            cursor.execute('''
                SELECT j.journey_id, j.title, j.no_edits_flag, j.no_edits_set_at, 
                       j.no_edits_set_by, j.user_id,
                       m.m_status, m.end_time,
                       u.role, u.username
                FROM journeys j
                LEFT JOIN members m ON j.user_id = m.user_id
                LEFT JOIN users u ON j.user_id = u.user_id
                WHERE j.journey_id = %s
            ''', (journey_id,))

            result = cursor.fetchone()

            if result:
                return jsonify({
                    'table_structure': table_structure,
                    'journey_data': {
                        'journey_id': result['journey_id'],
                        'title': result['title'],
                        'no_edits_flag': result['no_edits_flag'],
                        'no_edits_flag_type': type(result['no_edits_flag']).__name__,
                        'no_edits_set_at': str(result['no_edits_set_at']) if result['no_edits_set_at'] else None,
                        'no_edits_set_by': result['no_edits_set_by'],
                        'owner_id': result['user_id'],
                        'owner_username': result['username'],
                        'owner_role': result['role'],
                        'subscription_status': result['m_status'],
                        'subscription_expiry': str(result['end_time']) if result['end_time'] else None,
                        'has_subscription_history': result['m_status'] in ['active', 'expired'] if result[
                            'm_status'] else False
                    },
                    'current_user': {
                        'user_id': session['user_id'],
                        'role': session.get('role'),
                        'is_owner': session['user_id'] == result['user_id']
                    }
                })
            else:
                return jsonify({'error': 'Journey not found'}), 404

    except Exception as e:
        import traceback
        return jsonify({
            'error': f'Database error: {str(e)}',
            'traceback': traceback.format_exc()
        }), 500


@app.route('/api/test/no_edits/<int:journey_id>', methods=['GET', 'POST'])
def test_no_edits_function(journey_id):
    if 'loggedin' not in session:
        return jsonify({'error': 'Not logged in'}), 401

    if session.get('role') not in ['admin', 'editor']:
        return jsonify({'error': 'Admin/Editor access required for testing'}), 403

    try:
        with db.get_cursor() as cursor:
            if request.method == 'GET':
                cursor.execute('''
                    SELECT j.journey_id, j.title, j.user_id, j.no_edits_flag,
                           j.no_edits_set_at, j.no_edits_set_by,
                           u.username, m.m_status
                    FROM journeys j
                    LEFT JOIN users u ON j.user_id = u.user_id
                    LEFT JOIN members m ON j.user_id = m.user_id
                    WHERE j.journey_id = %s
                ''', (journey_id,))

                result = cursor.fetchone()
                if result:
                    return jsonify({
                        'journey_id': result['journey_id'],
                        'title': result['title'],
                        'owner': result['username'],
                        'owner_id': result['user_id'],
                        'no_edits_flag': result['no_edits_flag'],
                        'no_edits_flag_type': type(result['no_edits_flag']).__name__,
                        'no_edits_set_at': str(result['no_edits_set_at']) if result['no_edits_set_at'] else None,
                        'no_edits_set_by': result['no_edits_set_by'],
                        'subscription_status': result['m_status']
                    })
                else:
                    return jsonify({'error': 'Journey not found'}), 404

            elif request.method == 'POST':
                test_flag = request.json.get('test_flag', True)

                cursor.execute('''
                    UPDATE journeys 
                    SET no_edits_flag = %s,
                        no_edits_set_at = %s,
                        no_edits_set_by = %s
                    WHERE journey_id = %s
                ''', (test_flag, datetime.now() if test_flag else None, session['user_id'] if test_flag else None,
                      journey_id))

                affected_rows = cursor.rowcount
                db.get_db().commit()

                cursor.execute('SELECT no_edits_flag FROM journeys WHERE journey_id = %s', (journey_id,))
                verify = cursor.fetchone()

                return jsonify({
                    'success': True,
                    'test_flag_set': test_flag,
                    'affected_rows': affected_rows,
                    'verified_flag': verify['no_edits_flag'] if verify else None,
                    'message': f'Test update completed. Flag set to {test_flag}'
                })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/journey/<int:journey_id>/details')
def get_journey_details(journey_id):
    if 'loggedin' not in session or session.get('role') not in ['admin', 'editor', 'moderator']:
        return jsonify({'error': 'Permission denied'}), 403

    try:
        with db.get_cursor() as cursor:
            cursor.execute('''
                SELECT 
                    j.journey_id,
                    j.title,
                    j.description,
                    j.start_date,
                    j.created_at,
                    j.status,
                    j.display,
                    j.cover_image,
                    u.username as owner_username,
                    u.user_id as owner_id,
                    u.first_name,
                    u.last_name,
                    COUNT(e.event_id) as event_count
                FROM journeys j
                JOIN users u ON j.user_id = u.user_id
                LEFT JOIN events e ON j.journey_id = e.journey_id
                WHERE j.journey_id = %s
                GROUP BY j.journey_id
            ''', (journey_id,))

            journey = cursor.fetchone()
            db.close_db()

            if not journey:
                return jsonify({'error': 'Journey not found'}), 404

            return jsonify({
                'success': True,
                'journey': {
                    'journey_id': journey['journey_id'],
                    'title': journey['title'],
                    'description': journey['description'],
                    'start_date': journey['start_date'].isoformat() if journey['start_date'] else None,
                    'created_at': journey['created_at'].isoformat() if journey['created_at'] else None,
                    'status': journey['status'],
                    'display': journey['display'],
                    'cover_image': journey['cover_image'],
                    'owner_username': journey['owner_username'],
                    'owner_id': journey['owner_id'],
                    'owner_full_name': f"{journey['first_name']} {journey['last_name']}" if journey['first_name'] and
                                                                                            journey['last_name'] else
                    journey['owner_username'],
                    'event_count': journey['event_count']
                }
            })

    except Exception as e:
        print(f"Error getting journey details: {e}")
        return jsonify({'error': 'Internal server error'}), 500


def validate_journey_report_data(journey_id, reporter_id, reason, details):
    errors = []

    # check journey_id
    if not journey_id:
        errors.append("Journey ID is required")
    else:
        try:
            with db.get_cursor() as cursor:
                cursor.execute("SELECT journey_id FROM journeys WHERE journey_id = %s", (journey_id,))
                if not cursor.fetchone():
                    errors.append("Journey not found")
                db.close_db()
        except Exception as e:
            errors.append("Error validating journey")

    # Verification of report reason
    valid_reasons = ['spam', 'inappropriate_content', 'false_information',
                     'copyright_violation', 'offensive_language', 'other']
    if not reason or reason not in valid_reasons:
        errors.append("Invalid report reason")

    # Verification of Details
    if not details or len(details.strip()) < 10:
        errors.append("Report details must be at least 10 characters long")

    # Verification of User Permissions
    if not check_user_report_permissions(reporter_id):
        errors.append("User does not have permission to submit reports")

    return errors


# Notification function

def notify_moderators_new_journey_report(report_id):
    try:
        with db.get_cursor() as cursor:
            # 获取报告详情
            cursor.execute('''
                SELECT 
                    jr.report_id,
                    jr.reason,
                    j.title as journey_title,
                    reporter.username as reporter_username
                FROM journey_reports jr
                JOIN journeys j ON jr.journey_id = j.journey_id
                JOIN users reporter ON jr.reporter_id = reporter.user_id
                WHERE jr.report_id = %s
            ''', (report_id,))

            report = cursor.fetchone()

            if report:
                # Get all administrators and editors
                cursor.execute('''
                    SELECT user_id, username, email
                    FROM users 
                    WHERE role IN ('admin', 'editor', 'moderator') 
                    AND status = 'active'
                ''')

                moderators = cursor.fetchall()

                # Email notification or system notification can be implemented here
                # Currently only logs are printed
                print(
                    f"New journey report #{report_id}: {report['reason']} for journey '{report['journey_title']}' by {report['reporter_username']}")
                print(f"Notifying {len(moderators)} moderators")

            db.close_db()

    except Exception as e:
        print(f"Error notifying moderators: {e}")


# Auxiliary functions related to statistical reports

def get_journey_report_statistics():
    """获取journey报告统计信息"""
    try:
        with db.get_cursor() as cursor:
            stats = {}

            # Statistics by status
            cursor.execute('''
                SELECT status, COUNT(*) as count
                FROM journey_reports
                GROUP BY status
            ''')
            stats['by_status'] = cursor.fetchall()

            # Statistics by reason
            cursor.execute('''
                SELECT reason, COUNT(*) as count
                FROM journey_reports
                GROUP BY reason
                ORDER BY count DESC
            ''')
            stats['by_reason'] = cursor.fetchall()

            # Number of reports in the last 30 days
            cursor.execute('''
                SELECT COUNT(*) as count
                FROM journey_reports
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            ''')
            result = cursor.fetchone()
            stats['last_30_days'] = result['count'] if result else 0

            # Number of pending reports
            cursor.execute('''
                SELECT COUNT(*) as count
                FROM journey_reports
                WHERE status = 'pending'
            ''')
            result = cursor.fetchone()
            stats['pending_count'] = result['count'] if result else 0

            db.close_db()
            return stats

    except Exception as e:
        print(f"Error getting journey report statistics: {e}")
        return {}


# Flask application configuration checking
def check_flask_app_config():
    """检查Flask应用配置是否支持报告功能"""
    required_configs = [
        'SECRET_KEY',  
        'MAX_CONTENT_LENGTH'  # For file upload restrictions
    ]

    missing_configs = []
    for config in required_configs:
        if not app.config.get(config):
            missing_configs.append(config)

    if missing_configs:
        print(f"Warning: Missing Flask configurations: {missing_configs}")
        return False

    return True


# # Usage examples and test functions

# def test_journey_report_system():
#     """Test the basic functionality of the journey reporting system"""
#     print("Testing journey report system...")

#     # Test database table
#     if not check_journey_reports_table():
#         print("❌ Database table test failed")
#         return False

#     # Testing the Flask Configuration
#     if not check_flask_app_config():
#         print("⚠️  Flask configuration incomplete")

#     # Test statistics function
#     try:
#         stats = get_journey_report_statistics()
#         print(f"✅ Statistics test passed: {stats.get('pending_count', 0)} pending reports")
#     except Exception as e:
#         print(f"❌ Statistics test failed: {e}")
#         return False

#     print("✅ Journey report system test completed successfully!")
#     return True


# Call initialization when the application starts
# if __name__ == "__main__":
#     # Initialize the reporting system when the application starts
#     initialize_journey_reports()

@app.route('/journey/report', methods=['POST'])
def report_journey():
    """提交journey报告"""
    # Submit a journey report
    if 'loggedin' not in session:
        flash('You must be logged in to report content.', 'danger')
        return redirect(url_for('login'))

    # Get form data
    journey_id = request.form.get('journey_id')
    reason = request.form.get('reason')
    details = request.form.get('details', '').strip()
    reporter_id = session['user_id']

    # Validating Input
    if not journey_id or not reason or not details:
        flash('All fields are required.', 'danger')
        return redirect(url_for('public_journey'))

    if len(details) < 10:
        flash('Report details must be at least 10 characters long.', 'danger')
        return redirect(url_for('public_journey'))

    # Verification report reason
    valid_reasons = ['spam', 'inappropriate_content', 'false_information',
                     'copyright_violation', 'offensive_language', 'other']
    if reason not in valid_reasons:
        flash('Invalid report reason.', 'danger')
        return redirect(url_for('public_journey'))

    try:
        with db.get_cursor() as cursor:
            # Check if the journey exists
            cursor.execute('SELECT journey_id, user_id, title FROM journeys WHERE journey_id = %s', (journey_id,))
            journey = cursor.fetchone()

            if not journey:
                flash('Journey not found.', 'danger')
                return redirect(url_for('public_journey'))

            # Check if the user is trying to report their journey
            if journey['user_id'] == reporter_id:
                flash('You cannot report your own journey.', 'danger')
                return redirect(url_for('public_journey'))

            # Check if this journey has already been reported
            cursor.execute('''
                SELECT report_id FROM journey_reports 
                WHERE journey_id = %s AND reporter_id = %s
            ''', (journey_id, reporter_id))

            existing_report = cursor.fetchone()
            if existing_report:
                flash('You have already reported this journey.', 'warning')
                return redirect(url_for('public_journey'))

            # Insert Report
            cursor.execute('''
                INSERT INTO journey_reports (journey_id, reporter_id, reason, details, status, created_at)
                VALUES (%s, %s, %s, %s, 'pending', %s)
            ''', (journey_id, reporter_id, reason, details, datetime.now()))

            db.close_db()

        flash('Thank you for your report. Our moderation team will review it shortly.', 'success')

    except Exception as e:
        print(f"Error submitting journey report: {e}")
        flash('An error occurred while submitting your report. Please try again.', 'danger')

    return redirect(url_for('public_journey'))

@app.route('/moderation/journey_reports')
def journey_moderation_dashboard():
    """Journey Reports Admin Panel"""
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

    return render_template('journey_moderation_dashboard.html',
                           reported_journeys=reported_journeys,
                           current_user_role=user_role)


@app.route('/moderation/journey_action/<int:report_id>', methods=['POST'])
def journey_moderation_action(report_id):
    """Administrator actions for processing journey reports"""
    if 'loggedin' not in session or session.get('role') not in ['admin', 'editor', 'moderator']:
        return jsonify({'success': False, 'message': 'Permission denied.'}), 403

    action = request.form.get('action')
    moderator_id = session['user_id']
    current_time = datetime.now()
    conn = None

    try:
        conn = db.get_db()
        with db.get_cursor() as cursor:
            # Get report details
            cursor.execute('''
                SELECT jr.journey_id, jr.status, j.title, j.user_id as journey_owner_id
                FROM journey_reports jr
                JOIN journeys j ON jr.journey_id = j.journey_id
                WHERE jr.report_id = %s
            ''', (report_id,))

            report = cursor.fetchone()
            if not report:
                return jsonify({'success': False, 'message': 'Report not found.'}), 404

            journey_id = report['journey_id']

            if action == 'hide_journey':
                # hide journey
                admin_response = request.form.get('admin_response', 'Journey hidden due to policy violation.')

                cursor.execute('''
                    UPDATE journeys 
                    SET status = 'hidden' 
                    WHERE journey_id = %s
                ''', (journey_id,))

                # update status
                cursor.execute('''
                    UPDATE journey_reports 
                    SET status = 'reviewed', reviewed_by = %s, reviewed_at = %s, admin_response = %s
                    WHERE report_id = %s
                ''', (moderator_id, current_time, admin_response, report_id))

                message = 'Journey has been hidden and report marked as reviewed.'

            elif action == 'dismiss':
                # dismiss report
                admin_response = request.form.get('admin_response', 'Report reviewed and dismissed.')

                cursor.execute('''
                    UPDATE journey_reports 
                    SET status = 'dismissed', reviewed_by = %s, reviewed_at = %s, admin_response = %s
                    WHERE report_id = %s
                ''', (moderator_id, current_time, admin_response, report_id))

                message = 'Report dismissed successfully.'

            elif action == 'ban_user':
                # only admin can ban users
                if session.get('role') != 'admin':
                    return jsonify({'success': False, 'message': 'Only Admins can ban users.'}), 403

                #  ban the journey owner
                cursor.execute('''
                    UPDATE users
                    SET status = 'banned'
                    WHERE user_id = %s
                ''', (report['journey_owner_id'],))

                # hide all of the journeys of this user
                cursor.execute('''
                    UPDATE journeys
                    SET status = 'hidden'
                    WHERE user_id = %s
                ''', (report['journey_owner_id'],))

                # update status
                admin_response = request.form.get('admin_response', 'User banned for policy violations.')
                cursor.execute('''
                    UPDATE journey_reports 
                    SET status = 'reviewed', reviewed_by = %s, reviewed_at = %s, admin_response = %s
                    WHERE report_id = %s
                ''', (moderator_id, current_time, admin_response, report_id))

                message = 'User has been banned and all their journeys hidden.'

            else:
                return jsonify({'success': False, 'message': 'Invalid action.'}), 400

            conn.commit()
            return jsonify({'success': True, 'message': message})

    except Exception as e:
        if conn:
            conn.rollback()
        print(f"Error in journey_moderation_action: {e}")
        return jsonify({'success': False, 'message': f'An error occurred: {str(e)}'}), 500

    finally:
        if conn:
            db.close_db()


@app.route('/api/journey_reports/stats')
def journey_reports_stats():
    """Get journey report statistics (administrators only)"""
    if 'loggedin' not in session or session.get('role') not in ['admin', 'editor']:
        return jsonify({'error': 'Permission denied'}), 403

    try:
        with db.get_cursor() as cursor:
            # Get statistics
            cursor.execute('''
                SELECT 
                    status,
                    COUNT(*) as count
                FROM journey_reports
                GROUP BY status
            ''')
            status_counts = cursor.fetchall()

            cursor.execute('''
                SELECT 
                    reason,
                    COUNT(*) as count
                FROM journey_reports
                GROUP BY reason
                ORDER BY count DESC
            ''')
            reason_counts = cursor.fetchall()

            cursor.execute('''
                SELECT COUNT(*) as total_reports
                FROM journey_reports
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            ''')
            recent_reports = cursor.fetchone()

            db.close_db()

        return jsonify({
            'status_counts': status_counts,
            'reason_counts': reason_counts,
            'recent_reports_30d': recent_reports['total_reports'] if recent_reports else 0
        })

    except Exception as e:
        print(f"Error getting journey reports stats: {e}")
        return jsonify({'error': 'Internal server error'}), 500


# You also need to add a user permission check function (if not already there)
def check_user_report_permissions(user_id):
    """Check if the user has reporting permissions"""
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

            # 被禁用的用户不能报告
            if user['status'] == 'banned':
                return False

            return True

    except Exception as e:
        print(f"Error checking user report permissions: {e}")
        return False