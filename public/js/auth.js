function showAuthMessage(message, isError = false) {
    const status = document.getElementById('authMessage');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('error', isError);
}

function openAuthModal(mode = 'login') {
    const modal = document.getElementById('authModal');
    if (!modal) {
        window.location.assign(`index.html?auth=${mode}`);
        return;
    }
    const forgotPanel = document.getElementById('forgotPasswordPanel');
    if (forgotPanel) forgotPanel.hidden = true;
    setAuthMode(mode);
    modal.hidden = false;
    modal.classList.add('active');
    showAuthMessage('');
    const input = document.getElementById(mode === 'register' ? 'registerName' : 'loginEmail');
    input?.focus();
}

function closeAuthModal() {
    const modal = document.getElementById('authModal');
    if (!modal) return;
    modal.classList.remove('active');
    modal.hidden = true;
}

function setAuthMode(mode) {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    if (!loginForm || !registerForm) return;
    const isRegister = mode === 'register';
    loginForm.hidden = isRegister;
    registerForm.hidden = !isRegister;
    document.getElementById('authModalTitle').textContent = isRegister ? 'ULmovi hisobini yarating' : 'Hisobingizga kiring';
    document.querySelectorAll('.auth-tabs [data-auth-tab]').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.authTab === mode);
    });
    showAuthMessage('');
}

function addNavigationLink(container, label, href, className = '') {
    const link = document.createElement('a');
    link.textContent = label;
    link.href = href;
    if (className) link.className = className;
    container.append(link);
}

function renderAuthenticationNavigation(user) {
    const mainNav = document.getElementById('mainNav');
    const navUserArea = document.getElementById('navUserArea');
    const guestActions = document.querySelector('.hero-actions');
    window.currentUser = user || null;
    if (!mainNav || !navUserArea) {
        window.dispatchEvent(new CustomEvent('ulmovi:auth-changed', { detail: user || null }));
        return;
    }
    mainNav.replaceChildren();
    navUserArea.replaceChildren();

    addNavigationLink(mainNav, 'Bosh sahifa', 'index.html');
    addNavigationLink(mainNav, 'Kinolar', '#latest');
    addNavigationLink(mainNav, 'Janrlar', '#genreFilter');

    if (!user) {
        const login = document.createElement('button');
        login.type = 'button';
        login.className = 'nav-auth-button';
        login.textContent = 'Kirish';
        login.dataset.authOpen = 'login';
        const register = document.createElement('button');
        register.type = 'button';
        register.className = 'nav-auth-button primary';
        register.textContent = 'Ro‘yxatdan o‘tish';
        register.dataset.authOpen = 'register';
        navUserArea.append(login, register);
        if (guestActions) guestActions.hidden = false;
    } else {
        if (user.role === 'user') {
            addNavigationLink(mainNav, 'Profil', 'profile.html');
        } else if (user.role === 'admin') {
            addNavigationLink(mainNav, 'Kinolarni boshqarish', 'admin.html#moviesTab');
            addNavigationLink(mainNav, 'Izohlarni boshqarish', 'admin.html#commentsTab');
            addNavigationLink(mainNav, 'Admin paneli', 'admin.html', 'admin-btn');
        } else if (user.role === 'super_admin') {
            addNavigationLink(mainNav, 'Kinolarni boshqarish', 'admin.html#moviesTab');
            addNavigationLink(mainNav, 'Foydalanuvchilar', 'admin.html#rolesTab');
            addNavigationLink(mainNav, 'Administratorlar', 'admin.html#adminsTab');
            addNavigationLink(mainNav, 'Tizim sozlamalari', 'admin.html#settingsTab');
            addNavigationLink(mainNav, 'Super Admin paneli', 'admin.html', 'admin-btn');
        }
        const name = document.createElement('span');
        name.className = 'nav-user-name';
        name.textContent = user.name;
        const logoutButton = document.createElement('button');
        logoutButton.type = 'button';
        logoutButton.className = 'nav-logout-btn';
        logoutButton.textContent = 'Chiqish';
        logoutButton.addEventListener('click', logout);
        navUserArea.append(name, logoutButton);
        if (guestActions) guestActions.hidden = true;
    }

    window.dispatchEvent(new CustomEvent('ulmovi:auth-changed', { detail: user || null }));
}

async function refreshAuthentication() {
    const result = await fetchAPI('auth_me');
    if (!result.success) throw new Error(result.error || 'Hisob ma’lumotini tekshirib bo‘lmadi.');
    renderAuthenticationNavigation(result.data);
    return result.data;
}

async function requireAdmin() {
    try {
        const user = await refreshAuthentication();
        if (!user) {
            window.location.replace('index.html?auth=login&next=admin.html');
            return null;
        }
        if (!['admin', 'super_admin'].includes(user.role)) {
            window.location.replace('index.html');
            return null;
        }
        const nameDisplay = document.getElementById('adminNameDisplay');
        if (nameDisplay) nameDisplay.textContent = user.name;
        return user;
    } catch (error) {
        showAuthMessage(error.message || 'Hisob ma’lumotini tekshirib bo‘lmadi.', true);
        window.location.replace('index.html?auth=login&next=admin.html');
        return null;
    }
}

