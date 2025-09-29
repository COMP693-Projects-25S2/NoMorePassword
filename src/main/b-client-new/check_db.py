import sqlite3

# Connect to database
conn = sqlite3.connect('instance/b_client_secure.db')
cursor = conn.cursor()

# Check tables
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = cursor.fetchall()
print('Tables:', tables)

# Check user_accounts count
cursor.execute("SELECT COUNT(*) FROM user_accounts")
count = cursor.fetchone()[0]
print('user_accounts count:', count)

# Check user_cookies count
cursor.execute("SELECT COUNT(*) FROM user_cookies")
count = cursor.fetchone()[0]
print('user_cookies count:', count)

# Show all user_accounts records
cursor.execute("SELECT user_id, username, website, logout FROM user_accounts")
records = cursor.fetchall()
print('user_accounts records:', records)

# Show all user_cookies records
cursor.execute("SELECT user_id, username FROM user_cookies")
records = cursor.fetchall()
print('user_cookies records:', records)

conn.close()
