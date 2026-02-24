## Cursor Cloud specific instructions

This is a static HTML/JS project with two Three.js 3D weather visualizations. There is no package manager, build system, linter, or test framework.

### Pages
- `index.html` — "Weather Station": thunderstorm simulation with rain, clouds, lightning, and interactive controls. Uses Three.js r128 from CDN (`cdnjs.cloudflare.com`).
- `cloud.html` — "Flying Through Clouds": cloud fly-through with stars, lightning, and boost. Uses Three.js 0.162.0 via ES module import map from `unpkg.com`.

### Running
Serve the project root with any static HTTP server on port 8080:
```
python3 -m http.server 8080
```
Then open `http://localhost:8080/index.html` or `http://localhost:8080/cloud.html`.

A static file server is required because browsers block `file://` for texture loading (`images/smoke.png`, `images/cloud.png`) and ES module imports used by `cloud.html`.

### Key notes
- No dependencies to install — all JS libraries are loaded from CDN at runtime.
- Internet/CDN access is required (Three.js is not vendored locally).
- No lint, test, or build commands exist for this project.
