// 水墨 fluid — GLSL ES 3.00 (WebGL2). GPU Navier-Stokes (Stam / Dobryakov),
// retuned for ink-on-paper. Per tick: curl → vorticity → divergence → pressure
// (Jacobi) → gradient-subtract → advect velocity → advect dye → display.

// Fullscreen quad; precomputes the 4 neighbour texel UVs for the kernels.
export const VERT = /* glsl */ `#version 300 es
precision highp float;
in vec2 aPosition;
out vec2 vUv;
out vec2 vL;
out vec2 vR;
out vec2 vT;
out vec2 vB;
uniform vec2 texelSize;
void main () {
  vUv = aPosition * 0.5 + 0.5;
  vL = vUv - vec2(texelSize.x, 0.0);
  vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y);
  vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

export const CLEAR_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTexture;
uniform float value;
out vec4 fragColor;
void main () {
  fragColor = value * texture(uTexture, vUv);
}
`;

// Soft Gaussian dab of velocity force / ink.
export const SPLAT_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform float radius;
out vec4 fragColor;
void main () {
  vec2 p = vUv - point;
  p.x *= aspectRatio;
  vec3 splat = exp(-dot(p, p) / radius) * color;
  vec3 base = texture(uTarget, vUv).xyz;
  fragColor = vec4(base + splat, 1.0);
}
`;

// Semi-Lagrangian advection; dissipation stands in for diffusion.
export const ADVECTION_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 texelSize;
uniform float dt;
uniform float dissipation;
out vec4 fragColor;
void main () {
  vec2 coord = vUv - dt * texture(uVelocity, vUv).xy * texelSize;
  vec4 result = texture(uSource, coord);
  float decay = 1.0 + dissipation * dt;
  fragColor = result / decay;
}
`;

export const DIVERGENCE_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
uniform sampler2D uVelocity;
out vec4 fragColor;
void main () {
  float L = texture(uVelocity, vL).x;
  float R = texture(uVelocity, vR).x;
  float T = texture(uVelocity, vT).y;
  float B = texture(uVelocity, vB).y;
  vec2 C = texture(uVelocity, vUv).xy;
  if (vL.x < 0.0) { L = -C.x; }
  if (vR.x > 1.0) { R = -C.x; }
  if (vT.y > 1.0) { T = -C.y; }
  if (vB.y < 0.0) { B = -C.y; }
  float div = 0.5 * (R - L + T - B);
  fragColor = vec4(div, 0.0, 0.0, 1.0);
}
`;

export const CURL_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
uniform sampler2D uVelocity;
out vec4 fragColor;
void main () {
  float L = texture(uVelocity, vL).y;
  float R = texture(uVelocity, vR).y;
  float T = texture(uVelocity, vT).x;
  float B = texture(uVelocity, vB).x;
  float vorticity = R - L - T + B;
  fragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
}
`;

// Vorticity confinement — feeds the swirls back so the ink keeps curling.
export const VORTICITY_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float curl;
uniform float dt;
out vec4 fragColor;
void main () {
  float L = texture(uCurl, vL).x;
  float R = texture(uCurl, vR).x;
  float T = texture(uCurl, vT).x;
  float B = texture(uCurl, vB).x;
  float C = texture(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= curl * C;
  force.y *= -1.0;
  vec2 velocity = texture(uVelocity, vUv).xy;
  velocity += force * dt;
  velocity = clamp(velocity, -1000.0, 1000.0);
  fragColor = vec4(velocity, 0.0, 1.0);
}
`;

export const PRESSURE_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
out vec4 fragColor;
void main () {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  float divergence = texture(uDivergence, vUv).x;
  float pressure = (L + R + B + T - divergence) * 0.25;
  fragColor = vec4(pressure, 0.0, 0.0, 1.0);
}
`;

export const GRADIENT_SUBTRACT_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
out vec4 fragColor;
void main () {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  vec2 velocity = texture(uVelocity, vUv).xy;
  velocity.xy -= vec2(R - L, T - B);
  fragColor = vec4(velocity, 0.0, 1.0);
}
`;

// Render: ink over washi. Day = Beer-Lambert absorption (flat page colour);
// night = additive glow over fibre + vignette + grain. Thin edges fracture
// along the paper tooth (飛白) + a tide-line rim; kept dilute overall.
export const DISPLAY_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uDye;
uniform vec2 uResolution;
uniform vec3 uPaper;
uniform float uInkGain;
uniform float uDark;
uniform float uTime;
uniform float uVignette;
uniform float uGrain;
uniform float uFiber;
out vec4 fragColor;

float hash (vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise (vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm (vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}

void main () {
  vec2 uv = vUv;
  float ar = uResolution.x / max(uResolution.y, 1.0);
  vec2 sp = vec2(uv.x * ar, uv.y);

  vec3 dyeRaw = max(texture(uDye, uv).rgb, 0.0) * uInkGain;
  float density = max(max(dyeRaw.r, dyeRaw.g), dyeRaw.b);

  // paper fibre — night only; day stays flat page colour
  float fibers = fbm(sp * vec2(8.0, 150.0));
  float weave  = fbm(sp * vec2(150.0, 8.0));
  float speck  = fbm(sp * 320.0);
  vec3 paper = uPaper;
  paper *= 1.0 + uDark * uFiber * ((fibers + weave) * 0.5 - 0.5) * 0.16;
  paper += uDark * uFiber * (speck - 0.5) * 0.012;

  // thin edges fracture along the paper tooth (飛白) + tide-line rim
  float tooth = fbm(sp * vec2(46.0, 120.0));
  float edgeMask = 1.0 - smoothstep(0.05, 0.55, density);
  float breakup = clamp(1.0 - edgeMask * (1.0 - tooth) * 1.15, 0.0, 1.0);
  vec3 dye = dyeRaw * breakup;
  float d = density * breakup;
  float tide = smoothstep(0.05, 0.2, d) * (1.0 - smoothstep(0.2, 0.5, d));

  vec3 dayInk   = paper * exp(-dye * (0.82 + 0.4 * tide));
  vec3 nightInk = paper + dye * (0.66 + 0.18 * fbm(sp * 6.0));
  nightInk += tide * 0.08 * (vec3(1.0) - paper);
  vec3 col = mix(dayInk, nightInk, uDark);

  // vignette + grain, night only
  vec2 q = uv - 0.5;
  float vig = smoothstep(1.05, 0.35, length(q) * 1.35);
  col *= mix(1.0, vig, uVignette * uDark);
  float g = hash(uv * uResolution + fract(uTime) * 57.0) - 0.5;
  col += g * uGrain * uDark;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
