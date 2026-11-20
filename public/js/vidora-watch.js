document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const seriesId = Number(params.get('id') || 0);
    const requestedEpisodeId = Number(params.get('episode') || 0);
    const titleNode = document.getElementById('seriesTitle');
    const episodeTitleNode = document.getElementById('episodeTitle');
    const player = document.getElementById('episodePlayer');
    const playerMessage = document.getElementById('playerMessage');
    const nav = document.getElementById('episodeNavigation');
    const qualitySelect = document.getElementById('qualitySelect');
    const nextButton = document.getElementById('nextEpisode');
    const descriptionNode = document.getElementById('watchDescription');
    const statusNode = document.getElementById('watchStatus');
    const streamUrl = new URL('../backend/index.php', window.location.href);
    let episodes = [];
    let currentIndex = -1;
    let signedIn = false;
    let pendingResume = 0;
    let lastSavedAt = 0;
    let saving = false;

    function api(action, method = 'GET', data = null) {
        return fetchAPI(action, method, data).then((result) => {
            if (!result.success) throw new Error(result.error || 'So‘rov bajarilmadi.');
            return result.data;
        });
    }

    function episodeStreamUrl(episode, quality) {
        const url = new URL(streamUrl);
        url.searchParams.set('action', 'stream_episode');
        url.searchParams.set('id', String(episode.id));
        url.searchParams.set('quality', quality);
        return url.href;
    }

    function renderNavigation() {
        nav.replaceChildren();
        let previousSeason = 0;
        for (let index = 0; index < episodes.length; index += 1) {
            const episode = episodes[index];
            if (episode.season_number !== previousSeason) {
                previousSeason = episode.season_number;
                const heading = document.createElement('p');
                heading.className = 'watch-eyebrow';
                heading.textContent = `MAVSUM ${previousSeason}`;
                nav.append(heading);
            }
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'episode-nav-button';
            button.disabled = !episode.has_video || !episode.qualities.length;
            if (index === currentIndex) button.classList.add('active');
            const number = document.createElement('span');
            number.className = 'episode-nav-number';
            number.textContent = String(episode.episode_number).padStart(2, '0');
            const text = document.createElement('span');
            text.className = 'episode-nav-text';
            const strong = document.createElement('strong');
            strong.textContent = episode.title;
            const small = document.createElement('small');
            small.textContent = episode.has_video ? (episode.qualities.join(' · ') || 'Video') : 'Video tez orada';
            text.append(strong, small);
            button.append(number, text);
            button.addEventListener('click', () => selectEpisode(index, true));
            nav.append(button);
        }
    }

    async function saveProgress(force = false) {
        if (!signedIn || currentIndex < 0 || !Number.isFinite(player.currentTime)) return;
        const now = Date.now();
        if (saving || (!force && now - lastSavedAt < 15000)) return;
        saving = true;
        try {
            await api('save_episode_progress', 'POST', {
                episode_id: episodes[currentIndex].id,
                position_seconds: String(Math.floor(player.currentTime))
            });
            lastSavedAt = now;
        } catch (error) {
            statusNode.textContent = error.message;
        } finally {
            saving = false;
        }
    }

    async function selectEpisode(index, autoplay = false) {
        if (index < 0 || index >= episodes.length) return;
        const episode = episodes[index];
        if (!episode.has_video || !episode.qualities.length) {
            playerMessage.textContent = 'Bu qism videosi hali yuklanmagan.';
            return;
        }
        await saveProgress(true);
        currentIndex = index;
        pendingResume = 0;
        episodeTitleNode.textContent = `Mavsum ${episode.season_number} · ${episode.episode_number}-qism: ${episode.title}`;
        descriptionNode.textContent = episode.description || '';
        qualitySelect.replaceChildren();
        for (const quality of episode.qualities) qualitySelect.add(new Option(quality, quality));
        const preferred = episode.qualities.includes('1080p') ? '1080p'
            : episode.qualities.includes('720p') ? '720p' : episode.qualities[0];
        qualitySelect.value = preferred;
        player.src = episodeStreamUrl(episode, preferred);
        player.load();
        playerMessage.textContent = 'Video yuklanmoqda…';
        nextButton.disabled = index >= episodes.length - 1;
        renderNavigation();
        const url = new URL(window.location.href);
        url.searchParams.set('episode', String(episode.id));
        window.history.replaceState({}, '', url);
        if (signedIn) {
            try {
                const progress = await api('get_episode_progress', 'GET', { id: episode.id });
                pendingResume = Number(progress?.position_seconds || 0);
                if (pendingResume > 5) statusNode.textContent = `Tomosha ${Math.floor(pendingResume / 60)}-daqiqadan davom etadi.`;
            } catch (error) {
                statusNode.textContent = error.message;
            }
        }
        if (autoplay) player.play().catch(() => { playerMessage.textContent = 'Videoni boshlash uchun Play tugmasini bosing.'; });
    }

    qualitySelect.addEventListener('change', async () => {
        if (currentIndex < 0) return;
        const position = player.currentTime || 0;
        const wasPlaying = !player.paused;
        const episode = episodes[currentIndex];
        player.src = episodeStreamUrl(episode, qualitySelect.value);
        player.load();
        player.addEventListener('loadedmetadata', function restoreQualityPosition() {
            player.currentTime = position;
            if (wasPlaying) player.play().catch(() => {});
        }, { once: true });
    });

    player.addEventListener('loadedmetadata', () => {
        if (pendingResume > 5 && pendingResume < player.duration - 5) {
            player.currentTime = pendingResume;
            pendingResume = 0;
        }
        playerMessage.textContent = '';
    });
    player.addEventListener('error', () => {
        playerMessage.textContent = 'Video ochilmadi. Boshqa sifatni tanlang yoki keyinroq urinib ko‘ring.';
    });
    player.addEventListener('timeupdate', () => saveProgress(false));
    player.addEventListener('pause', () => saveProgress(true));
    player.addEventListener('ended', async () => {
        await saveProgress(true);
        if (currentIndex < episodes.length - 1) selectEpisode(currentIndex + 1, true);
    });
    nextButton.addEventListener('click', () => selectEpisode(currentIndex + 1, true));

    try {
        if (!seriesId) throw new Error('Serial ID ko‘rsatilmagan.');
        const [series, auth] = await Promise.all([
            api('get_series_details', 'GET', { id: seriesId }),
            api('auth_me').catch(() => null)
        ]);
        signedIn = Boolean(auth?.user || auth);
        titleNode.textContent = series.title;
        for (const season of series.seasons || []) {
            for (const episode of season.episodes || []) {
                episodes.push({ ...episode, season_number: Number(season.season_number) });
            }
        }
        renderNavigation();
        if (!episodes.length) throw new Error('Bu serialda hali nashr qilingan qismlar yo‘q.');
        const requestedIndex = episodes.findIndex((episode) => Number(episode.id) === requestedEpisodeId);
        const firstPlayable = episodes.findIndex((episode) => episode.has_video && episode.qualities.length);
        await selectEpisode(requestedIndex >= 0 ? requestedIndex : Math.max(0, firstPlayable), false);
    } catch (error) {
        playerMessage.textContent = error.message;
        statusNode.textContent = error.message;
    }
});
