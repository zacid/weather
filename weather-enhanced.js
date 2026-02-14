// Enhanced Weather System - Integrates snow and multiple weather types
// Based on your existing weather.js with additions

// Scene setup (same as original)
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 1000);
camera.position.z = 1;
camera.rotation.x = 1.16;
camera.rotation.y = -0.12;
camera.rotation.z = 0.27;

// Renderer setup (same as original)
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Enhanced configuration with weather types
const config = {
    // Particle settings
    particleCount: 25,
    particleOpacity: 0.55,
    rotationSpeed: 0.001,
    
    // Lightning settings
    flashFrequency: 0.07,
    flashColor: '#062d89',
    
    // Precipitation settings
    precipitationType: 'rain', // 'rain', 'snow', 'mixed', 'none'
    rainCount: 15000,
    rainSpeed: 0.5,
    snowCount: 5000,
    snowIntensity: 1.0,
    windStrength: 0.5,
    
    // Environment settings
    temperature: 20, // Celsius, affects heat shimmer and precipitation type
    humidity: 60,
    visibility: 100 // 0-100, affects fog density
};

// Weather systems
let rainSystem = null;
let snowSystem = null;
let currentWeatherType = 'rain';

// Include the SnowSystem class here (from snow.js)
// For brevity, assuming it's loaded separately

// Enhanced rain setup with temperature effects
let rainGeo = new THREE.BufferGeometry();
let rain;
let rainDropPositions;
let rainDropVelocities;

function initRain() {
    const currentRainCount = config.rainCount;
    rainDropPositions = new Float32Array(currentRainCount * 3);
    rainDropVelocities = new Float32Array(currentRainCount);

    for(let i = 0; i < currentRainCount * 3; i += 3) {
        rainDropPositions[i] = Math.random() * 400 - 200;
        rainDropPositions[i + 1] = Math.random() * 500 - 250;
        rainDropPositions[i + 2] = Math.random() * 400 - 200;
        rainDropVelocities[i/3] = 0;
    }
    
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainDropPositions, 3));
    
    // Adjust rain color based on temperature
    let rainColor = 0xaaaaaa;
    if (config.temperature < 0) {
        rainColor = 0xeeeeee; // Lighter for sleet
    } else if (config.temperature > 30) {
        rainColor = 0x888888; // Darker for hot rain
    }
    
    const rainMaterial = new THREE.PointsMaterial({
        color: rainColor,
        size: config.temperature < 0 ? 0.2 : 0.1, // Larger for sleet
        transparent: true,
        opacity: config.humidity / 100
    });
    
    if (rain) {
        scene.remove(rain);
    }
    rain = new THREE.Points(rainGeo, rainMaterial);
    scene.add(rain);
}

function updateRain() {
    if (!rain || config.precipitationType === 'snow') return;
    
    const positions = rainGeo.attributes.position.array;
    
    for(let i = 0; i < positions.length; i += 3) {
        // Adjust fall speed based on temperature and type
        let fallSpeed = config.rainSpeed;
        if (config.temperature < 0) {
            fallSpeed *= 0.7; // Slower for sleet
        }
        
        rainDropVelocities[i/3] -= (0.1 + Math.random() * 0.1) * fallSpeed;
        positions[i + 1] += rainDropVelocities[i/3] * fallSpeed;
        
        // Add wind effect
        positions[i] += Math.sin(Date.now() * 0.001) * config.windStrength * 0.1;
        
        if (positions[i + 1] < -200) {
            positions[i + 1] = 200;
            rainDropVelocities[i/3] = 0;
            positions[i] = Math.random() * 400 - 200;
            positions[i + 2] = Math.random() * 400 - 200;
        }
    }
    
    rainGeo.attributes.position.needsUpdate = true;
}

// Weather type management
function switchWeatherType(newType) {
    currentWeatherType = newType;
    config.precipitationType = newType;
    
    switch(newType) {
        case 'rain':
            if (snowSystem) {
                snowSystem.dispose();
                snowSystem = null;
            }
            initRain();
            break;
            
        case 'snow':
            if (rain) {
                scene.remove(rain);
                rain = null;
            }
            if (!snowSystem) {
                snowSystem = new SnowSystem(scene, config.snowCount);
            }
            break;
            
        case 'mixed':
            initRain();
            if (!snowSystem) {
                snowSystem = new SnowSystem(scene, config.snowCount * 0.5);
            }
            break;
            
        case 'none':
            if (rain) {
                scene.remove(rain);
                rain = null;
            }
            if (snowSystem) {
                snowSystem.dispose();
                snowSystem = null;
            }
            break;
    }
}

// Auto weather type based on temperature
function autoSelectWeatherType() {
    if (config.temperature < -2) {
        return 'snow';
    } else if (config.temperature < 2) {
        return 'mixed';
    } else if (config.humidity > 40) {
        return 'rain';
    } else {
        return 'none';
    }
}

// Lighting setup (same as original with temperature effects)
const ambient = new THREE.AmbientLight(0x0a1a2f);
scene.add(ambient);

const directionalLight = new THREE.DirectionalLight(0x1e3d59);
directionalLight.position.set(0, 0, 1);
scene.add(directionalLight);

// Adjust light intensity based on visibility
function updateLightingForWeather() {
    const visibilityFactor = config.visibility / 100;
    ambient.intensity = 0.3 + (visibilityFactor * 0.7);
    directionalLight.intensity = 0.5 + (visibilityFactor * 0.5);
    
    // Adjust fog based on humidity and visibility
    scene.fog = new THREE.Fog(0x333333, 50, 1000 - (config.visibility * 8));
}

