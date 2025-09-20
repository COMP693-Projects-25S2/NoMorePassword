from webapp import app
from webapp import db
from flask import redirect, render_template, request, session, url_for, jsonify
from webapp.login import bcrypt
from datetime import datetime,timedelta

@app.route('/database/truncate')
def truncateDatabase():
    with db.get_cursor() as cursor:
        try:
            cursor.execute('SET FOREIGN_KEY_CHECKS = 0;')

            # 按依赖顺序清理表
            tables_to_truncate = [
                'appeals',
                'edit_logs',
                'comment_reports',
                'comment_reactions',
                'event_likes',
                'event_comments',
                'event_images',
                'private_messages',
                'conversations',
                'paused_members',
                'members',
                'subscription_history',
                'country_tax',
                'subscriptions',
                'events',
                'journeys',
                'users',
                'locations',
                'announcements'
            ]

            for table in tables_to_truncate:
                try:
                    cursor.execute(f'TRUNCATE TABLE {table};')
                except Exception as e:
                    print(f"Warning: Could not truncate table {table}: {e}")

            cursor.execute('SET FOREIGN_KEY_CHECKS = 1;')
            db.close_db()

        except Exception as e:
            print(f"Error during database truncation: {e}")
            cursor.execute('SET FOREIGN_KEY_CHECKS = 1;')
            db.close_db()

    return redirect(url_for('login'))

@app.route('/location/generate')
def generateLocations():
    locations = [
        {'location_id': 1, 'country': 'China', 'region': 'Zhejiang Province', 'city': 'Hangzhou', 'address': 'West Lake, Hangzhou, Zhejiang Province, China'},
        {'location_id': 2, 'country': 'China', 'region': 'Beijing', 'city': 'Beijing', 'address': 'Forbidden City, Beijing, Beijing, China'},
        {'location_id': 3, 'country': 'United States', 'region': 'California', 'city': 'San Francisco', 'address': 'Golden Gate Bridge, San Francisco, California, United States'},
        {'location_id': 4, 'country': 'Japan', 'region': 'Kanto Region', 'city': 'Tokyo', 'address': 'Tokyo Tower, Tokyo, Kanto Region, Japan'},
        {'location_id': 5, 'country': 'France', 'region': 'Île-de-France', 'city': 'Paris', 'address': 'Eiffel Tower, Paris, Île-de-France, France'},
        {'location_id': 6, 'country': 'Italy', 'region': 'Lazio', 'city': 'Rome', 'address': 'Colosseum, Rome, Lazio, Italy'},
        {'location_id': 7, 'country': 'United Kingdom', 'region': 'Greater London', 'city': 'London', 'address': 'Big Ben, London, Greater London, United Kingdom'},
        {'location_id': 8, 'country': 'Australia', 'region': 'New South Wales', 'city': 'Sydney', 'address': 'Sydney Opera House, Sydney, New South Wales, Australia'},
        {'location_id': 9, 'country': 'Brazil', 'region': 'Rio de Janeiro', 'city': 'Rio de Janeiro', 'address': 'Christ the Redeemer, Rio de Janeiro, Rio de Janeiro, Brazil'},
        {'location_id': 10, 'country': 'Russia', 'region': 'Moscow Oblast', 'city': 'Moscow', 'address': 'Red Square, Moscow, Moscow Oblast, Russia'},
        {'location_id': 11, 'country': 'China', 'region': 'Shanghai', 'city': 'Shanghai', 'address': 'The Bund, Shanghai, Shanghai, China'},
        {'location_id': 12, 'country': 'China', 'region': 'Sichuan Province', 'city': 'Chengdu', 'address': 'Jinli Ancient Street, Chengdu, Sichuan Province, China'},
        {'location_id': 13, 'country': 'Canada', 'region': 'Ontario', 'city': 'Toronto', 'address': 'CN Tower, Toronto, Ontario, Canada'},
        {'location_id': 14, 'country': 'Spain', 'region': 'Catalonia', 'city': 'Barcelona', 'address': 'Sagrada Familia, Barcelona, Catalonia, Spain'},
        {'location_id': 15, 'country': 'Egypt', 'region': 'Cairo Governorate', 'city': 'Cairo', 'address': 'Pyramids of Giza, Cairo, Cairo Governorate, Egypt'},
        {'location_id': 16, 'country': 'Germany', 'region': 'Berlin', 'city': 'Berlin', 'address': 'Brandenburg Gate, Berlin, Berlin, Germany'},
        {'location_id': 17, 'country': 'United Arab Emirates', 'region': 'Dubai', 'city': 'Dubai', 'address': 'Burj Khalifa, Dubai, Dubai, United Arab Emirates'},
        {'location_id': 18, 'country': 'Thailand', 'region': 'Bangkok', 'city': 'Bangkok', 'address': 'Grand Palace, Bangkok, Bangkok, Thailand'},
        {'location_id': 19, 'country': 'Singapore', 'region': None, 'city': 'Singapore', 'address': 'Merlion Park, Singapore, Singapore'},
        {'location_id': 20, 'country': 'South Korea', 'region': 'Seoul', 'city': 'Seoul', 'address': 'Gyeongbokgung Palace, Seoul, Seoul, South Korea'},
        {'location_id': 21, 'country': None, 'region': None, 'city': None, 'address': None}
    ]

    with db.get_cursor() as cursor:
                
            for location in locations:
                     
                cursor.execute("INSERT INTO locations (location_id,country,region,city,address) VALUES (%s,%s,%s,%s,%s);",
                               (location['location_id'],location['country'],location['region'],location['city'],location['address'],))
                location_id = cursor.lastrowid  # Retrieve new location_id
            db.close_db()

    return redirect(url_for('login'))


