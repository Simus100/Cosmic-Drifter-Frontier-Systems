

// Audio Context Singleton
let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;

export const initAudio = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.3; // Master Volume
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
};

type SoundType = 'shoot' | 'jump' | 'explosion' | 'pickup' | 'hurt' | 'powerup' | 'ui' | 'thrust' | 'sensor' | 'impact';

export const playSound = (type: SoundType, variant: string = 'blaster') => {
  if (!audioCtx || !masterGain) return;

  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.connect(gain);
  gain.connect(masterGain);

  if (type === 'shoot') {
    if (variant === 'blaster') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, t);
        osc.frequency.exponentialRampToValueAtTime(100, t + 0.1);
        gain.gain.setValueAtTime(0.5, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
        osc.start(t);
        osc.stop(t + 0.1);
    } else if (variant === 'scatter') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.exponentialRampToValueAtTime(50, t + 0.15);
        gain.gain.setValueAtTime(0.6, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
        osc.start(t);
        osc.stop(t + 0.15);
    } else if (variant === 'rapid') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1200, t);
        osc.frequency.exponentialRampToValueAtTime(600, t + 0.05);
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
        osc.start(t);
        osc.stop(t + 0.05);
    } else if (variant === 'sniper') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(2000, t);
        osc.frequency.exponentialRampToValueAtTime(100, t + 0.3);
        gain.gain.setValueAtTime(0.7, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
        osc.start(t);
        osc.stop(t + 0.3);
    } else if (variant === 'launcher') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.linearRampToValueAtTime(100, t + 0.2);
        gain.gain.setValueAtTime(0.5, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
        osc.start(t);
        osc.stop(t + 0.2);
    }
  } 
  else if (type === 'jump') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.linearRampToValueAtTime(300, t + 0.2);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.linearRampToValueAtTime(0.01, t + 0.2);
    osc.start(t);
    osc.stop(t + 0.2);
  }
  else if (type === 'thrust') {
    const bufferSize = audioCtx.sampleRate * 0.1; 
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(300, t);

    noise.connect(filter);
    filter.connect(gain);
    
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.linearRampToValueAtTime(0.01, t + 0.1);
    
    noise.start(t);
    return;
  }
  else if (type === 'pickup') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(987, t);
    osc.frequency.setValueAtTime(1318, t + 0.05);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.linearRampToValueAtTime(0.01, t + 0.3);
    osc.start(t);
    osc.stop(t + 0.3);
  }
  else if (type === 'sensor') {
    // High pitch sonar ping
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1500, t);
    osc.frequency.linearRampToValueAtTime(1500, t + 0.05);
    gain.gain.setValueAtTime(0.0, t);
    gain.gain.linearRampToValueAtTime(0.1, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.start(t);
    osc.stop(t + 0.15);
  }
  else if (type === 'impact') {
    // Heavy thud
    osc.type = 'square';
    osc.frequency.setValueAtTime(100, t);
    osc.frequency.exponentialRampToValueAtTime(10, t + 0.3);
    gain.gain.setValueAtTime(0.8, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
    osc.start(t);
    osc.stop(t + 0.3);
  }
  else if (type === 'powerup') {
    osc.type = 'square';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.setValueAtTime(554, t + 0.1);
    osc.frequency.setValueAtTime(659, t + 0.2);
    osc.frequency.setValueAtTime(880, t + 0.3);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.linearRampToValueAtTime(0.01, t + 0.5);
    osc.start(t);
    osc.stop(t + 0.5);
  }
  else if (type === 'hurt') {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, t);
    osc.frequency.linearRampToValueAtTime(50, t + 0.1);
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.linearRampToValueAtTime(0.01, t + 0.1);
    osc.start(t);
    osc.stop(t + 0.1);
  }
  else if (type === 'ui') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800, t);
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
    osc.start(t);
    osc.stop(t + 0.05);
  }
  else if (type === 'explosion') {
    const bufferSize = audioCtx.sampleRate * 0.5;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1000, t);
    filter.frequency.exponentialRampToValueAtTime(100, t + 0.4);

    noise.connect(filter);
    filter.connect(gain);
    
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
    
    noise.start(t);
    return; 
  }
};
