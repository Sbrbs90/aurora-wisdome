// Aurora for the dome (p5.js + shader), self-running animation
// By Barbara Melloni, Malmö University, 2026
//
// The aurora is adapted from the "Aurora sky shader" for Godot by BluePhoenix1 (CC0):
// https://godotshaders.com/shader/aurora-sky-shader/
// which is based on "Auroras" by nimitz (2017):
// https://www.shadertoy.com/view/XtGGRt
// License: Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported
//
// Keys: d = debug overlay (hidden by default)
//       v = view from inside the dome (needs Three.js in index.html)

// Switch for the final render.
// false = on-screen preview (1024, with simulator and debug)
// true  = export every frame as a 2048 x 2048 PNG (no simulator, no debug)
const EXPORT = false;
// Length of the export in frames. 90 s x 30 fps = 2700. For a short test use 150 (5 s).
const TOTAL_FRAMES = 2700;

const SIZE = EXPORT ? 2048 : 1024; // side of the master: 1024 to work, 2048 to export
// false = square canvas, like the delivery video (2048 x 2048)
// true  = 3840 x 2160 output with the master in the centre, as it reaches the dome from a laptop (HDMI)
// Must stay false when EXPORT = true.
const LIVE_HDMI = false;
const OUT_W = LIVE_HDMI ? 3840 : SIZE;
const OUT_H = LIVE_HDMI ? 2160 : SIZE;
const FISHEYE_DEG = 160;           // delivery spec: the whole circle covers the 160 degree screen

// aurora parameters (same names as in the Godot shader)
const SPEED = 1.0;
const BRIGHTNESS = 1.5;
const CURTAIN_HEIGHT = 0.8;
const HORIZON_FADE = 0.4;
const COLOR_PHASE = [2.15, -0.5, 1.2];
const STAR_DENSITY = 0.5;
const SKY_TOP = [0.0, 0.01, 0.03];
const SKY_HORIZON = [0.02, 0.04, 0.08];
const FRONT_BOOST = 0.5;           // brighter aurora towards the front (0 = same everywhere)

let auroraShader;
let level = 0;                     // 0 = dimmer aurora, 1 = more intense (an input such as a sensor could drive this later)
let showDebug = false;

const VERT = `
attribute vec3 aPosition;
uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
void main() {
  gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
}
`;