@app.route('/user/generate')
def generateUsers():
    # generate accounts, not public api

    users_list = [
    {'user_id':'1','user_name':'traveller1','password':'Password1!','email':'traveller1@hotmail.com','first_name':'Sofia','last_name':'Miller','location_id':'6','description':'Adventure seeker and mountain climber','profile_image':None,'role':'traveller','status':'active'},
    {'user_id':'2','user_name':'traveller2','password':'Password1!','email':'traveller2@hotmail.com','first_name':'Evelyn','last_name':'King','location_id':'9','description':'Accessible travel advocate breaking barriers','profile_image':None,'role':'traveller','status':'active'},
    {'user_id':'3','user_name':'traveller3','password':'Password1!','email':'traveller3@outlook.com','first_name':'Mia','last_name':'Martin','location_id':'20','description':'Budget backpacker exploring off-beaten paths','profile_image':None,'role':'traveller','status':'active'},
    {'user_id':'4','user_name':'traveller4','password':'Password1!','email':'traveller4@icloud.com','first_name':'Sophia','last_name':'Walker','location_id':'6','description':'Family vacation planner and kid-friendly spots','profile_image':None,'role':'traveller','status':'active'},
    {'user_id':'5','user_name':'traveller5','password':'Password1!','email':'traveller5@outlook.com','first_name':'Benjamin','last_name':'Davis','location_id':'10','description':'Train journey collector riding rails globally','profile_image':None,'role':'traveller','status':'active'},
    {'user_id':'6','user_name':'traveller6','password':'Password1!','email':'traveller6@hotmail.com','first_name':'Daniel','last_name':'Ramirez','location_id':'12','description':'Foodie traveling for culinary experiences','profile_image':None,'role':'traveller','status':'active'},
    {'user_id':'7','user_name':'traveller7','password':'Password1!','email':'traveller7@test.com','first_name':'Mia','last_name':'Clark','location_id':'17','description':'Extreme sports enthusiast chasing adrenaline','profile_image':None,'role':'traveller','status':'inactive'},
    {'user_id':'8','user_name':'traveller8','password':'Password1!','email':'traveller8@gmail.com','first_name':'Michael','last_name':'Lopez','location_id':'6','description':'Wine tourism enthusiast visiting vineyards','profile_image':None,'role':'traveller','status':'active'},
    {'user_id':'9','user_name':'traveller9','password':'Password1!','email':'traveller9@icloud.com','first_name':'Sophia','last_name':'Davis','location_id':'7','description':'Eco-conscious traveler promoting sustainability','profile_image':None,'role':'traveller','status':'active'},
    {'user_id':'10','user_name':'traveller10','password':'Password1!','email':'traveller10@gmail.com','first_name':'Lucas','last_name':'Anderson','location_id':'6','description':'Solo female traveler documenting journeys','profile_image':None,'role':'traveller','status':'active'},
    {'user_id':'11','user_name':'traveller11','password':'Password1!','email':'traveller11@test.com','first_name':'Grace','last_name':'Johnson','location_id':'3','description':'Photography enthusiast exploring urban landscapes','profile_image':None,'role':'traveller','status':'active'},
    {'user_id':'12','user_name':'traveller12','password':'Password1!','email':'traveller12@icloud.com','first_name':'Benjamin','last_name':'Wilson','location_id':'19','description':'Nature lover and wildlife photographer','profile_image':None,'role':'traveller','status':'active'},
    {'user_id':'13','user_name':'traveller13','password':'Password1!','email':'traveller13@hotmail.com','first_name':'Mia','last_name':'Brown','location_id':'18','description':'Luxury traveler seeking premium experiences','profile_image':None,'role':'traveller','status':'inactive'},
    {'user_id':'14','user_name':'traveller14','password':'Password1!','email':'traveller14@gmail.com','first_name':'Oliver','last_name':'Anderson','location_id':'1','description':'Winter sports fan chasing the perfect powder','profile_image':None,'role':'traveller','status':'active'},
    {'user_id':'15','user_name':'traveller15','password':'Password1!','email':'traveller15@outlook.com','first_name':'Evelyn','last_name':'Taylor','location_id':'14','description':'Digital nomad working from beach destinations','profile_image':None,'role':'traveller','status':'active'},
    {'user_id':'16','user_name':'traveller16','password':'Password1!','email':'traveller16@yahoo.com','first_name':'Isabella','last_name':'Martinez','location_id':'13','description':'Photography enthusiast exploring urban landscapes','profile_image':None,'role':'traveller','status':'active'},
    {'user_id':'17','user_name':'traveller17','password':'Password1!','email':'traveller17@icloud.com','first_name':'Noah','last_name':'Allen','location_id':'19','description':'Spiritual seeker visiting sacred places','profile_image':None,'role':'traveller','status':'active'},
    {'user_id':'18','user_name':'traveller18','password':'Password1!','email':'traveller18@icloud.com','first_name':'Olivia','last_name':'Brown','location_id':'16','description':'Art gallery visitor on international tours','profile_image':None,'role':'traveller','status':'active'},
    {'user_id':'19','user_name':'traveller19','password':'Password1!','email':'traveller19@icloud.com','first_name':'Henry','last_name':'Thomas','location_id':'11','description':'Accessible travel advocate breaking barriers','profile_image':None,'role':'traveller','status':'active'},
    {'user_id':'20','user_name':'traveller20','password':'Password1!','email':'traveller20@test.com','first_name':'Ava','last_name':'Thompson','location_id':'9','description':'Nature lover and wildlife photographer','profile_image':None,'role':'traveller','status':'active'},
    {'user_id':'21','user_name':'editor1','password':'Password1!','email':'editor1@icloud.com','first_name':'Emma','last_name':'Harris','location_id':'15','description':'City break expert with weekend getaways','profile_image':None,'role':'editor','status':'active'},
    {'user_id':'22','user_name':'editor2','password':'Password1!','email':'editor2@yahoo.com','first_name':'Sophia','last_name':'Taylor','location_id':'17','description':'Architecture admirer capturing unique designs','profile_image':None,'role':'editor','status':'active'},
    {'user_id':'23','user_name':'editor3','password':'Password1!','email':'editor3@icloud.com','first_name':'James','last_name':'Rodriguez','location_id':'15','description':'Solo female traveler documenting journeys','profile_image':None,'role':'editor','status':'active'},
    {'user_id':'24','user_name':'editor4','password':'Password1!','email':'editor4@gmail.com','first_name':'Evelyn','last_name':'Lopez','location_id':'2','description':'Extreme sports enthusiast chasing adrenaline','profile_image':None,'role':'editor','status':'active'},
    {'user_id':'25','user_name':'editor5','password':'Password1!','email':'editor5@outlook.com','first_name':'Daniel','last_name':'Garcia','location_id':'10','description':'Budget backpacker exploring off-beaten paths','profile_image':None,'role':'editor','status':'active'},
    {'user_id':'26','user_name':'admin1','password':'Password1!','email':'admin1@outlook.com','first_name':'Lucas','last_name':'Perez','location_id':'1','description':'Road trip lover with a vintage camper van','profile_image':None,'role':'admin','status':'active'},
    {'user_id':'27','user_name':'admin2','password':'Password1!','email':'admin2@icloud.com','first_name':'Benjamin','last_name':'Moore','location_id':'3','description':'Accessible travel advocate breaking barriers','profile_image':None,'role':'admin','status':'active'},
    {'user_id':'28','user_name':'tech1','password':'Password1!','email':'support1@traveltales.com','first_name':'Support','last_name':'Tech','location_id':'3','description':'Accessible travel advocate breaking barriers','profile_image':None,'role':'support_tech','status':'active'},
    {'user_id':'29','user_name':'help1','password':'Password1!','email':'admin@traveltales.com','first_name':'Admin','last_name':'Helper','location_id':'3','description':'Accessible travel advocate breaking barriers','profile_image':None,'role':'admin','status':'active'}
    ]

    with db.get_cursor() as cursor:
        for u in users_list:
            user_id = u['user_id']
            username = u['user_name']
            password = u['password']
            email = u['email']
            first_name = u['first_name']
            last_name = u['last_name']
            location_id = u['location_id']
            description = u['description']
            role = u['role']
            status = u['status']
            
            password_hash = bcrypt.generate_password_hash(password)

            cursor.execute('''
                                INSERT INTO users (user_id,username, password_hash, email,first_name,last_name,location_id,description, role,status)
                                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
                                ''',
                           (user_id,username, password_hash, email, first_name, last_name, location_id,description,  role, status,))

    return redirect(url_for('login'))

@app.route('/journey/generate')
def generateJourneys():
    journey_list=[
        {'user_id': '5', 'title': 'European Summer Getaway',
         'description': 'Two-week tour across Italy, France and Spain', 'start_date': '2024-06-15', 'display': 'public',
         'status': 'open'},
        {'user_id': '12', 'title': 'Tokyo Adventure', 'description': 'Exploring Japanese culture and cuisine',
         'start_date': '2024-09-01', 'display': 'private', 'status': 'open'},
        {'user_id': '3', 'title': 'Bali Retreat', 'description': 'Relaxing beach vacation with yoga sessions',
         'start_date': '2024-07-22', 'display': 'private', 'status': 'open'},
        {'user_id': '3', 'title': 'New York City Weekend', 'description': 'Broadway shows and Manhattan sightseeing',
         'start_date': '2024-05-12', 'display': 'public', 'status': 'open'},
        {'user_id': '2', 'title': 'African Safari', 'description': 'Wildlife expedition in Kenya and Tanzania',
         'start_date': '2024-08-05', 'display': 'public', 'status': 'open'},
        {'user_id': '16', 'title': 'Amazon Rainforest Trek', 'description': 'Guided tour through Brazilian rainforest',
         'start_date': '2024-04-18', 'display': 'private', 'status': 'open'},
        {'user_id': '2', 'title': 'Australian Outback Journey',
         'description': 'Exploring the natural wonders of Australia', 'start_date': '2024-10-30', 'display': 'public',
         'status': 'open'},
        {'user_id': '1', 'title': 'Greek Island Hopping', 'description': 'Visiting Santorini, Mykonos and Crete',
         'start_date': '2024-07-15', 'display': 'public', 'status': 'open'},
        {'user_id': '8', 'title': 'Iceland Road Trip',
         'description': 'Driving around the Ring Road to see waterfalls and geysers', 'start_date': '2024-06-25',
         'display': 'private', 'status': 'open'},
        {'user_id': '1', 'title': 'Moroccan Desert Adventure',
         'description': 'Camel trekking and nights under desert stars', 'start_date': '2024-04-10',
         'display': 'private', 'status': 'open'},
        {'user_id': '4', 'title': 'Southeast Asia Backpacking',
         'description': 'Budget travel through Thailand, Vietnam and Cambodia', 'start_date': '2024-11-18',
         'display': 'public', 'status': 'open'},
        {'user_id': '1', 'title': 'Caribbean Cruise', 'description': 'Island hopping on luxury cruise ship',
         'start_date': '2024-12-22', 'display': 'private', 'status': 'open'},
        {'user_id': '9', 'title': 'Hiking the Inca Trail', 'description': 'Four-day trek to Machu Picchu',
         'start_date': '2024-05-08', 'display': 'public', 'status': 'open'},
        {'user_id': '4', 'title': 'Norwegian Fjords Tour',
         'description': 'Scenic boat tour of Norway\'s most beautiful fjords', 'start_date': '2024-08-01',
         'display': 'public', 'status': 'open'},
        {'user_id': '6', 'title': 'Costa Rica Eco-Tour',
         'description': 'Exploring rainforests and wildlife sanctuaries', 'start_date': '2024-02-25',
         'display': 'private', 'status': 'open'},
        {'user_id': '5', 'title': 'Dubai Luxury Weekend', 'description': 'Shopping, desert safari and skyscraper views',
         'start_date': '2024-03-18', 'display': 'private', 'status': 'open'},
        {'user_id': '1', 'title': 'Grand Canyon Camping Trip', 'description': 'Three days of hiking and stargazing',
         'start_date': '2024-09-05', 'display': 'public', 'status': 'open'},
        {'user_id': '15', 'title': 'Swiss Alps Ski Vacation',
         'description': 'Winter sports and mountain village exploration', 'start_date': '2024-01-28',
         'display': 'private', 'status': 'open'},
        {'user_id': '10', 'title': 'India Cultural Tour',
         'description': 'Exploring temples and historical sites across India', 'start_date': '2024-10-08',
         'display': 'public', 'status': 'open'},
        {'user_id': '18', 'title': 'Galapagos Islands Expedition',
         'description': 'Wildlife observation and island hopping', 'start_date': '2024-05-25', 'display': 'private',
         'status': 'open'}
    ]

    with db.get_cursor() as cursor:
        for journey in journey_list:
            cursor.execute('''
                  INSERT INTO journeys (user_id, title, description, start_date, display, status)
                  VALUES (%s, %s, %s, %s, %s, %s);
              ''', (
            journey['user_id'], journey['title'], journey['description'], journey['start_date'], journey['display'],
            journey['status']))
        db.close_db()

    return redirect(url_for('login'))

