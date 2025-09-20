import pytest

import sys
import os
import io
sys.path.insert(0,os.path.abspath(os.path.join(os.path.dirname(__file__),'..')))
from datetime import datetime

from webapp import app, db 
import signup_test as signup
import login_test as login
import journey_test as journey
import clear_test_data as clear

@pytest.fixture
def client():
    app.config['TESTING']=True
    with app.test_client() as client:
        yield client


                
       

def assertByKeyword(response,str):
    # get response for verification
    html=response.data.decode('utf-8')
    
    # assert the result of response
    assert response.status_code==200
    assert str in html

def assertByRedirect(response,urlStr):
    # get response for verification
    html=response.data.decode('utf-8')
     
     # assert the redirect of response
    assert response.status_code==302
    assert urlStr in html

     

def test_event(client):
    # clear data again
    clear.test_clear()

    signup.create_traveller_account(client,"testuser","SecurePass123!")
    login.get_login(client,"testuser","SecurePass123!")
    journey.create_private_journey(client)
    journey_list=journey.get_journey_by_title("test_private_journery")

    # Test add event
    if len(journey_list)>0:
        journey_id=journey_list[0][0]

         
        # Test successful add journey.
        response=client.post('/event/add',data={
                "journey_id": journey_id,
                "title": "test_private_event",
                "description": "this is a test private event",
                # "location_id": None,
                "event_image": (io.BytesIO(b""), "empty.txt"),
                "start_date": datetime.now().strftime('%Y-%m-%d'),
                "start_time": datetime.now().strftime('%H:%M'),
                "end_date": datetime.now().strftime('%Y-%m-%d'),
                "end_time": datetime.now().strftime('%H:%M'),
                "display": "private"
                }
                ,follow_redirects=True)
        
        # print(response.data.decode('utf-8'))
        
        # assert the result of response
        assertByKeyword(response, "event_successful: True")

        # Test view event
        response=client.get('/events/private/view',
                query_string={
                "journey_id": journey_id,
                "journey_title": "test_private_journey"
                }
                ,follow_redirects=True)
        
        # print(response.data.decode('utf-8'))
        
        # assert the result of response
        assertByKeyword(response, '<h5 class="mb-0">test_private_event</h5>')

        event_list=get_event_by_title("test_private_event")

        # Test upload event_image
        if len(event_list)>0:
            response=client.post('/event/image/upload',data={
                    "journey_id": journey_id,
                    "journey_title": "test_private_journey",
                    "event_id": event_list[0][0],
                    "event_image": (io.BytesIO(b""), "not_empty.txt")
                    }
                    ,follow_redirects=True)
            
            print(response.data.decode('utf-8'))
                    
            # assert the result of response
            # assertByKeyword(response, '<h5 class="mb-0">test_private_event</h5>')
            matched_files=match_files_by_name('empty')

            print('matched_files=',matched_files)

            assert len(matched_files)>0

            remove_files_by_list(matched_files)
            
    # clear data again
    clear.test_clear()
    

def get_event_by_title(title):
    event_list={}
    connection = db.get_db()
    with connection.cursor() as cursor:
        cursor.execute("SELECT * FROM events WHERE title =%s;",(title,))
        event_list=cursor.fetchall()
        db.close_db()
    return event_list


def match_files_by_name(keyword):

    upload_folder = os.path.join(app.root_path, "static", "events")
    if not os.path.exists(upload_folder):
        os.makedirs(upload_folder)

    matched_files = []
    try:
        for root, dirs, files in os.walk(upload_folder):
            for file in files:
                if keyword.lower() in file.lower():
                    matched_files.append(os.path.join(root, file))
    except Exception as e:
        print(e)

    return matched_files

def remove_files_by_list(matched_files):
    
    for file_path in matched_files:
        try:
            os.remove(file_path)
            deleted_count += 1
        except Exception as e:
            print(e)