document.addEventListener('DOMContentLoaded', () => {
    console.log("ULmovi Admin panel loaded");
    
    // Tab switching logic
    const links = document.querySelectorAll('.tab-link');
    const contents = document.querySelectorAll('.tab-content');

    links.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            links.forEach(l => l.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            
            link.classList.add('active');
            document.getElementById(link.getAttribute('data-target')).classList.add('active');
        });
    });
});