@app.route('/event/generate')
def generateEvents():
     
    event_list=[
  {'journey_id':'1','title':'Grand Canyon South Rim Arrival','description':'Check-in at lodging and first viewpoint visit','start_time':'2024-09-05 15:00','end_time':'2024-09-05 18:00','display':'public','location_id':'5'},
  {'journey_id':'1','title':'Sunrise at Mather Point','description':'Early morning photography at iconic viewpoint','start_time':'2024-09-06 05:30','end_time':'2024-09-06 07:30','display':'public','location_id':'4'},
  {'journey_id':'1','title':'Bright Angel Trail Hike','description':'Guided descent into the canyon','start_time':'2024-09-06 09:00','end_time':'2024-09-06 14:00','display':'public','location_id':'14'},
  {'journey_id':'1','title':'Grand Canyon IMAX Experience','description':'Educational film about canyons formation','start_time':'2024-09-06 16:00','end_time':'2024-09-06 17:30','display':'public','location_id':'16'},
  {'journey_id':'1','title':'Desert View Drive','description':'Scenic road trip with stops at viewpoints','start_time':'2024-09-07 10:00','end_time':'2024-09-07 15:00','display':'public','location_id':'18'},
  {'journey_id':'1','title':'Stargazing Program','description':'Ranger-led night sky observation','start_time':'2024-09-07 20:00','end_time':'2024-09-07 22:00','display':'public','location_id':'8'},
  {'journey_id':'1','title':'Helicopter Canyon Tour','description':'Aerial views of the Grand Canyon','start_time':'2024-09-08 11:00','end_time':'2024-09-08 13:00','display':'public','location_id':'8'},
  
  {'journey_id':'2','title':'Arrival in Sydney','description':'Check-in at hotel and harbor orientation','start_time':'2024-10-30 15:00','end_time':'2024-10-30 18:00','display':'public','location_id':'13'},
  {'journey_id':'2','title':'Sydney Opera House Tour','description':'Behind-the-scenes look at iconic building','start_time':'2024-10-31 10:00','end_time':'2024-10-31 12:30','display':'public','location_id':'15'},
  {'journey_id':'2','title':'Flight to Uluru','description':'Travel to Australias red center','start_time':'2024-11-01 09:00','end_time':'2024-11-01 12:30','display':'public','location_id':'4'},
  {'journey_id':'2','title':'Uluru Sunset Viewing','description':'Watching color changes on the sacred rock at dusk','start_time':'2024-11-01 17:30','end_time':'2024-11-01 19:30','display':'public','location_id':'14'},
  {'journey_id':'2','title':'Kata Tjuta Hike','description':'Walking trail through ancient rock formations','start_time':'2024-11-02 07:00','end_time':'2024-11-02 11:00','display':'public','location_id':'11'},
  {'journey_id':'2','title':'Aboriginal Cultural Experience','description':'Learning about indigenous history and dreamtime stories','start_time':'2024-11-02 14:00','end_time':'2024-11-02 16:30','display':'public','location_id':'6'},
  {'journey_id':'2','title':'Great Barrier Reef Snorkeling','description':'Boat trip and guided underwater exploration','start_time':'2024-11-04 08:00','end_time':'2024-11-04 16:00','display':'public','location_id':'15'},
  
  {'journey_id':'3','title':'Arrival in Denpasar','description':'Airport transfer to resort in Ubud','start_time':'2024-07-22 14:00','end_time':'2024-07-22 16:30','display':'private','location_id':'5'},
  {'journey_id':'3','title':'Welcome Massage Treatment','description':'Traditional Balinese massage therapy','start_time':'2024-07-23 10:00','end_time':'2024-07-23 12:00','display':'private','location_id':'17'},
  {'journey_id':'3','title':'Ubud Sacred Monkey Forest','description':'Walking tour of temple and monkey sanctuary','start_time':'2024-07-24 09:00','end_time':'2024-07-24 12:00','display':'private','location_id':'8'},
  {'journey_id':'3','title':'Rice Terrace Hike','description':'Guided trek through scenic Tegallalang rice fields','start_time':'2024-07-25 07:30','end_time':'2024-07-25 11:30','display':'private','location_id':'7'},
  {'journey_id':'3','title':'Sunrise Yoga Session','description':'Beachfront yoga with professional instructor','start_time':'2024-07-26 06:00','end_time':'2024-07-26 07:30','display':'private','location_id':'17'},
  {'journey_id':'3','title':'Balinese Cooking Class','description':'Learn to prepare traditional Indonesian dishes','start_time':'2024-07-27 14:00','end_time':'2024-07-27 17:00','display':'private','location_id':'15'},
  {'journey_id':'3','title':'Uluwatu Temple Sunset','description':'Clifftop temple visit and traditional Kecak dance','start_time':'2024-07-28 16:30','end_time':'2024-07-28 20:00','display':'private','location_id':'4'},
  
  {'journey_id':'4','title':'Departure from Home','description':'Flight to Bangkok to begin adventure','start_time':'2024-11-18 19:00','end_time':'2024-11-19 09:30','display':'public','location_id':'10'},
  {'journey_id':'4','title':'Bangkok Temple Tour','description':'Visiting Grand Palace, Wat Pho and Wat Arun','start_time':'2024-11-20 08:00','end_time':'2024-11-20 15:00','display':'public','location_id':'21'},
  {'journey_id':'4','title':'Bangkok Floating Markets','description':'Boat trip through traditional water markets','start_time':'2024-11-21 07:00','end_time':'2024-11-21 12:00','display':'public','location_id':'1'},
  {'journey_id':'4','title':'Overnight Train to Chiang Mai','description':'Sleeper train journey to northern Thailand','start_time':'2024-11-22 18:00','end_time':'2024-11-23 09:00','display':'public','location_id':'6'},
  {'journey_id':'4','title':'Elephant Sanctuary Visit','description':'Ethical elephant encounter with bathing and feeding','start_time':'2024-11-24 09:00','end_time':'2024-11-24 16:00','display':'public','location_id':'3'},
  {'journey_id':'4','title':'Ha Long Bay Cruise','description':'Overnight boat trip among limestone islands','start_time':'2024-12-01 11:00','end_time':'2024-12-02 10:00','display':'public','location_id':'19'},
  {'journey_id':'4','title':'Angkor Wat Sunrise Tour','description':'Early morning visit to iconic temple complex','start_time':'2024-12-06 04:30','end_time':'2024-12-06 11:00','display':'public','location_id':'13'},
  
  {'journey_id':'5','title':'Flight to Rome','description':'Arrival at Leonardo da Vinci Airport','start_time':'2024-06-15 08:30','end_time':'2024-06-15 12:45','display':'public','location_id':'21'},
  {'journey_id':'5','title':'Colosseum Tour','description':'Guided tour of ancient Roman amphitheater','start_time':'2024-06-16 09:00','end_time':'2024-06-16 12:00','display':'public','location_id':'3'},
  {'journey_id':'5','title':'Vatican Museums Visit','description':'Exploring art collections and Sistine Chapel','start_time':'2024-06-17 10:00','end_time':'2024-06-17 14:00','display':'public','location_id':'10'},
  {'journey_id':'5','title':'Train to Paris','description':'High-speed train from Rome to Paris','start_time':'2024-06-18 08:00','end_time':'2024-06-18 14:30','display':'public','location_id':'20'},
  {'journey_id':'5','title':'Eiffel Tower Visit','description':'Evening visit with dinner at the tower restaurant','start_time':'2024-06-19 18:00','end_time':'2024-06-19 22:00','display':'public','location_id':'5'},
  {'journey_id':'5','title':'Louvre Museum Tour','description':'Exploring famous artworks including Mona Lisa','start_time':'2024-06-20 09:30','end_time':'2024-06-20 15:00','display':'public','location_id':'10'},
  {'journey_id':'5','title':'Barcelona Sagrada Familia Tour','description':'Guided tour of Gaudis masterpiece','start_time':'2024-06-23 11:00','end_time':'2024-06-23 14:00','display':'public','location_id':'2'},
  
  {'journey_id':'6','title':'San Jose Arrival','description':'Airport pickup and transfer to eco-lodge','start_time':'2024-02-25 14:00','end_time':'2024-02-25 17:00','display':'private','location_id':'17'},
  {'journey_id':'6','title':'Monteverde Cloud Forest Hike','description':'Guided nature walk with wildlife spotting','start_time':'2024-02-26 08:00','end_time':'2024-02-26 13:00','display':'private','location_id':'1'},
  {'journey_id':'6','title':'Canopy Zipline Adventure','description':'Flying through forest canopy on ziplines','start_time':'2024-02-27 09:00','end_time':'2024-02-27 12:00','display':'private','location_id':'16'},
  {'journey_id':'6','title':'Manuel Antonio National Park','description':'Guided tour of coastal rainforest and beaches','start_time':'2024-02-28 08:30','end_time':'2024-02-28 14:30','display':'private','location_id':'13'},
  {'journey_id':'6','title':'Sloth Sanctuary Visit','description':'Tour of wildlife rescue and rehabilitation center','start_time':'2024-03-01 10:00','end_time':'2024-03-01 13:00','display':'private','location_id':'13'},
  {'journey_id':'6','title':'Coffee Plantation Tour','description':'Learning about sustainable coffee production','start_time':'2024-03-02 09:00','end_time':'2024-03-02 12:00','display':'private','location_id':'13'},
  {'journey_id':'6','title':'Arenal Volcano Hot Springs','description':'Relaxing in natural volcanic thermal pools','start_time':'2024-03-03 15:00','end_time':'2024-03-03 19:00','display':'private','location_id':'7'},
  
  {'journey_id':'7','title':'Arrival in Nairobi','description':'Welcome dinner and safari briefing','start_time':'2024-08-05 18:00','end_time':'2024-08-05 21:00','display':'public','location_id':'4'},
  {'journey_id':'7','title':'Flight to Maasai Mara','description':'Small aircraft transfer to game reserve','start_time':'2024-08-06 09:00','end_time':'2024-08-06 11:00','display':'public','location_id':'11'},
  {'journey_id':'7','title':'Afternoon Game Drive','description':'First safari experience spotting African wildlife','start_time':'2024-08-06 15:00','end_time':'2024-08-06 18:30','display':'public','location_id':'16'},
  {'journey_id':'7','title':'Maasai Village Visit','description':'Cultural experience with local Maasai tribe','start_time':'2024-08-07 10:00','end_time':'2024-08-07 13:00','display':'public','location_id':'14'},
  {'journey_id':'7','title':'Mara River Crossing Viewing','description':'Witnessing wildebeest migration river crossing','start_time':'2024-08-08 08:00','end_time':'2024-08-08 14:00','display':'public','location_id':'1'},
  {'journey_id':'7','title':'Serengeti Balloon Safari','description':'Sunrise hot air balloon ride over the plains','start_time':'2024-08-10 05:00','end_time':'2024-08-10 09:00','display':'public','location_id':'18'},
  {'journey_id':'7','title':'Ngorongoro Crater Tour','description':'Wildlife viewing in volcanic caldera','start_time':'2024-08-12 06:00','end_time':'2024-08-12 15:00','display':'public','location_id':'9'},
  
  {'journey_id':'8','title':'Arrival in Reykjavik','description':'Pick up rental car and equipment check','start_time':'2024-06-25 12:00','end_time':'2024-06-25 15:00','display':'private','location_id':'17'},
  {'journey_id':'8','title':'Blue Lagoon Visit','description':'Relaxing in geothermal spa waters','start_time':'2024-06-25 17:00','end_time':'2024-06-25 20:00','display':'private','location_id':'13'},
  {'journey_id':'8','title':'Golden Circle Drive','description':'Self-drive tour of Thingvellir, Geysir and Gullfoss','start_time':'2024-06-26 08:00','end_time':'2024-06-26 18:00','display':'private','location_id':'10'},
  {'journey_id':'8','title':'South Coast Waterfalls','description':'Visiting Seljalandsfoss and Skogafoss','start_time':'2024-06-27 09:00','end_time':'2024-06-27 16:00','display':'private','location_id':'8'},
  {'journey_id':'8','title':'Jökulsárlón Glacier Lagoon','description':'Boat tour among floating icebergs','start_time':'2024-06-28 10:30','end_time':'2024-06-28 13:30','display':'private','location_id':'17'},
  {'journey_id':'8','title':'Myvatn Nature Baths','description':'Northern version of the Blue Lagoon','start_time':'2024-06-29 15:00','end_time':'2024-06-29 18:00','display':'private','location_id':'12'},
  {'journey_id':'8','title':'Whale Watching Tour','description':'Boat excursion to spot humpbacks and minke whales','start_time':'2024-06-30 09:00','end_time':'2024-06-30 13:00','display':'private','location_id':'7'},
  
  {'journey_id':'9','title':'Arrival in Cusco','description':'Acclimatization to high altitude','start_time':'2024-05-08 14:00','end_time':'2024-05-08 18:00','display':'public','location_id':'16'},
  {'journey_id':'9','title':'Sacred Valley Tour','description':'Visiting Pisac and Ollantaytambo ruins','start_time':'2024-05-09 08:00','end_time':'2024-05-09 17:00','display':'public','location_id':'2'},
  {'journey_id':'9','title':'Trek Day 1: Km 82 to Wayllabamba','description':'Beginning the classic Inca Trail','start_time':'2024-05-10 06:00','end_time':'2024-05-10 16:00','display':'public','location_id':'20'},
  {'journey_id':'9','title':'Trek Day 2: Dead Womans Pass','description':'Challenging climb to highest point of trek','start_time':'2024-05-11 07:00','end_time':'2024-05-11 17:00','display':'public','location_id':'10'},
  {'journey_id':'9','title':'Trek Day 3: Cloud Forest','description':'Hiking through diverse ecosystems','start_time':'2024-05-12 07:00','end_time':'2024-05-12 16:00','display':'public','location_id':'11'},
  {'journey_id':'9','title':'Trek Day 4: Machu Picchu Arrival','description':'Early morning hike to Sun Gate and site exploration','start_time':'2024-05-13 04:00','end_time':'2024-05-13 14:00','display':'public','location_id':'17'},
  {'journey_id':'9','title':'Return to Cusco','description':'Train and bus journey back to city','start_time':'2024-05-14 13:00','end_time':'2024-05-14 18:00','display':'public','location_id':'11'},
  
  {'journey_id':'10','title':'Delhi Arrival','description':'Airport pickup and hotel check-in','start_time':'2024-10-08 14:00','end_time':'2024-10-08 17:00','display':'public','location_id':'1'},
  {'journey_id':'10','title':'Old Delhi Heritage Walk','description':'Guided tour of historical sites including Red Fort','start_time':'2024-10-09 09:00','end_time':'2024-10-09 14:00','display':'public','location_id':'20'},
  {'journey_id':'10','title':'Train to Agra','description':'Journey to the city of the Taj Mahal','start_time':'2024-10-10 08:00','end_time':'2024-10-10 10:30','display':'public','location_id':'20'},
  {'journey_id':'10','title':'Taj Mahal Sunrise Visit','description':'Early morning tour of iconic monument','start_time':'2024-10-11 05:30','end_time':'2024-10-11 09:00','display':'public','location_id':'7'},
  {'journey_id':'10','title':'Jaipur Pink City Tour','description':'Exploring palaces and markets of Rajasthan','start_time':'2024-10-12 09:00','end_time':'2024-10-12 16:00','display':'public','location_id':'7'},
  {'journey_id':'10','title':'Amber Fort Elephant Ride','description':'Traditional entrance to historic hilltop fort','start_time':'2024-10-13 08:30','end_time':'2024-10-13 12:00','display':'public','location_id':'20'},
  {'journey_id':'10','title':'Varanasi Ganges Ceremony','description':'Witnessing evening aarti ritual on sacred river','start_time':'2024-10-15 17:00','end_time':'2024-10-15 20:00','display':'public','location_id':'9'},
  
  {'journey_id':'11','title':'Arrival in Marrakech','description':'Check-in at traditional riad in the medina','start_time':'2024-04-10 14:00','end_time':'2024-04-10 16:00','display':'private','location_id':'8'},
  {'journey_id':'11','title':'Medina Walking Tour','description':'Guided exploration of ancient walled city','start_time':'2024-04-11 09:00','end_time':'2024-04-11 13:00','display':'private','location_id':'6'},
  {'journey_id':'11','title':'Jardin Majorelle Visit','description':'Exploring Yves Saint Laurents famous blue garden','start_time':'2024-04-11 15:00','end_time':'2024-04-11 17:00','display':'private','location_id':'2'},
  {'journey_id':'11','title':'Travel to Merzouga','description':'Journey to edge of Sahara Desert','start_time':'2024-04-12 08:00','end_time':'2024-04-12 16:00','display':'private','location_id':'7'},
  {'journey_id':'11','title':'Camel Trek into Desert','description':'Riding camels to desert camp at sunset','start_time':'2024-04-12 17:00','end_time':'2024-04-12 19:00','display':'private','location_id':'19'},
  {'journey_id':'11','title':'Desert Camp Experience','description':'Overnight stay in Berber tents with traditional music','start_time':'2024-04-12 19:00','end_time':'2024-04-13 08:00','display':'private','location_id':'13'},
  {'journey_id':'11','title':'Ait Benhaddou Visit','description':'Exploring ancient fortified village and film location','start_time':'2024-04-15 09:00','end_time':'2024-04-15 12:00','display':'private','location_id':'15'},
  
  {'journey_id':'12','title':'Arrival in Tokyo','description':'Check-in at hotel in Shinjuku district','start_time':'2024-09-01 16:00','end_time':'2024-09-01 18:00','display':'private','location_id':'1'},
  {'journey_id':'12','title':'Tsukiji Fish Market Visit','description':'Early morning tour of famous seafood market','start_time':'2024-09-02 05:30','end_time':'2024-09-02 08:00','display':'private','location_id':'8'},
  {'journey_id':'12','title':'Tokyo National Museum','description':'Exploring Japans oldest and largest museum','start_time':'2024-09-03 10:00','end_time':'2024-09-03 14:00','display':'private','location_id':'4'},
  {'journey_id':'12','title':'Mount Fuji Day Trip','description':'Hiking and photography at Japans iconic mountain','start_time':'2024-09-04 07:00','end_time':'2024-09-04 18:00','display':'private','location_id':'19'},
  {'journey_id':'12','title':'Akihabara Electronics District','description':'Shopping for gadgets in tech paradise','start_time':'2024-09-05 13:00','end_time':'2024-09-05 18:00','display':'private','location_id':'4'},
  {'journey_id':'12','title':'Sumo Wrestling Tournament','description':'Watching Japans traditional sport live','start_time':'2024-09-06 11:00','end_time':'2024-09-06 15:30','display':'private','location_id':'18'},
  {'journey_id':'12','title':'Shinjuku Gyoen Garden','description':'Peaceful walk through one of Tokyos largest parks','start_time':'2024-09-07 09:00','end_time':'2024-09-07 12:00','display':'private','location_id':'18'},
  
  {'journey_id':'13','title':'Arrival in Oslo','description':'Check-in at hotel and harbor walk','start_time':'2024-08-01 15:00','end_time':'2024-08-01 18:00','display':'public','location_id':'7'},
  {'journey_id':'13','title':'Oslo City Tour','description':'Visiting Viking Ship Museum and Vigeland Park','start_time':'2024-08-02 09:00','end_time':'2024-08-02 15:00','display':'public','location_id':'15'},
  {'journey_id':'13','title':'Train to Bergen','description':'Scenic railway journey across mountains','start_time':'2024-08-03 08:00','end_time':'2024-08-03 14:00','display':'public','location_id':'1'},
  {'journey_id':'13','title':'Fjord Cruise: Sognefjord','description':'Boat tour of Norways longest and deepest fjord','start_time':'2024-08-04 08:00','end_time':'2024-08-04 17:00','display':'public','location_id':'5'},
  {'journey_id':'13','title':'Flåm Railway Journey','description':'Famous steep train ride with spectacular views','start_time':'2024-08-05 10:00','end_time':'2024-08-05 12:30','display':'public','location_id':'2'},
  {'journey_id':'13','title':'Geirangerfjord Cruise','description':'UNESCO-listed fjord with seven waterfalls','start_time':'2024-08-06 09:00','end_time':'2024-08-06 14:00','display':'public','location_id':'16'},
  {'journey_id':'13','title':'Pulpit Rock Hike','description':'Trek to famous cliff viewpoint','start_time':'2024-08-07 08:00','end_time':'2024-08-07 15:00','display':'public','location_id':'18'},
  
  {'journey_id':'14','title':'Arrival in Athens','description':'Check-in at hotel and Acropolis views','start_time':'2024-07-15 14:00','end_time':'2024-07-15 16:00','display':'public','location_id':'17'},
  {'journey_id':'14','title':'Acropolis and Parthenon Tour','description':'Guided visit to ancient Greek monuments','start_time':'2024-07-16 09:00','end_time':'2024-07-16 13:00','display':'public','location_id':'4'},
  {'journey_id':'14','title':'Ferry to Mykonos','description':'Sea journey to famous party island','start_time':'2024-07-17 10:00','end_time':'2024-07-17 14:30','display':'public','location_id':'1'},
  {'journey_id':'14','title':'Mykonos Beach Day','description':'Relaxing at Paradise Beach with water sports','start_time':'2024-07-18 10:00','end_time':'2024-07-18 17:00','display':'public','location_id':'21'},
  {'journey_id':'14','title':'Ferry to Santorini','description':'Scenic boat journey to volcanic island','start_time':'2024-07-20 09:30','end_time':'2024-07-20 13:30','display':'public','location_id':'6'},
  {'journey_id':'14','title':'Santorini Caldera Cruise','description':'Boat tour of volcanic crater with hot springs','start_time':'2024-07-21 10:00','end_time':'2024-07-21 15:00','display':'public','location_id':'17'},
  {'journey_id':'14','title':'Oia Sunset Experience','description':'Viewing famous sunset from cliffside village','start_time':'2024-07-22 18:00','end_time':'2024-07-22 20:30','display':'public','location_id':'18'},
  
  {'journey_id':'15','title':'Zürich Arrival','description':'Airport transfer to Alpine resort','start_time':'2024-01-28 15:00','end_time':'2024-01-28 18:00','display':'private','location_id':'15'},
  {'journey_id':'15','title':'Ski Equipment Rental','description':'Fitting and collection of ski gear','start_time':'2024-01-29 09:00','end_time':'2024-01-29 11:00','display':'private','location_id':'19'},
  {'journey_id':'15','title':'Beginner Ski Lesson','description':'Group instruction on basic skiing techniques','start_time':'2024-01-29 13:00','end_time':'2024-01-29 16:00','display':'private','location_id':'18'},
  {'journey_id':'15','title':'Intermediate Slopes Day','description':'Full day exploring blue and red runs','start_time':'2024-01-30 09:00','end_time':'2024-01-30 16:00','display':'private','location_id':'18'},
  {'journey_id':'15','title':'Cross-Country Ski Excursion','description':'Guided tour through snow-covered forests','start_time':'2024-01-31 10:00','end_time':'2024-01-31 14:00','display':'private','location_id':'8'},
  {'journey_id':'15','title':'Fondue Dinner Experience','description':'Traditional Swiss cheese fondue at mountain restaurant','start_time':'2024-01-31 19:00','end_time':'2024-01-31 22:00','display':'private','location_id':'21'},
  {'journey_id':'15','title':'Glacier Paradise Cable Car','description':'Visit to Europes highest viewing platform','start_time':'2024-02-01 10:00','end_time':'2024-02-01 15:00','display':'private','location_id':'14'},
  
  {'journey_id':'16','title':'Arrival in Manaus','description':'Check-in at hotel and expedition preparation','start_time':'2024-04-18 12:00','end_time':'2024-04-18 15:00','display':'private','location_id':'5'},
  {'journey_id':'16','title':'Manaus Opera House Tour','description':'Visiting historic theater in the heart of Amazon','start_time':'2024-04-18 16:00','end_time':'2024-04-18 18:00','display':'private','location_id':'7'},
  {'journey_id':'16','title':'Jungle Lodge Transfer','description':'Boat journey to remote rainforest accommodation','start_time':'2024-04-19 08:00','end_time':'2024-04-19 12:00','display':'private','location_id':'19'},
  {'journey_id':'16','title':'Canopy Walkway Adventure','description':'Elevated trail through rainforest treetops','start_time':'2024-04-20 09:00','end_time':'2024-04-20 12:00','display':'private','location_id':'17'},
  {'journey_id':'16','title':'Amazon River Dolphin Watching','description':'Boat trip to spot pink river dolphins','start_time':'2024-04-21 07:00','end_time':'2024-04-21 11:00','display':'private','location_id':'14'},
  {'journey_id':'16','title':'Nocturnal Jungle Walk','description':'Guided night hike to observe nocturnal animals','start_time':'2024-04-22 19:00','end_time':'2024-04-22 21:30','display':'private','location_id':'6'},
  {'journey_id':'16','title':'Indigenous Community Visit','description':'Learning about traditional Amazon cultures','start_time':'2024-04-23 10:00','end_time':'2024-04-23 15:00','display':'private','location_id':'20'},
  
  {'journey_id':'17','title':'Miami Embarkation','description':'Boarding luxury cruise ship at Port of Miami','start_time':'2024-12-22 12:00','end_time':'2024-12-22 16:00','display':'private','location_id':'8'},
  {'journey_id':'17','title':'Day at Sea','description':'Enjoying ship amenities and welcome gala','start_time':'2024-12-23 08:00','end_time':'2024-12-23 23:00','display':'private','location_id':'19'},
  {'journey_id':'17','title':'Nassau, Bahamas Port Day','description':'Beach excursion and shopping in port','start_time':'2024-12-24 09:00','end_time':'2024-12-24 17:00','display':'private','location_id':'20'}
    ]


    with db.get_cursor() as cursor:
                
            for event in event_list:
                     
                cursor.execute('''
                    INSERT INTO events (journey_id, title, description,  start_time,end_time,location_id, display, status)
                    VALUES (%s, %s, %s, %s, %s, %s,%s, 'open');
                ''', (event['journey_id'], event['title'], event['description'],  event['start_time'],event['end_time'], event['location_id'],event['display']))
            db.close_db()

    return redirect(url_for('login'))

