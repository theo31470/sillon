import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * Scène de la page de maintenance : un tracteur à l'atelier en plein champ, au
 * crépuscule. Capot ouvert, roue avant démontée, cric sous l'essieu, gyrophare qui
 * balaie le sol, lampe de chantier, outils holographiques au-dessus du moteur.
 * Tout est construit en code (aucun fichier 3D à télécharger).
 */

const C = {
  paint: 0xdc7a45,
  paintDark: 0xb8643c,
  dark: 0x2a2622,
  darker: 0x171513,
  tire: 0x1a1817,
  rim: 0xeadfc8,
  chrome: 0xd9d6d0,
  soil: 0x4a2f22,
  skyTop: 0x0f1530,
  skyMid: 0x4b3a63,
  horizon: 0xf09a62,
  amber: 0xffa53a,
  wheat: 0xd9b46a,
};

type Opts = { reducedMotion: boolean; onReady?: () => void };

export function createMaintenanceScene(canvas: HTMLCanvasElement, opts: Opts) {
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, small ? 1.5 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x7a4f5c, 40, 190);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.35;

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 600);
  const disposables: { dispose: () => void }[] = [envTex, pmrem];
  const track = <T extends { dispose: () => void }>(o: T) => {
    disposables.push(o);
    return o;
  };

  // ── Matériaux ───────────────────────────────────────────────────────
  const m = {
    paint: track(new THREE.MeshPhysicalMaterial({ color: C.paint, roughness: 0.38, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.18, side: THREE.DoubleSide })),
    dark: track(new THREE.MeshStandardMaterial({ color: C.dark, roughness: 0.62, metalness: 0.35 })),
    darker: track(new THREE.MeshStandardMaterial({ color: C.darker, roughness: 0.8, metalness: 0.2 })),
    tire: track(new THREE.MeshStandardMaterial({ color: C.tire, roughness: 0.95, metalness: 0 })),
    rim: track(new THREE.MeshStandardMaterial({ color: C.rim, roughness: 0.42, metalness: 0.35 })),
    chrome: track(new THREE.MeshStandardMaterial({ color: C.chrome, roughness: 0.18, metalness: 1 })),
    glass: track(new THREE.MeshPhysicalMaterial({ color: 0x5f8797, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.2, envMapIntensity: 0.7, side: THREE.DoubleSide })),
    headlight: track(new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xfff1d6, emissiveIntensity: 2.4 })),
    beacon: track(new THREE.MeshStandardMaterial({ color: C.amber, emissive: C.amber, emissiveIntensity: 3, transparent: true, opacity: 0.9 })),
    lamp: track(new THREE.MeshStandardMaterial({ color: 0xfff4dd, emissive: 0xffe2b0, emissiveIntensity: 4 })),
    red: track(new THREE.MeshStandardMaterial({ color: 0xb33a2c, roughness: 0.45, metalness: 0.3 })),
    cone: track(new THREE.MeshStandardMaterial({ color: 0xff6a1f, roughness: 0.55 })),
    white: track(new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.5 })),
    holo: track(new THREE.MeshStandardMaterial({ color: C.paint, emissive: C.paint, emissiveIntensity: 0.8, roughness: 0.3, metalness: 0.6, transparent: true, opacity: 0.92 })),
    engine: track(new THREE.MeshStandardMaterial({ color: 0x3b3833, roughness: 0.5, metalness: 0.7 })),
  };
  const shadow = (o: THREE.Object3D) => {
    o.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });
    return o;
  };
  const rbox = (w: number, h: number, d: number, r: number, mat: THREE.Material) => new THREE.Mesh(track(new RoundedBoxGeometry(w, h, d, 3, r)), mat);
  const box = (w: number, h: number, d: number, mat: THREE.Material) => new THREE.Mesh(track(new THREE.BoxGeometry(w, h, d)), mat);
  const cyl = (rt: number, rb: number, h: number, seg: number, mat: THREE.Material, open = false) => new THREE.Mesh(track(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open)), mat);

  // ── Ciel : dégradé crépusculaire, soleil bas et étoiles ──────────────
  const sky = new THREE.Mesh(
    track(new THREE.SphereGeometry(420, 48, 24)),
    track(
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { top: { value: new THREE.Color(C.skyTop) }, mid: { value: new THREE.Color(C.skyMid) }, horizon: { value: new THREE.Color(C.horizon) }, sunDir: { value: new THREE.Vector3(-0.9, 0.025, -0.45).normalize() } },
        vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `
          uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 sunDir; varying vec3 vDir;
          void main(){
            float h = clamp(vDir.y, -0.2, 1.0);
            vec3 col = mix(horizon, mid, smoothstep(0.0, 0.22, h));
            col = mix(col, top, smoothstep(0.18, 0.75, h));
            float s = max(dot(normalize(vDir), sunDir), 0.0);
            col += vec3(1.0, 0.62, 0.32) * pow(s, 18.0) * 0.35 + vec3(1.0, 0.8, 0.55) * pow(s, 1400.0) * 1.6;
            if (h < 0.0) col = mix(horizon * 0.55, col, smoothstep(-0.2, 0.0, h));
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    ),
  );
  scene.add(sky);

  const starGeo = track(new THREE.BufferGeometry());
  const starPos: number[] = [];
  for (let i = 0; i < 900; i++) {
    const theta = Math.random() * Math.PI * 2;
    const y = 0.25 + Math.random() * 0.75;
    const r = Math.sqrt(1 - y * y);
    starPos.push(Math.cos(theta) * r * 400, y * 400, Math.sin(theta) * r * 400);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  const starMat = track(new THREE.PointsMaterial({ color: 0xfff6e8, size: 1.3, sizeAttenuation: false, transparent: true, opacity: 0.8, fog: false, depthWrite: false }));
  scene.add(new THREE.Points(starGeo, starMat));

  // ── Lumières ─────────────────────────────────────────────────────────
  scene.add(new THREE.HemisphereLight(0x9aa8dc, 0x4a2c1c, 0.95));
  const sun = new THREE.DirectionalLight(0xffb27a, 3.4);
  sun.position.set(-26, 9, -18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
  sun.shadow.camera.left = -9;
  sun.shadow.camera.right = 9;
  sun.shadow.camera.top = 9;
  sun.shadow.camera.bottom = -9;
  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x8fa2ff, 1.4);
  rim.position.set(14, 6, 16);
  scene.add(rim);

  // ── Sol : champ labouré, sillons jusqu'à l'horizon ───────────────────
  const groundGeo = track(new THREE.PlaneGeometry(260, 260, 260, 260));
  groundGeo.rotateX(-Math.PI / 2);
  const gp = groundGeo.attributes.position as THREE.BufferAttribute;
  const colors: number[] = [];
  const soil = new THREE.Color(C.soil);
  const tmp = new THREE.Color();
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i);
    const z = gp.getZ(i);
    const d = Math.hypot(x - 0.4, z * 1.25);
    // Cour de ferme aplanie autour du tracteur, sillons au-delà.
    const furrowAmp = THREE.MathUtils.smoothstep(d, 5.5, 9);
    const ridge = Math.sin(z * 2.2) * 0.13 * furrowAmp;
    const noise = (Math.sin(x * 1.7 + z * 0.9) + Math.sin(x * 0.31 - z * 0.47)) * 0.05;
    gp.setY(i, ridge + noise * furrowAmp);
    const shade = 0.78 + Math.sin(z * 2.2 + 1.2) * 0.12 * furrowAmp + (Math.random() - 0.5) * 0.08;
    tmp.copy(soil).multiplyScalar(shade);
    if (furrowAmp < 1) tmp.lerp(new THREE.Color(0x5a4234), (1 - furrowAmp) * 0.6);
    colors.push(tmp.r, tmp.g, tmp.b);
  }
  groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  groundGeo.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeo, track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 })));
  ground.receiveShadow = true;
  scene.add(ground);

  // Chaumes dorées sur les crêtes (instanciées).
  const stubbleGeo = track(new THREE.CylinderGeometry(0.008, 0.014, 0.22, 4));
  stubbleGeo.translate(0, 0.11, 0);
  const STUBBLE = small ? 1200 : 2400;
  const stubble = new THREE.InstancedMesh(stubbleGeo, track(new THREE.MeshStandardMaterial({ color: 0x9b7b48, roughness: 0.95 })), STUBBLE);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < STUBBLE; i++) {
    let x = 0;
    let z = 0;
    do {
      x = (Math.random() - 0.5) * 44;
      z = Math.round(((Math.random() - 0.5) * 44 * 2.2) / (Math.PI * 2)) * ((Math.PI * 2) / 2.2) + Math.PI / 4.4;
    } while (Math.hypot(x - 0.4, z * 1.25) < 8.5);
    dummy.position.set(x, 0.1, z);
    dummy.rotation.set((Math.random() - 0.5) * 0.5, Math.random() * Math.PI, (Math.random() - 0.5) * 0.5);
    dummy.scale.set(1, 0.4 + Math.random() * 0.6, 1);
    dummy.updateMatrix();
    stubble.setMatrixAt(i, dummy.matrix);
  }
  stubble.receiveShadow = true;
  scene.add(stubble);

  // Collines et rangée de peupliers en silhouette.
  const hillMat = track(new THREE.MeshStandardMaterial({ color: 0x2b2030, roughness: 1 }));
  for (const [x, z, sx, sy] of [
    [-60, -120, 70, 9],
    [40, -140, 90, 13],
    [120, -90, 60, 8],
    [-130, -40, 60, 10],
  ]) {
    const hill = new THREE.Mesh(track(new THREE.SphereGeometry(1, 24, 12)), hillMat);
    hill.scale.set(sx, sy, sx * 0.5);
    hill.position.set(x, -1, z);
    scene.add(hill);
  }
  const treeMat = track(new THREE.MeshStandardMaterial({ color: 0x1d1a22, roughness: 1 }));
  const treeGeo = track(new THREE.ConeGeometry(1, 1, 7));
  for (let i = 0; i < 26; i++) {
    const t = new THREE.Mesh(treeGeo, treeMat);
    const h = 7 + Math.random() * 5;
    t.scale.set(0.9 + Math.random() * 0.5, h, 0.9);
    t.position.set(-90 + i * 7 + Math.random() * 3, h / 2 - 0.3, -95 - Math.random() * 6);
    scene.add(t);
  }

  // ── Le tracteur ──────────────────────────────────────────────────────
  const tractor = new THREE.Group();
  scene.add(tractor);
  // Avant soulevé par le cric : léger cabrage.
  tractor.rotation.z = 0.035;
  tractor.position.y = 0.06;

  const chassis = rbox(3.2, 0.42, 0.86, 0.06, m.dark);
  chassis.position.set(0.25, 0.78, 0);
  tractor.add(chassis);

  // Capot (corps) + couvercle ouvert.
  const hoodBody = rbox(1.95, 0.6, 0.96, 0.12, m.paint);
  hoodBody.position.set(1.12, 1.24, 0);
  tractor.add(hoodBody);
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0.18, 1.56, 0);
  lidPivot.rotation.z = 0.62;
  const lid = rbox(1.95, 0.09, 1.0, 0.04, m.paint);
  lid.position.set(0.97, 0, 0);
  lidPivot.add(lid);
  const strut = cyl(0.015, 0.015, 0.9, 8, m.chrome);
  strut.position.set(0.95, -0.35, 0.36);
  strut.rotation.z = -0.62;
  lidPivot.add(strut);
  tractor.add(lidPivot);

  // Moteur visible dans le compartiment.
  const engine = new THREE.Group();
  const block = rbox(1.25, 0.32, 0.6, 0.05, m.engine);
  block.position.set(1.05, 1.62, 0);
  engine.add(block);
  for (let i = 0; i < 6; i++) {
    const head = cyl(0.06, 0.06, 0.12, 12, m.chrome);
    head.position.set(0.55 + i * 0.2, 1.82, 0.12);
    engine.add(head);
    const pipe = cyl(0.025, 0.025, 0.26, 8, m.dark);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(0.55 + i * 0.2, 1.74, -0.22);
    engine.add(pipe);
  }
  const filter = cyl(0.13, 0.13, 0.42, 20, m.darker);
  filter.rotation.x = Math.PI / 2;
  filter.position.set(1.7, 1.7, -0.18);
  engine.add(filter);
  tractor.add(engine);

  // Calandre et phares.
  const grille = box(0.06, 0.52, 0.8, m.darker);
  grille.position.set(2.11, 1.22, 0);
  tractor.add(grille);
  for (let i = 0; i < 6; i++) {
    const slat = box(0.03, 0.025, 0.76, m.chrome);
    slat.position.set(2.15, 1.02 + i * 0.08, 0);
    tractor.add(slat);
  }
  for (const z of [-0.33, 0.33]) {
    const hl = rbox(0.06, 0.1, 0.22, 0.02, m.headlight);
    hl.position.set(2.15, 1.44, z);
    tractor.add(hl);
  }

  // Échappement.
  const exhaust = cyl(0.055, 0.055, 1.25, 16, m.chrome);
  exhaust.position.set(1.55, 2.05, 0.36);
  tractor.add(exhaust);
  const cap = cyl(0.065, 0.065, 0.12, 16, m.dark);
  cap.position.set(1.55, 2.7, 0.36);
  cap.rotation.z = 0.35;
  tractor.add(cap);

  // Cabine.
  const cab = new THREE.Group();
  cab.position.set(-0.68, 0, 0);
  const floor = rbox(1.5, 0.12, 1.22, 0.04, m.dark);
  floor.position.set(0, 1.08, 0);
  cab.add(floor);
  const lowerCab = rbox(1.5, 0.36, 1.22, 0.06, m.paint);
  lowerCab.position.set(0, 1.28, 0);
  cab.add(lowerCab);
  for (const [x, z] of [
    [0.7, 0.57],
    [0.7, -0.57],
    [-0.7, 0.57],
    [-0.7, -0.57],
  ]) {
    const post = rbox(0.07, 1.36, 0.07, 0.02, m.darker);
    post.position.set(x, 2.12, z);
    cab.add(post);
  }
  const glassFront = box(0.02, 1.3, 1.1, m.glass);
  glassFront.position.set(0.72, 2.12, 0);
  glassFront.rotation.z = -0.06;
  const glassBack = box(0.02, 1.3, 1.1, m.glass);
  glassBack.position.set(-0.72, 2.12, 0);
  const glassSide1 = box(1.38, 1.3, 0.02, m.glass);
  glassSide1.position.set(0, 2.12, 0.58);
  const glassSide2 = glassSide1.clone();
  glassSide2.position.z = -0.58;
  cab.add(glassFront, glassBack, glassSide1, glassSide2);
  const roof = rbox(1.72, 0.14, 1.36, 0.06, m.paint);
  roof.position.set(0.05, 2.86, 0);
  cab.add(roof);
  const roofTop = rbox(1.4, 0.05, 1.1, 0.02, m.rim);
  roofTop.position.set(0.02, 2.95, 0);
  cab.add(roofTop);
  // Volant et siège visibles à travers les vitres.
  const wheel = new THREE.Mesh(track(new THREE.TorusGeometry(0.17, 0.018, 8, 24)), m.darker);
  wheel.position.set(0.42, 1.95, 0);
  wheel.rotation.set(0, Math.PI / 2, 0.5);
  cab.add(wheel);
  const column = cyl(0.025, 0.025, 0.5, 8, m.darker);
  column.position.set(0.52, 1.72, 0);
  column.rotation.z = 0.5;
  cab.add(column);
  const seat = rbox(0.42, 0.12, 0.46, 0.05, m.darker);
  seat.position.set(-0.15, 1.62, 0);
  const seatBack = rbox(0.1, 0.5, 0.46, 0.04, m.darker);
  seatBack.position.set(-0.38, 1.88, 0);
  cab.add(seat, seatBack);
  // Rétroviseurs.
  for (const z of [0.78, -0.78]) {
    const arm = cyl(0.012, 0.012, 0.32, 6, m.darker);
    arm.rotation.x = Math.PI / 2;
    arm.position.set(0.68, 2.6, z * 0.9);
    const mirror = rbox(0.04, 0.22, 0.13, 0.02, m.darker);
    mirror.position.set(0.68, 2.5, z);
    cab.add(arm, mirror);
  }
  tractor.add(cab);

  // Gyrophare de chantier sur le toit, avec son faisceau tournant.
  const beaconBase = cyl(0.1, 0.12, 0.06, 20, m.darker);
  beaconBase.position.set(-0.98, 3.0, 0.38);
  const beaconDome = new THREE.Mesh(track(new THREE.SphereGeometry(0.1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2)), m.beacon);
  beaconDome.position.set(-0.98, 3.03, 0.38);
  tractor.add(beaconBase, beaconDome);
  const beaconRotor = new THREE.Group();
  beaconRotor.position.set(-0.98, 3.07, 0.38);
  tractor.add(beaconRotor);
  const beam = new THREE.SpotLight(C.amber, small ? 90 : 120, 30, 0.42, 0.65, 1.6);
  beam.position.set(0, 0, 0);
  const beamTarget = new THREE.Object3D();
  beamTarget.position.set(6, -3.2, 0);
  beaconRotor.add(beam, beamTarget);
  beam.target = beamTarget;
  const beaconGlow = new THREE.PointLight(C.amber, 2.5, 6, 2);
  beaconGlow.position.set(-0.98, 3.2, 0.38);
  tractor.add(beaconGlow);

  // Garde-boue arrière.
  for (const z of [0.82, -0.82]) {
    const fender = new THREE.Mesh(track(new THREE.CylinderGeometry(1.03, 1.03, 0.62, 40, 1, true, Math.PI * 0.42, Math.PI * 1.02)), m.paint);
    fender.rotation.x = Math.PI / 2;
    fender.position.set(-0.78, 0.96, z);
    tractor.add(fender);
  }

  // Roues : pneu, crampons en chevron, jante, moyeu, écrous.
  function makeWheel(radius: number, width: number, lugCount: number) {
    const g = new THREE.Group();
    const tire = cyl(radius, radius, width, 48, m.tire);
    tire.rotation.x = Math.PI / 2;
    g.add(tire);
    const sidewall = new THREE.Mesh(track(new THREE.TorusGeometry(radius - width * 0.18, width * 0.2, 10, 48)), m.tire);
    sidewall.position.z = width / 2 - width * 0.12;
    const sidewall2 = sidewall.clone();
    sidewall2.position.z = -sidewall.position.z;
    g.add(sidewall, sidewall2);
    const lugGeo = track(new THREE.BoxGeometry(radius * 0.13, radius * 0.1, width * 0.52));
    const lugs = new THREE.InstancedMesh(lugGeo, m.tire, lugCount * 2);
    const d = new THREE.Object3D();
    for (let i = 0; i < lugCount; i++) {
      const a = (i / lugCount) * Math.PI * 2;
      for (const side of [-1, 1]) {
        d.position.set(Math.cos(a) * (radius + radius * 0.035), Math.sin(a) * (radius + radius * 0.035), side * width * 0.24);
        d.rotation.set(0, 0, a);
        d.rotateX(side * 0.5);
        d.updateMatrix();
        lugs.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), d.matrix);
      }
    }
    g.add(lugs);
    const rimMesh = cyl(radius * 0.6, radius * 0.6, width * 1.02, 32, m.rim);
    rimMesh.rotation.x = Math.PI / 2;
    g.add(rimMesh);
    const dish = cyl(radius * 0.5, radius * 0.56, 0.04, 32, m.rim);
    dish.rotation.x = Math.PI / 2;
    dish.position.z = width * 0.52;
    g.add(dish);
    const hub = cyl(radius * 0.17, radius * 0.2, 0.14, 20, m.chrome);
    hub.rotation.x = Math.PI / 2;
    hub.position.z = width * 0.56;
    g.add(hub);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const nut = cyl(0.025, 0.025, 0.05, 6, m.chrome);
      nut.rotation.x = Math.PI / 2;
      nut.position.set(Math.cos(a) * radius * 0.28, Math.sin(a) * radius * 0.28, width * 0.56);
      g.add(nut);
    }
    return shadow(g);
  }
  const rearL = makeWheel(0.92, 0.56, 26);
  rearL.position.set(-0.78, 0.9, 0.82);
  const rearR = makeWheel(0.92, 0.56, 26);
  rearR.position.set(-0.78, 0.9, -0.82);
  rearR.rotation.y = Math.PI;
  const frontR = makeWheel(0.56, 0.36, 18);
  frontR.position.set(1.62, 0.56, -0.66);
  frontR.rotation.y = Math.PI;
  tractor.add(rearL, rearR, frontR);
  // Côté visible : roue avant démontée, moyeu nu.
  const bareHub = cyl(0.14, 0.16, 0.18, 20, m.chrome);
  bareHub.rotation.x = Math.PI / 2;
  bareHub.position.set(1.62, 0.6, 0.55);
  tractor.add(bareHub);
  const axle = cyl(0.07, 0.07, 1.3, 12, m.dark);
  axle.rotation.x = Math.PI / 2;
  axle.position.set(1.62, 0.6, 0);
  tractor.add(axle);

  shadow(tractor);
  // Les vitres ne projettent pas d'ombre.
  for (const g of [glassFront, glassBack, glassSide1, glassSide2]) g.castShadow = false;

  // Roue démontée, posée à plat contre une caisse à outils.
  const looseWheel = makeWheel(0.56, 0.36, 18);
  looseWheel.rotation.set(-Math.PI / 2 + 0.12, 0, 0.2);
  looseWheel.position.set(2.65, 0.2, 1.9);
  scene.add(looseWheel);

  // Cric hydraulique sous l'essieu avant.
  const jack = new THREE.Group();
  const jackBase = rbox(0.5, 0.12, 0.3, 0.03, m.red);
  jackBase.position.y = 0.08;
  const jackBody = cyl(0.08, 0.1, 0.3, 16, m.red);
  jackBody.position.y = 0.3;
  const jackRam = cyl(0.05, 0.05, 0.22, 16, m.chrome);
  jackRam.position.y = 0.52;
  const jackHandle = cyl(0.015, 0.015, 0.9, 8, m.chrome);
  jackHandle.rotation.z = 1.1;
  jackHandle.position.set(-0.42, 0.28, 0);
  jack.add(jackBase, jackBody, jackRam, jackHandle);
  jack.position.set(1.62, 0, 0.15);
  scene.add(shadow(jack));

  // Caisse à outils.
  const toolbox = new THREE.Group();
  const tbBody = rbox(0.62, 0.32, 0.32, 0.03, m.red);
  tbBody.position.y = 0.17;
  const tbLid = rbox(0.64, 0.06, 0.34, 0.02, m.red);
  tbLid.position.y = 0.36;
  const tbHandle = new THREE.Mesh(track(new THREE.TorusGeometry(0.1, 0.015, 8, 16, Math.PI)), m.darker);
  tbHandle.position.y = 0.39;
  toolbox.add(tbBody, tbLid, tbHandle);
  toolbox.position.set(3.25, 0, 1.05);
  toolbox.rotation.y = -0.4;
  scene.add(shadow(toolbox));

  // Cônes de chantier.
  for (const [x, z] of [
    [3.4, -1.3],
    [-2.4, -2.1],
    [0.9, 2.4],
  ]) {
    const cone = new THREE.Group();
    const base = box(0.38, 0.04, 0.38, m.darker);
    base.position.y = 0.02;
    const body = cyl(0.03, 0.15, 0.55, 24, m.cone);
    body.position.y = 0.31;
    const stripe = cyl(0.075, 0.1, 0.1, 24, m.white);
    stripe.position.y = 0.33;
    cone.add(base, body, stripe);
    cone.position.set(x, 0, z);
    scene.add(shadow(cone));
  }

  // Lampe de chantier sur trépied, braquée sur le moteur.
  const lampStand = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const leg = cyl(0.015, 0.015, 1.6, 6, m.darker);
    const a = (i / 3) * Math.PI * 2;
    leg.position.set(Math.cos(a) * 0.22, 0.78, Math.sin(a) * 0.22);
    leg.rotation.set(Math.sin(a) * 0.28, 0, -Math.cos(a) * 0.28);
    lampStand.add(leg);
  }
  const mast = cyl(0.02, 0.02, 0.9, 8, m.chrome);
  mast.position.y = 1.95;
  const lampHead = rbox(0.34, 0.24, 0.1, 0.03, m.darker);
  lampHead.position.set(0, 2.42, 0);
  const lampFace = box(0.28, 0.18, 0.02, m.lamp);
  lampFace.position.set(0, 2.42, -0.06);
  lampStand.add(mast, lampHead, lampFace);
  lampStand.position.set(3.05, 0, -1.45);
  lampStand.lookAt(1.1, 0, 0);
  scene.add(shadow(lampStand));
  lampFace.castShadow = false;
  const work = new THREE.SpotLight(0xffe6c0, 22, 12, 0.45, 0.6, 1.5);
  work.position.set(3.0, 2.42, -1.35);
  work.target.position.set(1.0, 1.5, 0);
  work.castShadow = !small;
  work.shadow.mapSize.set(1024, 1024);
  scene.add(work, work.target);

  // Lueur chaude dans le compartiment moteur.
  const bayGlow = new THREE.PointLight(0xffb070, 1.4, 3, 2);
  bayGlow.position.set(1.1, 2.0, 0.3);
  scene.add(bayGlow);

  // ── Outils « holographiques » au-dessus du moteur ────────────────────
  function gearShape(teeth: number, rOut: number, rIn: number, rHole: number) {
    const s = new THREE.Shape();
    const step = (Math.PI * 2) / teeth;
    for (let i = 0; i < teeth; i++) {
      const a = i * step;
      const pts = [
        [rIn, a],
        [rOut, a + step * 0.12],
        [rOut, a + step * 0.45],
        [rIn, a + step * 0.57],
      ];
      pts.forEach(([r, t], j) => (i === 0 && j === 0 ? s.moveTo(Math.cos(t) * r, Math.sin(t) * r) : s.lineTo(Math.cos(t) * r, Math.sin(t) * r)));
    }
    s.closePath();
    const hole = new THREE.Path();
    hole.absarc(0, 0, rHole, 0, Math.PI * 2, true);
    s.holes.push(hole);
    return s;
  }
  const extrude = { depth: 0.08, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.015, bevelSegments: 2, curveSegments: 24 };
  const gearBig = new THREE.Mesh(track(new THREE.ExtrudeGeometry(gearShape(12, 0.42, 0.34, 0.14), extrude)), m.holo);
  gearBig.geometry.center();
  const gearSmall = new THREE.Mesh(track(new THREE.ExtrudeGeometry(gearShape(8, 0.26, 0.2, 0.08), extrude)), m.holo);
  gearSmall.geometry.center();
  const wrenchShape = new THREE.Shape();
  wrenchShape.moveTo(-0.07, -0.55);
  wrenchShape.lineTo(0.07, -0.55);
  wrenchShape.lineTo(0.07, 0.28);
  wrenchShape.absarc(0, 0.42, 0.17, -Math.PI / 2 + 0.42, Math.PI * 0.18, false);
  wrenchShape.lineTo(0.05, 0.47);
  wrenchShape.lineTo(0.05, 0.38);
  wrenchShape.lineTo(-0.05, 0.38);
  wrenchShape.lineTo(-0.05, 0.47);
  wrenchShape.absarc(0, 0.42, 0.17, Math.PI * 0.82, Math.PI * 1.5 - 0.42, false);
  wrenchShape.lineTo(-0.07, -0.55);
  const wrench = new THREE.Mesh(track(new THREE.ExtrudeGeometry(wrenchShape, { ...extrude, depth: 0.06 })), m.holo);
  wrench.geometry.center();
  const tools = new THREE.Group();
  gearBig.position.set(0, 0, 0);
  gearSmall.position.set(0.55, 0.32, 0.02);
  wrench.position.set(-0.15, 0.05, 0.15);
  wrench.rotation.z = 0.7;
  tools.add(gearBig, gearSmall, wrench);
  tools.position.set(1.15, 3.35, 0.15);
  tools.scale.setScalar(0.85);
  scene.add(tools);
  const toolsLight = new THREE.PointLight(C.paint, 3, 4, 2);
  toolsLight.position.set(1.15, 3.3, 0.6);
  scene.add(toolsLight);

  // ── Particules : poussière dorée et vapeur du moteur ─────────────────
  const soft = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.4, 'rgba(255,255,255,0.45)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    return track(new THREE.CanvasTexture(c));
  })();
  const DUST = small ? 160 : 320;
  const dustGeo = track(new THREE.BufferGeometry());
  const dustPos = new Float32Array(DUST * 3);
  const dustSeed = new Float32Array(DUST);
  for (let i = 0; i < DUST; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 14;
    dustPos[i * 3 + 1] = Math.random() * 4.5;
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * 10;
    dustSeed[i] = Math.random() * 100;
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(
    dustGeo,
    track(new THREE.PointsMaterial({ map: soft, color: 0xffd7a0, size: 0.07, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending })),
  );
  scene.add(dust);

  const STEAM = 26;
  const steamMat = track(new THREE.SpriteMaterial({ map: soft, color: 0xd9cfc4, transparent: true, opacity: 0, depthWrite: false }));
  const steam: { s: THREE.Sprite; life: number; speed: number; drift: number }[] = [];
  for (let i = 0; i < STEAM; i++) {
    const s = new THREE.Sprite(steamMat.clone());
    track(s.material);
    scene.add(s);
    steam.push({ s, life: Math.random(), speed: 0.12 + Math.random() * 0.1, drift: (Math.random() - 0.5) * 0.3 });
  }

  // ── Post-traitement : halo des lumières ──────────────────────────────
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.42, 0.45, 0.9);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // ── Caméra, taille, interaction ──────────────────────────────────────
  const target = new THREE.Vector3(0.55, 1.35, 0);
  let aspect = 1;
  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    aspect = w / h;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.resolution.set(w / 2, h / 2);
    camera.aspect = aspect;
    // Écran en hauteur : on recule pour garder le tracteur en entier.
    camera.fov = aspect < 0.8 ? 52 : aspect < 1.2 ? 42 : 34;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const onMove = (e: PointerEvent) => {
    pointer.tx = (e.clientX / window.innerWidth - 0.5) * 2;
    pointer.ty = (e.clientY / window.innerHeight - 0.5) * 2;
  };
  window.addEventListener('pointermove', onMove, { passive: true });

  function place(t: number) {
    const yaw = 0.62 + Math.sin(t * 0.07) * 0.32 + pointer.x * 0.12;
    const dist = aspect < 0.8 ? 14 : 10.5;
    const height = 3.1 + Math.sin(t * 0.11) * 0.25 - pointer.y * 0.35;
    camera.position.set(target.x + Math.sin(yaw) * dist, height, target.z + Math.cos(yaw) * dist);
    // Sur un écran large, le texte occupe la gauche : on décale le tracteur vers la droite.
    const lookShift = aspect > 1.3 ? Math.min(3.2, (aspect - 1.1) * 3.4) : 0;
    const right = new THREE.Vector3().subVectors(camera.position, target).cross(new THREE.Vector3(0, 1, 0)).normalize();
    camera.lookAt(target.clone().addScaledVector(right, lookShift).add(new THREE.Vector3(0, aspect < 0.8 ? -2.6 : 0, 0)));
  }

  // ── Boucle d'animation ───────────────────────────────────────────────
  const clock = new THREE.Clock();
  let raf = 0;
  let running = true;
  let readySent = false;

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    pointer.x += (pointer.tx - pointer.x) * 0.04;
    pointer.y += (pointer.ty - pointer.y) * 0.04;
    place(t);

    beaconRotor.rotation.y += dt * 3.6;
    const pulse = 0.5 + 0.5 * Math.sin(t * 7.2);
    m.beacon.emissiveIntensity = 2 + pulse * 2.5;
    beaconGlow.intensity = 1.5 + pulse * 3;

    gearBig.rotation.z += dt * 0.6;
    gearSmall.rotation.z -= dt * 0.9;
    wrench.rotation.z = 0.7 + Math.sin(t * 1.3) * 0.25;
    tools.position.y = 3.35 + Math.sin(t * 1.1) * 0.08;
    tools.rotation.y = Math.sin(t * 0.4) * 0.5;
    m.holo.emissiveIntensity = 0.7 + Math.sin(t * 2.2) * 0.2;
    toolsLight.intensity = 1.2 + Math.sin(t * 2.2) * 0.3;

    bayGlow.intensity = 1.3 + Math.sin(t * 13) * 0.15 + Math.sin(t * 5.3) * 0.12;
    starMat.opacity = 0.65 + Math.sin(t * 0.9) * 0.15;

    const p = dustGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < DUST; i++) {
      const s = dustSeed[i];
      p.array[i * 3] += Math.sin(t * 0.3 + s) * 0.002 + 0.0015;
      p.array[i * 3 + 1] += Math.sin(t * 0.5 + s * 1.3) * 0.0015;
      if (p.array[i * 3] > 7) p.array[i * 3] = -7;
    }
    p.needsUpdate = true;

    for (const st of steam) {
      st.life += dt * st.speed;
      if (st.life > 1) {
        st.life = 0;
        st.drift = (Math.random() - 0.5) * 0.3;
      }
      const l = st.life;
      st.s.position.set(1.1 + st.drift * l * 4 + Math.sin(t + l * 6) * 0.05, 1.9 + l * 1.8, 0.1 + st.drift * l * 2);
      st.s.scale.setScalar(0.25 + l * 1.1);
      (st.s.material as THREE.SpriteMaterial).opacity = Math.sin(l * Math.PI) * 0.09;
    }

    composer.render(dt);
    if (!readySent) {
      readySent = true;
      opts.onReady?.();
    }
    if (running && !opts.reducedMotion) raf = requestAnimationFrame(frame);
  }

  function onVisibility() {
    if (document.hidden) {
      running = false;
      cancelAnimationFrame(raf);
    } else if (!running && !opts.reducedMotion) {
      running = true;
      clock.getDelta();
      raf = requestAnimationFrame(frame);
    }
  }
  document.addEventListener('visibilitychange', onVisibility);

  // Mouvement réduit : une seule image, recalculée si la fenêtre change de taille.
  const onResizeStatic = () => opts.reducedMotion && frame();
  window.addEventListener('resize', onResizeStatic);
  frame();

  return () => {
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    window.removeEventListener('resize', onResizeStatic);
    window.removeEventListener('pointermove', onMove);
    document.removeEventListener('visibilitychange', onVisibility);
    composer.dispose();
    for (const d of disposables) d.dispose();
    renderer.dispose();
  };
}
