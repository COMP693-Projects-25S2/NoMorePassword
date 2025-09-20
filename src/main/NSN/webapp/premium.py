from webapp import app
from webapp import db
from flask import redirect, render_template, request, session, url_for, flash,Response
from datetime import datetime, timedelta

@app.route('/premium/list')
def list_premium():
    if 'loggedin' not in session:
        return redirect(url_for('login'))
     
    subscriptions=[]
    sList=queryNonFreeSubscriptions()
    for s in sList:
        subscriptions.append(s)

    trail = getTrailHistory(session['user_id'])


    return render_template('premium_price.html',subscriptions=subscriptions,trail=trail)

@app.route('/premium/trail')
def trail_premium():
    if 'loggedin' not in session:
        return redirect(url_for('login'))
    
    userId=session['user_id']

    subscription=querySubcriptionByName('Free Trial')
    saveSubscriptionHistory(userId,subscription['s_id'],None,0,0,0,'Trail')

    start=0
    start_tag='next'
    memberInfo=querySubscriptionStatus(userId)
    historyList,amount=querySubscriptionHistory(userId,start)

    # get start number by start tag
    last_start, next_start = getpagination(start, amount, PAGE_LIMIT)

    return render_template('premium_history.html',memberInfo=memberInfo,historyList=historyList, start=start, last_start=last_start, next_start=next_start)

@app.route('/premium/gift')
def gift_premium():
    if 'loggedin' not in session:
        return redirect(url_for('login'))
    
    userId=request.args.get('user_id')
    giftName=request.args.get('gift_name')

    subscription=querySubcriptionByName(giftName)

    saveSubscriptionHistory(userId,subscription['s_id'],None,0,0,0,'Gift')

    start=0
    start_tag='next'
    memberInfo=querySubscriptionStatus(userId)
    historyList,amount=querySubscriptionHistory(userId,start)

    # get start number by start tag
    last_start, next_start = getpagination(start, amount, PAGE_LIMIT)

    return render_template('premium_history.html',memberInfo=memberInfo,historyList=historyList, start=start, last_start=last_start, next_start=next_start)



@app.route('/premium/purchase/preview', methods=['GET', 'POST'])
def preview_purchase_premium():
    if 'loggedin' not in session:
        return redirect(url_for('login'))
    
    s_id=request.form.get('subscription_id')
    country=request.form.get('country')
    countryTax=0
    subscription=None
    if s_id is not None :
        if country is not None:
            subscription=querySubscriptionByIdAndCountry(s_id,country)
            countryTax=queryCountryTax(country)
        else:
            subscription=querySubscriptionById(s_id)

    memberInfo=querySubscriptionStatus(session['user_id'])
    countryList=queryCountryWithTax()
    
    
    return render_template('premium_purchase.html',chosenCountry=country,countryList=countryList,countryTax=countryTax,memberInfo=memberInfo,subscription=subscription)

@app.route('/premium/purchase/payway', methods=['GET', 'POST'])
def payway_purchase_premium():
    if 'loggedin' not in session:
        return redirect(url_for('login'))
    
    userId=request.form.get('user_id')
    s_id=request.form.get('subscription_id')
    c_id=request.form.get('country_id')
    price=request.form.get('price')
    gst=request.form.get('gst_rate')
    total_amount=request.form.get('total_amount')

    if s_id=='1':
        return redirect(url_for('confirm_purchase_premium',user_id=userId,subscription_id=s_id,country_id=c_id,price=price,gst_rate=gst,total_amount=total_amount))
    else:
        return render_template('premium_payway.html',user_id=userId,subscription_id=s_id,country_id=c_id,price=price,gst_rate=gst,total_amount=total_amount)



