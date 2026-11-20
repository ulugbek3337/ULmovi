document.addEventListener('DOMContentLoaded', async () => {
    const status = document.getElementById('seriesAdminStatus');
    const seriesForm = document.getElementById('seriesForm');
    const seasonForm = document.getElementById('seasonForm');
    const episodeForm = document.getElementById('episodeForm');
    const seriesList = document.getElementById('seriesList');
    const seasonList = document.getElementById('seasonList');
    const episodeList = document.getElementById('episodeList');
    const seasonSeriesSelect = document.getElementById('seasonSeriesId');
    const episodeSeasonSelect = document.getElementById('episodeSeasonId');
    let seriesRows = [];
    let selectedSeriesId = 0;
    let selectedSeasonId = 0;
    let selectedDetail = null;

    function message(value, isError = false) {
        status.textContent = value || '';
        status.classList.toggle('error', isError);
    }

    async function api(action, method = 'GET', data = null) {
        const result = await fetchAPI(action, method, data);
        if (!result.success) throw new Error(result.error || 'So‘rov bajarilmadi.');
        return result.data;
    }

    function formData(form) {
        return Object.fromEntries(new FormData(form).entries());
    }

    function actionButton(label, action, id, extra = '') {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.dataset.action = action;
        button.dataset.id = String(id);
        if (extra) button.dataset.extra = String(extra);
        return button;
    }

    function renderSeries() {
        document.getElementById('seriesCount').textContent = String(seriesRows.length);
        seriesList.replaceChildren();
        if (!seriesRows.length) {
            const empty = document.createElement('p');
            empty.className = 'empty-state';
            empty.textContent = 'Hozircha serial qo‘shilmagan.';
            seriesList.append(empty);
            return;
        }
        for (const series of seriesRows) {
            const item = document.createElement('div');
            item.className = 'series-item';
            if (Number(series.id) === selectedSeriesId) item.classList.add('selected');
            const details = document.createElement('div');
            details.className = 'series-item-main';
            const title = document.createElement('strong');
            title.textContent = series.title;
            const meta = document.createElement('small');
            meta.textContent = `${series.status} · ${series.season_count} mavsum · ${series.episode_count} qism`;
            details.append(title, meta);
            const actions = document.createElement('div');
            actions.className = 'item-actions';
            actions.append(actionButton('Ochish', 'select-series', series.id), actionButton('Tahrirlash', 'edit-series', series.id), actionButton('O‘chirish', 'delete-series', series.id));
            item.append(details, actions);
            seriesList.append(item);
        }
    }

    function resetSeasonForm() {
        seasonForm.reset();
        document.getElementById('seasonId').value = '';
        if (selectedSeriesId) seasonSeriesSelect.value = String(selectedSeriesId);
    }

    function resetEpisodeForm() {
        episodeForm.reset();
        document.getElementById('episodeId').value = '';
        if (selectedSeasonId) episodeSeasonSelect.value = String(selectedSeasonId);
    }

    function renderSeasonOptions() {
        seasonSeriesSelect.replaceChildren(new Option('Serialni tanlang', ''));
        const selected = seriesRows.find((row) => Number(row.id) === selectedSeriesId);
        for (const row of seriesRows) seasonSeriesSelect.add(new Option(row.title, String(row.id)));
        seasonSeriesSelect.value = selected ? String(selected.id) : '';
    }

    function renderEpisodeOptions() {
        episodeSeasonSelect.replaceChildren(new Option('Mavsumni tanlang', ''));
        for (const season of selectedDetail?.seasons || []) {
            episodeSeasonSelect.add(new Option(`Mavsum ${season.season_number} · ${season.title || ''}`, String(season.id)));
        }
        episodeSeasonSelect.value = selectedSeasonId ? String(selectedSeasonId) : '';
    }

    function renderHierarchy() {
        seasonList.replaceChildren();
        episodeList.replaceChildren();
        const seasons = selectedDetail?.seasons || [];
        document.getElementById('selectedSeriesLabel').textContent = selectedDetail?.title || 'Serial tanlanmagan';
        document.getElementById('selectedSeasonLabel').textContent = selectedSeasonId ? 'Mavsum tanlangan' : 'Mavsum tanlanmagan';
        if (!seasons.length) {
            const empty = document.createElement('p');
            empty.className = 'empty-state';
            empty.textContent = 'Bu serialda mavsum yo‘q.';
            seasonList.append(empty);
        }
        for (const season of seasons) {
            const item = document.createElement('div');
            item.className = 'hierarchy-item';
            const details = document.createElement('div');
            details.className = 'hierarchy-item-main';
            const title = document.createElement('strong');
            title.textContent = `Mavsum ${season.season_number}: ${season.title || ''}`;
            const meta = document.createElement('small');
            meta.textContent = `${season.episodes.length} qism`;
            details.append(title, meta);
            const actions = document.createElement('div');
            actions.className = 'item-actions';
            actions.append(
                actionButton('Qismlar', 'select-season', season.id),
                actionButton('Tahrirlash', 'edit-season', season.id),
                actionButton('O‘chirish', 'delete-season', season.id)
            );
            item.append(details, actions);
            seasonList.append(item);
        }

        const selectedSeason = seasons.find((season) => Number(season.id) === selectedSeasonId);
        if (!selectedSeason) {
            const empty = document.createElement('p');
            empty.className = 'empty-state';
            empty.textContent = 'Qismlarni ko‘rish uchun mavsum tanlang.';
            episodeList.append(empty);
            return;
        }
        document.getElementById('selectedSeasonLabel').textContent = `Mavsum ${selectedSeason.season_number}`;
        if (!selectedSeason.episodes.length) {
            const empty = document.createElement('p');
            empty.className = 'empty-state';
            empty.textContent = 'Bu mavsumda qism yo‘q.';
            episodeList.append(empty);
        }
        for (const episode of selectedSeason.episodes) {
            const item = document.createElement('div');
            item.className = 'hierarchy-item';
            const details = document.createElement('div');
            details.className = 'hierarchy-item-main';
            const title = document.createElement('strong');
            title.textContent = `${episode.episode_number}. ${episode.title}`;
            const meta = document.createElement('small');
            meta.textContent = `${episode.status} · ${episode.duration_seconds || 0} soniya · ${episode.file_count} fayl`;
            details.append(title, meta);
            const actions = document.createElement('div');
            actions.className = 'item-actions';
            actions.append(actionButton('Tahrirlash', 'edit-episode', episode.id), actionButton('O‘chirish', 'delete-episode', episode.id));
            item.append(details, actions);
            episodeList.append(item);
        }
    }

    async function loadSeries() {
        seriesRows = await api('admin_get_series');
        renderSeries();
        renderSeasonOptions();
    }

    async function selectSeries(id) {
        selectedSeriesId = Number(id);
        selectedSeasonId = 0;
        selectedDetail = await api('admin_get_series_details', 'GET', { id: selectedSeriesId });
        renderSeries();
        renderSeasonOptions();
        renderEpisodeOptions();
        renderHierarchy();
        resetSeasonForm();
        resetEpisodeForm();
    }

    function fillForm(form, values) {
        for (const [key, value] of Object.entries(values)) {
            const field = form.elements.namedItem(key);
            if (field) field.value = value ?? '';
        }
    }

    seriesList.addEventListener('click', async (event) => {
        const button = event.target.closest('button[data-action]');
        if (!button) return;
        const id = Number(button.dataset.id);
        try {
            if (button.dataset.action === 'select-series') await selectSeries(id);
            if (button.dataset.action === 'delete-series' && window.confirm('Serial, barcha mavsumlari va qismlarini o‘chirishni tasdiqlaysizmi?')) {\n                await api('admin_delete_series', 'POST', { id });\n                if (selectedSeriesId === id) { selectedSeriesId = 0; selectedSeasonId = 0; selectedDetail = null; renderHierarchy(); }\n                await loadSeries();\n                message('Serial o‘chirildi.');\n            }\n            if (button.dataset.action === 'edit-series') {
                const row = seriesRows.find((item) => Number(item.id) === id);
                if (row) fillForm(seriesForm, row);
                await selectSeries(id);
                fillForm(seriesForm, seriesRows.find((item) => Number(item.id) === id) || {});
            }
        } catch (error) { message(error.message, true); }
    });

    seasonList.addEventListener('click', async (event) => {
        const button = event.target.closest('button[data-action]');
        if (!button || !selectedDetail) return;
        const id = Number(button.dataset.id);
        const season = selectedDetail.seasons.find((item) => Number(item.id) === id);
        try {
            if (button.dataset.action === 'select-season') {
                selectedSeasonId = id;
                renderEpisodeOptions();
                renderHierarchy();
                resetEpisodeForm();
            } else if (button.dataset.action === 'edit-season' && season) {
                selectedSeasonId = id;
                renderEpisodeOptions();
                fillForm(seasonForm, { ...season, series_id: selectedSeriesId });
                renderHierarchy();
            } else if (button.dataset.action === 'delete-season' && window.confirm('Mavsum va uning barcha qismlarini o‘chirishni tasdiqlaysizmi?')) {
                await api('admin_delete_season', 'POST', { id });
                if (selectedSeasonId === id) selectedSeasonId = 0;
                await selectSeries(selectedSeriesId);
                message('Mavsum o‘chirildi.');
            }
        } catch (error) { message(error.message, true); }
    });

    episodeList.addEventListener('click', async (event) => {
        const button = event.target.closest('button[data-action]');
        if (!button || !selectedDetail) return;
        const season = selectedDetail.seasons.find((item) => Number(item.id) === selectedSeasonId);
        const episode = season?.episodes.find((item) => Number(item.id) === Number(button.dataset.id));
        if (!episode) return;
        try {
            if (button.dataset.action === 'edit-episode') {
                fillForm(episodeForm, { ...episode, season_id: selectedSeasonId });
            } else if (button.dataset.action === 'delete-episode' && window.confirm('Qismni o‘chirishni tasdiqlaysizmi?')) {
                await api('admin_delete_episode', 'POST', { id: episode.id });
                await selectSeries(selectedSeriesId);
                selectedSeasonId = Number(season.id);
                renderEpisodeOptions();
                renderHierarchy();
                message('Qism o‘chirildi.');
            }
        } catch (error) { message(error.message, true); }
    });

    seriesForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
            const data = formData(seriesForm);
            const result = await api('admin_save_series', 'POST', data);
            await loadSeries();
            await selectSeries(Number(result.id));
            seriesForm.reset();
            document.getElementById('seriesId').value = '';
            message('Serial ma’lumotlari saqlandi.');
        } catch (error) { message(error.message, true); }
    });

    seasonForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
            const data = formData(seasonForm);
            if (!data.series_id) throw new Error('Avval serialni tanlang.');
            await api('admin_save_season', 'POST', data);
            await selectSeries(Number(data.series_id));
            resetSeasonForm();
            message('Mavsum saqlandi.');
        } catch (error) { message(error.message, true); }
    });

    episodeForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
            const data = formData(episodeForm);
            if (!data.season_id) throw new Error('Avval mavsumni tanlang.');
            await api('admin_save_episode', 'POST', data);
            await selectSeries(selectedSeriesId);
            selectedSeasonId = Number(data.season_id);
            renderEpisodeOptions();
            renderHierarchy();
            resetEpisodeForm();
            message('Qism saqlandi.');
        } catch (error) { message(error.message, true); }
    });

    seasonSeriesSelect.addEventListener('change', async () => {
        const id = Number(seasonSeriesSelect.value);
        if (id) {
            try { await selectSeries(id); } catch (error) { message(error.message, true); }
        }
    });
    episodeSeasonSelect.addEventListener('change', () => {
        selectedSeasonId = Number(episodeSeasonSelect.value) || 0;
        renderHierarchy();
    });
    document.getElementById('newSeriesBtn').addEventListener('click', () => {
        seriesForm.reset();
        document.getElementById('seriesId').value = '';
        document.getElementById('seriesStatus').value = 'draft';
    });
    document.getElementById('seriesLogout').addEventListener('click', async () => {
        try {
            await api('auth_logout', 'POST');
            window.location.replace('admin.html');
        } catch (error) { message(error.message, true); }
    });

    try {
        const auth = await api('auth_me');
        const user = auth?.user || auth;
        if (!user || !['admin', 'super_admin'].includes(user.role)) {
            message('Bu sahifa faqat administratorlar uchun. Avval admin hisobiga kiring.', true);
            return;
        }
        await loadSeries();
        message('Seriallar boshqaruvi tayyor.');
    } catch (error) {
        message(error.message, true);
    }
});
