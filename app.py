import os
import cv2
import numpy as np
import base64
import replicate
from flask import Flask, request, render_template, jsonify, redirect, url_for, session
from werkzeug.utils import secure_filename
import firebase_admin
from firebase_admin import credentials, auth, firestore
import json

app = Flask(__name__)
app.secret_key = os.urandom(24)

try:
    json_content = os.environ.get("FIREBASE_SERVICE_ACCOUNT_KEY")
    if json_content:
        cred_obj = json.loads(json_content)
        cred = credentials.Certificate(cred_obj)
        firebase_admin.initialize_app(cred)
        db = firestore.client()
    else:
        print("Error: FIREBASE_SERVICE_ACCOUNT_KEY environment variable not found.")
        db = None
except Exception as e:
    print(f"Firebase Initialization Failed: {e}")
    db = None

REPLICATE_API_TOKEN = os.environ.get('REPLICATE_API_TOKEN')
if not REPLICATE_API_TOKEN:
    print("WARNING: REPLICATE_API_TOKEN environment variable not set. Text-to-Image will not work.")

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
os.makedirs(UPLOAD_FOLDER, exist_ok=True)


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
    except Exception as e:
        print(f"Error in cartoonize_image: {e}")
        return None

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        data = request.get_json()
        try:
            user = auth.get_user_by_email(data['email'])
            session['user_id'] = user.uid
            session['user_email'] = user.email
            return jsonify({'status': 'success', 'message': 'Logged in successfully'})
        except Exception as e:
            return jsonify({'status': 'error', 'message': str(e)}), 400
    return render_template('login.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        data = request.get_json()
        try:
            user = auth.create_user(
                email=data['email'],
                password=data['password']
            )
            db.collection('users').document(user.uid).set({
                'email': user.email,
                'created_at': firestore.SERVER_TIMESTAMP
            })
            return jsonify({'status': 'success', 'message': 'User created successfully'})
        except Exception as e:
            return jsonify({'status': 'error', 'message': str(e)}), 400
    return render_template('register.html')

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('home'))

@app.route('/')
def home():
    user_id = session.get('user_id')
    user_creations = []
    if user_id and db:
        creations_ref = db.collection('creations').where('user_id', '==', user_id).limit(10)
        docs = creations_ref.stream()
        for doc in docs:
            user_creations.append(doc.to_dict())

    return render_template('index.html', user_creations=user_creations)

@app.route('/upload-cartoon', methods=['POST'])
def upload_cartoon():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '' or not allowed_file(file.filename):
        return jsonify({'error': 'Invalid file'}), 400

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

    user_id = session.get('user_id')
    if user_id and db:
        is_public = request.form.get('is_public') == 'true'
        db.collection('creations').add({
            'user_id': user_id,
            'type': 'cartoon',
            'original_image_b64': original_base64,
            'generated_image_b64': cartoon_base64,
            'is_public': is_public,
            'timestamp': firestore.SERVER_TIMESTAMP
        })

    return jsonify({
        'original': original_base64,
        'cartoon': cartoon_base64
    })

@app.route('/generate-from-text', methods=['POST'])
def generate_from_text():
    if not REPLICATE_API_TOKEN:
        return jsonify({'error': 'Text-to-Image feature is not configured on the server.'}), 500

    data = request.get_json()
    prompt = data.get('prompt')
    if not prompt:
        return jsonify({'error': 'Prompt is required'}), 400

    try:
        output = replicate.run(
            "stability-ai/stable-diffusion-3",
            input={"prompt": prompt}
        )
        image_url = output[0] if output else None

        if not image_url:
             return jsonify({'error': 'AI model failed to generate an image.'}), 500

        user_id = session.get('user_id')
        if user_id and db:
            is_public = data.get('is_public', False)
            db.collection('creations').add({
                'user_id': user_id,
                'type': 'text-to-image',
                'prompt': prompt,
                'generated_image_url': image_url,
                'is_public': is_public,
                'timestamp': firestore.SERVER_TIMESTAMP
            })

        return jsonify({'image_url': image_url})

    except Exception as e:
        print(f"Replicate API Error: {e}")
        return jsonify({'error': f'An error occurred with the AI service: {e}'}), 500

@app.route('/explore')
def explore():
    public_creations = []
    if db:
        creations_ref = db.collection('creations').where('is_public', '==', True).limit(20)
        docs = creations_ref.stream()
        for doc in docs:
            public_creations.append(doc.to_dict())
    return render_template('explore.html', creations=public_creations)


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001)