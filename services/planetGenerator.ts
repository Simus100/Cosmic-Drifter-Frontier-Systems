

import { PlanetData, BiomeStyle, WeatherType } from "../types";

// --- Data Lists ---
const PREFIXES = ["Xen", "Kry", "Vor", "Zan", "Glar", "Iso", "Neo", "Proxi", "Vex", "Tar"];
const SUFFIXES = ["os", "on", "ia", "us", "prime", "terra", "9", "IV", "X", "V"];
const GREEK = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Omega", "Sigma"];

interface BiomeTemplate {
  type: string;
  atmosphere: string[];
  ground: string[];
  enemy: string;
  flora: string[]; // Potential vegetation colors
  description: string;
  allowedStyles: BiomeStyle[];
  probableWeather: WeatherType[];
  baseVegDensity: number; // 0 to 1
  baseWeatherVol: number; // 0 to 1
}

const BIOMES: BiomeTemplate[] = [
  {
    type: "Volcanic",
    atmosphere: ["#330000", "#550000", "#2a1a1a"],
    ground: ["#441111", "#220000", "#552200"],
    enemy: "#ffaa00",
    flora: ["#880000", "#333333", "#ff5500"], // Burnt, ash, or ember colors
    description: "Attività sismica rilevata. Temperature superficiali estreme.",
    allowedStyles: ["crags", "plateau"],
    probableWeather: ["ash", "clear"],
    baseVegDensity: 0.1,
    baseWeatherVol: 0.7
  },
  {
    type: "Toxic",
    atmosphere: ["#0a2a0a", "#001100", "#1a331a"],
    ground: ["#2a4a2a", "#1a2a1a", "#335533"],
    enemy: "#00ff00",
    flora: ["#ccff00", "#aa00ff", "#00ffcc"], // Neon, mutant colors
    description: "Atmosfera corrosiva. Presenza di gas nocivi.",
    allowedStyles: ["plateau", "spire", "dunes"],
    probableWeather: ["acid_rain", "clear"],
    baseVegDensity: 0.4,
    baseWeatherVol: 0.6
  },
  {
    type: "Ice",
    atmosphere: ["#001133", "#002244", "#aaeeff"],
    ground: ["#ccffff", "#aaddff", "#eeffff"],
    enemy: "#0099ff",
    flora: ["#ffffff", "#aaddff", "#88aaff"], // Crystal/pale colors
    description: "Zero assoluto vicino. Superficie a basso attrito.",
    allowedStyles: ["spire", "crags", "plateau"],
    probableWeather: ["snow", "clear"],
    baseVegDensity: 0.2,
    baseWeatherVol: 0.5
  },
  {
    type: "Desert",
    atmosphere: ["#443311", "#664422", "#ffeecc"],
    ground: ["#ccaa66", "#aa8844", "#eedd99"],
    enemy: "#aa4400",
    flora: ["#665533", "#446622", "#aa8822"], // Dry scrub colors
    description: "Venti sabbiosi ad alta velocità. Risorse idriche assenti.",
    allowedStyles: ["dunes", "plateau", "crags"],
    probableWeather: ["sandstorm", "clear"],
    baseVegDensity: 0.15,
    baseWeatherVol: 0.4
  },
  {
    type: "Void",
    atmosphere: ["#000000", "#110022", "#220033"],
    ground: ["#333333", "#222222", "#440044"],
    enemy: "#ff00ff",
    flora: ["#4400aa", "#222222", "#ff0088"], // Dark, mysterious colors
    description: "Anomalia gravitazionale. Il pianeta sembra svanire nell'oscurità.",
    allowedStyles: ["spire", "plateau"],
    probableWeather: ["rain", "clear"],
    baseVegDensity: 0.3,
    baseWeatherVol: 0.3
  }
];

// --- Helper Functions ---
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const clamp = (num: number, min: number, max: number) => Math.min(Math.max(num, min), max);

