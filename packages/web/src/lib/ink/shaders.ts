/**
 * 水墨流體 — GLSL ES 3.00 shader sources (WebGL2).
 *
 * A GPU Navier–Stokes solver in the lineage of Jos Stam's "Stable Fluids"
 * and Pavel Dobryakov's WebGL fluid sim, retuned for ink-on-paper:
 *
 *   每一格 (tick) ：
 *     curl → vorticity (補渦流) → divergence → pressure (Jacobi ×N)
 *     → gradientSubtract (投影成無散度場) → advect velocity → advect dye
 *
 * `dye` 緩衝累積墨量（逐通道 RGB 相加 = 不同墨色自然融合）。最後 display
 * shader 以 Beer–Lambert 把墨「滲」進和紙：日間吸光、夜間發光。
 */

/** Fullscreen-quad vertex shader. Precomputes the 4 neighbour texel UVs so the
 *  divergence / curl / pressure kernels are a plain texture fetch, no math. */
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

/** Decay a field in place (used to bleed pressure between frames). */
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

/** Add a soft Gaussian dab of "stuff" (velocity force, or ink) to a target. */
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

/** Semi-Lagrangian advection with exponential dissipation (the "diffusion"
 *  read of ink fading + spreading is carried by dissipation + soft splats). */
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

/** Velocity divergence (∇·u) — the residual the pressure solve cancels. */
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

/** Curl ω = ∂v/∂x − ∂u/∂y (vorticity magnitude per cell). */
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

/** Vorticity confinement — feeds the small swirls back in so the ink keeps
 *  curling (the 渦流) instead of damping flat. */
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

/** One Jacobi iteration of the pressure Poisson equation ∇²p = ∇·u. */
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

/** Subtract the pressure gradient → divergence-free (incompressible) velocity. */
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

/**
 * Final render — ink seeps into 米色和紙.
 *
 *  • dye 緩衝存「墨量」(逐通道)。日間 (uDark=0) 用 Beer–Lambert 透光率
 *    paper·exp(−dye·k)：墨吸光、疊加自然變濃、不同墨色相減混合。
 *  • 夜間 (uDark=1) 改為加光 paper+dye·k：墨像在暗紙上微微發光。
 *  • 再疊 紙張纖維 fbm、顆粒 grain、四角暗角 vignette。
 */
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
  vec2 sp = vec2(uv.x * ar, uv.y);            // square-pixel space for isotropic noise

  vec3 dyeRaw = max(texture(uDye, uv).rgb, 0.0) * uInkGain;
  float density = max(max(dyeRaw.r, dyeRaw.g), dyeRaw.b);

  // ── paper: long 纖維 (anisotropic fbm) + fine speckle — NIGHT ONLY ───────
  //    Day uses the flat canvas colour (uDark=0) so the loader blends seamlessly
  //    into the page background; night keeps the washi fibre.
  float fibers = fbm(sp * vec2(8.0, 150.0));   // streaks running down the sheet
  float weave  = fbm(sp * vec2(150.0, 8.0));   // cross weave
  float speck  = fbm(sp * 320.0);
  vec3 paper = uPaper;
  paper *= 1.0 + uDark * uFiber * ((fibers + weave) * 0.5 - 0.5) * 0.16;
  paper += uDark * uFiber * (speck - 0.5) * 0.012;

  // ── 飛白 / 滲：thin ink edges fracture along the paper tooth (墨沿纖維滲開)
  //    instead of a smooth gaussian falloff — this is what reads as 墨, not a glow.
  float tooth = fbm(sp * vec2(46.0, 120.0));                 // fibre-directional grain
  float edgeMask = 1.0 - smoothstep(0.05, 0.55, density);    // 1 at the thin rim → 0 in the core
  float breakup = clamp(1.0 - edgeMask * (1.0 - tooth) * 1.15, 0.0, 1.0);
  vec3 dye = dyeRaw * breakup;
  float d = density * breakup;

  // ── 墨边 tide-line：pigment piles where the wash dries → a rim around the stroke
  float tide = smoothstep(0.05, 0.2, d) * (1.0 - smoothstep(0.2, 0.5, d));

  // ── ink: subtractive (day) vs additive glow (night), with 墨分五色 tonal depth.
  //    Kept dilute (淡墨) overall — lighter wash in day, fainter glow at night.
  vec3 dayInk   = paper * exp(-dye * (0.82 + 0.4 * tide));   // lighter grey wash
  vec3 nightInk = paper + dye * (0.66 + 0.18 * fbm(sp * 6.0)); // fainter glow
  nightInk += tide * 0.08 * (vec3(1.0) - paper);            // faint brighter rim
  vec3 col = mix(dayInk, nightInk, uDark);

  // ── vignette (四角輕掩) — NIGHT ONLY so day stays flat page-colour ───
  vec2 q = uv - 0.5;
  float vig = smoothstep(1.05, 0.35, length(q) * 1.35);
  col *= mix(1.0, vig, uVignette * uDark);

  // ── film grain (米紙顆粒) — NIGHT ONLY ──────────────────────────────
  float g = hash(uv * uResolution + fract(uTime) * 57.0) - 0.5;
  col += g * uGrain * uDark;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
