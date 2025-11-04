from flask import Flask, request, jsonify
from flask_cors import CORS
from supabase import create_client, Client
from dotenv import load_dotenv # Keep the import for os.environ access
import os
from datetime import datetime, timedelta
import json


# ----------------- 1. Configuration & Initialization (MODIFIED) -----------------

# load_dotenv() # <--- COMMENTED OUT: We MUST rely on Render's Environment Variables

app = Flask(__name__)
CORS(app) 

# Initialize Supabase Client (Ensure Render environment variables are correctly set)
url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")

# CRITICAL CHECK: Raise an error if keys are missing (This triggers the 'Application exited early' error)
if not url or not key:
    # This is the line that caused the deployment failure—it's necessary to crash early 
    # if the keys aren't found in the server environment.
    raise EnvironmentError("FATAL: Supabase credentials (URL/KEY) not found in server environment variables. Check Render settings.")


try:
    supabase: Client = create_client(url, key)
except Exception as e:
    raise RuntimeError(f"FATAL: Could not initialize Supabase client. Error: {e}")


# --- Utility Function for Token Validation and Role Retrieval (NO CHANGES HERE) ---
def get_user_id_and_role(auth_header):
    """Simulates checking a user's JWT token and retrieving their role."""
    if not auth_header or 'Bearer' not in auth_header:
        return None, None
    
    token = auth_header.split(" ")[1]
    
    # Mock UUIDs (Must match your UUIDs used in the 'profiles' table)
    MOCK_ADMIN_UUID = '152b744f-2205-4b1f-ae44-5d38419167e1'
    MOCK_POLICY_UUID = 'a021c389-dd68-40e7-86e8-6ad9493e29a6'
    MOCK_AUDITOR_UUID = '579a1cb3-e196-41b5-a963-803af0a9a8d2'
    
    if 'ADMIN' in token:
        return MOCK_ADMIN_UUID, 'admin'
    elif 'POLICY' in token:
        return MOCK_POLICY_UUID, 'policy_officer'
    elif 'AUDITOR' in token:
        return MOCK_AUDITOR_UUID, 'auditor'
    else:
        return None, None

# ----------------- 2. Core CRUD & Search Endpoints (NO CHANGES HERE) -----------------

# GET /api/treaties - Get All Treaties (List View with Search/Filter)
@app.route('/api/treaties', methods=['GET'])
def get_treaties():
    auth_header = request.headers.get('Authorization')
    user_id, user_role = get_user_id_and_role(auth_header)
    # ... (rest of the function is unchanged)
    
    if not user_id:
         return jsonify({"error": "Unauthorized"}), 401

    try:
        # Start with a base query (only fetch active treaties for list view)
        query = supabase.table('treaties').select('*').eq('is_active', True)
        # ... (rest of search/filter logic is unchanged)
        
        search_term = request.args.get('term') 
        status_filter = request.args.get('status') 
        category_filter = request.args.get('category') 
        
        if status_filter:
            query = query.eq('current_status', status_filter)
            
        if category_filter:
            query = query.eq('category', category_filter)
            
        if search_term:
            # 1. Search the title column using ILIKE (Standard text search)
            title_search = f'title.ilike.%{search_term}%'
            
            # 2. Search the signatory_countries array using 'cs' (array contains string)
            # The 'cs' operator is the correct way to query for a string inside a TEXT[] array.
            country_search = f'signatory_countries.cs.{{{search_term}}}'

            # 3. Combine both searches using the OR operator
            query = query.or_(title_search, country_search)
            
        response = query.execute()
        
        return jsonify(response.data), 200
        
    except Exception as e:
        print(f"Error executing search query: {e}")
        return jsonify({"error": str(e)}), 500

# GET /api/treaties/<id> - Get Single Treaty Detail
@app.route('/api/treaties/<int:treaty_id>', methods=['GET'])
def get_treaty_by_id(treaty_id):
    auth_header = request.headers.get('Authorization')
    user_id, user_role = get_user_id_and_role(auth_header)
    
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        response = supabase.table('treaties').select('*').eq('id', treaty_id).single().execute()
        
        if not response.data:
            return jsonify({"error": "Treaty not found."}), 404
            
        return jsonify(response.data), 200
        
    except Exception as e:
        return jsonify({"error": "Treaty not found or database error."}), 404

