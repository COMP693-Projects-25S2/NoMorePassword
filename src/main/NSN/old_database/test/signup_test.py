import pytest

import sys
import os
sys.path.insert(0,os.path.abspath(os.path.join(os.path.dirname(__file__),'..')))

from webapp import app, db 
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
     

def test_signup(client):
    
    # clear last data if exists
    clear.test_clear()
    
    # Test successful user registration.
    create_traveller_account(client,"testuser","SecurePass123!")

    # Test signup with invalid password.
    response=client.post('/signup',data={
                "username": "weakpassuser",
                "email": "weakpass@example.com",
                "password": "12345",
                "confirm_password": "12345",
                "first_name": "John",
                "last_name": "Doe",
                "country": "Test Country",
                "region": "Test Region",
                "city": "Test City",
                "country1": "Test Country",
                "region1": "Test Region",
                "city1": "Test City"}
                ,follow_redirects=True)
   
    # assert the result of response
    assertByKeyword(response, "password_error: Please choose a longer password!")

    #Test signup with mismatched passwords.
    response=client.post('/signup',data={
            "username": "mismatchuser",
            "email": "mismatch@example.com",
            "password": "SecurePass123!",
            "confirm_password": "DifferentPass123!",
            "first_name": "John",
            "last_name": "Doe",
            "country": "Test Country",
            "region": "Test Region",
            "city": "Test City",
            "country1": "Test Country",
            "region1": "Test Region",
            "city1": "Test City"}
            ,follow_redirects=True)

    # assert the result of response
    assertByKeyword(response, "confirm_password_error: Passwords do not match.")

    # clear data again
    clear.test_clear()

def create_traveller_account(client,username,password):
    

    # Test successful user registration.
    response=client.post('/signup',data={
            "username": username,
            "email": "test@example.com",
            "password": password,
            "confirm_password": password,
            "first_name": "John",
            "last_name": "Doe",
            "country": "",
            "region": "",
            "city": "",
            "country1": "Test Country",
            "region1": "Test Region",
            "city1": "Test City"}
            ,follow_redirects=True)
    
    # assert the result of response
    assertByKeyword(response, "signup_successful: True")