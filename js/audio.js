export let soundsReady = false;
let introSynth, dotSynth, powerPelletSynth, eatGhostSynth, deathSynth;
let dotSoundTimeout;
let dotSoundIsCoolingDown = false;
let audioContextStarted = false;

// 啟動 AudioContext（需要用戶互動）
async function startAudioContext() {
    if (typeof Tone !== 'undefined' && !audioContextStarted) {
        try {
            if (Tone.context.state !== 'running') {
                await Tone.start();
                console.log('🔊 AudioContext 已啟動');
            }
            audioContextStarted = true;
        } catch (error) {
            console.warn('AudioContext 啟動失敗:', error);
        }
    }
}

export function setupSounds() {
    if (typeof Tone !== 'undefined') {
        introSynth = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: "triangle8" },
            envelope: { attack: 0.02, decay: 0.1, sustain: 0.3, release: 0.4 },
            volume: -10
        }).toDestination();

        dotSynth = new Tone.MembraneSynth({
            pitchDecay: 0.008,
            octaves: 2,
            oscillator: { type: "square4" },
            envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.1 },
            volume: -25
        }).toDestination();
        
        powerPelletSynth = new Tone.Synth({
            oscillator: { type: "sawtooth" },
            envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.3 },
            volume: -12
        }).toDestination();

        eatGhostSynth = new Tone.NoiseSynth({
            noise: { type: "white" },
            envelope: { attack: 0.005, decay: 0.1, sustain: 0, release: 0.1 },
            volume: -15
        }).toDestination();


        deathSynth = new Tone.PolySynth(Tone.FMSynth, {
             harmonicity: 3.01,
             modulationIndex: 14,
             envelope: { attack: 0.2, decay: 0.3, sustain: 0.1, release: 1.2 },
             modulationEnvelope: { attack: 0.01, decay: 0.5, sustain: 0.2, release: 0.1 },
             volume: -8
        }).toDestination();
        soundsReady = true;
    } else {
        console.warn("Tone.js 未載入，音效將不可用。");
    }
}

export async function playStartSound() {
    if (!soundsReady || !Tone.now || !introSynth) return;
    await startAudioContext();
    const now = Tone.now();
    introSynth.triggerAttackRelease(["C4", "E4", "G4"], "8n", now);
    introSynth.triggerAttackRelease(["E4", "G4", "C5"], "8n", now + 0.25);
    introSynth.triggerAttackRelease(["G4", "C5", "E5"], "4n", now + 0.5);
}

export async function playDotSound() {
    if (!soundsReady || !Tone.now || !dotSynth) return;
    await startAudioContext();
    clearTimeout(dotSoundTimeout);
    dotSoundTimeout = setTimeout(() => {
        if (dotSynth && typeof dotSynth.triggerAttackRelease === 'function') {
            dotSynth.triggerAttackRelease("C4", "32n", Tone.now());
        }
    }, 10);
}

export function playPowerPelletSound() {
    if (!soundsReady || !Tone.now || !powerPelletSynth) return;
    const now = Tone.now();
    powerPelletSynth.triggerAttackRelease("A4", "16n", now);
    powerPelletSynth.triggerAttackRelease("C#5", "16n", now + 0.1);
    powerPelletSynth.triggerAttackRelease("E5", "8n", now + 0.2);
}

export function playEatGhostSound() {
    if (!soundsReady || !Tone.now || !eatGhostSynth) return;
    eatGhostSynth.triggerAttackRelease("0.2n", Tone.now());
}

export function playDeathSound() {
    if (!soundsReady || !Tone.now || !deathSynth) return;
    const now = Tone.now();
    deathSynth.triggerAttackRelease(["C3", "Eb3", "Gb3"], "1n", now);
    deathSynth.triggerAttackRelease(["C2", "Eb2", "Gb2"], "1n", now + 0.1); 
}