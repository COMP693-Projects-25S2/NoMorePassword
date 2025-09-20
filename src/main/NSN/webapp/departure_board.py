from flask import Flask, render_template, session, redirect, url_for, flash, request, jsonify
from webapp import connect
from webapp import db
from webapp import app
from webapp import premium
import math


@app.route('/debug_session')
def debug_session():
    return f"Session user_id: {session.get('user_id')}, username: {session.get('username')}, role: {session.get('role')}"

#AJAX-focused routing
@app.route('/follow_source', methods=['POST'])
def follow_source():
    """AJAX endpoint to follow different types of sources"""
    if 'loggedin' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401
    
    user_id = session.get('user_id')
    source_type = request.json.get('source_type')
    source_id = request.json.get('source_id')
    
    if not source_type or not source_id:
        return jsonify({'success': False, 'message': 'Missing parameters'}), 400
    
    try:
        with db.get_cursor() as cursor:
            if source_type == 'journey':
                # Check if already following
                cursor.execute(
                    'SELECT COUNT(*) as count FROM journey_follows WHERE user_id = %s AND journey_id = %s',
                    (user_id, source_id)
                )
                if cursor.fetchone()['count'] > 0:
                    return jsonify({'success': False, 'message': 'Already following this journey'}), 400
                
                # Follow journey (only events from past 90 days and future)
                cursor.execute(
                    'INSERT INTO journey_follows (user_id, journey_id, created_at) VALUES (%s, %s, NOW())',
                    (user_id, source_id)
                )
                # Get journey title for message
                cursor.execute('SELECT title FROM journeys WHERE journey_id = %s', (source_id,))
                result = cursor.fetchone()
                source_name = result['title'] if result else f"Journey {source_id}"
                
            elif source_type == 'user':
                # Check if already following
                cursor.execute(
                    'SELECT COUNT(*) as count FROM user_follows WHERE follower_id = %s AND followed_id = %s',
                    (user_id, source_id)
                )
                if cursor.fetchone()['count'] > 0:
                    return jsonify({'success': False, 'message': 'Already following this user'}), 400
                
                # Follow user
                cursor.execute(
                    'INSERT INTO user_follows (follower_id, followed_id, created_at) VALUES (%s, %s, NOW())',
                    (user_id, source_id)
                )
                
                # Get username for message
                cursor.execute('SELECT username FROM users WHERE user_id = %s', (source_id,))
                result = cursor.fetchone()
                source_name = result['username'] if result else f"User {source_id}"
                
            elif source_type == 'location':
                # Check if already following
                cursor.execute(
                    'SELECT COUNT(*) as count FROM location_follows WHERE user_id = %s AND location_id = %s',
                    (user_id, source_id)
                )
                if cursor.fetchone()['count'] > 0:
                    return jsonify({'success': False, 'message': 'Already following this location'}), 400
                
                # Follow location
                cursor.execute(
                    'INSERT INTO location_follows (user_id, location_id, created_at) VALUES (%s, %s, NOW())',
                    (user_id, source_id)
                )
                
                # Get location address for message
                cursor.execute('SELECT address FROM locations WHERE location_id = %s', (source_id,))
                result = cursor.fetchone()
                source_name = result['address'] if result else f"Location {source_id}"
                
            else:
                return jsonify({'success': False, 'message': 'Invalid source type'}), 400
            
            if cursor.rowcount > 0:
                return jsonify({
                    'success': True, 
                    'message': f'Successfully followed {source_name}',
                    'source_type': source_type,
                    'source_id': source_id
                })
            else:
                return jsonify({'success': False, 'message': 'Failed to follow'}), 500
                
    except Exception as e:
        return jsonify({'success': False, 'message': f'Error: {str(e)}'}), 500
    finally:
        db.close_db()


