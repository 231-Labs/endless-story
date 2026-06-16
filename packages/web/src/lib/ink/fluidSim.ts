// InkFluidSim — GPU Navier-Stokes solver (WebGL2), no three.js. velocity (RG16F)
// + dye (RGBA16F) ping-pong each frame; scratch: divergence/curl/pressure (R16F).
// Half-float needs EXT_color_buffer_float; isSupported() gates a static fallback.

import {
  ADVECTION_FRAG,
  CLEAR_FRAG,
  CURL_FRAG,
  DISPLAY_FRAG,
  DIVERGENCE_FRAG,
  GRADIENT_SUBTRACT_FRAG,
  PRESSURE_FRAG,
  SPLAT_FRAG,
  VERT,
  VORTICITY_FRAG,
} from './shaders';
import type { InkColorSet, InkSplatTarget, InkTuning, RGB } from './palette';

const PRESSURE_DECAY = 0.8;

interface FBO {
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
  attach(unit: number): number;
}

interface DoubleFBO {
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
  read: FBO;
  write: FBO;
  swap(): void;
}

class GLProgram {
  readonly program: WebGLProgram;
  readonly uniforms: Record<string, WebGLUniformLocation | null> = {};

  constructor(
    private readonly gl: WebGL2RenderingContext,
    vert: string,
    frag: string,
  ) {
    const program = gl.createProgram();
    if (!program) throw new Error('createProgram failed');
    const v = compile(gl, gl.VERTEX_SHADER, vert);
    const f = compile(gl, gl.FRAGMENT_SHADER, frag);
    gl.attachShader(program, v);
    gl.attachShader(program, f);
    gl.bindAttribLocation(program, 0, 'aPosition');
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`link failed: ${gl.getProgramInfoLog(program) ?? ''}`);
    }
    gl.deleteShader(v);
    gl.deleteShader(f);
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i);
      if (!info) continue;
      const name = info.name.replace(/\[0\]$/, '');
      this.uniforms[name] = gl.getUniformLocation(program, name);
    }
    this.program = program;
  }

  bind(): void {
    this.gl.useProgram(this.program);
  }
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('createShader failed');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`shader compile failed: ${log ?? ''}`);
  }
  return shader;
}

// Cached per page (support never changes) so we don't leak a probe context per mount.
let supportCache: boolean | undefined;

