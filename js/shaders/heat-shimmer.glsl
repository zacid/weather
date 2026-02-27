// Heat Shimmer Fragment Shader
// Add this to your existing fragment shaders for heat distortion effects

uniform float time;
uniform float temperature; // 0.0 to 1.0, higher = more distortion
uniform float heatIntensity; // Overall distortion strength
uniform vec2 resolution;

// Noise function for heat distortion
float noise(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

// Smooth noise
float smoothNoise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);
    
    float a = noise(i);
    float b = noise(i + vec2(1.0, 0.0));
    float c = noise(i + vec2(0.0, 1.0));
    float d = noise(i + vec2(1.0, 1.0));
    
    vec2 u = f * f * (3.0 - 2.0 * f);
    
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

// Fractal noise for more complex distortion
float fractalNoise(vec2 st) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    
    for (int i = 0; i < 4; i++) {
        value += amplitude * smoothNoise(st * frequency);
        amplitude *= 0.5;
        frequency *= 2.0;
    }
    
    return value;
}

// Heat distortion function
vec2 heatDistortion(vec2 uv, float temp, float intensity) {
    // Create vertical heat waves that rise
    float waveSpeed = time * 2.0;
    float waveFrequency = 8.0 + temp * 4.0; // More waves when hotter
    
    // Primary vertical distortion (heat rising)
    float verticalWave = sin(uv.x * waveFrequency + waveSpeed) * temp * intensity * 0.02;
    
    // Add noise-based distortion for realism
    vec2 noiseUV = uv * 3.0 + vec2(time * 0.1, time * 0.3);
    float noiseDistortion = fractalNoise(noiseUV) * temp * intensity * 0.015;
    
    // Horizontal shimmer effect
    float horizontalWave = sin(uv.y * waveFrequency * 0.7 + waveSpeed * 1.3) * temp * intensity * 0.01;
    
    // Combine distortions
    vec2 distortion = vec2(
        horizontalWave + noiseDistortion * 0.5,
        verticalWave + noiseDistortion
    );
    
    // Make distortion stronger towards the bottom (ground level heat)
    float heightFactor = smoothstep(0.0, 0.6, 1.0 - uv.y);
    distortion *= heightFactor;
    
    return distortion;
}

// Heat color tinting
vec3 heatTint(vec3 baseColor, float temp, vec2 uv) {
    if (temp < 0.1) return baseColor;
    
    // Heat colors: orange/red tint for hot areas
    vec3 hotColor = vec3(1.0, 0.6, 0.2); // Orange-red
    vec3 mediumColor = vec3(1.0, 0.8, 0.4); // Yellow-orange
    
    // Create heat gradient based on temperature and position
    float heatGradient = temp * smoothstep(0.0, 0.7, 1.0 - uv.y);
    
    // Apply heat tinting
    if (heatGradient > 0.7) {
        return mix(baseColor, hotColor, (heatGradient - 0.7) * 0.3);
    } else if (heatGradient > 0.3) {
        return mix(baseColor, mediumColor, (heatGradient - 0.3) * 0.2);
    }
    
    return baseColor;
}

// Main heat shimmer effect function
// Call this in your fragment shader's main() function
vec4 applyHeatShimmer(vec4 originalColor, vec2 uv) {
    // Calculate heat distortion
    vec2 distortedUV = uv + heatDistortion(uv, temperature, heatIntensity);
    
    // Sample the original texture with distorted coordinates
    // Note: You'll need to sample your original texture here
    vec4 distortedColor = originalColor; // Replace with actual texture sampling
    
    // Apply heat color tinting
    distortedColor.rgb = heatTint(distortedColor.rgb, temperature, uv);
    
    // Add subtle shimmer overlay
    float shimmer = fractalNoise(uv * 20.0 + time * 0.5) * temperature * 0.1;
    distortedColor.rgb += shimmer;
    
    return distortedColor;
}

// Example integration into existing fragment shader:
/*
void main() {
    vec2 vUv = gl_FragCoord.xy / resolution.xy;
    
    // Your existing color calculation
    vec4 baseColor = texture2D(yourTexture, vUv);
    
    // Apply heat shimmer effect
    gl_FragColor = applyHeatShimmer(baseColor, vUv);
}
*/