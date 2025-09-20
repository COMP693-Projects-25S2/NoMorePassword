from webapp import app
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


@app.route('/events/private/view')
def private_events():
    # Ensure the user is logged in
    if 'loggedin' not in session:
        return redirect(url_for('login'))
    
    event_list = []
    is_member = None
    user_id = session.get("user_id") if 'loggedin' in session else None
    # Get the current user's favorite destinations
    favorite_destinations = []
    if user_id:
        with db.get_cursor() as cursor:
            cursor.execute('SELECT favorite_destinations FROM users WHERE user_id = %s', (user_id,))
            result = cursor.fetchone()
            if result and result['favorite_destinations']:
                favorite_destinations = result['favorite_destinations'].split('\n')
            db.close_db()
    # Retrieve events for a specific journey if journey_id is provided in URL
    journey_id = request.args.get('journey_id')  # Get journey_id from URL parameters
    journey_title = request.args.get('journey_title')  # Get journey_title from URL parameters
    event_successful = request.args.get('event_successful')  # Get event_successful from URL parameters
    is_staff = session.get('role') in ('admin', 'editor')
    if journey_id:
        # Query events for the specified journey, filtered by private display,
        # and order events from oldest to most recent.
        # Use a cursor with dictionary results for easier data handling
        with db.get_cursor() as cursor:
            cursor.execute('''
                    SELECT e.event_id, e.journey_id, e.title, e.description, e.start_time, e.end_time, l.address,
                    l.location_id, e.display,
                    (SELECT COUNT(*) FROM event_likes el WHERE el.event_id = e.event_id) AS like_count,
                    (SELECT COUNT(*) FROM event_likes WHERE event_id = e.event_id AND user_id = %s) AS user_liked
                    FROM events e inner join locations l on e.location_id=l.location_id
                    WHERE e.journey_id = %s 
                    ORDER BY e.start_time ASC
                ''', (user_id, journey_id,))
            event_list = cursor.fetchall()
            
            for event in event_list:
                event['is_favorite'] = event['address'] in favorite_destinations
                # Comment related
                comments = get_event_comments(event['event_id'], is_staff)
                event['comments'] = comments
                event['comment_count'] = len([c for c in comments if not c['is_hidden']])
                cursor.execute('''
                        SELECT * from event_images where event_id=%s;
                    ''', (event['event_id'],))
                images = cursor.fetchall()
                event['event_images']=[]
                for i in images:
                    event['event_images'].append(i)

            db.close_db()

        is_member=premium.checkMember(session['user_id'])
        if is_member and (is_member['note_msg'] != '') and is_member['note_ignore']==0:
            flash(is_member['note_msg'],'info')
    # Render the private journey page with journey and event data.
    # The template should check if event_list is empty and display a "No events added yet" message.
    return render_template('private_event.html', is_member=is_member, journey_id=journey_id,journey_title=journey_title, event_list=event_list,event_successful=event_successful)

# Check if the user is an admin or staff
# This function is used to determine if the user has admin or staff privileges
def get_is_staff():
    return session.get('role') in ('admin', 'editor', 'moderator')

@app.route('/events/public/view')
def public_events():
    
    event_list = []
    
    # Retrieve events for a specific journey if journey_id is provided in URL
    journey_id = request.args.get('journey_id')  # Get journey_id from URL parameters
    journey_title = request.args.get('journey_title')  # Get journey_title from URL parameters
    event_successful = request.args.get('event_successful')  # Get event_successful from URL parameters
    user_id = session.get("user_id") if 'loggedin' in session else None
    # Get search keywords and filter parameters
    keyword = request.args.get('keyword', '')
    filter_type = request.args.get('filter', 'content')
    
    favorite_destinations = []
    if user_id:
        with db.get_cursor() as cursor:
            cursor.execute('SELECT favorite_destinations FROM users WHERE user_id = %s', (user_id,))
            result = cursor.fetchone()
            if result and result['favorite_destinations']:
                favorite_destinations = result['favorite_destinations'].split('\n')
            db.close_db()
    if journey_id:
        # Query events for the specified journey, filtered by private display,
        # and order events from oldest to most recent.
        # Use a cursor with dictionary results for easier data handling
        with db.get_cursor() as cursor:
            cursor.execute('''
                SELECT e.event_id, e.journey_id, e.title, e.description, e.event_image, e.start_time, e.end_time,e.display, l.address,
                (SELECT COUNT(*) FROM event_likes el WHERE el.event_id = e.event_id) AS like_count,
                (SELECT COUNT(*) FROM event_likes WHERE event_id = e.event_id AND user_id = %s) AS user_liked
                FROM events e inner join locations l on e.location_id=l.location_id
                WHERE (e.display='public' or e.display='published') and e.journey_id = %s 
                ORDER BY e.start_time ASC  -- Show events from oldest to most recent
            ''', (user_id, journey_id,))
            event_list = cursor.fetchall()

            queryJourney ='''select * from journeys where journey_id=%s;'''
            cursor.execute(queryJourney, (journey_id,))
            journey=cursor.fetchone()

            is_member=premium.checkMember(journey['user_id'])
            if is_member and 'note_msg' in is_member and is_member['note_msg'] is not None and (is_member['note_msg'].strip() != '') and is_member['note_ignore']==0:
                flash(is_member['note_msg'],'info')

            for event in event_list:
                cursor.execute('''
                        SELECT * from event_images where event_id=%s;
                    ''', (event['event_id'],))

                event['event_images'] = []
                
                if is_member:
                    images = cursor.fetchall()
                    for i in images:
                        image_obj = {
                        'event_image': i,
                        'event_id': event['event_id']
                        }
                        event['event_images'].append(image_obj)
                else:
                    i = cursor.fetchone()
                    if i:
                        image_obj = {
                            'event_image': i,
                            'event_id': event['event_id']
                            }
                        event['event_images'].append(image_obj)
                    
                event['is_favorite'] = event['address'] in favorite_destinations
                
                # New: Check if the user is following this place
                if user_id:
                    cursor.execute('''
                        SELECT COUNT(*) as is_following 
                        FROM location_follows 
                        WHERE user_id = %s AND location_id = (
                            SELECT location_id FROM events WHERE event_id = %s
                        )
                    ''', (user_id, event['event_id']))
                    follow_result = cursor.fetchone()
                    event['is_location_followed'] = follow_result['is_following'] > 0
                else:
                    event['is_location_followed'] = False

                # Get location_id for follow button
                cursor.execute('SELECT location_id FROM events WHERE event_id = %s', (event['event_id'],))
                location_result = cursor.fetchone()
                event['location_id'] = location_result['location_id'] if location_result else None
                
                # Comments
                is_staff = get_is_staff()
                comments = get_event_comments(event['event_id'], is_staff)
                event['comments'] = comments
                event['comment_count'] = len([c for c in comments if not c['is_hidden']])

            db.close_db()
  
    # Render the private journey page with journey and event data.
    # The template should check if event_list is empty and display a "No events added yet" message.
    return render_template('public_event.html', 
                          journey_id=journey_id,
                          journey_title=journey_title, 
                          event_list=event_list,
                          event_successful=event_successful,
                          keyword=keyword,  # Pass keyword arguments
                          filter=filter_type)  # Pass filter parameters

