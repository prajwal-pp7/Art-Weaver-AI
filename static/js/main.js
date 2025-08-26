document.addEventListener('DOMContentLoaded', function () {
    const auth = firebase.auth();
    const db = firebase.firestore();
    let userFavorites = new Set();

    const themeToggle = document.getElementById('theme-toggle');
    const loadingModal = document.getElementById('loading-modal');
    const authRequiredElements = document.querySelectorAll('.auth-required');
    const userInfoNav = document.getElementById('user-info-nav');
    const guestNav = document.getElementById('guest-nav');
    const navUsername = document.getElementById('nav-username');
    const navPoints = document.getElementById('nav-points');
    const notificationBellBtn = document.getElementById('notification-bell-btn');
    const notificationBadge = document.getElementById('notification-badge');
    const notificationDropdown = document.getElementById('notification-dropdown');

    const sunIcon = `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>`;
    const moonIcon = `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>`;

    const updateThemeIcon = () => { if (themeToggle) { themeToggle.innerHTML = document.documentElement.classList.contains('dark') ? sunIcon : moonIcon; } };
    if (themeToggle) { themeToggle.addEventListener('click', () => { document.documentElement.classList.toggle('dark'); localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light'); updateThemeIcon(); }); }
    updateThemeIcon();

    const showApiError = (errorMsg) => {
        const resultsArea = document.getElementById('results-area');
        resultsArea.innerHTML = `
            <div class="max-w-xl mx-auto bg-red-100 dark:bg-red-900 border border-red-400 text-red-700 dark:text-red-200 px-4 py-3 rounded-lg" role="alert">
              <strong class="font-bold">An Error Occurred!</strong>
              <span class="block sm:inline">${errorMsg}</span>
            </div>
        `;
        resultsArea.scrollIntoView({ behavior: 'smooth' });
    };

    auth.onAuthStateChanged(async user => {
        if (user && user.emailVerified) {
            guestNav.classList.add('hidden');
            userInfoNav.classList.remove('hidden');
            userInfoNav.classList.add('flex');
            document.getElementById('logout-btn').addEventListener('click', () => auth.signOut().then(() => window.location.href = '/login'));
            authRequiredElements.forEach(el => el.classList.remove('hidden'));
            
            const userDoc = await db.collection('users').doc(user.uid).get();
            if (userDoc.exists) {
                userFavorites = new Set(userDoc.data().favorites || []);
                const data = userDoc.data();
                navUsername.textContent = data.username || 'Profile';
                navPoints.textContent = `${data.points || 0} pts`;
            }
            
            initializeNotifications(user);

            if (document.getElementById('feed-container')) {
                const showFeedBtn = document.getElementById('show-feed-btn');
                const showGeneratorsBtn = document.getElementById('show-generators-btn');
                const feedContainer = document.getElementById('feed-container');
                const generatorsContainer = document.getElementById('generators-container');
                
                showFeedBtn.addEventListener('click', () => {
                    generatorsContainer.classList.add('hidden');
                    feedContainer.classList.remove('hidden');
                    showFeedBtn.classList.add('bg-blue-600', 'text-white');
                    showFeedBtn.classList.remove('bg-white', 'text-gray-900', 'dark:bg-gray-700', 'dark:text-white');
                    showGeneratorsBtn.classList.add('bg-white', 'text-gray-900', 'dark:bg-gray-700', 'dark:text-white');
                    showGeneratorsBtn.classList.remove('bg-blue-600', 'text-white');
                    fetchFeed(user);
                });
                showGeneratorsBtn.addEventListener('click', () => {
                    feedContainer.classList.add('hidden');
                    generatorsContainer.classList.remove('hidden');
                    showGeneratorsBtn.classList.add('bg-blue-600', 'text-white');
                    showGeneratorsBtn.classList.remove('bg-white', 'text-gray-900', 'dark:bg-gray-700', 'dark:text-white');
                    showFeedBtn.classList.add('bg-white', 'text-gray-900', 'dark:bg-gray-700', 'dark:text-white');
                    showFeedBtn.classList.remove('bg-blue-600', 'text-white');
                });

                showFeedBtn.click();
            }
        } else {
            guestNav.classList.remove('hidden');
            userInfoNav.classList.add('hidden');
            userInfoNav.classList.remove('flex');
            authRequiredElements.forEach(el => el.classList.add('hidden'));
            if (document.getElementById('feed-container')) {
                document.getElementById('feed-container').classList.add('hidden');
                document.getElementById('generators-container').classList.remove('hidden');
            }
        }
    });

    const initializeNotifications = (user) => {
        if (!notificationBellBtn) return;
        notificationBellBtn.addEventListener('click', () => notificationDropdown.classList.toggle('hidden'));
        fetchFriendRequests(user);
    };

    const fetchFriendRequests = async (user) => {
        const token = await user.getIdToken();
        fetch('/api/friends/requests', { headers: { 'Authorization': `Bearer ${token}` } })
            .then(res => res.json()).then(data => {
                const listEl = document.getElementById('friend-requests-list');
                if (data.requests && data.requests.length > 0) {
                    notificationBadge.textContent = data.requests.length;
                    notificationBadge.classList.remove('hidden');
                    listEl.innerHTML = data.requests.map(req => `
                        <div class="p-4 flex items-center justify-between border-b dark:border-gray-700">
                            <div class="flex items-center space-x-3">
                                <img src="${req.photoURL || 'https://placehold.co/40x40/7c3aed/ffffff?text=' + req.username[0].toUpperCase()}" class="w-10 h-10 rounded-full">
                                <span class="font-semibold">${req.username}</span>
                            </div>
                            <div class="flex space-x-2">
                                <button data-uid="${req.uid}" class="accept-friend-btn bg-green-500 text-white px-2 py-1 text-xs rounded hover:bg-green-600">Accept</button>
                                <button data-uid="${req.uid}" class="decline-friend-btn bg-red-500 text-white px-2 py-1 text-xs rounded hover:bg-red-600">Decline</button>
                            </div>
                        </div>
                    `).join('');
                } else {
                    notificationBadge.classList.add('hidden');
                    listEl.innerHTML = '<p class="p-4 text-sm text-gray-500">No new requests.</p>';
                }
            });
    };

    document.addEventListener('click', async (e) => {
        const user = auth.currentUser;
        if (!user) return;
        const token = await user.getIdToken();
        const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

        if (e.target.matches('.accept-friend-btn') || e.target.matches('.decline-friend-btn')) {
            const requesterId = e.target.dataset.uid;
            const action = e.target.matches('.accept-friend-btn') ? 'accept' : 'decline';
            fetch(`/api/friends/handle/${requesterId}`, { method: 'POST', headers, body: JSON.stringify({ action }) })
                .then(res => res.json()).then(data => {
                    if (data.success) fetchFriendRequests(user);
                });
        }

        if (e.target.closest('.favorite-btn')) {
            const button = e.target.closest('.favorite-btn');
            const creationId = button.dataset.id;
            const isFavorited = userFavorites.has(creationId);
            const action = isFavorited ? 'unfavorite' : 'favorite';
            fetch(`/api/creations/${creationId}/favorite`, { method: 'POST', headers, body: JSON.stringify({ action }) })
                .then(res => res.json()).then(data => {
                    if (data.success) {
                        if (isFavorited) { userFavorites.delete(creationId); } else { userFavorites.add(creationId); }
                        updateFavoriteIcons();
                    }
                });
        }
    });

    const fetchFeed = async (user) => {
        const token = await user.getIdToken();
        const feedContainer = document.getElementById('feed-container');
        feedContainer.innerHTML = '<div class="loader mx-auto"></div>';
        fetch('/api/feed', { headers: { 'Authorization': `Bearer ${token}` } })
            .then(res => res.json()).then(data => {
                if (!data.feed || data.feed.length === 0) {
                    feedContainer.innerHTML = '<p class="text-center text-gray-500 py-10">Your feed is empty. Find and add friends to see their public creations here!</p>';
                    return;
                }
                feedContainer.innerHTML = data.feed.map(item => `
                    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md mb-6">
                        <div class="p-4 flex items-center justify-between">
                            <a href="/user/${item.creator_username}" class="flex items-center space-x-3">
                                <img src="${item.creator_photoURL || 'https://placehold.co/40x40/7c3aed/ffffff?text=' + (item.creator_username ? item.creator_username[0].toUpperCase() : 'U')}" class="w-10 h-10 rounded-full">
                                <span class="font-bold">${item.creator_username}</span>
                            </a>
                            <button class="favorite-btn p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700" data-id="${item.id}"></button>
                        </div>
                        <a href="/creation/${item.id}"><img src="data:image/png;base64,${item.generated_image_b64}" class="w-full"></a>
                        <div class="p-4">
                            <p class="font-mono bg-gray-100 dark:bg-gray-700 p-2 rounded text-xs">"${item.prompt || 'Cartoonized Image'}"</p>
                        </div>
                    </div>`).join('');
                updateFavoriteIcons();
            });
    };

    if (document.getElementById('upload-form')) {
        const fileInput = document.getElementById('file-upload');
        const fileCountSpan = document.getElementById('file-count');
        fileInput.addEventListener('change', () => { fileCountSpan.textContent = fileInput.files.length > 0 ? `${fileInput.files[0].name}` : ''; });
        
        document.getElementById('upload-form').addEventListener('submit', async e => {
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
                    if (data.creation_id) {
                        showPublishModal(data.creation_id, imgSrc);
                    } else {
                        showGuestResult(imgSrc);
                    }
                })
                .finally(() => { loadingModal.classList.add('hidden'); fileInput.value = ''; fileCountSpan.textContent = ''; });
        });

        document.getElementById('text-to-image-form').addEventListener('submit', async e => {
            e.preventDefault(); const prompt = document.getElementById('prompt').value; if(!prompt) { showApiError('Please enter a prompt first.'); return; }
            loadingModal.classList.remove('hidden');
            const user = auth.currentUser;
            const token = user ? await user.getIdToken() : null;
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            fetch('/api/generate-from-text', { method: 'POST', headers, body: JSON.stringify({ prompt }) })
                .then(res => res.json()).then(data => {
                    if (data.error) { showApiError(data.error); return; }
                    if (data.creation_id) {
                        showPublishModal(data.creation_id, data.image_data_url);
                    } else {
                        showGuestResult(data.image_data_url);
                    }
                })
                .finally(() => { loadingModal.classList.add('hidden'); });
        });
    }
    
    const showGuestResult = (imgSrc) => {
        const resultsArea = document.getElementById('results-area');
        resultsArea.innerHTML = `
            <div class="max-w-xl mx-auto bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg text-center">
                <h2 class="text-2xl font-bold mb-4">Here's Your Creation!</h2>
                <img src="${imgSrc}" class="rounded-lg w-full mb-4">
                <a href="${imgSrc}" download="art-weaver-creation.png" class="inline-block bg-green-500 text-white font-bold py-2 px-6 rounded-lg hover:bg-green-600">Download</a>
            </div>
        `;
        resultsArea.scrollIntoView({ behavior: 'smooth' });
    };

    const showPublishModal = (creationId, imgSrc) => {
        const modal = document.getElementById('publish-modal');
        document.getElementById('publish-preview-img').src = imgSrc;
        document.getElementById('publish-creation-id').value = creationId;
        document.getElementById('publish-tags').value = '';
        document.getElementById('publish-is-public').checked = false;
        modal.classList.remove('hidden');
    };

    const publishForm = document.getElementById('publish-form');
    if (publishForm) {
        publishForm.addEventListener('submit', e => { e.preventDefault(); saveAndClosePublishModal(true); });
        document.getElementById('publish-cancel-btn').addEventListener('click', () => { saveAndClosePublishModal(false); });
    }

    const saveAndClosePublishModal = async (isPublishing) => {
        const user = auth.currentUser; if (!user) return;
        const token = await user.getIdToken();
        const modal = document.getElementById('publish-modal');
        const creationId = document.getElementById('publish-creation-id').value;
        const isPublic = document.getElementById('publish-is-public').checked;
        const tags = document.getElementById('publish-tags').value;
        fetch(`/api/creations/${creationId}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ is_public: isPublic || isPublishing, tags: tags })
        }).then(res => res.json()).then(data => {
            if (data.success) {
                modal.classList.add('hidden');
            }
        });
    };

    const heartIconEmpty = `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.5l1.318-1.182a4.5 4.5 0 116.364 6.364L12 20.364l-7.682-7.682a4.5 4.5 0 010-6.364z"></path></svg>`;
    const heartIconFilled = `<svg class="w-6 h-6 text-red-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 20.364l-7.682-7.682a4.5 4.5 0 010-6.364L12 7.5l7.682-1.182a4.5 4.5 0 010 6.364L12 20.364z"></path></svg>`;
    function updateFavoriteIcons() {
        document.querySelectorAll('.favorite-btn').forEach(btn => {
            btn.innerHTML = userFavorites.has(btn.dataset.id) ? heartIconFilled : heartIconEmpty;
        });
    }

    const locationDisplay = document.getElementById('location-display');
    if (locationDisplay) {
        fetch('https://ipapi.co/json/').then(res => res.json()).then(data => {
            if (data.city && data.country_name) {
                locationDisplay.textContent = `${data.city}, ${data.country_name}`;
                locationDisplay.href = `https://maps.google.com/?q=${data.latitude},${data.longitude}`;
            } else {
                locationDisplay.textContent = 'Location unavailable';
            }
        }).catch(() => { locationDisplay.textContent = 'Location unavailable'; });
    }
});