@app.route('/subscription/generate')
def generateSubscriptions():
    subscriptions=[
         {'s_id':1,'s_name':'Free Trial','s_description':'Published Journeys + Multiple Images + Journey Cover Images','period':'30','base_price':0.0,'discount':0},
         {'s_id':2,'s_name':'One Month','s_description':'Published Journeys + Multiple Images + Journey Cover Images','period':'30','base_price':5.22,'discount':0},
         {'s_id':3,'s_name':'One Quarter','s_description':'Published Journeys + Multiple Images + Journey Cover Images','period':'90','base_price':15.66,'discount':10},
         {'s_id':4,'s_name':'One Year','s_description':'Published Journeys + Multiple Images + Journey Cover Images','period':'365','base_price':62.64,'discount':25},
         {'s_id':5,'s_name':'One Month Gift','s_description':'Published Journeys + Multiple Images + Journey Cover Images','period':'30','base_price':0.0,'discount':0},
         {'s_id':6,'s_name':'One Quarter Gift','s_description':'Published Journeys + Multiple Images + Journey Cover Images','period':'90','base_price':0.0,'discount':0},
         {'s_id':7,'s_name':'One Year Gift','s_description':'Published Journeys + Multiple Images + Journey Cover Images','period':'365','base_price':0.0,'discount':0}
    ]

    countryTaxs=[{'c_id':1,'country':'New Zealand','rate':15,'fixed_tax':None},
                 {'c_id':2,'country':'Australia','rate':10,'fixed_tax':None},
                 {'c_id':3,'country':'Japan','rate':0,'fixed_tax':None}]
    
    dateAfterOneMonth=datetime.now()+timedelta(days=30)
    dateInOneWeek=datetime.now()+timedelta(days=5)
    dateInOneDay=datetime.now()+timedelta(days=1)
    dateBeforeOneDay=datetime.now()-timedelta(days=1)
    dateBeforeMonth=datetime.now()-timedelta(days=1)
    
    members=[{'m_id':1,'user_id':1,'m_status':'subscribed','end_time':dateAfterOneMonth},
             {'m_id':2,'user_id':2,'m_status':'subscribed','end_time':dateInOneWeek},
             {'m_id':3,'user_id':3,'m_status':'subscribed','end_time':dateInOneDay},
             {'m_id':4,'user_id':4,'m_status':'expired','end_time':dateBeforeOneDay},
             {'m_id':5,'user_id':26,'m_status':'subscribed','end_time':dateAfterOneMonth}]
    
    historys=[{'h_id':1,'m_id':1,'s_id':1,'c_id':1,'price':0.00,'gst_rate':0,'total_amount':0.00,'payment':'Trail','start_time':datetime.now(),'end_time':dateAfterOneMonth,'create_time':datetime.now(),'transaction_id':'INV-2025-05-01-1'},
              {'h_id':2,'m_id':2,'s_id':1,'c_id':1,'price':0.00,'gst_rate':0,'total_amount':0.00,'payment':'Trail','start_time':datetime.now(),'end_time':dateInOneWeek,'create_time':datetime.now(),'transaction_id':'INV-2025-05-01-2'},
              {'h_id':3,'m_id':3,'s_id':1,'c_id':1,'price':0.00,'gst_rate':0,'total_amount':0.00,'payment':'Trail','start_time':datetime.now(),'end_time':dateInOneDay,'create_time':datetime.now(),'transaction_id':'INV-2025-05-01-3'},
              {'h_id':4,'m_id':4,'s_id':1,'c_id':1,'price':0.00,'gst_rate':0,'total_amount':0.00,'payment':'Trail','start_time':dateBeforeMonth,'end_time':dateBeforeOneDay,'create_time':datetime.now(),'transaction_id':'INV-2025-05-01-4'},
              {'h_id':5,'m_id':5,'s_id':1,'c_id':1,'price':0.00,'gst_rate':0,'total_amount':0.00,'payment':'Trail','start_time':datetime.now(),'end_time':dateAfterOneMonth,'create_time':datetime.now(),'transaction_id':'INV-2025-05-01-5'}]


    with db.get_cursor() as cursor:
                
            for s in subscriptions:
                cursor.execute("INSERT INTO subscriptions (s_id,s_name,s_description,period,base_price,discount) VALUES (%s,%s,%s,%s,%s,%s);",
                               (s['s_id'],s['s_name'],s['s_description'],s['period'],s['base_price'],s['discount'],))
            
            for c in countryTaxs:
                cursor.execute("INSERT INTO country_tax (c_id,country,rate,fixed_tax) VALUES (%s,%s,%s,%s);",
                               (c['c_id'],c['country'],c['rate'],c['fixed_tax'],))
                
            for m in members:
                cursor.execute("INSERT INTO members (m_id,user_id,m_status,end_time) VALUES (%s,%s,%s,%s);",
                               (m['m_id'],m['user_id'],m['m_status'],m['end_time'],))
                
            for h in historys:
                cursor.execute("INSERT INTO subscription_history (h_id,m_id,s_id,c_id,price,gst_rate,total_amount,payment,start_time,end_time,create_time,transaction_id) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s);",
                               (h['h_id'],h['m_id'],h['s_id'],h['c_id'],h['price'],h['gst_rate'],h['total_amount'],h['payment'],h['start_time'],h['end_time'],h['create_time'],h['transaction_id'],))
            

    return redirect(url_for('login'))

