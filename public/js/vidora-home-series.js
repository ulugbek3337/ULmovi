document.addEventListener('DOMContentLoaded', async () => {
    const grid = document.getElementById('homeSeriesGrid');
    const status = document.getElementById('homeSeriesStatus');
    if (!grid || !status) return;
    try {
        const result = await fetchAPI('get_series', 'GET', { limit: 6 });
        if (!result.success) throw new Error(result.error || 'Seriallar yuklanmadi.');
        grid.replaceChildren();
        for (const series of result.data || []) {
            const card = document.createElement('article');
            card.className = 'vidora-home-series-card';
            const art = document.createElement('div');
            art.className = 'vidora-home-series-art';
            art.textContent = 'VIDORA';
            const body = document.createElement('div');
            body.className = 'vidora-home-series-copy';
            const title = document.createElement('h3');
            title.textContent = series.title;
            const meta = document.createElement('p');
            meta.textContent = [series.year, series.genre, `${series.season_count} mavsum`, `${series.episode_count} qism`].filter(Boolean).join(' · ');
            const link = document.createElement('a');
            link.href = `series.html?id=${encodeURIComponent(series.id)}`;
            link.textContent = 'Serialni ko‘rish';
            body.append(title, meta, link);
            card.append(art, body);
            grid.append(card);
        }
        status.textContent = result.data?.length ? '' : 'Hozircha nashr qilingan seriallar yo‘q.';
    } catch (error) {
        status.textContent = error.message;
    }
});