@app.route('/unfollow_source', methods=['POST'])
def unfollow_source():
    """AJAX endpoint to unfollow different types of sources"""
    if 'loggedin' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401
    
    user_id = session.get('user_id')
    source_type = request.json.get('source_type')
    source_id = request.json.get('source_id')
    
    if not source_type or not source_id:
        return jsonify({'success': False, 'message': 'Missing parameters'}), 400
    
    try:
        with db.get_cursor() as cursor:
            if source_type == 'journey':
                # Unfollow journey
                cursor.execute(
                    'DELETE FROM journey_follows WHERE user_id = %s AND journey_id = %s',
                    (user_id, source_id)
                )
                # Get the journey title for the message
                cursor.execute('SELECT title FROM journeys WHERE journey_id = %s', (source_id,))
                result = cursor.fetchone()
                source_name = result['title'] if result else f"Journey {source_id}"
                
            elif source_type == 'user':
                # Unfollow user
                cursor.execute(
                    'DELETE FROM user_follows WHERE follower_id = %s AND followed_id = %s',
                    (user_id, source_id)
                )
                
                # Get the username for the message
                cursor.execute('SELECT username FROM users WHERE user_id = %s', (source_id,))
                result = cursor.fetchone()
                source_name = result['username'] if result else f"User {source_id}"
                
            elif source_type == 'location':
                # Unfollow a location
                cursor.execute(
                    'DELETE FROM location_follows WHERE user_id = %s AND location_id = %s',
                    (user_id, source_id)
                )
                
                # Get the location address for the message
                cursor.execute('SELECT address FROM locations WHERE location_id = %s', (source_id,))
                result = cursor.fetchone()
                source_name = result['address'] if result else f"Location {source_id}"
                
            else:
                return jsonify({'success': False, 'message': 'Invalid source type'}), 400
            
            if cursor.rowcount > 0:
                return jsonify({
                    'success': True, 
                    'message': f'Successfully unfollowed {source_name}',
                    'source_type': source_type,
                    'source_id': source_id
                })
            else:
                return jsonify({'success': False, 'message': 'Nothing to unfollow'}), 404
                
    except Exception as e:
        return jsonify({'success': False, 'message': f'Error: {str(e)}'}), 500
    finally:
        db.close_db()