@app.route('/comment/generate')
def generateCommentsAndLikes():
    # Sample event comments data
    # Assuming user_id 21 is an editor/moderator based on your user generation
    # Using a fixed datetime string for simplicity, or use datetime.now()
    comments_data = [
        {'event_id': 1, 'user_id': 1, 'content': 'This looks amazing! Can\'t wait to see more.'},
        {'event_id': 1, 'user_id': 2, 'content': 'I want to go there too! Looks like a dream.'},
        {'event_id': 2, 'user_id': 3, 'content': 'This comment is intentionally offensive to be moderated.', 'is_hidden': True, 'moderation_reason': 'Comment was found to be offensive and violated community guidelines.', 'moderator_id': 21, 'moderated_at': '2025-05-17 10:00:00'},
        {'event_id': 2, 'user_id': 4, 'content': 'Thanks for sharing these beautiful pictures!'},
        {'event_id': 3, 'user_id': 5, 'content': 'I love hiking this trail. The views are spectacular.'},
        {'event_id': 3, 'user_id': 6, 'content': 'The view is breathtaking. Definitely a must-do.'},
        {'event_id': 4, 'user_id': 7, 'content': 'This event seems educational and fun for the whole family.'},
        {'event_id': 5, 'user_id': 8, 'content': 'Road trips are the best way to explore.'},
        {'event_id': 6, 'user_id': 9, 'content': 'Stargazing is magical. I hope to experience this.'},
        {'event_id': 7, 'user_id': 10, 'content': 'A helicopter tour is on my bucket list! So exciting.'}
    ]

    # Sample event likes data (likes on events, not comments)
    event_likes_data = [
        {'event_id': 1, 'user_id': 1}, {'event_id': 1, 'user_id': 2}, {'event_id': 1, 'user_id': 3},
        {'event_id': 2, 'user_id': 1}, {'event_id': 2, 'user_id': 4},
        {'event_id': 3, 'user_id': 5}, {'event_id': 3, 'user_id': 6},
        {'event_id': 4, 'user_id': 7}, {'event_id': 5, 'user_id': 8},
        {'event_id': 6, 'user_id': 9}, {'event_id': 7, 'user_id': 10}
    ]

    # Sample comment reactions data (likes/dislikes on comments)
    # Assumes comment_ids will be 1-10 if tables are truncated before running this.
    comment_reactions_data = [
        {'comment_id': 1, 'user_id': 2, 'reaction': 'like'}, {'comment_id': 1, 'user_id': 4, 'reaction': 'like'},
        {'comment_id': 2, 'user_id': 1, 'reaction': 'like'},
        {'comment_id': 4, 'user_id': 3, 'reaction': 'like'}, {'comment_id': 4, 'user_id': 1, 'reaction': 'dislike'},
        {'comment_id': 5, 'user_id': 6, 'reaction': 'like'},
        {'comment_id': 6, 'user_id': 5, 'reaction': 'like'},
        {'comment_id': 7, 'user_id': 1, 'reaction': 'like'},
        {'comment_id': 8, 'user_id': 2, 'reaction': 'dislike'},
    ]

    # Sample comment reports data
    # Assumes comment_ids will be 1-10.
    comment_reports_data = [
        {'comment_id': 3, 'user_id': 4, 'reason': 'offensive', 'details': 'The content of this comment is inappropriate.', 'status': 'hidden', 'reviewed_by': 21}, # User 4 reports comment 3, reviewed by user 21
        {'comment_id': 8, 'user_id': 1, 'reason': 'spam', 'details': 'This comment seems like spam or self-promotion.'}, # User 1 reports comment 8 (status will be 'pending' by default, reviewed_by will be NULL)
        {'comment_id': 10, 'user_id': 5, 'reason': 'abusive', 'details': 'The user is being hostile in their comment.', 'status': 'pending'} 
    ]

    with db.get_cursor() as cursor:
        # Populate event_comments
        for c_data in comments_data:
            cursor.execute('''
                INSERT INTO event_comments 
                (event_id, user_id, content, is_hidden, moderation_reason, moderator_id, moderated_at, created_at) 
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ''', (
                c_data['event_id'], c_data['user_id'], c_data['content'],
                c_data.get('is_hidden', False), c_data.get('moderation_reason'),
                c_data.get('moderator_id'), c_data.get('moderated_at'),
                datetime.now() # Or a fixed timestamp if preferred
            ))

        # Populate event_likes (for events)
        for el_data in event_likes_data:
            cursor.execute('INSERT IGNORE INTO event_likes (event_id, user_id, created_at) VALUES (%s, %s, %s)',
                           (el_data['event_id'], el_data['user_id'], datetime.now()))

        # Populate comment_reactions
        for cr_data in comment_reactions_data:
            cursor.execute('''
                INSERT IGNORE INTO comment_reactions (comment_id, user_id, reaction, created_at) 
                VALUES (%s, %s, %s, %s)
            ''', (cr_data['comment_id'], cr_data['user_id'], cr_data['reaction'], datetime.now()))

        # Populate comment_reports
        for crep_data in comment_reports_data:
            current_status = crep_data.get('status', 'pending')
            reviewed_at_val = datetime.now() if current_status != 'pending' else None
            # Set reviewed_by if the status is not 'pending' and 'reviewed_by' is provided in the data
            # Otherwise, it will default to NULL in the database if not provided and status is 'pending'
            reviewed_by_val = crep_data.get('reviewed_by') if current_status != 'pending' and 'reviewed_by' in crep_data else None

            cursor.execute('''
                INSERT IGNORE INTO comment_reports 
                (comment_id, user_id, reason, details, status, created_at, reviewed_at, reviewed_by) 
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ''', (
                crep_data['comment_id'], crep_data['user_id'], crep_data['reason'],
                crep_data.get('details'), current_status,
                datetime.now(), # created_at
                reviewed_at_val, # reviewed_at
                reviewed_by_val  # reviewed_by
            ))
        db.close_db()
    return redirect(url_for('login')) # Or wherever you want to redirect after populating


