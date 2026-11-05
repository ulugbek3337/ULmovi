document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('profileForm');
    const message = document.getElementById('profileMessage');
    const submit = form.querySelector('button[type="submit"]');

    try {
        const result = await fetchAPI('auth_me');
        if (!result.success) throw new Error(result.error || 'Profilni tekshirib bo‘lmadi.');
        if (!result.data) {
            window.location.replace('index.html?auth=login');
            return;
        }
        form.elements.name.value = result.data.name;
        form.elements.email.value = result.data.email;
    } catch (error) {
        message.textContent = error.message || 'Profilni yuklab bo‘lmadi.';
        message.classList.add('error');
        submit.disabled = true;
        return;
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        submit.disabled = true;
        message.textContent = '';
        const data = Object.fromEntries(new FormData(form));
        try {
            const result = await fetchAPI('auth_profile_update', 'POST', data);
            if (!result.success) throw new Error(result.error || 'Profil yangilanmadi.');
            form.elements.current_password.value = '';
            form.elements.new_password.value = '';
            message.textContent = result.message;
            message.classList.remove('error');
        } catch (error) {
            message.textContent = error.message || 'Profil yangilanmadi.';
            message.classList.add('error');
        } finally {
            submit.disabled = false;
        }
    });
});