export class InkFluidSim implements InkSplatTarget {
  static isSupported(): boolean {
    if (supportCache !== undefined) return supportCache;
    if (typeof document === 'undefined') return false;
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2');
      if (!gl) return (supportCache = false);
      const ok = gl.getExtension('EXT_color_buffer_float') != null;
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return (supportCache = ok);
    } catch {
      return (supportCache = false);
    }
  }

  private readonly gl: WebGL2RenderingContext;
  private readonly programs: GLProgram[] = [];
  private readonly fbos: FBO[] = [];
  private readonly vao: WebGLVertexArrayObject;

  private readonly clearProg: GLProgram;
  private readonly splatProg: GLProgram;
  private readonly advectionProg: GLProgram;
  private readonly divergenceProg: GLProgram;
  private readonly curlProg: GLProgram;
  private readonly vorticityProg: GLProgram;
  private readonly pressureProg: GLProgram;
  private readonly gradientProg: GLProgram;
  private readonly displayProg: GLProgram;

  private velocity!: DoubleFBO;
  private dye!: DoubleFBO;
  private pressure!: DoubleFBO;
  private divergence!: FBO;
  private curlFbo!: FBO;

  private readonly tuning: InkTuning;
  private palette: InkColorSet;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, tuning: InkTuning, palette: InkColorSet) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'low-power',
    });
    if (!gl) throw new Error('webgl2 unavailable');
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('EXT_color_buffer_float unavailable');
    this.gl = gl;
    this.tuning = tuning;
    this.palette = palette;

    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    // fullscreen quad shared by every pass via attrib location 0
    const vao = gl.createVertexArray();
    if (!vao) throw new Error('createVertexArray failed');
    this.vao = vao;
    gl.bindVertexArray(vao);
    const verts = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, verts);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);
    const idx = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);

    const make = (frag: string) => {
      const p = new GLProgram(gl, VERT, frag);
      this.programs.push(p);
      return p;
    };
    this.clearProg = make(CLEAR_FRAG);
    this.splatProg = make(SPLAT_FRAG);
    this.advectionProg = make(ADVECTION_FRAG);
    this.divergenceProg = make(DIVERGENCE_FRAG);
    this.curlProg = make(CURL_FRAG);
    this.vorticityProg = make(VORTICITY_FRAG);
    this.pressureProg = make(PRESSURE_FRAG);
    this.gradientProg = make(GRADIENT_SUBTRACT_FRAG);
    this.displayProg = make(DISPLAY_FRAG);

    this.initFramebuffers();
  }

  private resolution(longSide: number): { width: number; height: number } {
    const gl = this.gl;
    let aspect = gl.drawingBufferWidth / Math.max(gl.drawingBufferHeight, 1);
    if (aspect < 1) aspect = 1 / aspect;
    const min = Math.round(longSide);
    const max = Math.round(longSide * aspect);
    return gl.drawingBufferWidth > gl.drawingBufferHeight
      ? { width: max, height: min }
      : { width: min, height: max };
  }

  private initFramebuffers(): void {
    const gl = this.gl;
    for (const f of this.fbos.splice(0)) {
      gl.deleteTexture(f.texture);
      gl.deleteFramebuffer(f.fbo);
    }

    const simRes = this.resolution(this.tuning.simResolution);
    const dyeRes = this.resolution(Math.round(this.tuning.simResolution * 1.8));

    this.velocity = this.doubleFbo(simRes.width, simRes.height, gl.RG16F, gl.RG, gl.LINEAR);
    this.dye = this.doubleFbo(dyeRes.width, dyeRes.height, gl.RGBA16F, gl.RGBA, gl.LINEAR);
    this.pressure = this.doubleFbo(simRes.width, simRes.height, gl.R16F, gl.RED, gl.NEAREST);
    this.divergence = this.fbo(simRes.width, simRes.height, gl.R16F, gl.RED, gl.NEAREST);
    this.curlFbo = this.fbo(simRes.width, simRes.height, gl.R16F, gl.RED, gl.NEAREST);
  }

  private fbo(w: number, h: number, internalFormat: number, format: number, filter: number): FBO {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    if (!texture || !framebuffer) throw new Error('fbo alloc failed');
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, gl.HALF_FLOAT, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const handle: FBO = {
      texture,
      fbo: framebuffer,
      width: w,
      height: h,
      texelSizeX: 1 / w,
      texelSizeY: 1 / h,
      attach: (unit: number) => {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        return unit;
      },
    };
    this.fbos.push(handle);
    return handle;
  }

  private doubleFbo(w: number, h: number, internalFormat: number, format: number, filter: number): DoubleFBO {
    let a = this.fbo(w, h, internalFormat, format, filter);
    let b = this.fbo(w, h, internalFormat, format, filter);
    return {
      width: w,
      height: h,
      texelSizeX: 1 / w,
      texelSizeY: 1 / h,
      get read() {
        return a;
      },
      get write() {
        return b;
      },
      swap() {
        const t = a;
        a = b;
        b = t;
      },
    };
  }

  private blit(target: FBO | null): void {
    const gl = this.gl;
    if (target) {
      gl.viewport(0, 0, target.width, target.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    } else {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  }

  setPalette(palette: InkColorSet): void {
    this.palette = palette;
  }

  // Zero flow + ink (theme flip / restart) so day↔night don't blend.
  clear(): void {
    const gl = this.gl;
    for (const d of [this.velocity, this.dye, this.pressure]) {
      for (const f of [d.read, d.write]) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, f.fbo);
        gl.viewport(0, 0, f.width, f.height);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
    }
  }

  // Rebuild when the grid the current aspect wants differs from the live grid
  // (a width-only resize changes the continuous aspect, not just orientation).
  resize(): void {
    if (this.disposed) return;
    const r = this.resolution(this.tuning.simResolution);
    if (r.width !== this.velocity.width || r.height !== this.velocity.height) {
      this.initFramebuffers();
    }
  }

  splat(x: number, y: number, dvx: number, dvy: number, color: RGB, radius: number): void {
    if (this.disposed) return;
    const gl = this.gl;
    const aspect = gl.drawingBufferWidth / Math.max(gl.drawingBufferHeight, 1);
    this.splatProg.bind();
    const u = this.splatProg.uniforms;
    gl.uniform1f(u.aspectRatio ?? null, aspect);
    gl.uniform2f(u.point ?? null, x, y);
    gl.uniform1f(u.radius ?? null, radius);

    gl.uniform1i(u.uTarget ?? null, this.velocity.read.attach(0));
    gl.uniform3f(u.color ?? null, dvx, dvy, 0);
    this.blit(this.velocity.write);
    this.velocity.swap();

    gl.uniform1i(u.uTarget ?? null, this.dye.read.attach(0));
    gl.uniform3f(u.color ?? null, color[0], color[1], color[2]);
    this.blit(this.dye.write);
    this.dye.swap();
  }

  step(dt: number): void {
    if (this.disposed) return;
    const gl = this.gl;
    const vel = this.velocity;
    const texelX = vel.texelSizeX;
    const texelY = vel.texelSizeY;

    this.curlProg.bind();
    gl.uniform2f(this.curlProg.uniforms.texelSize ?? null, texelX, texelY);
    gl.uniform1i(this.curlProg.uniforms.uVelocity ?? null, vel.read.attach(0));
    this.blit(this.curlFbo);

    this.vorticityProg.bind();
    gl.uniform2f(this.vorticityProg.uniforms.texelSize ?? null, texelX, texelY);
    gl.uniform1i(this.vorticityProg.uniforms.uVelocity ?? null, vel.read.attach(0));
    gl.uniform1i(this.vorticityProg.uniforms.uCurl ?? null, this.curlFbo.attach(1));
    gl.uniform1f(this.vorticityProg.uniforms.curl ?? null, this.tuning.curl);
    gl.uniform1f(this.vorticityProg.uniforms.dt ?? null, dt);
    this.blit(vel.write);
    vel.swap();

    this.divergenceProg.bind();
    gl.uniform2f(this.divergenceProg.uniforms.texelSize ?? null, texelX, texelY);
    gl.uniform1i(this.divergenceProg.uniforms.uVelocity ?? null, vel.read.attach(0));
    this.blit(this.divergence);

    this.clearProg.bind();
    gl.uniform1i(this.clearProg.uniforms.uTexture ?? null, this.pressure.read.attach(0));
    gl.uniform1f(this.clearProg.uniforms.value ?? null, PRESSURE_DECAY);
    this.blit(this.pressure.write);
    this.pressure.swap();

    this.pressureProg.bind();
    gl.uniform2f(this.pressureProg.uniforms.texelSize ?? null, texelX, texelY);
    gl.uniform1i(this.pressureProg.uniforms.uDivergence ?? null, this.divergence.attach(0));
    for (let i = 0; i < this.tuning.pressureIterations; i++) {
      gl.uniform1i(this.pressureProg.uniforms.uPressure ?? null, this.pressure.read.attach(1));
      this.blit(this.pressure.write);
      this.pressure.swap();
    }

    this.gradientProg.bind();
    gl.uniform2f(this.gradientProg.uniforms.texelSize ?? null, texelX, texelY);
    gl.uniform1i(this.gradientProg.uniforms.uPressure ?? null, this.pressure.read.attach(0));
    gl.uniform1i(this.gradientProg.uniforms.uVelocity ?? null, vel.read.attach(1));
    this.blit(vel.write);
    vel.swap();

    this.advectionProg.bind();
    gl.uniform2f(this.advectionProg.uniforms.texelSize ?? null, texelX, texelY);
    gl.uniform1f(this.advectionProg.uniforms.dt ?? null, dt);
    gl.uniform1i(this.advectionProg.uniforms.uVelocity ?? null, vel.read.attach(0));
    gl.uniform1i(this.advectionProg.uniforms.uSource ?? null, vel.read.attach(0));
    gl.uniform1f(this.advectionProg.uniforms.dissipation ?? null, this.tuning.velocityDissipation);
    this.blit(vel.write);
    vel.swap();

    gl.uniform1i(this.advectionProg.uniforms.uVelocity ?? null, vel.read.attach(0));
    gl.uniform1i(this.advectionProg.uniforms.uSource ?? null, this.dye.read.attach(1));
    gl.uniform1f(this.advectionProg.uniforms.dissipation ?? null, this.tuning.dyeDissipation);
    this.blit(this.dye.write);
    this.dye.swap();
  }

  render(timeSec: number): void {
    if (this.disposed) return;
    const gl = this.gl;
    this.displayProg.bind();
    const u = this.displayProg.uniforms;
    gl.uniform1i(u.uDye ?? null, this.dye.read.attach(0));
    gl.uniform2f(u.uResolution ?? null, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform3f(u.uPaper ?? null, this.palette.paper[0], this.palette.paper[1], this.palette.paper[2]);
    gl.uniform1f(u.uInkGain ?? null, this.tuning.inkGain);
    gl.uniform1f(u.uDark ?? null, this.palette.dark ? 1 : 0);
    gl.uniform1f(u.uTime ?? null, timeSec);
    gl.uniform1f(u.uVignette ?? null, this.tuning.vignette);
    gl.uniform1f(u.uGrain ?? null, this.tuning.grain);
    gl.uniform1f(u.uFiber ?? null, this.tuning.fiber);
    this.blit(null);
  }

  // No loseContext(): React's dev double-mount re-runs the effect on the same
  // canvas, and a lost context makes the remount's getContext fail.
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    for (const f of this.fbos.splice(0)) {
      gl.deleteTexture(f.texture);
      gl.deleteFramebuffer(f.fbo);
    }
    for (const p of this.programs.splice(0)) gl.deleteProgram(p.program);
    gl.bindVertexArray(null);
    gl.deleteVertexArray(this.vao);
  }
}
