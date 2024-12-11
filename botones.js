/* BOTONES */

const btn_login = document.querySelector('button i.bx-user'); // Selecciona el icono dentro del botón

btn_login.addEventListener('click', () => {
    window.location.href = 'indexLogin.html'; // Redirige al archivo indexLogin.html
});

/* BOTON HOME */

const btn_home = document.querySelector('button i.bx-home'); // Selecciona el icono dentro del botón

btn_home.addEventListener('click', () => {
    window.location.href = 'index.html'; // Redirige al archivo indexLogin.html
});

/* BOTON HOME */

const btn_mapa = document.querySelector('button i.bx-map'); // Selecciona el icono dentro del botón

btn_mapa.addEventListener('click', () => {
    window.location.href = 'mapa.html'; // Redirige al archivo indexLogin.html
});