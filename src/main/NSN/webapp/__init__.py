from flask import Flask, render_template, session, redirect, url_for
from webapp import connect
from webapp import db
from .private_message import message_bp

app = Flask(__name__, template_folder='templates')
app.register_blueprint(message_bp)

app.secret_key = 'Example Secret Key (CHANGE THIS TO YOUR OWN SECRET KEY!)'

# Configure session cookie settings
app.config['SESSION_COOKIE_NAME'] = 'session'
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SECURE'] = False  # Set to True in production with HTTPS
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['PERMANENT_SESSION_LIFETIME'] = 3600  # 1 hour


db.init_db(app, connect.dbuser, connect.dbpass, connect.dbhost, connect.dbname)
from webapp import announcement
from webapp import event
from webapp import journey
from webapp import location
from webapp import login
from webapp import profile
from webapp import user
from webapp import populate
from webapp import premium
from webapp import content_moderation
from webapp import comment_moderation
from webapp import departure_board
from webapp import appeals
from webapp import announcement
from webapp import help_requests