# 将以下函数添加到你的 populate.py 文件中

@app.route('/edit_logs/generate')
def generateEditLogs():
    """生成一些测试用的编辑日志数据"""
    edit_logs_data = [
        {
            'journey_id': 17,  # Grand Canyon Camping Trip (user_id: 1 - Sofia Miller)
            'event_id': None,
            'editor_id': 21,  # editor1 - Emma Harris
            'edit_type': 'journey_edit',
            'field_changed': 'title',
            'old_value': 'Grand Canyon Camping Trip',
            'new_value': 'Grand Canyon Adventure Trip',
            'edit_reason': 'Updated title to better reflect the nature of the journey and improve SEO visibility',
            'created_at': '2024-09-10 14:30:00'  # 编辑发生在旅程开始后
        },
        {
            'journey_id': 17,  # Grand Canyon Camping Trip
            'event_id': None,
            'editor_id': 21,  # editor1 - Emma Harris
            'edit_type': 'journey_edit',
            'field_changed': 'description',
            'old_value': 'Three days of hiking and stargazing',
            'new_value': 'Three days of hiking, stargazing, and photography workshop',
            'edit_reason': 'Added photography workshop information as requested by the journey owner',
            'created_at': '2024-09-12 09:15:00'
        },
        {
            'journey_id': 2,  # Australian Outback Journey (user_id: 2 - Evelyn King)
            'event_id': 8,  # "Arrival in Sydney" 事件
            'editor_id': 22,  # editor2 - Sophia Taylor
            'edit_type': 'event_edit',
            'field_changed': 'description',
            'old_value': 'Check-in at hotel and harbor orientation',
            'new_value': 'Check-in at hotel and comprehensive harbor orientation tour',
            'edit_reason': 'Enhanced description to provide more detailed information about the orientation tour',
            'created_at': '2024-11-02 16:45:00'  # 在事件发生后编辑
        },
        {
            'journey_id': 1,  # European Summer Getaway (user_id: 5 - Benjamin Davis)
            'event_id': None,
            'editor_id': 26,  # admin1 - Lucas Perez
            'edit_type': 'journey_edit',
            'field_changed': 'status',
            'old_value': 'open',
            'new_value': 'hidden',
            'edit_reason': 'Temporarily hidden due to content review following user reports about inaccurate information',
            'created_at': '2024-07-01 11:20:00'  # 在旅程期间隐藏
        },
        {
            'journey_id': 4,  # Southeast Asia Backpacking (user_id: 4 - Sophia Walker)
            'event_id': 23,  # "Bangkok Temple Tour" 事件 (实际在事件列表中的位置)
            'editor_id': 25,  # editor5 - Daniel Garcia
            'edit_type': 'event_edit',
            'field_changed': 'title',
            'old_value': 'Bangkok Temple Tour',
            'new_value': 'Bangkok Temple Cultural Experience',
            'edit_reason': 'Updated title to better emphasize the cultural aspect of the temple visit experience',
            'created_at': '2024-11-25 13:10:00'  # 在事件发生后编辑
        },
        {
            'journey_id': 12,  # Tokyo Adventure (user_id: 12 - Benjamin Wilson)
            'event_id': 75,  # "Arrival in Tokyo" 事件
            'editor_id': 23,  # editor3 - James Rodriguez
            'edit_type': 'event_edit',
            'field_changed': 'description',
            'old_value': 'Check-in at hotel in Shinjuku district',
            'new_value': 'Check-in at hotel in Shinjuku district with welcome orientation and local area briefing',
            'edit_reason': 'Added more details about the arrival process to help future travelers',
            'created_at': '2024-09-05 10:30:00'
        },
        {
            'journey_id': 5,  # African Safari (user_id: 2 - Evelyn King)
            'event_id': None,
            'editor_id': 24,  # editor4 - Evelyn Lopez
            'edit_type': 'journey_edit',
            'field_changed': 'description',
            'old_value': 'Wildlife expedition in Kenya and Tanzania',
            'new_value': 'Comprehensive wildlife expedition in Kenya and Tanzania with professional photography guidance',
            'edit_reason': 'Enhanced description to highlight the photography aspect which was missing from original description',
            'created_at': '2024-08-15 14:45:00'
        },
        {
            'journey_id': 15,  # Costa Rica Eco-Tour (user_id: 6 - Daniel Ramirez)
            'event_id': 36,  # "San Jose Arrival" 事件
            'editor_id': 27,  # admin2 - Benjamin Moore
            'edit_type': 'event_edit',
            'field_changed': 'start_time',
            'old_value': '2024-02-25 14:00',
            'new_value': '2024-02-25 15:30',
            'edit_reason': 'Updated arrival time based on actual flight schedule changes provided by the traveler',
            'created_at': '2024-03-10 08:20:00'
        }
    ]

    with db.get_cursor() as cursor:
        for log_data in edit_logs_data:
            cursor.execute('''
                    INSERT INTO edit_logs 
                    (journey_id, event_id, editor_id, edit_type, field_changed, old_value, new_value, edit_reason, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ''', (
                log_data['journey_id'],
                log_data['event_id'],
                log_data['editor_id'],
                log_data['edit_type'],
                log_data['field_changed'],
                log_data['old_value'],
                log_data['new_value'],
                log_data['edit_reason'],
                log_data['created_at']  # 使用指定的时间而不是 datetime.now()
            ))
        db.close_db()

    return redirect(url_for('login'))