@app.route('/departure_board')
@app.route('/departure_board/<int:page>')
def departure_board(page=1):
    """Departure Board - Show recent events from followed journeys with pagination"""
    
    # Handle page refresh - if it's a POST request (refresh), redirect to page 1
    if request.method == 'POST' or (request.referrer and 'departure_board' in request.referrer and page > 1):
        # Check if this is a refresh by looking at request headers
        if request.headers.get('Cache-Control') == 'no-cache' or request.headers.get('Pragma') == 'no-cache':
            return redirect(url_for('departure_board', page=1))
    
    # Check if user is logged in
    if 'loggedin' not in session:
        return redirect(url_for('login'))
    
    role = session.get('role', '')
    user_id = session.get('user_id')
    
    # Check if user has permission (paid subscriber or staff)
    is_member = premium.checkMember(user_id)
    has_premium = is_member and is_member.get('m_status') != 'expired'
    is_staff = role in ['admin', 'editor']
    
    if not (is_staff or has_premium):
        flash("Access denied. Only premium members and staff can access the Departure Board.", "warning")
        return redirect(url_for('list_premium'))
    
    # Pagination settings
    per_page = 6  # Number of events per page
    offset = (page - 1) * per_page
    
    followed_events = []
    followed_journeys = []
    followed_users = []
    followed_locations = []
    total_events = 0
    total_pages = 0
    
    try:
        with db.get_cursor() as cursor:
            # Get all journeys the user is following
            cursor.execute('''
                SELECT jf.journey_id, j.title as journey_title, j.user_id as journey_owner_id,
                       u.username as journey_owner, jf.created_at as followed_since
                FROM journey_follows jf
                JOIN journeys j ON jf.journey_id = j.journey_id
                JOIN users u ON j.user_id = u.user_id
                WHERE jf.user_id = %s AND j.status = 'open'
                ORDER BY jf.created_at DESC
            ''', (user_id,))
            followed_journeys = cursor.fetchall()
            
            # Get all users the user is following
            cursor.execute('''
                SELECT uf.followed_id as user_id, u.username, u.first_name, u.last_name,
                       uf.created_at as followed_since
                FROM user_follows uf
                JOIN users u ON uf.followed_id = u.user_id
                WHERE uf.follower_id = %s AND u.status = 'active'
                ORDER BY uf.created_at DESC
            ''', (user_id,))
            followed_users = cursor.fetchall()
            
            # Get all locations the user is following
            cursor.execute('''
                SELECT lf.location_id, l.address,
                       lf.created_at as followed_since
                FROM location_follows lf
                JOIN locations l ON lf.location_id = l.location_id
                WHERE lf.user_id = %s
                ORDER BY lf.created_at DESC
            ''', (user_id,))
            followed_locations = cursor.fetchall()
            
            # Create sets of followed IDs for efficient lookups
            followed_journey_ids = {journey['journey_id'] for journey in followed_journeys}
            followed_user_ids = {user['user_id'] for user in followed_users}
            followed_location_ids = {loc['location_id'] for loc in followed_locations}
            
            # Build UNION queries for efficient event retrieval
            union_queries = []
            all_params = []
            
            # Add followed journeys
            if followed_journeys:
                journey_ids = [journey['journey_id'] for journey in followed_journeys]
                placeholders = ','.join(['%s'] * len(journey_ids))
                union_queries.append(f'''
                    SELECT e.event_id, e.title as event_title, e.description as event_description,
                        e.start_time, e.end_time, e.event_image, e.journey_id, e.location_id,
                        j.title as journey_title, j.user_id as journey_owner_id,
                        u.username as journey_owner, l.address as location_address,
                        COALESCE(e.updated_at, e.created_at) as last_update,
                        e.created_at as event_created
                    FROM events e
                    JOIN journeys j ON e.journey_id = j.journey_id
                    JOIN users u ON j.user_id = u.user_id
                    LEFT JOIN locations l ON e.location_id = l.location_id
                    WHERE e.journey_id IN ({placeholders}) AND j.status = 'open'
                ''')
                all_params.extend(journey_ids)

            # Add followed users
            if followed_users:
                user_ids = [user['user_id'] for user in followed_users]
                placeholders = ','.join(['%s'] * len(user_ids))
                union_queries.append(f'''
                    SELECT e.event_id, e.title as event_title, e.description as event_description,
                        e.start_time, e.end_time, e.event_image, e.journey_id, e.location_id,
                        j.title as journey_title, j.user_id as journey_owner_id,
                        u.username as journey_owner, l.address as location_address,
                        COALESCE(e.updated_at, e.created_at) as last_update,
                        e.created_at as event_created
                    FROM events e
                    JOIN journeys j ON e.journey_id = j.journey_id
                    JOIN users u ON j.user_id = u.user_id
                    LEFT JOIN locations l ON e.location_id = l.location_id
                    WHERE j.user_id IN ({placeholders}) AND j.status = 'open'
                ''')
                all_params.extend(user_ids)

            # Add followed locations
            if followed_locations:
                location_ids = [loc['location_id'] for loc in followed_locations]
                location_placeholders = ','.join(['%s'] * len(location_ids))
                union_queries.append(f'''
                    SELECT e.event_id, e.title as event_title, e.description as event_description,
                           e.start_time, e.end_time, e.event_image, e.journey_id, e.location_id,
                           j.title as journey_title, j.user_id as journey_owner_id,
                           u.username as journey_owner, l.address as location_address,
                           COALESCE(e.updated_at, e.created_at) as last_update,
                           e.created_at as event_created
                    FROM events e
                    JOIN journeys j ON e.journey_id = j.journey_id
                    JOIN users u ON j.user_id = u.user_id
                    LEFT JOIN locations l ON e.location_id = l.location_id
                    WHERE e.location_id IN ({location_placeholders})
                ''')
                all_params.extend(location_ids)
            
            if union_queries:
                # Combine queries with UNION and sort by update time
                final_query = f'''
                    SELECT event_id, event_title, event_description, start_time, end_time, 
                        event_image, journey_id, location_id, journey_title, journey_owner_id,
                        journey_owner, location_address, last_update, event_created
                    FROM (
                        {' UNION '.join(union_queries)}
                    ) combined_events
                    ORDER BY last_update DESC, start_time DESC
                '''
                
                cursor.execute(final_query, all_params)
                followed_events = cursor.fetchall()

                # Process events for source detection and recommendations
                final_events = []
                for event in followed_events:
                    # Determine event source
                    sources = []
                    
                    if event['journey_id'] in followed_journey_ids:
                        sources.append('followed_journey')
                        event['source_journey_id'] = event['journey_id']
                    
                    if event['journey_owner_id'] in followed_user_ids:
                        sources.append('followed_user')
                        event['source_user_id'] = event['journey_owner_id']
                    
                    if event.get('location_id') and event.get('location_id') in followed_location_ids:
                        sources.append('followed_location')
                        event['source_location_id'] = event.get('location_id')
                    
                    # Set primary source
                    if 'followed_user' in sources:
                        event['follow_source'] = 'followed_user'
                    elif 'followed_journey' in sources:
                        event['follow_source'] = 'followed_journey'
                    elif 'followed_location' in sources:
                        event['follow_source'] = 'followed_location'
                    else:
                        event['follow_source'] = 'unknown'
                    
                    event['all_sources'] = sources
                    
                    # Generate recommendations
                    recommendations = []
                    
                    if 'followed_journey' not in sources:
                        recommendations.append({
                            'type': 'journey',
                            'id': event['journey_id'],
                            'name': event['journey_title'],
                            'reason': 'Follow this journey'
                        })
                    
                    if 'followed_user' not in sources:
                        recommendations.append({
                            'type': 'user',
                            'id': event['journey_owner_id'],
                            'name': event['journey_owner'],
                            'reason': 'Follow this author'
                        })
                    
                    if 'followed_location' not in sources and event.get('location_id') and event.get('location_address'):
                        recommendations.append({
                            'type': 'location',
                            'id': event.get('location_id'),
                            'name': event.get('location_address'),
                            'reason': 'Follow this location'
                        })
                    
                    event['recommendations'] = recommendations
                    
                    # Always keep events - sources are used for display only
                    final_events.append(event)

                # Use processed events
                followed_events = final_events

                # Calculate pagination
                total_events = len(followed_events)
                total_pages = math.ceil(total_events / per_page) if total_events > 0 else 1

                # Apply pagination
                start_index = offset
                end_index = offset + per_page
                followed_events = followed_events[start_index:end_index]
                
            db.close_db()
            
    except Exception as e:
        flash(f"An error occurred: {str(e)}", "danger")
        followed_events = []
        followed_journeys = []
        followed_users = []
        followed_locations = []
        total_events = 0
        total_pages = 1
    
    # Calculate pagination info 
    has_prev = page > 1
    has_next = page < total_pages
    prev_page = page - 1 if has_prev else None
    next_page = page + 1 if has_next else None
    
    # Calculate page range for pagination display
    page_range = []
    start_page = max(1, page - 2)
    end_page = min(total_pages, page + 2)
    page_range = list(range(start_page, end_page + 1))
    
    return render_template('departure_board.html',
                         active_page='departure_board',
                         followed_events=followed_events,
                         followed_journeys=followed_journeys,
                         followed_users=followed_users,
                         followed_locations=followed_locations,
                         is_member=is_member,
                         # Pagination variables
                         current_page=page,
                         total_pages=total_pages,
                         total_events=total_events,
                         per_page=per_page,
                         has_prev=has_prev,
                         has_next=has_next,
                         prev_page=prev_page,
                         next_page=next_page,
                         page_range=page_range)