// Generate a cool sector name
export const generateSectorName = (): string => {
    return `${pick(PREFIXES)}-${randInt(100, 999)} ${pick(GREEK)}`;
};

// Renamed to be an internal helper, not the main export if using systems
const generateSinglePlanet = (indexInSystem: number): PlanetData => {
  // 1. Generate Name
  const name = `${pick(PREFIXES)}${pick(SUFFIXES).toLowerCase()} ${pick(["Alpha", "Beta", "Gamma", "Omicron", ""])}`.trim();

  // 2. Select Biome Template based on some "distance from star" logic logic or random
  // Hotter biomes closer (index 0), Colder further (index 4)
  let validTemplates = BIOMES;
  if (indexInSystem === 0) validTemplates = BIOMES.filter(b => b.type === 'Volcanic' || b.type === 'Desert');
  else if (indexInSystem > 2) validTemplates = BIOMES.filter(b => b.type === 'Ice' || b.type === 'Void');
  
  if (validTemplates.length === 0) validTemplates = BIOMES;
  const template = pick(validTemplates);

  // 3. Stats
  const gravity = parseFloat((Math.random() * 0.55 + 0.85).toFixed(2));
  const enemyDensity = randInt(2, 9);
  const rareLootChance = parseFloat(Math.random().toFixed(2));

  // 4. Randomized Environmental Factors
  let vegDensity = template.baseVegDensity + (Math.random() * 0.4 - 0.2);
  vegDensity = clamp(vegDensity, 0, 1.0);
  if (Math.random() < 0.15) vegDensity = Math.min(1.0, vegDensity + 0.5);

  let weatherVol = template.baseWeatherVol + (Math.random() * 0.4 - 0.2);
  weatherVol = clamp(weatherVol, 0, 1.0);
  if (Math.random() < 0.2) weatherVol = 0; 

  // 5. Construct Description
  let desc = template.description;
  if (template.allowedStyles.includes('dunes')) desc += " Rilevate zone dunali.";
  if (template.allowedStyles.includes('spire')) desc += " Formazioni a guglia instabili.";
  if (vegDensity < 0.1) desc += " Biosfera assente.";
  else if (vegDensity > 0.7) desc += " Rilevata densa vegetazione aliena.";

  const weatherTraits: WeatherType[] = [...template.probableWeather];
  if (Math.random() < 0.3) weatherTraits.push('clear');
  
  if (weatherVol > 0.7) desc += " ALLERTA: Tempeste imprevedibili e frequenti.";
  else if (weatherVol < 0.1) desc += " Clima stabile.";

  return {
    name: name,
    description: desc,
    gravity: gravity,
    atmosphereColor: pick(template.atmosphere),
    groundColor: pick(template.ground),
    enemyColor: template.enemy,
    floraColor: pick(template.flora),
    enemyDensity: enemyDensity,
    rareLootChance: rareLootChance,
    allowedBiomes: template.allowedStyles,
    weatherTraits: Array.from(new Set(weatherTraits)),
    vegetationDensity: parseFloat(vegDensity.toFixed(2)),
    weatherVolatility: parseFloat(weatherVol.toFixed(2)),
    // Navigation Props
    orbitRadius: 60 + (indexInSystem * 40), // Base distance
    orbitSpeed: 0.0005 + (Math.random() * 0.001) - (indexInSystem * 0.0001),
    size: 10 + Math.random() * 10
  };
};

export const generateStarSystem = async (): Promise<PlanetData[]> => {
    // Simulate Scan Time
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const count = randInt(3, 5);
    const system: PlanetData[] = [];
    for(let i=0; i<count; i++) {
        system.push(generateSinglePlanet(i));
    }
    return system;
};

// Keep compatibility if App still calls this directly
export const generatePlanet = async (): Promise<PlanetData> => {
    return generateSinglePlanet(randInt(0, 4));
};