@app.route('/premium/purchase/confirm', methods=['GET', 'POST'])
def confirm_purchase_premium():
    if 'loggedin' not in session:
        return redirect(url_for('login'))
    
    
    userId=request.form.get('user_id')
    if userId is None:
        userId=request.args.get('user_id')
    s_id=request.form.get('subscription_id')
    if s_id is None:
        s_id=request.args.get('subscription_id')
    c_id=request.form.get('country_id')
    if c_id is None:
        c_id=request.args.get('country_id')
    price=request.form.get('price')
    if price is None:
        price=request.args.get('price')
    gst=request.form.get('gst_rate')
    if gst is None:
        gst=request.args.get('gst_rate')
    totalAmount=request.form.get('total_amount')
    if totalAmount is None:
        totalAmount=request.args.get('total_amount')
    payment=request.form.get('payment')
    if payment is None:
        payment=request.args.get('payment')
        if s_id=='1':
            payment='Free'
        else:
            payment="Unknown"

    saveSubscriptionHistory(userId,s_id,c_id,price,gst,totalAmount,payment)

    start=0
    start_tag='next'
    memberInfo=querySubscriptionStatus(userId)
    historyList,amount=querySubscriptionHistory(userId,start)

    # get start number by start tag
    last_start, next_start = getpagination(start, amount, PAGE_LIMIT)

    return render_template('premium_history.html',memberInfo=memberInfo,historyList=historyList, start=start, last_start=last_start, next_start=next_start)


@app.route('/premium/history', methods=['GET', 'POST'])
def premium_history():
    if 'loggedin' not in session:
        return redirect(url_for('login'))
    
    start = request.form.get('start')
    start_tag = request.form.get("start_tag")
    
    userId = request.form.get("user_id")
    if userId is None:
        userId = request.args.get("user_id")
        
    memberInfo=querySubscriptionStatus(userId)
    if memberInfo is None:
        memberInfo={}

    if start is None:
        start=0
    if start_tag is None:
        start_tag='next'

    if start!=0:
        start = formatstart(int(start), start_tag)
    
    historyList,amount=querySubscriptionHistory(userId,start)

    # get start number by start tag
    last_start, next_start = getpagination(int(start), amount, PAGE_LIMIT)
    
    

    return render_template('premium_history.html',memberInfo=memberInfo,historyList=historyList, start=start, last_start=last_start, next_start=next_start)

# message ignore
@app.route('/premium/message/ignore')
def ignore_premium_message():
    ignore = request.args.get("message_ingore")
    if ignore:
        with db.get_cursor() as cursor:
            cursor.execute('''update members set note_ignore=1 where user_id=%s;
                           ''',(session['user_id'],)
                       )
    return redirect(request.referrer)


# formatDecimal
def formatDecimal(num):
    return f"{num:.2f}"

# query country with tax
def queryCountryWithTax():
    with db.get_cursor() as cursor:
        cursor.execute('''SELECT * 
                       FROM country_tax;''',
                       )
        countries = cursor.fetchall()

    return countries

# query non-free subscriptions
def queryNonFreeSubscriptions():
    with db.get_cursor() as cursor:
        cursor.execute('''SELECT * 
                       FROM subscriptions
                       WHERE base_price > 0;''',
                       )
        subscriptions = cursor.fetchall()
        for s in subscriptions:
            basePrice=float(s['base_price'])
            rate=(1-s['discount']/100)
            s['price']=formatDecimal(basePrice*rate)
         
    return subscriptions

# query subcription by name
def querySubcriptionByName(name):
    with db.get_cursor() as cursor:
        cursor.execute('''SELECT * 
                       FROM subscriptions
                       WHERE s_name =%s;''',
                       (name,))
        subscription = cursor.fetchone()

        basePrice=float(subscription['base_price'])
        rate=1-float(subscription['discount']/100)
        subscription['price']=formatDecimal(basePrice*rate)

    return subscription

# query free subscriptions
def queryFreeSubscriptions():
    with db.get_cursor() as cursor:
        cursor.execute('''SELECT * 
                       FROM subscriptions
                       WHERE base_price <= 0;''',
                       )
        subscriptions = cursor.fetchall()

    return subscriptions

# query country tax by user
def queryCountryTax(country):
    with db.get_cursor() as cursor:
        cursor.execute('''SELECT * 
                       FROM country_tax
                       WHERE country = %s;''',
                       (country,))
        countryTax = cursor.fetchone()

    return countryTax


MESSAGE_FOR_7_DAYS='Your premium will be expired in 7 days!'
MESSAGE_FOR_2_DAYS='Your premium will be expired in 2 days!'
MESSAGE_FOR_EXPIRED='Your premium has been expired!'

# query subscription status
def querySubscriptionStatus(userId):

    checkExpiry(userId)

    with db.get_cursor() as cursor:
        cursor.execute('''SELECT m.*, s.* ,u.*
                       FROM users u
                       left join members m on u.user_id=m.user_id
                       left join subscription_history h on h.m_id=m.m_id
                       left join subscriptions s on h.s_id=s.s_id
                       WHERE u.user_id = %s;''',
                       (userId,))
        memberInfo = cursor.fetchone()
                
    return memberInfo

