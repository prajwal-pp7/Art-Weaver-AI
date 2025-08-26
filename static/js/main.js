document.addEventListener('firebase-ready', () => {
    const auth = firebase.auth();
    const db = firebase.firestore();
    let currentUser = null;

    const themeToggle = document.getElementById('theme-toggle');
    const locationDisplay = document.getElementById('location-display');
    const loadingModal = document.getElementById('loading-modal');
    const userInfoNav = document.getElementById('user-info-nav');
    const guestNav = document.getElementById('guest-nav');
    
    const sunIcon = `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>`;
    const moonIcon = `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>`;

    const setupThemeAndLocation = () => {
        if (themeToggle) {
            const updateIcon = () => { themeToggle.innerHTML = document.documentElement.classList.contains('dark') ? sunIcon : moonIcon; };
            themeToggle.addEventListener('click', () => {
                document.documentElement.classList.toggle('dark');
                localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
                updateIcon();
            });
            updateIcon();
        }
        if (locationDisplay) {
            fetch('https://ipapi.co/json/').then(res => res.json()).then(data => {
                locationDisplay.textContent = (data.city && data.country_name) ? `${data.city}, ${data.country_name}` : 'Location unavailable';
                locationDisplay.href = `https://www.google.com/maps/search/?api=1&query=${data.latitude},${data.longitude}`;
            }).catch(() => { locationDisplay.textContent = 'Location unavailable'; });
        }
    };

    const setupGuestUI = () => {
        guestNav.style.display = 'flex';
        userInfoNav.style.display = 'none';
        if (document.getElementById('generators-container')) {
             document.getElementById('generators-container').style.display = 'grid';
        }
        if (document.getElementById('feed-container')) {
            document.getElementById('feed-container').style.display = 'none';
        }
    };
    
    const setupUserUI = async (user) => {
        guestNav.style.display = 'none';
        userInfoNav.style.display = 'flex';
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (!userDoc.exists) return;

        const userData = userDoc.data();
        document.getElementById('nav-username').textContent = userData.username;
        document.getElementById('nav-points').textContent = `${userData.points || 0} pts`;
        document.getElementById('logout-btn').addEventListener('click', () => auth.signOut());

        if (document.getElementById('dashboard-content')) {
            loadDashboard(user);
        }
    };
    
    auth.onAuthStateChanged(user => {
        if (user && user.emailVerified) {
            currentUser = user;
            setupUserUI(user);
        } else {
            currentUser = null;
            setupGuestUI();
        }
    });

    const showApiError = (message) => {
        const resultsArea = document.getElementById('results-area');
        if (!resultsArea) return;
        resultsArea.innerHTML = `<div class="max-w-xl mx-auto my-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg"><p class="font-bold">Error:</p><p>${message}</p></div>`;
        resultsArea.scrollIntoView({ behavior: 'smooth' });
    };

    const showResult = (imgSrc, creationId) => {
        const resultsArea = document.getElementById('results-area');
        if (!resultsArea) return;
        
        const isGuest = !creationId;
        const downloadButton = `<a href="${imgSrc}" download="art-weaver-creation.png" class="inline-block bg-green-500 text-white font-bold py-2 px-6 rounded-lg hover:bg-green-600">Download</a>`;
        const publishForm = `
            <form id="publish-form" data-creation-id="${creationId}">
                <input type="text" id="publish-tags" placeholder="Add tags (e.g., space, cat)" class="w-full p-3 mb-4 bg-gray-100 dark:bg-gray-700 border rounded-md">
                <label class="inline-flex items-center mb-4"><input type="checkbox" id="publish-is-public" class="form-checkbox h-5 w-5"> <span class="ml-2">Make Public</span></label>
                <div class="flex justify-end gap-4">
                    <button type="button" id="publish-cancel-btn" class="bg-gray-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-gray-600">Save Privately</button>
                    <button type="submit" class="bg-blue-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-600">Save & Publish</button>
                </div>
            </form>`;

        resultsArea.innerHTML = `
            <div class="max-w-xl mx-auto bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
                <h2 class="text-2xl font-bold mb-4">Creation Complete!</h2>
                <img src="${imgSrc}" class="rounded-lg w-full mb-4">
                ${isGuest ? downloadButton : publishForm}
            </div>`;
        resultsArea.scrollIntoView({ behavior: 'smooth' });
    };

    async function handleGeneratorSubmit(endpoint, body, isFormData = false) {
        loadingModal.style.display = 'flex';
        let headers = {};
        if (!isFormData) {
            headers['Content-Type'] = 'application/json';
        }
        if (currentUser) {
            const token = await currentUser.getIdToken();
            headers['Authorization'] = `Bearer ${token}`;
        }

        try {
            const response = await fetch(endpoint, { method: 'POST', headers, body });
            const data = await response.json();
            if (!response.ok || data.error) {
                throw new Error(data.error || 'An unknown error occurred.');
            }
            const imgSrc = isFormData ? `data:image/jpeg;base64,${data.cartoon}` : data.image_data_url;
            showResult(imgSrc, data.creation_id);
        } catch (error) {
            showApiError(error.message);
        } finally {
            loadingModal.style.display = 'none';
        }
    }
    
    if (document.getElementById('upload-form')) {
        const uploadForm = document.getElementById('upload-form');
        const fileInput = document.getElementById('file-upload');
        fileInput.addEventListener('change', () => {
            document.getElementById('file-count').textContent = fileInput.files.length > 0 ? fileInput.files[0].name : '';
        });
        uploadForm.addEventListener('submit', e => {
            e.preventDefault();
            if (fileInput.files.length === 0) return showApiError('Please select a file to cartoonize.');
            const formData = new FormData();
            formData.append('file', fileInput.files[0]);
            handleGeneratorSubmit('/api/upload-cartoon', formData, true);
        });
    }

    if (document.getElementById('text-to-image-form')) {
        document.getElementById('text-to-image-form').addEventListener('submit', e => {
            e.preventDefault();
            const prompt = document.getElementById('prompt').value;
            if (!prompt.trim()) return showApiError('Please enter a prompt to generate an image.');
            handleGeneratorSubmit('/api/generate-from-text', JSON.stringify({ prompt }));
        });
    }

    const loadDashboard = async (user) => {
        const token = await user.getIdToken();
        const container = document.getElementById('dashboard-creations');
        if (!container) return;

        const res = await fetch('/api/user/creations', { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        
        document.getElementById('dashboard-loader').style.display = 'none';
        if (data.creations && data.creations.length > 0) {
            container.innerHTML = data.creations.map(c => `
                <div class="bg-gray-100 dark:bg-gray-800 rounded-lg shadow-md overflow-hidden group">
                     <a href="/creation/${c.id}"><img src="data:image/png;base64,${c.generated_image_b64}" class="w-full h-64 object-cover"></a>
                </div>`).join('');
        } else {
            container.innerHTML = `<p class="col-span-full text-center text-gray-500">You haven't made any creations yet.</p>`;
        }
    };
    
    setupThemeAndLocation();
});