@app.route('/get_departure_board_events', methods=['POST'])
def get_departure_board_events():
    """AJAX endpoint to get updated events for departure board"""
    if 'loggedin' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401
    
    user_id = session.get('user_id')
    page = request.json.get('page', 1)
    per_page = 6
    offset = (page - 1) * per_page
    
    try:
        with db.get_cursor() as cursor:
            # Get all journeys the user is following
            cursor.execute('''
                SELECT jf.journey_id, j.title as journey_title, j.user_id as journey_owner_id,
                       u.username as journey_owner, jf.created_at as followed_since
                FROM journey_follows jf
                JOIN journeys j ON jf.journey_id = j.journey_id
                JOIN users u ON j.user_id = u.user_id
                WHERE jf.user_id = %s AND j.status = 'open'
                ORDER BY jf.created_at DESC
            ''', (user_id,))
            followed_journeys = cursor.fetchall()
            
            # Get all users the user is following
            cursor.execute('''
                SELECT uf.followed_id as user_id, u.username, u.first_name, u.last_name,
                       uf.created_at as followed_since
                FROM user_follows uf
                JOIN users u ON uf.followed_id = u.user_id
                WHERE uf.follower_id = %s AND u.status = 'active'
                ORDER BY uf.created_at DESC
            ''', (user_id,))
            followed_users = cursor.fetchall()
            
            # Get all locations the user is following
            cursor.execute('''
                SELECT lf.location_id, l.address,
                       lf.created_at as followed_since
                FROM location_follows lf
                JOIN locations l ON lf.location_id = l.location_id
                WHERE lf.user_id = %s
                ORDER BY lf.created_at DESC
            ''', (user_id,))
            followed_locations = cursor.fetchall()
            
            # Create sets of followed IDs for efficient lookups
            followed_journey_ids = {journey['journey_id'] for journey in followed_journeys}
            followed_user_ids = {user['user_id'] for user in followed_users}
            followed_location_ids = {loc['location_id'] for loc in followed_locations}
            
            # Build UNION queries for efficient event retrieval
            union_queries = []
            all_params = []
            
            # Add followed journeys
            if followed_journeys:
                journey_ids = [journey['journey_id'] for journey in followed_journeys]
                placeholders = ','.join(['%s'] * len(journey_ids))
                union_queries.append(f'''
                    SELECT e.event_id, e.title as event_title, e.description as event_description,
                        e.start_time, e.end_time, e.event_image, e.journey_id, e.location_id,
                        j.title as journey_title, j.user_id as journey_owner_id,
                        u.username as journey_owner, l.address as location_address,
                        COALESCE(e.updated_at, e.created_at) as last_update,
                        e.created_at as event_created
                    FROM events e
                    JOIN journeys j ON e.journey_id = j.journey_id
                    JOIN users u ON j.user_id = u.user_id
                    LEFT JOIN locations l ON e.location_id = l.location_id
                    WHERE e.journey_id IN ({placeholders}) AND j.status = 'open'
                ''')
                all_params.extend(journey_ids)

            # Add followed users
            if followed_users:
                user_ids = [user['user_id'] for user in followed_users]
                placeholders = ','.join(['%s'] * len(user_ids))
                union_queries.append(f'''
                    SELECT e.event_id, e.title as event_title, e.description as event_description,
                        e.start_time, e.end_time, e.event_image, e.journey_id, e.location_id,
                        j.title as journey_title, j.user_id as journey_owner_id,
                        u.username as journey_owner, l.address as location_address,
                        COALESCE(e.updated_at, e.created_at) as last_update,
                        e.created_at as event_created
                    FROM events e
                    JOIN journeys j ON e.journey_id = j.journey_id
                    JOIN users u ON j.user_id = u.user_id
                    LEFT JOIN locations l ON e.location_id = l.location_id
                    WHERE j.user_id IN ({placeholders}) AND j.status = 'open'
                ''')
                all_params.extend(user_ids)

            # Add followed locations
            if followed_locations:
                location_ids = [loc['location_id'] for loc in followed_locations]
                location_placeholders = ','.join(['%s'] * len(location_ids))
                union_queries.append(f'''
                    SELECT e.event_id, e.title as event_title, e.description as event_description,
                           e.start_time, e.end_time, e.event_image, e.journey_id, e.location_id,
                           j.title as journey_title, j.user_id as journey_owner_id,
                           u.username as journey_owner, l.address as location_address,
                           COALESCE(e.updated_at, e.created_at) as last_update,
                           e.created_at as event_created
                    FROM events e
                    JOIN journeys j ON e.journey_id = j.journey_id
                    JOIN users u ON j.user_id = u.user_id
                    LEFT JOIN locations l ON e.location_id = l.location_id
                    WHERE e.location_id IN ({location_placeholders})
                ''')
                all_params.extend(location_ids)
            
            followed_events = []
            if union_queries:
                # Combine queries with UNION and sort by update time
                final_query = f'''
                    SELECT event_id, event_title, event_description, start_time, end_time, 
                        event_image, journey_id, location_id, journey_title, journey_owner_id,
                        journey_owner, location_address, last_update, event_created
                    FROM (
                        {' UNION '.join(union_queries)}
                    ) combined_events
                    ORDER BY last_update DESC, start_time DESC
                '''
                
                cursor.execute(final_query, all_params)
                followed_events = cursor.fetchall()

                # Process events for source detection and recommendations
                final_events = []
                for event in followed_events:
                    # Determine event source
                    sources = []
                    
                    if event['journey_id'] in followed_journey_ids:
                        sources.append('followed_journey')
                        event['source_journey_id'] = event['journey_id']
                    
                    if event['journey_owner_id'] in followed_user_ids:
                        sources.append('followed_user')
                        event['source_user_id'] = event['journey_owner_id']
                    
                    if event.get('location_id') and event.get('location_id') in followed_location_ids:
                        sources.append('followed_location')
                        event['source_location_id'] = event.get('location_id')
                    
                    # Set primary source
                    if 'followed_user' in sources:
                        event['follow_source'] = 'followed_user'
                    elif 'followed_journey' in sources:
                        event['follow_source'] = 'followed_journey'
                    elif 'followed_location' in sources:
                        event['follow_source'] = 'followed_location'
                    else:
                        event['follow_source'] = 'unknown'
                    
                    event['all_sources'] = sources
                    
                    # Generate recommendations
                    recommendations = []
                    
                    if 'followed_journey' not in sources:
                        recommendations.append({
                            'type': 'journey',
                            'id': event['journey_id'],
                            'name': event['journey_title'],
                            'reason': 'Follow this journey'
                        })
                    
                    if 'followed_user' not in sources:
                        recommendations.append({
                            'type': 'user',
                            'id': event['journey_owner_id'],
                            'name': event['journey_owner'],
                            'reason': 'Follow this author'
                        })
                    
                    if 'followed_location' not in sources and event.get('location_id') and event.get('location_address'):
                        recommendations.append({
                            'type': 'location',
                            'id': event.get('location_id'),
                            'name': event.get('location_address'),
                            'reason': 'Follow this location'
                        })
                    
                    event['recommendations'] = recommendations
                    
                    # Convert datetime objects to strings for JSON serialization
                    if event.get('start_time'):
                        event['start_time_str'] = event['start_time'].strftime('%b %d, %Y at %I:%M %p')
                    if event.get('end_time'):
                        event['end_time_str'] = event['end_time'].strftime('%I:%M %p')
                    if event.get('last_update'):
                        event['last_update_str'] = event['last_update'].strftime('%b %d at %I:%M %p')
                    
                    final_events.append(event)

                # Calculate pagination
                total_events = len(final_events)
                total_pages = math.ceil(total_events / per_page) if total_events > 0 else 1

                # Apply pagination
                start_index = offset
                end_index = offset + per_page
                paginated_events = final_events[start_index:end_index]
                
                # Convert events to JSON-serializable format
                events_data = []
                for event in paginated_events:
                    event_data = {}
                    for key, value in event.items():
                        if key in ['start_time', 'end_time', 'last_update', 'event_created']:
                            # Skip datetime objects as we have string versions
                            continue
                        event_data[key] = value
                    events_data.append(event_data)
                
                return jsonify({
                    'success': True,
                    'events': events_data,
                    'total_events': total_events,
                    'total_pages': total_pages,
                    'current_page': page,
                    'has_prev': page > 1,
                    'has_next': page < total_pages,
                    'followed_counts': {
                        'journeys': len(followed_journeys),
                        'users': len(followed_users),
                        'locations': len(followed_locations)
                    }
                })
            else:
                return jsonify({
                    'success': True,
                    'events': [],
                    'total_events': 0,
                    'total_pages': 1,
                    'current_page': 1,
                    'has_prev': False,
                    'has_next': False,
                    'followed_counts': {
                        'journeys': len(followed_journeys),
                        'users': len(followed_users),
                        'locations': len(followed_locations)
                    }
                })
            
    except Exception as e:
        return jsonify({'success': False, 'message': f'Error: {str(e)}'}), 500
    finally:
        db.close_db()

