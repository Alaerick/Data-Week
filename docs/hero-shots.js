// Hero animation: every made shot of the 2025-26 season flies from where it was
// taken into the basket, in game-date order. Landed shots stay on the floor, so
// the court fills in with the season's shot map. Decorative only: no text, no
// controls, and it never captures the pointer.
// Adapted from arrows_package/docs/arrows/arrows.js. Requires an import map for "three".
import * as THREE from "three";

const SEASON_SECONDS = 46; // playback time for the whole season
const FLIGHT = 1.25;       // seconds a shot stays in the air
const HOLD = 6;            // seconds the finished shot map stays up
const FADE = 1.6;          // seconds to fade out before the loop restarts

export async function mountHeroShots(container, dataUrl) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const small = container.clientWidth < 640;
  // Phones draw every second shot with a shorter trail to stay smooth.
  const stride = small ? 2 : 1;
  const copies = small ? 3 : 4; // 1 floor dot + trail copies per shot

  const data = await (await fetch(dataUrl)).json();
  const days = data.meta.days + 1;
  const raw = Uint8Array.from(atob(data.b64), (c) => c.charCodeAt(0));
  const n = Math.floor(data.meta.n / stride);

  const css = getComputedStyle(document.documentElement);
  const token = (name) => new THREE.Color(css.getPropertyValue(name).trim());
  const courtColor = token("--court");

  const renderer = new THREE.WebGLRenderer({ antialias: true }); // throws without WebGL
  const size = () => [container.clientWidth || 800, container.clientHeight || 560];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, small ? 1.5 : 2));
  renderer.setSize(...size());
  renderer.setClearColor(courtColor, 1);
  renderer.domElement.setAttribute("aria-hidden", "true");
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(courtColor, 80, 220);
  const camera = new THREE.PerspectiveCamera(36, size()[0] / size()[1], 0.5, 600);

  /* Court. x = raw_x - 25, z = raw_y - 1 (basket at origin), y = height in feet. */
  const BASE = -5.25;
  const HALF = BASE + 47;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(50, 47),
    // Darker than the painted court so the landed shots read against it.
    new THREE.MeshBasicMaterial({ color: token("--court").multiplyScalar(0.62) }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -0.02, (BASE + HALF) / 2);
  scene.add(floor);
  const lineMat = new THREE.LineBasicMaterial({ color: 0xf3f6fb, transparent: true, opacity: 0.55 });
  const addLine = (pts) => scene.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts.map(([x, z]) => new THREE.Vector3(x, 0.01, z))), lineMat));
  const arc = (cx, cz, r, a0, a1, steps = 64) => {
    const p = [];
    for (let i = 0; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      p.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
    }
    return p;
  };
  addLine([[-25, HALF], [-25, BASE], [25, BASE], [25, HALF], [-25, HALF]]);
  addLine([[-6, BASE], [-6, BASE + 19], [6, BASE + 19], [6, BASE]]);
  addLine(arc(0, BASE + 19, 6, 0, Math.PI));
  const R3 = 22.146;
  const C3 = 21.656;
  const zi = Math.sqrt(R3 * R3 - C3 * C3);
  const a3 = Math.atan2(zi, C3);
  addLine([[-C3, BASE], [-C3, zi], ...arc(0, 0, R3, Math.PI - a3, a3, 96).slice(1), [C3, BASE]]);
  addLine(arc(0, HALF, 6, Math.PI, 2 * Math.PI));
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.75, 0.07, 8, 40),
    new THREE.MeshBasicMaterial({ color: 0xf3f6fb }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.set(0, 10, 0);
  scene.add(rim);
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 3.5),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, side: THREE.DoubleSide }),
  );
  board.position.set(0, 11.4, -1.25);
  scene.add(board);
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(board.geometry), lineMat);
  edge.position.copy(board.position);
  scene.add(edge);

  /* Shots: 4 bytes each = x (ft), y + 2 (ft), day index, is_three. */
  const shot = new Float32Array(n * copies * 4);
  const copy = new Float32Array(n * copies);
  const jit = new Float32Array(n * copies);
  for (let i = 0; i < n; i++) {
    const o = i * stride * 4;
    const j = Math.random();
    const launch = ((raw[o + 2] + j) / days) * SEASON_SECONDS;
    for (let c = 0; c < copies; c++) {
      const k = i * copies + c;
      shot[k * 4] = raw[o] - 25;
      shot[k * 4 + 1] = raw[o + 1] - 3;
      shot[k * 4 + 2] = launch;
      shot[k * 4 + 3] = raw[o + 3];
      copy[k] = c;
      jit[k] = j;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * copies * 3), 3));
  geo.setAttribute("aShot", new THREE.BufferAttribute(shot, 4));
  geo.setAttribute("aCopy", new THREE.BufferAttribute(copy, 1));
  geo.setAttribute("aJit", new THREE.BufferAttribute(jit, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 18), 200);
  const uniforms = {
    uTime: { value: 0 },
    uFlight: { value: FLIGHT },
    uFade: { value: 1 },
    uScale: { value: 1 },
    // Same code as the rest of the page: blue = 2-point, orange = 3-point.
    uTwo: { value: new THREE.Color(0x5b9cf0) },
    uThree: { value: new THREE.Color(0xf2814f) },
    uFloor: { value: stride > 1 ? 1.6 : 1 }, // brighter floor dots when subsampled
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute vec4 aShot; attribute float aCopy; attribute float aJit;
      uniform float uTime, uFlight, uFade, uScale, uFloor;
      uniform vec3 uTwo, uThree;
      varying vec3 vColor; varying float vAlpha;
      void main(){
        vColor = aShot.w > 0.5 ? uThree : uTwo;
        vec3 p = vec3(0.0); float size = 0.0; vAlpha = 0.0;
        vec3 start = vec3(aShot.x, 6.6, aShot.y);
        if (aCopy < 0.5) {
          float age = uTime - aShot.z - uFlight;
          if (age > 0.0) {
            p = vec3(aShot.x + (aJit - 0.5), 0.06, aShot.y + (fract(aJit * 91.7) - 0.5));
            size = 0.46;
            vAlpha = (0.42 + 0.5 * exp(-age * 2.5)) * uFloor;
          }
        } else {
          float t = (uTime - aShot.z) / uFlight - (aCopy - 1.0) * 0.05;
          if (t >= 0.0 && t <= 1.0) {
            float apex = 2.5 + length(start.xz) * 0.22;
            p = mix(start, vec3(0.0, 10.15, 0.0), t);
            p.y += apex * 4.0 * t * (1.0 - t);
            size = 0.55 - (aCopy - 1.0) * 0.13;
            vAlpha = 1.0 - (aCopy - 1.0) * 0.3;
          }
        }
        vAlpha *= uFade;
        if (vAlpha <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = max(1.5, size * uScale / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vColor; varying float vAlpha;
      void main(){
        float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
        gl_FragColor = vec4(vColor * a * vAlpha, a * vAlpha);
      }`,
  });
  scene.add(new THREE.Points(geo, material));

  /* Camera: looks down the court at the basket and drifts slowly side to side.
     The target sits above the floor so the court lands in the lower part of the
     frame, leaving the top of the hero for the title. */
  const target = new THREE.Vector3(0, 15, 15);
  const elevation = 0.5;
  function placeCamera(seconds) {
    const [w, h] = size();
    const aspect = w / h;
    const hfov = 2 * Math.atan(Math.tan((camera.fov * Math.PI) / 360) * aspect);
    // Far enough back that the 50 ft court width always fits.
    const dist = Math.max(66, 34 / Math.tan(hfov / 2));
    const az = reduceMotion ? 0.3 : Math.sin(seconds * 0.07) * 0.5;
    camera.position.set(
      target.x + dist * Math.sin(az) * Math.cos(elevation),
      target.y + dist * Math.sin(elevation),
      target.z + dist * Math.cos(az) * Math.cos(elevation),
    );
    camera.lookAt(target);
    scene.fog.near = dist * 1.1;
    scene.fog.far = dist * 3.2;
  }
  function resize() {
    const [w, h] = size();
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    uniforms.uScale.value = (h * renderer.getPixelRatio()) / 2;
  }
  resize();
  new ResizeObserver(resize).observe(container);

  const end = SEASON_SECONDS + FLIGHT + 1;
  if (reduceMotion) {
    // No motion: show the finished shot map as a still image.
    uniforms.uTime.value = end + 10;
    placeCamera(0);
    renderer.render(scene, camera);
    new ResizeObserver(() => { placeCamera(0); renderer.render(scene, camera); }).observe(container);
    return;
  }

  let visible = true;
  new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; }, { threshold: 0.02 }).observe(container);
  let clock = 0; // seconds within the current loop
  let wall = 0;  // seconds of total running time, for the camera drift
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (visible && !document.hidden) {
      clock += dt;
      wall += dt;
      if (clock > end + HOLD + FADE) clock = 0;
      uniforms.uTime.value = clock;
      uniforms.uFade.value = clock > end + HOLD ? 1 - (clock - end - HOLD) / FADE : 1;
      placeCamera(wall);
      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
