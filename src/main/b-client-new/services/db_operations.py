"""
Database Operations Service
Handles all database CRUD operations for B-Client
"""
from datetime import datetime
import json
import time


def save_cookie_to_db(db, UserCookie, user_id, username, raw_session_cookie, node_id, auto_refresh, nsn_user_id=None, nsn_username=None):
    """Save preprocessed session cookie to user_cookies table"""
    try:
        print(f"💾 B-Client: ===== SAVING COOKIE TO DATABASE =====")
        print(f"💾 B-Client: User ID: {user_id}")
        print(f"💾 B-Client: Username: {username}")
        print(f"💾 B-Client: Node ID: {node_id}")
        print(f"💾 B-Client: Auto refresh: {auto_refresh}")
        print(f"💾 B-Client: NSN User ID: {nsn_user_id}")
        print(f"💾 B-Client: NSN Username: {nsn_username}")
        print(f"💾 B-Client: Raw session cookie length: {len(raw_session_cookie) if raw_session_cookie else 0}")
        print(f"💾 B-Client: Raw session cookie preview: {raw_session_cookie[:100] if raw_session_cookie else 'None'}...")
        
        # 预处理 session 数据为 JSON 格式
        print(f"💾 B-Client: ===== PREPROCESSING SESSION DATA =====")
        session_data_json = {
            'loggedin': True,
            'user_id': nsn_user_id or user_id,  # Use NMP user_id as fallback
            'username': nsn_username or username,  # Use NMP username as fallback
            'role': 'traveller',
            'nmp_user_id': user_id,
            'nmp_username': username,
            'nmp_client_type': 'c-client',
            'nmp_timestamp': str(int(time.time() * 1000))
        }
        
        # 编码为 JSON 字符串
        processed_cookie = json.dumps(session_data_json)
        print(f"💾 B-Client: Preprocessed session data: {processed_cookie}")
        print(f"💾 B-Client: Preprocessed cookie length: {len(processed_cookie)}")
        
        # 删除现有记录
        print(f"💾 B-Client: Deleting existing cookie records...")
        deleted_count = UserCookie.query.filter_by(user_id=user_id, username=username).delete()
        print(f"💾 B-Client: Deleted {deleted_count} existing cookie records")
        
        # 创建新记录（保存预处理后的 JSON 字符串）
        print(f"💾 B-Client: Creating new cookie record with preprocessed data...")
        user_cookie = UserCookie(
            user_id=user_id,
            username=username,
            node_id=node_id,
            cookie=processed_cookie,  # 保存预处理后的 JSON 字符串
            auto_refresh=auto_refresh,
            refresh_time=datetime.utcnow()
        )
        print(f"💾 B-Client: Cookie record created: {user_cookie}")
        
        print(f"💾 B-Client: Adding cookie record to session...")
        db.session.add(user_cookie)
        
        print(f"💾 B-Client: Committing transaction...")
        db.session.commit()
        print(f"✅ B-Client: Cookie saved to database successfully for user {user_id}")
        print(f"💾 B-Client: ===== END SAVING COOKIE TO DATABASE =====")
        
    except Exception as e:
        print(f"❌ B-Client: Failed to save cookie to database: {e}")
        print(f"💾 B-Client: Rolling back transaction...")
        db.session.rollback()
        import traceback
        traceback.print_exc()
        raise e


def save_account_to_db(db, UserAccount, user_id, username, account, password, account_data):
    """Save account information to user_accounts table"""
    try:
        print(f"💾 B-Client: ===== SAVING ACCOUNT TO DATABASE =====")
        print(f"💾 B-Client: User ID: {user_id}")
        print(f"💾 B-Client: Username: {username}")
        print(f"💾 B-Client: Account: {account}")
        print(f"💾 B-Client: Password length: {len(password) if password else 0}")
        print(f"💾 B-Client: Account data: {account_data}")
        
        # 删除现有记录
        print(f"💾 B-Client: Deleting existing account records...")
        deleted_count = UserAccount.query.filter_by(
            user_id=user_id, 
            username=username, 
            website='nsn'
        ).delete()
        print(f"💾 B-Client: Deleted {deleted_count} existing account records")
        
        # 创建新记录
        print(f"💾 B-Client: Creating new account record...")
        user_account = UserAccount(
            user_id=user_id,
            username=username,
            website='nsn',
            account=account,
            password=password,
            email=account_data.get('email'),
            first_name=account_data.get('first_name'),
            last_name=account_data.get('last_name'),
            location=account_data.get('location'),
            registration_method='nmp_auto',
            auto_generated=True,
            logout=False  # Reset logout status for new registration
        )
        print(f"💾 B-Client: Account record created: {user_account}")
        
        print(f"💾 B-Client: Adding account record to session...")
        db.session.add(user_account)
        
        print(f"💾 B-Client: Committing transaction...")
        db.session.commit()
        print(f"✅ B-Client: Account saved to database successfully for user {user_id}")
        print(f"💾 B-Client: ===== END SAVING ACCOUNT TO DATABASE =====")
        
    except Exception as e:
        print(f"❌ B-Client: Failed to save account to database: {e}")
        print(f"💾 B-Client: Rolling back transaction...")
        db.session.rollback()
        import traceback
        traceback.print_exc()
        raise e

