import os
import cv2
import numpy as np
import base64
import json
import requests
from flask import Flask, request, render_template, jsonify, send_from_directory, abort
from werkzeug.utils import secure_filename
import firebase_admin
from firebase_admin import credentials, auth, firestore
from whitenoise import WhiteNoise

app = Flask(__name__, static_folder='static', template_folder='templates')
app.wsgi_app = WhiteNoise(app.wsgi_app, root='static/')

try:
    cred = credentials.Certificate('firebase-service-account.json')
    firebase_admin.initialize_app(cred)
    db = firestore.client()
except Exception as e:
    db = None

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', "")

def verify_firebase_token(request):
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '): return None
    id_token = auth_header.split('Bearer ')[1]
    try: return auth.verify_id_token(id_token)
    except Exception: return None

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def image_to_base64(image_array):
    _, buffer = cv2.imencode('.jpg', image_array)
    return base64.b64encode(buffer).decode('utf-8')

def cartoonize_image(image_path):
    try:
        img = cv2.imread(image_path)
        if img is None: return None
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        gray = cv2.medianBlur(gray, 5)
        edges = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY, 9, 9)
        color = cv2.bilateralFilter(img, 9, 250, 250)
        cartoon = cv2.bitwise_and(color, color, mask=edges)
        return cartoon
    except Exception: return None

def award_points(user_id, is_public, was_public_before):
    if not user_id or not db: return
    points_to_add = 0
    if is_public and not was_public_before:
        points_to_add += 10
    if points_to_add > 0:
        db.collection('users').document(user_id).update({'points': firestore.Increment(points_to_add)})

def get_chat_id(uid1, uid2):
    return '_'.join(sorted([uid1, uid2]))

@app.route('/')
def home(): return render_template('index.html')

@app.route('/login')
def login(): return render_template('auth.html')

@app.route('/register')
def register(): return render_template('auth.html')

@app.route('/profile')
def profile(): return render_template('profile.html')

@app.route('/welcome')
def welcome(): return render_template('welcome.html')

@app.route('/dashboard')
def dashboard(): return render_template('dashboard.html')

@app.route('/messages')
def messages_page(): return render_template('messages.html')

@app.route('/messages/<username>')
def messages_with_user_page(username):
    return render_template('messages.html', start_chat_with=username)

@app.route('/explore')
def explore():
    search_query = request.args.get('q', '').strip()
    creations, users = [], []
    if db:
        if search_query:
            user_query = db.collection('users').where('username', '>=', search_query).where('username', '<=', search_query + '\uf8ff').limit(5)
            users = [doc.to_dict() for doc in user_query.stream()]
            tags = [tag.strip() for tag in search_query.split(',') if tag.strip()]
            if tags:
                creation_query = db.collection('creations').where('is_public', '==', True).where('tags', 'array-contains-any', tags).limit(20)
                creations = [doc.to_dict() for doc in creation_query.stream()]
        else:
            creation_query = db.collection('creations').where('is_public', '==', True).order_by('timestamp', direction=firestore.Query.DESCENDING).limit(21)
            creations = [doc.to_dict() for doc in creation_query.stream()]
    return render_template('explore.html', creations=creations, users=users, search_query=search_query)

@app.route('/user/<username>')
def user_profile(username):
    if not db: abort(500, description="Database not connected")
    user_query = db.collection('users').where('username', '==', username).limit(1).get()
    if not user_query: abort(404, description="User not found")
    user_data = user_query[0].to_dict()
    user_id = user_query[0].id
    user_data['uid'] = user_id
    creations_query = db.collection('creations').where('user_id', '==', user_id).where('is_public', '==', True).order_by('timestamp', direction=firestore.Query.DESCENDING).stream()
    public_creations = [doc.to_dict() for doc in creations_query]
    return render_template('user_profile.html', user=user_data, creations=public_creations)

@app.route('/creation/<creation_id>')
def view_creation(creation_id):
    if not db: abort(500, description="Database not connected")
    creation_doc = db.collection('creations').document(creation_id).get()
    if not creation_doc.exists: abort(404, description="Creation not found")
    creation_data = creation_doc.to_dict()
    creator_doc = db.collection('users').document(creation_data['user_id']).get()
    creator_info = creator_doc.to_dict() if creator_doc.exists else {}
    return render_template('view_creation.html', creation=creation_data, creator=creator_info)

