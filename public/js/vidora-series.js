document.addEventListener('DOMContentLoaded', async () => {
    const catalog = document.getElementById('seriesCatalog');
    const detail = document.getElementById('seriesDetail');
    const title = document.getElementById('seriesPageTitle');
    const description = document.getElementById('seriesPageDescription');
    const status = document.getElementById('seriesPageStatus');
    const params = new URLSearchParams(window.location.search);
    const seriesId = Number(params.get('id') || 0);

    async function api(action, data = null) {
        const result = await fetchAPI(action, 'GET', data);
        if (!result.success) throw new Error(result.error || 'Ma’lumotlarni yuklab bo‘lmadi.');
        return result.data;
    }
    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }
    function renderCatalog(rows) {
        catalog.replaceChildren();
        for (const row of rows) {
            const card = element('article', 'series-card');
            const art = element('div', 'series-card-art');
            art.append(element('span', '', 'VIDORA SERIES'));
            const copy = element('div', 'series-card-copy');
            copy.append(element('h2', '', row.title));
            copy.append(element('p', '', [row.year, row.genre, `${row.season_count} mavsum`, `${row.episode_count} qism`].filter(Boolean).join(' · ')));
            const link = element('a', '', 'Serialni ko‘rish');
            link.href = `series.html?id=${encodeURIComponent(row.id)}`;
            copy.append(link);
            card.append(art, copy);
            catalog.append(card);
        }
        if (!rows.length) status.textContent = 'Hozircha nashr qilingan seriallar yo‘q.';
        else status.textContent = `${rows.length} ta serial topildi.`;
    }
    function renderDetail(series) {
        catalog.hidden = true;
        detail.hidden = false;
        title.textContent = series.title;
        description.textContent = series.description || 'Serial mavsumlari va qismlarini tanlang.';
        const meta = document.getElementById('seriesDetailMeta');
        meta.replaceChildren(element('h2', '', series.title));
        meta.append(element('p', '', [series.year, series.genre].filter(Boolean).join(' · ')));
        const seasonsNode = document.getElementById('seriesSeasons');
        seasonsNode.replaceChildren();
        for (const season of series.seasons || []) {
            const section = element('section', 'series-season');
            section.append(element('h3', '', `Mavsum ${season.season_number}${season.title ? ': ' + season.title : ''}`));
            for (const episode of season.episodes || []) {
                const row = element('div', 'series-episode');
                const info = element('div');
                info.append(element('strong', '', `${episode.episode_number}. ${episode.title}`));
                info.append(element('small', '', episode.duration_seconds ? `${Math.floor(episode.duration_seconds / 60)} daqiqa` : 'Qism'));
                const link = element('a', 'episode-watch-link', episode.has_video ? 'Tomosha qilish' : 'Tez orada');
                link.href = `watch-series.html?id=${encodeURIComponent(series.id)}&episode=${encodeURIComponent(episode.id)}`;
                if (!episode.has_video) link.setAttribute('aria-disabled', 'true');
                row.append(info, link);
                section.append(row);
            }
            seasonsNode.append(section);
        }
        status.textContent = 'Tomosha qilish uchun qismni tanlang. Ro‘yxatdan o‘tish shart emas.';
    }
    try {
        if (seriesId) {
            const series = await api('get_series_details', { id: seriesId });
            renderDetail(series);
        } else {
            const rows = await api('get_series', { limit: 100 });
            renderCatalog(rows || []);
        }
    } catch (error) {
        status.textContent = error.message;
    }
});
