export enum GameStatus {
  MENU = 'MENU',
  HANGAR = 'HANGAR',
  LOADING_PLANET = 'LOADING_PLANET',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER',
  VICTORY = 'VICTORY'
}

export type BiomeStyle = 'dunes' | 'crags' | 'spire' | 'plateau';

export type EnemyArchetype = 'crawler' | 'sentinel' | 'dasher' | 'hornet' | 'guardian' | 'neutral' | 'sandworm' | 'shielder' | 'spore';

export type WeaponType = 'blaster' | 'scatter' | 'rapid' | 'sniper' | 'launcher';

export type HazardType = 'lava' | 'acid' | 'spikes' | 'ice' | 'geyser' | 'electric' | 'none';

export type WeatherType = 'clear' | 'rain' | 'acid_rain' | 'snow' | 'ash' | 'sandstorm';

export interface WeaponStats {
  name: string;
  damageMult: number;
  fireRate: number; // Frames between shots
  speed: number;
  count: number; // Projectiles per shot
  spread: number; // In radians
  recoil: number;
  color: string;
  isExplosive?: boolean;
  gravity?: number; // If defined, projectile arcs
  pierce?: number; // How many enemies it can hit
  knockback: number; // New: Force applied to enemies
}

export interface PlayerUpgrades {
  hull: number;     // Max HP
  weapon: number;   // Damage
  thrusters: number;// Jump height
  speed: number;    // Move speed
}

export interface PlanetData {
  name: string;
  description: string;
  gravity: number; // 1.0 is normal, 0.5 low, 1.5 high
  atmosphereColor: string;
  groundColor: string;
  enemyColor: string;
  floraColor: string; // Base color
  enemyDensity: number; // 1-10
  rareLootChance: number;
  allowedBiomes: BiomeStyle[]; // List of biomes that can appear on this planet
  weatherTraits: WeatherType[]; // Possible weather for this planet
  vegetationDensity: number; // 0.0 to 1.0 (Barren to Lush)
  weatherVolatility: number; // 0.0 to 1.0 (Stable to Chaotic)
  
  // Navigation Props
  orbitRadius?: number; // Distance from star in Starmap
  orbitSpeed?: number; // Speed of rotation in Starmap
  size?: number; // Visual size in Starmap
}

export interface Vector2 {
  x: number;
  y: number;
}

export interface Hazard {
  x: number;
  width: number;
  type: HazardType;
}

export interface Entity {
  id: string;
  pos: Vector2;
  vel: Vector2;
  size: Vector2;
  color: string;
  type: 'player' | 'enemy' | 'projectile' | 'enemy_projectile' | 'loot' | 'platform';
  health: number;
  maxHealth: number;
  isGrounded: boolean;
  markedForDeletion: boolean;
  // Visuals
  facingRight: boolean;
  variant: number; // 0-3 for different shapes/types
  animOffset: number; // Random seed for animation timing
  hitTimer: number; // >0 means entity flashes white
  
  // Player Specifics
  fuel?: number;
  maxFuel?: number;
  coyoteTimer?: number; // Frames allowing jump after leaving ground

  // AI & Behavior
  archetype?: EnemyArchetype;
  aiState?: 'idle' | 'alert' | 'chase' | 'attack' | 'flee' | 'charge' | 'phase1' | 'phase2';
  attackTimer?: number; // Cooldown for shooting/dashing
  alertTimer?: number; // Time spent in "!" state before attacking
  targetPos?: Vector2; // For dash aiming or patrolling
  rarity?: 'common' | 'elite'; // Elite enemies are tougher
  
  // New AI Props
  isBurrowed?: boolean; // Used for Sandworm (invulnerable state)
  shieldHp?: number;
  
  // Weapon/Loot specifics
  lootType?: 'core' | 'weapon' | 'health';
  coreTier?: number; // 1: Common, 2: Rare, 3: Critical (Final)
  weaponType?: WeaponType; // For loot or current projectile type
  pierceCount?: number;
  isExplosive?: boolean;
}

export interface Particle {
  id: string;
  pos: Vector2;
  vel: Vector2;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  type?: 'weather' | 'debris' | 'casing' | 'bubble'; // 'casing' has bounce physics
  rotation?: number;
  rotSpeed?: number;
}

export interface FloatingText {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  velY: number;
}

export interface CelestialBody {
  id: string;
  x: number;
  y: number;
  radius: number;
  color: string; // Base color
  type: 'sun' | 'moon' | 'gas_giant' | 'broken_moon';
  hasRings?: boolean;
  details?: { x: number, y: number, r: number, color: string }[]; // Craters or spots
  orbitPhase: number; // 0 to 1. Determines when it rises/sets in day cycle
  textureSeed: number; // For procedural bands/noise
}

export type StemType = 'straight' | 'twisted' | 'segmented' | 'cactus' | 'shard' | 'bulbous' | 'vine' | 'spiral' | 'crystalline';
export type FoliageType = 'none' | 'canopy' | 'fern' | 'bulb' | 'spikes' | 'weeping' | 'pods' | 'flower' | 'luminescent' | 'giant_leaf' | 'tentacles';

export interface Vegetation {
  x: number;
  y: number;
  height: number;
  width: number; // Stem width
  
  stemType: StemType;
  foliageType: FoliageType;
  
  colorStem: string;
  colorFoliage: string;
  colorDetail?: string; // For spots/stripes
  
  swaySpeed: number;
  swayAmount: number;
  variant: number; // Random seed for specific drawing details
  isTitan: boolean; // Is this a giant plant?
  
  currentBend: number; // New: Physics bending state
}