@app.route('/appeals/generate')
def generateAppeals():
    """生成申诉系统的测试数据"""

    # 首先更新一些用户的状态来模拟被限制的情况
    with db.get_cursor() as cursor:
        # 首先检查 journeys 表的 status 列的 ENUM 值
        cursor.execute("""
            SELECT COLUMN_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = 'create_table_v_04' 
            AND TABLE_NAME = 'journeys' 
            AND COLUMN_NAME = 'status'
        """)

        status_enum = cursor.fetchone()
        print(f"Journeys status column type: {status_enum}")

        # 更新一些用户的限制状态
        restricted_users_data = [
            {
                'user_id': 7,  # traveller7 - Mia Clark (已经是inactive状态)
                'sharing_blocked': True,
                # 'sharing_blocked_at': '2024-12-01 10:30:00',
                # 'sharing_blocked_by': 26,  # admin1
                # 'ban_reason': 'Repeated violations of community guidelines regarding inappropriate content sharing'
            },
            {
                'user_id': 13,  # traveller13 - Mia Brown (已经是inactive状态)
                'sharing_blocked': True,
                # 'sharing_blocked_at': '2024-11-15 14:20:00',
                # 'sharing_blocked_by': 27,  # admin2
                # 'ban_reason': 'Sharing copyrighted images without permission'
            }
        ]

        # 更新用户的限制状态
        for user_data in restricted_users_data:
            cursor.execute('''
                UPDATE users 
                SET sharing_blocked = %s 
                WHERE user_id = %s
            ''', (
                user_data['sharing_blocked'],
                # user_data['sharing_blocked_at'],
                # user_data['sharing_blocked_by'],
                # user_data['ban_reason'],
                # user_data['sharing_blocked_at'],  # 设置last_appeal_date为被限制的时间
                user_data['user_id']
            ))

            # --, sharing_blocked_at = %s, sharing_blocked_by = %s, ban_reason = %s, last_appeal_date = %s

        # 隐藏一些旅程（现在可以安全地使用 'hidden' status）
        hidden_journeys_data = [
            {
                'journey_id': 1,  # European Summer Getaway
                'status': 'hidden',
                # 'hidden_reason': 'Contains inaccurate information about travel restrictions',
                # 'hidden_by': 26,  # admin1
                # 'hidden_at': '2024-07-01 11:20:00'
            },
            {
                'journey_id': 6,  # Amazon Rainforest Trek
                'status': 'hidden',
                # 'hidden_reason': 'Safety concerns raised about unauthorized tour operators',
                # 'hidden_by': 27,  # admin2
                # 'hidden_at': '2024-05-10 16:45:00'
            }
        ]

        # 更新旅程的隐藏状态和相关信息
        for journey_data in hidden_journeys_data:
            cursor.execute('''
                UPDATE journeys 
                SET status = %s 
                WHERE journey_id = %s
            ''', (
                journey_data['status'],
                # journey_data['hidden_reason'],
                # journey_data['hidden_by'],
                # journey_data['hidden_at'],
                journey_data['journey_id']
            ))

            # -- , hidden_reason = %s, hidden_by = %s, hidden_at = %s

        # 申诉数据
        appeals_data = [
            {
                'user_id': 7,  # traveller7 - Mia Clark
                'appeal_type': 'sharing_block',
                'reference_id': None,
                'justification': 'I believe my sharing privileges were revoked unfairly. The content I shared was original photography from my travels and did not violate any community guidelines. I have been a responsible member of this community for over a year and this restriction is preventing me from sharing my genuine travel experiences with others.',
                'status': 'pending',
                'created_at': '2024-12-05 09:15:00',
                'reviewed_at': None,
                'reviewed_by': None,
                'admin_response': None
            },
            {
                'user_id': 13,  # traveller13 - Mia Brown
                'appeal_type': 'sharing_block',
                'reference_id': None,
                'justification': 'I am appealing the sharing block on my account. While I understand that some images may have appeared similar to copyrighted content, all photos I shared were taken by me personally during my travels. I can provide EXIF data and additional proof of my presence at these locations. I was not aware that similar compositions existed and this was purely coincidental.',
                'status': 'approved',
                'created_at': '2024-11-20 14:30:00',
                'reviewed_at': '2024-11-25 10:45:00',
                'reviewed_by': 21,  # editor1
                'admin_response': 'After reviewing your appeal and the evidence provided, we have determined that the sharing block was applied in error. Your sharing privileges have been restored. We apologize for any inconvenience caused.'
            },
            {
                'user_id': 5,  # traveller5 - Benjamin Davis (owner of journey 1)
                'appeal_type': 'hidden_journey',
                'reference_id': 1,  # journey_id
                'justification': 'I am requesting the restoration of my European Summer Getaway journey. The travel information was accurate at the time of posting and was based on official government websites. I understand that travel restrictions change frequently, but I believe the content should be restored with an appropriate disclaimer rather than being completely hidden from view.',
                'status': 'pending',
                'created_at': '2024-07-05 16:20:00',
                'reviewed_at': '2024-07-08 11:30:00',
                'reviewed_by': 22,  # editor2
                'admin_response': 'Your appeal is currently under review. We are consulting with travel experts to verify the accuracy of the information. We will provide an update within 5 business days.'
            },
            {
                'user_id': 16,  # traveller16 - Isabella Martinez (owner of journey 6)
                'appeal_type': 'hidden_journey',
                'reference_id': 6,  # journey_id
                'justification': 'I strongly disagree with the decision to hide my Amazon Rainforest Trek journey. The tour operator I used is fully licensed and certified by Brazilian tourism authorities. I have all the documentation to prove this. Hiding this journey prevents other travelers from learning about legitimate eco-tourism options in the Amazon region.',
                'status': 'rejected',
                'created_at': '2024-05-15 12:10:00',
                'reviewed_at': '2024-05-20 14:25:00',
                'reviewed_by': 26,  # admin1
                'admin_response': 'After thorough investigation, we found that the tour operator mentioned has had their license suspended since March 2024. For safety reasons, we cannot restore content that promotes potentially unsafe activities. You may resubmit with information about alternative licensed operators.'
            },
            {
                'user_id': 3,  # traveller3 - Mia Martin
                'appeal_type': 'hidden_journey',
                'reference_id': 3,  # comment_id (the hidden offensive comment)
                'justification': 'I believe my comment was removed unfairly. While my language may have been strong, I was expressing a legitimate concern about safety issues at the location. The comment was meant to warn other travelers, not to be offensive. I think a warning or edit suggestion would have been more appropriate than outright removal.',
                'status': 'pending',
                'created_at': '2024-05-20 10:30:00',
                'reviewed_at': None,
                'reviewed_by': None,
                'admin_response': None
            },
            {
                'user_id': 18,  # traveller18 - Olivia Brown
                'appeal_type': 'site_ban',
                'reference_id': None,
                'justification': 'I am appealing what appears to be a shadow ban on my account. My posts are not receiving normal visibility and I suspect my account has been restricted without notification. I have always followed community guidelines and contributed positively to travel discussions. If there was a specific violation, I would appreciate clear communication about what occurred so I can avoid it in the future.',
                'status': 'pending',
                'created_at': '2024-12-10 08:45:00',
                'reviewed_at': None,
                'reviewed_by': None,
                'admin_response': None
            }
        ]

        # 插入申诉数据
        for appeal_data in appeals_data:
            cursor.execute('''
                INSERT INTO appeals 
                (user_id, appeal_type, reference_id, justification, status, created_at, reviewed_at, reviewed_by, admin_response)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ''', (
                appeal_data['user_id'],
                appeal_data['appeal_type'],
                appeal_data['reference_id'],
                appeal_data['justification'],
                appeal_data['status'],
                appeal_data['created_at'],
                appeal_data['reviewed_at'],
                appeal_data['reviewed_by'],
                appeal_data['admin_response']
            ))

        # 更新申诉成功用户的状态
        cursor.execute('''
            UPDATE users 
            SET  sharing_blocked = FALSE
            WHERE user_id = %s
        ''', ( 13,))  # traveller13 的申诉成功，恢复权限

        # cursor.execute('''
        #     UPDATE users 
        #     SET last_appeal_date = %s, sharing_blocked = FALSE, sharing_blocked_at = NULL, sharing_blocked_by = NULL, ban_reason = NULL
        #     WHERE user_id = %s
        # ''', ('2024-11-25 10:45:00', 13))  # traveller13 的申诉成功，恢复权限

        db.close_db()

    return redirect(url_for('login'))

