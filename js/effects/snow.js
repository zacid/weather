// Snow Particle System
// Extends the existing rain system with snowflake behavior

class SnowSystem {
    constructor(scene, particleCount = 5000) {
        this.scene = scene;
        this.particleCount = particleCount;
        this.snowParticles = null;
        this.snowGeo = null;
        this.windForce = { x: 0.01, y: 0, z: 0.005 };
        this.config = {
            intensity: 1.0,
            windStrength: 0.5,
            flakeSize: 2.0,
            fallSpeed: 0.3
        };
        this.init();
    }

    init() {
        this.createSnowflakes();
    }

    createSnowflakes() {
        // Create snowflake geometry
        this.snowGeo = new THREE.BufferGeometry();
        
        const positions = new Float32Array(this.particleCount * 3);
        const velocities = new Float32Array(this.particleCount * 3);
        const rotations = new Float32Array(this.particleCount);
        const scales = new Float32Array(this.particleCount);
        const swayPhases = new Float32Array(this.particleCount);
        
        for (let i = 0; i < this.particleCount; i++) {
            const i3 = i * 3;
            
            // Random starting positions
            positions[i3] = (Math.random() - 0.5) * 400;     // x
            positions[i3 + 1] = Math.random() * 500 - 250;   // y
            positions[i3 + 2] = (Math.random() - 0.5) * 400; // z
            
            // Initial velocities (slower than rain)
            velocities[i3] = (Math.random() - 0.5) * 0.02;     // x drift
            velocities[i3 + 1] = -(0.05 + Math.random() * 0.1); // y fall
            velocities[i3 + 2] = (Math.random() - 0.5) * 0.02; // z drift
            
            // Snowflake properties
            rotations[i] = Math.random() * Math.PI * 2;
            scales[i] = 0.5 + Math.random() * 1.5; // Varying sizes
            swayPhases[i] = Math.random() * Math.PI * 2; // For swaying motion
        }
        
        this.snowGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.snowGeo.setAttribute('rotation', new THREE.BufferAttribute(rotations, 1));
        this.snowGeo.setAttribute('scale', new THREE.BufferAttribute(scales, 1));
        
        // Store additional data for animation
        this.velocities = velocities;
        this.swayPhases = swayPhases;
        
        // Create snowflake texture
        const snowTexture = this.createSnowflakeTexture();
        
        // Snowflake material
        const snowMaterial = new THREE.PointsMaterial({
            map: snowTexture,
            color: 0xffffff,
            size: this.config.flakeSize,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        
        // Remove existing snow if present
        if (this.snowParticles) {
            this.scene.remove(this.snowParticles);
            this.snowGeo.dispose();
            snowMaterial.dispose();
        }
        
        // Create snow particle system
        this.snowParticles = new THREE.Points(this.snowGeo, snowMaterial);
        this.scene.add(this.snowParticles);
    }
    
    createSnowflakeTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const context = canvas.getContext('2d');
        
        // Create a snowflake pattern
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        
        // Clear canvas
        context.clearRect(0, 0, canvas.width, canvas.height);
        
        // Create gradient for soft edges
        const gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, 30);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
        gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.8)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
        
        // Draw snowflake shape
        context.beginPath();
        context.fillStyle = gradient;
        
        // Simple 6-pointed star
        for (let i = 0; i < 6; i++) {
            const angle = (i * Math.PI) / 3;
            const x1 = centerX + Math.cos(angle) * 25;
            const y1 = centerY + Math.sin(angle) * 25;
            const x2 = centerX + Math.cos(angle) * 5;
            const y2 = centerY + Math.sin(angle) * 5;
            
            if (i === 0) {
                context.moveTo(x2, y2);
            }
            context.lineTo(x1, y1);
            context.lineTo(x2, y2);
        }
        context.closePath();
        context.fill();
        
        // Add center dot
        context.beginPath();
        context.arc(centerX, centerY, 3, 0, Math.PI * 2);
        context.fillStyle = 'rgba(255, 255, 255, 0.9)';
        context.fill();
        
        return new THREE.CanvasTexture(canvas);
    }
    
    update(time) {
        if (!this.snowParticles) return;
        
        const positions = this.snowGeo.attributes.position.array;
        const scales = this.snowGeo.attributes.scale.array;
        
        for (let i = 0; i < this.particleCount; i++) {
            const i3 = i * 3;
            
            // Apply gravity and wind
            this.velocities[i3] += this.windForce.x * this.config.windStrength;
            this.velocities[i3 + 1] -= 0.001; // Gravity
            this.velocities[i3 + 2] += this.windForce.z * this.config.windStrength;
            
            // Add swaying motion
            const swayAmount = Math.sin(time * 0.001 + this.swayPhases[i]) * 0.02;
            this.velocities[i3] += swayAmount;
            
            // Update positions
            positions[i3] += this.velocities[i3] * this.config.fallSpeed;
            positions[i3 + 1] += this.velocities[i3 + 1] * this.config.fallSpeed;
            positions[i3 + 2] += this.velocities[i3 + 2] * this.config.fallSpeed;
            
            // Reset particles that fall too low
            if (positions[i3 + 1] < -250) {
                positions[i3] = (Math.random() - 0.5) * 400;
                positions[i3 + 1] = 250;
                positions[i3 + 2] = (Math.random() - 0.5) * 400;
                
                // Reset velocities
                this.velocities[i3] = (Math.random() - 0.5) * 0.02;
                this.velocities[i3 + 1] = -(0.05 + Math.random() * 0.1);
                this.velocities[i3 + 2] = (Math.random() - 0.5) * 0.02;
            }
            
            // Gentle size pulsing for "floating" effect
            const pulseFactor = 1 + Math.sin(time * 0.002 + this.swayPhases[i]) * 0.1;
            scales[i] = (0.5 + Math.random() * 1.5) * pulseFactor;
        }
        
        // Rotate entire snow system slightly
        this.snowParticles.rotation.y += 0.0005;
        
        this.snowGeo.attributes.position.needsUpdate = true;
        this.snowGeo.attributes.scale.needsUpdate = true;
    }
    
    setIntensity(intensity) {
        this.config.intensity = intensity;
        if (this.snowParticles) {
            this.snowParticles.material.opacity = intensity * 0.8;
        }
    }
    
    setWindStrength(strength) {
        this.config.windStrength = strength;
    }
    
    setFallSpeed(speed) {
        this.config.fallSpeed = speed;
    }
    
    dispose() {
        if (this.snowParticles) {
            this.scene.remove(this.snowParticles);
            this.snowGeo.dispose();
            this.snowParticles.material.dispose();
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SnowSystem;
}