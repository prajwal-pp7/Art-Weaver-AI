document.addEventListener('DOMContentLoaded', function () {
    const auth = firebase.auth();
    const db = firebase.firestore();

    const loginContainer = document.getElementById('login-container');
    const registerContainer = document.getElementById('register-container');
    const showRegisterLink = document.getElementById('show-register');
    const showLoginLink = document.getElementById('show-login');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');

    const showRegisterForm = () => {
        loginContainer.classList.add('hidden');
        registerContainer.classList.remove('hidden');
    };

    const showLoginForm = () => {
        registerContainer.classList.add('hidden');
        loginContainer.classList.remove('hidden');
    };

    showRegisterLink.addEventListener('click', (e) => {
        e.preventDefault();
        window.history.pushState(null, "Register", "/register");
        showRegisterForm();
    });

    showLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        window.history.pushState(null, "Login", "/login");
        showLoginForm();
    });

    if (window.location.pathname === '/register') {
        showRegisterForm();
    } else {
        showLoginForm();
    }

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('register-username').value.trim();
        const email = document.getElementById('register-email').value.trim();
        const password = document.getElementById('register-password').value;
        const messageEl = document.getElementById('register-message');
        
        messageEl.textContent = 'Checking username...';
        messageEl.classList.remove('text-red-500', 'text-green-500');

        try {
            const usernameCheck = await fetch('/api/check_username', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username })
            });

            if (!usernameCheck.ok) {
                // This will catch server errors (like 500 Internal Server Error)
                throw new Error('Server error checking username. Please try again later.');
            }

            const { isAvailable, error } = await usernameCheck.json();

            if (error) {
                // This will catch specific errors sent from the backend
                throw new Error(error);
            }

            if (!isAvailable) {
                messageEl.textContent = 'Username is already taken.';
                messageEl.classList.add('text-red-500');
                return;
            }

            messageEl.textContent = 'Creating account...';
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;

            await user.sendEmailVerification();
            messageEl.textContent = 'Success! Please check your email to verify your account.';
            messageEl.classList.add('text-green-500');

            await db.collection('users').doc(user.uid).set({
                username: username,
                email: email,
                points: 10,
                photoURL: '',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            setTimeout(() => { showLoginForm(); }, 5000);

        } catch (error) {
            // This single catch block will handle all errors from fetch, Firebase, etc.
            messageEl.textContent = error.message;
            messageEl.classList.add('text-red-500');
        }
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const identifier = document.getElementById('login-identifier').value.trim();
        const password = document.getElementById('login-password').value;
        const errorEl = document.getElementById('login-error');
        errorEl.textContent = '';

        try {
            let email = identifier;
            if (!identifier.includes('@')) {
                const querySnapshot = await db.collection('users').where('username', '==', identifier).limit(1).get();
                if (querySnapshot.empty) {
                    errorEl.textContent = 'User not found.';
                    return;
                }
                email = querySnapshot.docs[0].data().email;
            }

            const userCredential = await auth.signInWithEmailAndPassword(email, password);
            
            if (!userCredential.user.emailVerified) {
                errorEl.textContent = 'Please verify your email before logging in.';
                await auth.signOut();
                return;
            }
            window.location.href = '/'; 

        } catch (error) {
            errorEl.textContent = 'Invalid credentials. Please try again.';
        }
    });
});
