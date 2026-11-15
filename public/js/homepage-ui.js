document.addEventListener('DOMContentLoaded', () => {
    const genreSelect = document.getElementById('genreFilter');
    const chips = [...document.querySelectorAll('.genre-chip')];
    const yearSelect = document.getElementById('yearFilter');
    const sortSelect = document.getElementById('sortFilter');
    const grid = document.getElementById('moviesGrid');
    const grids = ['moviesGrid', 'popularGrid', 'topRatedGrid', 'recommendedGrid']
        .map((id) => document.getElementById(id))
        .filter(Boolean);
    if (!genreSelect || !grid || !grids.length) return;

    function syncGenreChips() {
        chips.forEach((chip) => {
            const active = (chip.dataset.genre || '') === genreSelect.value;
            chip.classList.toggle('active', active);
            chip.setAttribute('aria-pressed', String(active));
        });
    }

    chips.forEach((chip) => chip.addEventListener('click', () => {
        genreSelect.value = chip.dataset.genre || '';
        genreSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }));
    genreSelect.addEventListener('change', syncGenreChips);
    syncGenreChips();

    function getYear(card) {
        const match = card.querySelector('.movie-meta')?.textContent.match(/\b(19|20)\d{2}\b/);
        return match ? Number(match[0]) : 0;
    }
    function getRating(card) {
        const badge = card.querySelector('.movie-rating-badge')?.textContent || '';
        const match = badge.match(/[0-9]+(?:\.[0-9]+)?/);
        return match ? Number(match[0]) : 0;
    }
    function getLikes(card) {
        const match = card.querySelector('.like-button')?.textContent.match(/\d+/);
        return match ? Number(match[0]) : 0;
    }
    function enhanceCards() {
        const allCards = grids.flatMap((container) => [...container.querySelectorAll('.movie-card')]);
        const cards = [...grid.querySelectorAll('.movie-card')];
        const years = [...new Set(allCards.map(getYear).filter(Boolean))].sort((a,b) => b-a);
        const selectedYear = yearSelect.value;
        years.forEach((year) => {
            if ([...yearSelect.options].some((option) => option.value === String(year))) return;
            const option = document.createElement('option');
            option.value = String(year);
            option.textContent = String(year);
            yearSelect.append(option);
        });
        allCards.forEach((card) => {
            const yearMatch = !selectedYear || getYear(card) === Number(selectedYear);
            card.hidden = !yearMatch;
            const ratingRow = card.querySelector('.movie-rating-row');
            const rating = ratingRow?.querySelector('span');
            const poster = card.querySelector('.movie-poster-wrap');
            const image = poster?.querySelector('.movie-poster');
            if (image && !image.getAttribute('src')) {
                image.hidden = true;
                poster.classList.add('poster-placeholder');
                poster.dataset.initial = (card.querySelector('h3')?.textContent || 'U').trim().slice(0, 1).toUpperCase();
            }
            if (rating && poster && !poster.querySelector('.movie-rating-badge')) {
                rating.classList.add('movie-rating-badge');
                poster.append(rating);
            }
            const play = card.querySelector('.poster-play');
            if (play) play.textContent = '▶';
        });
        const sort = sortSelect?.value || 'latest';
        const visible = cards.filter((card) => !card.hidden);
        visible.sort((a,b) => {
            if (sort === 'rating') return getRating(b)-getRating(a);
            if (sort === 'popular') return getLikes(b)-getLikes(a);
            if (sort === 'oldest') return getYear(a)-getYear(b);
            return getYear(b)-getYear(a);
        });
        const currentOrder = [...grid.querySelectorAll('.movie-card')].filter((card) => !card.hidden);
        if (visible.some((card, index) => card !== currentOrder[index])) {
            visible.forEach((card) => grid.append(card));
        }
    }
    yearSelect?.addEventListener('change', enhanceCards);
    sortSelect?.addEventListener('change', enhanceCards);
    const observer = new MutationObserver(() => enhanceCards());
    grids.forEach((container) => observer.observe(container, { childList:true }));
    enhanceCards();
});
