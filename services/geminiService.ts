

import { GoogleGenAI, Type } from "@google/genai";
import { PlanetData } from "../types";

// Note: In a real production app, move API calls to backend to protect key.
// For this demo, we use process.env.API_KEY as requested.

const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key not found via process.env.API_KEY");
  }
  return new GoogleGenAI({ apiKey });
};

export const generatePlanet = async (): Promise<PlanetData> => {
  const ai = getAiClient();
  
  const prompt = `
    Genera un pianeta fantascientifico procedurale per un videogioco 2D platformer.
    
    Includi:
    - vegetationDensity: da 0.0 (deserto) a 1.0 (giungla).
    - weatherVolatility: da 0.0 (mai) a 1.0 (sempre tempesta).
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            description: { type: Type.STRING },
            gravity: { type: Type.NUMBER },
            atmosphereColor: { type: Type.STRING },
            groundColor: { type: Type.STRING },
            enemyColor: { type: Type.STRING },
            floraColor: { type: Type.STRING },
            enemyDensity: { type: Type.NUMBER },
            rareLootChance: { type: Type.NUMBER },
            allowedBiomes: { 
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            weatherTraits: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            vegetationDensity: { type: Type.NUMBER },
            weatherVolatility: { type: Type.NUMBER },
          },
          required: ["name", "description", "gravity", "atmosphereColor", "groundColor", "enemyColor", "floraColor", "enemyDensity", "rareLootChance", "allowedBiomes", "weatherTraits", "vegetationDensity", "weatherVolatility"],
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error("No data returned from Gemini");
    
    return JSON.parse(text) as PlanetData;
  } catch (error) {
    console.error("Gemini Generation Error:", error);
    // Fallback data if API fails or quota exceeded
    return {
      name: "LV-426 (Simulation)",
      description: "Connessione al database galattico fallita. Generazione protocollo di emergenza.",
      gravity: 0.8,
      atmosphereColor: "#1a1a2e",
      groundColor: "#4e4e50",
      enemyColor: "#e94560",
      floraColor: "#00ff00",
      enemyDensity: 5,
      rareLootChance: 0.2,
      allowedBiomes: ["crags"],
      weatherTraits: ["acid_rain", "clear"],
      vegetationDensity: 0.3,
      weatherVolatility: 0.5
    };
  }
};