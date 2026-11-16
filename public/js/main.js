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
    let featuredMovies = [];
    let heroCurrentIndex = 0;
    let heroTimer = null;
    const heroElement = document.querySelector('.netflix-hero');
    const heroReducedMotion = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const heroBackground = document.getElementById('heroBackground');
    const heroPoster = document.getElementById('heroPoster');
    const heroTitle = document.getElementById('heroTitle');
    const heroTags = document.getElementById('heroTags');
    const heroMeta = document.getElementById('heroMeta');
    const heroDescription = document.getElementById('heroDescription');
    const heroPagination = document.getElementById('heroPagination');
    const heroWatchButton = document.getElementById('heroWatchBtn');
    const heroDetailsButton = document.getElementById('heroDetailsBtn');

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
        const posterLink = document.createElement('a');
        posterLink.className = 'movie-poster-link';
        posterLink.href = `#movie-${encodeURIComponent(movie.id)}`;
        posterLink.setAttribute('aria-label', `${movie.title || 'Kino'} haqida batafsil`);
        posterLink.addEventListener('click', (event) => {
            event.preventDefault();
            showDetails(movie);
        });

        const image = document.createElement('img');
        image.className = 'movie-poster';
        image.alt = `${movie.title || 'Kino'} posteri`;
        image.width = 400;
        image.height = 600;
        image.loading = 'lazy';
        image.decoding = 'async';
        image.fetchPriority = 'low';
        const imageSource = posterUrl(movie);
        const setPosterFallback = () => {
            image.hidden = true;
            posterWrap.classList.add('poster-placeholder');
            posterWrap.dataset.initial = (movie.title || 'U').trim().slice(0, 1).toUpperCase();
        };
        if (imageSource) {
            image.src = imageSource;
            image.addEventListener('error', setPosterFallback, { once: true });
        } else {
            setPosterFallback();
        }
        posterLink.append(image);

        const playIcon = document.createElement('span');
        playIcon.className = 'poster-play';
        playIcon.setAttribute('aria-hidden', 'true');
        playIcon.textContent = '▶';
        posterLink.append(playIcon);
        posterWrap.append(posterLink);

        const ratingCount = Number(movie.rating_count || 0);
        const averageRating = Number(movie.average_rating || movie.rating || 0);
        const ratingBadge = document.createElement('span');
        ratingBadge.className = 'movie-rating-badge';
        if (ratingCount > 0 && Number.isFinite(averageRating)) {
            ratingBadge.textContent = `★ ${averageRating.toFixed(1)}`;
        } else {
            ratingBadge.classList.add('movie-new-badge');
            ratingBadge.textContent = 'Yangi';
        }
        posterWrap.append(ratingBadge);

        const like = document.createElement('button');
        like.className = `like-button${movie.is_liked ? ' liked' : ''}`;
        like.type = 'button';
        like.setAttribute('aria-label', 'Kinoni yoqtirish');
        like.setAttribute('aria-pressed', String(Boolean(movie.is_liked)));
        like.textContent = `${movie.is_liked ? '♥' : '♡'} ${Number(movie.likes_count || 0)}`;
        like.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!window.currentUser) {
                showGuestRestriction();
                return;
            }
            like.disabled = true;
            try {
                const result = await fetchAPI('toggle_like', 'POST', { movie_id: movie.id });
                if (!result.success) throw new Error(result.error || 'Yoqtirish amali bajarilmadi.');
                movie.is_liked = Boolean(result.data.liked);
                movie.likes_count = Number(result.data.count || 0);
                like.classList.toggle('liked', movie.is_liked);
                like.setAttribute('aria-pressed', String(movie.is_liked));
                like.textContent = `${movie.is_liked ? '♥' : '♡'} ${movie.likes_count}`;
                renderPopularGrid(movies);
            } catch (error) {
                showNotice(error.message || 'Yoqtirish amali bajarilmadi.');
            } finally {
                like.disabled = false;
            }
        });
        posterWrap.append(like);

        const body = document.createElement('div');
        body.className = 'movie-card-body';
        const title = document.createElement('h3');
        title.textContent = movie.title || 'Nomsiz kino';
        const metadata = document.createElement('p');
        metadata.className = 'movie-meta';
        metadata.textContent = `${genreLabel(movie.genre)} · ${movie.year || 'Yil ko‘rsatilmagan'}`;
        body.append(title, metadata);
        card.append(posterWrap, body);
        return card;
    }

    function renderGrid(containerId, list, emptyText = 'Bu bo‘limda hozircha kino yo‘q.') {
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
        list.forEach((movie) => container.append(makeMovieCard(movie)));
    }

    function renderPopularGrid(list) {
        const container = document.getElementById('popularGrid');
        if (!container) return;
        container.replaceChildren();
        const ranked = [...list].sort((a, b) => Number(b.likes_count || 0) - Number(a.likes_count || 0)).slice(0, 5);
        if (!ranked.length) {
            const empty = document.createElement('p');
            empty.className = 'empty-message';
            empty.textContent = 'Hozircha ommabop kinolar yo‘q.';
            container.append(empty);
            return;
        }
        ranked.forEach((movie, index) => {
            const item = document.createElement('article');
            item.className = 'popular-card';
            const rank = document.createElement('span');
            rank.className = 'popular-rank';
            rank.textContent = String(index + 1);

            const link = document.createElement('a');
            link.className = 'popular-card-link';
            link.href = `#movie-${encodeURIComponent(movie.id)}`;
            link.setAttribute('aria-label', `${movie.title || 'Kino'} haqida batafsil`);
            link.addEventListener('click', (event) => {
                event.preventDefault();
                showDetails(movie);
            });

            const poster = document.createElement('div');
            poster.className = 'movie-poster-wrap';
            const image = document.createElement('img');
            image.className = 'movie-poster';
            image.alt = `${movie.title || 'Kino'} posteri`;
            image.width = 400;
            image.height = 600;
            image.loading = 'lazy';
            image.decoding = 'async';
            const source = posterUrl(movie);
            const fallback = () => {
                image.hidden = true;
                poster.classList.add('poster-placeholder');
                poster.dataset.initial = (movie.title || 'U').trim().slice(0, 1).toUpperCase();
            };
            if (source) {
                image.src = source;
                image.addEventListener('error', fallback, { once: true });
            } else fallback();
            poster.append(image);
            link.append(poster);

            const title = document.createElement('h3');
            title.className = 'movie-card-title';
            title.textContent = movie.title || 'Nomsiz kino';
            const likes = document.createElement('p');
            likes.className = 'popular-likes';
            likes.textContent = `♥ ${Number(movie.likes_count || 0)} ta yoqtirish`;
            item.append(rank, link, title, likes);
            container.append(item);
        });
    }

    function updateHeroSlide(index) {
        if (!featuredMovies.length) return;
        heroCurrentIndex = (index + featuredMovies.length) % featuredMovies.length;
        const movie = featuredMovies[heroCurrentIndex];
        const source = posterUrl(movie);
        heroTitle.textContent = movie.title || 'Nomsiz kino';
        heroDescription.textContent = movie.description || 'Bu kino haqida qo‘shimcha ma’lumot hozircha mavjud emas.';
        heroBackground.hidden = !source;
        heroPoster.hidden = !source;
        heroPoster.parentElement.hidden = !source;
        if (source) {
            heroBackground.src = source;
            heroPoster.src = source;
            heroPoster.alt = `${movie.title || 'Kino'} posteri`;
        }
        heroTags.replaceChildren();
        const recommendation = document.createElement('span');
        recommendation.className = 'hero-premiere';
        recommendation.textContent = 'ULmovi tanlovi';
        heroTags.append(recommendation);
        if (movie.genre) {
            const genre = document.createElement('span');
            genre.className = 'hero-tag';
            genre.textContent = genreLabel(movie.genre);
            heroTags.append(genre);
        }
        heroMeta.replaceChildren();
        if (Number(movie.rating_count || 0) > 0) {
            const rating = document.createElement('span');
            rating.className = 'hero-rating';
            rating.textContent = `★ ${Number(movie.average_rating || movie.rating || 0).toFixed(1)}`;
            heroMeta.append(rating);
        }
        if (movie.year) {
            const year = document.createElement('span');
            year.textContent = String(movie.year);
            heroMeta.append(year);
        }
        if (movie.genre) {
            const genre = document.createElement('span');
            genre.textContent = genreLabel(movie.genre);
            heroMeta.append(genre);
        }
        heroWatchButton.disabled = !movie.qualities?.length && !movie.video_url;
        heroWatchButton.onclick = () => openPlayer(movie);
        heroDetailsButton.onclick = () => showDetails(movie);
        heroPagination.replaceChildren();
        featuredMovies.forEach((item, dotIndex) => {
            const dot = document.createElement('button');
            dot.type = 'button';
            dot.className = dotIndex === heroCurrentIndex ? 'active' : '';
            dot.setAttribute('aria-label', `${dotIndex + 1}-tavsiya: ${item.title || 'Kino'}`);
            dot.setAttribute('aria-pressed', String(dotIndex === heroCurrentIndex));
            dot.addEventListener('click', () => updateHeroSlide(dotIndex));
            heroPagination.append(dot);
        });
    }

    function renderHeroCarousel(list) {
        featuredMovies = [...list].slice(0, 5);
        if (!featuredMovies.length) {
            heroTitle.textContent = 'Har bir hikoya shu yerdan boshlanadi';
            heroDescription.textContent = 'Sevimli filmlaringizni ULmovi’da tomosha qiling.';
            heroTags.replaceChildren();
            heroMeta.replaceChildren();
            heroPagination.replaceChildren();
            heroPoster.hidden = true;
            heroPoster.parentElement.hidden = true;
            heroBackground.hidden = true;
            heroWatchButton.disabled = true;
            heroDetailsButton.disabled = true;
            return;
        }
        heroDetailsButton.disabled = false;
        updateHeroSlide(Math.min(heroCurrentIndex, featuredMovies.length - 1));
    }

    function startHeroCarousel() {
        if (heroTimer) window.clearInterval(heroTimer);
        if (heroReducedMotion || featuredMovies.length < 2) return;
        heroTimer = window.setInterval(() => {
            if (heroElement.matches(':hover') || heroElement.contains(document.activeElement)) return;
            updateHeroSlide(heroCurrentIndex + 1);
        }, 7000);
    }

    function renderMovies() {
        const search = searchInput.value.trim().toLocaleLowerCase();
        const genre = genreFilter.value;
        const filtered = movies.filter((movie) => {
            const text = `${movie.title || ''} ${movie.genre || ''} ${movie.description || ''}`.toLocaleLowerCase();
            return (!search || text.includes(search)) && (!genre || movie.genre === genre);
        });
        renderGrid('moviesGrid', filtered, search || genre ? 'Qidiruv bo‘yicha kino topilmadi.' : 'Hozircha kinolar qo‘shilmagan.');
        renderPopularGrid(filtered);
        renderHeroCarousel(movies);
        status.textContent = `${filtered.length} ta kino`;
    }

    function renderLoadingSkeletons() {
        const grid = document.getElementById('moviesGrid');
        if (!grid) return;
        grid.replaceChildren();
        for (let index = 0; index < 8; index += 1) {
            const skeleton = document.createElement('div');
            skeleton.className = 'movie-skeleton';
            skeleton.setAttribute('aria-hidden', 'true');
            grid.append(skeleton);
        }
    }

    async function loadMovies(reset = false) {
        if (reset) {
            offset = 0;
            movies = [];
            status.textContent = 'Kinolar yuklanmoqda…';
            renderLoadingSkeletons();
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

    function closeMovieDetails() {
        detailModal.classList.remove('active');
        if (window.location.hash.startsWith('#movie-')) {
            window.history.replaceState({}, '', window.location.pathname + window.location.search);
        }
    }

    function showDetails(movie) {
        if (!movie) return;
        activeMovie = movie;
        detailContent.replaceChildren();
        const shareHash = `#movie-${encodeURIComponent(movie.id)}`;
        if (window.location.hash !== shareHash) {
            window.history.replaceState({}, '', window.location.pathname + window.location.search + shareHash);
        }

        const breadcrumb = document.createElement('nav');
        breadcrumb.className = 'detail-breadcrumb';
        breadcrumb.setAttribute('aria-label', 'Sahifa yo‘li');
        const homeLink = document.createElement('a');
        homeLink.href = 'index.html';
        homeLink.textContent = 'Bosh sahifa';
        const slashOne = document.createElement('span');
        slashOne.textContent = '/';
        const movieLink = document.createElement('a');
        movieLink.href = '#latest';
        movieLink.textContent = 'Kinolar';
        movieLink.addEventListener('click', closeMovieDetails);
        const slashTwo = document.createElement('span');
        slashTwo.textContent = '/';
        const currentTitle = document.createElement('span');
        currentTitle.textContent = movie.title || 'Kino';
        breadcrumb.append(homeLink, slashOne, movieLink, slashTwo, currentTitle);

        const playerPreview = document.createElement('div');
        playerPreview.className = 'detail-player';
        const previewImage = document.createElement('img');
        previewImage.alt = '';
        previewImage.setAttribute('aria-hidden', 'true');
        const previewSource = posterUrl(movie);
        if (previewSource) {
            previewImage.src = previewSource;
            previewImage.addEventListener('error', () => { previewImage.hidden = true; }, { once: true });
            playerPreview.append(previewImage);
        }
        const previewPlay = document.createElement('button');
        previewPlay.type = 'button';
        previewPlay.textContent = '▶';
        previewPlay.setAttribute('aria-label', `${movie.title || 'Kino'} filmini tomosha qilish`);
        previewPlay.disabled = !movie.qualities?.length && !movie.video_url;
        previewPlay.addEventListener('click', () => openPlayer(movie));
        playerPreview.append(previewPlay);

        const layout = document.createElement('div');
        layout.className = 'detail-layout';
        const main = document.createElement('div');
        main.className = 'detail-main';
        const title = document.createElement('h1');
        title.id = 'detailTitle';
        title.className = 'detail-title';
        title.textContent = movie.title || 'Nomsiz kino';

        const meta = document.createElement('div');
        meta.className = 'detail-meta';
        if (Number(movie.rating_count || 0) > 0) {
            const rating = document.createElement('span');
            rating.className = 'detail-rating';
            rating.textContent = `★ ${Number(movie.average_rating || movie.rating || 0).toFixed(1)}`;
            const count = document.createElement('span');
            count.textContent = `(${Number(movie.rating_count)} ta baho)`;
            meta.append(rating, count);
        }
        if (movie.year) {
            const year = document.createElement('span');
            year.textContent = String(movie.year);
            meta.append(year);
        }
        if (movie.genre) {
            const genre = document.createElement('span');
            genre.className = 'detail-genre';
            genre.textContent = genreLabel(movie.genre);
            meta.append(genre);
        }

        const actions = document.createElement('div');
        actions.className = 'detail-actions';
        const like = document.createElement('button');
        like.type = 'button';
        like.className = `${movie.is_liked ? 'liked' : ''}`;
        like.setAttribute('aria-pressed', String(Boolean(movie.is_liked)));
        like.textContent = `${movie.is_liked ? '♥ Yoqdi' : '♡ Yoqdi'} · ${Number(movie.likes_count || 0)}`;
        like.addEventListener('click', async () => {
            if (!window.currentUser) {
                showGuestRestriction();
                return;
            }
            like.disabled = true;
            try {
                const result = await fetchAPI('toggle_like', 'POST', { movie_id: movie.id });
                if (!result.success) throw new Error(result.error || 'Yoqtirish amali bajarilmadi.');
                movie.is_liked = Boolean(result.data.liked);
                movie.likes_count = Number(result.data.count || 0);
                like.classList.toggle('liked', movie.is_liked);
                like.setAttribute('aria-pressed', String(movie.is_liked));
                like.textContent = `${movie.is_liked ? '♥ Yoqdi' : '♡ Yoqdi'} · ${movie.likes_count}`;
                updateMovieInMemory(movie.id, { is_liked: movie.is_liked, likes_count: movie.likes_count });
            } catch (error) {
                showNotice(error.message || 'Yoqtirish amali bajarilmadi.');
            } finally {
                like.disabled = false;
            }
        });

        const download = document.createElement('a');
        download.className = 'detail-download';
        download.href = apiUrl('download_movie', { id: movie.id, quality: movie.qualities?.[0] || 'original' });
        download.textContent = '↓ Yuklab olish';
        download.addEventListener('click', (event) => {
            if (!window.currentUser) {
                event.preventDefault();
                showGuestRestriction();
            }
        });

        const share = document.createElement('button');
        share.type = 'button';
        share.textContent = '↗ Ulashish';
        share.addEventListener('click', async () => {
            const url = `${window.location.origin}${window.location.pathname}${shareHash}`;
            try {
                if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(url);
                } else {
                    const temporary = document.createElement('textarea');
                    temporary.value = url;
                    temporary.style.position = 'fixed';
                    temporary.style.opacity = '0';
                    document.body.append(temporary);
                    temporary.select();
                    document.execCommand('copy');
                    temporary.remove();
                }
                showNotice('Havola nusxalandi');
            } catch {
                showNotice('Havolani nusxalab bo‘lmadi.');
            }
        });
        actions.append(like, download, share);

        const description = document.createElement('p');
        description.className = 'detail-description';
        description.textContent = movie.description || 'Kino haqida ma’lumot berilmagan.';

        const ratingPanel = document.createElement('section');
        ratingPanel.className = 'rating-panel';
        const ratingTitle = document.createElement('h3');
        ratingTitle.textContent = 'Kinoni baholang';
        const stars = document.createElement('div');
        stars.className = 'detail-stars';
        stars.setAttribute('role', 'group');
        stars.setAttribute('aria-label', 'Kino uchun 1 dan 5 gacha baho tanlash');
        const ratingNote = document.createElement('span');
        ratingNote.className = 'detail-rating-note';
        function paintRating(previewScore = 0) {
            const selected = Number(movie.my_rating || 0);
            [...stars.children].forEach((star, index) => {
                const score = index + 1;
                star.classList.toggle('selected', !previewScore && score <= selected);
                star.classList.toggle('preview', Boolean(previewScore) && score <= previewScore);
                star.textContent = (previewScore ? score <= previewScore : score <= selected) ? '★' : '☆';
            });
            ratingNote.textContent = selected
                ? `Sizning bahoyingiz: ${selected} / 5`
                : 'Baholash uchun yulduzni tanlang';
        }
        for (let score = 1; score <= 5; score += 1) {
            const star = document.createElement('button');
            star.type = 'button';
            star.setAttribute('aria-label', `${score} yulduz`);
            star.setAttribute('aria-pressed', String(Number(movie.my_rating || 0) === score));
            star.addEventListener('mouseenter', () => paintRating(score));
            star.addEventListener('focus', () => paintRating(score));
            star.addEventListener('click', async () => {
                if (!window.currentUser) {
                    showGuestRestriction();
                    return;
                }
                star.disabled = true;
                try {
                    const result = await fetchAPI('rate_movie', 'POST', { movie_id: movie.id, score });
                    if (!result.success) throw new Error(result.error || 'Baho saqlanmadi.');
                    movie.my_rating = score;
                    movie.average_rating = result.data.average;
                    movie.rating_count = result.data.count;
                    updateMovieInMemory(movie.id, {
                        my_rating: score,
                        average_rating: result.data.average,
                        rating_count: result.data.count,
                    });
                    showDetails(movie);
                } catch (error) {
                    showNotice(error.message || 'Baho saqlanmadi.');
                } finally {
                    star.disabled = false;
                }
            });
            stars.append(star);
        }
        stars.addEventListener('mouseleave', () => paintRating());
        paintRating();
        ratingPanel.append(ratingTitle, stars, ratingNote);

        const commentsSection = document.createElement('section');
        commentsSection.className = 'comments-section';
        const commentsTitle = document.createElement('h3');
        commentsTitle.textContent = 'Izohlar ';
        const commentsCount = document.createElement('span');
        commentsCount.className = 'comment-count';
        commentsCount.id = 'detailCommentCount';
        commentsCount.textContent = '(…)';
        commentsTitle.append(commentsCount);
        const form = document.createElement('form');
        form.className = 'comment-form';
        const textarea = document.createElement('textarea');
        textarea.name = 'body';
        textarea.maxLength = 2000;
        textarea.placeholder = 'Fikringizni yozing…';
        textarea.setAttribute('aria-label', 'Izoh matni');
        const submit = document.createElement('button');
        submit.type = 'submit';
        submit.textContent = 'Yuborish';
        form.append(textarea, submit);
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!window.currentUser) {
                showGuestRestriction();
                return;
            }
            if (!textarea.value.trim()) {
                textarea.focus();
                return;
            }
            submit.disabled = true;
            try {
                const result = await fetchAPI('add_comment', 'POST', { movie_id: movie.id, body: textarea.value });
                if (!result.success) throw new Error(result.error || 'Izoh yuborilmadi.');
                textarea.value = '';
                await loadComments(movie, commentList);
            } catch (error) {
                showNotice(error.message || 'Izoh yuborilmadi.');
            } finally {
                submit.disabled = false;
            }
        });
        const commentList = document.createElement('div');
        commentList.className = 'comment-list';
        commentsSection.append(commentsTitle, form, commentList);

        main.append(title, meta, actions, description, ratingPanel, commentsSection);

        const sidebar = document.createElement('aside');
        sidebar.className = 'detail-sidebar';
        const similarTitle = document.createElement('h3');
        similarTitle.textContent = 'O‘xshash kinolar';
        const similarList = document.createElement('div');
        similarList.className = 'similar-list';
        const similarMovies = movies.filter((item) =>
            Number(item.id) !== Number(movie.id) && movie.genre && item.genre === movie.genre
        ).slice(0, 4);
        if (!similarMovies.length) {
            const empty = document.createElement('p');
            empty.className = 'section-note';
            empty.textContent = 'Hozircha o‘xshash kinolar yo‘q.';
            similarList.append(empty);
        }
        similarMovies.forEach((item) => {
            const link = document.createElement('a');
            link.className = 'similar-movie';
            link.href = `#movie-${encodeURIComponent(item.id)}`;
            link.addEventListener('click', (event) => {
                event.preventDefault();
                showDetails(item);
            });
            const source = posterUrl(item);
            if (source) {
                const image = document.createElement('img');
                image.src = source;
                image.alt = `${item.title || 'Kino'} posteri`;
                image.width = 54;
                image.height = 81;
                image.loading = 'lazy';
                image.addEventListener('error', () => {
                    const fallback = document.createElement('span');
                    fallback.className = 'similar-poster-fallback';
                    fallback.textContent = (item.title || 'U').trim().slice(0, 1).toUpperCase();
                    image.replaceWith(fallback);
                }, { once: true });
                link.append(image);
            } else {
                const fallback = document.createElement('span');
                fallback.className = 'similar-poster-fallback';
                fallback.textContent = (item.title || 'U').trim().slice(0, 1).toUpperCase();
                link.append(fallback);
            }
            const info = document.createElement('span');
            info.className = 'similar-info';
            const name = document.createElement('strong');
            name.textContent = item.title || 'Nomsiz kino';
            const details = document.createElement('span');
            details.textContent = `${genreLabel(item.genre)} · ${item.year || 'Yil ko‘rsatilmagan'}`;
            const similarRating = document.createElement('span');
            similarRating.className = 'similar-rating';
            similarRating.textContent = Number(item.rating_count || 0) > 0
                ? `★ ${Number(item.average_rating || item.rating || 0).toFixed(1)}`
                : 'Yangi';
            info.append(name, details, similarRating);
            link.append(info);
            similarList.append(link);
        });
        sidebar.append(similarTitle, similarList);
        const detailAds = document.createElement('div');
        detailAds.className = 'ad-slot detail-ad';
        sidebar.append(detailAds);
        loadAds('movie_detail', detailAds);

        layout.append(main, sidebar);
        detailContent.append(breadcrumb, playerPreview, layout);
        detailModal.classList.add('active');
        loadComments(movie, commentList);
    }

    async function loadComments(movie, container) {
        container.textContent = 'Izohlar yuklanmoqda…';
        try {
            const result = await fetchAPI('get_comments', 'GET', { id: movie.id });
            if (!result.success) throw new Error(result.error || 'Izohlarni olib bo‘lmadi.');
            const count = document.getElementById('detailCommentCount');
            if (count) count.textContent = `(${result.data.length})`;
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
                const initials = document.createElement('span');
                initials.className = 'comment-avatar';
                initials.setAttribute('aria-hidden', 'true');
                initials.textContent = String(comment.username || 'U').trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase();
                const content = document.createElement('div');
                content.className = 'comment-body';
                const header = document.createElement('div');
                header.className = 'comment-header';
                const author = document.createElement('strong');
                author.textContent = comment.username || 'Foydalanuvchi';
                const date = document.createElement('time');
                const createdAt = new Date(comment.created_at);
                date.dateTime = Number.isNaN(createdAt.getTime()) ? '' : createdAt.toISOString();
                if (Number.isNaN(createdAt.getTime())) {
                    date.textContent = 'Sana noma’lum';
                } else {
                    const elapsed = Math.max(0, Date.now() - createdAt.getTime());
                    const minutes = Math.floor(elapsed / 60000);
                    const hours = Math.floor(elapsed / 3600000);
                    const days = Math.floor(elapsed / 86400000);
                    date.textContent = minutes < 1 ? 'Hozirgina'
                        : minutes < 60 ? `${minutes} daqiqa oldin`
                        : hours < 24 ? `${hours} soat oldin`
                        : days < 30 ? `${days} kun oldin`
                        : createdAt.toLocaleDateString('uz-UZ');
                }
                const body = document.createElement('p');
                body.textContent = comment.body || '';
                header.append(author, date);
                content.append(header, body);
                item.append(initials, content);

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
                        try {
                            const update = await fetchAPI('update_comment', 'POST', { id: comment.id, body: nextBody });
                            if (!update.success) throw new Error(update.error || 'Izoh yangilanmadi.');
                            await loadComments(movie, container);
                        } catch (error) {
                            showNotice(error.message || 'Izoh yangilanmadi.');
                        }
                    });
                    const remove = document.createElement('button');
                    remove.type = 'button';
                    remove.textContent = 'O‘chirish';
                    remove.addEventListener('click', async () => {
                        if (!window.confirm('Izoh o‘chirilsinmi?')) return;
                        try {
                            const deleted = await fetchAPI('delete_comment', 'POST', { id: comment.id });
                            if (!deleted.success) throw new Error(deleted.error || 'Izoh o‘chirilmadi.');
                            await loadComments(movie, container);
                        } catch (error) {
                            showNotice(error.message || 'Izoh o‘chirilmadi.');
                        }
                    });
                    actions.append(edit, remove);
                    content.append(actions);
                }
                container.append(item);
            });
        } catch (error) {
            const count = document.getElementById('detailCommentCount');
            if (count) count.textContent = '';
            container.textContent = error.message || 'Izohlarni olib bo‘lmadi.';
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
        try {
            const result = await fetchAPI('get_social_links');
            if (!result.success || !Array.isArray(result.data)) {
                if (promo) promo.hidden = true;
                return;
            }
            if (footer) footer.replaceChildren();
            const symbols = { telegram: '➤', instagram: '◎', youtube: '▶', tiktok: '♪', facebook: 'f', x: '𝕏' };
            let instagramUrl = '';
            result.data.forEach((item) => {
                if (!item || typeof item.name !== 'string' || typeof item.url !== 'string') return;
                try {
                    const destination = new URL(item.url);
                    if (destination.protocol !== 'https:') return;
                    if (item.name.trim().toLowerCase() === 'instagram') instagramUrl = destination.href;
                    if (!footer) return;
                    const link = document.createElement('a');
                    link.href = destination.href;
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    link.setAttribute('aria-label', item.name);
                    link.title = item.name;
                    link.textContent = symbols[item.name.trim().toLowerCase()] || item.name.trim().slice(0, 1).toUpperCase();
                    footer.append(link);
                } catch {
                    return;
                }
            });
            if (promo) {
                if (instagramUrl) {
                    promo.href = instagramUrl;
                    promo.hidden = false;
                    const handle = promo.querySelector('.promo-handle');
                    if (handle) {
                        const path = new URL(instagramUrl).pathname.split('/').filter(Boolean).pop();
                        handle.textContent = path ? `@${path}` : 'Instagram';
                    }
                } else {
                    promo.hidden = true;
                }
            }
        } catch (error) {
            if (promo) promo.hidden = true;
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
            if (!result.success || !Array.isArray(result.data) || !result.data.length) return;
            const hiddenAds = getHiddenAds();
            const visibleAds = result.data.filter((ad) => !hiddenAds[String(ad.id)]);
            if (!visibleAds.length) return;
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
                    if (!container.querySelector('.ad-card')) container.hidden = true;
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
    }
});
