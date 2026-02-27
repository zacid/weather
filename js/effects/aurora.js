// Aurora Borealis Effect for Cloud Flying Experience
// Creates realistic northern lights with flowing colors and movement

class AuroraSystem {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.auroraLayers = [];
        this.isActive = false;
        
        this.config = {
            intensity: 0.8,
            colorPrimary: new THREE.Color(0x00ff88), // Green
            colorSecondary: new THREE.Color(0x4444ff), // Blue
            colorTertiary: new THREE.Color(0xff4488), // Pink/Red
            waveSpeed: 0.3,
            waveHeight: 200,
            waveFrequency: 0.01,
            fadeDistance: 1500,
            layerCount: 3
        };
        
        this.time = 0;
        this.init();
    }
    
    init() {
        this.createAuroraLayers();
    }
    
    createAuroraLayers() {
        // Remove existing aurora if present
        this.dispose();
        
        for (let layer = 0; layer < this.config.layerCount; layer++) {
            this.createAuroraLayer(layer);
        }
    }
    
    createAuroraLayer(layerIndex) {
        const segmentCount = 60;
        const stripWidth = 150;
        const geometry = new THREE.BufferGeometry();
        
        // Create vertices for aurora strip
        const vertices = [];
        const uvs = [];
        const indices = [];
        const colors = [];
        
        for (let i = 0; i <= segmentCount; i++) {
            const x = (i / segmentCount) * 3000 - 1500; // Span across sky
            const baseY = 400 + (layerIndex * 80); // Different heights for layers
            const z = -800 - (layerIndex * 100); // Different depths
            
            // Create two vertices per segment (top and bottom of strip)
            for (let j = 0; j < 2; j++) {
                const y = baseY + (j * stripWidth);
                vertices.push(x, y, z);
                
                // UV coordinates for texture mapping
                uvs.push(i / segmentCount, j);
                
                // Color variation based on layer and position
                const colorMix = (i / segmentCount) + (layerIndex * 0.3);
                let auroraColor;
                
                if (colorMix < 0.3) {
                    auroraColor = this.config.colorPrimary;
                } else if (colorMix < 0.7) {
                    auroraColor = this.config.colorSecondary;
                } else {
                    auroraColor = this.config.colorTertiary;
                }
                
                colors.push(auroraColor.r, auroraColor.g, auroraColor.b);
            }
            
            // Create triangles for strip segments
            if (i < segmentCount) {
                const base = i * 2;
                
                // Two triangles per segment
                indices.push(base, base + 1, base + 2);
                indices.push(base + 1, base + 3, base + 2);
            }
        }
        
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setIndex(indices);
        
        // Create aurora shader material
        const material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0.0 },
                intensity: { value: this.config.intensity },
                waveSpeed: { value: this.config.waveSpeed },
                waveHeight: { value: this.config.waveHeight },
                waveFrequency: { value: this.config.waveFrequency },
                cameraPosition: { value: this.camera.position },
                fadeDistance: { value: this.config.fadeDistance }
            },
            vertexShader: `
                uniform float time;
                uniform float waveSpeed;
                uniform float waveHeight;
                uniform float waveFrequency;
                
                attribute vec3 color;
                varying vec3 vColor;
                varying vec2 vUv;
                varying float vWave;
                varying vec3 vWorldPosition;
                
                void main() {
                    vColor = color;
                    vUv = uv;
                    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
                    
                    // Create flowing wave motion
                    float wave1 = sin(position.x * waveFrequency + time * waveSpeed) * waveHeight;
                    float wave2 = sin(position.x * waveFrequency * 1.7 + time * waveSpeed * 0.7) * waveHeight * 0.5;
                    float wave3 = sin(position.x * waveFrequency * 2.3 + time * waveSpeed * 1.3) * waveHeight * 0.3;
                    
                    vWave = (wave1 + wave2 + wave3) / waveHeight;
                    
                    // Apply wave to Y position
                    vec3 pos = position;
                    pos.y += wave1 + wave2 + wave3;
                    
                    // Add subtle X movement for flowing effect
                    pos.x += sin(time * 0.5 + position.x * 0.001) * 20.0;
                    
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform float intensity;
                uniform vec3 cameraPosition;
                uniform float fadeDistance;
                
                varying vec3 vColor;
                varying vec2 vUv;
                varying float vWave;
                varying vec3 vWorldPosition;
                
                void main() {
                    // Calculate distance fade
                    float distance = length(vWorldPosition - cameraPosition);
                    float fadeFactor = 1.0 - smoothstep(0.0, fadeDistance, distance);
                    
                    // Create flowing patterns
                    float flow1 = sin(vUv.x * 8.0 + time * 0.5) * 0.5 + 0.5;
                    float flow2 = sin(vUv.x * 12.0 + time * 0.3 + vWave) * 0.3 + 0.7;
                    float flow3 = sin(vUv.x * 20.0 + time * 0.8) * 0.2 + 0.8;
                    
                    // Combine flow patterns
                    float flowPattern = flow1 * flow2 * flow3;
                    
                    // Vertical gradient (stronger at bottom)
                    float verticalFade = smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
                    
                    // Shimmer effect
                    float shimmer = sin(time * 2.0 + vUv.x * 10.0) * 0.1 + 0.9;
                    
                    // Final color calculation
                    vec3 color = vColor * flowPattern * verticalFade * shimmer * intensity;
                    
                    // Apply distance fade
                    color *= fadeFactor;
                    
                    // Transparency based on intensity and patterns
                    float alpha = flowPattern * verticalFade * intensity * 0.7 * fadeFactor;
                    
                    gl_FragColor = vec4(color, alpha);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        
        const aurora = new THREE.Mesh(geometry, material);
        aurora.renderOrder = 1000 + layerIndex; // Render after clouds
        
        this.auroraLayers.push({
            mesh: aurora,
            material: material,
            originalY: 400 + (layerIndex * 80),
            phaseOffset: layerIndex * Math.PI * 0.5
        });
        
        this.scene.add(aurora);
    }
    
    update(deltaTime) {
        if (!this.isActive) return;
        
        this.time += deltaTime * 0.001;
        
        this.auroraLayers.forEach((layer, index) => {
            // Update time uniform
            layer.material.uniforms.time.value = this.time + layer.phaseOffset;
            
            // Update camera position for distance fade
            layer.material.uniforms.cameraPosition.value.copy(this.camera.position);
            
            // Add gentle vertical movement
            const verticalOffset = Math.sin(this.time * 0.3 + layer.phaseOffset) * 30;
            layer.mesh.position.y = verticalOffset;
            
            // Slight rotation for dynamic effect
            layer.mesh.rotation.z = Math.sin(this.time * 0.1 + layer.phaseOffset) * 0.05;
            
            // Follow camera horizontally with parallax
            const parallaxFactor = 0.3 + (index * 0.1);
            layer.mesh.position.x = this.camera.position.x * parallaxFactor;
            layer.mesh.position.z = this.camera.position.z * 0.1 - 800 - (index * 100);
        });
    }
    
    activate() {
        this.isActive = true;
        this.auroraLayers.forEach(layer => {
            layer.mesh.visible = true;
        });
    }
    
    deactivate() {
        this.isActive = false;
        this.auroraLayers.forEach(layer => {
            layer.mesh.visible = false;
        });
    }
    
    setIntensity(intensity) {
        this.config.intensity = intensity;
        this.auroraLayers.forEach(layer => {
            layer.material.uniforms.intensity.value = intensity;
        });
    }
    
    setColors(primary, secondary, tertiary) {
        this.config.colorPrimary = primary;
        this.config.colorSecondary = secondary;
        this.config.colorTertiary = tertiary;
        
        // Regenerate layers with new colors
        this.createAuroraLayers();
    }
    
    // Preset aurora configurations
    setClassicGreen() {
        this.setColors(
            new THREE.Color(0x00ff88),
            new THREE.Color(0x44ff44),
            new THREE.Color(0x88ffaa)
        );
    }
    
    setBluePurple() {
        this.setColors(
            new THREE.Color(0x4444ff),
            new THREE.Color(0x8844ff),
            new THREE.Color(0xff44ff)
        );
    }
    
    setRedPink() {
        this.setColors(
            new THREE.Color(0xff4444),
            new THREE.Color(0xff4488),
            new THREE.Color(0xff88cc)
        );
    }
    
    setRainbow() {
        this.setColors(
            new THREE.Color(0x00ff88), // Green
            new THREE.Color(0x4444ff), // Blue
            new THREE.Color(0xff4488)  // Pink
        );
    }
    
    // Trigger aurora activity (could be called randomly or by weather conditions)
    triggerAuroraStorm() {
        this.activate();
        
        // Gradually increase intensity
        const targetIntensity = 1.2;
        const duration = 5000; // 5 seconds
        const startTime = Date.now();
        
        const intensityAnimation = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            const currentIntensity = this.config.intensity + 
                (targetIntensity - this.config.intensity) * progress;
            
            this.setIntensity(currentIntensity);
            
            if (progress < 1) {
                requestAnimationFrame(intensityAnimation);
            } else {
                // Hold peak intensity for a while, then fade
                setTimeout(() => {
                    this.fadeOut();
                }, 10000); // 10 seconds at peak
            }
        };
        
        intensityAnimation();
    }
    
    fadeOut() {
        const startIntensity = this.config.intensity;
        const duration = 8000; // 8 seconds fade
        const startTime = Date.now();
        
        const fadeAnimation = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            const currentIntensity = startIntensity * (1 - progress);
            this.setIntensity(currentIntensity);
            
            if (progress < 1) {
                requestAnimationFrame(fadeAnimation);
            } else {
                this.deactivate();
                this.setIntensity(0.8); // Reset to normal
            }
        };
        
        fadeAnimation();
    }
    
    dispose() {
        this.auroraLayers.forEach(layer => {
            this.scene.remove(layer.mesh);
            layer.material.dispose();
            layer.mesh.geometry.dispose();
        });
        this.auroraLayers = [];
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuroraSystem;
}