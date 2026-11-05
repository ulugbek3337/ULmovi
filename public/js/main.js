document.addEventListener('DOMContentLoaded', async () => {
    const searchInput = document.getElementById('searchInput');
    const genreFilter = document.getElementById('genreFilter');
    const status = document.getElementById('movieStatus');
    const playerModal = document.getElementById('playerModal');
    const videoContainer = document.getElementById('videoContainer');
    const detailModal = document.getElementById('movieDetailModal');
    const detailContent = document.getElementById('movieDetailContent');
    const loadMoreButton = document.getElementById('loadMoreBtn');
    const pageSize = 24;
    let movies = [];
    let offset = 0;
    let hasMore = false;
    let searchTimer = null;
    let activeMovie = null;
    let noticeTimer = null;

    function apiUrl(action, params = {}) {
        const url = new URL(API_URL);
        url.searchParams.set('action', action);
        Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
        return url.href;
    }

    function posterUrl(movie) {
        if (movie.has_poster) return apiUrl('movie_poster', { id: movie.id });
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

    function genreLabel(genre) {
        return ({
            action: 'Jangari',
            comedy: 'Komediya',
            drama: 'Drama',
            thriller: 'Triller',
            animation: 'Animatsiya',
            documentary: 'Hujjatli',
            romance: 'Romantik',
            adventure: 'Sarguzasht',
            other: 'Boshqa',
        })[genre] || genre || 'Janr ko‘rsatilmagan';
    }

    function makeMovieCard(movie) {
        const card = document.createElement('article');
        card.className = 'movie-card';
        const posterWrap = document.createElement('div');
        posterWrap.className = 'movie-poster-wrap';
        const image = document.createElement('img');
        image.className = 'movie-poster';
        image.src = posterUrl(movie);
        image.alt = `${movie.title} posteri`;
        image.loading = 'lazy';
        image.addEventListener('error', () => {
            image.hidden = true;
            posterWrap.classList.add('poster-placeholder');
            posterWrap.dataset.initial = (movie.title || 'U').trim().slice(0, 1).toUpperCase();
        }, { once: true });
        posterWrap.append(image);
        const play = document.createElement('button');
        play.className = 'poster-play';
        play.type = 'button';
        play.textContent = '▶';
        play.setAttribute('aria-label', `${movie.title} filmini tomosha qilish`);
        play.disabled = !movie.qualities?.length && !movie.video_url;
        play.addEventListener('click', () => openPlayer(movie));
        posterWrap.append(play);

        const body = document.createElement('div');
        body.className = 'movie-card-body';
        const title = document.createElement('h3');
        title.textContent = movie.title || 'Nomsiz kino';
        const metadata = document.createElement('p');
        metadata.className = 'movie-meta';
        metadata.textContent = `${genreLabel(movie.genre)} · ${movie.year || 'Yil ko‘rsatilmagan'}`;
        const ratingRow = document.createElement('div');
        ratingRow.className = 'movie-rating-row';
        const rating = document.createElement('span');
        rating.textContent = `★ ${Number(movie.average_rating || movie.rating || 0).toFixed(1)} (${movie.rating_count || 0})`;
        const like = document.createElement('button');
        like.className = `like-button${movie.is_liked ? ' liked' : ''}`;
        like.type = 'button';
        like.setAttribute('aria-label', 'Kinoni yoqtirish');
        like.textContent = `${movie.is_liked ? '♥' : '♡'} ${movie.likes_count || 0}`;
        like.addEventListener('click', async () => {
            if (!window.currentUser) {
                showGuestRestriction();
                return;
            }
            try {
                const result = await fetchAPI('toggle_like', 'POST', { movie_id: movie.id });
                if (!result.success) throw new Error(result.error);
                movie.is_liked = result.data.liked;
                movie.likes_count = result.data.count;
                like.classList.toggle('liked', movie.is_liked);
                like.textContent = `${movie.is_liked ? '♥' : '♡'} ${movie.likes_count}`;
            } catch (error) {
                showNotice(error.message || 'Yoqtirish amali bajarilmadi.');
            }
        });
        ratingRow.append(rating, like);
        const details = document.createElement('button');
        details.className = 'details-button';
        details.type = 'button';
        details.textContent = 'Batafsil';
        details.addEventListener('click', () => showDetails(movie));
        body.append(title, metadata, ratingRow, details);
        card.append(posterWrap, body);
        return card;
    }

    function renderGrid(containerId, list, emptyText = 'Bu bo‘limda hozircha kino yo‘q.') {
        const container = document.getElementById(containerId);
        container.replaceChildren();
        if (!list.length) {
            const empty = document.createElement('p');
            empty.className = 'empty-message';
            empty.textContent = emptyText;
            container.append(empty);
            return;
        }
        list.forEach((movie) => container.append(makeMovieCard(movie)));
    }

    function renderMovies() {
        const search = searchInput.value.trim().toLocaleLowerCase();
        const genre = genreFilter.value;
        const filtered = movies.filter((movie) => {
            const text = `${movie.title || ''} ${movie.genre || ''} ${movie.description || ''}`.toLocaleLowerCase();
            return (!search || text.includes(search)) && (!genre || movie.genre === genre);
        });
        renderGrid('moviesGrid', filtered, search || genre ? 'Qidiruv bo‘yicha kino topilmadi.' : 'Hozircha kinolar qo‘shilmagan.');
        renderGrid('popularGrid', [...filtered].sort((a, b) => Number(b.likes_count) - Number(a.likes_count)).slice(0, 12));
        renderGrid('topRatedGrid', [...filtered].filter((item) => Number(item.rating_count) > 0)
            .sort((a, b) => Number(b.average_rating) - Number(a.average_rating)).slice(0, 12));
        renderGrid('recommendedGrid', [...filtered].sort((a, b) => {
            const scoreA = Number(a.average_rating || a.rating || 0) * Math.log(Number(a.rating_count || 0) + 1);
            const scoreB = Number(b.average_rating || b.rating || 0) * Math.log(Number(b.rating_count || 0) + 1);
            return scoreB - scoreA;
        }).slice(0, 12));
        status.textContent = `${filtered.length} ta kino`;
    }

    async function loadMovies(reset = false) {
        if (reset) {
            offset = 0;
            movies = [];
            status.textContent = 'Kinolar yuklanmoqda…';
        }
        const params = { limit: pageSize, offset };
        if (searchInput.value.trim()) params.q = searchInput.value.trim();
        if (genreFilter.value) params.genre = genreFilter.value;
        const result = await fetchAPI('get_movies', 'GET', params);
        if (!result.success) throw new Error(result.error || 'Kinolarni yuklab bo‘lmadi.');
        if (reset) movies = result.data;
        else movies = movies.concat(result.data);
        hasMore = result.data.length === pageSize;
        offset += result.data.length;
        loadMoreButton.hidden = !hasMore;
        renderMovies();
    }

    function updateMovieInMemory(movieId, changes) {
        movies = movies.map((movie) => Number(movie.id) === Number(movieId) ? { ...movie, ...changes } : movie);
        renderMovies();
    }

    function showNotice(message) {
        status.textContent = message;
        status.classList.add('notice-error');
        window.setTimeout(() => status.classList.remove('notice-error'), 3500);
        const toast = document.getElementById('noticeToast');
        if (toast) {
            document.getElementById('noticeToastMessage').textContent = message;
            document.getElementById('noticeToastLogin').hidden = true;
            toast.hidden = false;
            window.clearTimeout(noticeTimer);
            noticeTimer = window.setTimeout(() => { toast.hidden = true; }, 5000);
        }
    }

    function showGuestRestriction() {
        const message = 'Ushbu imkoniyatdan foydalanish uchun tizimga kiring yoki ro‘yxatdan o‘ting.';
        showNotice(message);
        const loginButton = document.getElementById('noticeToastLogin');
        const toast = document.getElementById('noticeToast');
        if (!loginButton || !toast) return;
        loginButton.hidden = false;
        loginButton.onclick = () => window.openAuthModal('login');
        toast.hidden = false;
    }

    function showDetails(movie) {
        activeMovie = movie;
        detailContent.replaceChildren();
        const heading = document.createElement('div');
        heading.className = 'detail-heading';
        const image = document.createElement('img');
        image.src = posterUrl(movie);
        image.alt = `${movie.title} posteri`;
        const info = document.createElement('div');
        const genre = document.createElement('p');
        genre.className = 'eyebrow';
        genre.textContent = `${genreLabel(movie.genre)} · ${movie.year || ''}`;
        const title = document.createElement('h2');
        title.id = 'detailTitle';
        title.textContent = movie.title;
        const description = document.createElement('p');
        description.className = 'detail-description';
        description.textContent = movie.description || 'Kino haqida ma’lumot berilmagan.';
        const play = document.createElement('button');
        play.className = 'submit-btn';
        play.type = 'button';
        play.textContent = '▶ Tomosha qilish';
        play.disabled = !movie.qualities?.length && !movie.video_url;
        play.addEventListener('click', () => openPlayer(movie));
        info.append(genre, title, description, play);
        heading.append(image, info);

        const actions = document.createElement('div');
        actions.className = 'detail-actions';
        const like = document.createElement('button');
        like.type = 'button';
        like.className = 'secondary-btn';
        like.textContent = `${movie.is_liked ? '♥ Yoqdi' : '♡ Yoqtirish'} · ${movie.likes_count || 0}`;
        like.addEventListener('click', async () => {
            if (!window.currentUser) {
                showGuestRestriction();
                return;
            }
            try {
                const result = await fetchAPI('toggle_like', 'POST', { movie_id: movie.id });
                if (!result.success) throw new Error(result.error);
                movie.is_liked = result.data.liked;
                movie.likes_count = result.data.count;
                like.textContent = `${movie.is_liked ? '♥ Yoqdi' : '♡ Yoqtirish'} · ${movie.likes_count}`;
                updateMovieInMemory(movie.id, { is_liked: movie.is_liked, likes_count: movie.likes_count });
            } catch (error) {
                showNotice(error.message || 'Yoqtirish amali bajarilmadi.');
            }
        });
        const stars = document.createElement('div');
        stars.className = 'star-rating';
        stars.setAttribute('aria-label', 'Baho tanlash');
        for (let score = 1; score <= 5; score += 1) {
            const star = document.createElement('button');
            star.type = 'button';
            star.textContent = score <= Number(movie.my_rating || 0) ? '★' : '☆';
            star.setAttribute('aria-label', `${score} yulduz`);
            star.addEventListener('click', async () => {
                if (!window.currentUser) {
                    showGuestRestriction();
                    return;
                }
                try {
                    const result = await fetchAPI('rate_movie', 'POST', { movie_id: movie.id, score });
                    if (!result.success) throw new Error(result.error);
                    movie.my_rating = score;
                    movie.average_rating = result.data.average;
                    movie.rating_count = result.data.count;
                    showDetails(movie);
                    updateMovieInMemory(movie.id, {
                        my_rating: score,
                        average_rating: result.data.average,
                        rating_count: result.data.count,
                    });
                } catch (error) {
                    showNotice(error.message || 'Baho saqlanmadi.');
                }
            });
            stars.append(star);
        }
        const ratingText = document.createElement('span');
        ratingText.textContent = ` ${Number(movie.average_rating || movie.rating || 0).toFixed(1)} / 5`;
        stars.append(ratingText);
        actions.append(like, stars);

        const commentSection = document.createElement('section');
        commentSection.className = 'comments-section';
        const commentsTitle = document.createElement('h3');
        commentsTitle.textContent = 'Izohlar';
        const commentList = document.createElement('div');
        commentList.className = 'comment-list';
        const form = document.createElement('form');
        form.className = 'comment-form';
        const textarea = document.createElement('textarea');
        textarea.name = 'body';
        textarea.maxLength = 2000;
        textarea.placeholder = 'Fikringizni yozing…';
        textarea.setAttribute('aria-label', 'Izoh matni');
        const submit = document.createElement('button');
        submit.className = 'submit-btn';
        submit.type = 'submit';
        submit.textContent = 'Izoh yuborish';
        if (!window.currentUser) {
            const signIn = document.createElement('button');
            signIn.type = 'button';
            signIn.className = 'submit-btn';
            signIn.textContent = 'Izoh yozish uchun kiring';
            signIn.addEventListener('click', showGuestRestriction);
            form.append(signIn);
        } else {
            form.append(textarea, submit);
            form.addEventListener('submit', async (event) => {
                event.preventDefault();
                submit.disabled = true;
                try {
                    const result = await fetchAPI('add_comment', 'POST', { movie_id: movie.id, body: textarea.value });
                    if (!result.success) throw new Error(result.error);
                    textarea.value = '';
                    await loadComments(movie, commentList);
                } catch (error) {
                    showNotice(error.message || 'Izoh yuborilmadi.');
                } finally {
                    submit.disabled = false;
                }
            });
        }
        commentSection.append(commentsTitle, form, commentList);
        detailContent.append(heading, actions, commentSection);
        const detailAds = document.createElement('div');
        detailAds.className = 'ad-slot';
        loadAds('movie_detail', detailAds);
        detailContent.append(detailAds);
        detailModal.classList.add('active');
        loadComments(movie, commentList);
    }

    async function loadComments(movie, container) {
        container.textContent = 'Izohlar yuklanmoqda…';
        try {
            const result = await fetchAPI('get_comments', 'GET', { id: movie.id });
            if (!result.success) throw new Error(result.error || 'Izohlarni olib bo‘lmadi.');
            container.replaceChildren();
            if (!result.data.length) {
                const empty = document.createElement('p');
                empty.className = 'section-note';
                empty.textContent = 'Hozircha izohlar yo‘q.';
                container.append(empty);
                return;
            }
            result.data.forEach((comment) => {
                const item = document.createElement('article');
                item.className = 'comment-item';
                const header = document.createElement('div');
                header.className = 'comment-header';
                const author = document.createElement('strong');
                author.textContent = comment.username;
                const date = document.createElement('time');
                date.textContent = new Date(`${comment.created_at}Z`).toLocaleDateString('uz-UZ');
                const body = document.createElement('p');
                body.textContent = comment.body;
                header.append(author, date);
                item.append(header, body);
                if (window.currentUser && (Number(window.currentUser.id) === Number(comment.user_id)
                    || ['admin', 'super_admin'].includes(window.currentUser.role))) {
                    const actions = document.createElement('div');
                    actions.className = 'comment-actions';
                    const edit = document.createElement('button');
                    edit.type = 'button';
                    edit.textContent = 'Tahrirlash';
                    edit.addEventListener('click', async () => {
                        const nextBody = window.prompt('Izoh matnini tahrirlang:', comment.body);
                        if (nextBody === null) return;
                        const update = await fetchAPI('update_comment', 'POST', { id: comment.id, body: nextBody });
                        if (!update.success) return showNotice(update.error || 'Izoh yangilanmadi.');
                        await loadComments(movie, container);
                    });
                    const remove = document.createElement('button');
                    remove.type = 'button';
                    remove.textContent = 'O‘chirish';
                    remove.addEventListener('click', async () => {
                        if (!window.confirm('Izoh o‘chirilsinmi?')) return;
                        const deleted = await fetchAPI('delete_comment', 'POST', { id: comment.id });
                        if (!deleted.success) return showNotice(deleted.error || 'Izoh o‘chirilmadi.');
                        await loadComments(movie, container);
                    });
                    actions.append(edit, remove);
                    item.append(actions);
                }
                container.append(item);
            });
        } catch (error) {
            container.textContent = error.message || 'Izohlarni olib bo‘lmadi.';
        }
    }

    function openPlayer(movie) {
        videoContainer.replaceChildren();
        document.getElementById('playerTitle').textContent = movie.title;
        if (!movie.qualities?.length && movie.video_url) {
            let url;
            try {
                url = new URL(movie.video_url);
            } catch {
                showNotice('Video manzili noto‘g‘ri.');
                return;
            }
            if (url.protocol !== 'https:' || !['youtube.com', 'www.youtube.com', 'www.youtube-nocookie.com'].includes(url.hostname)
                || !url.pathname.startsWith('/embed/')) {
                showNotice('Video manzili xavfsiz YouTube havolasi emas.');
                return;
            }
            url.searchParams.set('autoplay', '1');
            const frame = document.createElement('iframe');
            frame.src = url.href;
            frame.title = 'Kino videosi';
            frame.allow = 'autoplay; encrypted-media; picture-in-picture';
            frame.allowFullscreen = true;
            videoContainer.append(frame);
            playerModal.classList.add('active');
            return;
        }

        const video = document.createElement('video');
        video.className = 'movie-video';
        video.controls = true;
        video.autoplay = true;
        video.playsInline = true;
        video.preload = 'metadata';
        video.setAttribute('aria-label', movie.title);
        const loading = document.createElement('span');
        loading.className = 'video-loading';
        loading.setAttribute('role', 'status');
        loading.textContent = 'Video yuklanmoqda…';
        const toolbar = document.createElement('div');
        toolbar.className = 'player-toolbar';
        const quality = document.createElement('label');
        quality.textContent = 'Sifat ';
        const qualitySelect = document.createElement('select');
        qualitySelect.setAttribute('aria-label', 'Video sifati');
        movie.qualities.forEach((item) => {
            const option = document.createElement('option');
            option.value = item;
            option.textContent = item === 'original' ? 'Asl' : item;
            qualitySelect.append(option);
        });
        const remembered = localStorage.getItem('ulmovi-quality');
        if (movie.qualities.includes(remembered)) qualitySelect.value = remembered;
        quality.append(qualitySelect);
        const speedLabel = document.createElement('label');
        speedLabel.textContent = 'Tezlik ';
        const speedSelect = document.createElement('select');
        speedSelect.setAttribute('aria-label', 'Ijro tezligi');
        ['0.75', '1', '1.25', '1.5', '2'].forEach((value) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = `${value}×`;
            speedSelect.append(option);
        });
        speedSelect.value = '1';
        speedSelect.addEventListener('change', () => { video.playbackRate = Number(speedSelect.value); });
        const download = document.createElement('a');
        download.className = 'download-link';
        download.href = apiUrl('download_movie', { id: movie.id, quality: qualitySelect.value });
        download.textContent = 'Yuklab olish';
        download.addEventListener('click', (event) => {
            if (!window.currentUser) {
                event.preventDefault();
                showGuestRestriction();
            }
        });
        toolbar.append(quality, speedLabel, download);

        const indicator = document.createElement('span');
        indicator.className = 'skip-indicator';
        indicator.setAttribute('aria-live', 'polite');
        video.addEventListener('dblclick', (event) => {
            event.preventDefault();
            const rect = video.getBoundingClientRect();
            const forward = event.clientX - rect.left > rect.width / 2;
            video.currentTime = Math.max(0, Math.min(video.duration || Infinity, video.currentTime + (forward ? 10 : -10)));
            indicator.textContent = forward ? '+10 soniya' : '−10 soniya';
            indicator.classList.add('visible');
            window.setTimeout(() => indicator.classList.remove('visible'), 800);
        });
        video.addEventListener('waiting', () => { loading.hidden = false; });
        video.addEventListener('loadstart', () => { loading.hidden = false; });
        video.addEventListener('canplay', () => { loading.hidden = true; });
        video.addEventListener('playing', () => { loading.hidden = true; });
        video.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowRight') video.currentTime += 10;
            if (event.key === 'ArrowLeft') video.currentTime = Math.max(0, video.currentTime - 10);
            if (event.key.toLowerCase() === 'f' && document.fullscreenElement === null) video.requestFullscreen?.();
            if (event.key === ' ') {
                event.preventDefault();
                if (video.paused) video.play(); else video.pause();
            }
        });
        video.addEventListener('error', () => {
            loading.hidden = true;
            const mediaErrors = {
                1: 'Video ijrosi to‘xtatildi. Qayta ijro qilishga urinib ko‘ring.',
                2: 'Video oqimi uzildi. Internet yoki server ulanishini tekshiring.',
                3: 'Video dekodlanmadi. Fayl buzilgan bo‘lishi mumkin.',
                4: 'Bu video formati yoki sifati brauzerda qo‘llab-quvvatlanmaydi.',
            };
            showNotice(mediaErrors[video.error?.code] || 'Video yuklanmadi. Fayl va server javobini tekshiring.');
        });
        function setSource(qualityValue, preserveTime) {
            const time = preserveTime ? video.currentTime : 0;
            video.src = apiUrl('stream_video', { id: movie.id, quality: qualityValue });
            video.load();
            if (preserveTime) video.addEventListener('loadedmetadata', () => {
                video.currentTime = Math.min(time, video.duration || time);
            }, { once: true });
        }
        qualitySelect.addEventListener('change', () => {
            localStorage.setItem('ulmovi-quality', qualitySelect.value);
            download.href = apiUrl('download_movie', { id: movie.id, quality: qualitySelect.value });
            setSource(qualitySelect.value, true);
            video.play().catch(() => {});
        });
        setSource(qualitySelect.value, false);
        videoContainer.append(video, loading, toolbar, indicator);
        playerModal.classList.add('active');
        video.play().catch(() => {});
    }

    function closePlayer() {
        playerModal.classList.remove('active');
        videoContainer.replaceChildren();
    }

    async function loadAds(placement, container) {
        try {
            const result = await fetchAPI('get_ads', 'GET', { placement });
            if (!result.success || !result.data.length) return;
            result.data.forEach((ad) => {
                try {
                    const destination = new URL(ad.destination_url);
                    const imageUrl = ad.image_path
                        ? new URL(apiUrl('ad_image', { id: ad.id }))
                        : new URL(ad.image_url);
                    if (destination.protocol !== 'https:' || (!ad.image_path && imageUrl.protocol !== 'https:')) return;
                    const link = document.createElement('a');
                    link.href = destination.href;
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer sponsored';
                    const image = document.createElement('img');
                    image.src = imageUrl.href;
                    image.alt = ad.title;
                    link.append(image);
                    container.append(link);
                } catch {
                    return;
                }
            });
            container.hidden = !container.childElementCount;
        } catch (error) {
            console.error('Reklamalar yuklanmadi:', error);
        }
    }

    document.getElementById('closePlayerBtn').addEventListener('click', closePlayer);
    playerModal.addEventListener('click', (event) => { if (event.target === playerModal) closePlayer(); });
    document.getElementById('closeDetailBtn').addEventListener('click', () => detailModal.classList.remove('active'));
    detailModal.addEventListener('click', (event) => { if (event.target === detailModal) detailModal.classList.remove('active'); });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closePlayer();
            detailModal.classList.remove('active');
        }
    });
    genreFilter.addEventListener('change', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => loadMovies(true).catch((error) => showNotice(error.message)), 200);
    });
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => loadMovies(true).catch((error) => showNotice(error.message)), 250);
    });
    loadMoreButton.addEventListener('click', async () => {
        loadMoreButton.disabled = true;
        try {
            await loadMovies();
        } catch (error) {
            showNotice(error.message || 'Keyingi kinolarni olib bo‘lmadi.');
        } finally {
            loadMoreButton.disabled = false;
        }
    });

    window.addEventListener('ulmovi:auth-changed', (event) => {
        const previousUser = window.currentUser;
        const nextUser = event.detail || null;
        window.currentUser = nextUser;
        if (!nextUser) {
            movies = movies.map((movie) => ({ ...movie, is_liked: false, my_rating: null }));
        }
        renderMovies();
        if (activeMovie && detailModal.classList.contains('active')) showDetails(activeMovie);
        if (nextUser && previousUser?.id !== nextUser.id) {
            loadMovies(true).catch((error) => showNotice(error.message || 'Hisob ma’lumotlari yangilanmadi.'));
        }
    });

    try {
        if (typeof window.refreshAuthentication === 'function') {
            await window.refreshAuthentication();
        }
        await Promise.all([
            loadMovies(true),
            loadAds('home', document.getElementById('homeAds')),
            loadAds('between_sections', document.getElementById('betweenAds')),
        ]);
    } catch (error) {
        status.textContent = error.message || 'Kinolarni yuklab bo‘lmadi.';
        status.classList.add('notice-error');
    }
});
