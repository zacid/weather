// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 1000);
camera.position.z = 1;
camera.rotation.x = 1.16;
camera.rotation.y = -0.12;
camera.rotation.z = 0.27;

// Renderer setup
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Configuration object
const config = {
    particleCount: 25,
    particleOpacity: 0.55,
    rotationSpeed: 0.001,
    flashFrequency: 0.07,
    flashColor: '#062d89',
    rainCount: 15000,
    rainSpeed: 0.5
};

// Rain setup
let rainGeo = new THREE.BufferGeometry();
let rain;
let rainDropPositions;
let rainDropVelocities;

function initRain() {
    const currentRainCount = config.rainCount;
    rainDropPositions = new Float32Array(currentRainCount * 3); // 3 values (x,y,z) per vertex
    rainDropVelocities = new Float32Array(currentRainCount);

    for(let i = 0; i < currentRainCount * 3; i += 3) {
        rainDropPositions[i] = Math.random() * 400 - 200; // x
        rainDropPositions[i + 1] = Math.random() * 500 - 250; // y
        rainDropPositions[i + 2] = Math.random() * 400 - 200; // z
        rainDropVelocities[i/3] = 0;
    }
    
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainDropPositions, 3));
    
    const rainMaterial = new THREE.PointsMaterial({
        color: 0xaaaaaa,
        size: 0.1,
        transparent: true
    });
    
    if (rain) {
        scene.remove(rain);
    }
    rain = new THREE.Points(rainGeo, rainMaterial);
    scene.add(rain);
}

function updateRain() {
    const positions = rainGeo.attributes.position.array;
    
    for(let i = 0; i < positions.length; i += 3) {
        rainDropVelocities[i/3] -= (0.1 + Math.random() * 0.1) * config.rainSpeed;
        positions[i + 1] += rainDropVelocities[i/3] * config.rainSpeed;
        
        if (positions[i + 1] < -200) {
            positions[i + 1] = 200;
            rainDropVelocities[i/3] = 0;
            // Reset X and Z to random position under a cloud
            positions[i] = Math.random() * 400 - 200;
            positions[i + 2] = Math.random() * 400 - 200;
        }
    }
    
    rainGeo.attributes.position.needsUpdate = true;
}

// Lighting setup
const ambient = new THREE.AmbientLight(0x0a1a2f);
scene.add(ambient);

const directionalLight = new THREE.DirectionalLight(0x1e3d59);
directionalLight.position.set(0, 0, 1);
scene.add(directionalLight);

const orangeLight = new THREE.PointLight(0x2b5d8c, 50, 450, 1.7);
orangeLight.position.set(200, 300, 100);
scene.add(orangeLight);

const redLight = new THREE.PointLight(0x0f4c81, 50, 450, 1.7);
redLight.position.set(100, 300, 100);
scene.add(redLight);

const blueLight = new THREE.PointLight(0x083d77, 50, 450, 1.7);
blueLight.position.set(300, 300, 200);
scene.add(blueLight);

// Lightning flash
const flash = new THREE.PointLight(0x062d89, 30, 500, 1.7);
flash.position.set(200, 300, 100);
scene.add(flash);

// Cloud particles
const textureLoader = new THREE.TextureLoader();
const cloudParticles = [];
const cloudGeometry = new THREE.PlaneBufferGeometry(500, 500);
let cloudMaterial = new THREE.MeshLambertMaterial({
    map: textureLoader.load('images/smoke.png'),
    transparent: true
});

// Function to create particles
function createParticles() {
    // Remove existing particles
    cloudParticles.forEach(particle => {
        scene.remove(particle);
    });
    cloudParticles.length = 0;

    // Create new particles
    for(let p = 0; p < config.particleCount; p++) {
        let cloud = new THREE.Mesh(cloudGeometry, cloudMaterial);
        cloud.position.set(
            Math.random() * 800 - 400,
            500,
            Math.random() * 500 - 500
        );
        cloud.rotation.x = 1.16;
        cloud.rotation.y = -0.12;
        cloud.rotation.z = Math.random() * 2 * Math.PI;
        cloud.material.opacity = config.particleOpacity;
        cloudParticles.push(cloud);
        scene.add(cloud);
    }
}

