document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('resetPasswordForm');
    const message = document.getElementById('resetPasswordMessage');
    const token = new URLSearchParams(window.location.search).get('token') || '';
    window.history.replaceState({}, '', window.location.pathname);

    function showMessage(text, isError = false) {
        message.textContent = text;
        message.classList.toggle('error', isError);
    }

    if (!/^[a-f0-9]{64}$/.test(token)) {
        showMessage('Tiklash havolasi noto‘g‘ri yoki to‘liq emas.', true);
        return;
    }

    try {
        const validation = await fetchAPI('auth_reset_validate', 'GET', { token });
        if (!validation.success) throw new Error(validation.error || 'Tiklash havolasi yaroqsiz.');
        form.hidden = false;
        showMessage(validation.message);
    } catch (error) {
        showMessage(error.message || 'Tiklash havolasini tekshirib bo‘lmadi.', true);
        return;
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
            const result = await fetchAPI('auth_reset_password', 'POST', {
                token,
                password: form.elements.password.value,
                password_confirmation: form.elements.password_confirmation.value,
            });
            if (!result.success) throw new Error(result.error || 'Parol yangilanmadi.');
            form.hidden = true;
            showMessage(result.message);
        } catch (error) {
            showMessage(error.message || 'Parol yangilanmadi.', true);
            button.disabled = false;
        }
    });
});