// Enhanced controls with new weather options
function setupEnhancedControls() {
    // Add weather type selector
    const weatherTypeSelect = document.createElement('select');
    weatherTypeSelect.id = 'weatherType';
    weatherTypeSelect.innerHTML = `
        <option value="auto">Auto</option>
        <option value="rain">Rain</option>
        <option value="snow">Snow</option>
        <option value="mixed">Mixed</option>
        <option value="none">Clear</option>
    `;
    
    // Add temperature control
    const tempSlider = document.createElement('input');
    tempSlider.type = 'range';
    tempSlider.id = 'temperature';
    tempSlider.min = '-20';
    tempSlider.max = '45';
    tempSlider.value = config.temperature;
    
    // Add humidity control
    const humiditySlider = document.createElement('input');
    humiditySlider.type = 'range';
    humiditySlider.id = 'humidity';
    humiditySlider.min = '0';
    humiditySlider.max = '100';
    humiditySlider.value = config.humidity;
    
    // Add visibility control
    const visibilitySlider = document.createElement('input');
    visibilitySlider.type = 'range';
    visibilitySlider.id = 'visibility';
    visibilitySlider.min = '10';
    visibilitySlider.max = '100';
    visibilitySlider.value = config.visibility;
    
    // Add wind strength control
    const windSlider = document.createElement('input');
    windSlider.type = 'range';
    windSlider.id = 'windStrength';
    windSlider.min = '0';
    windSlider.max = '2';
    windSlider.step = '0.1';
    windSlider.value = config.windStrength;
    
    // Event listeners
    weatherTypeSelect.addEventListener('change', (e) => {
        if (e.target.value === 'auto') {
            switchWeatherType(autoSelectWeatherType());
        } else {
            switchWeatherType(e.target.value);
        }
    });
    
    tempSlider.addEventListener('input', (e) => {
        config.temperature = parseFloat(e.target.value);
        updateLightingForWeather();
        
        // Auto-adjust weather type if in auto mode
        if (weatherTypeSelect.value === 'auto') {
            switchWeatherType(autoSelectWeatherType());
        }
    });
    
    humiditySlider.addEventListener('input', (e) => {
        config.humidity = parseFloat(e.target.value);
        updateLightingForWeather();
    });
    
    visibilitySlider.addEventListener('input', (e) => {
        config.visibility = parseFloat(e.target.value);
        updateLightingForWeather();
    });
    
    windSlider.addEventListener('input', (e) => {
        config.windStrength = parseFloat(e.target.value);
        if (snowSystem) {
            snowSystem.setWindStrength(config.windStrength);
        }
    });
    
    // Add to control panel (assuming you have one)
    const controlPanel = document.getElementById('control-panel');
    if (controlPanel) {
        // Add new weather controls section
        const weatherSection = document.createElement('div');
        weatherSection.className = 'control-group';
        weatherSection.innerHTML = `
            <h3>Weather Conditions</h3>
            <div class="control-item">
                <label for="weatherType">Weather Type</label>
            </div>
            <div class="control-item">
                <label for="temperature">Temperature (°C): <span id="tempValue">${config.temperature}</span></label>
            </div>
            <div class="control-item">
                <label for="humidity">Humidity (%): <span id="humidityValue">${config.humidity}</span></label>
            </div>
            <div class="control-item">
                <label for="visibility">Visibility: <span id="visibilityValue">${config.visibility}</span></label>
            </div>
            <div class="control-item">
                <label for="windStrength">Wind Strength: <span id="windValue">${config.windStrength}</span></label>
            </div>
        `;
        
        // Insert controls into the DOM
        weatherSection.children[1].appendChild(weatherTypeSelect);
        weatherSection.children[2].appendChild(tempSlider);
        weatherSection.children[3].appendChild(humiditySlider);
        weatherSection.children[4].appendChild(visibilitySlider);
        weatherSection.children[5].appendChild(windSlider);
        
        controlPanel.appendChild(weatherSection);
        
        // Update display values
        tempSlider.addEventListener('input', () => {
            document.getElementById('tempValue').textContent = config.temperature;
        });
        humiditySlider.addEventListener('input', () => {
            document.getElementById('humidityValue').textContent = config.humidity;
        });
        visibilitySlider.addEventListener('input', () => {
            document.getElementById('visibilityValue').textContent = config.visibility;
        });
        windSlider.addEventListener('input', () => {
            document.getElementById('windValue').textContent = config.windStrength;
        });
    }
}

// Enhanced animation loop
function animate() {
    requestAnimationFrame(animate);
    
    // Update clouds (same as original)
    cloudParticles.forEach(p => {
        p.rotation.z -= config.rotationSpeed;
    });

    // Update precipitation based on type
    switch(config.precipitationType) {
        case 'rain':
        case 'mixed':
            updateRain();
            if (rain) rain.rotation.y += 0.002;
            break;
    }
    
    // Update snow system
    if (snowSystem) {
        snowSystem.update(Date.now());
    }

    // Lightning flash animation (same as original)
    if (Math.random() > (1 - config.flashFrequency) || flash.power > 100) {
        if (flash.power < 100) {
            flash.position.set(
                Math.random() * 400,
                300 + Math.random() * 200,
                100
            );
        }
        flash.power = 50 + Math.random() * 500;
    }
    
    renderer.render(scene, camera);
}

// Initialize enhanced weather system
function initEnhancedWeather() {
    setupEnhancedControls();
    updateLightingForWeather();
    switchWeatherType('rain'); // Start with rain
    animate();
}

// Start the enhanced weather system
// initEnhancedWeather(); // Uncomment to start