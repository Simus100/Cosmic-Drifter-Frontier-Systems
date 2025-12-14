import React, { useState, useEffect, useRef } from 'react';
import GameEngine from './components/GameEngine';
import { generateStarSystem, generateSectorName } from './services/planetGenerator';
import { GameStatus, PlanetData, PlayerUpgrades } from './types';
import { playSound, initAudio } from './services/audioService';

const INITIAL_UPGRADES: PlayerUpgrades = {
  hull: 1,
  weapon: 1,
  thrusters: 1,
  speed: 1
};

const UPGRADE_COSTS = {
  hull: 5,
  weapon: 8,
  thrusters: 6,
  speed: 4
};

// New Sub-States for Hangar
type HangarMode = 'BRIDGE' | 'ENGINEERING' | 'NAVIGATION';

const App: React.FC = () => {
  const [status, setStatus] = useState<GameStatus>(GameStatus.MENU);
  const [planet, setPlanet] = useState<PlanetData | null>(null); // Selected Planet
  const [starSystem, setStarSystem] = useState<PlanetData[]>([]); // Current System
  const [currentSector, setCurrentSector] = useState<string>("Unknown Sector");
  const [finalScore, setFinalScore] = useState(0);
  const [endMessage, setEndMessage] = useState("");
  
  // Progression State
  const [totalCores, setTotalCores] = useState(5); // Increased to 5 for better early game balance
  const [upgrades, setUpgrades] = useState<PlayerUpgrades>(INITIAL_UPGRADES);
  
  // Ship State
  const [hangarMode, setHangarMode] = useState<HangarMode>('BRIDGE');
  const [selectedPlanetIndex, setSelectedPlanetIndex] = useState<number | null>(null);
  const [isWarping, setIsWarping] = useState(false);

  const handleHyperspaceJump = async () => {
    if (totalCores < 1) {
        playSound('ui'); // Should ideally be an error sound
        return;
    }
    
    setTotalCores(prev => prev - 1);
    setIsWarping(true);
    setSelectedPlanetIndex(null);
    setPlanet(null);
    playSound('thrust'); // Warp sound
    
    // Warp Animation Delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const data = await generateStarSystem();
    const newSector = generateSectorName();
    
    setStarSystem(data);
    setCurrentSector(newSector);
    setIsWarping(false);
    playSound('sensor');
  };

  const handleStartMission = () => {
      if (!planet) return;
      playSound('impact');
      setStatus(GameStatus.PLAYING);
  };

  const handleGameOver = (score: number, coresCollected: number, reason: string) => {
    const savedCores = Math.floor(coresCollected * 0.5);
    setTotalCores(prev => prev + savedCores);
    setFinalScore(score);
    setEndMessage(`${reason} ${savedCores > 0 ? `Recupero: ${savedCores} Cores.` : `Nessun nucleo salvato.`}`);
    setStatus(GameStatus.GAME_OVER);
  };

  const handleVictory = (score: number, collectedCores: number) => {
    const victoryBonus = 3;
    setFinalScore(score + 1000);
    setTotalCores(prev => prev + collectedCores + victoryBonus);
    setEndMessage(`Missione Compiuta. +${victoryBonus} Bonus Cores.`);
    setStatus(GameStatus.VICTORY);
  };

  const buyUpgrade = (type: keyof PlayerUpgrades) => {
    const cost = UPGRADE_COSTS[type] * upgrades[type];
    if (totalCores >= cost) {
      playSound('powerup');
      setTotalCores(prev => prev - cost);
      setUpgrades(prev => ({ ...prev, [type]: prev[type] + 1 }));
    } else {
        playSound('ui');
    }
  };

  const handleEnterShip = () => {
      initAudio();
      playSound('ui');
      setStatus(GameStatus.HANGAR);
      setHangarMode('BRIDGE');
      // Auto-scan a system if none exists (First load)
      if (starSystem.length === 0) {
          generateStarSystem().then(data => {
              setStarSystem(data);
              setCurrentSector(generateSectorName());
          });
      }
  };

  // --- Starmap Canvas Rendering ---
  const mapCanvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
      if (status === GameStatus.HANGAR && hangarMode === 'NAVIGATION' && mapCanvasRef.current) {
          const canvas = mapCanvasRef.current;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          
          let animId: number;
          const renderMap = () => {
              const w = canvas.width;
              const h = canvas.height;
              const cx = w / 2;
              const cy = h / 2;
              const time = Date.now();

              ctx.clearRect(0, 0, w, h);
              
              if (isWarping) {
                  // WARP EFFECT
                  ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'; 
                  ctx.fillRect(0,0,w,h);
                  ctx.strokeStyle = '#00ffff';
                  ctx.lineWidth = 2;
                  for(let i=0; i<50; i++) {
                      const x = Math.random() * w;
                      const y = Math.random() * h;
                      const len = Math.random() * 100 + 50;
                      ctx.beginPath();
                      ctx.moveTo(cx + (x-cx)*0.1, cy + (y-cy)*0.1);
                      ctx.lineTo(x, y);
                      ctx.stroke();
                  }
              } else {
                  // Grid
                  ctx.strokeStyle = 'rgba(0, 255, 255, 0.1)';
                  ctx.lineWidth = 1;
                  const gridSize = 40;
                  for(let x=0; x<w; x+=gridSize) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
                  for(let y=0; y<h; y+=gridSize) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }

                  // Sun
                  ctx.fillStyle = '#ffaa00';
                  ctx.shadowColor = '#ffaa00'; ctx.shadowBlur = 20;
                  ctx.beginPath(); ctx.arc(cx, cy, 15, 0, Math.PI*2); ctx.fill();
                  ctx.shadowBlur = 0;

                  // Planets
                  starSystem.forEach((p, idx) => {
                      const r = p.orbitRadius || 50;
                      const speed = p.orbitSpeed || 0.001;
                      const angle = time * speed + (idx * 2); // Spread them out
                      const px = cx + Math.cos(angle) * r;
                      const py = cy + Math.sin(angle) * r;

                      // Orbit Line
                      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
                      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.stroke();

                      // Planet Body
                      ctx.fillStyle = p.atmosphereColor;
                      
                      // Pulse Effect if selected
                      if (idx === selectedPlanetIndex) {
                          ctx.shadowColor = '#ffffff'; 
                          ctx.shadowBlur = 15; 
                          ctx.strokeStyle = '#fff'; 
                          ctx.lineWidth = 2;
                      } else {
                          ctx.shadowBlur = 0;
                      }
                      
                      ctx.beginPath(); ctx.arc(px, py, (p.size || 10) / 2, 0, Math.PI*2); ctx.fill();
                      if (idx === selectedPlanetIndex) ctx.stroke();

                      // Selection Target (Reticle)
                      if (idx === selectedPlanetIndex) {
                          const size = (p.size || 10) + 10;
                          const rot = time * 0.002;
                          ctx.strokeStyle = '#00ff00';
                          ctx.lineWidth = 2;
                          
                          ctx.save();
                          ctx.translate(px, py);
                          ctx.rotate(rot);
                          ctx.beginPath();
                          ctx.arc(0, 0, size, 0, Math.PI * 0.5); ctx.stroke();
                          ctx.beginPath();
                          ctx.arc(0, 0, size, Math.PI, Math.PI * 1.5); ctx.stroke();
                          ctx.restore();

                          // Name Tag
                          ctx.fillStyle = '#00ff00';
                          ctx.font = '14px monospace'; // Larger font
                          ctx.fillText(p.name, px + 22, py - 25);
                          
                          // Line to Name
                          ctx.strokeStyle = '#00ff00';
                          ctx.lineWidth = 1;
                          ctx.beginPath(); 
                          ctx.moveTo(px + 10, py - 10); 
                          ctx.lineTo(px + 20, py - 20); 
                          ctx.lineTo(px + 60, py - 20);
                          ctx.stroke();
                      }
                  });
              }

              animId = requestAnimationFrame(renderMap);
          };
          renderMap();
          return () => cancelAnimationFrame(animId);
      }
  }, [status, hangarMode, starSystem, selectedPlanetIndex, isWarping]);

  const handleMapClick = (e: React.MouseEvent) => {
      if (!mapCanvasRef.current || isWarping) return;
      const rect = mapCanvasRef.current.getBoundingClientRect();
      
      const scaleX = mapCanvasRef.current.width / rect.width;
      const scaleY = mapCanvasRef.current.height / rect.height;

      const clickX = (e.clientX - rect.left) * scaleX;
      const clickY = (e.clientY - rect.top) * scaleY;
      
      const w = mapCanvasRef.current.width;
      const h = mapCanvasRef.current.height;
      const cx = w/2; const cy = h/2;
      const time = Date.now();

      let clicked = false;
      starSystem.forEach((p, idx) => {
          const r = p.orbitRadius || 50;
          const speed = p.orbitSpeed || 0.001;
          const angle = time * speed + (idx * 2);
          const px = cx + Math.cos(angle) * r;
          const py = cy + Math.sin(angle) * r;
          
          const dist = Math.hypot(clickX - px, clickY - py);
          if (dist < 40) {
              playSound('ui');
              setSelectedPlanetIndex(idx);
              setPlanet(p);
              clicked = true;
          }
      });
  };

  const renderHangar = () => {
      return (
          <div className="relative w-full h-full flex flex-col items-center justify-center p-4">
              {/* Background - Cockpit View */}
              <div className="absolute inset-0 bg-gray-900 overflow-hidden pointer-events-none">
                  {/* Space Debris / Stars moving */}
                  <div className={`w-full h-full opacity-30 transition-transform duration-[2000ms] ${isWarping ? 'scale-[5] opacity-50' : 'scale-100'}`} style={{backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '50px 50px'}}></div>
                  {/* Cockpit Frame */}
                  <div className="absolute inset-0 border-[40px] border-gray-800 rounded-[50px] shadow-[inset_0_0_100px_black]"></div>
                  <div className="absolute bottom-0 w-full h-32 bg-gray-800 border-t-4 border-gray-600 flex justify-center items-center">
                      <div className={`text-gray-500 font-mono text-base ${isWarping ? 'text-red-500 animate-bounce' : 'animate-pulse'}`}>
                          {isWarping ? 'WARNING: HYPERSPACE JUMP IN PROGRESS' : `SYSTEMS ONLINE // ${currentSector}`}
                      </div>
                  </div>
              </div>

              {/* Main Interface Container */}
              <div className="z-10 w-full max-w-6xl h-[85vh] flex flex-col md:flex-row gap-6">
                  
                  {/* Left: Menu/Status */}
                  <div className="w-full md:w-1/4 bg-black/80 border-2 border-cyan-700 p-6 flex flex-col gap-6">
                      <div className="text-cyan-400 font-retro text-2xl border-b border-cyan-800 pb-2">SHIP COMMAND</div>
                      <button onClick={() => setHangarMode('BRIDGE')} disabled={isWarping} className={`p-4 text-left font-retro text-lg border ${hangarMode === 'BRIDGE' ? 'bg-cyan-900 border-cyan-400 text-white' : 'border-gray-700 text-gray-400 hover:text-white'}`}>BRIDGE</button>
                      <button onClick={() => setHangarMode('NAVIGATION')} disabled={isWarping} className={`p-4 text-left font-retro text-lg border ${hangarMode === 'NAVIGATION' ? 'bg-cyan-900 border-cyan-400 text-white' : 'border-gray-700 text-gray-400 hover:text-white'}`}>NAVIGATION</button>
                      <button onClick={() => setHangarMode('ENGINEERING')} disabled={isWarping} className={`p-4 text-left font-retro text-lg border ${hangarMode === 'ENGINEERING' ? 'bg-cyan-900 border-cyan-400 text-white' : 'border-gray-700 text-gray-400 hover:text-white'}`}>ENGINEERING</button>
                      <div className="mt-auto pt-6 border-t border-gray-700">
                          <div className="text-gray-500 text-sm">CORES</div>
                          <div className="text-yellow-400 font-retro text-4xl">{totalCores}</div>
                      </div>
                  </div>

                  {/* Right: Content Area */}
                  <div className="w-full md:w-3/4 bg-black/90 border-2 border-cyan-700 relative overflow-hidden flex flex-col">
                      
                      {/* BRIDGE MODE */}
                      {hangarMode === 'BRIDGE' && (
                          <div className="p-8 flex flex-col items-center justify-center h-full text-center space-y-8">
                              <h2 className="text-4xl font-retro text-cyan-200">CAPTAIN ON DECK</h2>
                              <p className="text-gray-400 font-mono max-w-lg text-lg leading-relaxed">
                                  Settore corrente: <span className="text-white">{currentSector}</span>.
                                  <br/>
                                  La nave è in attesa di ordini. 
                                  <br/><br/>
                                  Vai su <b>NAVIGATION</b> per scegliere un pianeta.
                                  <br/>
                                  Vai su <b>ENGINEERING</b> per potenziare la nave.
                              </p>
                              <div className="grid grid-cols-2 gap-10 text-left mt-8 w-full max-w-lg">
                                  <div className="p-6 border border-green-900 bg-green-900/20">
                                      <div className="text-green-500 text-sm mb-2">STATUS</div>
                                      <div className="text-white font-retro text-2xl">GREEN</div>
                                  </div>
                                  <div className="p-6 border border-yellow-900 bg-yellow-900/20">
                                      <div className="text-yellow-500 text-sm mb-2">JUMP DRIVE</div>
                                      <div className={`${totalCores > 0 ? 'text-white' : 'text-red-500'} font-retro text-2xl`}>{totalCores > 0 ? 'READY' : 'NO FUEL'}</div>
                                  </div>
                              </div>
                          </div>
                      )}

                      {/* NAVIGATION MODE */}
                      {hangarMode === 'NAVIGATION' && (
                          <div className="flex flex-col h-full">
                              <div className="bg-cyan-950/50 p-4 border-b border-cyan-800 flex justify-between items-center">
                                  <div className="flex items-center gap-6">
                                      <span className="text-cyan-400 font-retro text-xl pl-2">STAR MAP</span>
                                      <span className="text-gray-400 font-mono text-lg">{currentSector}</span>
                                  </div>
                                  
                                  <button 
                                    onClick={handleHyperspaceJump} 
                                    disabled={totalCores < 1 || isWarping}
                                    className={`px-6 py-3 text-sm font-mono border transition-all ${totalCores > 0 ? 'bg-orange-900 hover:bg-orange-700 text-orange-100 border-orange-500 shadow-[0_0_10px_rgba(255,165,0,0.3)]' : 'bg-gray-800 text-gray-500 border-gray-600 cursor-not-allowed'}`}
                                  >
                                    {isWarping ? 'WARP ENGAGED' : `FTL JUMP (-1 CORE)`}
                                  </button>
                              </div>
                              <div className="flex-1 relative bg-black">
                                  <canvas 
                                      ref={mapCanvasRef} 
                                      width={600} 
                                      height={400} 
                                      className="w-full h-full cursor-crosshair"
                                      onClick={handleMapClick}
                                  />
                                  
                                  {!planet && !isWarping && (
                                      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                                          <div className="bg-black/50 p-6 border border-cyan-500/30 text-cyan-500 font-retro text-sm animate-pulse">
                                              [ SELECT A PLANET TO SCAN ]
                                          </div>
                                      </div>
                                  )}
                                  
                                  {selectedPlanetIndex !== null && planet && !isWarping && (
                                      <div className="absolute bottom-6 right-6 w-96 bg-gray-900/95 border-2 border-green-500/50 p-0 text-left shadow-2xl animate-in fade-in slide-in-from-right-10 overflow-hidden">
                                          <div className="bg-green-900/30 p-3 border-b border-green-500/30 flex justify-between items-center">
                                              <h3 className="text-green-400 font-retro text-lg">{planet.name}</h3>
                                              <span className="text-xs text-green-300 animate-pulse">ONLINE</span>
                                          </div>
                                          
                                          <div className="p-5 space-y-4">
                                              <div className="grid grid-cols-2 gap-4 text-sm font-mono text-gray-300">
                                                  <div className="flex flex-col"><span className="text-gray-500 text-xs">GRAVITY</span> <span>{planet.gravity}G</span></div>
                                                  <div className="flex flex-col"><span className="text-gray-500 text-xs">THREAT</span> <span className="text-red-400 font-bold">LVL {planet.enemyDensity}</span></div>
                                                  <div className="flex flex-col"><span className="text-gray-500 text-xs">ATMOSPHERE</span> <span className="text-white" style={{color: planet.atmosphereColor}}>DENSE</span></div>
                                                  <div className="flex flex-col"><span className="text-gray-500 text-xs">BIOME</span> <span className="text-yellow-300 uppercase">{planet.allowedBiomes[0]}</span></div>
                                              </div>
                                              
                                              <div className="mt-2 p-3 bg-black border border-gray-700 text-xs text-gray-400 italic leading-relaxed h-24 overflow-y-auto">
                                                  {planet.description}
                                              </div>

                                              <button 
                                                  onClick={handleStartMission}
                                                  className="mt-2 w-full py-4 bg-green-700 hover:bg-green-600 text-white font-retro text-lg border border-green-400 shadow-[0_0_15px_rgba(0,255,0,0.3)] transition-all hover:scale-[1.02]"
                                              >
                                                  LAUNCH DROPSHIP [ &gt;&gt;&gt; ]
                                              </button>
                                          </div>
                                      </div>
                                  )}
                              </div>
                          </div>
                      )}

                      {/* ENGINEERING MODE */}
                      {hangarMode === 'ENGINEERING' && (
                          <div className="p-8 h-full overflow-y-auto">
                              <h2 className="text-3xl font-retro text-orange-400 mb-8 border-b border-orange-900/50 pb-4">WORKBENCH</h2>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  {[
                                      { id: 'hull', name: 'TITANIUM PLATING', desc: 'Increases Max HP', stat: '+25 HP' },
                                      { id: 'weapon', name: 'PLASMA COIL', desc: 'Increases Damage Output', stat: '+20% DMG' },
                                      { id: 'thrusters', name: 'ION JETS', desc: 'Boosts Jump Height', stat: '+JUMP' },
                                      { id: 'speed', name: 'SERVO MOTORS', desc: 'Increases Movement Speed', stat: '+SPEED' },
                                  ].map((item) => {
                                      const key = item.id as keyof PlayerUpgrades;
                                      const level = upgrades[key];
                                      const cost = UPGRADE_COSTS[key] * level;
                                      const canAfford = totalCores >= cost;
                                      return (
                                          <div key={item.id} className="bg-gray-900 border border-gray-700 p-5 flex justify-between items-center">
                                              <div>
                                                  <div className="text-orange-300 font-mono text-lg mb-1">{item.name} <span className="text-gray-500 text-sm ml-2">LV {level}</span></div>
                                                  <div className="text-green-600 text-sm font-bold">{item.stat}</div>
                                              </div>
                                              <button 
                                                  onClick={() => buyUpgrade(key)}
                                                  disabled={!canAfford}
                                                  className={`px-4 py-2 font-retro text-sm border ${canAfford ? 'border-yellow-600 text-yellow-500 hover:bg-yellow-900' : 'border-gray-800 text-gray-700'}`}
                                              >
                                                  UPGRADE ({cost}C)
                                              </button>
                                          </div>
                                      );
                                  })}
                              </div>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      );
  };

  const renderContent = () => {
    switch (status) {
      case GameStatus.MENU:
        return (
          <div className="text-center space-y-10 z-10 p-10 bg-black/80 border-4 border-cyan-500 rounded-xl max-w-2xl w-full m-4 shadow-[0_0_50px_rgba(0,255,255,0.2)]">
            <h1 className="text-5xl md:text-7xl font-retro text-transparent bg-clip-text bg-gradient-to-b from-cyan-300 to-blue-600 mb-6 animate-pulse">
              COSMIC DRIFTER
            </h1>
            <p className="text-gray-400 font-mono text-2xl tracking-widest">PROTOCOL: GENESIS</p>
            <div className="text-lg text-gray-500 max-w-lg mx-auto leading-relaxed">
              La tua nave è in orbita. Usa la console di navigazione per scansionare i settori vicini e atterrare sui pianeti per recuperare risorse.
            </div>
            
            <button 
              onClick={handleEnterShip}
              className="px-10 py-5 bg-cyan-900 hover:bg-cyan-700 text-cyan-100 font-retro text-2xl border-2 border-cyan-500 transition-all hover:scale-105 hover:shadow-[0_0_30px_rgba(0,255,255,0.4)] w-full md:w-auto mt-8"
            >
              BOARD SHIP
            </button>
          </div>
        );

      case GameStatus.HANGAR:
        return renderHangar();

      case GameStatus.PLAYING:
        return planet ? (
          <GameEngine 
            planet={planet} 
            upgrades={upgrades}
            onGameOver={handleGameOver}
            onVictory={handleVictory}
          />
        ) : null;

      case GameStatus.GAME_OVER:
      case GameStatus.VICTORY:
        return (
          <div className="text-center z-10 bg-black/90 p-12 border-4 border-red-500 rounded-xl max-w-2xl mx-4">
            <h2 className={`text-3xl md:text-5xl font-retro mb-6 ${status === GameStatus.VICTORY ? 'text-green-500' : 'text-red-600'}`}>
              {status === GameStatus.VICTORY ? 'MISSIONE COMPIUTA' : 'SEGNALE PERSO'}
            </h2>
            <p className="text-xl md:text-2xl text-gray-300 font-mono mb-8">{endMessage}</p>
            
            <div className="flex justify-around mb-10 gap-8">
               <div className="text-center">
                  <div className="text-sm text-gray-500 mb-1">PUNTEGGIO</div>
                  <div className="text-2xl md:text-3xl text-white font-retro">{finalScore}</div>
               </div>
               <div className="text-center">
                  <div className="text-sm text-gray-500 mb-1">NUCLEI TOTALI</div>
                  <div className="text-2xl md:text-3xl text-yellow-400 font-retro">{totalCores}</div>
               </div>
            </div>

            <button 
              onClick={() => { playSound('ui'); setStatus(GameStatus.HANGAR); setHangarMode('BRIDGE'); }}
              className="px-8 py-4 bg-gray-800 hover:bg-gray-700 text-white font-retro text-xl border border-gray-500 w-full"
            >
              RITORNA IN ORBITA
            </button>
          </div>
        );
      default: return null;
    }
  };

  return (
    <div className="fixed inset-0 w-screen h-screen bg-gray-900 flex flex-col items-center justify-center relative overflow-hidden">
      {/* CRT Scanlines Effect */}
      <div className="scanlines"></div>
      {renderContent()}
    </div>
  );
};

export default App;