@app.route('/api/check_username', methods=['POST'])
def check_username():
    if not db: return jsonify({'error': 'Database not configured'}), 500
    username = request.get_json().get('username')
    if not username: return jsonify({'error': 'Username not provided'}), 400
    query = db.collection('users').where('username', '==', username).limit(1).get()
    return jsonify({'isAvailable': len(query) == 0})

@app.route('/api/upload-cartoon', methods=['POST'])
def upload_cartoon():
    user = verify_firebase_token(request)
    if not user or 'file' not in request.files: return jsonify({'error': 'Unauthorized or no file'}), 401
    file = request.files['file']
    if file.filename == '' or not allowed_file(file.filename): return jsonify({'error': 'Invalid file'}), 400
    filename = secure_filename(file.filename)
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)
    cartoon_result = cartoonize_image(filepath)
    if cartoon_result is None:
        os.remove(filepath)
        return jsonify({'error': 'Failed to process image'}), 500
    with open(filepath, "rb") as image_file:
        original_base64 = base64.b64encode(image_file.read()).decode('utf-8')
    cartoon_base64 = image_to_base64(cartoon_result)
    os.remove(filepath)
    db.collection('users').document(user['uid']).update({'points': firestore.Increment(1)})
    doc_ref = db.collection('creations').add({
        'user_id': user['uid'], 'type': 'cartoon', 'original_image_b64': original_base64,
        'generated_image_b64': cartoon_base64, 'is_public': False, 'tags': [],
        'timestamp': firestore.SERVER_TIMESTAMP
    })
    return jsonify({'original': original_base64, 'cartoon': cartoon_base64, 'creation_id': doc_ref[1].id})

@app.route('/api/generate-from-text', methods=['POST'])
def generate_from_text():
    user = verify_firebase_token(request)
    if not user: return jsonify({'error': 'Unauthorized'}), 401
    prompt = request.get_json().get('prompt')
    if not prompt: return jsonify({'error': 'Prompt is required'}), 400
    api_url = f"https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key={GEMINI_API_KEY}"
    payload = {"instances": [{"prompt": prompt}], "parameters": {"sampleCount": 1}}
    try:
        response = requests.post(api_url, json=payload)
        response.raise_for_status()
        result = response.json()
        if result.get("predictions") and result["predictions"][0].get("bytesBase64Encoded"):
            base64_image = result["predictions"][0]["bytesBase64Encoded"]
            image_data_url = f"data:image/png;base64,{base64_image}"
            db.collection('users').document(user['uid']).update({'points': firestore.Increment(3)})
            doc_ref = db.collection('creations').add({
                'user_id': user['uid'], 'type': 'text-to-image', 'prompt': prompt,
                'generated_image_b64': base64_image, 'is_public': False, 'tags': [],
                'timestamp': firestore.SERVER_TIMESTAMP
            })
            return jsonify({'image_data_url': image_data_url, 'creation_id': doc_ref[1].id})
        else:
            return jsonify({'error': 'AI model returned an unexpected response.'}), 500
    except requests.exceptions.RequestException as e:
        return jsonify({'error': f'An error occurred with the AI service: {e}'}), 500

@app.route('/api/user/profile', methods=['GET'])
def get_user_profile():
    user = verify_firebase_token(request)
    if not user or not db: return jsonify({'error': 'Unauthorized'}), 401
    try:
        user_doc = db.collection('users').document(user['uid']).get()
        user_data = user_doc.to_dict() if user_doc.exists else {}
        creations_query = db.collection('creations').where('user_id', '==', user['uid']).order_by('timestamp', direction=firestore.Query.DESCENDING).limit(6)
        creations_docs = [doc.to_dict() for doc in creations_query.stream()]
        return jsonify({'profile': user_data, 'creations': creations_docs})
    except Exception as e: return jsonify({'error': str(e)}), 500

