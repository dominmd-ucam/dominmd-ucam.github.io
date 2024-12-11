const apiKey = 'd4bae9d0f87889c094030f3921f42d89';
const locButton = document.querySelector('.loc-button');
const todayInfo = document.querySelector('.today-info');
const todayWeatherIcon = document.querySelector('.today-weather i');
const todayTemp = document.querySelector('.weather-temp');
const daysList = document.querySelector('.days-list');

// Mapping of weather condition codes to icon class names (Depending on Openweather Api Response)
const weatherIconMap = {
    '01d': 'sun', //"clear sky"
    '01n': 'moon', // "clear sky"
    '02d': 'sun', // "few clouds"
    '02n': 'moon', // "few clouds"
    '03d': 'cloud', // "scattered clouds"
    '03n': 'cloud', // "scattered clouds"
    '04d': 'cloud', // "broken clouds"
    '04n': 'cloud', // "broken clouds"
    '09d': 'cloud-rain', // "light intensity shower rain"
    '09n': 'cloud-rain', // "light intensity shower rain"
    '10d': 'cloud-rain', // "light rain"
    '10n': 'cloud-rain', // "light rain"
    '11d': 'cloud-lightning', // "thunderstorm with rain"
    '11n': 'cloud-lightning', // "thunderstorm with rain"
    '13d': 'cloud-snow', // "light snow"
    '13n': 'cloud-snow', // "light snow"
    '50d': 'water', // "mist"
    '50n': 'water' // "mist"
};

const todayWeatherES = {
    'clear sky' : 'Cielo Despejado',
    'few clouds' : 'Algunas Nubes',
    'scattered clouds' : 'Nubes Dispersas',
    'broken clouds' : 'Nubes Rotas',
    'light intensity shower rain' : 'Lluvia de Intensidad de luz',
    'light rain' : 'Lluvia Ligera',
    'thunderstorm with rain' : 'Tormenta con lluvia',
    'light snow' : 'Nieve Ligera',
    'mist' : 'Neblina',
};

function fetchWeatherData(location) {
    // Construct the API url with the location and api key
    const apiUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${location}&appid=${apiKey}&units=metric`;

    // Fetch weather data from api
    fetch(apiUrl).then(response => response.json()).then(data => {
        // Update todays info
        const todayWeather = data.list[0].weather[0].description;
        const todayTemperature = `${Math.round(data.list[0].main.temp)}°C`;
        const todayWeatherIconCode = data.list[0].weather[0].icon;

        todayInfo.querySelector('h2').textContent = new Date().toLocaleDateString('es', { weekday: 'long' }).toUpperCase();
        todayInfo.querySelector('span').textContent = new Date().toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
        todayWeatherIcon.className = `bx bx-${weatherIconMap[todayWeatherIconCode]}`;
        todayTemp.textContent = todayTemperature;

        // Update location and weather description in the "left-info" section
        const locationElement = document.querySelector('.today-info > div > span');
        locationElement.textContent = `${data.city.name}, ${data.city.country}`;

        const weatherDescriptionElement = document.querySelector('.today-weather > h3');
        weatherDescriptionElement.textContent = todayWeatherES[todayWeather];

        // Update todays info in the "day-info" section
        const todayPrecipitation = `${data.list[0].pop}%`;
        const todayHumidity = `${data.list[0].main.humidity}%`;
        const todayWindSpeed = `${data.list[0].wind.speed} km/h`;

        const dayInfoContainer = document.querySelector('.day-info');
        dayInfoContainer.innerHTML = `

            <div>
                <span class="title">PRECIPITACION</span>
                <span class="value">${todayPrecipitation}</span>
            </div>
            <div>
                <span class="title">HUMEDAD</span>
                <span class="value">${todayHumidity}</span>
            </div>
            <div>
                <span class="title">VIENTO</span>
                <span class="value">${todayWindSpeed}</span>
            </div>

        `;

        // Update next 4 days weather
        const today = new Date();
        const nextDaysData = data.list.slice(1);

        const uniqueDays = new Set();
        let count = 0;
        daysList.innerHTML = '';
        for (const dayData of nextDaysData) {
            const forecastDate = new Date(dayData.dt_txt);
            const dayAbbreviation = forecastDate.toLocaleDateString('es', { weekday: 'short' });
            const dayTemp = `${Math.round(dayData.main.temp)}°C`;
            const iconCode = dayData.weather[0].icon;

            // Ensure the day isn't duplicate and today
            if (!uniqueDays.has(dayAbbreviation) && forecastDate.getDate() !== today.getDate()) {
                uniqueDays.add(dayAbbreviation);
                daysList.innerHTML += `
                
                    <li>
                        <i class='bx bx-${weatherIconMap[iconCode]}'></i>
                        <span>${dayAbbreviation}</span>
                        <span class="day-temp">${dayTemp}</span>
                    </li>

                `;
                count++;
            }

            // Stop after getting 4 distinct days
            if (count === 4) break;
        }
    }).catch(error => {
        alert(`Error fetching weather data: ${error} (Api Error)`);
    });
}

// Fetch weather data on document load for default location (Madrid)
document.addEventListener('DOMContentLoaded', () => {
    const defaultLocation = 'Madrid';
    fetchWeatherData(defaultLocation);
});

locButton.addEventListener('click', () => {
    const location = prompt('Enter a location :');
    if (!location) return;

    fetchWeatherData(location);
});


//CARDS

var swiper = new Swiper('.swiper-container', {
    slidesPerView: 1,
    spaceBetween: 20,
    effect: 'fade',
    loop: true,
    speed: 300,
    mousewheel: {
        invert: false
    },
    pagination: {
        el: '.swiper-pagination',
        clickable: true,
        dynamicBullets: true
    },
    navigation: {
        nextEl: '.swiper-button-next',
        prevEl: '.swiper-button-prev'
    }
});

// COOKIES
const botonAceptarCookies = document.getElementById('btn-aceptar-cookies');
const avisoCookies = document.getElementById('aviso-cookies');
const fondoAvisoCookies = document.getElementById('fondo-aviso-cookies');

dataLayer = [];

if(!localStorage.getItem('cookies-aceptadas')){
	avisoCookies.classList.add('activo');
	fondoAvisoCookies.classList.add('activo');
} else {
	dataLayer.push({'event': 'cookies-aceptadas'});
}

botonAceptarCookies.addEventListener('click', () => {
	avisoCookies.classList.remove('activo');
	fondoAvisoCookies.classList.remove('activo');

	localStorage.setItem('cookies-aceptadas', true);

	dataLayer.push({'event': 'cookies-aceptadas'});
});
