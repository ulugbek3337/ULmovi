document.addEventListener('DOMContentLoaded', () => {
    const grid = document.getElementById('moviesGrid');
    grid.innerHTML = `
        <div class="movie-card"><h3>Namuna Kino 1</h3><p>Jangari</p></div>
        <div class="movie-card"><h3>Namuna Kino 2</h3><p>Komediya</p></div>
        <div class="movie-card"><h3>Namuna Kino 3</h3><p>Drama</p></div>
    `;
});