@app.route('/event/add', methods=['GET', 'POST'])
def add_event():
    """Event creation endpoint.
    
    Allows users to add an event to a journey, including title, description, start and end time, and location.
    """
    # Ensure the user is logged in
    if 'loggedin' not in session:
        return redirect(url_for('login'))

    user_id = session.get("user_id")  # Retrieve the current user ID
    if not user_id:
        flash("Session expired. Please log in again.", "danger")
        return redirect(url_for('login'))

    if request.method == 'POST':

        # Retrieve form data
        journey_id = request.form.get("journey_id")  # The journey to which the event belongs
        journey_title = request.form.get("journey_title", "").strip()  # Event title
        event_title = request.form.get("event_title", "").strip()  # Event title
        description = request.form.get("description", "").strip()  # Optional event description
        location = request.form['location'].strip()
        event_image=None
        try:
            event_image = request.files['event_image']  # image_file of the event
        except:
            event_image=None
        event_images=None
        try:
            event_images = request.files.getlist('event_images')
        except:
            event_images=None
        start_date = request.form.get("start_date", "").strip()  # Event start date
        start_time = request.form.get("start_time", "").strip()  # Event start date
        end_date = request.form.get("end_date", "").strip()  # Event start date
        end_time = request.form.get("end_time", "").strip()  # Optional event end date
        display = request.form.get("display", "private").strip().lower()  # Display setting (default: private)

        # Ensure the display mode is valid
        if display not in ["public", "private", "published"]:
            display = "private"

        # Validate mandatory fields
        if not journey_id:
            flash("Invalid journey selection.", "danger")
            return redirect(url_for('private_events',journey_id=journey_id,journey_title=journey_title))

        if not journey_title:
            flash("Title is required.", "danger")
            return redirect(url_for('private_events',journey_id=journey_id,journey_title=journey_title))
        
        

        # Query locations table to check if the city already exists
        with db.get_cursor() as cursor:
            cursor.execute("SELECT location_id FROM locations WHERE address = %s",
                        (location,))
            location_id_result = cursor.fetchone()
            db.close_db()

        # If location exists, use the existing location_id, otherwise insert a new entry
        if location_id_result:
            location_id = location_id_result['location_id']

        else:
            # Insert new city information into locations table
            with db.get_cursor() as cursor:
                    cursor.execute("INSERT INTO locations (address) VALUES (%s)", 
                                (location,))
                    location_id = cursor.lastrowid  # Retrieve new location_id
                    db.close_db()

        # Ensure location_id is valid
        if not location_id:
            flash("Error retrieving location. ", "danger")

        # Validate and format date-time fields
        try:
            if start_date and start_time:
                start_time = f"{start_date} {start_time}"
            else:
                start_time=datetime.now()

            if end_date and end_time:
                end_time = f"{end_date} {end_time}"
            else:
                end_time=datetime.now()
        except ValueError:
            flash("Invalid date format! Use YYYY-MM-DD HH:MM.", "danger")
            return redirect(url_for('private_events',journey_id=journey_id,journey_title=journey_title))

        try:
            with db.get_cursor() as cursor:
                cursor.execute('''
                    INSERT INTO events (journey_id, title, description, location_id, start_time,end_time, display, status)
                    VALUES (%s, %s, %s, %s, %s, %s,%s, 'open');
                ''', (journey_id, event_title, description, location_id, start_time,end_time, display))
                event_id = cursor.lastrowid  # Retrieve new location_id
                db.close_db()

            # Ensure event_id is valid
            if not event_id:
                flash("Error retrieving location. Please try again.", "danger")
                return redirect(url_for('private_events',journey_id=journey_id,journey_title=journey_title))

            flash("Event added successfully!", "dark")

            if event_image:
                # Should be passed a list
                uploadEventImages(user_id, event_id, [event_image]) # Wrap a single event_image into a list

            if event_images:
                uploadEventImages(user_id, event_id, event_images) # This call is correct.

            return redirect(url_for('private_events',journey_id=journey_id,journey_title=journey_title,event_successful=True))
        except Exception as e:
            flash(f"An error occurred: {str(e)}", "danger")
            return redirect(url_for('private_events',journey_id=journey_id,journey_title=journey_title))

    # Render the event addition form
    return redirect(url_for('private_journey'))


