import pytest

import sys
import os
sys.path.insert(0,os.path.abspath(os.path.join(os.path.dirname(__file__),'..')))

from webapp import app
import signup_test as signup
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

     

def test_signup(client):

    # clear data again
    clear.test_clear()

    signup.create_traveller_account(client,"testuser","SecurePass123!")

    # Test login with invalid password
    response=client.post('/login',data={
            "username": "testuser",
            "password": "12345!"
            },follow_redirects=True)
    
    # assert the result of response
    assertByKeyword(response,"Invalid username or password")

    # Test successful login.
    response=client.post('/login',data={
            "username": "testuser",
            "password": "SecurePass123!"
            },follow_redirects=False) # follow the redirect manually
    
    # assert the result of response
    assertByRedirect(response,"dashboard")

    # assert logout
    response=client.get('/logout',follow_redirects=False)
    assertByRedirect(response,"login")
    
    
    # clear data again
    clear.test_clear()

def get_login(client,username,password):
    # Test login with invalid password
    response=client.post('/login',data={
            "username": username,
            "password": password
            },follow_redirects=False)
    
    # assert the result of response
    assertByRedirect(response,"dashboard")