@app.route('/api/user/profile', methods=['POST'])
def post_user_profile():
    user = verify_firebase_token(request)
    if not user or not db: return jsonify({'error': 'Unauthorized'}), 401
    data = request.get_json()
    update_data = {
        'fullName': data.get('fullName'), 'aboutMe': data.get('aboutMe'), 'gender': data.get('gender'),
        'dob': data.get('dob'), 'location': data.get('location'), 'hobbies': data.get('hobbies')
    }
    try:
        db.collection('users').document(user['uid']).update({k: v for k, v in update_data.items() if v is not None})
        return jsonify({'success': True, 'message': 'Profile updated successfully'})
    except Exception as e: return jsonify({'error': str(e)}), 500

@app.route('/api/user/creations', methods=['GET'])
def get_user_creations():
    user = verify_firebase_token(request)
    if not user or not db: return jsonify({'error': 'Unauthorized'}), 401
    try:
        visibility = request.args.get('visibility', 'all')
        folder = request.args.get('folder')
        query = db.collection('creations').where('user_id', '==', user['uid'])
        if visibility == 'public': query = query.where('is_public', '==', True)
        elif visibility == 'private': query = query.where('is_public', '==', False)
        if folder: query = query.where('folder', '==', folder)
        docs = query.order_by('timestamp', direction=firestore.Query.DESCENDING).stream()
        creations = []
        for doc in docs:
            creation_data = doc.to_dict(); creation_data['id'] = doc.id
            creations.append(creation_data)
        return jsonify({'creations': creations})
    except Exception as e: return jsonify({'error': str(e)}), 500

@app.route('/api/creations/<creation_id>', methods=['POST'])
def update_creation(creation_id):
    user = verify_firebase_token(request)
    if not user or not db: return jsonify({'error': 'Unauthorized'}), 401
    data = request.get_json()
    is_public = data.get('is_public')
    tags = [tag.strip() for tag in data.get('tags', '').split(',') if tag.strip()]
    try:
        creation_ref = db.collection('creations').document(creation_id)
        creation_doc = creation_ref.get()
        if not creation_doc.exists or creation_doc.to_dict().get('user_id') != user['uid']:
            return jsonify({'error': 'Permission denied'}), 403
        was_public_before = creation_doc.to_dict().get('is_public', False)
        creation_ref.update({'is_public': is_public, 'tags': tags})
        award_points(user['uid'], is_public, was_public_before)
        return jsonify({'success': True, 'message': 'Creation updated.'})
    except Exception as e: return jsonify({'error': str(e)}), 500

@app.route('/api/creations/<creation_id>', methods=['DELETE'])
def delete_creation(creation_id):
    user = verify_firebase_token(request)
    if not user or not db: return jsonify({'error': 'Unauthorized'}), 401
    try:
        creation_ref = db.collection('creations').document(creation_id)
        creation_doc = creation_ref.get()
        if not creation_doc.exists or creation_doc.to_dict().get('user_id') != user['uid']:
            return jsonify({'error': 'Permission denied'}), 403
        creation_ref.delete()
        return jsonify({'success': True, 'message': 'Creation deleted.'})
    except Exception as e: return jsonify({'error': str(e)}), 500

@app.route('/api/friends/status/<target_user_id>', methods=['GET'])
def get_friend_status(target_user_id):
    user = verify_firebase_token(request)
    if not user or not db: return jsonify({'error': 'Unauthorized'}), 401
    current_user_doc = db.collection('users').document(user['uid']).get()
    current_user_data = current_user_doc.to_dict()
    if target_user_id in current_user_data.get('friends', []): return jsonify({'status': 'friends'})
    elif target_user_id in current_user_data.get('friendRequests', {}).get('sent', []): return jsonify({'status': 'sent'})
    elif target_user_id in current_user_data.get('friendRequests', {}).get('received', []): return jsonify({'status': 'received'})
    else: return jsonify({'status': 'none'})

