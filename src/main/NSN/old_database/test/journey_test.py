import pytest

import sys
import os
sys.path.insert(0,os.path.abspath(os.path.join(os.path.dirname(__file__),'..')))
from datetime import datetime

from webapp import app, db 
import signup_test as signup
import login_test as login
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

     

def test_journey(client):
    # clear last test data if exists
    clear.test_clear()

    signup.create_traveller_account(client,"testuser","SecurePass123!")
    login.get_login(client,"testuser","SecurePass123!")

    # add private journey
    create_private_journey(client)

    # view private journey without keywords
    response=client.get('/journey/private/view',
                        follow_redirects=True)
    
    assertByKeyword(response, "test_private_journery")

    # change private journey to public
    journey_list=get_journey_by_title("test_private_journery")
    if len(journey_list)>0:
        response=client.post('/journey/edit/traveller',data={
                            "journey_id":journey_list[0][0],
                            "title": journey_list[0][2],
                            "description": journey_list[0][3],
                            "start_date": journey_list[0][4].strftime('%Y-%m-%d'),
                            "display": "public"
                            },
                            follow_redirects=True)
        
        # only print when failed
        print(response.data.decode('utf-8'))
        
        str=f'<option value="public" id="{journey_list[0][0]}" selected>Public</option>'
        assertByKeyword(response, str)
    

        # change public journey to private
        response=client.post('/journey/edit/traveller',data={
                            "journey_id":journey_list[0][0],
                            "title": journey_list[0][2],
                            "description": journey_list[0][3],
                            "start_date": journey_list[0][4].strftime('%Y-%m-%d'),
                            "display": "private"
                            },
                            follow_redirects=True)
        
        # only print when failed
        print(response.data.decode('utf-8'))
        
        str=f'<option value="private" id="{journey_list[0][0]}" selected>Private</option>'
        assertByKeyword(response, str)


    # clear test data again
    clear.test_clear()
    

def create_private_journey(client):
     # clear last data if exists
    clear.clear_journey_test_data("test_private_journery")

    # Test successful add journey.
    response=client.post('/journey/add',data={
            "title": "test_private_journery",
            "description": "this is a test private journey",
            "start_date": datetime.now().strftime('%Y-%m-%d'),
            "display": "private"
            }
            ,follow_redirects=True)
    
    # assert the result of response
    assertByKeyword(response, "journey_successful: True")

def get_journey_by_title(title):
    journey_list={}
    connection = db.get_db()
    with connection.cursor() as cursor:
        cursor.execute("SELECT * FROM journeys WHERE title =%s;",(title,))
        journey_list=cursor.fetchall()
        db.close_db()
    return journey_list

        