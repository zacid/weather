# Integration Guide - Adding New Visual Features

## Quick Start: Adding Snow to Your Weather Station

### Step 1: Include the Snow System
Add this to your `index.html` before the closing `</body>` tag:

```html
<script src="js/effects/snow.js"></script>
```

### Step 2: Modify Your Weather Controls
Add this to your control panel in `index.html`:

```html
<div class="control-group">
    <h3>Precipitation Type</h3>
    <div class="control-item">
        <label for="precipitationType">Type</label>
        <select id="precipitationType">
            <option value="rain">Rain</option>
            <option value="snow">Snow</option>
            <option value="mixed">Mixed</option>
            <option value="none">Clear</option>
        </select>
    </div>
    <div class="control-item">
        <label for="temperature">Temperature (°C)</label>
        <input type="range" id="temperature" min="-20" max="40" value="20">
        <span id="tempDisplay">20°C</span>
    </div>
</div>
```

### Step 3: Update Your JavaScript
Add this to your `weather.js`:

```javascript
// Initialize snow system
let snowSystem = null;

// Add to your setupControls function:
document.getElementById('precipitationType').addEventListener('change', (e) => {
    const type = e.target.value;
    
    switch(type) {
        case 'snow':
            if (rain) scene.remove(rain);
            if (!snowSystem) snowSystem = new SnowSystem(scene, 5000);
            break;
        case 'rain':
            if (snowSystem) {
                snowSystem.dispose();
                snowSystem = null;
            }
            initRain();
            break;
        case 'mixed':
            initRain();
            if (!snowSystem) snowSystem = new SnowSystem(scene, 2500);
            break;
        case 'none':
            if (rain) scene.remove(rain);
            if (snowSystem) {
                snowSystem.dispose();
                snowSystem = null;
            }
            break;
    }
});

// Add to your animate function:
if (snowSystem) {
    snowSystem.update(Date.now());
}
```

## Adding Aurora to Cloud Flying Experience

### Step 1: Include Aurora System
Add to `cloud.html`:

```html
<script src="js/effects/aurora.js"></script>
```

### Step 2: Initialize Aurora
Add after scene creation in `cloud.html`:

```javascript
// Create aurora system
let auroraSystem = new AuroraSystem(scene, camera);

// Add keyboard control for aurora (press 'A')
document.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'a') {
        auroraSystem.triggerAuroraStorm();
    }
    if (event.key.toLowerCase() === 'c') {
        auroraSystem.setClassicGreen();
    }
    if (event.key.toLowerCase() === 'b') {
        auroraSystem.setBluePurple();
    }
});

// Add to your animate function:
auroraSystem.update(16); // 16ms for 60fps
```

## Performance Considerations

### For Lower-End Devices:
```javascript
// Reduce particle counts based on device capabilities
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const isLowEnd = navigator.hardwareConcurrency < 4;

if (isMobile || isLowEnd) {
    config.rainCount = Math.min(config.rainCount, 5000);
    config.snowCount = Math.min(config.snowCount, 2000);
    // Reduce aurora layers
    auroraSystem.config.layerCount = 2;
}
```

### Automatic Quality Adjustment:
```javascript
// Monitor frame rate and adjust quality
let frameCount = 0;
let lastTime = performance.now();

function checkPerformance() {
    frameCount++;
    const currentTime = performance.now();
    
    if (currentTime - lastTime >= 1000) { // Check every second
        const fps = frameCount;
        frameCount = 0;
        lastTime = currentTime;
        
        if (fps < 30) {
            // Reduce quality
            if (snowSystem) snowSystem.particleCount *= 0.8;
            if (config.rainCount > 5000) config.rainCount *= 0.8;
        }
    }
}
```

## Styling Updates

### Enhanced Control Panel CSS:
```css
.control-group select {
    width: 100%;
    padding: 5px;
    margin-bottom: 10px;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.3);
    color: white;
    border-radius: 4px;
}

.control-group select option {
    background: #333;
    color: white;
}

.temperature-display {
    display: inline-block;
    margin-left: 10px;
    font-weight: bold;
    color: #ffaa44;
}
```

## Advanced Integration Examples

### Weather API Integration:
```javascript
async function fetchWeatherData(lat, lon) {
    try {
        const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=YOUR_API_KEY`);
        const data = await response.json();
        
        // Apply real weather conditions
        config.temperature = data.main.temp - 273.15; // Convert Kelvin to Celsius
        config.humidity = data.main.humidity;
        
        // Auto-set precipitation type
        if (data.weather[0].main === 'Snow') {
            switchWeatherType('snow');
        } else if (data.weather[0].main === 'Rain') {
            switchWeatherType('rain');
        }
        
        // Update wind
        config.windStrength = data.wind.speed / 10; // Scale wind speed
        
    } catch (error) {
        console.error('Failed to fetch weather data:', error);
    }
}
```

### Sound Integration:
```javascript
// Add 3D positional audio
const audioListener = new THREE.AudioListener();
camera.add(audioListener);

const sound = new THREE.PositionalAudio(audioListener);
const audioLoader = new THREE.AudioLoader();

audioLoader.load('sounds/thunder.mp3', (buffer) => {
    sound.setBuffer(buffer);
    sound.setRefDistance(20);
    scene.add(sound);
});

// Play thunder with lightning
function playThunder() {
    if (sound.isPlaying) sound.stop();
    sound.play();
}
```

### Mobile Touch Controls:
```javascript
// Add touch support for mobile
let touchStartX = 0;
let touchStartY = 0;

document.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
});

document.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const deltaX = e.touches[0].clientX - touchStartX;
    const deltaY = e.touches[0].clientY - touchStartY;
    
    // Use for camera control
    mouseX = deltaX * 0.5;
    mouseY = deltaY * 0.5;
});
```

## Troubleshooting

### Common Issues:

1. **Snow not appearing:**
   - Check console for errors
   - Ensure SnowSystem class is loaded
   - Verify scene.add() is called

2. **Performance issues:**
   - Reduce particle counts
   - Lower aurora layer count
   - Enable automatic quality adjustment

3. **Aurora not visible:**
   - Check camera position
   - Ensure aurora is activated
   - Verify render order

4. **Controls not working:**
   - Check element IDs match
   - Verify event listeners are attached
   - Ensure HTML structure is correct

## Testing Checklist

- [ ] Snow particles appear and fall naturally
- [ ] Rain/snow switching works correctly
- [ ] Temperature affects precipitation type
- [ ] Aurora responds to keyboard controls
- [ ] Performance is acceptable on target devices
- [ ] Controls are responsive and intuitive
- [ ] Weather types transition smoothly
- [ ] Effects scale appropriately with settings

## Next Steps

1. **Add more weather phenomena** (hail, fog, sandstorms)
2. **Implement day/night cycle** with automatic lighting changes
3. **Add volumetric clouds** for more realistic cloud rendering
4. **Integrate real weather APIs** for live data
5. **Add VR/AR support** for immersive experiences