@app.route('/get_followed_content', methods=['POST'])
def get_followed_content():
    """AJAX endpoint to get updated followed content summary"""
    if 'loggedin' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401
    
    user_id = session.get('user_id')
    
    try:
        with db.get_cursor() as cursor:
            # Get all journeys the user is following
            cursor.execute('''
                SELECT jf.journey_id, j.title as journey_title, j.user_id as journey_owner_id,
                       u.username as journey_owner, jf.created_at as followed_since
                FROM journey_follows jf
                JOIN journeys j ON jf.journey_id = j.journey_id
                JOIN users u ON j.user_id = u.user_id
                WHERE jf.user_id = %s AND j.status = 'open'
                ORDER BY jf.created_at DESC
            ''', (user_id,))
            followed_journeys = cursor.fetchall()
            
            # Get all users the user is following
            cursor.execute('''
                SELECT uf.followed_id as user_id, u.username, u.first_name, u.last_name,
                       uf.created_at as followed_since
                FROM user_follows uf
                JOIN users u ON uf.followed_id = u.user_id
                WHERE uf.follower_id = %s AND u.status = 'active'
                ORDER BY uf.created_at DESC
            ''', (user_id,))
            followed_users = cursor.fetchall()
            
            # Get all locations the user is following
            cursor.execute('''
                SELECT lf.location_id, l.address,
                       lf.created_at as followed_since
                FROM location_follows lf
                JOIN locations l ON lf.location_id = l.location_id
                WHERE lf.user_id = %s
                ORDER BY lf.created_at DESC
            ''', (user_id,))
            followed_locations = cursor.fetchall()
            
            # Convert datetime objects to strings for JSON serialization
            for journey in followed_journeys:
                journey['followed_since_str'] = journey['followed_since'].strftime('%b %d, %Y')
            
            for user in followed_users:
                user['followed_since_str'] = user['followed_since'].strftime('%b %d, %Y')
            
            for location in followed_locations:
                location['followed_since_str'] = location['followed_since'].strftime('%b %d, %Y')
            
            return jsonify({
                'success': True,
                'followed_journeys': followed_journeys,
                'followed_users': followed_users,
                'followed_locations': followed_locations,
                'counts': {
                    'journeys': len(followed_journeys),
                    'users': len(followed_users),
                    'locations': len(followed_locations)
                }
            })
            
    except Exception as e:
        return jsonify({'success': False, 'message': f'Error: {str(e)}'}), 500
    finally:
        db.close_db()

