import { WeaponStats, WeaponType } from "./types";

// LOGICAL DIMENSIONS (Used for generation scale references, not fixed rendering)
export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;

export const PHYSICS = {
  GRAVITY: 0.5,
  FRICTION: 0.92,       // Increased for snappy ground movement (was 0.85)
  AIR_FRICTION: 0.88,   // Slightly lower for air control
  PLAYER_SPEED: 0.8,
  JUMP_FORCE: 10,       
  JETPACK_FORCE: 0.6,   
  JETPACK_FUEL_CONSUMPTION: 1.5, 
  JETPACK_FUEL_RECHARGE: 3.0, 
  MAX_SPEED: 6,
  PROJECTILE_SPEED: 10,
  RECOIL: 1.5, 
  COYOTE_FRAMES: 8,     // Forgiveness frames for jumping
  INVULNERABILITY_FRAMES: 60, // 1 Second of I-Frames (was ~10)
};

export const ENTITY_SIZE = {
  PLAYER: { x: 32, y: 32 },
  CRAWLER: { x: 32, y: 24 },
  SENTINEL: { x: 28, y: 40 },
  DASHER: { x: 48, y: 32 },
  HORNET: { x: 24, y: 24 },
  NEUTRAL: { x: 20, y: 16 }, // Small critter
  GUARDIAN: { x: 80, y: 80 }, 
  SANDWORM: { x: 40, y: 80 },
  SHIELDER: { x: 32, y: 40 },
  SPORE: { x: 24, y: 24 },
  PROJECTILE: { x: 8, y: 4 },
  ENEMY_PROJECTILE: { x: 6, y: 6 },
  LOOT: { x: 16, y: 16 },
  WEAPON_DROP: { x: 24, y: 24 },
  HEALTH_DROP: { x: 16, y: 16 },
};

export const ENEMY_STATS = {
  CRAWLER: { hp: 20, speed: 1.5, score: 30, aggroRange: 300 },
  SENTINEL: { hp: 15, speed: 1.0, score: 60, range: 400, aggroRange: 500 }, 
  DASHER: { hp: 35, speed: 0.8, dashSpeed: 8, score: 100, aggroRange: 350 }, 
  HORNET: { hp: 10, speed: 2.2, score: 40, aggroRange: 400 }, 
  NEUTRAL: { hp: 5, speed: 0.5, score: 5, aggroRange: 0 }, // Passive
  GUARDIAN: { hp: 500, speed: 1.5, score: 5000, aggroRange: 9999 },
  SANDWORM: { hp: 60, speed: 0, score: 150, aggroRange: 300 },
  SHIELDER: { hp: 40, speed: 0.8, score: 80, aggroRange: 400 },
  SPORE: { hp: 10, speed: 0, score: 20, aggroRange: 150 }
};

export const INITIAL_PLAYER_STATS = {
  health: 100,
  maxHealth: 100,
  ammo: 50,
};

export const WEAPONS: Record<WeaponType, WeaponStats> = {
  blaster: {
    name: "BLASTER",
    damageMult: 1.0,
    fireRate: 11,
    speed: 12,
    count: 1,
    spread: 0.05,
    recoil: 2,
    color: "#00ffff",
    knockback: 2 // Light knockback
  },
  scatter: {
    name: "SCATTER",
    damageMult: 0.6,
    fireRate: 45,
    speed: 10,
    count: 5,
    spread: 0.3,
    recoil: 8,
    color: "#ffaa00",
    knockback: 6 // Heavy knockback
  },
  rapid: {
    name: "PULSE",
    damageMult: 0.4,
    fireRate: 5,
    speed: 14,
    count: 1,
    spread: 0.15,
    recoil: 0.5,
    color: "#aa00ff",
    knockback: 0.5 // Minimal knockback
  },
  sniper: {
    name: "MAGNUM",
    damageMult: 3.5,
    fireRate: 70,
    speed: 25,
    count: 1,
    spread: 0,
    recoil: 5,
    color: "#ff0000",
    pierce: 3,
    knockback: 8 // Very heavy knockback
  },
  launcher: {
    name: "GRENADE",
    damageMult: 2.5,
    fireRate: 50,
    speed: 8,
    count: 1,
    spread: 0.1,
    recoil: 4,
    color: "#00ff00",
    gravity: 0.2,
    isExplosive: true,
    knockback: 10 // Explosive knockback
  }
};

export const HEALTH_DROP_SIZE = 16;