@app.route('/api/friends/request/<target_user_id>', methods=['POST'])
def send_friend_request(target_user_id):
    user = verify_firebase_token(request)
    if not user or not db: return jsonify({'error': 'Unauthorized'}), 401
    current_user_id = user['uid']
    if current_user_id == target_user_id: return jsonify({'error': 'Cannot add yourself'}), 400
    db.collection('users').document(current_user_id).update({'friendRequests.sent': firestore.ArrayUnion([target_user_id])})
    db.collection('users').document(target_user_id).update({'friendRequests.received': firestore.ArrayUnion([current_user_id])})
    return jsonify({'success': True, 'status': 'sent'})

@app.route('/api/friends/handle/<requester_id>', methods=['POST'])
def handle_friend_request(requester_id):
    user = verify_firebase_token(request)
    if not user or not db: return jsonify({'error': 'Unauthorized'}), 401
    current_user_id = user['uid']
    action = request.json.get('action')
    db.collection('users').document(current_user_id).update({'friendRequests.received': firestore.ArrayRemove([requester_id])})
    db.collection('users').document(requester_id).update({'friendRequests.sent': firestore.ArrayRemove([current_user_id])})
    if action == 'accept':
        db.collection('users').document(current_user_id).update({'friends': firestore.ArrayUnion([requester_id])})
        db.collection('users').document(requester_id).update({'friends': firestore.ArrayUnion([current_user_id])})
    return jsonify({'success': True})

@app.route('/api/friends/requests', methods=['GET'])
def get_friend_requests():
    user = verify_firebase_token(request)
    if not user or not db: return jsonify({'error': 'Unauthorized'}), 401
    user_doc = db.collection('users').document(user['uid']).get()
    received_ids = user_doc.to_dict().get('friendRequests', {}).get('received', [])
    requests_data = []
    if received_ids:
        users = db.collection('users').where(firestore.FieldPath.document_id(), 'in', received_ids).stream()
        for u in users:
            requests_data.append({'uid': u.id, 'username': u.to_dict().get('username'), 'photoURL': u.to_dict().get('photoURL')})
    return jsonify({'requests': requests_data})

@app.route('/api/creations/<creation_id>/favorite', methods=['POST'])
def toggle_favorite(creation_id):
    user = verify_firebase_token(request)
    if not user or not db: return jsonify({'error': 'Unauthorized'}), 401
    user_ref = db.collection('users').document(user['uid'])
    action = request.json.get('action')
    if action == 'favorite': user_ref.update({'favorites': firestore.ArrayUnion([creation_id])})
    elif action == 'unfavorite': user_ref.update({'favorites': firestore.ArrayRemove([creation_id])})
    return jsonify({'success': True})

@app.route('/api/user/favorites', methods=['GET'])
def get_user_favorites():
    user = verify_firebase_token(request)
    if not user or not db: return jsonify({'error': 'Unauthorized'}), 401
    user_doc = db.collection('users').document(user['uid']).get()
    favorite_ids = user_doc.to_dict().get('favorites', [])
    favorited_creations = []
    if favorite_ids:
        refs = [db.collection('creations').document(id) for id in favorite_ids[:10]]
        docs = db.get_all(refs)
        for doc in docs:
            if doc.exists:
                creation_data = doc.to_dict(); creation_data['id'] = doc.id
                favorited_creations.append(creation_data)
    return jsonify({'creations': favorited_creations})

@app.route('/api/feed', methods=['GET'])
def get_feed():
    user = verify_firebase_token(request)
    if not user or not db: return jsonify({'error': 'Unauthorized'}), 401
    user_doc = db.collection('users').document(user['uid']).get()
    friends_list = user_doc.to_dict().get('friends', [])
    if not friends_list: return jsonify({'feed': []})
    creations_query = db.collection('creations').where('user_id', 'in', friends_list).where('is_public', '==', True).order_by('timestamp', direction=firestore.Query.DESCENDING).limit(20).stream()
    feed_items = []; creator_ids = set()
    for doc in creations_query:
        item = doc.to_dict(); item['id'] = doc.id
        feed_items.append(item); creator_ids.add(item['user_id'])
    creators = {}
    if creator_ids:
        creator_docs = db.collection('users').where(firestore.FieldPath.document_id(), 'in', list(creator_ids)).stream()
        for doc in creator_docs: creators[doc.id] = doc.to_dict()
    for item in feed_items:
        creator_info = creators.get(item['user_id'], {})
        item['creator_username'] = creator_info.get('username', 'Unknown')
        item['creator_photoURL'] = creator_info.get('photoURL')
    return jsonify({'feed': feed_items})