@app.route('/manage_followed_content')
def manage_followed_content():
    """Manage Followed Content - Separate page to manage followed journeys, users, and locations"""
    
    # Check if user is logged in
    if 'loggedin' not in session:
        return redirect(url_for('login'))
    
    role = session.get('role', '')
    user_id = session.get('user_id')
    
    # Check if user has permission (paid subscriber or staff)
    is_member = premium.checkMember(user_id)
    has_premium = is_member and is_member.get('m_status') != 'expired'
    is_staff = role in ['admin', 'editor']
    
    if not (is_staff or has_premium):
        flash("Access denied. Only premium members and staff can access this feature.", "warning")
        return redirect(url_for('list_premium'))
    
    followed_journeys = []
    followed_users = []
    followed_locations = []
    
    try:
        with db.get_cursor() as cursor:
            # Get all journeys the user is following
            cursor.execute('''
                SELECT jf.journey_id, j.title as journey_title, j.user_id as journey_owner_id,
                       u.username as journey_owner, jf.created_at as followed_since
                FROM journey_follows jf
                JOIN journeys j ON jf.journey_id = j.journey_id
                JOIN users u ON j.user_id = u.user_id
                WHERE jf.user_id = %s AND j.status = 'open'
                ORDER BY jf.created_at DESC
            ''', (user_id,))
            followed_journeys = cursor.fetchall()
            
            # Get all users the user is following
            cursor.execute('''
                SELECT uf.followed_id as user_id, u.username, u.first_name, u.last_name,
                       uf.created_at as followed_since
                FROM user_follows uf
                JOIN users u ON uf.followed_id = u.user_id
                WHERE uf.follower_id = %s AND u.status = 'active'
                ORDER BY uf.created_at DESC
            ''', (user_id,))
            followed_users = cursor.fetchall()
            
            # Get all locations the user is following
            cursor.execute('''
                SELECT lf.location_id, l.address,
                       lf.created_at as followed_since
                FROM location_follows lf
                JOIN locations l ON lf.location_id = l.location_id
                WHERE lf.user_id = %s
                ORDER BY lf.created_at DESC
            ''', (user_id,))
            followed_locations = cursor.fetchall()
            
        db.close_db()
            
    except Exception as e:
        flash(f"An error occurred: {str(e)}", "danger")
        followed_journeys = []
        followed_users = []
        followed_locations = []
    
    return render_template('manage_followed_content.html',
                         active_page='manage_followed_content',
                         followed_journeys=followed_journeys,
                         followed_users=followed_users,
                         followed_locations=followed_locations,
                         is_member=is_member)