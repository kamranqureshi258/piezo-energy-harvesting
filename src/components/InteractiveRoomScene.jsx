import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Lightbulb } from 'lucide-react';
import { soundSynth } from '../utils/audioSynth';

export default function InteractiveRoomScene({
  brightness = 50,
  onBrightnessChange,
  vCap = 3.5,
  weather = 'sunny',
  hour = 12,
  pulse = 0,
  steps = 0,
  onHourChange,
  manualOverride = false,
  onToggleManualOverride,
  onStompTile,
}) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const sunLightRef = useRef(null);
  const spotLightsRef = useRef([]);
  const bulbsRef = useRef([]);
  const pedestriansRef = useRef([]);
  const tilesRef = useRef([]);
  const ripplesRef = useRef([]);

  const isNight = hour < 6 || hour >= 19;
  const prevStepsRef = useRef(steps);

  // Helper to create High-Detail Anatomical 3D Human Pedestrian Character Model
  const createRealisticHuman = () => {
    const pGroup = new THREE.Group();

    const skinTones = [0xf5d0c5, 0xe0ac69, 0xc68642, 0x8d5524, 0x523318];
    const shirtColors = [0x1e3a8a, 0x991b1b, 0x065f46, 0x374151, 0x5b21b6, 0x92400e];
    const pantsColors = [0x1e293b, 0x334155, 0x1e1b4b, 0x451a03];
    const hairColors = [0x0f172a, 0x451a03, 0x78350f, 0xd97706];

    const skinColor = skinTones[Math.floor(Math.random() * skinTones.length)];
    const shirtColor = shirtColors[Math.floor(Math.random() * shirtColors.length)];
    const pantsColor = pantsColors[Math.floor(Math.random() * pantsColors.length)];
    const hairColor = hairColors[Math.floor(Math.random() * hairColors.length)];

    const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.5 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.45 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.6 });
    const hairMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.8 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2 });

    // Head
    const headGeo = new THREE.SphereGeometry(0.16, 24, 24);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 1.72;
    head.castShadow = true;
    pGroup.add(head);

    // Hair Style
    const hairGeo = new THREE.SphereGeometry(0.17, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const hair = new THREE.Mesh(hairGeo, hairMat);
    hair.position.set(0, 1.74, 0);
    pGroup.add(hair);

    // Neck
    const neckGeo = new THREE.CylinderGeometry(0.06, 0.07, 0.12, 16);
    const neck = new THREE.Mesh(neckGeo, skinMat);
    neck.position.y = 1.56;
    pGroup.add(neck);

    // Torso / Jacket
    const chestGeo = new THREE.BoxGeometry(0.42, 0.5, 0.24);
    const chest = new THREE.Mesh(chestGeo, shirtMat);
    chest.position.y = 1.25;
    chest.castShadow = true;
    pGroup.add(chest);

    const waistGeo = new THREE.BoxGeometry(0.38, 0.22, 0.22);
    const waist = new THREE.Mesh(waistGeo, shirtMat);
    waist.position.y = 0.94;
    waist.castShadow = true;
    pGroup.add(waist);

    // Left & Right Arms
    const armGeo = new THREE.CylinderGeometry(0.055, 0.045, 0.52, 16);

    const leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(-0.25, 1.45, 0);
    const leftArmMesh = new THREE.Mesh(armGeo, shirtMat);
    leftArmMesh.position.y = -0.26;
    leftArmMesh.castShadow = true;
    leftArmPivot.add(leftArmMesh);

    const handGeo = new THREE.SphereGeometry(0.045, 12, 12);
    const leftHand = new THREE.Mesh(handGeo, skinMat);
    leftHand.position.y = -0.54;
    leftArmPivot.add(leftHand);
    pGroup.add(leftArmPivot);

    const rightArmPivot = new THREE.Group();
    rightArmPivot.position.set(0.25, 1.45, 0);
    const rightArmMesh = new THREE.Mesh(armGeo, shirtMat);
    rightArmMesh.position.y = -0.26;
    rightArmMesh.castShadow = true;
    rightArmPivot.add(rightArmMesh);

    const rightHand = new THREE.Mesh(handGeo, skinMat);
    rightHand.position.y = -0.54;
    rightArmPivot.add(rightHand);
    pGroup.add(rightArmPivot);

    // Left & Right Legs
    const thighGeo = new THREE.CylinderGeometry(0.08, 0.065, 0.45, 16);
    const calfGeo = new THREE.CylinderGeometry(0.065, 0.05, 0.45, 16);

    const leftLegPivot = new THREE.Group();
    leftLegPivot.position.set(-0.11, 0.82, 0);

    const leftThigh = new THREE.Mesh(thighGeo, pantsMat);
    leftThigh.position.y = -0.22;
    leftThigh.castShadow = true;
    leftLegPivot.add(leftThigh);

    const leftCalf = new THREE.Mesh(calfGeo, pantsMat);
    leftCalf.position.y = -0.62;
    leftCalf.castShadow = true;
    leftLegPivot.add(leftCalf);

    const shoeGeo = new THREE.BoxGeometry(0.12, 0.1, 0.24);
    const leftShoe = new THREE.Mesh(shoeGeo, shoeMat);
    leftShoe.position.set(0, -0.86, 0.05);
    leftShoe.castShadow = true;
    leftLegPivot.add(leftShoe);
    pGroup.add(leftLegPivot);

    const rightLegPivot = new THREE.Group();
    rightLegPivot.position.set(0.11, 0.82, 0);

    const rightThigh = new THREE.Mesh(thighGeo, pantsMat);
    rightThigh.position.y = -0.22;
    rightThigh.castShadow = true;
    rightLegPivot.add(rightThigh);

    const rightCalf = new THREE.Mesh(calfGeo, pantsMat);
    rightCalf.position.y = -0.62;
    rightCalf.castShadow = true;
    rightLegPivot.add(rightCalf);

    const rightShoe = new THREE.Mesh(shoeGeo, shoeMat);
    rightShoe.position.set(0, -0.86, 0.05);
    rightShoe.castShadow = true;
    rightLegPivot.add(rightShoe);
    pGroup.add(rightLegPivot);

    const direction = Math.random() > 0.5 ? 1 : -1;
    const laneZ = direction > 0 ? 0.25 + Math.random() * 0.2 : 0.65 + Math.random() * 0.2;

    pGroup.userData = {
      leftLegPivot,
      rightLegPivot,
      leftArmPivot,
      rightArmPivot,
      chest,
      direction,
      baseSpeed: 0.03 + Math.random() * 0.015,
      currentSpeed: 0.03 + Math.random() * 0.015,
      laneZ,
      targetZ: laneZ,
      stridePhase: Math.random() * Math.PI * 2,
    };

    return pGroup;
  };

  const createShockwaveRipple = (x, z) => {
    if (!sceneRef.current) return;
    const ringGeo = new THREE.RingGeometry(0.1, 0.8, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.03, z);
    sceneRef.current.add(ring);

    ripplesRef.current.push({
      mesh: ring,
      scale: 0.2,
      opacity: 0.85,
    });
  };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.offsetWidth;
    const height = mount.offsetHeight;

    // 1. Scene & Camera Setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 100);
    camera.position.set(0, 4.8, 13);
    camera.lookAt(0, 1.4, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    mount.appendChild(renderer.domElement);

    // 2. Directional Sunlight / Moonlight
    const sunLight = new THREE.DirectionalLight(0xfff5ea, 1.5);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.bias = -0.0004;
    scene.add(sunLight);
    sunLightRef.current = sunLight;

    const ambientLight = new THREE.AmbientLight(0x334155, 0.85);
    scene.add(ambientLight);

    // 3. Concrete Sidewalk Footpath
    const sidewalkGeo = new THREE.BoxGeometry(22, 0.25, 6);
    const sidewalkMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.7,
      metalness: 0.15,
    });
    const sidewalk = new THREE.Mesh(sidewalkGeo, sidewalkMat);
    sidewalk.position.set(0, -0.125, 0);
    sidewalk.receiveShadow = true;
    scene.add(sidewalk);

    // Roadway
    const roadGeo = new THREE.PlaneGeometry(32, 14);
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 });
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.y = -0.25;
    road.receiveShadow = true;
    scene.add(road);

    // Grid Lines
    const grid = new THREE.GridHelper(22, 11, 0x1e293b, 0x334155);
    grid.position.y = 0.005;
    scene.add(grid);

    // 4. Embedded Piezoelectric Energy Harvesting Floor Tiles
    const tileGroup = new THREE.Group();
    const tileGeo = new THREE.BoxGeometry(1.5, 0.26, 1.5);
    const tilesArray = [];

    for (let i = -4; i <= 4; i++) {
      const tileMat = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.2,
        metalness: 0.85,
        emissive: 0x06b6d4,
        emissiveIntensity: 0.2,
      });
      const tileMesh = new THREE.Mesh(tileGeo, tileMat);
      tileMesh.position.set(i * 1.9, 0.01, 0.5);
      tileMesh.castShadow = true;
      tileMesh.receiveShadow = true;
      tileMesh.userData = { id: i, targetY: 0.01, targetEmissive: 0.2 };
      tileGroup.add(tileMesh);
      tilesArray.push(tileMesh);
    }
    tilesRef.current = tilesArray;
    scene.add(tileGroup);

    // 5. 3 Cobra-Head Streetlamps
    const spotlightsArray = [];
    const bulbsArray = [];

    const createCobraStreetlamp = (xPos) => {
      const lampGroup = new THREE.Group();
      lampGroup.position.set(xPos, 0, -2.2);

      const baseGeo = new THREE.CylinderGeometry(0.32, 0.42, 0.45, 24);
      const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x090d16, metalness: 0.95, roughness: 0.15 });
      const base = new THREE.Mesh(baseGeo, darkMetalMat);
      base.position.y = 0.22;
      base.castShadow = true;
      lampGroup.add(base);

      const poleGeo = new THREE.CylinderGeometry(0.09, 0.14, 3.6, 24);
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.9, roughness: 0.2 });
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.y = 2.2;
      pole.castShadow = true;
      lampGroup.add(pole);

      const armGeo = new THREE.CylinderGeometry(0.07, 0.08, 1.4, 24);
      const arm = new THREE.Mesh(armGeo, poleMat);
      arm.rotation.z = -Math.PI / 3.5;
      arm.position.set(0.5, 4.3, 0);
      arm.castShadow = true;
      lampGroup.add(arm);

      const hoodGeo = new THREE.BoxGeometry(1.1, 0.25, 0.6);
      const hood = new THREE.Mesh(hoodGeo, darkMetalMat);
      hood.position.set(1.0, 4.55, 0);
      hood.castShadow = true;
      lampGroup.add(hood);

      const bulbGeo = new THREE.BoxGeometry(0.85, 0.1, 0.4);
      const bulbMat = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xf59e0b,
        emissiveIntensity: (brightness / 100) * 4.0,
        roughness: 0.1,
      });
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.set(1.0, 4.42, 0);
      lampGroup.add(bulb);
      bulbsArray.push(bulb);

      scene.add(lampGroup);

      const spotLight = new THREE.SpotLight(0xf59e0b, (brightness / 100) * 28.0, 20, Math.PI / 3.0, 0.3, 1);
      spotLight.position.set(xPos + 1.0, 4.42, -2.2);
      spotLight.target.position.set(xPos + 1.0, 0, 0.5);
      spotLight.castShadow = true;
      spotLight.shadow.mapSize.width = 1024;
      spotLight.shadow.mapSize.height = 1024;
      scene.add(spotLight);
      scene.add(spotLight.target);
      spotlightsArray.push(spotLight);
    };

    createCobraStreetlamp(-5.2);
    createCobraStreetlamp(0.0);
    createCobraStreetlamp(5.2);

    spotLightsRef.current = spotlightsArray;
    bulbsRef.current = bulbsArray;

    // 6. Spawn Initial Pedestrians
    const initialPedestrians = [];
    const spawnPositions = [-8, -3, 2, 7];

    for (let p = 0; p < spawnPositions.length; p++) {
      const ped = createRealisticHuman();
      ped.position.set(spawnPositions[p], 0.05, ped.userData.laneZ);
      scene.add(ped);
      initialPedestrians.push(ped);
    }
    pedestriansRef.current = initialPedestrians;

    // 7. Raycaster for Sidewalk Tile Stepping
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerDown = (e) => {
      const rect = mount.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(tilesArray);

      if (intersects.length > 0) {
        const tile = intersects[0].object;
        tile.userData.targetY = -0.07;
        tile.userData.targetEmissive = 1.6;

        createShockwaveRipple(tile.position.x, tile.position.z);

        const newPed = createRealisticHuman();
        const safeZ = 0.25 + Math.random() * 0.5;
        newPed.position.set(tile.position.x, 0.05, safeZ);
        scene.add(newPed);
        pedestriansRef.current.push(newPed);

        if (pedestriansRef.current.length > 7) {
          const oldPed = pedestriansRef.current.shift();
          scene.remove(oldPed);
        }

        soundSynth.playStompSound(1.2);
        if (onStompTile) onStompTile(1.2);

        setTimeout(() => {
          tile.userData.targetY = 0.01;
          tile.userData.targetEmissive = 0.2;
        }, 220);
      }
    };

    mount.addEventListener('pointerdown', handlePointerDown);

    // 8. Animation Loop
    let animationFrameId;
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      // Camera Orbit Damping
      camera.position.x = Math.sin(elapsedTime * 0.06) * 13;
      camera.position.z = Math.cos(elapsedTime * 0.06) * 13;
      camera.lookAt(0, 1.4, 0);

      // Tile Damping
      tilesArray.forEach((tile) => {
        tile.position.y += (tile.userData.targetY - tile.position.y) * 0.25;
        const currentEmissive = tile.material.emissiveIntensity;
        tile.material.emissiveIntensity += (tile.userData.targetEmissive - currentEmissive) * 0.2;
      });

      // Animate Ripples
      ripplesRef.current.forEach((r, idx) => {
        r.scale += 0.04;
        r.opacity -= 0.025;
        r.mesh.scale.set(r.scale, r.scale, r.scale);
        r.mesh.material.opacity = Math.max(0, r.opacity);

        if (r.opacity <= 0) {
          scene.remove(r.mesh);
          ripplesRef.current.splice(idx, 1);
        }
      });

      const peds = pedestriansRef.current;

      // Pedestrian-to-Pedestrian Collision Avoidance
      for (let i = 0; i < peds.length; i++) {
        const p1 = peds[i];
        p1.userData.currentSpeed = p1.userData.baseSpeed;

        for (let j = 0; j < peds.length; j++) {
          if (i === j) continue;
          const p2 = peds[j];

          const dx = p1.position.x - p2.position.x;
          const dz = p1.position.z - p2.position.z;
          const dist = Math.sqrt(dx * dx + dz * dz);

          if (dist < 1.6) {
            if (p1.userData.direction === p2.userData.direction) {
              const isBehind = (p1.userData.direction > 0 && p1.position.x < p2.position.x) ||
                               (p1.userData.direction < 0 && p1.position.x > p2.position.x);
              if (isBehind) {
                p1.userData.currentSpeed = p1.userData.baseSpeed * 0.2;
              }
            } else {
              if (dz > 0) p1.userData.targetZ = Math.min(0.85, p1.position.z + 0.03);
              else p1.userData.targetZ = Math.max(0.15, p1.position.z - 0.03);
            }
          }
        }
      }

      // Animate Pedestrians
      peds.forEach((ped) => {
        const { leftLegPivot, rightLegPivot, leftArmPivot, rightArmPivot, chest, direction, currentSpeed, targetZ } = ped.userData;
        ped.userData.stridePhase += currentSpeed * 3.2;

        ped.position.x += currentSpeed * direction;
        ped.position.z += (targetZ - ped.position.z) * 0.1;
        ped.rotation.y = direction > 0 ? Math.PI / 2 : -Math.PI / 2;

        if (ped.position.x > 11) {
          ped.position.x = -11;
          ped.userData.targetZ = 0.25 + Math.random() * 0.2;
        }
        if (ped.position.x < -11) {
          ped.position.x = 11;
          ped.userData.targetZ = 0.65 + Math.random() * 0.2;
        }

        const phase = ped.userData.stridePhase;

        leftLegPivot.rotation.x = Math.sin(phase) * 0.5;
        rightLegPivot.rotation.x = -Math.sin(phase) * 0.5;

        leftArmPivot.rotation.x = -Math.sin(phase) * 0.5;
        rightArmPivot.rotation.x = Math.sin(phase) * 0.5;

        chest.position.y = 1.25 + Math.abs(Math.sin(phase * 2)) * 0.03;

        tilesArray.forEach((tile) => {
          const dist = Math.abs(ped.position.x - tile.position.x);
          if (dist < 0.7 && Math.abs(ped.position.z - tile.position.z) < 0.8) {
            tile.userData.targetY = -0.04;
            tile.userData.targetEmissive = 0.9;
          }
        });
      });

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      mount.removeEventListener('pointerdown', handlePointerDown);
      if (renderer.domElement && mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Spawn new human on steps increase
  useEffect(() => {
    if (steps > prevStepsRef.current && sceneRef.current) {
      prevStepsRef.current = steps;

      const randomTileX = (Math.floor(Math.random() * 9) - 4) * 1.9;
      const newPed = createRealisticHuman();
      newPed.position.set(randomTileX, 0.05, 0.25 + Math.random() * 0.5);
      sceneRef.current.add(newPed);
      pedestriansRef.current.push(newPed);

      if (pedestriansRef.current.length > 7) {
        const oldPed = pedestriansRef.current.shift();
        sceneRef.current.remove(oldPed);
      }
    }
  }, [steps]);

  // Update Streetlamps & Sunlight
  useEffect(() => {
    if (!sceneRef.current || !sunLightRef.current) return;

    const sunAngle = ((hour - 6) / 24) * Math.PI * 2;
    const sunX = Math.cos(sunAngle) * 14;
    const sunY = Math.sin(sunAngle) * 14;

    sunLightRef.current.position.set(sunX, Math.max(0.5, sunY), 6);

    let skyColor = new THREE.Color(0x38bdf8);
    let sunColor = new THREE.Color(0xfff5ea);

    if (isNight) {
      skyColor = new THREE.Color(0x020617);
      sunColor = new THREE.Color(0x38bdf8);
    } else if (hour >= 17 || hour <= 6) {
      skyColor = new THREE.Color(0x9a3412);
      sunColor = new THREE.Color(0xf59e0b);
    } else if (weather === 'rainy' || weather === 'stormy') {
      skyColor = new THREE.Color(0x1e293b);
    }

    sceneRef.current.background = skyColor;
    sunLightRef.current.color = sunColor;

    const targetIntensity = (brightness / 100) * 28.0;
    spotLightsRef.current.forEach((spot) => {
      if (spot) {
        spot.intensity = targetIntensity;
        spot.color.setHex(brightness > 0 ? 0xf59e0b : 0x1e293b);
      }
    });

    bulbsRef.current.forEach((bulb) => {
      if (bulb) {
        bulb.material.emissiveIntensity = (brightness / 100) * 4.0;
        bulb.material.color.setHex(brightness > 0 ? 0xf59e0b : 0x334155);
      }
    });
  }, [hour, weather, brightness, isNight]);

  return (
    <div className="space-y-4">
      {/* Streetlight Illumination Control Header Bar (ABOVE 3D Render) */}
      <div className="bg-slate-900/90 backdrop-blur-md border border-amber-500/50 p-3 sm:p-4 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center space-x-3 flex-1 min-w-[240px]">
          <div className="p-2 sm:p-2.5 bg-amber-500/10 rounded-xl text-amber-400">
            <Lightbulb className="w-5 h-5 sm:w-6 sm:h-6 animate-pulse" />
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex justify-between text-xs font-bold text-slate-200">
              <span>Streetlight Illumination Output:</span>
              <span className="text-amber-400 font-mono text-sm">{brightness}% (28.0 Lux Peak)</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={brightness}
              onChange={(e) => {
                if (onToggleManualOverride) onToggleManualOverride(true);
                if (onBrightnessChange) onBrightnessChange(Number(e.target.value));
              }}
              className="w-full accent-amber-400 cursor-pointer h-2 bg-slate-800 rounded-lg touch-none"
            />
          </div>
        </div>

        <div className="flex items-center space-x-1.5 sm:space-x-2 w-full sm:w-auto justify-end">
          <button
            onClick={() => {
              if (onToggleManualOverride) onToggleManualOverride(true);
              if (onBrightnessChange) onBrightnessChange(0);
            }}
            className="flex-1 sm:flex-none px-2.5 sm:px-3 py-1.5 bg-slate-950 hover:bg-slate-800 text-slate-400 border border-slate-700 rounded-xl text-xs font-bold transition-all active:scale-95"
          >
            OFF (0%)
          </button>
          <button
            onClick={() => {
              if (onToggleManualOverride) onToggleManualOverride(true);
              if (onBrightnessChange) onBrightnessChange(30);
            }}
            className="flex-1 sm:flex-none px-2.5 sm:px-3 py-1.5 bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-800 rounded-xl text-xs font-bold transition-all active:scale-95"
          >
            DIM (30%)
          </button>
          <button
            onClick={() => {
              if (onToggleManualOverride) onToggleManualOverride(true);
              if (onBrightnessChange) onBrightnessChange(70);
            }}
            className="flex-1 sm:flex-none px-2.5 sm:px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-slate-950 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95"
          >
            MED (70%)
          </button>
          <button
            onClick={() => {
              if (onToggleManualOverride) onToggleManualOverride(true);
              if (onBrightnessChange) onBrightnessChange(100);
            }}
            className="flex-1 sm:flex-none px-2.5 sm:px-3 py-1.5 bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-950 rounded-xl text-xs font-extrabold transition-all shadow-lg active:scale-95"
          >
            MAX (100%)
          </button>
        </div>
      </div>

      {/* Clean Unobstructed 3D WebGL Footpath Viewport */}
      <div className="relative w-full h-[340px] sm:h-[450px] lg:h-[540px] rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-950 select-none group touch-pan-y">
        <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

        {/* Top Right Time Controls */}
        {onHourChange && (
          <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-20 flex items-center space-x-1 bg-slate-950/85 p-1 sm:p-1.5 rounded-full border border-slate-800 shadow-xl backdrop-blur-md max-w-full overflow-x-auto">
            <button
              onClick={() => onHourChange(6)}
              className={`px-2.5 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-bold transition-all ${
                hour === 6 ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Dawn 06:00
            </button>
            <button
              onClick={() => onHourChange(12)}
              className={`px-2.5 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-bold transition-all ${
                hour === 12 ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Noon 12:00
            </button>
            <button
              onClick={() => onHourChange(18)}
              className={`px-2.5 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-bold transition-all ${
                hour === 18 ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Dusk 18:00
            </button>
            <button
              onClick={() => onHourChange(0)}
              className={`px-2.5 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-bold transition-all ${
                hour === 0 ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Night 00:00
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