def checkExpiry(userId):

    with db.get_cursor() as cursor:
        cursor.execute('''SELECT *
                       FROM members
                       WHERE user_id = %s;''',
                       (userId,))
        memberInfo = cursor.fetchone()

        if memberInfo:
            today=datetime.now()
            expiredDate=memberInfo.get('end_time')
            current_note_msg = memberInfo.get('note_msg', '') # Get note_msg safely, default to empty string
            
            if expiredDate and current_note_msg != MESSAGE_FOR_EXPIRED and today>=expiredDate: 
                cursor.execute('''UPDATE members set note_msg=%s,note_ignore=0
                        WHERE user_id = %s;''',
                        (MESSAGE_FOR_EXPIRED,userId,))
                    
            elif expiredDate and current_note_msg != MESSAGE_FOR_EXPIRED and current_note_msg != MESSAGE_FOR_2_DAYS and (today+timedelta(days=2))>=expiredDate: 
                cursor.execute('''UPDATE members set note_msg=%s,note_ignore=0
                        WHERE user_id = %s;''',
                        (MESSAGE_FOR_2_DAYS,userId,))
                    
            elif expiredDate and current_note_msg != MESSAGE_FOR_EXPIRED and current_note_msg != MESSAGE_FOR_2_DAYS and current_note_msg != MESSAGE_FOR_7_DAYS and (today+timedelta(days=7))>=expiredDate: 
                cursor.execute('''UPDATE members set note_msg=%s,note_ignore=0
                        WHERE user_id = %s;''',
                        (MESSAGE_FOR_7_DAYS,userId,))
                
            elif expiredDate and (today+timedelta(days=7))<expiredDate and current_note_msg != '':
                cursor.execute('''UPDATE members set note_msg=%s,note_ignore=0
                        WHERE user_id = %s;''',
                        ("",userId,))


# get trail history by userId
def getTrailHistory(userId):
    with db.get_cursor() as cursor:
        cursor.execute(f'''SELECT h.* 
                       FROM members m
                       inner join subscription_history h on h.m_id=m.m_id
                       inner join subscriptions s on h.s_id=s.s_id
                       WHERE m.user_id = %s and s.s_name=%s;''',
                       (userId,'Free Trial',))
        trail = cursor.fetchone()
        
    return trail
    

# query subscription history by userId
def querySubscriptionHistory(userId,start):
    with db.get_cursor() as cursor:
        cursor.execute(f'''SELECT m.*,h.*,s.*,c.*,u.*
                       FROM members m
                       inner join subscription_history h on h.m_id=m.m_id
                       inner join subscriptions s on h.s_id=s.s_id
                       left join country_tax c on h.c_id=c.c_id
                       inner join users u on u.user_id=m.user_id
                       WHERE m.user_id = %s ORDER BY h.h_id DESC limit %s,{PAGE_LIMIT};''',
                       (userId,int(start),))
        historyList = cursor.fetchall()

        cursor.execute(f'''SELECT count(*) as c
                       FROM subscription_history h
                       inner join members m on h.m_id=m.m_id
                       WHERE m.user_id = %s;''',
                       (userId,))
        totalAmount=cursor.fetchone()

    return historyList,totalAmount['c']

# query subscription by id
def querySubscriptionById(subscriptionId):
    with db.get_cursor() as cursor:
        cursor.execute('''SELECT * 
                       FROM subscriptions
                       WHERE s_id = %s;''',
                       (subscriptionId,))
        subscription = cursor.fetchone()

        basePrice=float(subscription['base_price'])
        rate=1-float(subscription['discount']/100)
        subscription['price']=formatDecimal(basePrice*rate)
        subscription['GST_Price']=formatDecimal(basePrice*rate)

    return subscription


# query subscription by id and country
def querySubscriptionByIdAndCountry(subscriptionId, country):
    with db.get_cursor() as cursor:
        cursor.execute('''SELECT * 
                       FROM subscriptions
                       WHERE s_id = %s;''',
                       (subscriptionId,))
        subscription = cursor.fetchone()

        basePrice=float(subscription['base_price'])
        rate=1-float(subscription['discount']/100)
        subscription['price']=formatDecimal(basePrice*rate)
        subscription['GST_Price']=formatDecimal(basePrice*rate)

        if country!=None:
            cursor.execute('''SELECT * 
                        FROM country_tax
                        WHERE country = %s;''',
                        (country,))
            countryTax=cursor.fetchone()
            if countryTax!=None:
                    
                    basePrice=float(subscription['base_price'])
                    rate=1-float(subscription['discount']/100)
                    tax=1+countryTax['rate']/100
                    subscription['GST_Price']=formatDecimal(basePrice*rate*tax)
        
    return subscription

