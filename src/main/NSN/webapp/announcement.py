from webapp import app
from webapp import db
from flask import redirect, render_template, request, session, url_for,flash
from datetime import datetime

@app.route('/announcement/view')
def view_announcement():

    #params: user_id, title, content, start_date, end_date
    # Ensure the user is logged in; redirect to login page if not
    if 'loggedin' not in session:
        return redirect(url_for('login'))
    
    user_id = session.get("user_id")
    if not user_id:
        flash("Session expired. Please log in again.", "danger")
        return redirect(url_for('login'))
    
    start = request.args.get('start')
    start_tag = request.args.get("start_tag")

    if start is None:
        start=0
    if start_tag is None:
        start_tag='next'

    if start!=0:
        start = formatstart(int(start), start_tag)
    announcement_list, amount=get_announcement(user_id, start)

    # get start number by start tag
    last_start, next_start = getpagination(int(start), amount, PAGE_LIMIT)

    #redirect to announcement.html
    return render_template('announcement.html', announcement_list=announcement_list, start=start, last_start=last_start, next_start=next_start)

@app.route('/announcement/add', methods=['GET', 'POST'])
def add_announcement():

    #params: user_id, title, content, start_date, end_date
    # Ensure the user is logged in; redirect to login page if not
    if 'loggedin' not in session:
        return redirect(url_for('login'))
    
    user_id = session.get("user_id")
    if not user_id:
        flash("Session expired. Please log in again.", "danger")
        return redirect(url_for('login'))
    
    if request.method == 'POST':

        # Retrieve form data
        title = request.form.get("title", "").strip()
        content = request.form.get("content", "").strip()
        start_date = request.form.get("start_date", "").strip()
        end_date = request.form.get("end_date", "").strip()  

        # Validate title
        if not title or len(title) > 100:
            flash("Title is required and must be ≤ 100 characters", "danger")
            return redirect(url_for('view_announcement',user_id=user_id))

        # Validate and format start_date
        try:
            start_date = f"{start_date} {datetime.strftime(datetime.now(), '%Y-%m-%d %H:%M')}"
            end_date = f"{end_date} {datetime.strftime(datetime.now(), '%Y-%m-%d %H:%M')}"
        except ValueError:
            flash("Invalid date format. Please use YYYY-MM-DD.", "danger")
            return redirect(url_for('view_announcement',user_id=user_id))
        
        try:
            with db.get_cursor() as cursor:
                cursor.execute('''
                        INSERT INTO announcements (user_id, title, content, start_date, end_date, created_at,updated_at)
                        VALUES (%s, %s, %s, %s, %s,now(),now());
                    ''', (user_id, title, content, start_date, end_date,))
                a_id=cursor.lastrowid
                db.close_db()

            flash("Announcements added successfully!", "dark")
        except Exception as e:
            flash(f"An error({e}) occurred while adding the announcement. Please try again.", "danger")
        
    return redirect(url_for('view_announcement',user_id=user_id))
    


@app.route('/announcement/edit', methods=['GET', 'POST'])
def edit_announcement():

    #params: user_id, title, content, start_date, end_date
    # Ensure the user is logged in; redirect to login page if not
    if 'loggedin' not in session:
        return redirect(url_for('login'))
    
    user_id = session.get("user_id")
    if not user_id:
        flash("Session expired. Please log in again.", "danger")
        return redirect(url_for('login'))
    
    start = request.form.get('start')
    start_tag = request.form.get("start_tag")
    
    if request.method == 'POST':

        # Retrieve form data
        a_id = request.form.get("a_id", "").strip()
        title = request.form.get("title", "").strip()
        content = request.form.get("content", "").strip()
        start_date = request.form.get("start_date", "").strip()
        end_date = request.form.get("end_date", "private").strip()  

        # Validate title
        if not title or len(title) > 100:
            flash("Title is required and must be ≤ 100 characters", "danger")
            return redirect(url_for('view_announcement',user_id=user_id))

        # Validate and format start_date
        try:
            start_date = f"{start_date} {datetime.strftime(datetime.now(), '%H:%M')}"
            end_date = f"{end_date} {datetime.strftime(datetime.now(), '%H:%M')}"
        except ValueError:
            flash("Invalid date format. Please use YYYY-MM-DD.", "danger")
            return redirect(url_for('view_announcement',user_id=user_id))
        
        try:
            with db.get_cursor() as cursor:
                cursor.execute('''
                        UPDATE announcements SET user_id = %s, title = %s, content = %s, start_date = %s, end_date = %s, updated_at = now())
                        where a_id = %s;
                    ''', (user_id, title, content, start_date, end_date, a_id))
                db.close_db()
               
            flash("Announcements updated successfully!", "dark")
        except Exception as e:
            flash(f"An error({e}) occurred while updating the announcement. Please try again.", "danger")
    
    return redirect(url_for('view_announcement', start=start, start_tag=start_tag))


   
