import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { soundSynth } from '../utils/audioSynth';
import { Eye, RotateCcw, Sparkles, Zap, Box, Compass } from 'lucide-react';

export default function ThreeDCyberWorld({
  brightness = 50,
  vCap = 3.5,
  steps = 0,
  pulse = 0,
  onStompTile,
}) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const spotLightRef = useRef(null);
  const capLiquidMeshRef = useRef(null);
  const particlesMeshRef = useRef(null);
  const particlesGeoRef = useRef(null);

  const [particlesCount, setParticlesCount] = useState(150);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.offsetWidth;
    const height = mount.offsetHeight;

    // 1. Scene Setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020617); // Dark Slate 950
    scene.fog = new THREE.FogExp2(0x020617, 0.03);
    sceneRef.current = scene;

    // 2. Camera Setup
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 8, 14);
    camera.lookAt(0, 1.5, 0);

    // 3. Renderer Setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0x1e293b, 1.5);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x38bdf8, 0.8);
    dirLight.position.set(5, 10, 5);
    scene.add(dirLight);

    // 3D Spotlight Fixture (Streetlamp output)
    const spotLight = new THREE.SpotLight(0xf59e0b, (brightness / 100) * 8, 18, Math.PI / 4, 0.5, 1);
    spotLight.position.set(-3, 6, 0);
    spotLight.target.position.set(-3, 0, 0);
    spotLight.castShadow = true;
    spotLight.shadow.mapSize.width = 1024;
    spotLight.shadow.mapSize.height = 1024;
    scene.add(spotLight);
    scene.add(spotLight.target);
    spotLightRef.current = spotLight;

    // 5. 3D Cyber Floor Grid & Piezotiles
    const gridHelper = new THREE.GridHelper(20, 20, 0x06b6d4, 0x1e293b);
    gridHelper.position.y = -0.01;
    scene.add(gridHelper);

    // 3x3 Metallic Tile Array
    const tileGroup = new THREE.Group();
    const tileGeo = new THREE.BoxGeometry(1.2, 0.15, 1.2);
    const tilesArray = [];

    for (let row = -1; row <= 1; row++) {
      for (let col = -1; col <= 1; col++) {
        const tileMat = new THREE.MeshStandardMaterial({
          color: 0x0f172a,
          metalness: 0.8,
          roughness: 0.2,
          emissive: 0x06b6d4,
          emissiveIntensity: 0.1,
        });
        const tileMesh = new THREE.Mesh(tileGeo, tileMat);
        tileMesh.position.set(col * 1.5 + 3, 0.08, row * 1.5);
        tileMesh.receiveShadow = true;
        tileMesh.userData = { isTile: true, col, row };
        tileGroup.add(tileMesh);
        tilesArray.push(tileMesh);
      }
    }
    scene.add(tileGroup);

    // 6. 3D Capacitor Bank Cylinder
    const capGroup = new THREE.Group();
    capGroup.position.set(-3, 0, -2);

    // Capacitor Base Glass Cylinder
    const capGlassGeo = new THREE.CylinderGeometry(0.8, 0.8, 3.2, 32);
    const capGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0x0f172a,
      transparent: true,
      opacity: 0.5,
      roughness: 0.1,
      metalness: 0.1,
      transmission: 0.9,
      ior: 1.5,
    });
    const capGlass = new THREE.Mesh(capGlassGeo, capGlassMat);
    capGlass.position.y = 1.6;
    capGroup.add(capGlass);

    // Capacitor Liquid Energy Fill
    const liquidGeo = new THREE.CylinderGeometry(0.75, 0.75, 1, 32);
    const liquidMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x10b981,
      emissiveIntensity: 0.6,
      metalness: 0.3,
      roughness: 0.2,
    });
    const liquidMesh = new THREE.Mesh(liquidGeo, liquidMat);
    liquidMesh.position.y = 0.5;
    capGroup.add(liquidMesh);
    capLiquidMeshRef.current = liquidMesh;

    // Capacitor Pins
    const pinGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.6, 16);
    const pinMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.1 });
    const pin1 = new THREE.Mesh(pinGeo, pinMat);
    pin1.position.set(-0.3, 3.4, 0);
    const pin2 = new THREE.Mesh(pinGeo, pinMat);
    pin2.position.set(0.3, 3.4, 0);
    capGroup.add(pin1);
    capGroup.add(pin2);

    scene.add(capGroup);

    // 7. 3D Streetlamp Post
    const lampGroup = new THREE.Group();
    lampGroup.position.set(-3, 0, 0);

    const poleGeo = new THREE.CylinderGeometry(0.12, 0.15, 6, 16);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7, roughness: 0.3 });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 3;
    lampGroup.add(pole);

    const headGeo = new THREE.ConeGeometry(0.6, 0.5, 16);
    const headMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(0, 6, 0);
    head.rotation.x = Math.PI;
    lampGroup.add(head);

    scene.add(lampGroup);

    // 8. 3D Floating Particle Sparks
    const count = 120;
    const positions = new Float32Array(count * 3);
    const velocities = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 8;
      positions[i * 3 + 1] = Math.random() * 5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 8;
      velocities.push({
        y: 0.01 + Math.random() * 0.02,
        x: (Math.random() - 0.5) * 0.005,
      });
    }

    const particlesGeo = new THREE.BufferGeometry();
    particlesGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particlesGeoRef.current = particlesGeo;

    const particlesMat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.15,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });

    const particlesMesh = new THREE.Points(particlesGeo, particlesMat);
    scene.add(particlesMesh);
    particlesMeshRef.current = particlesMesh;

    // 9. Interactive Raycaster for Clicking 3D Tiles
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerDown = (event) => {
      const rect = mount.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(tilesArray);

      if (intersects.length > 0) {
        const clickedMesh = intersects[0].object;
        // Tile pulse animation
        clickedMesh.position.y = -0.05;
        clickedMesh.material.emissive.setHex(0xf59e0b);
        clickedMesh.material.emissiveIntensity = 1.0;

        soundSynth.playStompSound(1.2);
        if (onStompTile) onStompTile(1.2);

        setTimeout(() => {
          clickedMesh.position.y = 0.08;
          clickedMesh.material.emissive.setHex(0x06b6d4);
          clickedMesh.material.emissiveIntensity = 0.2;
        }, 150);
      }
    };

    mount.addEventListener('pointerdown', handlePointerDown);

    // 10. Animation Loop
    let animationFrameId;
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      // Slow Orbit Camera Rotation
      camera.position.x = Math.sin(elapsedTime * 0.15) * 14;
      camera.position.z = Math.cos(elapsedTime * 0.15) * 14;
      camera.lookAt(0, 1.5, 0);

      // Animate Particles Floating Upwards
      if (particlesGeoRef.current) {
        const posAttr = particlesGeoRef.current.attributes.position;
        for (let i = 0; i < count; i++) {
          let y = posAttr.getY(i) + velocities[i].y;
          if (y > 6) y = 0.1;
          posAttr.setY(i, y);
        }
        posAttr.needsUpdate = true;
      }

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

  // Update Spotlight Brightness & Capacitor Liquid Fill on prop changes
  useEffect(() => {
    if (spotLightRef.current) {
      spotLightRef.current.intensity = (brightness / 100) * 8;
      spotLightRef.current.color.setHex(brightness > 0 ? 0xf59e0b : 0x1e293b);
    }

    if (capLiquidMeshRef.current) {
      // Scale liquid cylinder height based on vCap (0 - 5.0V)
      const scaleY = Math.max(0.1, (vCap / 5.0) * 3.0);
      capLiquidMeshRef.current.scale.y = scaleY;
      capLiquidMeshRef.current.position.y = scaleY / 2;

      if (vCap > 3.5) {
        capLiquidMeshRef.current.material.color.setHex(0x10b981); // Emerald
        capLiquidMeshRef.current.material.emissive.setHex(0x10b981);
      } else if (vCap > 2.0) {
        capLiquidMeshRef.current.material.color.setHex(0xf59e0b); // Amber
        capLiquidMeshRef.current.material.emissive.setHex(0xf59e0b);
      } else {
        capLiquidMeshRef.current.material.color.setHex(0xf43f5e); // Rose
        capLiquidMeshRef.current.material.emissive.setHex(0xf43f5e);
      }
    }
  }, [brightness, vCap]);

  return (
    <div className="relative w-full h-96 rounded-2xl overflow-hidden border border-cyan-500/40 shadow-2xl bg-slate-950 select-none group">
      {/* Three.js Viewport Mount */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Cyberpunk HUD Overlay */}
      <div className="absolute top-4 left-4 z-10 flex items-center space-x-2">
        <span className="px-3 py-1 bg-slate-950/80 backdrop-blur-md rounded-full border border-cyan-500/50 text-xs font-mono font-bold text-cyan-300 flex items-center space-x-1.5 shadow-lg">
          <Box className="w-3.5 h-3.5 text-cyan-400 animate-spin-slow" />
          <span>3D WebGL Cyber Viewport</span>
        </span>
        <span className="px-2.5 py-1 bg-slate-950/80 backdrop-blur-md rounded-full border border-slate-800 text-[10px] font-mono text-slate-400">
          Click 3D Tiles to Stomp!
        </span>
      </div>

      {/* HUD Telemetry Corner Cards */}
      <div className="absolute bottom-4 right-4 z-10 flex items-center space-x-3 pointer-events-none">
        <div className="bg-slate-950/90 border border-slate-800 p-2.5 rounded-xl backdrop-blur-md text-right text-xs font-mono">
          <span className="text-slate-400 text-[10px] block">3D LIGHT INTENSITY</span>
          <span className="text-amber-400 font-extrabold text-sm">{brightness}% PWM</span>
        </div>
        <div className="bg-slate-950/90 border border-slate-800 p-2.5 rounded-xl backdrop-blur-md text-right text-xs font-mono">
          <span className="text-slate-400 text-[10px] block">3D CAPACITOR VOLUME</span>
          <span className="text-emerald-400 font-extrabold text-sm">{vCap.toFixed(2)} V</span>
        </div>
      </div>
    </div>
  );
}
