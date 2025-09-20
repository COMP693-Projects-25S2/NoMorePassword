
from flask import Flask, g
from mysql.connector.pooling import MySQLConnectionPool

connection_pool: MySQLConnectionPool


def init_db(app: Flask, user: str, password: str, host: str, database: str,
            pool_name: str = "flask_db_pool", autocommit: bool = True):


    global connection_pool
    connection_pool = MySQLConnectionPool(
        user=user,
        password=password,
        host=host,
        database=database,
        pool_name=pool_name,
        autocommit=autocommit,
        pool_size=20)


    app.teardown_appcontext(close_db)


def get_db():

    if 'db' not in g:
        g.db = connection_pool.get_connection()

    return g.db


def get_cursor():
   
    return get_db().cursor(dictionary=True, buffered=True)


def close_db(exception=None):
   

    db = g.pop('db', None)

    if db is not None:
        db.close()