@app.route('/event/image/upload', methods=['POST'])
def upload_event_image():
    """
    Handles event image upload logic:
      1. Check if user is logged in.
      2. Check if the user is the event owner or has admin/editor role.
      3. Validate the uploaded file (only JPG/PNG, <= 5MB).
      4. Store file and update the database record.
    """

    # Check if the user is logged in
    if 'loggedin' not in session:
        flash("Please log in first.", "danger")
        return redirect(url_for('login'))
    
    user_id = session.get("user_id")  # Current logged-in user ID
    if not user_id:
        flash("Session expired. Please log in again.", "danger")
        return redirect(url_for('login'))

    # Retrieve event ID and journey ID from the form
    journey_id = request.form.get('journey_id')
    journey_title = request.form.get('journey_title')
    event_id = request.form.get('event_id')
    # check if the photo is uploaded from the public page or private page
    from_event= request.form.get('from')
    if not journey_id or not event_id:
        flash("Missing required parameters.", "danger")
        return redirect(url_for('private_events'))

    event_image=None
    try:
        event_image = request.files['event_image']  # image_file of the event
    except:
        event_image=None
    event_images=None
    try:
        event_images = request.files.getlist('event_images')
    except:
        event_images=None

    if event_image:
        uploadEventImages(user_id, event_id, [event_image]) 

    if event_images:
        uploadEventImages(user_id, event_id, event_images) 

    # if the photo is uploaded from the public page, redirect to the public page
    if from_event=='public':
        return redirect(url_for('public_events', journey_id=journey_id, journey_title=journey_title))
    else:
        return redirect(url_for('private_events', journey_id=journey_id,journey_title=journey_title))

#save event image to upload
def uploadEventImages(user_id,event_id,files):
    """
    Handles event image upload logic:
      1. Validate the uploaded file (only JPG/PNG, <= 5MB).
      2. Store file and update the database record.
    """
    if  not event_id or not files:
        flash("Missing required parameters.", "danger")
        return

    try:
        with db.get_cursor() as cursor:
            cursor.execute('''
                SELECT e.event_id, e.journey_id, e.event_image, j.user_id AS owner_user_id, u.role AS user_role
                FROM events e
                JOIN journeys j ON e.journey_id = j.journey_id
                JOIN users u ON u.user_id = %s
                WHERE e.event_id = %s;
            ''', (user_id, event_id))
            event_record = cursor.fetchone()
            db.close_db()
    except Exception as e:
        flash("Database error: " + str(e), "danger")
        return

    if not event_record:
        flash("Event not found or you lack permission.", "danger")
        return

    # 1. Delete old graphs (database + disk)
    try:
        with db.get_cursor() as cursor:
            cursor.execute('SELECT event_image FROM event_images WHERE event_id = %s', (event_id,))
            old_images = cursor.fetchall()
            for img in old_images:
                img_path = os.path.join(app.root_path, "static", "events", img['event_image'])
                if os.path.exists(img_path):
                    os.remove(img_path)

            cursor.execute('DELETE FROM event_images WHERE event_id = %s', (event_id,))
            db.close_db()
    except Exception as e:
        flash("Failed to remove old images: " + str(e), "danger")
        return

    # 2. Traversing uploaded files
    upload_folder = os.path.join(app.root_path, "static", "events")
    if not os.path.exists(upload_folder):
        os.makedirs(upload_folder)

    for file in files:
        if file.filename == '':
            continue

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
        upload_folder = os.path.join(app.root_path, "static", "events")
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
                cursor.execute('''
                    INSERT INTO event_images (event_id, event_image)
                    VALUES (%s, %s)
                ''', (event_id,unique_filename, ))
                db.close_db()
        except Exception as e:
            flash("Error updating database: " + str(e), "danger")


@app.route('/event/image/delete/traveller', methods=['GET'])
def traveller_delete_event_image():
    # Ensure user is logged in
    if 'loggedin' not in session:
        return redirect(url_for('login'))

    user_id = session.get("user_id")
    if not user_id:
        flash("Session expired. Please log in again.", "danger")
        return redirect(url_for('login'))

    #params: journey_id, event_id, image_file
    journey_id=request.args.get('journey_id')
    journey_title=request.args.get('journey_title')
    event_id=request.args.get('event_id')
    image_id=request.args.get('image_id')

    try:
        with db.get_cursor() as cursor:
            cursor.execute('''
                SELECT e.event_id, e.journey_id, e.event_image, j.user_id AS owner_user_id, u.role AS user_role
                FROM events e
                JOIN journeys j ON e.journey_id = j.journey_id
                JOIN users u ON u.user_id = %s
                WHERE e.event_id = %s;
            ''', (user_id, event_id))
            event_record = cursor.fetchone()

            if not event_record:
                flash("Event is not existed!", "danger")

            # Example storage path: "static/uploads/events"
            # Ensure the directory exists
            upload_folder = os.path.join(app.root_path, "static", "events")
            if not os.path.exists(upload_folder):
                os.makedirs(upload_folder)

             # If an old image is present, consider deleting it to save server space
            cursor.execute('''
                SELECT * from event_images where image_id=%s;''',(image_id,))
            image=cursor.fetchone()

            if not image:
                flash("image is not existed!", "danger")

            old_image = image['event_image']
            if old_image:
                old_image_path = os.path.join(upload_folder, old_image)
                if os.path.exists(old_image_path):
                    os.remove(old_image_path)

            cursor.execute('''
                DELETE from event_images where image_id = %s;
            ''', (image['image_id'],))

            db.close_db()

        flash("Image delete successfully!", "dark")
    except Exception as e:
        flash("Database error: " + str(e), "danger")

    #redirect to journey.html, private mode
    return redirect(url_for('private_events',journey_id=journey_id,journey_title=journey_title))

