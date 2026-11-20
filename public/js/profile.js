document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('profileForm');
    const message = document.getElementById('profileMessage');
    const submit = form.querySelector('button[type="submit"]');
    const settings = document.getElementById('profileSettings');

    const videoAdConsentKey = 'ulmovi.videoAdConsent.v1';
    const videoAdConsentInput = document.getElementById('videoAdConsent');
    const videoAdConsentStatus = document.getElementById('videoAdConsentStatus');

    function loadVideoAdConsent() {
        try {
            videoAdConsentInput.checked = localStorage.getItem(videoAdConsentKey) === 'granted';
        } catch {
            videoAdConsentInput.checked = false;
        }
        videoAdConsentStatus.textContent = videoAdConsentInput.checked
            ? 'Rozilik saqlandi. Video reklama faqat mavjud bo‘lsa va siz rozilikni bekor qilmagan bo‘lsangiz ko‘rsatilishi mumkin.'
            : 'Video reklama sukut bo‘yicha o‘chirilgan.';
    }

    videoAdConsentInput.addEventListener('change', () => {
        try {
            if (videoAdConsentInput.checked) localStorage.setItem(videoAdConsentKey, 'granted');
            else localStorage.removeItem(videoAdConsentKey);
            videoAdConsentStatus.textContent = videoAdConsentInput.checked
                ? 'Roziligingiz ushbu brauzerda eslab qolindi. Uni istalgan vaqtda bekor qilishingiz mumkin.'
                : 'Rozilik bekor qilindi. Video reklama ko‘rsatilmaydi.';
        } catch {
            videoAdConsentInput.checked = false;
            videoAdConsentStatus.textContent = 'Brauzer sozlamalari rozilikni saqlashga ruxsat bermadi.';
        }
    });

    loadVideoAdConsent();

    function setMessage(text, isError = false) {
        message.textContent = text || '';
        message.classList.toggle('error', isError);
    }

    function safePosterUrl(movie) {
        if (movie.has_poster) {
            const url = new URL('../backend/index.php', window.location.href);
            url.searchParams.set('action', 'movie_poster');
            url.searchParams.set('id', String(movie.id));
            return url.href;
        }
        if (movie.poster_url) {
            try {
                const url = new URL(movie.poster_url);
                return url.protocol === 'https:' ? url.href : '';
            } catch {
                return '';
            }
        }
        return '';
    }

    function playUrl(movie) {
        const url = new URL('index.html', window.location.href);
        url.searchParams.set('play', String(movie.id));
        const resume = Number(movie.resume_seconds || 0);
        if (resume > 0) url.searchParams.set('resume', String(Math.floor(resume)));
        return url.href;
    }

    function formatTime(seconds) {
        const total = Math.max(0, Math.floor(Number(seconds) || 0));
        const hours = Math.floor(total / 3600);
        const minutes = Math.floor((total % 3600) / 60);
        const secs = total % 60;
        return hours ? `${hours} soat ${minutes} daqiqa` : `${minutes} daqiqa ${secs} soniya`;
    }

    function createMovieCard(movie, type) {
        const card = document.createElement('article');
        card.className = 'profile-movie-card';
        const poster = document.createElement('a');
        poster.className = 'profile-poster';
        poster.href = playUrl(movie);
        poster.setAttribute('aria-label', `${movie.title} filmini tomosha qilish`);
        const imageUrl = safePosterUrl(movie);
        if (imageUrl) {
            const image = document.createElement('img');
            image.src = imageUrl;
            image.alt = `${movie.title} muqovasi`;
            image.loading = 'lazy';
            image.addEventListener('error', () => {
                image.remove();
                poster.classList.add('poster-fallback');
                poster.dataset.initial = (movie.title || 'U').trim().slice(0, 1).toLocaleUpperCase();
            }, { once: true });
            poster.append(image);
        } else {
            poster.classList.add('poster-fallback');
            poster.dataset.initial = (movie.title || 'U').trim().slice(0, 1).toLocaleUpperCase();
        }

        const details = document.createElement('div');
        details.className = 'profile-movie-details';
        const title = document.createElement('h3');
        title.textContent = movie.title || 'Nomsiz kino';
        const meta = document.createElement('p');
        meta.className = 'profile-movie-meta';
        meta.textContent = [movie.year, movie.genre].filter(Boolean).join(' · ') || 'Kino';
        details.append(title, meta);

        if (type === 'continue') {
            const duration = Number(movie.duration_seconds || 0);
            const position = Number(movie.resume_seconds || 0);
            const progress = document.createElement('div');
            progress.className = 'profile-progress';
            const bar = document.createElement('span');
            bar.style.width = `${duration > 0 ? Math.min(100, (position / duration) * 100) : 0}%`;
            progress.append(bar);
            const time = document.createElement('p');
            time.className = 'profile-progress-time';
            time.textContent = `${formatTime(position)} / ${formatTime(duration)}`;
            details.append(progress, time);
        } else if (movie.watched_at) {
            const watched = document.createElement('p');
            watched.className = 'profile-movie-meta';
            const date = new Date(`${movie.watched_at.replace(' ', 'T')}Z`);
            watched.textContent = Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('uz-UZ');
            details.append(watched);
        }

        const action = document.createElement('a');
        action.className = 'profile-play-button';
        action.href = playUrl(movie);
        action.textContent = type === 'continue' ? '▶ Davom ettirish' : '▶ Tomosha qilish';
        details.append(action);
        card.append(poster, details);
        return card;
    }

    function renderMovies(containerId, movies, type, emptyText) {
        const container = document.getElementById(containerId);
        container.replaceChildren();
        if (!movies.length) {
            const empty = document.createElement('div');
            empty.className = 'profile-empty';
            const icon = document.createElement('span');
            icon.textContent = type === 'favorites' ? '♡' : type === 'continue' ? '▷' : '◷';
            const text = document.createElement('p');
            text.textContent = emptyText;
            empty.append(icon, text);
            container.append(empty);
            return;
        }
        movies.forEach((movie) => container.append(createMovieCard(movie, type)));
    }

    async function loadDashboard() {
        const result = await fetchAPI('profile_dashboard');
        if (!result.success) throw new Error(result.error || 'Profil ma’lumotlarini olib bo‘lmadi.');
        const data = result.data;
        const user = data.user;
        document.getElementById('profileTitle').textContent = user.name || 'Foydalanuvchi';
        document.getElementById('profileEmail').textContent = user.email || '';
        document.getElementById('profileAvatar').textContent = (user.name || 'U').trim().slice(0, 1).toLocaleUpperCase();
        document.getElementById('profileJoined').textContent = user.created_at
            ? `VIDORA a’zosi: ${new Date(`${user.created_at.replace(' ', 'T')}Z`).toLocaleDateString('uz-UZ')}`
            : 'VIDORA foydalanuvchisi';
        document.getElementById('watchedCount').textContent = data.stats.watched;
        document.getElementById('favoritesCount').textContent = data.stats.favorites;
        document.getElementById('commentsCount').textContent = data.stats.comments;
        form.elements.name.value = user.name || '';
        form.elements.email.value = user.email || '';
        renderMovies('continueGrid', data.continue_watching || [], 'continue', 'Hozircha davom ettiriladigan kino yo‘q. Kino tomosha qilishni boshlang!');
        renderMovies('favoritesGrid', data.favorites || [], 'favorites', 'Sevimlilarga qo‘shilgan kinolar hozircha yo‘q.');
        renderMovies('historyGrid', data.history || [], 'history', 'Ko‘rish tarixi hozircha bo‘sh.');
    }

    document.getElementById('editProfileButton').addEventListener('click', () => {
        settings.classList.add('is-editing');
        settings.scrollIntoView({ behavior: 'smooth', block: 'start' });
        document.getElementById('profileName').focus({ preventScroll: true });
    });
    document.getElementById('cancelProfileEdit').addEventListener('click', () => {
        form.reset();
        loadDashboard().catch((error) => setMessage(error.message, true));
        settings.classList.remove('is-editing');
        setMessage('');
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        submit.disabled = true;
        submit.textContent = 'Saqlanmoqda…';
        setMessage('');
        const values = Object.fromEntries(new FormData(form));
        try {
            const result = await fetchAPI('auth_profile_update', 'POST', values);
            if (!result.success) throw new Error(result.error || 'Profil yangilanmadi.');
            form.elements.current_password.value = '';
            form.elements.new_password.value = '';
            await loadDashboard();
            if (typeof window.refreshAuthentication === 'function') await window.refreshAuthentication();
            settings.classList.remove('is-editing');
            setMessage(result.message || 'Profil yangilandi.');
        } catch (error) {
            setMessage(error.message || 'Profil yangilanmadi.', true);
        } finally {
            submit.disabled = false;
            submit.textContent = 'O‘zgarishlarni saqlash';
        }
    });

    try {
        await loadDashboard();
    } catch (error) {
        setMessage(error.message || 'Profilni yuklab bo‘lmadi.', true);
        if (/tizimga kir|sessiya|hisob/i.test(error.message || '')) {
            window.location.replace('index.html?auth=login');
        }
    }
});
