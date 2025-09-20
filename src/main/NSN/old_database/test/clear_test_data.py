import pytest

import sys
import os
sys.path.insert(0,os.path.abspath(os.path.join(os.path.dirname(__file__),'..')))

from webapp import app, db 


def test_clear():
     
     truncate_database()

def truncate_database():
    # connect to db
    with app.app_context():
        connection = db.get_db()

        # clear test data of last time
        with connection.cursor() as cursor:
            cursor.execute('SET FOREIGN_KEY_CHECKS=0;')
            cursor.execute('truncate table locations;')
            cursor.execute('truncate table users;')
            cursor.execute('truncate table journeys;')
            cursor.execute('truncate table events;')
            cursor.execute('truncate table announcements;')

            db.close_db()

     

def clear_account_test_data():
     # connect to db
    with app.app_context():
        connection = db.get_db()

        # clear test data of last time
        with connection.cursor() as cursor:

                # clear user
                cursor.execute("SELECT * FROM users WHERE email like '%@example.com'")
                user_list=cursor.fetchall()
                
                for user in user_list:
                        cursor.execute("DELETE FROM users WHERE user_id = %s",(user[0],))
                cursor.execute("DELETE FROM locations WHERE city = '%Test City'")
                db.close_db()

def clear_journey_test_data(title):
    # connect to db
    with app.app_context():
        connection = db.get_db()

        # clear test data of last time
        with connection.cursor() as cursor:
            cursor.execute("SELECT journey_id FROM journeys WHERE title = %s;",(title,))
            journey_ids=cursor.fetchall()

            for journey_id in journey_ids:
                cursor.execute("DELETE FROM journeys WHERE journey_id = %s;",journey_id)
            db.close_db()

def clear_event_test_data(title):
     # connect to db
    with app.app_context():
        connection = db.get_db()

        # clear test data of last time
        with connection.cursor() as cursor:
                cursor.execute("DELETE FROM events WHERE title = %s;",(title,))
                db.close_db()