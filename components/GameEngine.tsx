import React, { useEffect, useRef, useState } from 'react';
import { PHYSICS, ENTITY_SIZE, ENEMY_STATS, WEAPONS } from '../constants';
import { Entity, PlanetData, Particle, BiomeStyle, Vegetation, EnemyArchetype, FloatingText, PlayerUpgrades, WeaponType, Hazard, StemType, FoliageType, WeatherType, CelestialBody, HazardType } from '../types';
import { playSound, initAudio } from '../services/audioService';

interface GameEngineProps {
  planet: PlanetData;
  upgrades: PlayerUpgrades;
  onGameOver: (score: number, coresCollected: number, reason: string) => void;
  onVictory: (score: number, collectedCores: number) => void;
}

interface BackgroundLayer {
  distance: number; // 0 to 1 (1 is far away)
  speed: number;    // Parallax factor
  color: string;
  points: { x: number; y: number }[];
}

interface RadioMessage {
  id: string;
  text: string;
  sender: string;
  life: number;
  typewriter: string;
}

// LOGICAL HEIGHT for Scaling Calculations (we want roughly 600px of visible height)
const LOGICAL_HEIGHT = 600;

const GameEngine: React.FC<GameEngineProps> = ({ planet, upgrades, onGameOver, onVictory }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hudStats, setHudStats] = useState({ health: 100, maxHealth: 100, fuel: 100, maxFuel: 100, score: 0, cores: 0, weapon: 'BLASTER', objective: 'INITIALIZING...' });
  const [bossStats, setBossStats] = useState<{ active: boolean, hp: number, maxHp: number, name: string }>({ active: false, hp: 0, maxHp: 0, name: '' });
  const [radioMsg, setRadioMsg] = useState<RadioMessage | null>(null); // UI State for radio
  const patternRef = useRef<CanvasPattern | null>(null);

  // Derived Stats
  const maxHealth = 100 + (upgrades.hull - 1) * 25;
  const moveSpeedMult = 1 + (upgrades.speed - 1) * 0.15;
  const fuelCapacityMult = 1 + (upgrades.thrusters - 1) * 0.2; 
  const damageMult = 1 + (upgrades.weapon - 1) * 0.2;

  const maxFuelBase = 100 * fuelCapacityMult;

  // Visual Touch State (Only for rendering UI)
  const [visualTouchState, setVisualTouchState] = useState<{
      leftJoystick: { active: boolean, originX: number, originY: number, currX: number, currY: number },
      rightJoystick: { active: boolean, originX: number, originY: number, currX: number, currY: number },
      jumpBtn: boolean
  }>({
      leftJoystick: { active: false, originX: 0, originY: 0, currX: 0, currY: 0 },
      rightJoystick: { active: false, originX: 0, originY: 0, currX: 0, currY: 0 },
      jumpBtn: false
  });

  // Game State Refs
  const gameState = useRef<{
    player: Entity;
    currentWeapon: WeaponType;
    weaponCooldown: number;
    enemies: Entity[];
    projectiles: Entity[];
    loot: Entity[];
    particles: Particle[];
    weatherParticles: Particle[]; // Separate list for weather
    texts: FloatingText[];
    vegetation: Vegetation[];
    backgroundLayers: BackgroundLayer[];
    celestialBodies: CelestialBody[]; // NEW: Background planets/suns
    camera: { x: number; y: number; shake: number; lookOffset: number }; // Added lookOffset for smoother cam
    stars: { x: number; y: number; size: number; speed: number; alpha: number }[];
    decorations: { x: number; y: number; type: number; size: number }[];
    hazards: Hazard[];
    keys: { [key: string]: boolean };
    touchInput: {
        left: { active: boolean, touchId: number | null, vectorX: number, vectorY: number, originX: number, originY: number },
        right: { active: boolean, touchId: number | null, vectorX: number, vectorY: number, originX: number, originY: number },
        jump: boolean
    };
    mouse: { x: number; y: number; isDown: boolean }; // x,y are now SCREEN coordinates
    aimAngle: number;
    score: number;
    coresCollected: number;
    totalCoresNeeded: number;
    frameCount: number;
    lastTime: number;
    terrain: number[];
    isPlaying: boolean;
    bossActive: boolean;
    jumpLock: boolean;
    introTimer: number; 
    lookDownTimer: number;
    scaleRatio: number;
    logicalWidth: number;
    logicalHeight: number;
    messageQueue: string[];
    currentMessage: RadioMessage | null;
    nextSquadSpawnX: number;
    // Weather & DayNight Systems
    timeOfDay: number; // 0.0 to 1.0 (0=Dawn, 0.2=Day, 0.5=Dusk, 0.8=Night)
    weatherState: 'clear' | 'buildup' | 'active' | 'fading';
    currentWeather: WeatherType;
    weatherIntensity: number; // 0 to 1
    weatherTimer: number; // Duration of current state
    
    // JUICE
    hitStop: number; // Frames to freeze the game
  }>({
    player: {
      id: 'player',
      pos: { x: 100, y: 100 },
      vel: { x: 0, y: 0 },
      size: ENTITY_SIZE.PLAYER,
      color: '#ffffff',
      type: 'player',
      health: maxHealth,
      maxHealth: maxHealth,
      fuel: maxFuelBase,
      maxFuel: maxFuelBase,
      isGrounded: false,
      markedForDeletion: false,
      facingRight: true,
      variant: 0,
      animOffset: 0,
      hitTimer: 0,
      coyoteTimer: 0
    },
    currentWeapon: 'blaster',
    weaponCooldown: 0,
    enemies: [],
    projectiles: [],
    loot: [],
    particles: [],
    weatherParticles: [],
    texts: [],
    vegetation: [],
    backgroundLayers: [],
    celestialBodies: [],
    camera: { x: 0, y: 0, shake: 0, lookOffset: 0 },
    stars: [],
    decorations: [],
    hazards: [],
    keys: {},
    touchInput: {
        left: { active: false, touchId: null, vectorX: 0, vectorY: 0, originX: 0, originY: 0 },
        right: { active: false, touchId: null, vectorX: 0, vectorY: 0, originX: 0, originY: 0 },
        jump: false
    },
    mouse: { x: 400, y: 300, isDown: false },
    aimAngle: 0,
    score: 0,
    coresCollected: 0,
    totalCoresNeeded: 5,
    frameCount: 0,
    lastTime: 0,
    terrain: [],
    isPlaying: true,
    bossActive: false,
    jumpLock: false,
    introTimer: 200, 
    lookDownTimer: 0,
    scaleRatio: 1,
    logicalWidth: 800,
    logicalHeight: 600,
    messageQueue: [],
    currentMessage: null,
    nextSquadSpawnX: 800,
    timeOfDay: 0.1, // Start at dawn/morning
    weatherState: 'clear',
    currentWeather: 'clear',
    weatherIntensity: 0,
    weatherTimer: 600,
    hitStop: 0
  });

  // --- Helper: Color Blending ---
  const lerpColor = (a: string, b: string, amount: number) => {
    const ah = parseInt(a.replace(/#/g, ''), 16),
          bh = parseInt(b.replace(/#/g, ''), 16),
          ar = ah >> 16, ag = ah >> 8 & 0xff, ab = ah & 0xff,
          br = bh >> 16, bg = bh >> 8 & 0xff, bb = bh & 0xff,
          rr = ar + amount * (br - ar),
          rg = ag + amount * (bg - ag),
          rb = ab + amount * (bb - ab);
    return '#' + ((1 << 24) + (rr << 16) + (rg << 8) + rb | 0).toString(16).slice(1);
  };
  
  const darkenColor = (color: string, percent: number) => { return lerpColor(color, '#000000', percent); };
  const lightenColor = (color: string, percent: number) => { return lerpColor(color, '#ffffff', percent); };

  // --- Pattern Generation ---
  const createBiomePattern = (ctx: CanvasRenderingContext2D, color: string, styles: BiomeStyle[]) => {
    const pCanvas = document.createElement('canvas'); 
    pCanvas.width = 64; 
    pCanvas.height = 64; 
    const pCtx = pCanvas.getContext('2d'); 
    if (!pCtx) return null;

    // 1. Base Fill
    pCtx.fillStyle = color; 
    pCtx.fillRect(0, 0, 64, 64); 

    // 2. Add Noise (Texture)
    for(let i=0; i<400; i++) {
        pCtx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
        pCtx.fillRect(Math.random() * 64, Math.random() * 64, 2, 2);
    }

    // 3. Biome Specific Details
    pCtx.fillStyle = 'rgba(0,0,0,0.15)';
    if (styles.includes('dunes')) { 
        pCtx.strokeStyle = 'rgba(0,0,0,0.1)';
        pCtx.lineWidth = 2;
        pCtx.beginPath();
        pCtx.moveTo(0, 20); pCtx.quadraticCurveTo(32, 10, 64, 20);
        pCtx.moveTo(0, 50); pCtx.quadraticCurveTo(32, 40, 64, 50);
        pCtx.stroke();
    }
    if (styles.includes('crags') || styles.includes('spire')) { 
        for(let i=0; i<5; i++) {
             const x = Math.random() * 64;
             const y = Math.random() * 64;
             pCtx.beginPath();
             pCtx.moveTo(x, y);
             pCtx.lineTo(x + 10, y + 5);
             pCtx.lineTo(x + 5, y + 15);
             pCtx.strokeStyle = 'rgba(0,0,0,0.2)';
             pCtx.stroke();
        }
    }
    if (styles.includes('plateau')) { 
        pCtx.fillStyle = 'rgba(0,0,0,0.1)';
        pCtx.fillRect(0, 10, 64, 4);
        pCtx.fillRect(0, 30, 64, 2);
        pCtx.fillRect(0, 45, 64, 6);
    }

    return ctx.createPattern(pCanvas, 'repeat');
  };

  const queueMessage = (text: string) => { gameState.current.messageQueue.push(text); };

  // --- Radio Update Loop ---
  useEffect(() => {
    const timer = setInterval(() => {
      const state = gameState.current;
      if (state.currentMessage) {
        state.currentMessage.life -= 0.05;
        if (state.currentMessage.typewriter.length < state.currentMessage.text.length) {
            state.currentMessage.typewriter = state.currentMessage.text.substring(0, state.currentMessage.typewriter.length + 1);
            if (Math.random() > 0.5) playSound('ui');
        }
        if (state.currentMessage.life <= 0) state.currentMessage = null;
      } else if (state.messageQueue.length > 0) {
        const next = state.messageQueue.shift();
        if (next) {
            state.currentMessage = { id: Math.random().toString(), text: next, sender: "GENESIS AI", life: 6, typewriter: "" };
            playSound('sensor');
        }
      }
      setRadioMsg(state.currentMessage ? { ...state.currentMessage } : null);
    }, 50);
    return () => clearInterval(timer);
  }, []);

  // --- Physics Helper Functions ---
  const getGroundHeightAt = (x: number) => {
    const state = gameState.current;
    if (state.terrain.length === 0) return LOGICAL_HEIGHT;
    const segmentWidth = 50;
    const index = Math.floor(x / segmentWidth);
    const t = (x % segmentWidth) / segmentWidth;
    
    // Clamp index
    const i1 = Math.max(0, Math.min(index, state.terrain.length - 1));
    const i2 = Math.max(0, Math.min(index + 1, state.terrain.length - 1));
    
    const h1 = state.terrain[i1];
    const h2 = state.terrain[i2];
    
    return h1 + (h2 - h1) * t;
  };

  const checkCollision = (r1: {pos: {x:number, y:number}, size: {x:number, y:number}}, r2: {pos: {x:number, y:number}, size: {x:number, y:number}}) => {
    return (r1.pos.x < r2.pos.x + r2.size.x &&
            r1.pos.x + r1.size.x > r2.pos.x &&
            r1.pos.y < r2.pos.y + r2.size.y &&
            r1.pos.y + r1.size.y > r2.pos.y);
  };

  const checkCollisionInflated = (proj: Entity, target: Entity, padding: number) => { 
      return (proj.pos.x - padding < target.pos.x + target.size.x && proj.pos.x + proj.size.x + padding > target.pos.x && proj.pos.y - padding < target.pos.y + target.size.y && proj.pos.y + proj.size.y + padding > target.pos.y); 
  };

  const spawnPlayerProjectile = (x: number, y: number, angle: number, weapon: WeaponType) => { 
      const stats = WEAPONS[weapon]; 
      const baseSpeed = stats.speed * (1 + (upgrades.weapon-1)*0.05); 
      playSound('shoot', weapon); 
      const caseAngle = angle + Math.PI + (Math.random() - 0.5);
      gameState.current.particles.push({ id: `case-${Math.random()}`, pos: { x: x, y: y }, vel: { x: Math.cos(caseAngle) * (Math.random() * 2 + 1), y: -Math.random() * 3 - 2 }, life: 2.0, maxLife: 2.0, color: '#ffd700', size: 2, type: 'casing', rotation: Math.random() * Math.PI * 2, rotSpeed: (Math.random() - 0.5) * 0.5 });
      for (let i = 0; i < stats.count; i++) { 
          const spreadAngle = angle + (Math.random() - 0.5) * stats.spread; 
          gameState.current.projectiles.push({ id: `proj-${Math.random()}`, pos: { x, y }, vel: { x: Math.cos(spreadAngle) * baseSpeed, y: Math.sin(spreadAngle) * baseSpeed }, size: ENTITY_SIZE.PROJECTILE, color: stats.color, type: 'projectile', health: 1, maxHealth: 1, isGrounded: false, markedForDeletion: false, facingRight: Math.abs(spreadAngle) < Math.PI / 2, variant: 0, animOffset: 0, hitTimer: 0, weaponType: weapon, pierceCount: stats.pierce || 0, isExplosive: stats.isExplosive || false }); 
      } 
      return stats.recoil; 
  };
  const spawnEnemyProjectile = (x: number, y: number, angle: number) => { const speed = PHYSICS.PROJECTILE_SPEED * 0.6; playSound('shoot', 'rapid'); gameState.current.projectiles.push({ id: `eproj-${Math.random()}`, pos: {x, y}, vel: {x: Math.cos(angle)*speed, y: Math.sin(angle)*speed}, size: ENTITY_SIZE.ENEMY_PROJECTILE, color: '#ff00ff', type: 'enemy_projectile', health: 1, maxHealth: 1, isGrounded: false, markedForDeletion: false, facingRight: true, variant: 0, animOffset: 0, hitTimer: 0 }); };
  const spawnParticles = (x: number, y: number, color: string, count: number, speed: number = 6) => { for (let i = 0; i < count; i++) { gameState.current.particles.push({ id: `part-${Math.random()}`, pos: { x, y }, vel: { x: (Math.random() - 0.5) * speed, y: (Math.random() - 0.5) * speed }, life: 1.0, maxLife: 1.0, color: color, size: Math.random() * 3 + 1 }); } };
  const spawnExplosion = (x: number, y: number) => { addScreenshake(15); playSound('explosion'); spawnParticles(x, y, '#ffaa00', 20, 10); spawnParticles(x, y, '#ffffff', 10, 5); gameState.current.enemies.forEach(e => { const dist = Math.hypot(e.pos.x - x, e.pos.y - y); if (dist < 100) { e.health -= 50 * (1 + (upgrades.weapon-1)*0.2); e.hitTimer = 10; spawnFloatingText(e.pos.x, e.pos.y, "BOOM!", "#ffaa00"); const angle = Math.atan2(e.pos.y - y, e.pos.x - x); e.vel.x += Math.cos(angle) * 10; e.vel.y += Math.sin(angle) * 10; } }); };
  const spawnFloatingText = (x: number, y: number, text: string, color: string) => { gameState.current.texts.push({ id: `txt-${Math.random()}`, x, y, text, color, life: 1.0, velY: -2 }); };
  const addScreenshake = (amount: number) => { gameState.current.camera.shake = amount; };

  const spawnBoss = () => { const state = gameState.current; if (state.bossActive) return; state.bossActive = true; addScreenshake(30); playSound('explosion'); queueMessage("ATTENZIONE: SEGNALE SISMICO MASSICCIO."); queueMessage("GUARDIANO PLANETARIO RILEVATO. ELIMINARE."); const spawnX = state.player.pos.x + 400; const spawnY = state.player.pos.y - 200; const stats = ENEMY_STATS.GUARDIAN; state.enemies.push({ id: 'guardian-boss', pos: { x: spawnX, y: spawnY }, vel: { x: 0, y: 0 }, size: ENTITY_SIZE.GUARDIAN, color: '#ff0000', type: 'enemy', archetype: 'guardian', health: stats.hp, maxHealth: stats.hp, isGrounded: false, markedForDeletion: false, facingRight: false, variant: 0, animOffset: 0, hitTimer: 0, aiState: 'phase1', attackTimer: 100 }); };
  const spawnEnemy = (x: number, groundY: number, forcedArch?: EnemyArchetype, forcedRarity?: 'common' | 'elite') => { 
      const rand = Math.random(); 
      let arch: EnemyArchetype = 'crawler'; 
      if (forcedArch) { arch = forcedArch; } 
      else { 
          if (rand > 0.94) arch = 'neutral'; else if (rand > 0.84) arch = 'dasher'; else if (rand > 0.72) arch = 'sentinel'; else if (rand > 0.58) arch = 'hornet'; else if (rand > 0.48) arch = 'shielder'; else if (rand > 0.42) arch = 'sandworm'; else if (rand > 0.30) arch = 'spore'; else arch = 'crawler'; 
      } 
      let baseSize = ENTITY_SIZE.CRAWLER; let stats = ENEMY_STATS.CRAWLER; 
      if (arch === 'neutral') { baseSize = ENTITY_SIZE.NEUTRAL; stats = ENEMY_STATS.NEUTRAL; } else if (arch === 'dasher') { baseSize = ENTITY_SIZE.DASHER; stats = ENEMY_STATS.DASHER; } else if (arch === 'sentinel') { baseSize = ENTITY_SIZE.SENTINEL; stats = ENEMY_STATS.SENTINEL; } else if (arch === 'hornet') { baseSize = ENTITY_SIZE.HORNET; stats = ENEMY_STATS.HORNET; } else if (arch === 'sandworm') { baseSize = ENTITY_SIZE.SANDWORM; stats = ENEMY_STATS.SANDWORM; } else if (arch === 'shielder') { baseSize = ENTITY_SIZE.SHIELDER; stats = ENEMY_STATS.SHIELDER; } else if (arch === 'spore') { baseSize = ENTITY_SIZE.SPORE; stats = ENEMY_STATS.SPORE; }
      let y = groundY - baseSize.y; if (arch === 'hornet' || arch === 'spore') y = groundY - 100 - Math.random() * 50; 
      const difficultyMult = 1 + (planet.enemyDensity * 0.05); let scaledHP = Math.floor(stats.hp * difficultyMult); let rarity: 'common' | 'elite' = forcedRarity || 'common'; 
      if (!forcedRarity && arch !== 'neutral' && Math.random() > 0.85) { rarity = 'elite'; } 
      let color = arch === 'neutral' ? '#88cc88' : planet.enemyColor; if (rarity === 'elite') { color = '#ffd700'; scaledHP = Math.floor(scaledHP * 2); } 
      const sizeVariation = 0.85 + Math.random() * 0.3; const finalSize = { x: baseSize.x * (rarity === 'elite' ? 1.3 : 1) * sizeVariation, y: baseSize.y * (rarity === 'elite' ? 1.3 : 1) * sizeVariation }; if (arch !== 'hornet' && arch !== 'spore') { y = groundY - finalSize.y; } 
      let isBurrowed = false; if (arch === 'sandworm') { isBurrowed = true; rarity = 'elite'; scaledHP = Math.floor(scaledHP * 1.5); }
      gameState.current.enemies.push({ id: `enemy-${Math.random()}`, pos: { x, y }, vel: { x: 0, y: 0 }, size: finalSize, color: color, type: 'enemy', health: scaledHP, maxHealth: scaledHP, isGrounded: false, markedForDeletion: false, facingRight: false, variant: Math.floor(Math.random() * 3), animOffset: Math.random() * 100, archetype: arch, rarity: rarity, aiState: arch === 'shielder' ? 'chase' : 'idle', attackTimer: arch === 'shielder' ? 300 : Math.random() * 100, alertTimer: 0, hitTimer: 0, isBurrowed: isBurrowed, shieldHp: arch === 'shielder' ? 50 : 0 }); 
  };
  const spawnSquad = (startX: number) => { 
      const themes: {id: string, weight: number}[] = [ { id: 'mixed', weight: 3 }, { id: 'air_raid', weight: 2 }, { id: 'heavy_ground', weight: 2 }, { id: 'sniper_nest', weight: 1 }, { id: 'swarm', weight: 2 }, { id: 'minefield', weight: 2 }, { id: 'phalanx', weight: 2 } ]; 
      let totalWeight = themes.reduce((a, b) => a + b.weight, 0); let rand = Math.random() * totalWeight; let selectedTheme = 'mixed'; for (const t of themes) { if (rand < t.weight) { selectedTheme = t.id; break; } rand -= t.weight; } 
      let squadMembers: { arch: EnemyArchetype, offsetX: number, offsetY: number, isLeader: boolean }[] = []; const densityBonus = Math.floor(planet.enemyDensity / 3); 
      if (selectedTheme === 'air_raid') { const count = 3 + densityBonus; for(let i=0; i<count; i++) { squadMembers.push({ arch: 'hornet', offsetX: i * 40, offsetY: -(i % 2) * 50 - 50, isLeader: false }); } } else if (selectedTheme === 'heavy_ground') { squadMembers.push({ arch: 'dasher', offsetX: 0, offsetY: 0, isLeader: true }); const crawlers = 2 + densityBonus; for(let i=0; i<crawlers; i++) { squadMembers.push({ arch: 'crawler', offsetX: 80 + (i*40), offsetY: 0, isLeader: false }); } } else if (selectedTheme === 'sniper_nest') { squadMembers.push({ arch: 'sentinel', offsetX: 0, offsetY: 0, isLeader: true }); squadMembers.push({ arch: 'sentinel', offsetX: 150, offsetY: 0, isLeader: false }); squadMembers.push({ arch: 'crawler', offsetX: 75, offsetY: 0, isLeader: false }); } else if (selectedTheme === 'swarm') { const type: EnemyArchetype = Math.random() > 0.5 ? 'crawler' : 'neutral'; const count = 5 + densityBonus * 2; for(let i=0; i<count; i++) { squadMembers.push({ arch: type, offsetX: i * 30 + (Math.random()*20), offsetY: 0, isLeader: false }); } } else if (selectedTheme === 'minefield') { squadMembers.push({ arch: 'spore', offsetX: 0, offsetY: -100, isLeader: false }); squadMembers.push({ arch: 'spore', offsetX: 60, offsetY: -50, isLeader: false }); squadMembers.push({ arch: 'spore', offsetX: 120, offsetY: -80, isLeader: false }); squadMembers.push({ arch: 'sandworm', offsetX: 60, offsetY: 0, isLeader: true }); } else if (selectedTheme === 'phalanx') { squadMembers.push({ arch: 'shielder', offsetX: 0, offsetY: 0, isLeader: true }); squadMembers.push({ arch: 'sentinel', offsetX: 50, offsetY: 0, isLeader: false }); squadMembers.push({ arch: 'sentinel', offsetX: 100, offsetY: 0, isLeader: false }); } else { squadMembers.push({ arch: 'sentinel', offsetX: 0, offsetY: 0, isLeader: false }); squadMembers.push({ arch: 'crawler', offsetX: 60, offsetY: 0, isLeader: false }); squadMembers.push({ arch: 'crawler', offsetX: 120, offsetY: 0, isLeader: false }); } 
      const alphaChance = 0.15 + (planet.enemyDensity * 0.03); if (Math.random() < alphaChance && squadMembers.length > 0) { const dasherIdx = squadMembers.findIndex(m => m.arch === 'dasher'); const sentinelIdx = squadMembers.findIndex(m => m.arch === 'sentinel'); let leaderIdx = 0; if (dasherIdx !== -1) leaderIdx = dasherIdx; else if (sentinelIdx !== -1) leaderIdx = sentinelIdx; squadMembers[leaderIdx].isLeader = true; } squadMembers.forEach(mem => { const x = startX + mem.offsetX; const gY = getGroundHeightAt(x); let spawnY = gY; if (mem.offsetY !== 0) { spawnY = gY + mem.offsetY; } spawnEnemy(x, spawnY, mem.arch, mem.isLeader ? 'elite' : 'common'); }); 
  };
  const spawnLoot = (x: number, y: number, type: 'weapon' | 'health') => { if (type === 'weapon') { const weaponTypes: WeaponType[] = ['scatter', 'rapid', 'sniper', 'launcher']; const weapon = weaponTypes[Math.floor(Math.random() * weaponTypes.length)]; gameState.current.loot.push({ id: `loot-${Math.random()}`, pos: { x, y }, vel: { x: (Math.random()-0.5)*4, y: -5 }, size: ENTITY_SIZE.WEAPON_DROP, color: WEAPONS[weapon].color, type: 'loot', lootType: 'weapon', weaponType: weapon, health: 1, maxHealth: 1, isGrounded: false, markedForDeletion: false, facingRight: true, variant: 0, animOffset: 0, hitTimer: 0 }); } else { gameState.current.loot.push({ id: `loot-${Math.random()}`, pos: { x, y }, vel: { x: (Math.random()-0.5)*4, y: -5 }, size: ENTITY_SIZE.HEALTH_DROP, color: '#00ff00', type: 'loot', lootType: 'health', health: 1, maxHealth: 1, isGrounded: false, markedForDeletion: false, facingRight: true, variant: 0, animOffset: 0, hitTimer: 0 }); } };

  // --- WEATHER SYSTEM LOGIC ---
  const updateWeather = (dt: number) => {
      const state = gameState.current;
      
      // 1. Time of Day Cycle
      state.timeOfDay += dt * 0.0001;
      if (state.timeOfDay > 1) state.timeOfDay = 0;

      // 2. Weather State Machine
      if (planet.weatherVolatility > 0) {
        state.weatherTimer -= dt;
        if (state.weatherTimer <= 0) {
            if (state.weatherState === 'clear') {
                const triggerChance = 0.5 * planet.weatherVolatility; 
                if (Math.random() < triggerChance && planet.weatherTraits.length > 0) {
                    state.weatherState = 'buildup';
                    const badWeather = planet.weatherTraits.filter(t => t !== 'clear');
                    if (badWeather.length > 0) {
                        state.currentWeather = badWeather[Math.floor(Math.random() * badWeather.length)];
                        state.weatherTimer = 300;
                        queueMessage(`RILEVATA PERTURBAZIONE ATMOSFERICA: ${state.currentWeather.toUpperCase()}`);
                    } else {
                        state.weatherTimer = 500; 
                    }
                } else {
                    state.weatherTimer = 500 + Math.random() * 500;
                }
            } else if (state.weatherState === 'buildup') {
                state.weatherState = 'active';
                state.weatherTimer = 600 + Math.random() * 1000 * planet.weatherVolatility;
            } else if (state.weatherState === 'active') {
                state.weatherState = 'fading';
                state.weatherTimer = 300;
            } else if (state.weatherState === 'fading') {
                state.weatherState = 'clear';
                state.currentWeather = 'clear';
                state.weatherTimer = 500;
            }
        }
      } else {
        state.weatherState = 'clear';
        state.currentWeather = 'clear';
      }

      if (state.weatherState === 'buildup') state.weatherIntensity += 0.002 * dt;
      else if (state.weatherState === 'active') state.weatherIntensity = Math.min(1, state.weatherIntensity + 0.001 * dt);
      else if (state.weatherState === 'fading') state.weatherIntensity -= 0.002 * dt;
      else state.weatherIntensity = Math.max(0, state.weatherIntensity - 0.005 * dt);
      
      state.weatherIntensity = Math.max(0, Math.min(1, state.weatherIntensity));

      if (state.weatherIntensity > 0.05) {
          const spawnRate = Math.floor(20 / Math.max(0.1, state.weatherIntensity));
          if (state.frameCount % spawnRate === 0) {
              const camX = state.camera.x;
              const camY = state.camera.y;
              for(let i=0; i<4; i++) {
                  const x = camX - 100 + Math.random() * (state.logicalWidth + 200);
                  const y = camY - 100;
                  if (state.currentWeather !== 'clear') {
                      state.weatherParticles.push({ id: `w-${Math.random()}`, pos: { x, y }, vel: { x: 0, y: 0 }, life: 1.0, maxLife: 1.0, color: '#fff', size: 1, type: 'weather' });
                  }
              }
          }
      }

      const wType = state.currentWeather;
      state.weatherParticles.forEach(p => {
          let gY = getGroundHeightAt(p.pos.x);
          if (wType === 'rain' || wType === 'acid_rain') { p.vel.y = 15; p.vel.x = -2; if (p.pos.y >= gY) { p.life = 0; if (wType === 'acid_rain' && Math.random() < 0.2) spawnParticles(p.pos.x, p.pos.y, '#00ff00', 1, 1); else if (wType === 'rain' && Math.random() < 0.1) spawnParticles(p.pos.x, p.pos.y, '#5555ff', 1, 1); } } 
          else if (wType === 'snow') { p.vel.y = 2; p.vel.x = Math.sin(state.frameCount * 0.05 + p.pos.x) * 2 - 1; if (p.pos.y >= gY) p.life = 0; } 
          else if (wType === 'ash') { p.vel.y = 1; p.vel.x = Math.sin(state.frameCount * 0.02 + p.pos.y) * 0.5; if (p.pos.y >= gY) p.life = 0; } 
          else if (wType === 'sandstorm') { p.vel.x = 20; p.vel.y = Math.random() - 0.5; if (p.pos.x > state.camera.x + state.logicalWidth + 100) p.life = 0; }
          p.pos.x += p.vel.x * dt; p.pos.y += p.vel.y * dt; if (p.pos.y > state.camera.y + state.logicalHeight + 100) p.life = 0;
      });
      state.weatherParticles = state.weatherParticles.filter(p => p.life > 0);
  };
  
  const updateVegetationPhysics = () => {
     const state = gameState.current; const playerRect = state.player; const visibleVeg = state.vegetation.filter(v => v.x > state.camera.x - 100 && v.x < state.camera.x + state.logicalWidth + 100);
     visibleVeg.forEach(v => { const distX = (playerRect.pos.x + playerRect.size.x/2) - v.x; const distY = Math.abs((playerRect.pos.y + playerRect.size.y) - getGroundHeightAt(v.x)); if (Math.abs(distX) < 20 && distY < v.height) { const force = distX > 0 ? -2 : 2; v.currentBend += force; } state.enemies.forEach(e => { const eDistX = (e.pos.x + e.size.x/2) - v.x; if (Math.abs(eDistX) < 20 && Math.abs((e.pos.y + e.size.y) - getGroundHeightAt(v.x)) < v.height) { const force = eDistX > 0 ? -1 : 1; v.currentBend += force; } }); v.currentBend *= 0.85; if (v.currentBend > 40) v.currentBend = 40; if (v.currentBend < -40) v.currentBend = -40; if (Math.abs(v.currentBend) < 0.1) v.currentBend = 0; });
  };

  const update = (dt: number) => {
    const state = gameState.current; const { player, keys, mouse, camera } = state;
    if (state.hitStop > 0) { state.hitStop -= 1; return; }
    if (state.introTimer > 0) { state.introTimer -= dt; player.vel.y += PHYSICS.GRAVITY * planet.gravity * dt * 2; player.pos.y += player.vel.y * dt; const groundY = getGroundHeightAt(player.pos.x + 16); if (player.pos.y + player.size.y >= groundY) { player.pos.y = groundY - player.size.y; player.vel.y = 0; player.vel.x = 0; if (state.introTimer > 60) { state.introTimer = 60; addScreenshake(20); playSound('impact'); spawnParticles(player.pos.x, player.pos.y + 16, '#cccccc', 20, 10); } } state.camera.x = (player.pos.x + player.size.x/2) - (state.logicalWidth / 2); state.camera.y = (player.pos.y + player.size.y/2) - (state.logicalHeight * 0.6); return; }

    updateWeather(dt);
    updateVegetationPhysics();

    if (camera.shake > 0) camera.shake *= 0.9; if (camera.shake < 0.5) camera.shake = 0;
    if (player.hitTimer > 0) player.hitTimer -= dt; if (state.weaponCooldown > 0) state.weaponCooldown -= dt;

    if (state.touchInput.right.active) { state.aimAngle = Math.atan2(state.touchInput.right.vectorY, state.touchInput.right.vectorX); } else { const playerScreenX = (player.pos.x + player.size.x/2) - camera.x; const playerScreenY = (player.pos.y + player.size.y/2) - camera.y; state.aimAngle = Math.atan2(mouse.y - playerScreenY, mouse.x - playerScreenX); }
    player.facingRight = Math.abs(state.aimAngle) < Math.PI / 2;

    const currentSpeed = PHYSICS.PLAYER_SPEED * moveSpeedMult; const maxSpeed = PHYSICS.MAX_SPEED * moveSpeedMult;
    let friction = player.isGrounded ? PHYSICS.FRICTION : PHYSICS.AIR_FRICTION;
    const currentGroundIndex = Math.floor((player.pos.x + 16) / 50); const hazard = state.hazards.find(h => currentGroundIndex * 50 >= h.x && currentGroundIndex * 50 < h.x + h.width);
    if (hazard && hazard.type === 'ice') friction = 0.98;

    let windPush = 0; if (state.currentWeather === 'sandstorm') windPush = 0.2 * state.weatherIntensity; if (!player.isGrounded) player.vel.x += windPush;

    const inputX = (keys['ArrowRight'] || keys['KeyD']) ? 1 : (keys['ArrowLeft'] || keys['KeyA']) ? -1 : state.touchInput.left.vectorX;
    if (Math.abs(inputX) > 0.1) { player.vel.x += inputX * currentSpeed * dt; } else { player.vel.x *= friction; }
    if (Math.abs(player.vel.x) < 0.1) player.vel.x = 0;
    player.vel.x = Math.max(Math.min(player.vel.x, maxSpeed), -maxSpeed);

    if (player.isGrounded) { player.coyoteTimer = PHYSICS.COYOTE_FRAMES; } else if (player.coyoteTimer && player.coyoteTimer > 0) { player.coyoteTimer -= dt; }
    const isJumpPressed = (keys['ArrowUp'] || keys['Space'] || keys['KeyW'] || state.touchInput.jump);
    const isJetpackPressed = keys['ShiftLeft'] || (state.touchInput.jump && !player.isGrounded && player.vel.y > -5); 
    const canJump = (player.isGrounded || (player.coyoteTimer && player.coyoteTimer > 0)) && !state.jumpLock;
    
    if (isJumpPressed && canJump) { player.vel.y = -PHYSICS.JUMP_FORCE * (1 / planet.gravity); player.isGrounded = false; player.coyoteTimer = 0; playSound('jump'); state.jumpLock = true; }
    if (!isJumpPressed) { state.jumpLock = false; }
    if (player.isGrounded && player.fuel !== undefined && player.maxFuel !== undefined && !isJetpackPressed) { if (player.fuel < player.maxFuel) { player.fuel = Math.min(player.maxFuel, player.fuel + PHYSICS.JETPACK_FUEL_RECHARGE * dt); } }
    if (isJetpackPressed && player.fuel !== undefined && player.fuel > 0) { player.vel.y -= PHYSICS.JETPACK_FORCE * (1 / planet.gravity) * dt; player.fuel -= PHYSICS.JETPACK_FUEL_CONSUMPTION * dt; player.isGrounded = false; if (state.frameCount % 4 === 0) playSound('thrust'); const flameColor = Math.random() > 0.5 ? '#00ffff' : '#ffffff'; spawnParticles(player.pos.x + 16, player.pos.y + 32, flameColor, 1, 4); }

    const isShooting = mouse.isDown || keys['KeyX'] || keys['KeyJ'] || (state.touchInput.right.active);
    if (isShooting && state.weaponCooldown <= 0) { 
        const weapon = WEAPONS[state.currentWeapon]; 
        const gunLen = 25; 
        const spawnX = (player.pos.x + player.size.x/2) + Math.cos(state.aimAngle) * gunLen; 
        const spawnY = (player.pos.y + player.size.y/2) + Math.sin(state.aimAngle) * gunLen; 
        const recoilAmount = spawnPlayerProjectile(spawnX, spawnY, state.aimAngle, state.currentWeapon); 
        player.vel.x -= Math.cos(state.aimAngle) * recoilAmount; player.vel.y -= Math.sin(state.aimAngle) * recoilAmount; 
        addScreenshake(recoilAmount * 0.8); 
        state.camera.x += Math.cos(state.aimAngle) * recoilAmount * 0.5; state.camera.y += Math.sin(state.aimAngle) * recoilAmount * 0.5;
        state.weaponCooldown = weapon.fireRate; 
    }

    player.vel.y += PHYSICS.GRAVITY * planet.gravity * dt; player.pos.x += player.vel.x * dt; player.pos.y += player.vel.y * dt;
    const groundY = getGroundHeightAt(player.pos.x + 16);
    
    // --- HAZARD COLLISION LOGIC ---
    if (hazard) {
        if (hazard.type === 'lava' && player.pos.y + player.size.y >= groundY - 10) { 
            if (state.frameCount % 20 === 0 && player.hitTimer <= 0) { 
                player.health -= 5; player.hitTimer = PHYSICS.INVULNERABILITY_FRAMES; state.hitStop = 4; playSound('hurt'); spawnFloatingText(player.pos.x, player.pos.y, "-5 HEAT", "#ff4400"); 
            } 
            player.vel.x *= 0.5; player.vel.y *= 0.8; // High viscosity
        } 
        else if (hazard.type === 'acid' && player.pos.y + player.size.y >= groundY - 10) { 
            if (state.frameCount % 30 === 0 && player.hitTimer <= 0) { 
                player.health -= 2; player.hitTimer = PHYSICS.INVULNERABILITY_FRAMES; playSound('hurt'); spawnFloatingText(player.pos.x, player.pos.y, "-2 ACID", "#00ff00"); 
            } 
        } 
        else if (hazard.type === 'spikes' && player.pos.y + player.size.y >= groundY - 20) { // Taller hitbox
            if (player.hitTimer <= 0) { 
                player.health -= 15; player.vel.y = -8; player.hitTimer = PHYSICS.INVULNERABILITY_FRAMES; state.hitStop = 5; playSound('hurt'); spawnFloatingText(player.pos.x, player.pos.y, "-15 SPIKE", "#ffffff"); 
            } 
        }
        else if (hazard.type === 'geyser') {
            const isErupting = (state.frameCount + hazard.x) % 300 < 100;
            if (isErupting && player.pos.y + player.size.y >= groundY - 150) {
                // Check X alignment
                if (player.pos.x + player.size.x > hazard.x && player.pos.x < hazard.x + hazard.width) {
                    player.vel.y -= 1.5; // Upward push
                    if (state.frameCount % 30 === 0 && player.hitTimer <= 0) {
                        player.health -= 5; player.hitTimer = PHYSICS.INVULNERABILITY_FRAMES; playSound('hurt'); spawnFloatingText(player.pos.x, player.pos.y, "-5 STEAM", "#ffffff");
                    }
                }
            }
        }
        else if (hazard.type === 'electric') {
             if (player.pos.y + player.size.y >= groundY - 40) {
                 player.vel.x *= 0.6; // Slowdown
                 if (state.frameCount % 40 === 0 && player.hitTimer <= 0) {
                     player.health -= 8; player.hitTimer = PHYSICS.INVULNERABILITY_FRAMES; playSound('hurt'); spawnFloatingText(player.pos.x, player.pos.y, "-8 SHOCK", "#00ffff");
                 }
             }
        }
    }

    if (player.pos.y + player.size.y >= groundY) { player.pos.y = groundY - player.size.y; player.vel.y = 0; player.isGrounded = true; } else { player.isGrounded = false; }
    if (player.pos.x < 0) player.pos.x = 0; if (player.pos.y > state.logicalHeight + 400) player.health = 0;

    const lookTarget = (state.touchInput.left.active ? state.touchInput.left.vectorX : (keys['ArrowRight'] || keys['KeyD']) ? 1 : (keys['ArrowLeft'] || keys['KeyA']) ? -1 : 0) * 150;
    state.camera.lookOffset += (lookTarget - state.camera.lookOffset) * 0.05;
    const lookVertical = (state.touchInput.left.vectorY > 0.5) ? 200 : (mouse.y - state.logicalHeight/2) * 0.3; 
    if (keys['ArrowDown'] || keys['KeyS'] || state.touchInput.left.vectorY > 0.7) { state.lookDownTimer++; } else { state.lookDownTimer = 0; }
    const lookDownOffset = state.lookDownTimer > 30 ? 200 : 0; 
    const targetCamX = (player.pos.x + player.size.x/2) - (state.logicalWidth / 2) + state.camera.lookOffset; 
    let targetCamY = (player.pos.y + player.size.y/2) - (state.logicalHeight * 0.6) + lookVertical + lookDownOffset; if (targetCamY > 100) targetCamY = 100;
    state.camera.x += (targetCamX - state.camera.x) * 0.08; state.camera.y += (targetCamY - state.camera.y) * 0.08; 
    if (state.camera.x < 0) state.camera.x = 0;

    if (!state.bossActive) { if (state.player.pos.x > state.nextSquadSpawnX) { const spawnX = state.camera.x + state.logicalWidth + 200; spawnSquad(spawnX); const gap = 2500 - (planet.enemyDensity * 200) + (Math.random() * 800); state.nextSquadSpawnX = state.player.pos.x + Math.max(800, gap); } }

    state.enemies.forEach((ent, index) => {
      const distToPlayer = Math.hypot(player.pos.x - ent.pos.x, player.pos.y - ent.pos.y); const isPlayerLeft = player.pos.x < ent.pos.x; const gY = getGroundHeightAt(ent.pos.x + ent.size.x/2);
      ent.vel.x *= 0.95; 
      if (ent.archetype !== 'guardian') { state.enemies.forEach((other, otherIdx) => { if (index === otherIdx || other.archetype === 'guardian') return; const dist = Math.hypot(ent.pos.x - other.pos.x, ent.pos.y - other.pos.y); const minSpace = ent.size.x * 0.8; if (dist < minSpace) { const pushX = (ent.pos.x - other.pos.x) / (dist + 0.1); ent.vel.x += pushX * 0.5 * dt; } }); }
      if (ent.hitTimer > 0) ent.hitTimer -= dt;
      const stats = ENEMY_STATS[ent.archetype?.toUpperCase() as keyof typeof ENEMY_STATS] || ENEMY_STATS.CRAWLER; const aggroRange = stats.aggroRange || 300; const dropRange = aggroRange * 1.5;
      if (ent.archetype !== 'neutral' && ent.archetype !== 'guardian') { if (ent.aiState === 'idle') { if (Math.abs(ent.vel.x) < 0.5 && Math.random() < 0.05) { ent.vel.x = (Math.random() - 0.5) * 2; } if (distToPlayer < aggroRange) { ent.aiState = 'alert'; ent.alertTimer = 40; spawnFloatingText(ent.pos.x, ent.pos.y - 20, "!", "#ff0000"); } } else if (ent.aiState === 'alert') { ent.vel.x *= 0.8; if (ent.alertTimer !== undefined) { ent.alertTimer -= dt; if (ent.alertTimer <= 0) ent.aiState = 'chase'; } else { ent.aiState = 'chase'; } } else if (ent.aiState === 'chase' || ent.aiState === 'charge') { if (distToPlayer > dropRange) { ent.aiState = 'idle'; } } }
      if (ent.archetype === 'neutral') { if (Math.random() < 0.02) { ent.vel.x = (Math.random() - 0.5) * 1.5; if (ent.isGrounded) ent.vel.y = -2; } if (ent.pos.y + ent.size.y >= gY) { ent.pos.y = gY - ent.size.y; ent.vel.y = 0; ent.isGrounded = true; } }
      else if (ent.archetype === 'crawler') { if (ent.aiState === 'chase') { if (Math.abs(ent.vel.x) < 2) ent.vel.x += (isPlayerLeft ? -1 : 1) * (0.2 * dt); } if (ent.isGrounded && Math.abs(gY - (ent.pos.y + ent.size.y)) > 20) ent.vel.y = -8; } 
      else if (ent.archetype === 'hornet') { const hoverY = player.pos.y - 100 + Math.sin(state.frameCount * 0.05 + ent.animOffset) * 50; let targetY = hoverY; if (ent.aiState === 'chase') { targetY = player.pos.y; if (Math.abs(ent.vel.x) < 2) ent.vel.x += (isPlayerLeft ? -1 : 1) * (0.1 * dt); } else { ent.vel.x += Math.cos(state.frameCount * 0.05) * 0.05; } ent.vel.y += (targetY - ent.pos.y) * 0.02 * dt; ent.vel.y *= 0.95; } 
      else if (ent.archetype === 'sentinel') { if (ent.aiState === 'chase') { const idealRange = (stats as any).range || 300; if (distToPlayer < idealRange - 50) ent.vel.x += (isPlayerLeft ? 1 : -1) * (0.15 * dt); else if (distToPlayer > idealRange + 50) ent.vel.x += (isPlayerLeft ? -1 : 1) * (0.15 * dt); if (ent.attackTimer && ent.attackTimer > 0) ent.attackTimer--; if (distToPlayer < 500 && (!ent.attackTimer || ent.attackTimer <= 0)) { const angle = Math.atan2((player.pos.y + 16) - ent.pos.y, (player.pos.x + 16) - ent.pos.x); spawnEnemyProjectile(ent.pos.x + ent.size.x/2, ent.pos.y, angle); ent.attackTimer = 140; } } else { ent.vel.x *= 0.9; } }
      else if (ent.archetype === 'dasher') { if (ent.aiState === 'chase') { if (distToPlayer < 300) { ent.aiState = 'charge'; ent.attackTimer = 30; spawnParticles(ent.pos.x, ent.pos.y, '#ffffff', 5); } else { if (Math.abs(ent.vel.x) < 2) ent.vel.x += (isPlayerLeft ? -1 : 1) * (0.1 * dt); } } else if (ent.aiState === 'charge') { if (ent.attackTimer && ent.attackTimer > 0) { ent.attackTimer--; ent.pos.x += Math.random() * 2 - 1; } else { ent.vel.x = (isPlayerLeft ? -1 : 1) * ENEMY_STATS.DASHER.dashSpeed; if (Math.abs(ent.vel.x) < 1 || distToPlayer > 450) ent.aiState = 'chase'; } } }
      else if (ent.archetype === 'guardian') { const hoverY = player.pos.y - 150 + Math.sin(state.frameCount * 0.03) * 50; ent.vel.y += (hoverY - ent.pos.y) * 0.01 * dt; ent.vel.x += (isPlayerLeft ? -1 : 1) * (0.05 * dt); ent.vel.y *= 0.95; ent.vel.x *= 0.95; if (ent.attackTimer && ent.attackTimer > 0) ent.attackTimer--; if (ent.health < ent.maxHealth * 0.5) ent.color = '#ff0000'; if (!ent.attackTimer || ent.attackTimer <= 0) { const randAttack = Math.random(); if (randAttack < 0.6) { for(let i=0; i<5; i++) { const angle = Math.atan2((player.pos.y+16) - ent.pos.y, (player.pos.x+16) - ent.pos.x); spawnEnemyProjectile(ent.pos.x + ent.size.x/2, ent.pos.y + ent.size.y/2, angle + (i-2)*0.2); } ent.attackTimer = 120; } else { for(let i=0; i<2; i++) { spawnEnemy(ent.pos.x + (Math.random()-0.5)*100, getGroundHeightAt(ent.pos.x)); } spawnFloatingText(ent.pos.x, ent.pos.y, "SUMMONING", "#ff00ff"); ent.attackTimer = 240; } } }
      else if (ent.archetype === 'shielder') { if (ent.attackTimer === undefined) ent.attackTimer = 0; ent.attackTimer -= dt; if (ent.attackTimer <= 0) { if (ent.aiState === 'chase') { ent.aiState = 'idle'; ent.attackTimer = 180; playSound('ui'); spawnFloatingText(ent.pos.x, ent.pos.y - 20, "SHIELD DOWN", "#ffff00"); } else { ent.aiState = 'chase'; ent.attackTimer = 300; playSound('ui'); spawnFloatingText(ent.pos.x, ent.pos.y - 20, "SHIELD UP", "#00ffff"); } } if (ent.aiState === 'chase') { const dist = Math.abs(ent.pos.x - state.player.pos.x); if (dist < 600) { if (Math.abs(ent.vel.x) < 0.5) ent.vel.x += (ent.pos.x < state.player.pos.x ? 1 : -1) * (0.05 * dt); } } else { ent.vel.x *= 0.8; } } else if (ent.archetype === 'spore') { ent.vel.x = 0; } else if (ent.archetype === 'sandworm') { if (!ent.isBurrowed) { if (ent.attackTimer && ent.attackTimer > 0) ent.attackTimer -= dt; else { ent.attackTimer = 100; const angle = Math.atan2(player.pos.y - ent.pos.y, player.pos.x - ent.pos.x); spawnEnemyProjectile(ent.pos.x, ent.pos.y, angle); } } }

      if (ent.archetype !== 'hornet' && ent.archetype !== 'guardian') ent.vel.y += PHYSICS.GRAVITY * planet.gravity * dt;
      const maxSpd = ent.archetype === 'dasher' && ent.aiState === 'charge' ? 8 : (ENEMY_STATS[ent.archetype?.toUpperCase() as keyof typeof ENEMY_STATS]?.speed || 2);
      if (Math.abs(ent.vel.x) > maxSpd && Math.abs(ent.vel.x) < 15) { } else { ent.vel.x = Math.max(Math.min(ent.vel.x, maxSpd), -maxSpd); }
      ent.pos.x += ent.vel.x * dt; ent.pos.y += ent.vel.y * dt; ent.facingRight = ent.vel.x > 0;
      if (ent.archetype !== 'hornet' && ent.archetype !== 'guardian') { if (ent.pos.y + ent.size.y >= gY) { ent.pos.y = gY - ent.size.y; ent.vel.y = 0; ent.isGrounded = true; } else ent.isGrounded = false; }

      if (checkCollision(player, ent) && ent.archetype !== 'neutral') { if (player.hitTimer <= 0) { player.health -= 15; player.hitTimer = PHYSICS.INVULNERABILITY_FRAMES; player.vel.x = (player.pos.x < ent.pos.x ? -1 : 1) * 10; player.vel.y = -5; state.hitStop = 5; addScreenshake(10); playSound('hurt'); spawnParticles(player.pos.x, player.pos.y, '#ff0000', 3); spawnFloatingText(player.pos.x, player.pos.y, '-15 HP', '#ff0000'); } }
      if (ent.pos.y > LOGICAL_HEIGHT + 300 || ent.health <= 0) { ent.markedForDeletion = true; if(ent.health <= 0) { const baseScore = ENEMY_STATS[ent.archetype?.toUpperCase() as keyof typeof ENEMY_STATS]?.score || 50; const score = ent.rarity === 'elite' ? baseScore * 2 : baseScore; state.score += score; playSound('explosion'); spawnParticles(ent.pos.x, ent.pos.y, ent.color, 10); addScreenshake(5); spawnFloatingText(ent.pos.x, ent.pos.y - 20, `+${score}`, ent.rarity === 'elite' ? '#ffd700' : '#ffff00'); const rand = Math.random(); const dropChanceWeapon = ent.rarity === 'elite' ? 0.4 : 0.1; const dropChanceHealth = ent.rarity === 'elite' ? 0.5 : 0.25; if (rand < dropChanceWeapon) { spawnLoot(ent.pos.x, ent.pos.y, 'weapon'); } else if (rand < dropChanceHealth) { spawnLoot(ent.pos.x, ent.pos.y, 'health'); } if (ent.archetype === 'guardian') { onVictory(state.score, state.coresCollected); } state.hitStop = 3; } }
    });

    state.projectiles.forEach(proj => {
      if (proj.weaponType && WEAPONS[proj.weaponType]?.gravity) { proj.vel.y += WEAPONS[proj.weaponType].gravity! * dt; }
      proj.pos.x += proj.vel.x * dt; proj.pos.y += proj.vel.y * dt;
      if (proj.type === 'projectile') { state.enemies.forEach(enemy => { if (!enemy.markedForDeletion && !proj.markedForDeletion && checkCollisionInflated(proj, enemy, 8)) { 
          let damageBlocked = false; if (enemy.archetype === 'shielder') { if (enemy.aiState === 'chase') { const hitFromFront = (enemy.facingRight && proj.vel.x < 0) || (!enemy.facingRight && proj.vel.x > 0); if (hitFromFront) { damageBlocked = true; spawnParticles(proj.pos.x, proj.pos.y, '#00ffff', 3); playSound('ui'); } } } if (enemy.archetype === 'sandworm' && enemy.isBurrowed) damageBlocked = true;
          if (damageBlocked) { proj.markedForDeletion = true; spawnFloatingText(enemy.pos.x, enemy.pos.y - 10, "BLOCK", "#00ffff"); } else { const wStats = WEAPONS[proj.weaponType || 'blaster']; const baseDmg = 10 * wStats.damageMult; const finalDmg = Math.ceil(baseDmg * damageMult); if (proj.isExplosive) { spawnExplosion(proj.pos.x, proj.pos.y); proj.markedForDeletion = true; } else { enemy.health -= finalDmg; enemy.hitTimer = 5; if (enemy.aiState === 'idle') enemy.aiState = 'chase'; spawnParticles(proj.pos.x, proj.pos.y, '#ffff00', 2); spawnFloatingText(enemy.pos.x, enemy.pos.y, `${finalDmg}`, '#ffffff'); const kbStrength = wStats.knockback || 2; const angle = Math.atan2(proj.vel.y, proj.vel.x); enemy.vel.x += Math.cos(angle) * kbStrength; enemy.vel.y += Math.sin(angle) * (kbStrength * 0.5); enemy.isGrounded = false; if (proj.pierceCount && proj.pierceCount > 0) { proj.pierceCount--; } else { proj.markedForDeletion = true; } } } } }); } 
      else if (proj.type === 'enemy_projectile') { if (checkCollision(proj, player)) { if (player.hitTimer <= 0) { player.health -= 10; player.hitTimer = PHYSICS.INVULNERABILITY_FRAMES; state.hitStop = 4; addScreenshake(5); playSound('hurt'); spawnParticles(player.pos.x, player.pos.y, '#ff0000', 5); spawnFloatingText(player.pos.x, player.pos.y, '-10 HP', '#ff0000'); } proj.markedForDeletion = true; } }
      if (Math.abs(proj.pos.x - player.pos.x) > state.logicalWidth) proj.markedForDeletion = true; const groundY = getGroundHeightAt(proj.pos.x); if (proj.pos.y > groundY) { proj.markedForDeletion = true; if (proj.isExplosive) { spawnExplosion(proj.pos.x, groundY); } else { spawnParticles(proj.pos.x, proj.pos.y, planet.groundColor, 2); } }
    });

    state.loot.forEach(item => {
      item.vel.y += PHYSICS.GRAVITY * planet.gravity * dt; item.pos.x += item.vel.x * dt; item.pos.y += item.vel.y * dt; const gY = getGroundHeightAt(item.pos.x + item.size.x/2);
      if (item.lootType === 'core') { const distToPlayer = Math.hypot(player.pos.x - item.pos.x, player.pos.y - item.pos.y); if (distToPlayer < 400) { const rate = Math.floor(distToPlayer / 50) * 10 + 20; if (state.frameCount % rate === 0) { playSound('sensor'); } } }
      if (state.hazards.some(h => h.type === 'lava' && item.pos.x > h.x && item.pos.x < h.x+h.width && item.pos.y > gY - 10)) { item.markedForDeletion = true; spawnParticles(item.pos.x, item.pos.y, '#ff0000', 5); }
      if (item.pos.y + item.size.y >= gY) { item.pos.y = gY - item.size.y; item.vel.y = 0; }
      if (checkCollision(player, item)) {
        item.markedForDeletion = true;
        if (item.lootType === 'core') { state.coresCollected += 1; state.score += 500; playSound('pickup'); spawnParticles(item.pos.x, item.pos.y, item.color, 20); spawnFloatingText(item.pos.x, item.pos.y - 20, 'CORE ACQUIRED', item.color); if (state.coresCollected === 1) queueMessage("Ottimo lavoro. Procedi verso il segnale successivo."); if (state.coresCollected === Math.floor(state.totalCoresNeeded / 2)) queueMessage("Livelli energia al 50%. Rilevata attività nemica in aumento."); if (state.coresCollected >= state.totalCoresNeeded) { spawnBoss(); } } else if (item.lootType === 'weapon' && item.weaponType) { state.currentWeapon = item.weaponType; playSound('powerup'); spawnParticles(item.pos.x, item.pos.y, WEAPONS[item.weaponType].color, 20); spawnFloatingText(item.pos.x, item.pos.y - 20, WEAPONS[item.weaponType].name, WEAPONS[item.weaponType].color); } else if (item.lootType === 'health') { player.health = Math.min(player.maxHealth, player.health + 20); playSound('pickup'); spawnParticles(item.pos.x, item.pos.y, '#00ff00', 10); spawnFloatingText(item.pos.x, item.pos.y - 20, '+20 HP', '#00ff00'); }
      }
    });

    state.particles.forEach(p => { 
        if (p.type === 'casing') { p.vel.y += PHYSICS.GRAVITY * dt; p.pos.x += p.vel.x * dt; p.pos.y += p.vel.y * dt; p.life -= 0.01 * dt; if (p.rotation !== undefined && p.rotSpeed !== undefined) p.rotation += p.rotSpeed; const gY = getGroundHeightAt(p.pos.x); if (p.pos.y >= gY - 2) { p.pos.y = gY - 2; p.vel.y *= -0.5; p.vel.x *= 0.8; if (Math.abs(p.vel.y) < 1) p.vel.y = 0; } } else if (p.type === 'bubble') {
            p.pos.y -= 1; // Bubble rise
            p.life -= 0.02 * dt;
        } else { p.pos.x += p.vel.x * dt; p.pos.y += p.vel.y * dt; p.life -= 0.05 * dt; }
    });
    
    state.texts.forEach(t => { t.y += t.velY * dt; t.life -= 0.02 * dt; });
    state.enemies = state.enemies.filter(e => !e.markedForDeletion); state.projectiles = state.projectiles.filter(p => !p.markedForDeletion); state.loot = state.loot.filter(l => !l.markedForDeletion); state.particles = state.particles.filter(p => p.life > 0); state.texts = state.texts.filter(t => t.life > 0); state.frameCount++;

    if (player.health <= 0) { state.isPlaying = false; onGameOver(state.score, state.coresCollected, "Segnale vitale tuta: 0%"); }
    if (state.frameCount % 5 === 0) { 
        const boss = state.enemies.find(e => e.archetype === 'guardian');
        const objText = boss ? "DANGER: DESTROY GUARDIAN" : "MISSION: RECOVER CORES";
        setHudStats({ health: player.health, maxHealth: player.maxHealth, fuel: player.fuel || 0, maxFuel: player.maxFuel || 100, score: state.score, cores: state.coresCollected, weapon: WEAPONS[state.currentWeapon].name, objective: objText }); 
        const bossStat = boss ? { active: true, hp: boss.health, maxHp: boss.maxHealth, name: "PLANETARY GUARDIAN" } : { active: false, hp: 0, maxHp: 0, name: '' };
        setBossStats(bossStat);
    }
  };

  const drawLight = (ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, intensity: number = 1.0) => {
     ctx.save();
     const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
     grad.addColorStop(0, color);
     grad.addColorStop(1, 'rgba(0,0,0,0)');
     ctx.fillStyle = grad;
     ctx.globalAlpha = intensity;
     ctx.beginPath();
     ctx.arc(x, y, radius, 0, Math.PI*2);
     ctx.fill();
     ctx.restore();
  };
  
  const drawStem = (ctx: CanvasRenderingContext2D, v: Vegetation, groundY: number, sway: number) => {
      ctx.strokeStyle = v.colorStem; ctx.fillStyle = v.colorStem; ctx.lineWidth = v.width;
      const drawDetails = () => { if (!v.colorDetail) return; ctx.fillStyle = v.colorDetail; for(let i=10; i<v.height; i+=15) { if (v.variant % 3 === 0) { const x = v.x + (sway * (i/v.height)); ctx.fillRect(x - v.width/2, groundY - i, v.width, 3); } else if (v.variant % 3 === 1) { const x = v.x + (sway * (i/v.height)); ctx.beginPath(); ctx.arc(x, groundY - i, v.width*0.3, 0, Math.PI*2); ctx.fill(); } } ctx.fillStyle = v.colorStem; };
      if (v.stemType === 'straight') { ctx.beginPath(); ctx.moveTo(v.x, groundY); ctx.quadraticCurveTo(v.x + sway * 0.5, groundY - v.height * 0.5, v.x + sway, groundY - v.height); ctx.stroke(); drawDetails(); } 
      else if (v.stemType === 'twisted') { ctx.beginPath(); ctx.moveTo(v.x, groundY); const cp1x = v.x + (v.variant % 20 - 10) * 3 + sway*0.5; const cp2x = v.x - (v.variant % 20 - 10) * 3 + sway; ctx.bezierCurveTo(cp1x, groundY - v.height * 0.3, cp2x, groundY - v.height * 0.6, v.x + sway, groundY - v.height); ctx.stroke(); drawDetails(); } 
      else if (v.stemType === 'segmented') { const segments = Math.max(3, Math.floor(v.height / 40)); const segH = v.height / segments; let currX = v.x; let currY = groundY; for(let i=0; i<segments; i++) { ctx.fillRect(currX - v.width/2, currY - segH, v.width, segH - 2); if (v.colorDetail) { ctx.fillStyle = v.colorDetail; ctx.fillRect(currX - v.width/2, currY - 2, v.width, 2); ctx.fillStyle = v.colorStem; } currY -= segH; currX += sway * (1/segments); } } 
      else if (v.stemType === 'cactus') { ctx.lineWidth = v.width * 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(v.x, groundY); ctx.lineTo(v.x + sway*0.2, groundY - v.height); ctx.stroke(); if (v.variant % 2 === 0) { ctx.beginPath(); ctx.moveTo(v.x, groundY - v.height * 0.4); ctx.quadraticCurveTo(v.x - 25, groundY - v.height * 0.4, v.x - 25, groundY - v.height * 0.7); ctx.stroke(); } ctx.lineWidth = 2; ctx.lineCap = 'butt'; } 
      else if (v.stemType === 'shard') { ctx.fillStyle = v.colorStem; ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.moveTo(v.x - v.width, groundY); ctx.lineTo(v.x + v.width, groundY); ctx.lineTo(v.x + sway*0.5, groundY - v.height); ctx.fill(); ctx.globalAlpha = 1.0; } 
      else if (v.stemType === 'bulbous') { const bulbs = Math.ceil(v.height / (v.width * 2)); for(let i=0; i<bulbs; i++) { const y = groundY - (i * v.width * 2) - v.width; const x = v.x + (sway * (i/bulbs)); ctx.beginPath(); ctx.arc(x, y, v.width * (1 - i/bulbs * 0.5), 0, Math.PI*2); ctx.fill(); } } 
      else if (v.stemType === 'vine') { ctx.lineWidth = Math.max(2, v.width * 0.3); ctx.beginPath(); ctx.moveTo(v.x, groundY); for(let i=0; i<v.height; i+=10) { const x = v.x + Math.sin(i * 0.1 + v.variant) * 5 + (sway * (i/v.height)); ctx.lineTo(x, groundY - i); } ctx.stroke(); }
      else if (v.stemType === 'crystalline') { ctx.strokeStyle = v.colorStem; ctx.fillStyle = v.colorStem + '88'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-v.width/2 + v.x, groundY); const segs = 4; const segH = v.height / segs; let lx = -v.width/2 + v.x, rx = v.width/2 + v.x; for(let i=1; i<=segs; i++) { const y = groundY - i * segH; const off = (i%2 === 0 ? 5 : -5) + sway*(i/segs); ctx.lineTo(lx + off, y); ctx.lineTo(rx + off, y); lx += off*0.5; rx += off*0.5; } ctx.closePath(); ctx.stroke(); ctx.fill(); } 
      else if (v.stemType === 'spiral') { ctx.strokeStyle = v.colorStem; ctx.lineWidth = v.width; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(v.x, groundY); const loops = 4; for(let i=0; i<v.height; i+=5) { const prog = i / v.height; const r = v.width * 2 * (1-prog); const x = v.x + Math.sin(prog * Math.PI * 2 * loops) * r + (sway * prog * 2); ctx.lineTo(x, groundY - i); } ctx.stroke(); }
  };

  const drawFoliage = (ctx: CanvasRenderingContext2D, v: Vegetation, groundY: number, sway: number) => {
      if (v.foliageType === 'none') return;
      // Adjust top pos for spiral
      let topX = v.x + sway; 
      let topY = groundY - v.height;
      
      ctx.fillStyle = v.colorFoliage;
      if (v.foliageType === 'canopy') { const layers = v.isTitan ? 3 : 1; for(let i=0; i<layers; i++) { const radius = 15 + (v.variant % 10) + (v.isTitan ? 20 : 0) - (i*10); const yOff = i * 20; ctx.beginPath(); ctx.arc(topX, topY + yOff, radius, 0, Math.PI*2); ctx.arc(topX - radius*0.8, topY + radius*0.5 + yOff, radius*0.6, 0, Math.PI*2); ctx.arc(topX + radius*0.8, topY + radius*0.5 + yOff, radius*0.6, 0, Math.PI*2); ctx.fill(); } } 
      else if (v.foliageType === 'fern') { ctx.strokeStyle = v.colorFoliage; ctx.lineWidth = 2; const leaves = 6; for(let i=0; i<leaves; i++) { const h = (v.height / leaves) * i; const yPos = groundY - h; const xPos = v.x + (sway * (i/leaves) * 0.5); const leafSize = 15 + (v.isTitan ? 20 : 0) - i; ctx.beginPath(); ctx.moveTo(xPos, yPos); ctx.quadraticCurveTo(xPos + leafSize, yPos - leafSize, xPos + leafSize*2, yPos); ctx.stroke(); ctx.beginPath(); ctx.moveTo(xPos, yPos); ctx.quadraticCurveTo(xPos - leafSize, yPos - leafSize, xPos - leafSize*2, yPos); ctx.stroke(); } } 
      else if (v.foliageType === 'bulb') { ctx.shadowColor = v.colorFoliage; ctx.shadowBlur = 15; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(topX, topY, 6 + (v.isTitan?10:0), 0, Math.PI*2); ctx.fill(); ctx.fillStyle = v.colorFoliage; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(topX, topY, 12 + (v.isTitan?20:0), 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1.0; ctx.shadowBlur = 0; } 
      else if (v.foliageType === 'spikes') { const yStart = groundY - v.height; ctx.fillStyle = '#000000'; for(let i=0; i<8; i++) { const h = v.height * (i/8); const px = v.x + (sway * (i/8)*0.5); const py = groundY - h; if (Math.random() > 0.5) ctx.fillRect(px+v.width/2, py, 4, 2); else ctx.fillRect(px-v.width/2-4, py, 4, 2); } if (v.variant % 3 === 0) { ctx.fillStyle = '#ff0055'; ctx.beginPath(); ctx.arc(topX, topY, 6, 0, Math.PI*2); ctx.fill(); } } 
      else if (v.foliageType === 'weeping') { ctx.strokeStyle = v.colorFoliage; ctx.lineWidth = 2; const strands = 8; for(let i=0; i<strands; i++) { const offsetX = (i - strands/2) * 5; ctx.beginPath(); ctx.moveTo(topX + offsetX, topY); const cpX = topX + offsetX + (sway * 2); const endX = topX + offsetX + sway; ctx.bezierCurveTo(cpX, topY + 50, endX, topY + 80, endX, topY + 120); ctx.stroke(); } } 
      else if (v.foliageType === 'pods') { ctx.fillStyle = v.colorFoliage; const pods = 3; for(let i=0; i<pods; i++) { const py = topY + i * 20; const px = topX + (sway * 1.2); ctx.beginPath(); ctx.ellipse(px, py, 6, 12, sway * 0.1, 0, Math.PI*2); ctx.fill(); } } 
      else if (v.foliageType === 'flower') { ctx.fillStyle = v.colorFoliage; const petals = 5; for(let i=0; i<petals; i++) { const angle = (Math.PI * 2 / petals) * i + sway * 0.1; const px = topX + Math.cos(angle) * 20; const py = topY + Math.sin(angle) * 20; ctx.beginPath(); ctx.arc(px, py, 10 + (v.isTitan?10:0), 0, Math.PI*2); ctx.fill(); } ctx.fillStyle = '#ffcc00'; ctx.beginPath(); ctx.arc(topX, topY, 8, 0, Math.PI*2); ctx.fill(); }
      else if (v.foliageType === 'luminescent') { ctx.shadowBlur = 15; ctx.shadowColor = v.colorFoliage; for(let i=0; i<3; i++) { ctx.beginPath(); const offX = Math.sin(i*2.5)*15; const offY = Math.cos(i*2.5)*15; ctx.arc(topX+offX, topY+offY, 6, 0, Math.PI*2); ctx.fill(); } ctx.shadowBlur = 0; } 
      else if (v.foliageType === 'giant_leaf') { ctx.beginPath(); ctx.moveTo(topX, topY+v.height); ctx.bezierCurveTo(topX+40, topY+v.height-40, topX+60, topY+v.height-80, topX, topY); ctx.bezierCurveTo(topX-60, topY+v.height-80, topX-40, topY+v.height-40, topX, topY+v.height); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(topX, topY+v.height); ctx.quadraticCurveTo(topX+10, topY+60, topX, topY); ctx.stroke(); } 
      else if (v.foliageType === 'tentacles') { ctx.strokeStyle = v.colorFoliage; ctx.lineWidth = 3; for(let i=0; i<5; i++) { ctx.beginPath(); ctx.moveTo(topX, topY); const angle = (i-2) * 0.5; const len = 40 + Math.sin(sway*2 + i)*5; const tx = topX + Math.sin(angle + sway*0.05) * len; const ty = topY - Math.cos(angle + sway*0.05) * len; ctx.quadraticCurveTo(tx*0.5 + Math.sin(sway*0.2 + i)*5, ty*0.5, tx, ty); ctx.stroke(); ctx.beginPath(); ctx.arc(tx, ty, 3, 0, Math.PI*2); ctx.fill(); } }
  };

  const drawVegetation = (ctx: CanvasRenderingContext2D) => {
    const state = gameState.current; 
    const globalWind = Math.sin(state.frameCount * 0.05); 
    const weatherSway = state.weatherIntensity * 2;
    const visibleVeg = state.vegetation.filter(v => v.x > state.camera.x - 50 && v.x < state.camera.x + state.logicalWidth + 50);
    visibleVeg.forEach(v => { 
        const groundY = getGroundHeightAt(v.x); 
        if (state.hazards.some(h => h.type !== 'none' && h.type !== 'ice' && v.x > h.x && v.x < h.x + h.width)) return; 
        const swayFactor = v.isTitan ? 0.02 : 0.05;
        const swayMagnitude = (v.swayAmount + (weatherSway * 20)) * (globalWind + Math.sin(state.frameCount * v.swaySpeed + v.x)) + (v.currentBend || 0);
        drawStem(ctx, v, groundY, swayMagnitude * 0.6); 
        drawFoliage(ctx, v, groundY, swayMagnitude);
    });
  };

  const drawWeather = (ctx: CanvasRenderingContext2D) => {
      const state = gameState.current; if (state.weatherParticles.length === 0) return; const type = state.currentWeather;
      ctx.save();
      if (type === 'acid_rain') { ctx.strokeStyle = '#00ff00'; ctx.lineWidth = 1; state.weatherParticles.forEach(p => { ctx.beginPath(); ctx.moveTo(p.pos.x, p.pos.y); ctx.lineTo(p.pos.x + p.vel.x, p.pos.y + p.vel.y * 2); ctx.stroke(); }); } 
      else if (type === 'rain') { ctx.strokeStyle = '#aaaaff'; ctx.lineWidth = 1; ctx.globalAlpha = 0.6; state.weatherParticles.forEach(p => { ctx.beginPath(); ctx.moveTo(p.pos.x, p.pos.y); ctx.lineTo(p.pos.x + p.vel.x, p.pos.y + p.vel.y * 3); ctx.stroke(); }); ctx.globalAlpha = 1; } 
      else if (type === 'snow') { ctx.fillStyle = '#ffffff'; state.weatherParticles.forEach(p => { ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y, 2, 0, Math.PI*2); ctx.fill(); }); } 
      else if (type === 'ash') { ctx.fillStyle = '#ffaa00'; state.weatherParticles.forEach(p => { ctx.globalAlpha = 0.6 + Math.random() * 0.4; ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y, p.size, 0, Math.PI*2); ctx.fill(); }); ctx.globalAlpha = 1; } 
      else if (type === 'sandstorm') { ctx.fillStyle = '#ccaa66'; ctx.globalAlpha = 0.1 * state.weatherIntensity; ctx.fillRect(0, 0, state.logicalWidth, state.logicalHeight); ctx.fillStyle = '#eedd99'; ctx.globalAlpha = 0.8; state.weatherParticles.forEach(p => { ctx.fillRect(p.pos.x, p.pos.y, 4, 1); }); ctx.globalAlpha = 1; }
      ctx.restore();
  };
  
  const drawDayNightCycle = (ctx: CanvasRenderingContext2D) => {
      const t = gameState.current.timeOfDay;
      let overlayColor = 'rgba(0,0,0,0)';
      if (t < 0.2) { const alpha = 1 - (t / 0.2); overlayColor = `rgba(20, 10, 40, ${alpha * 0.6})`; } 
      else if (t >= 0.2 && t < 0.5) { overlayColor = `rgba(255, 255, 200, 0.05)`; } 
      else if (t >= 0.5 && t < 0.7) { const progress = (t - 0.5) / 0.2; overlayColor = `rgba(100, 40, 0, ${progress * 0.4})`; } 
      else { overlayColor = `rgba(5, 5, 20, 0.6)`; }
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = overlayColor;
      ctx.fillRect(0, 0, gameState.current.logicalWidth, gameState.current.logicalHeight);
      if (gameState.current.weatherState === 'active' || gameState.current.weatherState === 'buildup') { const intensity = gameState.current.weatherIntensity; let tint = 'rgba(0,0,0,0)'; if (gameState.current.currentWeather === 'sandstorm') tint = `rgba(150, 100, 0, ${intensity * 0.3})`; else if (gameState.current.currentWeather === 'acid_rain') tint = `rgba(0, 50, 0, ${intensity * 0.2})`; else if (gameState.current.currentWeather === 'ash') tint = `rgba(50, 20, 0, ${intensity * 0.2})`; else tint = `rgba(50, 50, 60, ${intensity * 0.4})`; ctx.fillStyle = tint; ctx.fillRect(0, 0, gameState.current.logicalWidth, gameState.current.logicalHeight); }
      ctx.restore();
  };

  const drawLightingPass = (ctx: CanvasRenderingContext2D) => {
    const state = gameState.current;
    ctx.save();
    const shakeX = (Math.random() - 0.5) * state.camera.shake; const shakeY = (Math.random() - 0.5) * state.camera.shake;
    ctx.translate(-state.camera.x + shakeX, -state.camera.y + shakeY);
    ctx.globalCompositeOperation = 'lighter';
    const p = state.player;
    let pGlowColor = '#00ffff'; if (upgrades.hull > 2) pGlowColor = '#ffcc00'; if (upgrades.hull >= 4) pGlowColor = '#ff0000';
    drawLight(ctx, p.pos.x + p.size.x/2 + (p.facingRight?4:-4), p.pos.y + 10, 30, pGlowColor, 0.4);
    if (state.keys['ShiftLeft'] || (state.touchInput.jump && !p.isGrounded && p.vel.y > -5)) { drawLight(ctx, p.pos.x + p.size.x/2, p.pos.y + p.size.y, 40, '#ffaa00', 0.6); }
    state.projectiles.forEach(proj => { if (proj.type === 'projectile') { const glowSize = proj.isExplosive ? 30 : 20; drawLight(ctx, proj.pos.x + proj.size.x/2, proj.pos.y + proj.size.y/2, glowSize, proj.color, 0.6); } else { drawLight(ctx, proj.pos.x + proj.size.x/2, proj.pos.y + proj.size.y/2, 20, '#ff00ff', 0.5); } });
    state.loot.forEach(l => { if (l.lootType === 'core') { const pulse = Math.sin(state.frameCount * 0.1) * 10; drawLight(ctx, l.pos.x + l.size.x/2, l.pos.y + l.size.y/2, 60 + pulse, l.color, 0.3); drawLight(ctx, l.pos.x + l.size.x/2, l.pos.y + l.size.y/2, 20, '#ffffff', 0.5); } else if (l.lootType === 'weapon') { drawLight(ctx, l.pos.x + l.size.x/2, l.pos.y + l.size.y/2, 40, WEAPONS[l.weaponType!].color, 0.2); } });
    state.enemies.forEach(e => { if (e.archetype === 'guardian') { const pulse = Math.abs(Math.sin(state.frameCount * 0.05)); drawLight(ctx, e.pos.x + e.size.x/2, e.pos.y + e.size.y/2, 100 + pulse*20, e.color, 0.3); if (e.attackTimer && e.attackTimer < 30) { drawLight(ctx, e.pos.x + e.size.x/2, e.pos.y + e.size.y/2, 150, '#ffffff', 0.8); } } else if (e.archetype === 'sentinel' || e.archetype === 'dasher') { const eyeX = e.pos.x + (e.facingRight ? e.size.x - 5 : 5); drawLight(ctx, eyeX, e.pos.y + 10, 25, e.color, 0.5); } else if (e.archetype === 'hornet') { drawLight(ctx, e.pos.x + e.size.x/2, e.pos.y + e.size.y/2, 20, '#ff0000', 0.4); } });
    state.particles.forEach(p => { if (p.color === '#ffaa00' || p.color === '#ff0000') { drawLight(ctx, p.pos.x, p.pos.y, p.size * 4, '#ff4400', p.life * 0.5); } else if (p.color === '#00ffff') { drawLight(ctx, p.pos.x, p.pos.y, p.size * 3, '#00ffff', p.life * 0.4); } else if (p.type === 'casing') { drawLight(ctx, p.pos.x, p.pos.y, 8, '#ffcc00', p.life * 0.2); } });
    state.hazards.forEach(h => { 
        if (h.type === 'lava') { 
            const gY = getGroundHeightAt(h.x); 
            if (h.x + h.width > state.camera.x && h.x < state.camera.x + state.logicalWidth) { 
                drawLight(ctx, h.x + h.width/2, gY + 40, 200, '#ff4400', 0.3); 
            } 
        } else if (h.type === 'acid') { 
            const gY = getGroundHeightAt(h.x); 
            if (h.x + h.width > state.camera.x && h.x < state.camera.x + state.logicalWidth) { 
                drawLight(ctx, h.x + h.width/2, gY + 40, 200, '#00ff00', 0.2); 
            } 
        } else if (h.type === 'electric') {
            const gY = getGroundHeightAt(h.x);
            if (h.x + h.width > state.camera.x && h.x < state.camera.x + state.logicalWidth) { 
                if (state.frameCount % 10 < 5) drawLight(ctx, h.x + h.width/2, gY - 20, 100, '#00ffff', 0.5); 
            }
        }
    });
    ctx.restore();
  };
  
  const drawHazards = (ctx: CanvasRenderingContext2D) => {
      const state = gameState.current; 
      state.hazards.forEach(h => { 
          const gY = getGroundHeightAt(h.x); 
          
          if (h.type === 'lava' || h.type === 'acid') { 
              const baseColor = h.type === 'lava' ? '#cf1020' : '#20cf20';
              const lightColor = h.type === 'lava' ? '#ff6600' : '#66ff66';
              const darkColor = h.type === 'lava' ? '#660000' : '#004400';
              
              // Gradient
              const grad = ctx.createLinearGradient(h.x, gY + 10, h.x, gY + 200);
              grad.addColorStop(0, lightColor);
              grad.addColorStop(0.2, baseColor);
              grad.addColorStop(1, darkColor);
              ctx.fillStyle = grad;
              
              // Wave Physics
              ctx.beginPath();
              ctx.moveTo(h.x, gY + 50); // Start slightly deep to avoid gaps
              
              // Multi-sine wave
              const segments = 20;
              const segWidth = h.width / segments;
              const time = state.frameCount * 0.05;
              
              for(let i=0; i<=segments; i++) {
                  const px = h.x + i * segWidth;
                  const wave1 = Math.sin(time + i * 0.5) * 5;
                  const wave2 = Math.sin(time * 2 + i * 0.2) * 3;
                  const py = gY + 15 + wave1 + wave2; // 15px margin below ground edge
                  ctx.lineTo(px, py);
              }
              
              ctx.lineTo(h.x + h.width, gY + 200);
              ctx.lineTo(h.x, gY + 200);
              ctx.fill();
              
              // Foam/Surface edge
              ctx.strokeStyle = h.type === 'lava' ? '#ffaa00' : '#ccffcc';
              ctx.lineWidth = 2;
              ctx.beginPath();
              for(let i=0; i<=segments; i++) {
                  const px = h.x + i * segWidth;
                  const wave1 = Math.sin(time + i * 0.5) * 5;
                  const wave2 = Math.sin(time * 2 + i * 0.2) * 3;
                  const py = gY + 15 + wave1 + wave2;
                  if (i===0) ctx.moveTo(px, py);
                  else ctx.lineTo(px, py);
              }
              ctx.stroke();

              // Bubbles
              if (Math.random() < 0.1) {
                  state.particles.push({ 
                      id: `bub-${Math.random()}`, 
                      pos: { x: h.x + Math.random() * h.width, y: gY + 150 }, 
                      vel: { x: 0, y: -2 }, 
                      life: 2.0, maxLife: 2.0, 
                      color: h.type === 'lava' ? '#ffcc00' : '#ffffff', 
                      size: Math.random() * 3 + 1,
                      type: 'bubble' 
                  });
              }

          } else if (h.type === 'spikes') { 
              ctx.fillStyle = '#555'; 
              const spikesCount = Math.floor(h.width / 15); 
              for(let i=0; i<spikesCount; i++) { 
                  const sx = h.x + i*15 + (Math.random() * 5); 
                  const hRand = Math.random() * 10 + 15;
                  const wRand = Math.random() * 5 + 5;
                  ctx.beginPath();
                  ctx.moveTo(sx, gY); 
                  ctx.lineTo(sx + wRand, gY - hRand); 
                  ctx.lineTo(sx + wRand*2, gY); 
                  ctx.fill();
                  // Shine
                  ctx.strokeStyle = '#aaa';
                  ctx.lineWidth = 1;
                  ctx.beginPath(); ctx.moveTo(sx + wRand, gY - hRand); ctx.lineTo(sx + wRand, gY); ctx.stroke();
              } 
          } else if (h.type === 'ice') { 
              ctx.fillStyle = '#ffffff'; 
              ctx.globalAlpha = 0.4; 
              ctx.fillRect(h.x, gY - 2, h.width, 5); 
              ctx.globalAlpha = 0.8;
              // Glint
              if (state.frameCount % 60 === 0) {
                  const gx = h.x + Math.random() * h.width;
                  state.particles.push({ id: `glint-${Math.random()}`, pos: {x: gx, y: gY}, vel: {x:0, y:0}, life: 0.5, maxLife: 0.5, color: '#fff', size: 2 });
              }
              ctx.globalAlpha = 1; 
          } else if (h.type === 'geyser') {
              const isErupting = (state.frameCount + h.x) % 300 < 100;
              ctx.fillStyle = '#444';
              // Vent hole
              ctx.beginPath(); ctx.ellipse(h.x + h.width/2, gY, h.width/2, 5, 0, 0, Math.PI*2); ctx.fill();
              
              if (isErupting) {
                  // Steam column
                  const steamH = 150;
                  const grad = ctx.createLinearGradient(h.x, gY, h.x, gY - steamH);
                  grad.addColorStop(0, 'rgba(255,255,255,0.8)');
                  grad.addColorStop(1, 'rgba(255,255,255,0)');
                  ctx.fillStyle = grad;
                  ctx.fillRect(h.x, gY - steamH, h.width, steamH);
                  
                  // Steam particles
                  for(let i=0; i<3; i++) {
                      const px = h.x + Math.random() * h.width;
                      const py = gY;
                      state.particles.push({
                          id: `stm-${Math.random()}`,
                          pos: {x: px, y: py},
                          vel: {x: (Math.random()-0.5), y: -5 - Math.random()*5},
                          life: 0.5, maxLife: 0.5,
                          color: '#fff', size: Math.random()*4+2,
                          type: 'weather'
                      });
                  }
              } else {
                  // Small idle puff
                  if (Math.random() < 0.1) {
                      state.particles.push({
                          id: `stm-${Math.random()}`,
                          pos: {x: h.x + h.width/2, y: gY},
                          vel: {x: (Math.random()-0.5), y: -2},
                          life: 0.8, maxLife: 0.8,
                          color: '#aaa', size: 2,
                          type: 'weather'
                      });
                  }
              }
          } else if (h.type === 'electric') {
              // Base plates
              ctx.fillStyle = '#222';
              ctx.fillRect(h.x, gY-5, 10, 5);
              ctx.fillRect(h.x + h.width - 10, gY-5, 10, 5);
              
              // Arc
              if (state.frameCount % 5 === 0) {
                  ctx.strokeStyle = '#00ffff';
                  ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 10;
                  ctx.lineWidth = 2;
                  ctx.beginPath();
                  ctx.moveTo(h.x + 5, gY - 5);
                  const midX = h.x + h.width/2;
                  const midY = gY - 40 + (Math.random()-0.5)*20;
                  ctx.quadraticCurveTo(midX, midY, h.x + h.width - 5, gY - 5);
                  ctx.stroke();
                  ctx.shadowBlur = 0;
              }
          }
      });
  };

  const drawRadar = (ctx: CanvasRenderingContext2D) => {
      if (gameState.current.introTimer > 0) return;
      const radarSize = 50; const radarX = gameState.current.logicalWidth - 60; const radarY = 60; const range = 1500; const scale = radarSize / range;
      ctx.save(); ctx.translate(radarX, radarY);
      ctx.fillStyle = 'rgba(0, 20, 0, 0.7)'; ctx.beginPath(); ctx.arc(0, 0, radarSize, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = 'rgba(0, 255, 0, 0.3)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, radarSize * 0.33, 0, Math.PI*2); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, radarSize * 0.66, 0, Math.PI*2); ctx.stroke();
      ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)'; ctx.beginPath(); ctx.arc(0, 0, radarSize, 0, Math.PI*2); ctx.stroke();
      const angle = (gameState.current.frameCount * 0.05) % (Math.PI*2); ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0, 0, radarSize, angle, angle + 0.5); ctx.lineTo(0,0); ctx.fillStyle = 'rgba(0, 255, 0, 0.1)'; ctx.fill();
      const playerX = gameState.current.player.pos.x; const playerY = gameState.current.player.pos.y;
      ctx.fillStyle = '#ff3333'; gameState.current.enemies.forEach(e => { const dx = (e.pos.x - playerX) * scale; const dy = (e.pos.y - playerY) * scale; if (Math.hypot(dx, dy) < radarSize) { ctx.fillRect(dx-1, dy-1, 3, 3); } });
      ctx.fillStyle = '#ffff00'; gameState.current.loot.forEach(l => { const dx = (l.pos.x - playerX) * scale; const dy = (l.pos.y - playerY) * scale; if (Math.hypot(dx, dy) < radarSize) { ctx.fillRect(dx-1, dy-1, 2, 2); } });
      ctx.fillStyle = '#ffffff'; ctx.fillRect(-1, -1, 3, 3); ctx.restore();
  };

  const drawLoot = (ctx: CanvasRenderingContext2D, l: Entity) => {
    ctx.save();
    ctx.translate(l.pos.x + l.size.x/2, l.pos.y + l.size.y/2);
    const float = Math.sin(gameState.current.frameCount * 0.1 + (l.animOffset || 0)) * 5;
    ctx.translate(0, float);
    
    if (l.lootType === 'core') {
       ctx.shadowColor = l.color; ctx.shadowBlur = 15;
       ctx.fillStyle = l.color;
       // Draw Hexagon for core
       ctx.beginPath();
       for(let i=0; i<6; i++) {
           const angle = (Math.PI/3) * i;
           const r = l.size.x/2;
           ctx.lineTo(Math.cos(angle)*r, Math.sin(angle)*r);
       }
       ctx.fill();
       // Core tier indicator
       ctx.fillStyle = '#fff';
       ctx.beginPath(); ctx.arc(0, 0, l.size.x/4, 0, Math.PI*2); ctx.fill();
    } else if (l.lootType === 'weapon') {
        ctx.shadowColor = WEAPONS[l.weaponType!].color; ctx.shadowBlur = 10;
        ctx.fillStyle = WEAPONS[l.weaponType!].color;
        ctx.fillRect(-l.size.x/2, -l.size.y/2, l.size.x, l.size.y);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(-l.size.x/2, -l.size.y/2, l.size.x, l.size.y);
        ctx.fillStyle = '#fff'; ctx.font = '14px "Press Start 2P"'; ctx.textAlign = 'center'; ctx.fillText('W', 0, 4);
    } else if (l.lootType === 'health') {
        ctx.shadowColor = '#00ff00'; ctx.shadowBlur = 10;
        ctx.fillStyle = '#00ff00';
        ctx.fillRect(-l.size.x/2, -l.size.y/2, l.size.x, l.size.y);
        ctx.fillStyle = '#fff';
        ctx.fillRect(-2, -5, 4, 10); ctx.fillRect(-5, -2, 10, 4);
    }
    
    ctx.restore();
  };

  const drawPlayer = (ctx: CanvasRenderingContext2D, p: Entity) => {
    if (gameState.current.introTimer > 0) { ctx.save(); ctx.translate(p.pos.x + p.size.x/2, p.pos.y + p.size.y/2); if (gameState.current.introTimer > 60) { ctx.fillStyle = '#ffaa00'; ctx.fillRect(-10, 20, 4, 30 + Math.random()*20); ctx.fillRect(6, 20, 4, 30 + Math.random()*20); } ctx.fillStyle = '#444'; ctx.fillRect(-16, -24, 32, 48); ctx.fillStyle = '#666'; ctx.fillRect(-12, -20, 24, 40); ctx.fillStyle = '#00ffff'; ctx.fillRect(-8, -10, 16, 16); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(-16, -24, 32, 48); ctx.restore(); return; }
    if (p.hitTimer > 0) { if (Math.floor(p.hitTimer / 5) % 2 === 0) { ctx.fillStyle = '#ffffff'; ctx.fillRect(p.pos.x, p.pos.y, p.size.x, p.size.y); return; } }
    const { x, y } = p.pos; const w = p.size.x; const h = p.size.y; const bob = Math.abs(p.vel.x) > 0.1 ? Math.sin(gameState.current.frameCount * 0.2) * 2 : 0;
    let mainColor = '#e0e0e0'; let accentColor = '#999'; if (upgrades.hull === 2) { mainColor = '#0099ff'; accentColor = '#0055aa'; } if (upgrades.hull === 3) { mainColor = '#ffcc00'; accentColor = '#cc8800'; } if (upgrades.hull >= 4) { mainColor = '#333'; accentColor = '#aa0000'; } 
    ctx.fillStyle = '#333'; const packX = p.facingRight ? x - 6 : x + w; ctx.fillRect(packX, y + 8 + bob, 6, 14); ctx.fillStyle = accentColor; const backX = p.facingRight ? x - 4 : x + w - 4; ctx.fillRect(backX, y + 6 + bob, 8, 16); ctx.fillStyle = mainColor; ctx.fillRect(x + 4, y + 8 + bob, w - 8, h - 8); ctx.fillStyle = accentColor; const legOffset = Math.sin(gameState.current.frameCount * 0.4) * 4; if (Math.abs(p.vel.x) > 0.1) { ctx.fillRect(x + 6 + legOffset, y + h - 6, 6, 6); ctx.fillRect(x + w - 12 - legOffset, y + h - 6, 6, 6); } else { ctx.fillRect(x + 6, y + h - 6, 6, 6); ctx.fillRect(x + w - 12, y + h - 6, 6, 6); } ctx.fillStyle = upgrades.weapon > 2 ? '#ff3333' : '#33ccff'; const visorX = p.facingRight ? x + 10 : x + 2; ctx.fillRect(visorX, y + 2 + bob, 20, 14); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.strokeRect(x + 4, y + 2 + bob, w - 8, 14);
    ctx.save(); const pivotX = x + w/2; const pivotY = y + 16 + bob; ctx.translate(pivotX, pivotY); ctx.rotate(gameState.current.aimAngle);
    let kickBack = 0; const maxCool = WEAPONS[gameState.current.currentWeapon].fireRate || 20; if (gameState.current.weaponCooldown > maxCool - 5) { kickBack = -6; }
    ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = WEAPONS[gameState.current.currentWeapon].color; ctx.globalAlpha = 0.3; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(10 + kickBack, -2); ctx.lineTo(400, -2); ctx.stroke(); ctx.restore();
    ctx.translate(kickBack, 0); 
    if (gameState.current.currentWeapon === 'blaster') { ctx.fillStyle = '#999'; ctx.fillRect(0, -3, 10, 6); ctx.fillStyle = '#222'; ctx.fillRect(10, -4, 15, 8); } else if (gameState.current.currentWeapon === 'scatter') { ctx.fillStyle = '#553311'; ctx.fillRect(0, -4, 8, 8); ctx.fillStyle = '#222'; ctx.fillRect(8, -5, 12, 10); ctx.fillStyle = '#000'; ctx.fillRect(20, -6, 4, 12); } else if (gameState.current.currentWeapon === 'sniper') { ctx.fillStyle = '#222'; ctx.fillRect(0, -2, 30, 4); ctx.fillStyle = '#444'; ctx.fillRect(5, -4, 10, 2); } else if (gameState.current.currentWeapon === 'rapid') { ctx.fillStyle = '#444'; ctx.fillRect(0, -4, 15, 8); ctx.fillStyle = '#222'; ctx.fillRect(15, -2, 10, 4); } else if (gameState.current.currentWeapon === 'launcher') { ctx.fillStyle = '#224422'; ctx.fillRect(0, -5, 12, 10); ctx.fillStyle = '#000'; ctx.fillRect(12, -6, 8, 12); }
    ctx.restore();
    let targetEntity: Entity | null = null; const boss = gameState.current.enemies.find(e => e.archetype === 'guardian'); if (boss) { targetEntity = boss; } else { let minCoreDist = Infinity; gameState.current.loot.forEach(l => { if (l.lootType === 'core') { const d = Math.hypot(l.pos.x - p.pos.x, l.pos.y - p.pos.y); if (d < minCoreDist) { minCoreDist = d; targetEntity = l; } } }); }
    if (targetEntity) { const d = Math.hypot(targetEntity.pos.x - p.pos.x, targetEntity.pos.y - p.pos.y); if (boss || d > 300) { const angle = Math.atan2((targetEntity.pos.y - p.pos.y), (targetEntity.pos.x - p.pos.x)); const radius = 60; const ax = p.pos.x + p.size.x/2 + Math.cos(angle) * radius; const ay = p.pos.y + p.size.y/2 + Math.sin(angle) * radius; ctx.save(); ctx.translate(ax, ay); ctx.rotate(angle); ctx.fillStyle = boss ? '#ff0000' : '#00ffff'; ctx.shadowColor = boss ? '#ff0000' : '#00ffff'; ctx.shadowBlur = 10; ctx.globalAlpha = 0.6 + Math.sin(gameState.current.frameCount * 0.2) * 0.4; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-10, -8); ctx.lineTo(-10, 8); ctx.fill(); ctx.restore(); } }
  };

  const drawEnemy = (ctx: CanvasRenderingContext2D, e: Entity) => {
    if (e.hitTimer > 0) { if (Math.floor(e.hitTimer / 5) % 2 === 0) { ctx.save(); ctx.fillStyle = '#ffffff'; ctx.fillRect(e.pos.x, e.pos.y, e.size.x, e.size.y); ctx.restore(); return; } }
    const { x, y } = e.pos; const w = e.size.x; const h = e.size.y; ctx.fillStyle = e.color; 
    if (e.rarity === 'elite') { ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 10; ctx.strokeStyle = '#ffd700'; } else { ctx.strokeStyle = '#000'; ctx.shadowBlur = 0; } ctx.lineWidth = 2;
    if (e.archetype === 'neutral') { const hop = Math.abs(e.vel.y) > 0 ? -5 : 0; ctx.beginPath(); ctx.ellipse(x + w/2, y + h/2 + hop, w/2, h/2, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + w/2 + (e.vel.x > 0 ? 4 : -4), y + 6 + hop, 2, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(x + w/2, y + hop); ctx.lineTo(x + w/2, y - 5 + hop); ctx.stroke(); }
    else if (e.archetype === 'crawler') { const segs = 3; const segW = w / segs; for(let i=0; i<segs; i++) { const bob = Math.sin(gameState.current.frameCount * 0.5 + i + e.animOffset) * 2; ctx.beginPath(); ctx.arc(x + segW/2 + (i*segW), y + h/2 + bob, segW/2, 0, Math.PI*2); ctx.fill(); ctx.stroke(); ctx.beginPath(); const legAngle = Math.sin(gameState.current.frameCount * 0.8 + i) * 0.5; ctx.moveTo(x + segW/2 + (i*segW), y + h/2 + bob); ctx.lineTo(x + segW/2 + (i*segW) + Math.sin(legAngle)*10, y + h); ctx.stroke(); } } 
    else if (e.archetype === 'hornet') { const wingFlap = Math.sin(gameState.current.frameCount * 0.8) * 10; ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.ellipse(x + w/2, y + 5, 12, 4, Math.PI/4 + wingFlap*0.1, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.ellipse(x + w/2, y + 5, 12, 4, -Math.PI/4 - wingFlap*0.1, 0, Math.PI*2); ctx.fill(); ctx.fillStyle = e.color; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w/2, y + h); ctx.fill(); ctx.fillStyle = '#ff0000'; ctx.fillRect(x + w/2 - 2, y + 8, 4, 4); }
    else if (e.archetype === 'sentinel') { const float = Math.sin(gameState.current.frameCount * 0.1) * 3; ctx.fillStyle = e.color; ctx.fillRect(x + 8, y + float, w - 16, h - 10); ctx.fillStyle = '#222'; ctx.fillRect(x + 4, y + float - 5, w - 8, 10); ctx.fillStyle = (e.attackTimer && e.attackTimer < 30 && e.attackTimer % 4 < 2) ? '#fff' : '#00ff00'; ctx.fillRect(x + 10, y + float - 2, w - 20, 4); const pPos = gameState.current.player.pos; const angle = Math.atan2((pPos.y+16) - (y+float), (pPos.x+16) - x); ctx.save(); ctx.translate(x + w/2, y + float + h/2); ctx.rotate(angle); ctx.fillStyle = '#555'; ctx.fillRect(0, -2, 20, 4); ctx.restore(); }
    else if (e.archetype === 'dasher') { const chargeShake = e.aiState === 'charge' ? (Math.random() * 4 - 2) : 0; ctx.beginPath(); ctx.arc(x + w/2 + chargeShake, y + h/2, w/2, Math.PI, 0); ctx.lineTo(x + w + chargeShake, y + h); ctx.lineTo(x + chargeShake, y + h); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#dddddd'; ctx.beginPath(); if (e.facingRight) { ctx.moveTo(x + w - 5 + chargeShake, y + h/2); ctx.lineTo(x + w + 10 + chargeShake, y + h/2 - 5); ctx.lineTo(x + w - 5 + chargeShake, y + h/2 + 5); } else { ctx.moveTo(x + 5 + chargeShake, y + h/2); ctx.lineTo(x - 10 + chargeShake, y + h/2 - 5); ctx.lineTo(x + 5 + chargeShake, y + h/2 + 5); } ctx.fill(); ctx.fillStyle = e.aiState === 'charge' ? '#ff0000' : '#ffff00'; const eyeX = e.facingRight ? x + w - 15 : x + 10; ctx.fillRect(eyeX + chargeShake, y + h/2 + 5, 5, 5); }
    else if (e.archetype === 'guardian') { const pulse = Math.sin(gameState.current.frameCount * 0.1) * 2; ctx.shadowBlur = 20; ctx.shadowColor = e.color; ctx.fillStyle = '#220000'; ctx.beginPath(); ctx.arc(x + w/2, y + h/2 + pulse, w/2, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 4; ctx.stroke(); ctx.fillStyle = (e.attackTimer && e.attackTimer < 30) ? '#ffffff' : '#ff0000'; ctx.beginPath(); ctx.arc(x + w/2, y + h/2 + pulse, w/4, 0, Math.PI * 2); ctx.fill(); const orbitSpeed = gameState.current.frameCount * 0.05; for(let i=0; i<4; i++) { const ox = x + w/2 + Math.cos(orbitSpeed + i*Math.PI/2) * (w * 0.8); const oy = y + h/2 + pulse + Math.sin(orbitSpeed + i*Math.PI/2) * (h * 0.8); ctx.fillStyle = e.color; ctx.beginPath(); ctx.arc(ox, oy, 10, 0, Math.PI*2); ctx.fill(); } }
    else if (e.archetype === 'shielder') { ctx.fillStyle = '#444'; ctx.fillRect(-w/2 + x + w/2, -h/2 + y + h/2, w, h); if (e.aiState === 'chase') { ctx.fillStyle = e.color; ctx.fillRect(x+2, y-5, w - 14, 10); ctx.strokeStyle = '#00ffff'; ctx.lineWidth = 3; ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.moveTo(x + w/2 + 5, y - 5); ctx.quadraticCurveTo(x + w/2 + 15, y + h/2, x + w/2 + 5, y + h + 5); ctx.stroke(); ctx.shadowBlur = 0; } else { ctx.fillStyle = '#552222'; ctx.fillRect(x+2, y-5, w - 14, 10); if (Math.random() > 0.5) { ctx.fillStyle = '#888'; ctx.fillRect(x + 10 + (Math.random()*10-5), y, 2, -5); } } } 
    else if (e.archetype === 'sandworm') { if (!e.isBurrowed) { ctx.fillRect(x+10, y, 40, 90); ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(x+30, y+20, 15, 0, Math.PI*2); ctx.fill(); } else { ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(x+30, y+40, 20, 5, 0, 0, Math.PI*2); ctx.fill(); } }
    else { ctx.fillRect(x, y, w, h); }
    if (e.shieldHp && e.shieldHp > 0) { ctx.strokeStyle = '#00ffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x+w/2, y+h/2, w, 0, Math.PI*2); ctx.stroke(); }
    ctx.shadowBlur = 0; if (e.aiState === 'alert') { ctx.fillStyle = '#ff0000'; ctx.font = '24px "Press Start 2P"'; ctx.textAlign = 'center'; const alertBob = Math.sin(gameState.current.frameCount * 0.5) * 2; ctx.fillText('!', x + w/2, y - 10 + alertBob); }
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const state = gameState.current;

    // Clear
    ctx.fillStyle = planet.atmosphereColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Apply scaling for resolution independence
    ctx.save();
    ctx.scale(state.scaleRatio, state.scaleRatio);

    // 1. Sky Gradient / Background
    const grad = ctx.createLinearGradient(0, 0, 0, state.logicalHeight);
    grad.addColorStop(0, planet.atmosphereColor);
    grad.addColorStop(1, planet.groundColor); // mist at horizon
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, state.logicalWidth, state.logicalHeight);

    // 2. Celestial Bodies (Background)
    state.celestialBodies.forEach(body => {
        // Simple parallax for sky objects (very slow)
        const paraX = (body.x - state.camera.x * 0.05) % (state.logicalWidth + 200);
        const finalX = paraX < -100 ? paraX + state.logicalWidth + 200 : paraX;
        const py = body.y - state.camera.y * 0.05;

        // Draw body
        ctx.fillStyle = body.color;
        if (body.type === 'sun') {
            ctx.shadowColor = body.color; ctx.shadowBlur = 40;
        }
        ctx.beginPath(); ctx.arc(finalX, py, body.radius, 0, Math.PI*2); ctx.fill();
        ctx.shadowBlur = 0;

        // Details
        if (body.details) {
            body.details.forEach(d => {
                ctx.fillStyle = d.color;
                ctx.beginPath(); ctx.arc(finalX + d.x, py + d.y, d.r, 0, Math.PI*2); ctx.fill();
            });
        }
        
        // Rings
        if (body.hasRings) {
            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.ellipse(finalX, py, body.radius * 2, body.radius * 0.5, 0.2, 0, Math.PI*2);
            ctx.stroke();
        }
    });

    // 3. Stars
    ctx.fillStyle = '#ffffff';
    state.stars.forEach(s => {
        const px = (s.x - state.camera.x * s.speed) % (state.logicalWidth + 200);
        const finalX = px < 0 ? px + state.logicalWidth + 200 : px;
        const py = (s.y - state.camera.y * s.speed * 0.5);
        ctx.globalAlpha = s.alpha * (1 - state.timeOfDay); // Fade stars during day
        ctx.beginPath(); ctx.arc(finalX, py, s.size, 0, Math.PI*2); ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Camera Transform for World
    ctx.save();
    ctx.translate(-state.camera.x, -state.camera.y);
    // Apply screenshake
    const shakeX = (Math.random() - 0.5) * state.camera.shake;
    const shakeY = (Math.random() - 0.5) * state.camera.shake;
    ctx.translate(shakeX, shakeY);

    // 4. Background Parallax Layers
    state.backgroundLayers.forEach(layer => {
        ctx.fillStyle = layer.color;
        ctx.beginPath();
        let started = false;
        // Optimization: only draw visible points + margin
        // Parallax offset logic:
        const offset = state.camera.x * (1 - layer.speed);
        
        ctx.moveTo(state.camera.x - 100, state.logicalHeight + 200); // Bottom left

        layer.points.forEach((p, i) => {
            const drawX = p.x + offset;
            
            if (drawX > state.camera.x - 200 && drawX < state.camera.x + state.logicalWidth + 200) {
                 if (!started) { ctx.lineTo(drawX, p.y); started = true; }
                 else ctx.lineTo(drawX, p.y);
            }
        });
        ctx.lineTo(state.camera.x + state.logicalWidth + 200, state.logicalHeight + 200);
        ctx.fill();
    });

    // 5. Hazards (Back)
    drawHazards(ctx);

    // 6. Terrain
    ctx.fillStyle = planet.groundColor;
    if (patternRef.current) ctx.fillStyle = patternRef.current;
    
    ctx.beginPath();
    const terrainStart = Math.floor(state.camera.x / 50);
    const terrainEnd = Math.floor((state.camera.x + state.logicalWidth) / 50) + 1;
    
    ctx.moveTo(terrainStart * 50, state.logicalHeight + 500);
    for(let i=Math.max(0, terrainStart); i<=Math.min(state.terrain.length-1, terrainEnd); i++) {
        const x = i * 50;
        const h = state.terrain[i];
        ctx.lineTo(x, h);
    }
    ctx.lineTo(Math.min(state.terrain.length-1, terrainEnd) * 50, state.logicalHeight + 500);
    ctx.fill();

    // Decorations
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    state.decorations.forEach(d => {
        if (d.x > state.camera.x - 50 && d.x < state.camera.x + state.logicalWidth + 50) {
            if (d.type === 0) ctx.fillRect(d.x, d.y - d.size, d.size*2, d.size); // Rock
            else if (d.type === 1) { ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + 10, d.y - 20); ctx.lineTo(d.x + 20, d.y); ctx.fill(); } // Spike
        }
    });

    // 7. Vegetation
    drawVegetation(ctx);

    // 8. Entities
    state.loot.forEach(l => drawLoot(ctx, l));
    state.enemies.forEach(e => drawEnemy(ctx, e));
    drawPlayer(ctx, state.player);
    
    state.projectiles.forEach(p => {
        ctx.fillStyle = p.color;
        if (p.type === 'projectile') {
             const angle = Math.atan2(p.vel.y, p.vel.x);
             ctx.save(); ctx.translate(p.pos.x + p.size.x/2, p.pos.y + p.size.y/2); ctx.rotate(angle);
             ctx.fillRect(-p.size.x/2, -p.size.y/2, p.size.x, p.size.y);
             ctx.restore();
        } else {
             ctx.beginPath(); ctx.arc(p.pos.x + p.size.x/2, p.pos.y + p.size.y/2, p.size.x/2, 0, Math.PI*2); ctx.fill();
        }
    });

    // 9. Particles
    state.particles.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.min(1, p.life);
        if (p.type === 'casing') {
             ctx.save(); ctx.translate(p.pos.x, p.pos.y); ctx.rotate(p.rotation || 0);
             ctx.fillRect(-2, -1, 4, 2);
             ctx.restore();
        } else if (p.type === 'bubble') {
            ctx.strokeStyle = p.color; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y, p.size, 0, Math.PI*2); ctx.stroke();
        } else {
             ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y, p.size, 0, Math.PI*2); ctx.fill();
        }
        ctx.globalAlpha = 1;
    });

    // 10. Weather
    drawWeather(ctx);

    // 11. Lighting Overlay
    drawLightingPass(ctx);

    // 12. Floating Text
    ctx.font = '10px "Press Start 2P"';
    ctx.textAlign = 'center';
    state.texts.forEach(t => {
        ctx.fillStyle = 'black';
        ctx.fillText(t.text, t.x + 2, t.y + 2);
        ctx.fillStyle = t.color;
        ctx.globalAlpha = Math.min(1, t.life * 2);
        ctx.fillText(t.text, t.x, t.y);
        ctx.globalAlpha = 1;
    });
    
    // 13. Day Night Overlay & Radar (UI Layer)
    // Note: DayNight overlay is actually fullscreen, but handled in screen space after restore?
    // Wait, drawDayNightCycle uses fillRect(0,0, logicalWidth, logicalHeight).
    // If we call it HERE (inside world transform), it will move with camera (wrong).
    // We should call it after restore.
    
    ctx.restore(); // Undo world transform

    drawDayNightCycle(ctx);
    drawRadar(ctx);

    ctx.restore(); // Undo scaling
  };

  const handleTouchStart = (e: React.TouchEvent, type: 'left' | 'right' | 'jump') => {
      const touch = e.changedTouches[0];
      const state = gameState.current;
      if (type === 'left') {
          state.touchInput.left = { active: true, touchId: touch.identifier, vectorX: 0, vectorY: 0, originX: touch.clientX, originY: touch.clientY };
          setVisualTouchState(prev => ({ ...prev, leftJoystick: { active: true, originX: touch.clientX, originY: touch.clientY, currX: touch.clientX, currY: touch.clientY } }));
      } else if (type === 'right') {
          state.touchInput.right = { active: true, touchId: touch.identifier, vectorX: 0, vectorY: 0, originX: touch.clientX, originY: touch.clientY };
          setVisualTouchState(prev => ({ ...prev, rightJoystick: { active: true, originX: touch.clientX, originY: touch.clientY, currX: touch.clientX, currY: touch.clientY } }));
      } else if (type === 'jump') {
          state.touchInput.jump = true;
          setVisualTouchState(prev => ({ ...prev, jumpBtn: true }));
      }
  };

  const handleTouchMove = (e: React.TouchEvent, type: 'left' | 'right') => {
      const state = gameState.current;
      const input = type === 'left' ? state.touchInput.left : state.touchInput.right;
      for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t.identifier === input.touchId) {
              const maxDist = 40;
              const dx = t.clientX - input.originX;
              const dy = t.clientY - input.originY;
              const dist = Math.min(Math.hypot(dx, dy), maxDist);
              const angle = Math.atan2(dy, dx);
              const vX = input.originX + Math.cos(angle) * dist;
              const vY = input.originY + Math.sin(angle) * dist;
              
              if (type === 'left') {
                  setVisualTouchState(prev => ({ ...prev, leftJoystick: { ...prev.leftJoystick, currX: vX, currY: vY } }));
                  state.touchInput.left.vectorX = (Math.cos(angle) * dist) / maxDist;
                  state.touchInput.left.vectorY = (Math.sin(angle) * dist) / maxDist;
              } else {
                  setVisualTouchState(prev => ({ ...prev, rightJoystick: { ...prev.rightJoystick, currX: vX, currY: vY } }));
                  state.touchInput.right.vectorX = (Math.cos(angle) * dist) / maxDist;
                  state.touchInput.right.vectorY = (Math.sin(angle) * dist) / maxDist;
              }
              break;
          }
      }
  };

  const handleTouchEnd = (e: React.TouchEvent, type: 'left' | 'right' | 'jump') => {
      const state = gameState.current;
      if (type === 'left') {
          for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === state.touchInput.left.touchId) {
                state.touchInput.left.active = false;
                state.touchInput.left.vectorX = 0;
                state.touchInput.left.vectorY = 0;
                setVisualTouchState(prev => ({ ...prev, leftJoystick: { ...prev.leftJoystick, active: false } }));
            }
          }
      } else if (type === 'right') {
          for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === state.touchInput.right.touchId) {
                state.touchInput.right.active = false;
                state.touchInput.right.vectorX = 0;
                state.touchInput.right.vectorY = 0;
                setVisualTouchState(prev => ({ ...prev, rightJoystick: { ...prev.rightJoystick, active: false } }));
            }
          }
      } else if (type === 'jump') {
          state.touchInput.jump = false;
          setVisualTouchState(prev => ({ ...prev, jumpBtn: false }));
      }
  };

  // Update initialization to set orbit phases
  useEffect(() => {
    const state = gameState.current;
    initAudio();
    state.player.health = maxHealth; state.player.maxHealth = maxHealth; state.player.fuel = maxFuelBase; state.player.maxFuel = maxFuelBase; state.player.vel = { x: 0, y: 0 }; state.player.coyoteTimer = 0; state.player.pos = { x: 100, y: -200 }; 
    state.score = 0; state.coresCollected = 0;
    state.enemies = []; state.projectiles = []; state.particles = []; state.weatherParticles = []; state.texts = []; state.hazards = [];
    state.isPlaying = true; state.bossActive = false;
    state.frameCount = 0; state.introTimer = 180; state.lookDownTimer = 0;
    state.currentWeapon = 'blaster'; state.weaponCooldown = 0;
    state.messageQueue = []; state.currentMessage = null;
    state.nextSquadSpawnX = 800;
    state.timeOfDay = 0.15; state.weatherState = 'clear'; state.currentWeather = 'clear'; state.weatherIntensity = 0; state.weatherTimer = 400;
    state.keys = {}; state.touchInput = { left: { active: false, touchId: null, vectorX: 0, vectorY: 0, originX: 0, originY: 0 }, right: { active: false, touchId: null, vectorX: 0, vectorY: 0, originX: 0, originY: 0 }, jump: false }; state.hitStop = 0;
    setBossStats({ active: false, hp: 0, maxHp: 0, name: '' }); setRadioMsg(null);
    setTimeout(() => { queueMessage(`Atterraggio confermato su ${planet.name}.`); queueMessage(`Rilevati ${state.totalCoresNeeded} Nuclei Energetici. Recuperali.`); }, 2500);

    // Procedural Celestial Bodies Initialization (Fixed Logic)
    state.celestialBodies = [];
    const numBodies = Math.floor(Math.random() * 2) + 1; 
    let envType = 'neutral';
    if (planet.allowedBiomes.includes('dunes') || (planet.allowedBiomes.includes('crags') && planet.atmosphereColor.includes('330000'))) envType = 'hot';
    else if (planet.allowedBiomes.includes('spire') || planet.atmosphereColor.includes('001133')) envType = 'cold';
    else if (planet.atmosphereColor.includes('0a2a0a')) envType = 'toxic';

    for(let i=0; i<numBodies; i++) {
        const typeRoll = Math.random();
        let type: CelestialBody['type'] = 'moon';
        let radius = 30 + Math.random() * 40;
        let color = '#ffffff';
        let orbitPhase = 0;

        if (envType === 'hot') {
            if (typeRoll > 0.6) { type = 'sun'; radius = 80 + Math.random() * 60; color = '#ffcc00'; orbitPhase = 0.5; } // Peak Noon
            else { type = 'broken_moon'; radius = 50 + Math.random() * 30; color = '#aa8888'; orbitPhase = 0.0; } 
        } else if (envType === 'cold') {
            if (typeRoll > 0.7) { type = 'gas_giant'; radius = 100 + Math.random() * 60; color = '#4444ff'; orbitPhase = 0.1; }
            else { type = 'moon'; radius = 30 + Math.random() * 30; color = '#eeeeee'; orbitPhase = 0.0; }
        } else {
             if (typeRoll > 0.8) { type = 'sun'; radius = 60 + Math.random() * 40; color = '#ffaa00'; orbitPhase = 0.5; } 
             else { type = 'moon'; radius = 40 + Math.random() * 20; color = '#cccccc'; orbitPhase = 0.0; }
        }

        const details: {x:number, y:number, r:number, color: string}[] = [];
        if (type === 'moon' || type === 'broken_moon') {
            const craterCount = Math.floor(Math.random() * 5) + 3;
            for(let j=0; j<craterCount; j++) { details.push({ x: (Math.random()-0.5) * radius * 0.8, y: (Math.random()-0.5) * radius * 0.8, r: Math.random() * radius * 0.25, color: 'rgba(0,0,0,0.1)' }); }
        }

        state.celestialBodies.push({ id: `body-${i}`, x: Math.random() * 800 + (i * 300), y: Math.random() * 300 + 50, radius, color, type, hasRings: type === 'gas_giant' || (type !== 'sun' && Math.random() > 0.85), details, orbitPhase, textureSeed: Math.random() });
    }

    // Map Gen
    const segments = 350; const terrain: number[] = []; state.decorations = []; state.vegetation = []; let height = LOGICAL_HEIGHT - 150; const segmentWidth = 50; const chunkLength = 80; let currentStyle = planet.allowedBiomes[0];
    for (let i = 0; i < segments; i++) {
      const x = i * segmentWidth; if (i % chunkLength === 0) currentStyle = planet.allowedBiomes[Math.floor(Math.random() * planet.allowedBiomes.length)];
      let delta = 0; if (currentStyle === 'dunes') delta = Math.sin(i * 0.1) * 5 + Math.cos(i * 0.05) * 2; else if (currentStyle === 'crags') delta = (Math.random() - 0.5) * 15; else if (currentStyle === 'plateau') { if (i % 15 === 0) delta = (Math.floor(Math.random() * 3) - 1) * 40; else delta = 0; } else if (currentStyle === 'spire') { if (i % 5 === 0) delta = (Math.random() - 0.5) * 30; else delta = (Math.random() - 0.5) * 5; }
      height += delta; const minH = 100; const maxH = LOGICAL_HEIGHT - 50; if (height < minH) height = minH; if (height > maxH) height = maxH; if (height < 150) height += 2; if (height > LOGICAL_HEIGHT - 150) height -= 2;
      let isHazard = false; 
      
      // HAZARD GENERATION LOGIC - IMPROVED
      if (!isHazard && i > 10 && i < segments - 10) {
          const rand = Math.random();
          if (rand < 0.06) {
              height = height + 40; 
              if (height > maxH) height = maxH; 
              let hType: HazardType = 'none'; 
              
              if (currentStyle === 'dunes') hType = (Math.random() > 0.7) ? 'geyser' : 'none';
              else if (currentStyle === 'plateau') hType = (Math.random() > 0.8) ? 'electric' : 'none';
              else if (currentStyle === 'crags') hType = 'lava';
              else if (currentStyle === 'spire') hType = (Math.random() > 0.5) ? 'acid' : 'electric';
              
              // Fallbacks based on planet color
              if (hType === 'none') {
                  if (planet.groundColor.includes('441111') || planet.name.includes('Lava')) hType = 'lava'; 
                  else if (planet.atmosphereColor.includes('0a2a0a')) hType = 'acid';
              }

              if (hType !== 'none') { 
                  state.hazards.push({ x: x, width: segmentWidth, type: hType }); 
                  isHazard = true; 
              } 
          }
      } 
      if (!isHazard && currentStyle === 'crags' && Math.random() < 0.1) state.hazards.push({ x: x, width: segmentWidth, type: 'spikes' }); 
      if (!isHazard && currentStyle === 'spire' && planet.atmosphereColor.includes('001133')) state.hazards.push({ x: x, width: segmentWidth, type: 'ice' });
      
      terrain.push(height);
      if (!isHazard && Math.random() > 0.85) { let type = 0; if (currentStyle === 'dunes') type = 0; else if (currentStyle === 'spire') type = 2; else if (currentStyle === 'plateau') type = 4; else type = Math.random() > 0.5 ? 1 : 0; state.decorations.push({ x: x + Math.random() * 40, y: height, type: type, size: Math.random() * 10 + 5 }); }
      let vegDensity = 0.5; if (currentStyle === 'dunes') vegDensity = 0.2; else if (currentStyle === 'spire') vegDensity = 0.3; else if (currentStyle === 'plateau') vegDensity = 0.7; const effectiveVegDensity = vegDensity * (planet.vegetationDensity * 1.5); 
      if (!isHazard && Math.random() < effectiveVegDensity) { const isTitan = Math.random() < 0.08; let stemType: StemType = 'straight'; let foliageType: FoliageType = 'canopy'; const rand = Math.random(); if (currentStyle === 'dunes') { if (rand > 0.8) { stemType = 'crystalline'; foliageType = 'none'; } else if (rand > 0.6) { stemType = 'cactus'; foliageType = 'spikes'; } else if (rand > 0.3) { stemType = 'twisted'; foliageType = 'none'; } else { stemType = 'bulbous'; foliageType = 'flower'; } } else if (currentStyle === 'spire') { if (rand > 0.7) { stemType = 'spiral'; foliageType = 'luminescent'; } else if (rand > 0.4) { stemType = 'shard'; foliageType = 'bulb'; } else { stemType = 'vine'; foliageType = 'none'; } } else if (currentStyle === 'plateau') { if (rand > 0.8) { stemType = 'straight'; foliageType = 'giant_leaf'; } else if (rand > 0.5) { stemType = 'segmented'; foliageType = 'canopy'; } else { stemType = 'straight'; foliageType = 'pods'; } } else { if (planet.atmosphereColor.includes('0a2a0a') && rand > 0.6) { stemType = 'twisted'; foliageType = 'tentacles'; } else if (rand > 0.5) { stemType = 'bulbous'; foliageType = 'weeping'; } else { stemType = 'twisted'; foliageType = 'fern'; } } let scaleMult = 0.8 + (planet.vegetationDensity * 0.4); let hBase = (Math.random() * 120 + 40) * scaleMult; let wBase = (Math.random() * 6 + 4) * scaleMult; if (isTitan) { hBase = 250 + Math.random() * 200; wBase = 15 + Math.random() * 15; if (stemType === 'vine') stemType = 'twisted'; if (stemType === 'shard') stemType = 'straight'; } const baseColor = planet.floraColor; const stemColor = Math.random() > 0.5 ? darkenColor(baseColor, 0.3) : darkenColor(planet.groundColor, 0.2); let foliageColor = baseColor; const colorRoll = Math.random(); if (colorRoll > 0.7) foliageColor = lightenColor(baseColor, 0.4); else if (colorRoll > 0.4) foliageColor = lerpColor(baseColor, planet.atmosphereColor, 0.5); else foliageColor = '#ffffff'; state.vegetation.push({ x: x + Math.random() * segmentWidth, y: 0, height: hBase + (foliageType === 'canopy' ? 40 : 0), width: wBase, stemType: stemType, foliageType: foliageType, colorStem: stemColor, colorFoliage: foliageColor, colorDetail: darkenColor(stemColor, 0.2), swaySpeed: (Math.random() * 0.02 + 0.01) * (isTitan ? 0.5 : 1), swayAmount: (Math.random() * 5 + 2) * (isTitan ? 1.5 : 1), variant: Math.floor(Math.random() * 100), isTitan: isTitan, currentBend: 0 }); }
    }
    state.terrain = terrain; state.totalCoresNeeded = 4 + Math.floor(planet.enemyDensity / 2.5); state.backgroundLayers = []; const layerCount = 2; for (let l = 0; l < layerCount; l++) { const distance = (l + 1) / (layerCount + 0.5); const speed = 0.1 + (l * 0.15); const blendFactor = l === 0 ? 0.7 : 0.4; const layerColor = lerpColor(planet.groundColor, planet.atmosphereColor, blendFactor); const points: {x: number, y: number}[] = []; let ly = LOGICAL_HEIGHT / 2 + (l * 100); const step = 100; for (let x = 0; x < segments * segmentWidth; x += step) { const noise = Math.sin(x * 0.005) * 50 + Math.cos(x * 0.02) * 20; let biomeMod = 0; if (planet.allowedBiomes.includes('crags')) biomeMod = (Math.random() - 0.5) * 80; else if (planet.allowedBiomes.includes('plateau')) { if (x % 400 < 50) biomeMod = -50; } points.push({ x, y: ly + noise + biomeMod }); } state.backgroundLayers.push({ distance, speed, color: layerColor, points }); }
    state.stars = []; for (let i = 0; i < 400; i++) state.stars.push({ x: Math.random() * 3000, y: Math.random() * LOGICAL_HEIGHT * 1.5, size: Math.random() * 2 + 0.5, speed: Math.random() * 0.05 + 0.01, alpha: Math.random() * 0.8 + 0.2 });
    state.loot = []; const getY = (xPos: number) => { const index = Math.floor(Math.max(0, xPos) / 50); return terrain[Math.min(index, terrain.length-1)]; }; for (let i = 0; i < state.totalCoresNeeded; i++) { const progress = (i + 1) / (state.totalCoresNeeded + 1); const xPos = (segments * segmentWidth) * progress; const groundY = getY(xPos); let tier = 1; if (i === state.totalCoresNeeded - 1) tier = 3; else if (progress > 0.5) tier = 2; let color = '#ffd700'; if (tier === 2) color = '#00ffff'; if (tier === 3) color = '#ff0033'; state.loot.push({ id: `core-${i}`, pos: { x: xPos, y: groundY - 50 }, vel: { x: 0, y: 0 }, size: ENTITY_SIZE.LOOT, color: color, type: 'loot', lootType: 'core', coreTier: tier, health: 1, maxHealth: 1, isGrounded: false, markedForDeletion: false, facingRight: true, variant: 0, animOffset: Math.random() * 100, hitTimer: 0 }); if (tier >= 2) { const guardArchetype = Math.random() > 0.5 ? 'sentinel' : 'dasher'; const size = guardArchetype === 'sentinel' ? ENTITY_SIZE.SENTINEL : ENTITY_SIZE.DASHER; const hp = (ENEMY_STATS[guardArchetype.toUpperCase() as keyof typeof ENEMY_STATS]?.hp || 30) * 2; state.enemies.push({ id: `guard-${i}`, pos: { x: xPos + 100, y: groundY - 100 }, vel: { x: 0, y: 0 }, size: { x: size.x * 1.3, y: size.y * 1.3 }, color: '#ffd700', type: 'enemy', health: hp, maxHealth: hp, isGrounded: false, markedForDeletion: false, facingRight: false, variant: 0, animOffset: 0, archetype: guardArchetype, rarity: 'elite', aiState: 'idle', alertTimer: 0, hitTimer: 0 }); } }

    const handleKeyDown = (e: KeyboardEvent) => { state.keys[e.code] = true; }; const handleKeyUp = (e: KeyboardEvent) => { state.keys[e.code] = false; }; const handleMouseMove = (e: MouseEvent) => { if (state.scaleRatio > 0) { state.mouse.x = e.clientX / state.scaleRatio; state.mouse.y = e.clientY / state.scaleRatio; } }; const handleMouseDown = () => { state.mouse.isDown = true; }; const handleMouseUp = () => { state.mouse.isDown = false; }; const handleResize = () => { if (canvasRef.current) { const width = window.innerWidth; const height = window.innerHeight; const scale = Math.max(0.5, height / LOGICAL_HEIGHT); canvasRef.current.width = width; canvasRef.current.height = height; state.scaleRatio = scale; state.logicalWidth = width / scale; state.logicalHeight = height / scale; } }; const handleBlur = () => { state.keys = {}; state.mouse.isDown = false; state.touchInput.left.active = false; state.touchInput.right.active = false; state.touchInput.jump = false; setVisualTouchState(prev => ({ ...prev, leftJoystick: { ...prev.leftJoystick, active: false }, rightJoystick: { ...prev.rightJoystick, active: false }, jumpBtn: false })); };
    window.addEventListener('keydown', handleKeyDown); window.addEventListener('keyup', handleKeyUp); window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mousedown', handleMouseDown); window.addEventListener('mouseup', handleMouseUp); window.addEventListener('resize', handleResize); window.addEventListener('blur', handleBlur); handleResize(); if (canvasRef.current) { const ctx = canvasRef.current.getContext('2d'); if (ctx) patternRef.current = createBiomePattern(ctx, planet.groundColor, planet.allowedBiomes); }
    let animationFrameId: number; const loop = (time: number) => { if (!state.isPlaying) return; const dt = (time - state.lastTime) / 16.66; state.lastTime = time; update(dt > 4 ? 1 : dt); draw(); animationFrameId = requestAnimationFrame(loop); }; animationFrameId = requestAnimationFrame(loop);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mousedown', handleMouseDown); window.removeEventListener('mouseup', handleMouseUp); window.removeEventListener('resize', handleResize); window.removeEventListener('blur', handleBlur); cancelAnimationFrame(animationFrameId); };
  }, [planet, upgrades]); 

  // (JSX Remains unchanged)
  return (
    <div ref={containerRef} className="relative w-full h-full bg-black overflow-hidden select-none">
      <canvas ref={canvasRef} className="block w-full h-full" />
      
      {/* UI Overlay */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none p-4 font-retro">
        {/* Top Left: Bars */}
        <div className="flex flex-col gap-2 w-56">
            <div className="flex items-center gap-3"> <span className="text-red-500 text-xs md:text-sm w-20">SUIT LV{upgrades.hull}</span> <div className="w-24 md:w-32 h-4 bg-gray-800 border border-gray-600"> <div className="h-full bg-red-600 transition-all duration-200" style={{ width: `${Math.max(0, (hudStats.health / maxHealth) * 100)}%` }} /> </div> <span className="text-xs md:text-sm text-gray-400">{Math.ceil(hudStats.health)}/{maxHealth}</span> </div>
            <div className="flex items-center gap-3"> <span className="text-orange-400 text-xs md:text-sm w-20">FUEL</span> <div className="w-24 md:w-32 h-3 bg-gray-800 border border-gray-600"> <div className="h-full bg-orange-500 transition-all duration-75" style={{ width: `${Math.max(0, (hudStats.fuel / hudStats.maxFuel) * 100)}%` }} /> </div> </div>
            <div className="text-yellow-400 text-xs md:text-sm mt-1">CORES: {hudStats.cores} / {gameState.current.totalCoresNeeded}</div>
        </div>
        <div className="absolute top-0 left-1/2 transform -translate-x-1/2 text-center pt-2"> 
            <div className={`text-xl md:text-3xl font-mono border-b-2 border-white/20 pb-2 ${hudStats.objective.includes('DESTROY') ? 'text-red-500 animate-pulse font-bold' : 'text-cyan-300'}`}> 
                {hudStats.objective} 
            </div> 
        </div>
        <div className="absolute top-4 right-4 text-right"> <div className="text-green-400 text-sm md:text-lg">SCORE: {hudStats.score.toString().padStart(6, '0')}</div> <div className="text-xs md:text-sm text-cyan-400 mt-1">WEAPON: {hudStats.weapon}</div> <div className="text-xs md:text-sm text-gray-400 mt-1">{planet.name}</div> </div>
      </div>
      {radioMsg && ( 
          <div className="absolute bottom-32 left-8 max-w-2xl bg-black/90 border-l-8 border-green-500 p-6 font-mono animate-in fade-in slide-in-from-bottom-4 shadow-2xl"> 
              <div className="text-green-700 text-lg mb-2 font-bold tracking-wider">INCOMING TRANSMISSION...</div> 
              <div className="text-green-300 leading-relaxed text-2xl">{radioMsg.typewriter}<span className="animate-pulse">_</span></div> 
          </div> 
      )}
      {gameState.current.introTimer > 20 && ( <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none"> <div className="text-4xl md:text-6xl font-retro text-cyan-400 animate-pulse bg-black/50 p-6 border-2 border-cyan-500"> MISSION START </div> <div className="text-white mt-6 font-mono text-2xl md:text-3xl bg-black/50 p-3"> DETECTED: {gameState.current.totalCoresNeeded} ENERGY CORES </div> <div className="text-yellow-400 mt-3 font-mono text-lg md:text-xl animate-bounce"> COLLECT THEM TO ESCAPE </div> </div> )}
      {bossStats.active && ( <div className="absolute top-20 left-1/2 -translate-x-1/2 text-center w-full max-w-lg pointer-events-none"> <div className="flex flex-col items-center animate-pulse"> <span className="text-red-600 text-sm md:text-base tracking-widest mb-1 font-bold">{bossStats.name}</span> <div className="w-80 h-6 bg-gray-900 border-2 border-red-900 relative"> <div className="h-full bg-red-600 transition-all duration-200" style={{width: `${(bossStats.hp / bossStats.maxHp) * 100}%`}} /> </div> </div> </div> )}
      <div className="absolute inset-0 z-50 pointer-events-none md:hidden flex flex-col justify-end pb-8 px-8"> <div className="flex justify-between items-end w-full h-48"> <div className="w-32 h-32 relative bg-white/10 rounded-full border-2 border-white/30 backdrop-blur-sm pointer-events-auto" onTouchStart={(e) => handleTouchStart(e, 'left')} onTouchMove={(e) => handleTouchMove(e, 'left')} onTouchEnd={(e) => handleTouchEnd(e, 'left')} onTouchCancel={(e) => handleTouchEnd(e, 'left')}> <div className="absolute w-12 h-12 bg-cyan-500/80 rounded-full shadow-[0_0_15px_cyan] top-1/2 left-1/2 -ml-6 -mt-6" style={{ transform: visualTouchState.leftJoystick.active ? `translate(${visualTouchState.leftJoystick.currX - visualTouchState.leftJoystick.originX}px, ${visualTouchState.leftJoystick.currY - visualTouchState.leftJoystick.originY}px)` : 'none' }} /> </div> <div className="flex gap-4 items-end"> <div className={`w-24 h-24 rounded-full border-4 border-yellow-500/50 flex items-center justify-center mb-4 pointer-events-auto transition-all ${visualTouchState.jumpBtn ? 'bg-yellow-500/80 scale-95' : 'bg-yellow-500/20'}`} onTouchStart={(e) => handleTouchStart(e, 'jump')} onTouchEnd={(e) => handleTouchEnd(e, 'jump')} onTouchCancel={(e) => handleTouchEnd(e, 'jump')}> <span className="font-retro text-[10px] text-yellow-200">JUMP</span> </div> <div className="w-32 h-32 relative bg-white/10 rounded-full border-2 border-red-500/30 backdrop-blur-sm pointer-events-auto" onTouchStart={(e) => handleTouchStart(e, 'right')} onTouchMove={(e) => handleTouchMove(e, 'right')} onTouchEnd={(e) => handleTouchEnd(e, 'right')} onTouchCancel={(e) => handleTouchEnd(e, 'right')}> <div className="absolute w-12 h-12 bg-red-500/80 rounded-full shadow-[0_0_15px_red] top-1/2 left-1/2 -ml-6 -mt-6" style={{ transform: visualTouchState.rightJoystick.active ? `translate(${visualTouchState.rightJoystick.currX - visualTouchState.rightJoystick.originX}px, ${visualTouchState.rightJoystick.currY - visualTouchState.rightJoystick.originY}px)` : 'none' }} /> </div> </div> </div> </div>
    </div>
  );
};

export default GameEngine;