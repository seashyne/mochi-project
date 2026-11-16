// Scene builder for the landing hero plate and game-card thumbnails.
// Loaded by scripts/render-landing-art.html inside headless Chromium.

import * as THREE from 'three';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

window.renderScene = function (cfg) {
  return new Promise((resolve, reject) => {
    const canvas = document.getElementById('c');
    canvas.width = cfg.width;
    canvas.height = cfg.height;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(cfg.width, cfg.height, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = cfg.exposure;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(cfg.fog, cfg.fogNear, cfg.fogFar);
    scene.background = new THREE.Color(cfg.fog);

    const camera = new THREE.PerspectiveCamera(cfg.fov, cfg.width / cfg.height, 0.1, 400);
    camera.position.set(cfg.camera.x, cfg.camera.y, cfg.camera.z);
    camera.lookAt(cfg.look.x, cfg.look.y, cfg.look.z);

    const build = (env) => {
      if (env) {
        scene.environment = env;
        scene.background = env;
      }

      const hemi = new THREE.HemisphereLight(0xdfefff, 0x3d4a35, 1.15);
      scene.add(hemi);

      const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
      sun.position.set(-14, 22, 12);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.camera.left = -40;
      sun.shadow.camera.right = 40;
      sun.shadow.camera.top = 40;
      sun.shadow.camera.bottom = -40;
      sun.shadow.camera.far = 90;
      scene.add(sun);

      const rim = new THREE.DirectionalLight(0xbcd8ff, 0.9);
      rim.position.set(16, 8, -14);
      scene.add(rim);

      // Ground plane with gentle terrain undulation
      const gm = new THREE.MeshStandardMaterial({
        color: cfg.ground,
        roughness: cfg.groundRough,
        metalness: 0.02
      });
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(420, 420, 56, 56), gm);
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      const gp = ground.geometry.attributes.position;
      for (let i = 0; i < gp.count; i++) {
        const x = gp.getX(i);
        const y = gp.getY(i);
        // Undulation fades out near the origin so the camera foreground stays
        // walkable flat lawn instead of rising into a wall.
        const fade = Math.min(1, Math.hypot(x, y) / 90);
        const h = Math.sin(x * 0.07) * 0.9 + Math.cos(y * 0.05) * 0.7 + Math.sin((x + y) * 0.031) * 1.3;
        gp.setZ(i, h * fade);
      }
      ground.geometry.computeVertexNormals();
      scene.add(ground);

      // Rolling hills on the horizon. Kept far behind and wide so they read as a
      // skyline band rather than a wall across the right half of the frame.
      for (let i = 0; i < 7; i++) {
        const hill = new THREE.Mesh(
          new THREE.SphereGeometry(30 + i * 9, 24, 16),
          new THREE.MeshStandardMaterial({ color: cfg.ground, roughness: 1 })
        );
        hill.position.set(-104 + i * 34, -30 - i * 1.2, -104 - i * 14);
        hill.scale.y = 0.36;
        scene.add(hill);
      }

      let seed = 20261113;
      const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

      // Trees
      const trunkGeo = new THREE.CylinderGeometry(0.32, 0.5, 5, 7);
      const leafGeos = [
        new THREE.ConeGeometry(2.5, 5.4, 9),
        new THREE.SphereGeometry(2.5, 10, 8)
      ];
      for (let i = 0; i < cfg.trees; i++) {
        const ang = rnd() * Math.PI * 2;
        // Three depth bands: a close framing row plus two wider rings
        const band = i % 3;
        const dist = band === 0 ? 16 + rnd() * 14 : band === 1 ? 32 + rnd() * 30 : 60 + rnd() * 46;
        const x = Math.cos(ang) * dist;
        const z = Math.sin(ang) * dist - 14;
        // Keep the left third clear so the headline stays legible
        if (x < -9 && z > -26 && z < 16) continue;
        if (Math.abs(x) < 6.5 && z > -20 && z < 10) continue;
        const trunk = new THREE.Mesh(
          trunkGeo,
          new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 0.95 })
        );
        trunk.position.set(x, 2.5, z);
        trunk.castShadow = true;
        scene.add(trunk);
        const leaf = new THREE.Mesh(
          leafGeos[i % 2],
          new THREE.MeshStandardMaterial({
            color: new THREE.Color().setHSL(
              0.27 + rnd() * 0.07,
              0.42 + rnd() * 0.2,
              0.24 + rnd() * 0.14
            ),
            roughness: 0.9
          })
        );
        leaf.position.set(x, 6.4 + rnd() * 3.2, z);
        leaf.castShadow = true;
        leaf.scale.setScalar(1.15 + rnd() * 1.05);
        scene.add(leaf);
        // Second canopy layer for a fuller crown
        const leaf2 = new THREE.Mesh(
          leafGeos[(i + 1) % 2],
          new THREE.MeshStandardMaterial({
            color: new THREE.Color().setHSL(
              0.26 + rnd() * 0.08,
              0.45 + rnd() * 0.2,
              0.2 + rnd() * 0.12
            ),
            roughness: 0.9
          })
        );
        leaf2.position.set(x + (rnd() - 0.5) * 1.6, 9.4 + rnd() * 2.6, z + (rnd() - 0.5) * 1.6);
        leaf2.castShadow = true;
        leaf2.scale.setScalar(0.85 + rnd() * 0.8);
        scene.add(leaf2);
      }

      // Rocks
      const rockGeo = new THREE.DodecahedronGeometry(1, 0);
      for (let i = 0; i < cfg.rocks; i++) {
        const ang = rnd() * Math.PI * 2;
        const dist = 10 + rnd() * 40;
        const rock = new THREE.Mesh(
          rockGeo,
          new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.95 })
        );
        rock.position.set(Math.cos(ang) * dist, rnd() * 0.4, Math.sin(ang) * dist - 8);
        rock.scale.set(0.8 + rnd() * 2.2, 0.5 + rnd() * 1.4, 0.8 + rnd() * 2.2);
        rock.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
        rock.castShadow = true;
        rock.receiveShadow = true;
        scene.add(rock);
      }

      // Grass tufts: cheap cones that break up the flat lawn.
      const tuftGeo = new THREE.ConeGeometry(0.34, 1.5, 4);
      for (let i = 0; i < 60; i++) {
        const ang = rnd() * Math.PI * 2, dist = 8 + rnd() * 34;
        const tuft = new THREE.Mesh(tuftGeo, new THREE.MeshStandardMaterial({
          color: new THREE.Color().setHSL(0.26 + rnd() * 0.06, 0.5, 0.3 + rnd() * 0.12), roughness: 0.95
        }));
        tuft.position.set(Math.cos(ang) * dist, 0.7, Math.sin(ang) * dist - 8);
        tuft.scale.setScalar(0.7 + rnd() * 1.1);
        tuft.castShadow = true;
        scene.add(tuft);
      }

      // Floating platforms
      if (cfg.platforms) {
        for (let i = 0; i < 7; i++) {
          const px = -13 + i * 4.4 + rnd() * 1.6;
          const py = 2.2 + Math.sin(i * 0.9) * 2.4 + i * 0.55;
          const pz = -6 - i * 2.1 + rnd() * 2;
          const accent = cfg.neon
            ? [0x00e5ff, 0xff3ea5, 0x7c4dff][i % 3]
            : [0xff7a3d, 0x3ddc97, 0x4dabf7][i % 3];
          const plat = new THREE.Mesh(
            new THREE.BoxGeometry(3.4, 0.55, 3.4),
            new THREE.MeshStandardMaterial({ color: accent, roughness: 0.45, metalness: 0.25 })
          );
          plat.position.set(px, py, pz);
          plat.castShadow = true;
          plat.receiveShadow = true;
          scene.add(plat);
          const glow = new THREE.Mesh(
            new THREE.BoxGeometry(3.6, 0.1, 3.6),
            new THREE.MeshBasicMaterial({
              color: accent,
              transparent: true,
              opacity: cfg.neon ? 0.85 : 0.4
            })
          );
          glow.position.set(px, py - 0.32, pz);
          scene.add(glow);
        }
      }

      // Blocky avatar seen from behind
      if (cfg.character) {
        const mk = (w, h, d, color) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
            new THREE.MeshStandardMaterial({ color, roughness: 0.72 }));
          m.castShadow = true; m.receiveShadow = true; return m;
        };
        const root = new THREE.Group();
        const torso = mk(1.35, 1.5, 0.85, 0x1f2733); torso.position.y = 2.35; root.add(torso);
        const head = mk(1.05, 1.05, 1.0, 0xf0c9a4); head.position.y = 3.62; root.add(head);
        const hairM = mk(1.14, 0.55, 1.08, 0x2b2118); hairM.position.y = 4.05; root.add(hairM);
        const bun = mk(0.62, 0.52, 0.62, 0x2b2118); bun.position.y = 4.5; root.add(bun);
        const armL = mk(0.5, 1.35, 0.6, 0x1f2733); armL.position.set(-0.92, 2.35, 0); armL.rotation.z = 0.12; root.add(armL);
        const armR = mk(0.5, 1.35, 0.6, 0x1f2733); armR.position.set(0.92, 2.35, 0); armR.rotation.z = -0.12; root.add(armR);
        const legL = mk(0.62, 1.25, 0.72, 0x2b3444); legL.position.set(-0.35, 1.18, 0); root.add(legL);
        const legR = mk(0.62, 1.25, 0.72, 0x2b3444); legR.position.set(0.35, 1.18, 0); root.add(legR);
        root.position.set(4.6, 0, -3.2);
        root.rotation.y = Math.PI + 0.12;
        scene.add(root);
      }

      // Cinematic grade: vignette plus a gentle tone curve
      const rt = new THREE.WebGLRenderTarget(cfg.width, cfg.height, { type: THREE.UnsignedByteType });
      renderer.setRenderTarget(rt);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);

      // Render straight to the default framebuffer, then grade on a 2D canvas.
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);

      const mainUrl = renderer.domElement.toDataURL('image/jpeg', 0.92);
      const grade = (sourceUrl) => new Promise((done) => {
        const img = new Image();
        img.onload = () => {
          const c2 = document.createElement('canvas');
          c2.width = cfg.width;
          c2.height = cfg.height;
          const ctx = c2.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const grad = ctx.createRadialGradient(
            cfg.width / 2, cfg.height / 2, Math.min(cfg.width, cfg.height) * 0.28,
            cfg.width / 2, cfg.height / 2, Math.max(cfg.width, cfg.height) * 0.72
          );
          grad.addColorStop(0, 'rgba(0,0,0,0)');
          grad.addColorStop(1, 'rgba(0,0,0,0.5)');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, cfg.width, cfg.height);
          done(c2.toDataURL('image/jpeg', 0.92));
        };
        img.onerror = () => done(sourceUrl);
        img.src = sourceUrl;
      });
      grade(mainUrl).then(resolve);

      renderer.dispose();
    };

    if (cfg.hdriUrl) {
      new EXRLoader().load(cfg.hdriUrl, build, undefined, (err) => reject(String(err)));
    } else {
      build(null);
    }
  });
};

window.__ready = true;
