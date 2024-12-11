const container = document.querySelector('.container');
const signupButton = document.querySelector('.signup-section header');
const loginButton = document.querySelector('.login-section header');

loginButton.addEventListener('click', () => {
    container.classList.add('active');
});

signupButton.addEventListener('click', () => {
    container.classList.remove('active');
});



/********************/

  // Importa las funciones necesarias de Firebase SDK
  import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
  import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
  
  // Tu configuración de Firebase
  const firebaseConfig = {
    apiKey: "AIzaSyAB-zzm16eiB1iQsBQOmSWbIF0APFJwuiw",
    authDomain: "lenguaje-de-marcas-d981f.firebaseapp.com",
    databaseURL: "https://lenguaje-de-marcas-d981f-default-rtdb.firebaseio.com",
    projectId: "lenguaje-de-marcas-d981f",
    storageBucket: "lenguaje-de-marcas-d981f.firebasestorage.app",
    messagingSenderId: "1017006282913",
    appId: "1:1017006282913:web:d1065eb8afa02f3d5db8e0"
  };

  // Inicializa Firebase
  const app = initializeApp(firebaseConfig);
  const auth = getAuth();

  // Selección de elementos del DOM para los formularios de login y signup
  const signupForm = document.querySelector('.signup-section form');
  const loginForm = document.querySelector('.login-section form');
  
  // Función para el registro de usuarios
  signupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = signupForm.querySelector('input[type="email"]').value;
    const password = signupForm.querySelector('input[type="password"]').value;
    
    createUserWithEmailAndPassword(auth, email, password)
      .then((userCredential) => {
        const user = userCredential.user;
        console.log("Usuario registrado:", user);
        alert("Registro exitoso");
      })
      .catch((error) => {
        console.error("Error en el registro:", error.message);
        alert("Error al registrar: " + error.message);
      });
  });

  // Función para el login de usuarios
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = loginForm.querySelector('input[type="email"]').value;
    const password = loginForm.querySelector('input[type="password"]').value;
    
    signInWithEmailAndPassword(auth, email, password)
      .then((userCredential) => {
        const user = userCredential.user;
        console.log("Usuario logueado:", user);
        alert("Login exitoso");
      })
      .catch((error) => {
        console.error("Error en el login:", error.message);
        alert("Error al iniciar sesión: " + error.message);
      });
  });