async function finishAuthentication(result, form) {
    if (!result.success) throw new Error(result.error || 'Amal bajarilmadi.');
    form.reset();
    const user = await refreshAuthentication();
    closeAuthModal();
    if (user && ['admin', 'super_admin'].includes(user.role)) {
        window.location.assign('admin.html');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    document.querySelectorAll('[data-logout]').forEach((button) => {
        button.addEventListener('click', logout);
    });
    document.addEventListener('click', (event) => {
        const authButton = event.target.closest('[data-auth-open]');
        if (authButton) {
            openAuthModal(authButton.dataset.authOpen);
            return;
        }
        const authTab = event.target.closest('.auth-tabs [data-auth-tab]');
        if (authTab) {
            setAuthMode(authTab.dataset.authTab);
            return;
        }
        if (event.target.closest('#closeAuthModal')) closeAuthModal();
        if (event.target.closest('#forgotPasswordBtn')) {
            document.getElementById('loginForm').hidden = true;
            document.getElementById('registerForm').hidden = true;
            document.getElementById('forgotPasswordPanel').hidden = false;
            document.getElementById('authModalTitle').textContent = 'Parolni tiklash';
            showAuthMessage('');
        }
        if (event.target.closest('#forgotPasswordPanel [data-auth-tab]')) {
            document.getElementById('forgotPasswordPanel').hidden = true;
            setAuthMode('login');
        }
    });

    const authModal = document.getElementById('authModal');
    if (authModal) {
        authModal.addEventListener('click', (event) => {
            if (event.target === authModal) closeAuthModal();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && authModal.classList.contains('active')) closeAuthModal();
        });
    }

    document.querySelectorAll('[data-toggle-password]').forEach((button) => {
        button.addEventListener('click', () => {
            const input = document.getElementById(button.dataset.togglePassword);
            const reveal = input.type === 'password';
            input.type = reveal ? 'text' : 'password';
            button.textContent = reveal ? 'Yashirish' : 'Ko‘rsatish';
            button.setAttribute('aria-label', reveal ? 'Parolni yashirish' : 'Parolni ko‘rsatish');
        });
    });

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!loginForm.reportValidity()) return;
            const button = loginForm.querySelector('button[type="submit"]');
            button.disabled = true;
            button.textContent = 'Tekshirilmoqda…';
            showAuthMessage('');
            try {
                const values = Object.fromEntries(new FormData(loginForm));
                const result = await fetchAPI('auth_login', 'POST', values);
                await finishAuthentication(result, loginForm);
            } catch (error) {
                showAuthMessage(error.message || 'Tizimga kirib bo‘lmadi.', true);
            } finally {
                button.disabled = false;
                button.textContent = 'Kirish';
            }
        });
    }

    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!registerForm.reportValidity()) return;
            const button = registerForm.querySelector('button[type="submit"]');
            button.disabled = true;
            button.textContent = 'Hisob yaratilmoqda…';
            showAuthMessage('');
            try {
                const values = Object.fromEntries(new FormData(registerForm));
                const result = await fetchAPI('auth_register', 'POST', values);
                await finishAuthentication(result, registerForm);
            } catch (error) {
                showAuthMessage(error.message || 'Hisob yaratilmadi.', true);
            } finally {
                button.disabled = false;
                button.textContent = 'Hisob yaratish';
            }
        });
    }

    const forgotPasswordForm = document.getElementById('forgotPasswordForm');
    if (forgotPasswordForm) {
        forgotPasswordForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!forgotPasswordForm.reportValidity()) return;
            const button = forgotPasswordForm.querySelector('button[type="submit"]');
            button.disabled = true;
            showAuthMessage('');
            try {
                const result = await fetchAPI('auth_forgot_password', 'POST', {
                    email: new FormData(forgotPasswordForm).get('email'),
                });
                if (!result.success) throw new Error(result.error || 'So‘rov yuborilmadi.');
                forgotPasswordForm.reset();
                showAuthMessage(result.message, false);
            } catch (error) {
                showAuthMessage(error.message || 'Parolni tiklash so‘rovi yuborilmadi.', true);
            } finally {
                button.disabled = false;
            }
        });
    }

    try {
        await refreshAuthentication();
    } catch (error) {
        showAuthMessage(error.message || 'Hisob ma’lumotini tekshirib bo‘lmadi.', true);
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === 'login' || params.get('auth') === 'register') {
        openAuthModal(params.get('auth'));
        const next = params.get('next');
        const cleanUrl = new URL(window.location.href);
        cleanUrl.search = '';
        window.history.replaceState({}, '', cleanUrl.pathname + cleanUrl.hash);
        if (next === 'admin.html') showAuthMessage('Admin paneliga kirish uchun administrator hisobidan foydalaning.');
    }
});

async function logout() {
    try {
        const result = await fetchAPI('auth_logout', 'POST');
        if (!result.success) throw new Error(result.error || 'Tizimdan chiqib bo‘lmadi.');
        window.currentUser = null;
        renderAuthenticationNavigation(null);
        closeAuthModal();
        if (!document.getElementById('mainNav')) window.location.replace('index.html');
    } catch (error) {
        showAuthMessage(error.message || 'Tizimdan chiqib bo‘lmadi.', true);
    }
}