@app.route('/announcement/generate')
def generateAnnouncements():
    announcements = [
        {'a_id': 1, 'user_id': 26, 'title': 'System Maintenance Notice', 'content': 'To provide better service experience, the system will undergo routine maintenance from 2:00-6:00 AM this Saturday. Some functions may be affected during this period. Please prepare accordingly.','created_at':'2025-05-27 00:00:00'},
        {'a_id': 2, 'user_id': 26, 'title': 'New Feature Launch Announcement', 'content': 'We are excited to announce that our new intelligent recommendation feature is now live! This feature will recommend the most relevant content and services based on your usage patterns.','created_at':'2025-05-27 00:00:00'},
        {'a_id': 3, 'user_id': 26, 'title': 'Security Alert Notice', 'content': 'We have recently discovered fraudsters impersonating our customer service representatives. Please be vigilant. Official customer service will never ask for your passwords or verification codes.','created_at':'2025-05-27 00:00:00'},
        {'a_id': 4, 'user_id': 26, 'title': 'Holiday Schedule Update', 'content': 'Please note that our customer service hours will be adjusted during the upcoming holiday period. We will be operating with reduced hours from December 24th to January 2nd.','created_at':'2025-05-27 00:00:00'},
        {'a_id': 5, 'user_id': 26, 'title': 'Privacy Policy Update', 'content': 'We have updated our Privacy Policy to better protect your personal information and comply with the latest regulations. Please review the changes at your earliest convenience.','created_at':'2025-05-27 00:00:00'},
        {'a_id': 6, 'user_id': 26, 'title': 'Server Upgrade Completion', 'content': 'We are pleased to announce that our server upgrade has been successfully completed. Users should experience improved performance and faster loading times across all platforms.','created_at':'2025-05-27 00:00:00'},
        {'a_id': 7, 'user_id': 26, 'title': 'Mobile App Update Available', 'content': 'A new version of our mobile application is now available for download. This update includes bug fixes, performance improvements, and new user interface enhancements.','created_at':'2025-05-27 00:00:00'},
        {'a_id': 8, 'user_id': 26, 'title': 'Community Guidelines Reminder', 'content': 'We want to remind all users to follow our community guidelines. Respectful communication and appropriate content sharing help maintain a positive environment for everyone.','created_at':'2025-05-27 00:00:00'},
        {'a_id': 9, 'user_id': 26, 'title': 'Data Backup Notification', 'content': 'As part of our commitment to data security, we will be performing a comprehensive backup of all user data this weekend. No action is required from users during this process.','created_at':'2025-05-27 00:00:00'},
        {'a_id': 10, 'user_id': 26, 'title': 'Beta Testing Program Launch', 'content': 'We are launching a beta testing program for selected users to try our upcoming features before public release. If you are interested in participating, please contact our support team.','created_at':'2025-05-27 00:00:00'},
        {'a_id': 11, 'user_id': 26, 'title': 'Payment System Enhancement', 'content': 'Our payment system has been enhanced with additional security measures and new payment options. These improvements will provide a more secure and convenient transaction experience.','created_at':'2025-05-27 00:00:00'},
        {'a_id': 12, 'user_id': 26, 'title': 'Terms of Service Update', 'content': 'We have made updates to our Terms of Service to clarify certain provisions and add new service features. The updated terms will take effect 30 days from this announcement.','created_at':'2025-05-27 00:00:00'},
        {'a_id': 13, 'user_id': 26, 'title': 'Customer Satisfaction Survey', 'content': 'We value your feedback! Please take a few minutes to complete our customer satisfaction survey. Your responses will help us improve our services and better meet your needs.','created_at':'2025-05-20 00:00:00'},
        {'a_id': 14, 'user_id': 26, 'title': 'Network Infrastructure Upgrade', 'content': 'We are upgrading our network infrastructure to provide faster and more reliable service. The upgrade will be performed in phases to minimize service disruption.','created_at':'2025-05-20 00:00:00'},
        {'a_id': 15, 'user_id': 26, 'title': 'New Partnership Announcement', 'content': 'We are excited to announce our new partnership with leading technology providers. This collaboration will bring enhanced features and services to our platform.','created_at':'2025-05-20 00:00:00'},
        {'a_id': 16, 'user_id': 26, 'title': 'Account Security Enhancement', 'content': 'We have implemented additional security measures to protect your account. Two-factor authentication is now available and highly recommended for all users.','created_at':'2025-05-20 00:00:00'},
        {'a_id': 17, 'user_id': 26, 'title': 'Service Expansion Notice', 'content': 'We are pleased to announce the expansion of our services to new regions. Users in these areas can now access our full range of features and support services.','created_at':'2025-04-27 00:00:00'},
        {'a_id': 18, 'user_id': 26, 'title': 'Technical Support Hours Extension', 'content': 'Good news! We are extending our technical support hours to better serve our global user base. Support will now be available 24/7 through multiple channels.','created_at':'2025-04-27 00:00:00'},
        {'a_id': 19, 'user_id': 26, 'title': 'Platform Performance Report', 'content': 'We are happy to report that our platform has achieved 99.9% uptime this quarter. We continue to invest in infrastructure improvements to maintain this high level of reliability.','created_at':'2025-04-27 00:00:00'},
        {'a_id': 20, 'user_id': 26, 'title': 'User Training Webinar Series', 'content': 'Join our upcoming webinar series designed to help users maximize their experience with our platform. Sessions will cover advanced features, best practices, and Q&A opportunities.','created_at':'2025-04-27 00:00:00'}
    ]
     
    with db.get_cursor() as cursor:
                
            for a in announcements:
                cursor.execute("INSERT INTO announcements (a_id,user_id,title,content,created_at) VALUES (%s,%s,%s,%s,%s);",
                               (a['a_id'],a['user_id'],a['title'],a['content'],a['created_at'],))
            
            

    return redirect(url_for('login'))

@app.route('/generate/all')
def generateAll():
    truncateDatabase()
    generateLocations()
    generateUsers()
    generateJourneys()
    generateEvents()
    generateSubscriptions()
    generateCommentsAndLikes()
    generateEditLogs()  # 使用修正后的版本
    generateAppeals()  # 新增申诉数据生成
    generateAnnouncements()

    return redirect(url_for('login'))

@app.route('/generate/all/with_edit_logs')
def generateAllWithEditLogs():
    """生成所有测试数据，包括编辑日志"""
    truncateDatabase()
    generateLocations()
    generateUsers()
    generateJourneys()
    generateEvents()
    generateSubscriptions()
    generateCommentsAndLikes()
    generateEditLogs()  # 使用修正后的版本
    generateAppeals()  # 新增申诉数据生成
    return redirect(url_for('login'))




@app.route('/generate/complete')
def generateCompleteDataset():
    """生成完整的测试数据集，包括所有功能模块"""
    truncateDatabase()
    generateLocations()
    generateUsers()
    generateJourneys()
    generateEvents()
    generateSubscriptions()
    generateCommentsAndLikes()
    generateEditLogs()
    generateAppeals()
    

    return redirect(url_for('login'))