const FRAG = `
precision highp float;

uniform vec2 uRes;      // side of the master
uniform vec2 uOffset;   // where the master starts inside the canvas
uniform float uTime;
uniform float uBrightness;
uniform float uCurtainHeight;
uniform float uHorizonFade;
uniform vec3 uColorPhase;
uniform float uStarDensity;
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform float uHalfFov;
uniform float uFront;
uniform float uDebug;
uniform float uFlash;   // 1 on frame 1 (white sync flash), 0 on all other frames

#define LAYERS 40
const float PI = 3.14159265;
const mat2 m2 = mat2(vec2(0.95534, 0.29552), vec2(-0.29552, 0.95534));

mat2 rot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(vec2(c, s), vec2(-s, c));
}

float tri(float x) {
  return clamp(abs(fract(x) - 0.5), 0.01, 0.49);
}

vec2 tri2(vec2 p) {
  return vec2(tri(p.x) + tri(p.y), tri(p.y + tri(p.x)));
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float tri_noise(vec2 p, float spd, float t) {
  float z = 1.8;
  float z2 = 2.5;
  float rz = 0.0;
  p *= rot(p.x * 0.06);
  vec2 bp = p;
  for (int i = 0; i < 5; i++) {
    vec2 dg = tri2(bp * 1.85) * 0.75;
    dg *= rot(t * spd);
    p -= dg / z2;
    bp *= 1.3;
    z2 *= 0.45;
    z *= 0.42;
    p *= 1.21 + (rz - 1.0) * 0.02;
    rz += tri(p.x + tri(p.y)) * z;
    p *= m2 * -1.0;
  }
  return clamp(1.0 / pow(rz * 29.0, 1.3), 0.0, 0.55);
}

vec4 aurora(vec3 rd, vec2 frag, float t) {
  vec4 col = vec4(0.0);
  vec4 avg = vec4(0.0);
  vec3 ro = vec3(0.0);

  for (int k = 0; k < LAYERS; k++) {
    float i = float(k);
    float jitter = 0.006 * hash21(frag) * smoothstep(0.0, 15.0, i);
    float pt = ((uCurtainHeight + pow(i, 1.4) * 0.002) - ro.y) / (rd.y * 2.0 + uHorizonFade);
    pt -= jitter;
    vec3 bpos = ro + pt * rd;
    float rzt = tri_noise(bpos.zx, 0.06, t);
    vec4 c2 = vec4(0.0, 0.0, 0.0, rzt);
    c2.rgb = (sin(1.0 - uColorPhase + i * 0.043) * 0.5 + 0.5) * rzt;
    avg = mix(avg, c2, 0.5);
    col += avg * exp2(-i * 0.065 - 2.5) * smoothstep(0.0, 5.0, i);
  }
  // fade towards the horizon
  col *= clamp(rd.y * 15.0 + 0.4, 0.0, 1.0);
  return col * uBrightness;
}

vec3 stars(vec3 rd) {
  vec2 uv = rd.xz / (rd.y + 1.2) * 60.0;
  vec2 id = floor(uv);
  float h = hash21(id);
  float s = step(1.0 - uStarDensity * 0.03, h);
  vec2 f = fract(uv) - 0.5;
  float d = smoothstep(0.35, 0.0, length(f));
  return vec3(s * d) * (0.5 + 0.5 * hash21(id + 7.0));
}

void main() {
  // centred coordinates from -1 to 1; positive y = bottom of the image (the front)
  vec2 fc = (gl_FragCoord.xy - uOffset) / uRes;
  vec2 p = vec2(fc.x - 0.5, 0.5 - fc.y) * 2.0;
  float r = length(p);

  if (r > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // equidistant fisheye: centre = zenith, edge = half the field of view (80 degrees for 160)
  float theta = r * uHalfFov;
  float phi = r > 0.0001 ? atan(p.y, p.x) : 0.0;
  vec3 rd = vec3(sin(theta) * cos(phi), cos(theta), sin(theta) * sin(phi));

  float t = uTime;

  vec3 sky = mix(uSkyTop, uSkyHorizon, smoothstep(0.0, 1.0, r));
  sky += stars(rd);

  float front = r > 0.0001 ? p.y / r : 0.0;
  vec4 au = aurora(rd, gl_FragCoord.xy, t) * (1.0 + uFront * front);
  vec3 col = sky * (1.0 - au.a) + au.rgb;

  // soft edge of the circle
  col *= smoothstep(1.0, 0.95, r);

  // white flash on frame 1 (inside the circle, the corners stay black)
  if (uFlash > 0.5) col = vec3(smoothstep(1.0, 0.95, r));

  if (uDebug > 0.5) {
    float ring = smoothstep(0.005, 0.0, abs(r - 0.995));
    float diag = smoothstep(0.004, 0.0, abs(abs(p.x) - abs(p.y)));
    // sweet spot at r = 0.55 from the centre towards the front: (64 - 19.6) / 80 = 0.555
    float spot = smoothstep(0.022, 0.018, length(p - vec2(0.0, 0.55)));
    col = mix(col, vec3(1.0), clamp(ring + 0.6 * diag + spot, 0.0, 1.0));
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

function setup() {
  createCanvas(OUT_W, OUT_H, WEBGL);
  pixelDensity(1);
  // on-screen view only: the canvas shrinks if the window is smaller
  drawingContext.canvas.style.maxWidth = '100%';
  drawingContext.canvas.style.height = 'auto';
  frameRate(30);                   // like the final video: constant 30 fps
  noiseSeed(7);                    // fixed seed, so every run gives the same film
  noStroke();
  auroraShader = createShader(VERT, FRAG);

  // the simulator is not needed while exporting and would only slow it down
  if (!EXPORT) {
    if (typeof THREE !== 'undefined') initDome();
    else console.warn('Three.js not found: add the script to index.html');
  }
}

function draw() {
  updateLevel();

  const sh = auroraShader;
  shader(sh);
  sh.setUniform('uRes', [SIZE, SIZE]);
  sh.setUniform('uOffset', [(OUT_W - SIZE) / 2, (OUT_H - SIZE) / 2]);
  sh.setUniform('uTime', (frameCount / 30) * SPEED);
  sh.setUniform('uBrightness', BRIGHTNESS * (0.75 + 0.5 * level));
  sh.setUniform('uCurtainHeight', CURTAIN_HEIGHT);
  sh.setUniform('uHorizonFade', HORIZON_FADE);
  sh.setUniform('uColorPhase', COLOR_PHASE);
  sh.setUniform('uStarDensity', STAR_DENSITY);
  sh.setUniform('uSkyTop', SKY_TOP);
  sh.setUniform('uSkyHorizon', SKY_HORIZON);
  sh.setUniform('uHalfFov', (FISHEYE_DEG / 2) * Math.PI / 180);
  sh.setUniform('uFront', FRONT_BOOST);
  sh.setUniform('uDebug', showDebug ? 1 : 0);
  sh.setUniform('uFlash', frameCount === 1 ? 1 : 0);   // white flash on frame 1 only
  plane(width, height);

  // save the frame (frame_0001, frame_0002, ...) and stop at the end
  if (EXPORT) {
    saveCanvas('frame_' + nf(frameCount, 4), 'png');
    if (frameCount >= TOTAL_FRAMES) noLoop();
  }

  if (domeOn) renderDome();
}

// the intensity rises and falls by itself, slowly
function updateLevel() {
  const n = noise(1000, frameCount * 0.002);
  const target = constrain(map(n, 0.25, 0.75, 0, 1), 0, 1);
  level = lerp(level, target, 0.03);
}

function keyPressed() {
  if (key === 'd') showDebug = !showDebug;
  if (key === 'v' && domeRenderer) {
    domeOn = !domeOn;
    domeRenderer.domElement.style.display = domeOn ? 'block' : 'none';
  }
}

// ---------------------------------------------------------------
// Dome simulator (Three.js)
// The sketch canvas is projected onto the inside of a half sphere,
// and you look at it from inside. Drag to look around, scroll to zoom.
// ---------------------------------------------------------------

const VIEWER_Z = 0;        // try -0.3 to sit further back, towards the back of the room

let domeOn = false;
let domeRenderer, domeScene, domeCamera, domeTex;
let domeYaw = Math.PI;     // starts facing the front (the bottom of the image)
let domePitch = 0.5;

function initDome() {
  domeRenderer = new THREE.WebGLRenderer({ antialias: true });
  domeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  domeRenderer.setClearColor(0x000000);
  const el = domeRenderer.domElement;
  el.style.cssText = 'position:fixed;left:0;top:0;display:none;z-index:10;';
  document.body.appendChild(el);

  domeScene = new THREE.Scene();
  domeCamera = new THREE.PerspectiveCamera(75, 1, 0.01, 10);
  domeCamera.rotation.order = 'YXZ';
  domeCamera.position.set(0, 0, VIEWER_Z);

  // texture = the sketch canvas, updated every frame
  domeTex = new THREE.CanvasTexture(drawingContext.canvas);
  if (LIVE_HDMI) {
    // the simulator only uses the central square (the master)
    domeTex.repeat.set(SIZE / OUT_W, SIZE / OUT_H);
    domeTex.offset.set((1 - SIZE / OUT_W) / 2, (1 - SIZE / OUT_H) / 2);
  }
  domeTex.generateMipmaps = false;
  domeTex.minFilter = THREE.LinearFilter;

  // 160 degree cap with the zenith at the top; the UVs follow the equidistant fisheye:
  // distance from the image centre = angle from the zenith
  const halfFov = (FISHEYE_DEG / 2) * Math.PI / 180;
  const geo = new THREE.SphereGeometry(1, 96, 48, 0, Math.PI * 2, 0, halfFov);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const theta = Math.acos(Math.min(1, y));   // angle from the zenith
    const rho = theta / halfFov;               // 0 = centre, 1 = edge of the circle
    const h = Math.hypot(x, z) || 1;
    // the front of the dome (+Z) matches the bottom of the image
    uv.setXY(i, 0.5 + 0.5 * rho * (-x / h), 0.5 - 0.5 * rho * (z / h));
  }
  const mat = new THREE.MeshBasicMaterial({ map: domeTex, side: THREE.BackSide });
  domeScene.add(new THREE.Mesh(geo, mat));

  domeResize();
  window.addEventListener('resize', domeResize);

  let drag = false;
  let lx = 0;
  let ly = 0;
  el.addEventListener('pointerdown', (e) => { drag = true; lx = e.clientX; ly = e.clientY; });
  window.addEventListener('pointerup', () => { drag = false; });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    domeYaw += (e.clientX - lx) * 0.004;
    domePitch = Math.max(-0.3, Math.min(1.5, domePitch + (e.clientY - ly) * 0.004));
    lx = e.clientX;
    ly = e.clientY;
  });
  el.addEventListener('wheel', (e) => {
    domeCamera.fov = Math.max(30, Math.min(110, domeCamera.fov + e.deltaY * 0.05));
    domeCamera.updateProjectionMatrix();
    e.preventDefault();
  }, { passive: false });
}

function domeResize() {
  if (!domeRenderer) return;
  domeRenderer.setSize(window.innerWidth, window.innerHeight);
  domeCamera.aspect = window.innerWidth / window.innerHeight;
  domeCamera.updateProjectionMatrix();
}

function renderDome() {
  domeTex.needsUpdate = true;
  domeCamera.rotation.set(domePitch, domeYaw, 0);
  domeRenderer.render(domeScene, domeCamera);
}