# save subscription history
def saveSubscriptionHistory(userId, subscriptionId,countryId,price,gst_rate,totalAmount,payment):
    with db.get_cursor() as cursor:

        # get subscription
        cursor.execute('''SELECT * 
                       FROM subscriptions
                       WHERE s_id = %s;''',
                       (subscriptionId,))
        subscription = cursor.fetchone()

        member_id=None
        startTime=datetime.now()
        endTime=datetime.now()

        # check member status
        cursor.execute('''SELECT *
                       FROM  members 
                       WHERE user_id = %s;''',
                       (userId,))
        member=cursor.fetchone()
        if member is None:
            endTime=startTime+timedelta(days=subscription['period'])

            cursor.execute('''INSERT INTO members (user_id,m_status,end_time)values(%s,'subscribed',%s);''',
                       (userId,endTime,))
            member_id=cursor.lastrowid
        else:
            member_id=member['m_id']
            if member['end_time']>startTime:
                startTime=member['end_time']
            endTime=startTime+timedelta(days=subscription['period'])
            cursor.execute('''UPDATE members set m_status='subscribed', end_time=%s
                           WHERE user_id=%s;''',
                       (endTime,userId,))
            
        if countryId=='':
            countryId=None
        if gst_rate=="":
            gst_rate=0
        if totalAmount=='':
            totalAmount=0
        
        cursor.execute('''INSERT INTO subscription_history (m_id,s_id,c_id,price,gst_rate,total_amount,payment,start_time,end_time,create_time)
                       values(%s,%s,%s,%s,%s,%s,%s,%s,%s,now());''',
                       (member_id,subscriptionId,countryId,price,gst_rate,totalAmount,payment,startTime,endTime,))
        historyId=cursor.lastrowid
        transactionId=f'INV-{datetime.today().date()}-{historyId}'
        cursor.execute('''UPDATE subscription_history set transaction_id=%s where h_id=%s;''',
                       (transactionId,historyId,))

        historyInfo=querySubscriptionHistoryById(historyId)

        return historyInfo
            


# query subscription history by id
def querySubscriptionHistoryById(historyId):
    with db.get_cursor() as cursor:
        cursor.execute('''SELECT m.*,s.*,h.*,c.*,u.*
                       FROM subscription_history h
                       inner join members m on h.m_id=m.m_id
                       inner join subscriptions s on h.s_id=s.s_id
                       left join country_tax c on h.c_id=c.c_id
                       inner join users u on u.user_id=m.user_id
                       WHERE h.h_id = %s;''',
                       (historyId,))
        historyInfo = cursor.fetchone()

    return historyInfo


# query is_member
def checkMember(userId):
    with db.get_cursor() as cursor:
        queryMember = '''
                    select user_id from users u where (u.role='admin' or u.role='editor' or u.role='moderator' or u.role='support_tech') and u.user_id=%s
                    union
                    select user_id from members m where m.user_id=%s and m.m_status !='expired';
                    '''
        cursor.execute(queryMember, (userId,userId,))
        is_member=cursor.fetchone()

        if is_member:
            memberInfo=querySubscriptionStatus(userId)

            if  memberInfo['end_time']:
                if memberInfo['s_id']==1:
                    is_member['s_name']="Free Trail"
                elif memberInfo['m_status']=='expired':
                    is_member['s_name']="Premium Expired"
                else:
                    is_member['s_name']="Premium"
                is_member['end_time']=memberInfo['end_time'].date()

            cursor.execute('''
                           select user_id from users u where (u.role='admin' or u.role='editor' or u.role='moderator' or u.role='support_tech') and u.user_id=%s
                           ''', (userId,))
            is_admin=cursor.fetchone()
            if is_admin:
                is_member['s_name']="Full Access"
                is_member['end_time']=None

            # message and ignore
            is_member['note_msg']=''
            is_member['note_ignore']=0
            if 'note_msg' in memberInfo:
                is_member['note_msg']=memberInfo['note_msg']
                is_member['note_ignore']=memberInfo['note_ignore']

    return is_member


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