@app.route('/event/image/delete/admin', methods=['GET'])
def admin_delete_event_image():
    journey_id = request.args.get('journey_id')
    journey_title = request.args.get('journey_title')
    event_id = request.args.get('event_id')
    image_id=request.args.get('image_id')

    # Ensure user is logged in
    if 'loggedin' not in session:
        return redirect(url_for('login'))

    role = session.get("role")
    current_user_id = session.get("user_id")  # Assuming user_id is stored in session

    # Get the event owner
    try:
        with db.get_cursor() as cursor:
            cursor.execute('''
                SELECT j.user_id AS owner_user_id, e.event_image
                FROM events e
                JOIN journeys j ON e.journey_id = j.journey_id
                WHERE e.event_id = %s;
            ''', (event_id,))
            event_record = cursor.fetchone()

            if not event_record:
                flash("Event not found.", "danger")
                return redirect(url_for('public_events', journey_id=journey_id, journey_title=journey_title))

            owner_user_id = event_record['owner_user_id']

            # Check if user is allowed to delete: either admin/editor or the owner
            if role not in ["admin", "editor"] and current_user_id != owner_user_id:
                flash("You can only delete your own event images or need Admin/Editor role.", "danger")
                return redirect(url_for('public_events', journey_id=journey_id, journey_title=journey_title))

            # Define upload folder
            upload_folder = os.path.join(app.root_path, "static", "events")
            if not os.path.exists(upload_folder):
                os.makedirs(upload_folder)

            # If an old image is present, consider deleting it to save server space
            cursor.execute('''
                SELECT * from event_images where image_id=%s;''',(image_id,))
            image=cursor.fetchone()

            if not image:
                flash("image is not existed!", "danger")
            
            old_image = image['event_image']
            if old_image:
                old_image_path = os.path.join(upload_folder, old_image)
                if os.path.exists(old_image_path):
                    os.remove(old_image_path)
            
            cursor.execute('''
                DELETE from event_images where image_id = %s;
            ''', (image['image_id'],))

        flash("Image deleted successfully!", "dark")
    except Exception as e:
        flash("An error occurred while deleting the image.", "danger")

    return redirect(url_for('public_events', journey_id=journey_id, journey_title=journey_title))


@app.route('/event/edit/traveller', methods=['GET', 'POST'])
def traveller_edit_event():
    # Ensure the user is logged in
    if 'loggedin' not in session:
        return redirect(url_for('login'))

    user_id = session.get("user_id")  # Retrieve the current user ID
    if not user_id:
        flash("Session expired. Please log in again.", "danger")
        return redirect(url_for('login'))

    if request.method == 'POST':
        # Retrieve form data
        journey_id = request.form.get("journey_id")  # The journey to which the event belongs
        journey_title = request.form.get('journey_title')  # Get journey_title from URL parameters
        event_id = request.form.get('event_id')  # Get journey_title from URL parameters
        title = request.form.get("title", "").strip()  # Event title
        description = request.form.get("description", "").strip()  # Optional event description
        location = request.form.get("location")  # Location of the event
        start_date = request.form.get("start_date")  # Event start date
        start_time = request.form.get("start_time")  # Event start date
        end_date = request.form.get("end_date")  # Event start date
        end_time = request.form.get("end_time")  # Optional event end date
        display = request.form.get("display", "private").strip().lower()  # Display setting (default: private)

        # Ensure the display mode is valid
        if display not in ["public", "private", "published"]:
            display = "private"

        # Validate mandatory fields
        if not journey_id:
            flash("Invalid journey selection.", "danger")
            return redirect(url_for('private_events',journey_id=journey_id,journey_title=journey_title))

        if not title:
            flash("Title is required.", "danger")
            return redirect(url_for('private_events',journey_id=journey_id,journey_title=journey_title))

        # Query locations table to check if the city already exists
        with db.get_cursor() as cursor:
            cursor.execute("SELECT location_id FROM locations WHERE address = %s",
                        (location,))
            location_id_result = cursor.fetchone()
            db.close_db()

        # If location exists, use the existing location_id, otherwise insert a new entry
        if location_id_result:
            location_id = location_id_result['location_id']

        else:
            # Insert new city information into locations table
            with db.get_cursor() as cursor:
                    cursor.execute("INSERT INTO locations (address) VALUES (%s)", 
                                (location,))
                    location_id = cursor.lastrowid  # Retrieve new location_id
                    db.close_db()

        # Validate and format date-time fields
        try:
            
            if start_date and start_time:
                start_time = f"{start_date} {start_time}"
            else:
                start_time=datetime.now()

            if end_date and end_time:
                end_time = f"{end_date} {end_time}"
            else:
                end_time=datetime.now()

        except ValueError:
            flash("Invalid date format! Use YYYY-MM-DD HH:MM.", "danger")
            return redirect(url_for('private_events',journey_id=journey_id,journey_title=journey_title))

  
        try:
            with db.get_cursor() as cursor:
                cursor.execute('''
                    update events set title=%s, description=%s, location_id=%s, start_time=%s,end_time=%s, display=%s where event_id=%s;
                ''', ( title, description, location_id, start_time,end_time, display,event_id))
                db.close_db()
            flash("Event updated successfully!", "dark")

            return redirect(url_for('private_events',journey_id=journey_id,journey_title=journey_title))
        except Exception as e:
            flash(f"An error occurred: {str(e)}", "danger")
            return redirect(url_for('private_events',journey_id=journey_id,journey_title=journey_title))
    
    #redirect to journey.html, private mode
    return redirect(url_for('private_events',journey_id=journey_id,journey_title=journey_title))

