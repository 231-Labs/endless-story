import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import type * as THREENS from 'three';

/**
 * Imperative THREE helper library exposed to GLM-authored scene code (option
 * 3+1 hybrid). GLM still writes the composition, but calls these polished
 * factories for high-quality blocks instead of raw primitives. Each returns a
 * `THREE.Object3D` GLM positions and adds. `THREE` is injected (same instance).
 */
type THREE = typeof THREENS;

function paintQingGreenSky(THREE: THREE): THREENS.Texture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#cfe8e6');
  grad.addColorStop(0.5, '#a9d6d2');
  grad.addColorStop(1, '#e6f1ec');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 512);
  // 瓦浪 ridge
  g.strokeStyle = '#3f7a72';
  g.lineWidth = 12;
  g.globalAlpha = 0.8;
  g.beginPath();
  g.moveTo(0, 175);
  for (let x = 0; x <= 1024; x += 40) g.lineTo(x, 175 - Math.sin(x * 0.006) * 56);
  g.stroke();
  g.globalAlpha = 1;
  // 远山
  const range = (baseY: number, amp: number, color: string, alpha: number) => {
    g.globalAlpha = alpha;
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, 512);
    g.lineTo(0, baseY);
    for (let x = 0; x <= 1024; x += 48) g.quadraticCurveTo(x - 24, baseY - amp, x, baseY - Math.sin(x * 0.004) * amp);
    g.lineTo(1024, 512);
    g.fill();
    g.globalAlpha = 1;
  };
  range(280, 30, '#9fc6bf', 0.5);
  range(330, 46, '#5f9e92', 0.75);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildHelpers(THREE: THREE) {
  const mat = (opts: THREENS.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(opts);

  return {
    lights(): THREENS.Group {
      const g = new THREE.Group();
      g.add(new THREE.AmbientLight(0xd6e6df, 1.0));
      const key = new THREE.DirectionalLight(0xfff4e6, 1.5);
      key.position.set(8, 20, 10);
      key.castShadow = true;
      g.add(key);
      g.add(new THREE.HemisphereLight(0xdcefe9, 0xa8bcb2, 0.6));
      return g;
    },
    qingGreenSky(): THREENS.Mesh {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(60, 40, 24),
        new THREE.MeshBasicMaterial({ map: paintQingGreenSky(THREE), side: THREE.BackSide, fog: false, depthWrite: false }),
      );
      m.scale.set(-1, 1, 1);
      return m;
    },
    reflectiveWater(size = 18): THREENS.Object3D {
      const r = new Reflector(new THREE.PlaneGeometry(size, size), {
        color: 0x35505a,
        textureWidth: 512,
        textureHeight: 512,
        clipBias: 0.003,
      });
      r.rotation.x = -Math.PI / 2;
      return r;
    },
    moonGate(radius = 1.4): THREENS.Group {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.13, 18, 64), mat({ color: 0xc9d6cf, roughness: 0.5, metalness: 0.12 }));
      ring.position.y = radius + 0.25;
      g.add(ring);
      const base = new THREE.Mesh(new THREE.BoxGeometry(radius * 2.4, 0.32, 0.18), mat({ color: 0xc9d2cb, roughness: 0.8 }));
      base.position.y = 0.16;
      g.add(base);
      return g;
    },
    bamboo(): THREENS.Group {
      const g = new THREE.Group();
      const stalk = (x: number, z: number, h: number, rr: number) => {
        const segs = Math.max(4, Math.round(h / 0.6));
        for (let i = 0; i < segs; i++) {
          const m = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, (h / segs) * 0.9, 8), mat({ color: 0x739b54, roughness: 0.7 }));
          m.position.set(x, (i + 0.5) * (h / segs), z);
          g.add(m);
        }
      };
      stalk(0, 0, 2.6, 0.05);
      stalk(0.3, -0.2, 2.1, 0.045);
      stalk(-0.25, 0.15, 2.4, 0.04);
      return g;
    },
    scholarRock(): THREENS.Group {
      const g = new THREE.Group();
      const blobs: [number, number, number, number][] = [
        [0, 0.35, 0, 0.5], [0.18, 0.85, 0.06, 0.4], [-0.16, 1.2, -0.05, 0.34],
        [0.12, 1.55, 0.04, 0.26], [-0.05, 0.6, 0.2, 0.3], [0.05, 1.0, -0.18, 0.28],
      ];
      for (const [x, y, z, rr] of blobs) {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(rr, 1), mat({ color: 0xaaa89e, roughness: 0.92, flatShading: true }));
        m.position.set(x, y, z);
        g.add(m);
      }
      return g;
    },
    lantern(): THREENS.Group {
      const g = new THREE.Group();
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 2.4, 8), mat({ color: 0x2a1d10, roughness: 0.7 }));
      stand.position.y = 1.2;
      g.add(stand);
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 16), mat({ color: 0xb3261d, emissive: 0xff5a32, emissiveIntensity: 1.5, roughness: 0.5 }));
      body.scale.set(1, 1.25, 1);
      body.position.y = 2.4;
      g.add(body);
      const light = new THREE.PointLight(0xff9a5a, 3, 4.5, 2);
      light.position.y = 2.4;
      g.add(light);
      return g;
    },
    guqin(): THREENS.Group {
      const g = new THREE.Group();
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.42), mat({ color: 0x5a4434, roughness: 0.7 }));
      top.position.y = 0.28;
      g.add(top);
      const qin = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.24), mat({ color: 0x7a5a3a, roughness: 0.5 }));
      qin.position.y = 0.34;
      g.add(qin);
      for (const x of [-0.6, 0.6]) for (const z of [-0.16, 0.16]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, 0.06), mat({ color: 0x3b2f24, roughness: 0.8 }));
        leg.position.set(x, 0.14, z);
        g.add(leg);
      }
      return g;
    },
    incense(): THREENS.Group {
      const g = new THREE.Group();
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.16, 16), mat({ color: 0x7d5a2e, metalness: 0.5, roughness: 0.5 }));
      bowl.position.y = 0.12;
      g.add(bowl);
      return g;
    },
  };
}

export type SceneHelpers = ReturnType<typeof buildHelpers>;