# POST /api/treaties - Create New Treaty
@app.route('/api/treaties', methods=['POST'])
def create_treaty():
    auth_header = request.headers.get('Authorization')
    user_id, user_role = get_user_id_and_role(auth_header)
    data = request.json

    if user_role != 'admin':
        return jsonify({"error": "Forbidden: Must be Admin to create treaties"}), 403

    try:
        insert_response = supabase.table('treaties').insert({
            **data, 
            'admin_id': user_id
        }).execute()
        
        new_treaty_id = insert_response.data[0]['id']
        
        supabase.table('audit_logs').insert({
            'treaty_id': new_treaty_id,
            'user_id': user_id,
            'action': 'CREATE',
            'details': {'new_data': data} 
        }).execute()
        
        return jsonify(insert_response.data[0]), 201

    except Exception as e:
        print(f"Error during treaty creation: {e}")
        return jsonify({"error": str(e)}), 500

# DELETE /api/treaties/<id> - Logical Deletion (Archive)
@app.route('/api/treaties/<int:treaty_id>', methods=['DELETE'])
def delete_treaty(treaty_id):
    auth_header = request.headers.get('Authorization')
    user_id, user_role = get_user_id_and_role(auth_header)

    if user_role != 'admin':
        return jsonify({"error": "Forbidden: Must be Admin to delete treaties"}), 403

    try:
        supabase.table('audit_logs').insert({
            'treaty_id': treaty_id,
            'user_id': user_id,
            'action': 'ARCHIVE',
            'details': {'message': 'Record logically deleted (is_active=FALSE) and status set to Archived'}
        }).execute()
        
        supabase.table('treaties').update({
            'is_active': False,
            'current_status': 'Archived'
        }).eq('id', treaty_id).execute()

        return jsonify({"message": f"Treaty ID {treaty_id} successfully archived."}), 200

    except Exception as e:
        print(f"Error during treaty deletion: {e}")
        return jsonify({"error": "Failed to archive treaty."}), 500

# PUT /api/treaties/<id> - Update & Field-Level Audit
@app.route('/api/treaties/<int:treaty_id>', methods=['PUT'])
def update_treaty(treaty_id):
    auth_header = request.headers.get('Authorization')
    user_id, user_role = get_user_id_and_role(auth_header)
    new_data = request.json

    if user_role != 'admin':
        return jsonify({"error": "Forbidden: Must be Admin to update treaties"}), 403

    try:
        old_treaty_response = supabase.table('treaties').select('*').eq('id', treaty_id).single().execute()
        old_data = old_treaty_response.data
        
        changes_to_log = {}
        data_to_update_db = {}
        
        editable_keys = [
            'title', 'description', 'type', 'category', 'signatory_countries',
            'current_status', 'date_signed', 'effective_date', 'expiry_date'
        ]

        for key in editable_keys:
            new_value = new_data.get(key)
            old_value = old_data.get(key)
            
            if key in new_data and str(old_value) != str(new_value): 
                data_to_update_db[key] = new_value
                
                changes_to_log[key] = {
                    "old": old_value,
                    "new": new_value
                }

        if not data_to_update_db:
            return jsonify({"message": "No changes detected. Update aborted."}), 200

        # Note: update_response is needed for the return statement, fetch it
        update_response = supabase.table('treaties').update(data_to_update_db).eq('id', treaty_id).execute()

        supabase.table('audit_logs').insert({
            'treaty_id': treaty_id,
            'user_id': user_id,
            'action': 'UPDATE',
            'details': changes_to_log 
        }).execute()
        
        return jsonify({"message": "Treaty updated successfully.", "data": update_response.data[0]}), 200

    except Exception as e:
        print(f"Error during treaty update: {e}") 
        return jsonify({"error": "Failed to update treaty or log audit trail."}), 500