@app.route('/announcement/delete')
def delete_announcement():
    #params: user_id, title, content, start_date, end_date
    # Ensure the user is logged in; redirect to login page if not
    if 'loggedin' not in session:
        return redirect(url_for('login'))
    
    start = request.args.get('start')
    start_tag = request.args.get("start_tag")
    
    user_id = session.get("user_id")
    if not user_id:
        flash("Session expired. Please log in again.", "danger")
        return redirect(url_for('login'))
    
    a_id = request.args.get("a_id", "").strip()

    try:
        with db.get_cursor() as cursor:
            cursor.execute('''
                           DELETE FROM announcements WHERE a_id = %s;
                ''', (a_id,))
            db.close_db()

        flash("Announcements deleted successfully!", "dark")
    except Exception as e:
        flash(f"An error({e}) occurred while deleting the announcement. Please try again.", "danger")
    
    return redirect(url_for('view_announcement', start=start, start_tag=start_tag))

@app.route('/announcement/mark_read')
def mark_read():
    start = request.args.get('start')
    start_tag = request.args.get("start_tag")
    
    user_id = session.get("user_id")
    if not user_id:
        flash("Session expired. Please log in again.", "danger")
        return redirect(url_for('login'))
    
    a_id = request.args.get("a_id", "").strip()

    try:
        with db.get_cursor() as cursor:
            cursor.execute('''SELECT * FROM announcements WHERE a_id = %s;''',(a_id,))
            announcement=cursor.fetchone()
            if announcement :
                cursor.execute('''
                            INSERT INTO user_read_announcements(user_id,a_id, a_created_at, created_at)VALUES(%s,%s,%s,now());
                    ''', (user_id,a_id,announcement['created_at'],))
            db.close_db()

    except Exception as e:
        flash(f"An error({e}) occurred while reading the announcement. Please try again.", "danger")
    
    return redirect(url_for('view_announcement', start=start, start_tag=start_tag))

@app.route('/announcement/mark_read_all')
def mark_read_all():
    start = request.args.get('start')
    start_tag = request.args.get("start_tag")
    
    user_id = session.get("user_id")
    if not user_id:
        flash("Session expired. Please log in again.", "danger")
        return redirect(url_for('login'))
    
    announcement_list, _= get_announcement(user_id, None)
    
    try:
        with db.get_cursor() as cursor:

            for a in announcement_list:
                cursor.execute('''
                        DELETE FROM user_read_announcements where a_id = %s;
                ''', (a['a_id'],))

                cursor.execute('''
                            INSERT INTO user_read_announcements(user_id,a_id,a_created_at,created_at)VALUES(%s,%s,%s,now());
                    ''', (user_id,a['a_id'],a['created_at'],))
            db.close_db()

    except Exception as e:
        flash(f"An error({e}) occurred while reading all the announcement. Please try again.", "danger")
    
    return redirect(url_for('view_announcement', start=start, start_tag=start_tag))

@app.route('/announcement/mark_unread')
def mark_unread():
    start = request.args.get('start')
    start_tag = request.args.get("start_tag")
    
    user_id = session.get("user_id")
    if not user_id:
        flash("Session expired. Please log in again.", "danger")
        return redirect(url_for('login'))
    
    a_id = request.args.get("a_id", "").strip()

    try:
        with db.get_cursor() as cursor:
            
            cursor.execute('''
                           DELETE FROM user_read_announcements where user_id=%s and a_id = %s;
                ''', (user_id,a_id,))
            db.close_db()

    except Exception as e:
        flash(f"An error({e}) occurred while unreading the announcement. Please try again.", "danger")
    
    return redirect(url_for('view_announcement', start=start, start_tag=start_tag))

