from webapp import app
from webapp import db
from flask import redirect, render_template, request, session, url_for,jsonify,flash

@app.route('/regions', methods=['GET', 'POST'])
def get_regions():
    data = request.json
    country = data.get('country')

    # check country is not none
    if not country:
        return jsonify({'regions': []})

    with db.get_cursor() as cursor:

        # query regions from db
        cursor.execute('SELECT distinct region FROM locations where country=%s;',
                       (country,))
        regions = cursor.fetchall()
        db.close_db()

    # return regions
    return jsonify(regions=regions)


@app.route('/cities', methods=['GET', 'POST'])
def get_cities():
    data = request.json
    region = data.get('region')

    # check region is not none
    if not region:
        return jsonify({'cities': []})

    with db.get_cursor() as cursor:
        # query cities from db
        cursor.execute('SELECT distinct city FROM locations where region=%s;',
                       (region,))
        cities = cursor.fetchall()
        db.close_db()

    # return cities
    return jsonify(cities=cities)

@app.route('/location/search')
def search_location():

    #param: keywords
    keyword=request.args.get('keyword')
    wrappedKeyword='%'+keyword+'%'

    locations=[]
    with db.get_cursor() as cursor:
        # query address from db
        cursor.execute('SELECT address FROM locations where address like %s limit 0,10;',
                       (wrappedKeyword,))
        address_list = cursor.fetchall()
        db.close_db()

        for a in address_list:
            locations.append(a['address'])

        print(locations)

    return jsonify(locations)

@app.route('/location/merge', methods=['GET', 'POST'])
def merge_location():

    #param: original_location, target_location 
    original_location = request.form.get("original_location", "").strip()
    target_location = request.form.get("target_location", "").strip()

    if target_location=="":
        flash("Merge locations failed: Target location cannot be none!", "success")
        return redirect(request.referrer)
    
    # Query locations table to check if the city already exists
    with db.get_cursor() as cursor:
        cursor.execute("SELECT location_id FROM locations WHERE address = %s",
                    (original_location,))
        original_location_id_result = cursor.fetchone()

        cursor.execute("SELECT location_id FROM locations WHERE address = %s",
                    (target_location,))
        location_id_result = cursor.fetchone()
        db.close_db()

    # If location exists, use the existing location_id, otherwise insert a new entry
    if location_id_result:
        location_id = location_id_result['location_id']

    else:
        # Insert new location information into locations table
        with db.get_cursor() as cursor:
                cursor.execute("INSERT INTO locations (address) VALUES (%s)", 
                            (target_location,))
                location_id = cursor.lastrowid  # Retrieve new location_id
                db.close_db()

    # Ensure location_id is valid
    if not location_id:
        flash("Error retrieving target location. Please try again.", "danger")
        return redirect(request.referrer)
    
    
    with db.get_cursor() as cursor:
            # update location information as merge
            cursor.execute("UPDATE locations set address=%s where location_id=%s;", 
                        (target_location,original_location_id_result['location_id'],))
            
            # update location information in users
            cursor.execute('''
                            update users set location_id = %s 
                            where location_id in (select location_id from locations where address = %s);
                        ''',(location_id,target_location,))
            
            # update location information in events
            cursor.execute('''
                            update events set location_id = %s 
                            where location_id in (select location_id from locations where address = %s);
                        ''',(location_id,target_location,))
            
            # clear duplicated locations
            cursor.execute('''
                            delete from locations where location_id <> %s and  address = %s;
                        ''',(location_id,target_location,))
            
            db.close_db()


    flash("Merge locations successfully!", "dark")
    return redirect(request.referrer)