# ----------------- 3. Audit and Reporting Endpoints (NO CHANGES HERE) -----------------

# GET /api/treaties/<id>/audit_logs - Get Audit Logs
@app.route('/api/treaties/<int:treaty_id>/audit_logs', methods=['GET'])
def get_audit_logs(treaty_id):
    auth_header = request.headers.get('Authorization')
    user_id, user_role = get_user_id_and_role(auth_header)

    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    try:
        response = supabase.table('audit_logs') \
            .select('action, timestamp, details, user_id') \
            .eq('treaty_id', treaty_id) \
            .order('timestamp', desc=True) \
            .execute()
        
        return jsonify(response.data), 200

    except Exception as e:
        print(f"Error fetching audit logs: {e}")
        return jsonify({"error": "Failed to retrieve audit history."}), 500

# POST /api/notifications/check_expiry - Expiry Notification Simulation
@app.route('/api/notifications/check_expiry', methods=['POST'])
def check_expiry_notifications():
    auth_header = request.headers.get('Authorization')
    user_id, user_role = get_user_id_and_role(auth_header)
    
    if user_role != 'admin':
        return jsonify({"error": "Forbidden: Only Admin can trigger notification check"}), 403

    try:
        today = datetime.now().date()
        ninety_days_from_now = today + timedelta(days=90)
        
        response = supabase.table('treaties') \
            .select('id, title, expiry_date') \
            .gte('expiry_date', (today + timedelta(days=1)).isoformat()) \
            .lte('expiry_date', ninety_days_from_now.isoformat()) \
            .eq('is_active', True) \
            .execute()
            
        expiring_treaties = response.data
        
        notifications_sent = [{
            "treaty_id": t['id'],
            "title": t['title'],
            "message": f"ALERT: Treaty expiring on {t['expiry_date']} (within 90 days)."
        } for t in expiring_treaties]

        return jsonify({
            "message": "Expiry check complete.",
            "count": len(notifications_sent),
            "notifications": notifications_sent
        }), 200

    except Exception as e:
        print(f"Error checking expiry: {e}")
        return jsonify({"error": "Failed to run notification check."}), 500


# GET /api/reports/status_counts - Get Status Counts
@app.route('/api/reports/status_counts', methods=['GET'])
def get_status_counts():
    auth_header = request.headers.get('Authorization')
    user_id, user_role = get_user_id_and_role(auth_header)
    
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    try:
        response = supabase.table('treaties').select('current_status').eq('is_active', True).execute()
        
        status_data = {}
        for treaty in response.data:
            status = treaty.get('current_status', 'Unknown')
            status_data[status] = status_data.get(status, 0) + 1
            
        report = [{"status": k, "count": v} for k, v in status_data.items()]
        
        return jsonify(report), 200
    
    except Exception as e:
        print(f"Error fetching status counts: {e}")
        return jsonify({"error": "Failed to retrieve status report."}), 500


# GET /api/reports/expiring_soon - Get Treaties Expiring Soon
@app.route('/api/reports/expiring_soon', methods=['GET'])
def get_expiring_soon():
    auth_header = request.headers.get('Authorization')
    user_id, user_role = get_user_id_and_role(auth_header)
    
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    try:
        today = datetime.now().date()
        six_months_from_now = today + timedelta(days=180)
        
        response = supabase.table('treaties') \
            .select('id, title, expiry_date, current_status, signatory_countries') \
            .gte('expiry_date', (today + timedelta(days=1)).isoformat()) \
            .lte('expiry_date', six_months_from_now.isoformat()) \
            .eq('is_active', True) \
            .order('expiry_date', asc=True) \
            .execute()
            
        return jsonify(response.data), 200
    
    except Exception as e:
        print(f"Error fetching expiring treaties: {e}")
        return jsonify({"error": "Failed to retrieve expiry list."}), 500


# ----------------- 4. Run Application -----------------

if __name__ == '__main__':
    # Run the server
    app.run(debug=True, port=5000)