@app.route('/event/edit/admin', methods=['GET', 'POST'])
def admin_edit_event():
    #params: journey_id, event_id, title, description, location, start_time, end_time, display_mode
    journey_id=request.form.get('journey_id')
    
    #redirect to journey.html, public mode
    return redirect(url_for('public_event'),journey_id=journey_id)

@app.route('/event/hide/admin')
def admin_hide_event():

    #this is the interface of hidding target event by admin or editor
    
    #params: journey_id, status
    journey_id=request.form.get('journey_id')

    #redirect to journey.html, public mode
    return redirect(url_for('public_journey'),journey_id=journey_id)


@app.route('/event/delete/traveller/<int:event_id>', methods=['GET'])
def traveller_delete_event(event_id):
    """
    Handles event deletion by the event owner:
    1. Checks if user is logged in
    2. Verifies the user owns the journey/event
    3. Deletes the event and associated image file
    4. Redirects back to the events page
    """
    # Ensure user is logged in
    if 'loggedin' not in session:
        return redirect(url_for('login'))
    print("event_id=",event_id)

    user_id = session.get("user_id")
    if not user_id:
        flash("Session expired. Please log in again.", "danger")
        return redirect(url_for('login'))
    
    # Get journey information from URL parameters
    journey_id = request.args.get('journey_id')
    journey_title = request.args.get('journey_title')
    
    if not journey_id:
        flash("Missing required parameters.", "danger")
        return redirect(url_for('private_journey'))

    try:
        # First verify that the user owns this journey/event
        with db.get_cursor() as cursor:
            cursor.execute('''
                SELECT e.event_id, e.journey_id, e.event_image, j.user_id AS owner_user_id
                FROM events e
                JOIN journeys j ON e.journey_id = j.journey_id
                WHERE e.event_id = %s AND j.user_id = %s;
            ''', (event_id, user_id))
            event_record = cursor.fetchone()
            
            if not event_record:
                flash("Event not found or you don't have permission to delete it.", "danger")
                return redirect(url_for('private_events', journey_id=journey_id, journey_title=journey_title))
            
            # Check if there's an image to delete
            if event_record['event_image']:
                # Delete the image file from storage
                upload_folder = os.path.join(app.root_path, "static", "events")
                image_path = os.path.join(upload_folder, event_record['event_image'])
                if os.path.exists(image_path):
                    os.remove(image_path)
            
            # Delete the event from the database
            cursor.execute('DELETE FROM events WHERE event_id = %s', (event_id,))
            db.close_db()
            
        flash("Event deleted successfully!", "dark")
    except Exception as e:
        flash(f"Error deleting event: {str(e)}", "danger")
    
    # Redirect back to the events page
    return redirect(url_for('private_events', journey_id=journey_id, journey_title=journey_title))


@app.route('/event/delete/admin/<int:event_id>', methods=['GET'])
def admin_delete_event(event_id):
    """
    Handles event deletion by an admin or editor:
    1. Checks if user is logged in with admin/editor role
    2. Deletes the event and associated image file
    3. Redirects back to the public events page
    """
    # Ensure user is logged in
    if 'loggedin' not in session:
        return redirect(url_for('login'))

    # Verify admin/editor role
    role = session.get("role")
    if role != "admin" and role != "editor":
        flash("Permission denied. Only admins or editors can delete others' events.", "danger")
        return redirect(url_for('public_events'))
    
    # Get journey information from URL parameters
    journey_id = request.args.get('journey_id')
    journey_title = request.args.get('journey_title')
    
    if not journey_id:
        flash("Missing required parameters.", "danger")
        return redirect(url_for('public_journey'))

    try:
        # Get event details before deletion
        with db.get_cursor() as cursor:
            cursor.execute('''
                SELECT e.event_id, e.journey_id, e.event_image
                FROM events e
                WHERE e.event_id = %s;
            ''', (event_id,))
            event_record = cursor.fetchone()
            
            if not event_record:
                flash("Event not found.", "danger")
                return redirect(url_for('public_events', journey_id=journey_id, journey_title=journey_title))
            
            # Check if there's an image to delete
            if event_record['event_image']:
                # Delete the image file from storage
                upload_folder = os.path.join(app.root_path, "static", "events")
                image_path = os.path.join(upload_folder, event_record['event_image'])
                if os.path.exists(image_path):
                    os.remove(image_path)
            
            # Delete the event from the database
            cursor.execute('DELETE FROM events WHERE event_id = %s', (event_id,))
            db.close_db()
            
        flash("Event deleted successfully by admin.", "dark")
    except Exception as e:
        flash(f"Error deleting event: {str(e)}", "danger")
    
    # Redirect back to the public events page
    return redirect(url_for('public_events', journey_id=journey_id, journey_title=journey_title))


