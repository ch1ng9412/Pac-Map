export let soundsReady = false;
let introSynth, dotSynth, powerPelletSynth, eatGhostSynth, deathSynth;
let dotSoundTimeout;
let dotSoundIsCoolingDown = false;
let audioContextStarted = false;

// BGM 音頻元素
let homepageBGM = null;
let gameBGM = null;
let settlementBGM = null;
let currentBGM = null;

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

    // 初始化 BGM 音頻元素
    setupBGM();
}

// 初始化 BGM 音頻元素
function setupBGM() {
    try {
        // 獲取設定的 BGM 音量
        const bgmVolume = window.gameSettings?.getSetting('bgmVolume') || 0.7;

        // 首頁 BGM
        homepageBGM = new Audio('audio/Homepage_bgm.wav');
        homepageBGM.loop = true;
        homepageBGM.volume = bgmVolume;
        homepageBGM.preload = 'auto';

        // 遊戲 BGM (原本的)
        gameBGM = document.getElementById('bgm');
        if (gameBGM) {
            gameBGM.volume = bgmVolume;
        }

        // 結算頁 BGM
        settlementBGM = new Audio('audio/Settlement_bgm.wav');
        settlementBGM.loop = true;
        settlementBGM.volume = bgmVolume;
        settlementBGM.preload = 'auto';

        // 添加錯誤處理
        homepageBGM.addEventListener('error', (e) => {
            console.error('首頁 BGM 載入失敗:', e);
        });

        settlementBGM.addEventListener('error', (e) => {
            console.error('結算 BGM 載入失敗:', e);
        });

        console.log('🎵 BGM 音頻元素已初始化');
    } catch (error) {
        console.error('BGM 初始化失敗:', error);
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

// BGM 控制函數
export function playHomepageBGM() {
    stopAllBGM();
    if (homepageBGM) {
        currentBGM = homepageBGM;
        homepageBGM.play().catch(error => {
            console.warn("首頁 BGM 自動播放被瀏覽器阻止:", error);
        });
        console.log('🎵 播放首頁 BGM');
    }
}

export function playGameBGM() {
    stopAllBGM();
    if (gameBGM) {
        currentBGM = gameBGM;
        gameBGM.play().catch(error => {
            console.warn("遊戲 BGM 自動播放被瀏覽器阻止:", error);
        });
        console.log('🎵 播放遊戲 BGM');
    }
}

export function playSettlementBGM() {
    stopAllBGM();
    if (settlementBGM) {
        currentBGM = settlementBGM;
        settlementBGM.play().catch(error => {
            console.warn("結算 BGM 自動播放被瀏覽器阻止:", error);
        });
        console.log('🎵 播放結算 BGM');
    }
}

export function stopAllBGM() {
    if (homepageBGM) {
        homepageBGM.pause();
        homepageBGM.currentTime = 0;
    }
    if (gameBGM) {
        gameBGM.pause();
        gameBGM.currentTime = 0;
    }
    if (settlementBGM) {
        settlementBGM.pause();
        settlementBGM.currentTime = 0;
    }
    currentBGM = null;
    console.log('🔇 停止所有 BGM');
}

export function pauseCurrentBGM() {
    if (currentBGM) {
        currentBGM.pause();
        console.log('⏸️ 暫停當前 BGM');
    }
}

export function resumeCurrentBGM() {
    if (currentBGM) {
        currentBGM.play().catch(error => {
            console.warn("恢復 BGM 播放失敗:", error);
        });
        console.log('▶️ 恢復當前 BGM');
    }
}

export function setCurrentBGMVolume(volume) {
    if (currentBGM) {
        currentBGM.volume = volume;
    }
}

// 設定所有 BGM 的基礎音量
export function setBGMVolume(volume) {
    if (homepageBGM) homepageBGM.volume = volume;
    if (gameBGM) gameBGM.volume = volume;
    if (settlementBGM) settlementBGM.volume = volume;

    // 如果有當前播放的 BGM，也更新它的音量
    if (currentBGM) {
        currentBGM.volume = volume;
    }

    console.log('🎵 所有 BGM 音量設定為:', Math.round(volume * 100) + '%');
}

// 暴露到全域範圍供設定系統使用
if (typeof window !== 'undefined') {
    window.setCurrentBGMVolume = setCurrentBGMVolume;
    window.setBGMVolume = setBGMVolume;
}