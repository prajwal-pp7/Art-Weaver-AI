document.addEventListener('DOMContentLoaded', function () {
    const auth = firebase.auth();
    const db = firebase.firestore();
    let userFavorites = new Set();
    
    const page = document.body.dataset.page;

    const themeToggle = document.getElementById('theme-toggle');
    const loadingModal = document.getElementById('loading-modal');
    const authRequiredElements = document.querySelectorAll('.auth-required');
    const userInfoNav = document.getElementById('user-info-nav');
    const guestNav = document.getElementById('guest-nav');
    const navUsername = document.getElementById('nav-username');
    const navPoints = document.getElementById('nav-points');
    const notificationBellBtn = document.getElementById('notification-bell-btn');

    const sunIcon = `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>`;
    const moonIcon = `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>`;

    const updateThemeIcon = () => { if (themeToggle) themeToggle.innerHTML = document.documentElement.classList.contains('dark') ? sunIcon : moonIcon; };
    if (themeToggle) { themeToggle.addEventListener('click', () => { document.documentElement.classList.toggle('dark'); localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light'); updateThemeIcon(); }); }
    updateThemeIcon();

    const showApiError = (errorMsg) => {
        const resultsArea = document.getElementById('results-area');
        if (resultsArea) {
            resultsArea.innerHTML = `
            <div class="max-w-xl mx-auto bg-red-100 dark:bg-red-900 border border-red-400 text-red-700 dark:text-red-200 px-4 py-3 rounded-lg" role="alert">
              <strong class="font-bold">An Error Occurred!</strong>
              <span class="block sm:inline">${errorMsg}</span>
            </div>`;
            resultsArea.scrollIntoView({ behavior: 'smooth' });
        }
    };

    const updateNav = (user, userData) => {
        guestNav.classList.add('hidden');
        userInfoNav.classList.remove('hidden');
        userInfoNav.classList.add('flex');
        document.getElementById('logout-btn').addEventListener('click', () => auth.signOut().then(() => window.location.href = '/login'));
        navUsername.textContent = userData.username || 'Profile';
        navPoints.textContent = `${userData.points || 0} pts`;
    };

    const setupGuestUI = () => {
        guestNav.classList.remove('hidden');
        userInfoNav.classList.add('hidden');
        userInfoNav.classList.remove('flex');
        if (document.getElementById('feed-container')) {
            document.getElementById('feed-container').classList.add('hidden');
            document.getElementById('generators-container').classList.remove('hidden');
        }
    };

    auth.onAuthStateChanged(async user => {
        if (user && user.emailVerified) {
            const userDoc = await db.collection('users').doc(user.uid).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                userFavorites = new Set(userData.favorites || []);
                updateNav(user, userData);
                if (document.getElementById('dashboard-content')) {
                    loadDashboard(user, userData);
                }
            }
        } else {
            setupGuestUI();
        }
    });
    
    function initializeGeneratorForms() {
        const uploadForm = document.getElementById('upload-form');
        const textToImageForm = document.getElementById('text-to-image-form');

        if (uploadForm) {
            const fileInput = document.getElementById('file-upload');
            const fileCountSpan = document.getElementById('file-count');
            fileInput.addEventListener('change', () => { fileCountSpan.textContent = fileInput.files.length > 0 ? `${fileInput.files[0].name}` : ''; });
            
            uploadForm.addEventListener('submit', async e => {
                e.preventDefault(); if (fileInput.files.length === 0) { showApiError('Please select a file first.'); return; }
                loadingModal.classList.remove('hidden');
                const user = auth.currentUser;
                const token = user ? await user.getIdToken() : null;
                const headers = {};
                if (token) headers['Authorization'] = `Bearer ${token}`;
                const formData = new FormData(); formData.append('file', fileInput.files[0]);
                
                fetch('/api/upload-cartoon', { method: 'POST', headers, body: formData })
                    .then(res => res.json()).then(data => {
                        if (data.error) { showApiError(data.error); return; }
                        const imgSrc = `data:image/jpeg;base64,${data.cartoon}`;
                        user ? showPublishModal(data.creation_id, imgSrc) : showGuestResult(imgSrc);
                    })
                    .finally(() => { loadingModal.classList.add('hidden'); fileInput.value = ''; fileCountSpan.textContent = ''; });
            });
        }

        if (textToImageForm) {
            textToImageForm.addEventListener('submit', async e => {
                e.preventDefault(); const prompt = document.getElementById('prompt').value; if(!prompt) { showApiError('Please enter a prompt first.'); return; }
                loadingModal.classList.remove('hidden');
                const user = auth.currentUser;
                const token = user ? await user.getIdToken() : null;
                const headers = { 'Content-Type': 'application/json' };
                if (token) headers['Authorization'] = `Bearer ${token}`;

                fetch('/api/generate-from-text', { method: 'POST', headers, body: JSON.stringify({ prompt }) })
                    .then(res => res.json()).then(data => {
                        if (data.error) { showApiError(data.error); return; }
                         user ? showPublishModal(data.creation_id, data.image_data_url) : showGuestResult(data.image_data_url);
                    })
                    .finally(() => { loadingModal.classList.add('hidden'); });
            });
        }
    }

    initializeGeneratorForms();

    const loadDashboard = async (user, userData) => {
        const token = await user.getIdToken();
        const dashboardCreations = document.getElementById('dashboard-creations');
        const loader = document.getElementById('dashboard-loader');

        fetch('/api/user/creations', { headers: { 'Authorization': `Bearer ${token}` }})
        .then(res => res.json())
        .then(data => {
            loader.style.display = 'none';
            if (data.creations && data.creations.length > 0) {
                dashboardCreations.innerHTML = data.creations.map(c => `
                    <div class="bg-gray-100 dark:bg-gray-800 rounded-lg shadow-md overflow-hidden group">
                         <a href="/creation/${c.id}"><img src="data:image/png;base64,${c.generated_image_b64}" class="w-full h-64 object-cover transform group-hover:scale-105 transition-transform duration-300"></a>
                         <div class="p-4">
                             <p class="font-mono bg-gray-200 dark:bg-gray-700 p-2 rounded text-xs truncate">"${c.prompt || 'Cartoonized Image'}"</p>
                         </div>
                    </div>
                `).join('');
            } else {
                dashboardCreations.innerHTML = `<p class="col-span-full text-center text-gray-500">You haven't made any creations yet.</p>`;
            }
        });
    };
    
    const showGuestResult = (imgSrc) => {
        const resultsArea = document.getElementById('results-area');
        resultsArea.innerHTML = `
            <div class="max-w-xl mx-auto bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg text-center">
                <h2 class="text-2xl font-bold mb-4">Here's Your Creation!</h2>
                <img src="${imgSrc}" class="rounded-lg w-full mb-4">
                <a href="${imgSrc}" download="art-weaver-creation.png" class="inline-block bg-green-500 text-white font-bold py-2 px-6 rounded-lg hover:bg-green-600">Download</a>
            </div>`;
        resultsArea.scrollIntoView({ behavior: 'smooth' });
    };

    const showPublishModal = (creationId, imgSrc) => {
        const modal = document.getElementById('publish-modal');
        document.getElementById('publish-preview-img').src = imgSrc;
        document.getElementById('publish-creation-id').value = creationId;
        modal.classList.remove('hidden');
    };
    
    const locationDisplay = document.getElementById('location-display');
    if (locationDisplay) {
        fetch('https://ipapi.co/json/').then(res => res.json()).then(data => {
            if (data.city && data.country_name) {
                locationDisplay.textContent = `${data.city}, ${data.country_name}`;
                locationDisplay.href = `https://www.google.com/maps/search/?api=1&query=${data.latitude},${data.longitude}`;
            } else {
                locationDisplay.textContent = 'Location unavailable';
            }
        }).catch(() => { locationDisplay.textContent = 'Location unavailable'; });
    }
});