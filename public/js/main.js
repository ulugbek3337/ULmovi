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
    let saveActiveProgress = null;
    let heroSlides = [];
    let heroSlideIndex = 0;
    let heroTimer = null;
    let heroPaused = false;

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

    function renderHeroSlide(index) {
        const title = document.getElementById('heroTitle');
        const genre = document.getElementById('heroGenre');
        const meta = document.getElementById('heroMeta');
        const description = document.getElementById('heroDescription');
        const backdrop = document.getElementById('heroBackdrop');
        const poster = document.getElementById('heroPoster');
        const play = document.getElementById('heroPlayBtn');
        const details = document.getElementById('heroDetailsBtn');
        const pagination = document.getElementById('heroPagination');
        if (!heroSlides.length) {
            title.textContent = 'Kinolar olamiga xush kelibsiz';
            genre.textContent = 'ULmovi tanlovi';
            meta.textContent = '';
            description.textContent = 'Sevimli hikoyangizni tanlang va tomoshadan zavqlaning.';
            backdrop.hidden = true;
            poster.hidden = true;
            play.disabled = true;
            details.disabled = true;
            pagination.replaceChildren();
            return;
        }
        heroSlideIndex = (index + heroSlides.length) % heroSlides.length;
        const movie = heroSlides[heroSlideIndex];
        const source = posterUrl(movie);
        title.textContent = movie.title || 'Nomsiz kino';
        genre.textContent = genreLabel(movie.genre);
        const parts = [];
        if (Number(movie.rating_count) > 0) parts.push('★ ' + Number(movie.average_rating || movie.rating).toFixed(1));
        if (movie.year) parts.push(String(movie.year));
        if (movie.genre) parts.push(genreLabel(movie.genre));
        meta.textContent = parts.join('  ·  ');
        description.textContent = movie.description || '';
        description.hidden = !movie.description;
        backdrop.hidden = !source;
        poster.hidden = !source;
        if (source) {
            backdrop.src = source;
            poster.src = source;
            poster.alt = (movie.title || 'Kino') + ' posteri';
            backdrop.onerror = () => { backdrop.hidden = true; };
            poster.onerror = () => { poster.hidden = true; };
        }
        play.disabled = !movie.qualities?.length && !movie.video_url;
        details.disabled = false;
        play.onclick = () => openPlayer(movie);
        details.onclick = () => showDetails(movie);
        pagination.replaceChildren();
        heroSlides.forEach((slide, slideIndex) => {
            const indicator = document.createElement('span');
            indicator.className = 'hero-indicator' + (slideIndex === heroSlideIndex ? ' active' : '');
            pagination.append(indicator);
        });
    }

    function stopHeroTimer() {
        if (heroTimer) window.clearInterval(heroTimer);
        heroTimer = null;
    }

    function startHeroTimer() {
        stopHeroTimer();
        if (heroSlides.length < 2 || heroPaused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        heroTimer = window.setInterval(() => renderHeroSlide(heroSlideIndex + 1), 7000);
    }

    function restartHeroTimer() { startHeroTimer(); }

    function renderHeroCarousel() {
        heroSlides = movies.slice(0, 4);
        renderHeroSlide(Math.min(heroSlideIndex, Math.max(heroSlides.length - 1, 0)));
        const hero = document.getElementById('featuredHero');
        if (hero && !hero.dataset.carouselBound) {
            hero.dataset.carouselBound = 'true';
            hero.addEventListener('mouseenter', () => { heroPaused = true; stopHeroTimer(); });
            hero.addEventListener('mouseleave', () => { heroPaused = false; startHeroTimer(); });
            hero.addEventListener('focusin', () => { heroPaused = true; stopHeroTimer(); });
            hero.addEventListener('focusout', (event) => {
                if (!hero.contains(event.relatedTarget)) { heroPaused = false; startHeroTimer(); }
            });
        }
        startHeroTimer();
    }

    function renderMovieSkeletons() {
        const grid = document.getElementById('moviesGrid');
        if (!grid) return;
        grid.replaceChildren();
        for (let index = 0; index < 6; index += 1) {
            const skeleton = document.createElement('div');
            skeleton.className = 'movie-skeleton';
            skeleton.setAttribute('aria-hidden', 'true');
            const poster = document.createElement('span'); poster.className = 'skeleton-poster';
            const title = document.createElement('span'); title.className = 'skeleton-line';
            const meta = document.createElement('span'); meta.className = 'skeleton-line short';
            skeleton.append(poster, title, meta);
            grid.append(skeleton);
        }
    }

    function renderMoviesError(message) {
        const grid = document.getElementById('moviesGrid');
        if (!grid) return;
        grid.replaceChildren();
        const error = document.createElement('div');
        error.className = 'empty-message error-state';
        const text = document.createElement('p');
        text.textContent = message || 'Kinolarni yuklab bo‘lmadi. Internet aloqasini tekshiring.';
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'secondary-btn';
        retry.textContent = 'Qayta urinish';
        retry.addEventListener('click', () => loadMovies(true).catch((error) => renderMoviesError(error.message)));
        error.append(text, retry);
        grid.append(error);
    }

    function makeMovieCard(movie, rank = null) {
        const card = document.createElement('article');
        card.className = 'movie-card' + (rank ? ' ranked-movie-card' : '');
        if (rank) {
            const number = document.createElement('span');
            number.className = 'rank-number';
            number.setAttribute('aria-hidden', 'true');
            number.textContent = String(rank);
            card.append(number);
        }
        const posterWrap = document.createElement('div');
        posterWrap.className = 'movie-poster-wrap';
        const posterLink = document.createElement('button');
        posterLink.type = 'button';
        posterLink.className = 'movie-poster-link';
        posterLink.setAttribute('aria-label', (movie.title || 'Kino') + ' haqida batafsil');
        posterLink.addEventListener('click', () => showDetails(movie));
        const image = document.createElement('img');
        image.className = 'movie-poster';
        image.alt = (movie.title || 'Kino') + ' posteri';
        image.width = 400;
        image.height = 600;
        image.loading = 'lazy';
        image.decoding = 'async';
        image.fetchPriority = 'low';
        const imageSource = posterUrl(movie);
        const fallback = document.createElement('span');
        fallback.className = 'poster-fallback';
        const initial = document.createElement('span');
        initial.className = 'poster-initial';
        initial.textContent = (movie.title || 'U').trim().slice(0, 1).toUpperCase();
        const caption = document.createElement('span');
        caption.className = 'poster-fallback-caption';
        caption.textContent = 'Poster tez orada';
        fallback.append(initial, caption);
        if (imageSource) {
            image.src = imageSource;
            image.addEventListener('error', () => { image.hidden = true; fallback.hidden = false; posterWrap.classList.add('poster-placeholder'); }, { once: true });
            fallback.hidden = true;
        } else {
            image.hidden = true;
            fallback.hidden = false;
            posterWrap.classList.add('poster-placeholder');
        }
        const hoverPlay = document.createElement('span');
        hoverPlay.className = 'poster-play';
        hoverPlay.setAttribute('aria-hidden', 'true');
        hoverPlay.textContent = '▶';
        posterLink.append(image, fallback, hoverPlay);
        posterWrap.append(posterLink);

        const rating = document.createElement('span');
        rating.className = 'movie-rating-badge' + (Number(movie.rating_count) > 0 ? '' : ' new-badge');
        rating.textContent = Number(movie.rating_count) > 0
            ? '★ ' + Number(movie.average_rating || movie.rating).toFixed(1)
            : 'Yangi';
        rating.setAttribute('aria-label', Number(movie.rating_count) > 0 ? 'Reyting ' + rating.textContent : 'Yangi kino');
        posterWrap.append(rating);

        const like = document.createElement('button');
        like.className = 'like-button poster-like' + (movie.is_liked ? ' liked' : '');
        like.type = 'button';
        like.setAttribute('aria-label', 'Kinoni yoqtirish');
        like.setAttribute('aria-pressed', String(Boolean(movie.is_liked)));
        like.textContent = (movie.is_liked ? '♥ ' : '♡ ') + (movie.likes_count || 0);
        like.addEventListener('click', async () => {
            if (!window.currentUser) { showGuestRestriction(); return; }
            like.disabled = true;
            try {
                const result = await fetchAPI('toggle_like', 'POST', { movie_id: movie.id });
                if (!result.success) throw new Error(result.error || 'Yoqtirish amali bajarilmadi.');
                movie.is_liked = result.data.liked;
                movie.likes_count = result.data.count;
                updateMovieInMemory(movie.id, { is_liked: movie.is_liked, likes_count: movie.likes_count });
            } catch (error) {
                showNotice(error.message || 'Yoqtirish amali bajarilmadi.');
            } finally { like.disabled = false; }
        });
        posterWrap.append(like);

        const body = document.createElement('div');
        body.className = 'movie-card-body';
        const title = document.createElement('h3');
        title.textContent = movie.title || 'Nomsiz kino';
        const metadata = document.createElement('p');
        metadata.className = 'movie-meta';
        metadata.textContent = [movie.genre ? genreLabel(movie.genre) : '', movie.year || ''].filter(Boolean).join(' · ');
        body.append(title, metadata);
        card.append(posterWrap, body);
        return card;
    }

    function renderGrid(containerId, list, emptyText = 'Bu bo‘limda hozircha kino yo‘q.', options = {}) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.replaceChildren();
        if (!list.length) {
            const empty = document.createElement('p');
            empty.className = 'empty-message';
            empty.textContent = emptyText;
            container.append(empty);
            return;
        }
        list.forEach((movie, index) => container.append(makeMovieCard(movie, options.ranked ? index + 1 : null)));
    }

    function renderMovies() {
        const search = searchInput.value.trim().toLocaleLowerCase();
        const genre = genreFilter.value;
        const filtered = movies.filter((movie) => {
            const text = (movie.title || '') + ' ' + (movie.genre || '') + ' ' + (movie.description || '');
            return (!search || text.toLocaleLowerCase().includes(search)) && (!genre || movie.genre === genre);
        });
        const emptyText = genre ? 'Bu janrda hozircha kino yo‘q.' : (search ? 'Qidiruv bo‘yicha kino topilmadi.' : 'Hozircha kinolar qo‘shilmagan.');
        renderGrid('moviesGrid', filtered, emptyText);
        const popular = [...filtered].sort((a, b) => Number(b.likes_count || 0) - Number(a.likes_count || 0)).slice(0, 5);
        renderGrid('popularGrid', popular, 'Ommabop kinolar hozircha yo‘q.', { ranked: true });
        status.textContent = filtered.length + ' ta kino';
        renderHeroCarousel();
    }

    async function loadMovies(reset = false) {
        if (reset) {
            offset = 0;
            movies = [];
            status.textContent = 'Kinolar yuklanmoqda…';
            renderMovieSkeletons();
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
        const layout = document.createElement('div');
        layout.className = 'movie-detail-layout';
        const main = document.createElement('div');
        main.className = 'movie-detail-main';
        const breadcrumb = document.createElement('nav');
        breadcrumb.className = 'detail-breadcrumb';
        breadcrumb.setAttribute('aria-label', 'Sahifa yo‘li');
        const homeLink = document.createElement('a'); homeLink.href = 'index.html'; homeLink.textContent = 'Bosh sahifa';
        const moviesLink = document.createElement('a'); moviesLink.href = '#latest'; moviesLink.textContent = 'Kinolar';
        const crumbTitle = document.createElement('span'); crumbTitle.textContent = movie.title || 'Kino';
        breadcrumb.append(homeLink, document.createTextNode(' / '), moviesLink, document.createTextNode(' / '), crumbTitle);

        const preview = document.createElement('div');
        preview.className = 'detail-player-preview';
        const previewImage = document.createElement('img');
        previewImage.alt = (movie.title || 'Kino') + ' posteri';
        previewImage.width = 1280; previewImage.height = 720; previewImage.loading = 'eager';
        const source = posterUrl(movie);
        if (source) previewImage.src = source; else preview.classList.add('without-poster');
        const previewFallback = document.createElement('span');
        previewFallback.className = 'detail-preview-fallback';
        previewFallback.textContent = (movie.title || 'U').trim().slice(0, 1).toUpperCase();
        if (!source) previewFallback.hidden = false; else previewFallback.hidden = true;
        previewImage.addEventListener('error', () => { previewImage.hidden = true; preview.classList.add('without-poster'); previewFallback.hidden = false; }, { once: true });
        const play = document.createElement('button');
        play.type = 'button';
        play.className = 'detail-play-button';
        play.setAttribute('aria-label', (movie.title || 'Kino') + ' filmini tomosha qilish');
        play.textContent = '▶';
        play.disabled = !movie.qualities?.length && !movie.video_url;
        play.addEventListener('click', () => openPlayer(movie));
        preview.append(previewImage, previewFallback, play);

        const heading = document.createElement('div'); heading.className = 'detail-title-block';
        const title = document.createElement('h1'); title.id = 'detailTitle'; title.textContent = movie.title || 'Nomsiz kino';
        const meta = document.createElement('p'); meta.className = 'detail-meta';
        const metaParts = [];
        if (Number(movie.rating_count) > 0) metaParts.push('★ ' + Number(movie.average_rating || movie.rating).toFixed(1) + ' (' + Number(movie.rating_count) + ' ta baho)');
        if (movie.year) metaParts.push(String(movie.year));
        if (movie.genre) metaParts.push(genreLabel(movie.genre));
        meta.textContent = metaParts.join('  ·  ');
        heading.append(title, meta);

        const actions = document.createElement('div'); actions.className = 'detail-actions';
        const like = document.createElement('button');
        like.type = 'button'; like.className = 'detail-action-button detail-like' + (movie.is_liked ? ' liked' : '');
        like.setAttribute('aria-pressed', String(Boolean(movie.is_liked)));
        like.textContent = (movie.is_liked ? '♥ Yoqdi' : '♡ Yoqdi') + ' · ' + Number(movie.likes_count || 0);
        like.addEventListener('click', async () => {
            if (!window.currentUser) { showGuestRestriction(); return; }
            like.disabled = true;
            try {
                const result = await fetchAPI('toggle_like', 'POST', { movie_id: movie.id });
                if (!result.success) throw new Error(result.error || 'Yoqtirish amali bajarilmadi.');
                movie.is_liked = result.data.liked; movie.likes_count = result.data.count;
                updateMovieInMemory(movie.id, { is_liked: movie.is_liked, likes_count: movie.likes_count });
                like.setAttribute('aria-pressed', String(Boolean(movie.is_liked)));
                like.classList.toggle('liked', Boolean(movie.is_liked));
                like.textContent = (movie.is_liked ? '♥ Yoqdi' : '♡ Yoqdi') + ' · ' + Number(movie.likes_count || 0);
            } catch (error) { showNotice(error.message || 'Yoqtirish amali bajarilmadi.'); }
            finally { like.disabled = false; }
        });

        const download = document.createElement('a');
        download.className = 'detail-action-button'; download.textContent = '↓ Yuklab olish';
        download.href = apiUrl('download_movie', { id: movie.id, quality: movie.qualities?.[0] || 'original' });
        download.setAttribute('aria-label', 'Kinoni yuklab olish');
        if (!movie.qualities?.length) download.classList.add('is-disabled');
        download.addEventListener('click', (event) => {
            if (!window.currentUser) { event.preventDefault(); showGuestRestriction(); return; }
            if (!movie.qualities?.length) { event.preventDefault(); showNotice('Bu kino uchun yuklab olish sifati mavjud emas.'); }
        });

        const share = document.createElement('button'); share.type = 'button'; share.className = 'detail-action-button'; share.textContent = '↗ Ulashish';
        share.addEventListener('click', async () => {
            const shareUrl = window.location.origin + window.location.pathname + '?play=' + encodeURIComponent(movie.id);
            try {
                if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(shareUrl);
                else {
                    const helper = document.createElement('textarea'); helper.value = shareUrl; helper.setAttribute('readonly', '');
                    helper.style.position = 'fixed'; helper.style.opacity = '0'; document.body.append(helper); helper.select();
                    const copied = document.execCommand('copy'); helper.remove(); if (!copied) throw new Error('Nusxa olish qo‘llab-quvvatlanmaydi.');
                }
                share.textContent = 'Havola nusxalandi';
                window.setTimeout(() => { share.textContent = '↗ Ulashish'; }, 2200);
            } catch (error) { showNotice(error.message || 'Havolani nusxalab bo‘lmadi.'); }
        });
        actions.append(like, download, share);

        const description = document.createElement('p');
        description.className = 'detail-description';
        description.textContent = movie.description || 'Kino haqida ma’lumot berilmagan.';

        const ratingPanel = document.createElement('section'); ratingPanel.className = 'rating-panel';
        const ratingHeading = document.createElement('h2'); ratingHeading.textContent = 'Kinoni baholang';
        const ratingControls = document.createElement('div'); ratingControls.className = 'detail-star-rating';
        const personalRating = document.createElement('p'); personalRating.className = 'personal-rating';
        function updateStarPreview(value) {
            [...ratingControls.querySelectorAll('button')].forEach((button, index) => {
                button.textContent = index < value ? '★' : '☆';
                button.classList.toggle('selected', index < value);
            });
        }
        for (let score = 1; score <= 5; score += 1) {
            const star = document.createElement('button'); star.type = 'button';
            star.setAttribute('aria-label', score + ' yulduz');
            star.addEventListener('mouseenter', () => updateStarPreview(score));
            star.addEventListener('focus', () => updateStarPreview(score));
            star.addEventListener('click', async () => {
                if (!window.currentUser) { showGuestRestriction(); return; }
                star.disabled = true;
                try {
                    const result = await fetchAPI('rate_movie', 'POST', { movie_id: movie.id, score });
                    if (!result.success) throw new Error(result.error || 'Baho saqlanmadi.');
                    movie.my_rating = score; movie.average_rating = result.data.average; movie.rating_count = result.data.count;
                    updateMovieInMemory(movie.id, { my_rating: score, average_rating: result.data.average, rating_count: result.data.count });
                    showDetails(movie);
                } catch (error) { showNotice(error.message || 'Baho saqlanmadi.'); }
                finally { star.disabled = false; }
            });
            ratingControls.append(star);
        }
        ratingControls.addEventListener('mouseleave', () => updateStarPreview(Number(movie.my_rating || 0)));
        ratingControls.addEventListener('focusout', () => updateStarPreview(Number(movie.my_rating || 0)));
        updateStarPreview(Number(movie.my_rating || 0));
        personalRating.textContent = Number(movie.my_rating) > 0 ? 'Sizning bahoyingiz: ' + Number(movie.my_rating) + ' / 5' : 'Hali baho bermagansiz';
        ratingPanel.append(ratingHeading, ratingControls, personalRating);

        const commentSection = document.createElement('section'); commentSection.className = 'comments-section';
        const commentsTitle = document.createElement('h2'); commentsTitle.textContent = 'Izohlar';
        const commentList = document.createElement('div'); commentList.className = 'comment-list';
        const form = document.createElement('form'); form.className = 'comment-form';
        if (!window.currentUser) {
            const signIn = document.createElement('button'); signIn.type = 'button'; signIn.className = 'submit-btn';
            signIn.textContent = 'Izoh yozish uchun kiring'; signIn.addEventListener('click', showGuestRestriction); form.append(signIn);
        } else {
            const textarea = document.createElement('textarea'); textarea.name = 'body'; textarea.maxLength = 2000;
            textarea.placeholder = 'Fikringizni yozing…'; textarea.setAttribute('aria-label', 'Izoh matni'); textarea.required = true;
            const submit = document.createElement('button'); submit.className = 'submit-btn'; submit.type = 'submit'; submit.textContent = 'Yuborish';
            form.append(textarea, submit);
            form.addEventListener('submit', async (event) => {
                event.preventDefault(); if (!textarea.value.trim()) { textarea.focus(); return; }
                submit.disabled = true;
                try {
                    const result = await fetchAPI('add_comment', 'POST', { movie_id: movie.id, body: textarea.value.trim() });
                    if (!result.success) throw new Error(result.error || 'Izoh yuborilmadi.');
                    textarea.value = ''; await loadComments(movie, commentList);
                } catch (error) { showNotice(error.message || 'Izoh yuborilmadi.'); }
                finally { submit.disabled = false; }
            });
        }
        commentSection.append(commentsTitle, form, commentList);

        const sidebar = document.createElement('aside'); sidebar.className = 'movie-detail-sidebar';
        const similarTitle = document.createElement('h2'); similarTitle.textContent = 'O‘xshash kinolar';
        const similarList = document.createElement('div'); similarList.className = 'similar-movies-list';
        const similar = movies.filter((item) => Number(item.id) !== Number(movie.id) && movie.genre && item.genre === movie.genre)
            .sort((a, b) => Number(b.average_rating || 0) - Number(a.average_rating || 0)).slice(0, 4);
        if (!similar.length) {
            const empty = document.createElement('p'); empty.className = 'section-note'; empty.textContent = 'Hozircha o‘xshash kinolar yo‘q.'; similarList.append(empty);
        }
        similar.forEach((item) => {
            const row = document.createElement('button'); row.type = 'button'; row.className = 'similar-movie';
            const image = document.createElement('img'); image.alt = (item.title || 'Kino') + ' posteri'; image.width = 72; image.height = 108; image.loading = 'lazy';
            const itemPoster = posterUrl(item); if (itemPoster) image.src = itemPoster; else image.hidden = true;
            image.addEventListener('error', () => { image.hidden = true; }, { once: true });
            const copy = document.createElement('span'); copy.className = 'similar-movie-copy';
            const itemName = document.createElement('strong'); itemName.textContent = item.title || 'Nomsiz kino';
            const itemMeta = document.createElement('span'); itemMeta.textContent = [item.genre ? genreLabel(item.genre) : '', item.year || ''].filter(Boolean).join(' · ');
            const itemRating = document.createElement('span'); itemRating.className = 'similar-rating';
            itemRating.textContent = Number(item.rating_count) > 0 ? '★ ' + Number(item.average_rating || item.rating).toFixed(1) : 'Yangi';
            copy.append(itemName, itemMeta, itemRating); row.append(image, copy);
            row.addEventListener('click', () => showDetails(item)); similarList.append(row);
        });
        sidebar.append(similarTitle, similarList);
        main.append(breadcrumb, preview, heading, actions, description, ratingPanel, commentSection);
        layout.append(main, sidebar); detailContent.append(layout);
        detailModal.classList.add('active');
        loadComments(movie, commentList);
    }

    async function loadComments(movie, container) {
        container.textContent = 'Izohlar yuklanmoqda…';
        try {
            const result = await fetchAPI('get_comments', 'GET', { id: movie.id });
            if (!result.success) throw new Error(result.error || 'Izohlarni olib bo‘lmadi.');
            container.replaceChildren();
            const heading = container.parentElement?.querySelector('h2');
            if (heading) heading.textContent = 'Izohlar (' + result.data.length + ')';
            if (!result.data.length) {
                const empty = document.createElement('p'); empty.className = 'section-note'; empty.textContent = 'Hozircha izohlar yo‘q.'; container.append(empty); return;
            }
            result.data.forEach((comment) => {
                const item = document.createElement('article'); item.className = 'comment-item';
                const avatar = document.createElement('span'); avatar.className = 'comment-avatar';
                avatar.textContent = (comment.username || 'U').trim().slice(0, 1).toUpperCase();
                const content = document.createElement('div'); content.className = 'comment-content';
                const header = document.createElement('div'); header.className = 'comment-header';
                const author = document.createElement('strong'); author.textContent = comment.username || 'Foydalanuvchi';
                const date = document.createElement('time');
                const created = new Date(String(comment.created_at || '').replace(' ', 'T') + 'Z');
                if (Number.isNaN(created.getTime())) date.textContent = '';
                else {
                    const seconds = Math.round((created.getTime() - Date.now()) / 1000);
                    const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
                    const relative = new Intl.RelativeTimeFormat('uz', { numeric: 'auto' });
                    const unit = units.find((entry) => Math.abs(seconds) >= entry[1]);
                    date.textContent = unit ? relative.format(Math.round(seconds / unit[1]), unit[0]) : relative.format(seconds, 'second');
                }
                date.dateTime = comment.created_at || '';
                const body = document.createElement('p'); body.textContent = comment.body || '';
                header.append(author, date); content.append(header, body); item.append(avatar, content);
                if (window.currentUser && (Number(window.currentUser.id) === Number(comment.user_id)
                    || ['admin', 'super_admin'].includes(window.currentUser.role))) {
                    const actions = document.createElement('div'); actions.className = 'comment-actions';
                    const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = 'Tahrirlash';
                    edit.addEventListener('click', async () => {
                        const nextBody = window.prompt('Izoh matnini tahrirlang:', comment.body); if (nextBody === null) return;
                        try { const update = await fetchAPI('update_comment', 'POST', { id: comment.id, body: nextBody });
                            if (!update.success) throw new Error(update.error || 'Izoh yangilanmadi.'); await loadComments(movie, container);
                        } catch (error) { showNotice(error.message || 'Izoh yangilanmadi.'); }
                    });
                    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'O‘chirish';
                    remove.addEventListener('click', async () => {
                        if (!window.confirm('Izoh o‘chirilsinmi?')) return;
                        try { const deleted = await fetchAPI('delete_comment', 'POST', { id: comment.id });
                            if (!deleted.success) throw new Error(deleted.error || 'Izoh o‘chirilmadi.'); await loadComments(movie, container);
                        } catch (error) { showNotice(error.message || 'Izoh o‘chirilmadi.'); }
                    });
                    actions.append(edit, remove); content.append(actions);
                }
                container.append(item);
            });
        } catch (error) {
            container.textContent = error.message || 'Izohlarni yuklab bo‘lmadi.';
        }
    }

    function openPlayer(movie) {
        saveActiveProgress = null;
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
        let lastProgressSave = 0;
        let progressSavePending = false;
        async function saveWatchProgress(force = false) {
            if (!window.currentUser || !Number.isFinite(video.duration) || video.duration <= 0
                || progressSavePending || (!force && Date.now() - lastProgressSave < 15000)) return;
            const position = Math.max(0, Math.min(video.currentTime, video.duration));
            progressSavePending = true;
            lastProgressSave = Date.now();
            try {
                await fetchAPI('save_watch_progress', 'POST', {
                    movie_id: movie.id,
                    position_seconds: position.toFixed(2),
                    duration_seconds: video.duration.toFixed(2),
                });
            } catch (error) {
                console.warn('Ko‘rish jarayoni saqlanmadi:', error);
            } finally {
                progressSavePending = false;
            }
        }
        saveActiveProgress = saveWatchProgress;
        video.addEventListener('timeupdate', () => saveWatchProgress(false));
        video.addEventListener('pause', () => saveWatchProgress(true));
        video.addEventListener('ended', () => saveWatchProgress(true));
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
            const time = preserveTime ? video.currentTime : Number(movie.resume_seconds || 0);
            video.src = apiUrl('stream_video', { id: movie.id, quality: qualityValue });
            video.load();
            if (time > 0) video.addEventListener('loadedmetadata', () => {
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
        if (saveActiveProgress) saveActiveProgress(true);
        saveActiveProgress = null;
        playerModal.classList.remove('active');
        videoContainer.replaceChildren();
    }

    async function loadSocialLinks() {
        const footer = document.getElementById('footerSocialLinks');
        const promo = document.getElementById('instagramPromo');
        const instagramUrl = 'https://www.instagram.com/jorayevu436';
        if (promo) {
            promo.href = instagramUrl;
            const handle = promo.querySelector('.promo-handle');
            if (handle) handle.textContent = '@jorayevu436';
        }
        const updatePromoVisibility = () => {
            if (promo) promo.hidden = Boolean(document.getElementById('homeAds')?.querySelector('.ad-card'));
        };
        try {
            const result = await fetchAPI('get_social_links');
            if (!result.success || !Array.isArray(result.data)) { updatePromoVisibility(); return; }
            if (footer) footer.replaceChildren();
            const symbols = { telegram: '➤', instagram: '◎', youtube: '▶', tiktok: '♪', facebook: 'f', x: '𝕏' };
            result.data.forEach((item) => {
                if (!item || typeof item.name !== 'string' || typeof item.url !== 'string') return;
                try {
                    const destination = new URL(item.url);
                    if (destination.protocol !== 'https:' || !footer) return;
                    const link = document.createElement('a');
                    link.href = destination.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
                    link.setAttribute('aria-label', item.name); link.title = item.name;
                    link.textContent = symbols[item.name.trim().toLowerCase()] || item.name.trim().slice(0, 1).toUpperCase();
                    footer.append(link);
                } catch { return; }
            });
            updatePromoVisibility();
        } catch (error) {
            updatePromoVisibility();
            console.error('Ijtimoiy tarmoq havolalari yuklanmadi:', error);
        }
    }

    const hiddenAdStorageKey = 'ulmovi.hiddenAds.v1';
    const hiddenAdDurationMs = 30 * 24 * 60 * 60 * 1000;
    const adResponseCache = new Map();
    const adRotationIndex = { value: 0 };

    function getHiddenAds() {
        try {
            const saved = JSON.parse(localStorage.getItem(hiddenAdStorageKey) || '{}');
            const now = Date.now();
            const active = Object.fromEntries(Object.entries(saved).filter(([, expiresAt]) =>
                Number.isFinite(Number(expiresAt)) && Number(expiresAt) > now));
            if (Object.keys(active).length !== Object.keys(saved).length) {
                localStorage.setItem(hiddenAdStorageKey, JSON.stringify(active));
            }
            return active;
        } catch {
            return {};
        }
    }

    function hideAdFor30Days(adId) {
        const hidden = getHiddenAds();
        hidden[String(adId)] = Date.now() + hiddenAdDurationMs;
        try {
            localStorage.setItem(hiddenAdStorageKey, JSON.stringify(hidden));
        } catch {
            // Still remove the card from the current view if browser storage is unavailable.
        }
    }

    async function loadAds(placement, container) {
        try {
            if (!adResponseCache.has(placement)) {
                adResponseCache.set(placement, fetchAPI('get_ads', 'GET', { placement }));
            }
            const result = await adResponseCache.get(placement);
            if (!result.success || !Array.isArray(result.data) || !result.data.length) {
                container.hidden = true;
                if (placement === 'home') { const promo = document.getElementById('instagramPromo'); if (promo) promo.hidden = false; }
                return;
            }
            const hiddenAds = getHiddenAds();
            const visibleAds = result.data.filter((ad) => !hiddenAds[String(ad.id)]);
            if (!visibleAds.length) {
                container.hidden = true;
                if (placement === 'home') { const promo = document.getElementById('instagramPromo'); if (promo) promo.hidden = false; }
                return;
            }
            const ad = visibleAds[adRotationIndex.value % visibleAds.length];
            adRotationIndex.value += 1;
            try {
                const destination = new URL(ad.destination_url);
                const imageUrl = ad.image_path
                    ? new URL(apiUrl('ad_image', { id: ad.id }))
                    : new URL(ad.image_url);
                if (destination.protocol !== 'https:' || (!ad.image_path && imageUrl.protocol !== 'https:')) return;
                const card = document.createElement('article');
                card.className = 'ad-card';
                const label = document.createElement('span');
                label.className = 'ad-disclosure';
                label.textContent = 'Reklama';
                const hide = document.createElement('button');
                hide.type = 'button';
                hide.className = 'ad-hide-button';
                hide.textContent = 'Reklamani yashirish';
                hide.setAttribute('aria-label', 'Reklamani 30 kunga yashirish');
                hide.addEventListener('click', () => {
                    hideAdFor30Days(ad.id);
                    card.remove();
                    if (!container.querySelector('.ad-card')) {
                        container.hidden = true;
                        if (placement === 'home') { const promo = document.getElementById('instagramPromo'); if (promo) promo.hidden = false; }
                    }
                });
                const link = document.createElement('a');
                link.href = destination.href;
                link.target = '_blank';
                link.rel = 'noopener noreferrer sponsored';
                const image = document.createElement('img');
                image.src = imageUrl.href;
                image.alt = ad.title || 'Homiy reklama';
                image.loading = 'lazy';
                image.decoding = 'async';
                link.append(image);
                card.append(label, hide, link);
                container.append(card);
            } catch {
                return;
            }
            container.hidden = !container.querySelector('.ad-card');
            if (placement === 'home') { const promo = document.getElementById('instagramPromo'); if (promo) promo.hidden = !container.hidden; }
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
            loadSocialLinks(),
        ]);
        const params = new URLSearchParams(window.location.search);
        const requestedMovieId = Number(params.get('play') || 0);
        if (requestedMovieId > 0) {
            const result = await fetchAPI('get_movies', 'GET', { movie_id: requestedMovieId, limit: 1 });
            if (result.success && result.data.length) {
                const movie = result.data[0];
                movie.resume_seconds = Math.max(0, Number(params.get('resume') || 0));
                openPlayer(movie);
            } else {
                showNotice('Tanlangan kino topilmadi.');
            }
            window.history.replaceState({}, '', window.location.pathname + window.location.hash);
        }
    } catch (error) {
        status.textContent = error.message || 'Kinolarni yuklab bo‘lmadi.';
        status.classList.add('notice-error');
        renderMoviesError(status.textContent);
        const promo = document.getElementById('instagramPromo');
        if (promo && !document.getElementById('homeAds')?.querySelector('.ad-card')) promo.hidden = false;
    }
});
