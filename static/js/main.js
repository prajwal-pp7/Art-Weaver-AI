
document.addEventListener('DOMContentLoaded', function () {

import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyDr3yqvpjDFfj_g-tcmYBXLq-f4nTTrjjs",
  authDomain: "art-weaver-ai.firebaseapp.com",
  projectId: "art-weaver-ai",
  storageBucket: "art-weaver-ai.firebasestorage.app",
  messagingSenderId: "829404301755",
  appId: "1:829404301755:web:81cb1a5981504c255b1c9e",
  measurementId: "G-94BRP1GSQL"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();
    const storage = firebase.storage();

    const themeToggle = document.getElementById('theme-toggle');
    const navLinks = document.getElementById('nav-links');
    const loadingModal = document.getElementById('loading-modal');

    const sunIcon = `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>`;
    const moonIcon = `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>`;

    const updateThemeIcon = () => { 
        if(themeToggle) {
            themeToggle.innerHTML = document.documentElement.classList.contains('dark') ? sunIcon : moonIcon; 
        }
    };
    if(themeToggle) {
        themeToggle.addEventListener('click', () => {
            document.documentElement.classList.toggle('dark');
            localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
            updateThemeIcon();
        });
    }
    updateThemeIcon();

    auth.onAuthStateChanged(user => {
        const authRequiredElements = document.querySelectorAll('.auth-required');
        if (user && user.emailVerified) {
            navLinks.innerHTML = `<a href="/" class="text-gray-600 dark:text-gray-300 hover:text-blue-500">Home</a><a href="/explore" class="text-gray-600 dark:text-gray-300 hover:text-blue-500">Explore</a><a href="/profile" class="text-gray-600 dark:text-gray-300 hover:text-blue-500">Profile</a><button id="logout-btn" class="bg-red-500 text-white py-2 px-4 rounded hover:bg-red-600">Logout</button>`;
            document.getElementById('logout-btn').addEventListener('click', () => auth.signOut().then(() => window.location.href = '/login'));
            authRequiredElements.forEach(el => el.classList.remove('hidden'));
        } else {
            navLinks.innerHTML = `<a href="/" class="text-gray-600 dark:text-gray-300 hover:text-blue-500">Home</a><a href="/explore" class="text-gray-600 dark:text-gray-300 hover:text-blue-500">Explore</a><a href="/login" class="text-gray-600 dark:text-gray-300 hover:text-blue-500">Login</a><a href="/register" class="bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600">Register</a>`;
            authRequiredElements.forEach(el => el.classList.add('hidden'));
        }
    });

    if (document.getElementById('login-container')) {
        const loginContainer = document.getElementById('login-container');
        const registerContainer = document.getElementById('register-container');
        const showRegisterBtn = document.getElementById('show-register');
        const showLoginBtn = document.getElementById('show-login');

        const switchToRegister = () => {
            loginContainer.classList.add('hidden');
            registerContainer.classList.remove('hidden');
        };

        const switchToLogin = () => {
            registerContainer.classList.add('hidden');
            loginContainer.classList.remove('hidden');
        };

        showRegisterBtn.addEventListener('click', (e) => {
            e.preventDefault();
            switchToRegister();
        });

        showLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            switchToLogin();
        });

        if (window.location.pathname.includes('/register')) {
            switchToRegister();
        } else {
            switchToLogin();
        }

        const registerForm = document.getElementById('register-form');
        const messageP = document.getElementById('register-message');
        registerForm.addEventListener('submit', async e => {
            e.preventDefault();
            const username = registerForm['register-username'].value;
            const email = registerForm['register-email'].value;
            const password = registerForm['register-password'].value;
            const profilePicFile = registerForm['profile-pic'].files[0];
            
            messageP.textContent = 'Processing...';
            messageP.classList.remove('text-red-500', 'text-green-500');

            try {
                const userCredential = await auth.createUserWithEmailAndPassword(email, password);
                const user = userCredential.user;
                
                let photoURL = null;
                if (profilePicFile) {
                    const storageRef = storage.ref(`profile_pictures/${user.uid}/${profilePicFile.name}`);
                    const snapshot = await storageRef.put(profilePicFile);
                    photoURL = await snapshot.ref.getDownloadURL();
                }

                await db.collection('users').doc(user.uid).set({
                    username: username,
                    email: email,
                    photoURL: photoURL,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                await user.sendEmailVerification();
                messageP.textContent = 'Account created! Please check your email to verify.';
                messageP.classList.add('text-green-500');
                await auth.signOut();
                setTimeout(() => switchToLogin(), 4000);

            } catch (error) {
                messageP.textContent = error.message;
                messageP.classList.add('text-red-500');
            }
        });

        const loginForm = document.getElementById('login-form');
        const errorP = document.getElementById('login-error');
        loginForm.addEventListener('submit', e => {
            e.preventDefault();
            const email = loginForm['login-email'].value;
            const password = loginForm['login-password'].value;
            
            errorP.textContent = '';

            auth.signInWithEmailAndPassword(email, password)
                .then(userCredential => {
                    if (!userCredential.user.emailVerified) {
                        errorP.textContent = 'Please verify your email before logging in.';
                        auth.signOut();
                    } else {
                        window.location.href = '/profile';
                    }
                })
                .catch(error => {
                    errorP.textContent = error.message;
                });
        });
    }

    if (document.getElementById('upload-form')) {
        const uploadForm = document.getElementById('upload-form');
        const fileInput = document.getElementById('file-upload');
        const fileCountSpan = document.getElementById('file-count');
        
        fileInput.addEventListener('change', () => {
            const numFiles = fileInput.files.length;
            fileCountSpan.textContent = numFiles > 0 ? `${numFiles} file(s) selected` : '';
        });

        uploadForm.addEventListener('submit', async e => {
            e.preventDefault();
            if (fileInput.files.length === 0) return;
            loadingModal.classList.remove('hidden');

            const isPublic = document.getElementById('is-public-cartoon')?.checked || false;
            const tags = document.getElementById('cartoon-tags').value;
            const user = auth.currentUser;
            const token = user ? await user.getIdToken() : null;

            for (const file of fileInput.files) {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('is_public', isPublic);
                formData.append('tags', tags);

                fetch('/api/upload-cartoon', {
                    method: 'POST',
                    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
                    body: formData
                })
                .then(response => response.json())
                .then(data => displayResult(data, 'cartoon'))
                .catch(error => displayResult({ error: error.message }, 'cartoon'))
                .finally(() => {
                    loadingModal.classList.add('hidden');
                    fileInput.value = ''; // Clear selection
                    fileCountSpan.textContent = '';
                });
            }
        });

        const textToImageForm = document.getElementById('text-to-image-form');
        textToImageForm.addEventListener('submit', async e => {
            e.preventDefault();
            loadingModal.classList.remove('hidden');
            const prompt = document.getElementById('prompt').value;
            const tags = document.getElementById('text-image-tags').value;
            const isPublic = document.getElementById('is-public-text')?.checked || false;

            const user = auth.currentUser;
            const token = user ? await user.getIdToken() : null;

            fetch('/api/generate-from-text', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token && { 'Authorization': `Bearer ${token}` })
                },
                body: JSON.stringify({ prompt, is_public: isPublic, tags: tags })
            })
            .then(response => response.json())
            .then(data => displayResult(data, 'text-to-image'))
            .catch(error => displayResult({ error: error.message }, 'text-to-image'))
            .finally(() => loadingModal.classList.add('hidden'));
        });
    }

    if (document.getElementById('profile-content')) {
        auth.onAuthStateChanged(async user => {
            if (user && user.emailVerified) {
                const token = await user.getIdToken();
                fetch('/api/user/profile', { headers: { 'Authorization': `Bearer ${token}` } })
                .then(res => res.json())
                .then(data => {
                    if (data.error) throw new Error(data.error);
                    
                    const profile = data.profile;
                    document.getElementById('profile-username').textContent = profile.username || 'User';
                    document.getElementById('profile-email').textContent = profile.email;
                    document.getElementById('profile-points').textContent = profile.points || 0;
                    if (profile.photoURL) {
                        document.getElementById('profile-avatar-img').src = profile.photoURL;
                    }

                    const creationsContainer = document.getElementById('profile-creations');
                    creationsContainer.innerHTML = ''; // Clear
                    data.creations.forEach(item => {
                        const card = document.createElement('div');
                        card.className = 'bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden';
                        let imgSrc = item.type === 'cartoon' ? `data:image/jpeg;base64,${item.generated_image_b64}` : `data:image/png;base64,${item.generated_image_b64}`;
                        card.innerHTML = `<img src="${imgSrc}" class="w-full h-72 object-cover">`;
                        creationsContainer.appendChild(card);
                    });
                    document.getElementById('profile-content').classList.add('opacity-100');
                })
                .catch(err => {
                    console.error("Failed to load profile:", err);
                    document.getElementById('profile-content').innerHTML = `<p class="text-red-500">Could not load profile data.</p>`;
                    document.getElementById('profile-content').classList.add('opacity-100');
                });
            } else {
                window.location.href = '/login';
            }
        });
    }

    function displayResult(data, type) {
        const resultsArea = document.getElementById('results-area');
        const resultCard = document.createElement('div');
        resultCard.className = 'bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg mb-6';
        
        if (data.error) {
            resultCard.innerHTML = `<p class="text-red-500 font-bold">Error:</p><p>${data.error}</p>`;
        } else if (type === 'cartoon') {
            resultCard.innerHTML = `
                <h3 class="text-2xl font-bold mb-4">Cartoon Result</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><h4 class="font-semibold mb-2">Original</h4><img src="data:image/jpeg;base64,${data.original}" class="rounded-lg"/></div>
                    <div><h4 class="font-semibold mb-2">Cartoon</h4><img src="data:image/jpeg;base64,${data.cartoon}" class="rounded-lg"/></div>
                </div>`;
        } else if (type === 'text-to-image') {
            resultCard.innerHTML = `
                <h3 class="text-2xl font-bold mb-4">AI Generated Image</h3>
                <img src="${data.image_data_url}" class="rounded-lg mx-auto mb-4"/>
                <a href="${data.image_data_url}" download="art-weaver-ai.png" class="inline-block bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600">Download Image</a>`;
        }
        resultsArea.prepend(resultCard);
    }
});