// Create initial particles
createParticles();

// Function to generate random color
function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

// Function to update color inputs
function updateColorInputs() {
    document.getElementById('ambientColor').value = '#' + ambient.color.getHexString();
    document.getElementById('directionalColor').value = '#' + directionalLight.color.getHexString();
    document.getElementById('orangeLightColor').value = '#' + orangeLight.color.getHexString();
    document.getElementById('redLightColor').value = '#' + redLight.color.getHexString();
    document.getElementById('blueLightColor').value = '#' + blueLight.color.getHexString();
}

// Setup controls
function setupControls() {
    // Particle count control
    const particleCountSlider = document.getElementById('particleCount');
    particleCountSlider.addEventListener('input', (e) => {
        config.particleCount = parseInt(e.target.value);
        createParticles();
    });

    // Particle opacity control
    const opacitySlider = document.getElementById('particleOpacity');
    opacitySlider.addEventListener('input', (e) => {
        config.particleOpacity = parseFloat(e.target.value);
        cloudParticles.forEach(particle => {
            particle.material.opacity = config.particleOpacity;
        });
    });

    // Rotation speed control
    const rotationSpeedSlider = document.getElementById('rotationSpeed');
    rotationSpeedSlider.addEventListener('input', (e) => {
        config.rotationSpeed = parseFloat(e.target.value);
    });

    // Light color controls
    document.getElementById('ambientColor').addEventListener('input', (e) => {
        ambient.color.set(e.target.value);
    });

    document.getElementById('directionalColor').addEventListener('input', (e) => {
        directionalLight.color.set(e.target.value);
    });

    document.getElementById('orangeLightColor').addEventListener('input', (e) => {
        orangeLight.color.set(e.target.value);
    });

    document.getElementById('redLightColor').addEventListener('input', (e) => {
        redLight.color.set(e.target.value);
    });

    document.getElementById('blueLightColor').addEventListener('input', (e) => {
        blueLight.color.set(e.target.value);
    });

    // Randomize colors button
    document.getElementById('randomizeColors').addEventListener('click', () => {
        // Generate and set random colors for all lights
        ambient.color.set(getRandomColor());
        directionalLight.color.set(getRandomColor());
        orangeLight.color.set(getRandomColor());
        redLight.color.set(getRandomColor());
        blueLight.color.set(getRandomColor());
        
        // Update the color input elements to reflect the new colors
        updateColorInputs();
    });

    // Flash controls
    const flashFrequencySlider = document.getElementById('flashFrequency');
    flashFrequencySlider.addEventListener('input', (e) => {
        config.flashFrequency = parseFloat(e.target.value);
    });

    const flashColorPicker = document.getElementById('flashColor');
    flashColorPicker.addEventListener('input', (e) => {
        config.flashColor = e.target.value;
        flash.color.set(config.flashColor);
    });

    // Rain controls
    const rainIntensitySlider = document.getElementById('rainIntensity');
    rainIntensitySlider.addEventListener('input', (e) => {
        const newRainCount = parseInt(e.target.value);
        if (Math.abs(newRainCount - config.rainCount) > 1000) {
            config.rainCount = newRainCount;
            if (rainGeo) {
                rainGeo.dispose();
            }
            rainGeo = new THREE.BufferGeometry();
            initRain();
        }
    });

    const rainSpeedSlider = document.getElementById('rainSpeed');
    rainSpeedSlider.addEventListener('input', (e) => {
        config.rainSpeed = parseFloat(e.target.value);
    });
}