@app.route('/announcement/mark_unread_all')
def mark_unread_all():
    start = request.args.get('start')
    start_tag = request.args.get("start_tag")
    
    user_id = session.get("user_id")
    if not user_id:
        flash("Session expired. Please log in again.", "danger")
        return redirect(url_for('login'))
    
    try:
        with db.get_cursor() as cursor:
            
            cursor.execute('''
                        DELETE FROM user_read_announcements where user_id = %s;
                ''', (user_id,))
            db.close_db()

    except Exception as e:
        flash(f"An error({e}) occurred while unreading all the announcement. Please try again.", "danger")
    
    return redirect(url_for('view_announcement', start=start, start_tag=start_tag))

def get_announcement(userId, start=None):

    announcements={}
    totalAmount={}
    if start is not None:
        pageLimit=PAGE_LIMIT
    else:
        start=0
        pageLimit=PAGE_LIMIT*10
    with db.get_cursor() as cursor:

        cursor.execute(f'''SELECT a.*, 
                    ul.last_login,
                    CASE 
                        WHEN ua.a_id IS NULL 
                                AND  (a.created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) 
                                    OR 
                                    a.created_at > COALESCE((select last_login from user_login_info where user_id=%s), '1900-01-01'))
                        THEN 'new'
                        ELSE NULL
                    END as tag
                    FROM announcements a                         
                    LEFT JOIN user_read_announcements ua ON a.a_id = ua.a_id AND ua.user_id = %s                          
                    LEFT JOIN user_login_info ul ON ua.user_id = ul.user_id                         
                    ORDER BY a.created_at DESC limit %s,{pageLimit};''',
                       (userId,userId,int(start),))
        announcements = cursor.fetchall()

        cursor.execute(f'''SELECT count(a.a_id) as c 
                    FROM announcements a                         
                    LEFT JOIN user_read_announcements ua ON a.a_id = ua.a_id AND ua.user_id = %s                          
                    LEFT JOIN user_login_info ul ON ua.user_id = ul.user_id;''',
                       (userId,))
        totalAmount=cursor.fetchone()
        if totalAmount is None:
            totalAmount['c']=0

    return announcements,totalAmount['c']

def update_user_login_info(user_id):
    clear_user_read_announcements(user_id)
    update_login_info(user_id)

def clear_user_read_announcements(user_id):
    with db.get_cursor() as cursor:
            
            cursor.execute('''
                        DELETE FROM user_read_announcements where user_id = %s
                           AND a_created_at < DATE_SUB(CURDATE(), INTERVAL 7 DAY);
                ''', (user_id,))
            db.close_db()

def update_login_info(user_id):
    with db.get_cursor() as cursor:
            
            cursor.execute('''
                        SELECT * FROM user_login_info where user_id = %s;
                ''', (user_id,))
            loginInfo = cursor.fetchone()

            if loginInfo:
            
                cursor.execute('''
                            UPDATE user_login_info set last_login = current_login where user_id = %s;
                    ''', (user_id,))
                
                cursor.execute('''
                            UPDATE user_login_info set current_login = now() where user_id = %s;
                    ''', (user_id,))
                
            else:

                cursor.execute('''
                            INSERT INTO user_login_info(user_id,current_login) VALUES (%s,now());
                    ''', (user_id,))
            

            
            db.close_db()


# default paging params
PAGE_LIMIT = 10

def formatstart(start, start_tag):
    # build paging params

    if start == None or start == "" or int(start) < 0:
        start = 0
    else:
        start = int(start)

    if start_tag == "last":
        start = int(start)
        start -= PAGE_LIMIT
        if start <= 0:
            start = 0
    elif start_tag == "next":
        start = int(start)
        start += PAGE_LIMIT
    return start

def getpagination(start, amount, limit):
    # build paging params

    last_start = start-limit
    if last_start < 0:
        last_start = -1

    next_start = start+limit
    if next_start >= amount:
        next_start = -1

    return last_start, next_start