@app.route('/event/like/<int:event_id>', methods=['POST'])
def like_event(event_id):
    if 'loggedin' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401

    user_id = session.get("user_id")
    if not user_id:
        return jsonify({'success': False, 'message': 'Session expired'}), 401

    with db.get_cursor() as cursor:
        # Check if liked
        cursor.execute('SELECT * FROM event_likes WHERE event_id = %s AND user_id = %s', (event_id, user_id))
        like = cursor.fetchone()
        if like:
            # If you have already liked it, cancel the like
            cursor.execute('DELETE FROM event_likes WHERE event_id = %s AND user_id = %s', (event_id, user_id))
            liked = False
        else:
            try:
                cursor.execute('INSERT INTO event_likes (event_id, user_id) VALUES (%s, %s)', (event_id, user_id))
                liked = True
            except Exception as e:
                # If the unique key conflicts, it means that the like has been given, so no action will be taken
                liked = True
        # Get the latest number of likes
        cursor.execute('SELECT COUNT(*) AS like_count FROM event_likes WHERE event_id = %s', (event_id,))
        like_count = cursor.fetchone()['like_count']
        db.close_db()
    return jsonify({'success': True, 'liked': liked, 'like_count': like_count})


@app.route('/event/comment/<int:event_id>', methods=['POST'])
def post_comment(event_id):
    if 'loggedin' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401
    user_id = session['user_id']
    content = request.form.get('content', '').strip()
    if not content:
        return jsonify({'success': False, 'message': 'Comment cannot be empty'}), 400
    with db.get_cursor() as cursor:
        cursor.execute('INSERT INTO event_comments (event_id, user_id, content) VALUES (%s, %s, %s)', (event_id, user_id, content))
        # fetch the username and profile image of the user who posted the comment
        cursor.execute('SELECT username, profile_image FROM users WHERE user_id=%s', (user_id,))
        user = cursor.fetchone()
        db.close_db()
    return jsonify({
        'success': True,
        'comment': {
            'username': user['username'],
            'avatar': user['profile_image'] or 'default.png',
            'content': content,
            'created_at': datetime.now().strftime('%Y-%m-%d %H:%M'),
            'is_hidden': False
        }
    })

@app.route('/event/comment/hide/<int:comment_id>', methods=['POST'])
def hide_comment(comment_id):
    if session.get('role') not in ('admin', 'staff'):
        return jsonify({'success': False, 'message': 'Permission denied'}), 403
    with db.get_cursor() as cursor:
        cursor.execute('UPDATE event_comments SET is_hidden=1 WHERE comment_id=%s', (comment_id,))
        db.close_db()
    return jsonify({'success': True})

@app.route('/comment/react/<int:comment_id>', methods=['POST'])
def react_comment(comment_id):
    if 'loggedin' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401
    user_id = session['user_id']
    reaction = request.form.get('reaction')
    if reaction not in ['like', 'dislike']:
        return jsonify({'success': False, 'message': 'Invalid reaction'}), 400

    with db.get_cursor() as cursor:
        # check if the user has already reacted to this comment
        cursor.execute('SELECT reaction FROM comment_reactions WHERE comment_id=%s AND user_id=%s', (comment_id, user_id))
        existing = cursor.fetchone()
        if existing:
            if existing['reaction'] == reaction:
                # cancel the reaction
                cursor.execute('DELETE FROM comment_reactions WHERE comment_id=%s AND user_id=%s', (comment_id, user_id))
                user_reaction = None
            else:
                # update the reaction
                cursor.execute('UPDATE comment_reactions SET reaction=%s WHERE comment_id=%s AND user_id=%s', (reaction, comment_id, user_id))
                user_reaction = reaction
        else:
            cursor.execute('INSERT INTO comment_reactions (comment_id, user_id, reaction) VALUES (%s, %s, %s)', (comment_id, user_id, reaction))
            user_reaction = reaction
        # get the like and dislike counts
        cursor.execute('SELECT COUNT(*) AS like_count FROM comment_reactions WHERE comment_id=%s AND reaction="like"', (comment_id,))
        like_count = cursor.fetchone()['like_count']
        cursor.execute('SELECT COUNT(*) AS dislike_count FROM comment_reactions WHERE comment_id=%s AND reaction="dislike"', (comment_id,))
        dislike_count = cursor.fetchone()['dislike_count']
        db.close_db()
    return jsonify({'success': True, 'user_reaction': user_reaction, 'like_count': like_count, 'dislike_count': dislike_count})

def get_event_comments(event_id, is_staff=False):
    user_id = session.get('user_id')
    with db.get_cursor() as cursor:
        if is_staff: # Admin, Editor, or Moderator
            cursor.execute('''
                SELECT c.comment_id, c.content, c.created_at, c.is_hidden, c.moderation_reason, 
                       c.user_id AS comment_author_id, u.username, u.profile_image as avatar
                FROM event_comments c
                JOIN users u ON c.user_id = u.user_id
                WHERE c.event_id = %s
                ORDER BY c.created_at DESC
            ''', (event_id,))
        else: # Regular user
            cursor.execute('''
                SELECT c.comment_id, c.content, c.created_at, c.is_hidden, c.moderation_reason,
                       c.user_id AS comment_author_id, u.username, u.profile_image as avatar
                FROM event_comments c
                JOIN users u ON c.user_id = u.user_id
                WHERE c.event_id = %s AND (c.is_hidden = 0 OR (c.is_hidden = 1 AND c.user_id = %s))
                ORDER BY c.created_at DESC
            ''', (event_id, user_id if user_id else -1)) # Use -1 if user_id is None to prevent SQL error

        comments = cursor.fetchall()
        processed_comments = []
        for comment in comments:
            # Like/dislike counts (ensure this part is still present and correct)
            cursor.execute('SELECT COUNT(*) AS like_count FROM comment_reactions WHERE comment_id=%s AND reaction="like"', (comment['comment_id'],))
            comment['like_count'] = cursor.fetchone()['like_count']
            cursor.execute('SELECT COUNT(*) AS dislike_count FROM comment_reactions WHERE comment_id=%s AND reaction="dislike"', (comment['comment_id'],))
            comment['dislike_count'] = cursor.fetchone()['dislike_count']
            
            if user_id:
                cursor.execute('SELECT reaction FROM comment_reactions WHERE comment_id=%s AND user_id=%s', (comment['comment_id'], user_id))
                r = cursor.fetchone()
                comment['user_reaction'] = r['reaction'] if r else None
            else:
                comment['user_reaction'] = None

            comment['removal_notice'] = None
            if comment['is_hidden']:
                if user_id == comment['comment_author_id']:
                    reason = comment.get('moderation_reason') or "No reason provided."
                    comment['removal_notice'] = f"Your comment was removed. Reason: {reason}"
                    # The content itself will be replaced in the template or here if preferred
                elif not is_staff: 
                    continue # Skip hidden comments for non-staff, non-authors
            
            processed_comments.append(comment)
        db.close_db()
    return processed_comments