// Animation
function animate() {
    requestAnimationFrame(animate);
    
    cloudParticles.forEach(p => {
        p.rotation.z -= config.rotationSpeed;
    });

    // Update rain
    if (config.rainCount > 0) {
        updateRain();
        rain.rotation.y += 0.002;
    }

    // Lightning flash animation
    if (Math.random() > (1 - config.flashFrequency) || flash.power > 100) {
        if (flash.power < 100) {
            flash.position.set(
                Math.random() * 400,
                300 + Math.random() * 200,
                100
            );
            // Trigger thunder sound with slight delay
            setTimeout(() => stormAudio.playThunder(), 300 + Math.random() * 800);
        }
        flash.power = 50 + Math.random() * 500;
    }
    
    renderer.render(scene, camera);
}

// Handle window resize
window.addEventListener('resize', onWindowResize, false);

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ---- Procedural Audio System ----
class StormAudio {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.rainGain = null;
        this.rainSource = null;
        this.muted = true;
        this.started = false;
    }

    init() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.7;
        this.masterGain.connect(this.ctx.destination);
        this.startRain();
        this.started = true;
        this.muted = false;
    }

    toggle() {
        if (!this.started) {
            this.init();
            return;
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        this.muted = !this.muted;
        this.masterGain.gain.linearRampToValueAtTime(
            this.muted ? 0 : 0.7, this.ctx.currentTime + 0.3
        );
    }

    startRain() {
        // Create 2 seconds of white noise buffer
        const bufferSize = this.ctx.sampleRate * 2;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        this.rainSource = this.ctx.createBufferSource();
        this.rainSource.buffer = buffer;
        this.rainSource.loop = true;

        // Bandpass filter to shape noise into rain-like sound
        const bandpass = this.ctx.createBiquadFilter();
        bandpass.type = 'bandpass';
        bandpass.frequency.value = 3000;
        bandpass.Q.value = 0.5;

        // Highpass to remove low rumble
        const highpass = this.ctx.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 1000;

        this.rainGain = this.ctx.createGain();
        this.rainGain.gain.value = 0.3;

        this.rainSource.connect(bandpass);
        bandpass.connect(highpass);
        highpass.connect(this.rainGain);
        this.rainGain.connect(this.masterGain);
        this.rainSource.start();
    }

    playThunder() {
        if (!this.started || this.muted) return;
        const now = this.ctx.currentTime;

        // Create noise buffer for thunder texture
        const bufferSize = this.ctx.sampleRate * 3;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noiseSource = this.ctx.createBufferSource();
        noiseSource.buffer = buffer;

        // Low-pass filter for deep rumble
        const lowpass = this.ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = 80 + Math.random() * 60;
        lowpass.Q.value = 1.5;

        // Gain envelope: sharp attack, long decay
        const thunderGain = this.ctx.createGain();
        thunderGain.gain.setValueAtTime(0, now);
        thunderGain.gain.linearRampToValueAtTime(0.8 + Math.random() * 0.2, now + 0.05);
        thunderGain.gain.exponentialRampToValueAtTime(0.3, now + 0.4);
        thunderGain.gain.exponentialRampToValueAtTime(0.01, now + 2.5 + Math.random());

        noiseSource.connect(lowpass);
        lowpass.connect(thunderGain);
        thunderGain.connect(this.masterGain);
        noiseSource.start(now);
        noiseSource.stop(now + 3.5);

        // Add a secondary rumble layer
        const rumbleOsc = this.ctx.createOscillator();
        rumbleOsc.type = 'sine';
        rumbleOsc.frequency.value = 30 + Math.random() * 20;
        const rumbleGain = this.ctx.createGain();
        rumbleGain.gain.setValueAtTime(0, now);
        rumbleGain.gain.linearRampToValueAtTime(0.15, now + 0.08);
        rumbleGain.gain.exponentialRampToValueAtTime(0.01, now + 2 + Math.random());
        rumbleOsc.connect(rumbleGain);
        rumbleGain.connect(this.masterGain);
        rumbleOsc.start(now);
        rumbleOsc.stop(now + 3);
    }

    dispose() {
        if (this.ctx) {
            this.ctx.close();
        }
    }
}

const stormAudio = new StormAudio();

// Initialize controls
setupControls();

// Initialize rain
initRain();

// Start animation
animate();