@app.route('/api/dashboard/folders', methods=['POST'])
def create_folder():
    user = verify_firebase_token(request)
    if not user or not db: return jsonify({'error': 'Unauthorized'}), 401
    folder_name = request.json.get('folder_name', '').strip()
    if not folder_name: return jsonify({'error': 'Folder name cannot be empty'}), 400
    user_ref = db.collection('users').document(user['uid'])
    user_ref.update({'customFolders': firestore.ArrayUnion([folder_name])})
    return jsonify({'success': True})

@app.route('/api/creations/<creation_id>/move', methods=['POST'])
def move_creation_to_folder(creation_id):
    user = verify_firebase_token(request)
    if not user or not db: return jsonify({'error': 'Unauthorized'}), 401
    folder_name = request.json.get('folder_name')
    creation_ref = db.collection('creations').document(creation_id)
    if creation_ref.get().to_dict().get('user_id') != user['uid']:
        return jsonify({'error': 'Permission denied'}), 403
    creation_ref.update({'folder': folder_name})
    return jsonify({'success': True})

@app.route('/api/messages/send/<recipient_username>', methods=['POST'])
def send_message(recipient_username):
    user = verify_firebase_token(request)
    if not user or not db: return jsonify({'error': 'Unauthorized'}), 401
    recipient_doc = list(db.collection('users').where('username', '==', recipient_username).limit(1).stream())
    if not recipient_doc: return jsonify({'error': 'Recipient not found'}), 404
    recipient_id = recipient_doc[0].id
    chat_id = get_chat_id(user['uid'], recipient_id)
    text = request.json.get('text')
    message_data = {'senderId': user['uid'], 'text': text, 'timestamp': firestore.SERVER_TIMESTAMP}
    db.collection('chats').document(chat_id).collection('messages').add(message_data)
    db.collection('chats').document(chat_id).set({
        'participants': [user['uid'], recipient_id], 'lastMessage': text,
        'lastTimestamp': firestore.SERVER_TIMESTAMP
    }, merge=True)
    return jsonify({'success': True})

@app.route('/api/messages/conversations', methods=['GET'])
def get_conversations():
    user = verify_firebase_token(request)
    if not user or not db: return jsonify({'error': 'Unauthorized'}), 401
    chats_query = db.collection('chats').where('participants', 'array-contains', user['uid']).order_by('lastTimestamp', direction='DESCENDING').stream()
    conversations = []; other_user_ids = []
    for chat in chats_query:
        chat_data = chat.to_dict()
        other_user_id = next((p for p in chat_data['participants'] if p != user['uid']), None)
        if other_user_id:
            other_user_ids.append(other_user_id)
            conversations.append({'chat_id': chat.id, 'other_user_id': other_user_id, 'lastMessage': chat_data.get('lastMessage')})
    other_users_data = {}
    if other_user_ids:
        user_docs = db.collection('users').where(firestore.FieldPath.document_id(), 'in', list(other_user_ids)).stream()
        for doc in user_docs: other_users_data[doc.id] = doc.to_dict()
    for conv in conversations:
        user_data = other_users_data.get(conv['other_user_id'], {})
        conv['username'] = user_data.get('username', 'Unknown'); conv['photoURL'] = user_data.get('photoURL')
    return jsonify({'conversations': conversations})

@app.route('/api/messages/chat/<other_user_id>', methods=['GET'])
def get_chat_history(other_user_id):
    user = verify_firebase_token(request)
    if not user or not db: return jsonify({'error': 'Unauthorized'}), 401
    chat_id = get_chat_id(user['uid'], other_user_id)
    messages_query = db.collection('chats').document(chat_id).collection('messages').order_by('timestamp').limit(50).stream()
    messages = [msg.to_dict() for msg in messages_query]
    return jsonify({'messages': messages})

@app.route('/favicon.ico')
def favicon():
    return send_from_directory(os.path.join(app.root_path, 'static'), 'favicon.ico', mimetype='image/vnd.microsoft.icon')

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001)