@app.route('/comment/report/<int:comment_id>', methods=['POST'])
def report_comment(comment_id):
    if 'loggedin' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401
    
    user_id = session['user_id']
    reason = request.form.get('reason')
    details = request.form.get('details', '')
    
    if not reason:
        return jsonify({'success': False, 'message': 'Report reason is required'}), 400
    
    try:
        with db.get_cursor() as cursor:
            # Check if the user has already reported this comment
            cursor.execute('SELECT 1 FROM comment_reports WHERE comment_id = %s AND user_id = %s', 
                          (comment_id, user_id))
            if cursor.fetchone():
                return jsonify({'success': False, 'message': 'You have already reported this comment'}), 400
            
            # Add report record
            cursor.execute('''
                INSERT INTO comment_reports (comment_id, user_id, reason, details)
                VALUES (%s, %s, %s, %s)
            ''', (comment_id, user_id, reason, details))
        db.close_db()
        return jsonify({'success': True, 'message': 'Comment reported successfully. Moderators will review it.'})
    except Exception as e:
        db.close_db()
        # Capture unique constraint conflicts and return friendly prompts
        if "Duplicate entry" in str(e) and "for key 'comment_reports.comment_id'" in str(e):
            return jsonify({'success': False, 'message': 'You have already reported this comment'}), 400
        return jsonify({'success': False, 'message': f'Error: {str(e)}'}), 500
    

# This function would ideally be in a database interaction layer or alongside your other query functions.
def queryEventById(event_id):
    event_data = None
    try:
        with db.get_cursor() as cursor:
            # Example Query: Adjust based on your actual 'events', 'journeys', and 'users' table structures
            # This query fetches the event, its journey's display status, and the journey owner's ID.
            sql = """
                SELECT
                    e.event_id, e.title AS event_title, e.description AS event_description,
                    e.start_date AS event_start_date, e.end_date AS event_end_date,
                    e.location_id AS event_location_id, e.category AS event_category,
                    e.journey_id, j.title AS journey_title, j.user_id AS journey_owner_id,
                    j.display AS journey_display_status,
                    u.username AS event_creator_username,
                    loc.address AS event_location_address
                FROM events e
                JOIN journeys j ON e.journey_id = j.journey_id
                JOIN users u ON j.user_id = u.user_id
                LEFT JOIN locations loc ON e.location_id = loc.location_id
                WHERE e.event_id = %s;
            """
            cursor.execute(sql, (event_id,))
            event_data = cursor.fetchone()
    except Exception as e:
        app.logger.error(f"Error querying event by ID {event_id}: {e}")
        # Depending on your error handling, you might raise the exception
        # or return None and let the route handle it.
    return event_data


# Add this to your Flask application's routes (e.g., in events.py or your main app file)
# Ensure you have the necessary imports:
# from flask import render_template, flash, redirect, url_for, session
# from webapp import app, db # Assuming 'app' and 'db' are initialized

@app.route('/event/<int:event_id>')
def view_event(event_id):
    event = queryEventById(event_id) # Use the helper function

    if not event:
        flash("Event not found.", "danger")
        return redirect(url_for('dashboard')) # Or redirect to an events list page

    # --- Visibility Check ---
    # You need to determine if the current user is allowed to see this event.
    # This usually depends on the event's journey's visibility settings.
    can_view_this_event = False
    current_user_id = session.get('user_id')
    current_user_role = session.get('role')

    # 1. If the event's journey is 'public' or 'published'
    if event.get('journey_display_status') in ['public', 'published']:
        can_view_this_event = True
    # 2. If the current logged-in user is the owner of the journey
    elif current_user_id and event.get('journey_owner_id') == current_user_id:
        can_view_this_event = True
    # 3. If the current user is an admin
    elif current_user_role == 'admin':
        can_view_this_event = True
    # Add any other conditions (e.g., event shared with specific users, etc.)

    if not can_view_this_event:
        flash("You do not have permission to view this event.", "warning")
        return redirect(url_for('dashboard')) # Or another appropriate page

    # If all checks pass, render the event detail page
    # You'll need to create an 'event_detail.html' template
    return render_template('event_detail.html', event=event)

@app.route('/event/favorite-destination', methods=['POST'])
def favorite_destination():
    """Handle favoriting/unfavoriting a destination from an event."""
    if 'loggedin' not in session:
        return jsonify({'success': False, 'message': 'Please log in to manage favorite destinations'}), 401

    try:
        data = request.get_json()
        event_id = data.get('event_id')
        location = data.get('location')
        action = data.get('action', 'add')  # Default to 'add' for backward compatibility
        # Determine which user to operate on
        current_user_id = session.get('user_id')
        current_user_role = session.get('role')
        target_user_id = data.get('user_id')

        # Only admin can operate on other users' favorites
        if current_user_role == 'admin' and target_user_id:
            user_id = int(target_user_id)
        else:
            user_id = current_user_id

        if not location:
            return jsonify({'success': False, 'message': 'Missing required data'}), 400

        # Get current favorite destinations
        with db.get_cursor() as cursor:
            cursor.execute('SELECT favorite_destinations FROM users WHERE user_id = %s', (user_id,))
            result = cursor.fetchone()
            current_favorites = result['favorite_destinations'] if result and result['favorite_destinations'] else ''

            if action == 'add':
                # Add new location if not already in favorites
                if current_favorites:
                    favorites_list = current_favorites.split('\n')
                    if location not in favorites_list:
                        favorites_list.append(location)
                        new_favorites = '\n'.join(favorites_list)
                        message = 'Destination added to favorites'
                    else:
                        return jsonify({'success': False, 'message': 'Location already in favorites'}), 400
                else:
                    new_favorites = location
                    message = 'Destination added to favorites'
            else:  # action == 'remove'
                if current_favorites:
                    favorites_list = [d.strip() for d in current_favorites.split('\n') if d.strip()]
                    if location in favorites_list:
                        favorites_list.remove(location)
                        new_favorites = '\n'.join(favorites_list)
                        message = 'Destination removed from favorites'
                    else:
                        # If not found, treat as already removed for admin
                        return jsonify({'success': True, 'message': 'Destination already removed'}), 200
                else:
                    # If empty, treat as already removed for admin
                    return jsonify({'success': True, 'message': 'Destination already removed'}), 200

                cursor.execute('UPDATE users SET favorite_destinations = %s WHERE user_id = %s',
                            (new_favorites, user_id))
                db.get_db().commit()
                return jsonify({'success': True, 'message': message})

    except Exception as e:
        app.logger.error(f"Error managing favorite destination: {str(e)}")
        return jsonify({'success': False, 'message': 'An error occurred while managing favorites'}), 500

@app.route('/follow_location/<int:location_id>', methods=['POST'])
def follow_location(location_id):
    """Follow a location"""
    if 'loggedin' not in session:
        flash("Please log in first.", "danger")
        return redirect(url_for('login'))
    
    user_id = session.get('user_id')
    
    # Check if user has premium access
    is_member = premium.checkMember(user_id)
    has_premium = is_member and is_member.get('m_status') != 'expired'
    role = session.get('role', '')
    is_staff = role in ['admin', 'editor']
    
    if not (is_staff or has_premium):
        flash("Only premium members and staff can follow locations.", "warning")
        # Redirect back to the public event page, preserving parameters
        return redirect(url_for('public_events', journey_id=request.form.get('journey_id'), journey_title=request.form.get('journey_title'), keyword=request.form.get('keyword'), filter=request.form.get('filter')))
    
    try:
        with db.get_cursor() as cursor:
            # Check if location exists
            cursor.execute('SELECT location_id, address FROM locations WHERE location_id = %s', (location_id,))
            location = cursor.fetchone()
            
            if not location:
                flash("Location not found.", "danger")
                 # Redirect back to the public event page, preserving parameters
                return redirect(url_for('public_events', journey_id=request.form.get('journey_id'), journey_title=request.form.get('journey_title'), keyword=request.form.get('keyword'), filter=request.form.get('filter')))
            
            # Check if already following
            cursor.execute('SELECT lf_id FROM location_follows WHERE user_id = %s AND location_id = %s', 
                         (user_id, location_id))
            existing_follow = cursor.fetchone()
            
            if existing_follow:
                flash(f"You are already following this location: {location['address']}", "info")
            else:
                # Add follow
                cursor.execute('''
                    INSERT INTO location_follows (user_id, location_id) 
                    VALUES (%s, %s) 
                ''', (user_id, location_id))
                flash(f"Now following location: {location['address']}, the journey events will appear on your Departure Board.", "success")
            
            db.close_db()
        
    except Exception as e:
        flash(f"An error occurred: {str(e)}", "danger")

    # Redirect back to the public event page, preserving parameters
    return redirect(url_for('public_events', journey_id=request.form.get('journey_id'), journey_title=request.form.get('journey_title'), keyword=request.form.get('keyword'), filter=request.form.get('filter')))


@app.route('/unfollow_location/<int:location_id>', methods=['POST'])
def unfollow_location(location_id):
    """Unfollow a location"""
    if 'loggedin' not in session:
        flash("Please log in first.", "danger")
        return redirect(url_for('login'))
    
    user_id = session.get('user_id')
    
    try:
        with db.get_cursor() as cursor:
            # Get location info before unfollowing
            cursor.execute('SELECT address FROM locations WHERE location_id = %s', (location_id,))
            location = cursor.fetchone()
            
            # Remove follow
            cursor.execute('DELETE FROM location_follows WHERE user_id = %s AND location_id = %s', 
                         (user_id, location_id))
            
            if cursor.rowcount > 0:
                location_name = location['address'] if location else f"Location #{location_id}"
                flash(f"Unfollowed location: {location_name}. The related journey events will be removed from your Departure Board.", "success")
            else:
                 flash("You were not following this location.", "info")

            db.close_db()
        
    except Exception as e:
        flash(f"An error occurred: {str(e)}", "danger")

    # Redirect back to the public event page, preserving parameters
    return redirect(url_for('public_events', journey_id=request.form.get('journey_id'), journey_title=request.form.get('journey_title'), keyword=request.form.get('keyword'), filter=request.form.get('filter')))