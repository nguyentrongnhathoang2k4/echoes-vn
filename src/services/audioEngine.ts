"use client";

// VOID: Màn 4 — tắt nhạc nền chung, Chapter4Stage tự phát âm thanh riêng
export type AudioScene = 'MENU' | 'INTRO' | 'ROOM_314' | 'HALLWAY' | 'SUNSET' | 'PIXEL_BLEED' | 'VOID';

/** Ngưỡng Sanity bắt đầu nghe thấy tim mình đập */
export const HEARTBEAT_SANITY = 35;

/** Nhịp tim theo Sanity: 35% ≈ 75 BPM, nặng nề → dưới 15% dồn dập 115–130 BPM */
export function heartbeatBpm(sanity: number): number {
  if (sanity <= 15) return 115 + ((15 - Math.max(0, sanity)) / 15) * 15;
  return 115 - ((Math.min(HEARTBEAT_SANITY, sanity) - 15) / (HEARTBEAT_SANITY - 15)) * 40;
}

/** Âm thanh duy nhất vang lên giữa khoảng lặng chân không */
export type SilenceAccent = 'chime' | 'click' | 'sigh' | 'none';

/** Sự kiện phát ra khi khoảng lặng bắt đầu, để các màn có AudioContext riêng cũng tự tắt tiếng theo */
export const DEAD_SILENCE_EVENT = 'echoes:dead-silence';
export interface DeadSilenceDetail { durationMs: number; fadeBackMs: number }

class HybridAudioEngine {
  private ctx: AudioContext | null = null;
  private isInitialized = false;

  // Master Nodes
  private masterGain: GainNode | null = null;
  private sanityFilter: BiquadFilterNode | null = null;
  private bgmGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;

  // Adaptive Sanity Nodes
  private tinnitusOsc: OscillatorNode | null = null;
  private tinnitusGain: GainNode | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  // Nghẹt tai theo từng nhịp tim (nằm sau sanityFilter để hai bộ lọc không giành nhau)
  private beatFilter: BiquadFilterNode | null = null;
  private heartbeatListeners = new Set<(bpm: number) => void>();
  // Khoảng lặng chân không: chặn cuối chuỗi, trước loa
  private silenceGain: GainNode | null = null;
  private silencedUntil = 0;

  // Ambient Nodes
  private rainSource: AudioBufferSourceNode | null = null;
  private rainGain: GainNode | null = null;
  private fanOsc: OscillatorNode | null = null;
  private fanGain: GainNode | null = null;
  private riverSource: AudioBufferSourceNode | null = null;
  private riverGain: GainNode | null = null;
  private riverLfo: OscillatorNode | null = null;

  // Flatline & Defibrillator Nodes
  private flatlineOsc: OscillatorNode | null = null;
  private flatlineGain: GainNode | null = null;

  // BGM Sequencer
  private currentScene: AudioScene | null = null;
  private bgmSequencerTimer: NodeJS.Timeout | null = null;
  private bgmStep = 0;
  // Nhịp ECG loạn đan trong nhạc Màn 3 (chuỗi setTimeout riêng vì nhịp không đều)
  private ecgTimer: ReturnType<typeof setTimeout> | null = null;
  private ecgBeat = 0;
  // File nhạc ngoài (nếu có) đi qua bgmGain như nhạc tổng hợp; token bỏ qua file tải xong muộn sau khi đã đổi màn
  private customAudioElement: HTMLAudioElement | null = null;
  private customAudioSource: MediaElementAudioSourceNode | null = null;
  private bgmToken = 0;

  // Settings State
  private masterVolume = 0.8;
  private bgmVolume = 0.85;
  private ambientVolume = 0.4;
  private currentSanity = 100;

  constructor() {
    // Lazy initialization on first user interaction
  }

  public init() {
    if (this.isInitialized && this.ctx && this.ctx.state === 'running') return;

    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;

      if (!this.ctx) {
        this.ctx = new AudioContextClass();
      }

      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }

      this.setupMasterChain();
      this.isInitialized = true;

      // Resume scene if set before init
      if (this.currentScene) {
        this.applyScene(this.currentScene);
      }
    } catch {
      // AudioContext policy blocked or not supported
    }
  }

  private setupMasterChain() {
    if (!this.ctx) return;
    const ctx = this.ctx;

    // Master Gain
    this.masterGain = ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.masterVolume, ctx.currentTime);

    // Sanity Low-Pass Filter (Muffled when sanity < 40%)
    this.sanityFilter = ctx.createBiquadFilter();
    this.sanityFilter.type = 'lowpass';
    this.sanityFilter.frequency.setValueAtTime(20000, ctx.currentTime);
    this.sanityFilter.Q.setValueAtTime(1.2, ctx.currentTime);

    // BGM & Ambient Sub-Buses (Cân bằng BGM rõ nét hơn, Ambient dịu nhẹ hơn)
    this.bgmGain = ctx.createGain();
    this.bgmGain.gain.setValueAtTime(this.bgmVolume * 1.4, ctx.currentTime);

    this.ambientGain = ctx.createGain();
    this.ambientGain.gain.setValueAtTime(this.ambientVolume * 0.45, ctx.currentTime);

    // Nghẹt tai theo nhịp tim (mặc định mở hoàn toàn)
    this.beatFilter = ctx.createBiquadFilter();
    this.beatFilter.type = 'lowpass';
    this.beatFilter.frequency.setValueAtTime(20000, ctx.currentTime);

    // Khoảng lặng chân không
    this.silenceGain = ctx.createGain();
    this.silenceGain.gain.setValueAtTime(1, ctx.currentTime);

    // Routing: BGM + Ambient -> Sanity Filter -> Beat Filter -> Master Gain -> Silence -> Destination
    this.bgmGain.connect(this.sanityFilter);
    this.ambientGain.connect(this.sanityFilter);
    this.sanityFilter.connect(this.beatFilter);
    this.beatFilter.connect(this.masterGain);
    this.masterGain.connect(this.silenceGain);
    this.silenceGain.connect(ctx.destination);

    // Tinnitus Generator (connects directly to master to bypass Sanity filter)
    this.tinnitusOsc = ctx.createOscillator();
    this.tinnitusGain = ctx.createGain();
    this.tinnitusOsc.type = 'sine';
    this.tinnitusOsc.frequency.setValueAtTime(3900, ctx.currentTime);
    this.tinnitusGain.gain.setValueAtTime(0.00001, ctx.currentTime);
    this.tinnitusOsc.connect(this.tinnitusGain);
    this.tinnitusGain.connect(this.masterGain);
    this.tinnitusOsc.start();
  }

  // Cập nhật âm lượng tổng (0 - 100)
  public setMasterVolume(volPercent: number) {
    this.masterVolume = Math.max(0, Math.min(1, volPercent / 100));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.linearRampToValueAtTime(this.masterVolume, this.ctx.currentTime + 0.08);
    }
  }

  // Cập nhật âm lượng Nhạc nền BGM (0 - 100)
  public setBgmVolume(volPercent: number) {
    this.bgmVolume = Math.max(0, Math.min(1, volPercent / 100));
    if (this.bgmGain && this.ctx) {
      this.bgmGain.gain.linearRampToValueAtTime(this.bgmVolume * 1.4, this.ctx.currentTime + 0.08);
    }
  }

  // Cập nhật âm lượng Môi trường & SFX (0 - 100)
  public setAmbientVolume(volPercent: number) {
    this.ambientVolume = Math.max(0, Math.min(1, volPercent / 100));
    if (this.ambientGain && this.ctx) {
      this.ambientGain.gain.linearRampToValueAtTime(this.ambientVolume * 0.45, this.ctx.currentTime + 0.08);
    }
  }

  // Cập nhật biến dạng âm thanh theo Sanity (Adaptive Horror DSP)
  public setSanity(sanity: number) {
    this.currentSanity = sanity;
    // Nhịp tim chạy cả khi chưa có âm thanh (lớp hình co giật vẫn cần nhịp)
    if (sanity <= HEARTBEAT_SANITY) {
      if (!this.heartbeatTimer) this.scheduleHeartbeat();
    } else if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (!this.ctx || !this.sanityFilter || !this.tinnitusGain) return;
    const t = this.ctx.currentTime;

    // 1. Lowpass Filter: Khi Sanity < 50%, tần số cắt giảm dần từ 20000Hz xuống 350Hz (ngạt thở)
    let cutoff = 20000;
    if (sanity < 50) {
      cutoff = 350 + (sanity / 50) * 4500;
    }
    this.sanityFilter.frequency.exponentialRampToValueAtTime(Math.max(150, cutoff), t + 0.3);

    // 2. Tinnitus Gain (Tiếng ù tai 3.9kHz rè rè khi Sanity < 35%)
    let tinVol = 0.00001;
    if (sanity < 35) {
      tinVol = 0.005 + ((35 - sanity) / 35) * 0.035;
    }
    this.tinnitusGain.gain.linearRampToValueAtTime(tinVol, t + 0.25);
  }

  /** Đăng ký nhận từng nhịp tim (để lớp vignette co giật đúng nhịp); trả về hàm huỷ */
  public onHeartbeat(cb: (bpm: number) => void): () => void {
    this.heartbeatListeners.add(cb);
    return () => {
      this.heartbeatListeners.delete(cb);
    };
  }

  /** Lên lịch nhịp kế tiếp; nhịp đổi ngay theo Sanity hiện tại */
  private scheduleHeartbeat() {
    const bpm = heartbeatBpm(this.currentSanity);
    this.triggerHeartbeat();
    this.heartbeatListeners.forEach((cb) => cb(bpm));
    this.heartbeatTimer = setTimeout(() => {
      this.heartbeatTimer = null;
      if (this.currentSanity <= HEARTBEAT_SANITY) this.scheduleHeartbeat();
    }, 60000 / bpm);
  }

  private triggerHeartbeat() {
    if (!this.ctx || !this.masterGain || this.masterVolume <= 0) return;
    const t = this.ctx.currentTime;
    // Mỗi nhịp: nhạc nền & tiếng môi trường nghẹt lại như bị ù tai, rồi thoáng dần
    if (this.beatFilter) {
      this.beatFilter.frequency.cancelScheduledValues(t);
      this.beatFilter.frequency.setValueAtTime(400, t);
      this.beatFilter.frequency.exponentialRampToValueAtTime(20000, t + 0.45);
    }

    try {
      // Pulse 1
      const osc1 = this.ctx.createOscillator();
      const g1 = this.ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(68, t);
      osc1.frequency.exponentialRampToValueAtTime(35, t + 0.12);
      g1.gain.setValueAtTime(0.09, t);
      g1.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc1.connect(g1);
      g1.connect(this.masterGain);
      osc1.start(t);
      osc1.stop(t + 0.12);

      // Pulse 2 (160ms later)
      const osc2 = this.ctx.createOscillator();
      const g2 = this.ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(58, t + 0.16);
      osc2.frequency.exponentialRampToValueAtTime(30, t + 0.28);
      g2.gain.setValueAtTime(0.07, t + 0.16);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc2.connect(g2);
      g2.connect(this.masterGain);
      osc2.start(t + 0.16);
      osc2.stop(t + 0.28);
    } catch {}
  }

  /** Đang trong khoảng lặng chân không (các âm phụ như tiếng gõ chữ nên im) */
  public isDeadSilent(): boolean {
    return typeof performance !== 'undefined' && performance.now() < this.silencedUntil;
  }

  /**
   * KHOẢNG LẶNG CHÂN KHÔNG: mọi âm thanh tụt về 0 trong 40ms, im tuyệt đối,
   * chỉ một âm duy nhất cất lên, rồi âm thanh môi trường từ từ quay lại.
   * Phát sự kiện DEAD_SILENCE_EVENT để các màn có AudioContext riêng cũng tắt theo.
   */
  public triggerDeadSilence(durationMs = 2000, fadeBackMs = 1200, accent: SilenceAccent = 'chime') {
    if (typeof window !== 'undefined') {
      this.silencedUntil = performance.now() + durationMs;
      window.dispatchEvent(new CustomEvent<DeadSilenceDetail>(DEAD_SILENCE_EVENT, { detail: { durationMs, fadeBackMs } }));
    }
    if (!this.ctx || !this.silenceGain) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const g = this.silenceGain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(0.0001, g.value), t);
    g.exponentialRampToValueAtTime(0.0001, t + 0.04);
    g.setValueAtTime(0.0001, t + durationMs / 1000);
    g.exponentialRampToValueAtTime(1, t + (durationMs + fadeBackMs) / 1000);
    if (accent !== 'none' && this.masterVolume > 0) this.playSilenceAccent(accent, t + Math.min(0.7, durationMs / 2500));
  }

  /** Âm duy nhất trong khoảng lặng: đi thẳng ra loa, không qua lớp tắt tiếng */
  private playSilenceAccent(kind: Exclude<SilenceAccent, 'none'>, at: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = this.masterVolume;
    out.connect(ctx.destination);
    try {
      if (kind === 'chime') {
        // Chuông phong linh mảnh: âm cơ bản + bồi âm lệch, ngân dài
        [[1568, 1, 2.6], [4703, 0.25, 1.4], [8467, 0.08, 0.8]].forEach(([f, gain, dur]) => {
          const o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.value = f;
          const e = ctx.createGain();
          e.gain.setValueAtTime(0, at);
          e.gain.linearRampToValueAtTime(0.05 * gain, at + 0.006);
          e.gain.exponentialRampToValueAtTime(0.0001, at + dur);
          o.connect(e).connect(out);
          o.start(at);
          o.stop(at + dur + 0.05);
        });
      } else {
        const len = Math.floor(ctx.sampleRate * (kind === 'sigh' ? 1.6 : 0.05));
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const f = ctx.createBiquadFilter();
        const e = ctx.createGain();
        if (kind === 'click') {
          // Tiếng "tách" khô, cô độc
          f.type = 'bandpass';
          f.frequency.value = 2600;
          e.gain.setValueAtTime(0.35, at);
          e.gain.exponentialRampToValueAtTime(0.0001, at + 0.045);
        } else {
          // Tiếng thở dài: luồng hơi lọc trầm phồng lên rồi tắt
          f.type = 'bandpass';
          f.frequency.setValueAtTime(900, at);
          f.frequency.exponentialRampToValueAtTime(380, at + 1.5);
          f.Q.value = 0.8;
          e.gain.setValueAtTime(0.0001, at);
          e.gain.exponentialRampToValueAtTime(0.05, at + 0.45);
          e.gain.exponentialRampToValueAtTime(0.0001, at + 1.55);
        }
        src.connect(f).connect(e).connect(out);
        src.start(at);
        src.stop(at + len / ctx.sampleRate);
      }
    } catch {}
    setTimeout(() => out.disconnect(), 3500);
  }

  // Khởi động tiếng tít Flatline liên tục khi Sanity = 0% (ECG Flatline 880Hz)
  public startFlatline() {
    if (!this.ctx || !this.masterGain) return;
    this.stopFlatline();

    try {
      const ctx = this.ctx;
      this.flatlineOsc = ctx.createOscillator();
      this.flatlineGain = ctx.createGain();

      this.flatlineOsc.type = 'sine';
      // Tần số chuẩn của còi báo tử vong điện tâm đồ y tế là 880Hz (A5)
      this.flatlineOsc.frequency.setValueAtTime(880, ctx.currentTime);

      this.flatlineGain.gain.setValueAtTime(0.0001, ctx.currentTime);
      this.flatlineGain.gain.linearRampToValueAtTime(0.09, ctx.currentTime + 0.15);

      this.flatlineOsc.connect(this.flatlineGain);
      this.flatlineGain.connect(this.masterGain);

      this.flatlineOsc.start();
    } catch {}
  }

  // Tắt tiếng tít Flatline khi tim đập trở lại
  public stopFlatline() {
    if (this.flatlineGain && this.ctx) {
      try {
        this.flatlineGain.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime + 0.15);
        setTimeout(() => {
          try {
            this.flatlineOsc?.stop();
            this.flatlineOsc?.disconnect();
            this.flatlineGain?.disconnect();
          } catch {}
          this.flatlineOsc = null;
          this.flatlineGain = null;
        }, 180);
      } catch {
        this.flatlineOsc = null;
        this.flatlineGain = null;
      }
    }
  }

  // Tiếng tích điện nạp vào tụ máy khử rung tim (Capacitor charging hum)
  public playDefibCharge(progress: number) {
    if (!this.ctx || !this.masterGain) return;
    try {
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      // Tần số cao dần khi nạp điện từ 320Hz lên 1350Hz
      const baseFreq = 320 + (progress / 100) * 1050;
      osc.frequency.setValueAtTime(baseFreq, t);
      osc.frequency.exponentialRampToValueAtTime(baseFreq + 100, t + 0.12);

      gain.gain.setValueAtTime(0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2600, t);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      osc.stop(t + 0.12);
    } catch {}
  }

  // Cú sốc điện cực mạnh giải phóng điện áp (Defibrillator Discharge & Heart thump)
  public playDefibShock() {
    if (!this.ctx || !this.masterGain) return;
    try {
      const ctx = this.ctx;
      const t = ctx.currentTime;

      // 1. ZAP: Noise burst (Tia lửa phóng qua ngực)
      const bufferSize = Math.floor(ctx.sampleRate * 0.22);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.06));
      }
      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = buffer;

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.28, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(1400, t);
      noiseFilter.Q.setValueAtTime(1.8, t);

      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(this.masterGain);
      noiseSource.start(t);

      // 2. BOOM: Heavy Sub-Bass thump (Cú nảy cơ hoành)
      const subOsc = ctx.createOscillator();
      const subGain = ctx.createGain();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(130, t);
      subOsc.frequency.exponentialRampToValueAtTime(28, t + 0.45);

      subGain.gain.setValueAtTime(0.35, t);
      subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

      subOsc.connect(subGain);
      subGain.connect(this.masterGain);
      subOsc.start(t);
      subOsc.stop(t + 0.45);

      // 3. Tim đập dội lại sau cú sốc (Sau 600ms và 1350ms)
      setTimeout(() => {
        this.triggerHeartbeat();
      }, 600);
      setTimeout(() => {
        this.triggerHeartbeat();
      }, 1350);
    } catch {}
  }

  // Chuyển Scene âm thanh (Cross-fade BGM & Ambient)
  public setScene(scene: AudioScene) {
    if (this.currentScene === scene) return;
    this.currentScene = scene;

    if (!this.isInitialized) {
      // Sẽ kích hoạt ngay khi người dùng chạm hoặc click chuột
      return;
    }

    this.applyScene(scene);
  }

  private applyScene(scene: AudioScene) {
    this.stopCurrentAmbient();
    this.stopCurrentBgm();

    switch (scene) {
      case 'MENU':
        this.startMenuBgm();
        break;
      case 'INTRO':
        this.startRainAmbient(0.35);
        this.startIntroDrone();
        break;
      case 'ROOM_314':
        this.startRainAmbient(0.4);
        this.startCrtFanDrone();
        this.startRoom314Bgm();
        break;
      case 'HALLWAY':
        this.startRainAmbient(0.25);
        this.startHallwayDrone();
        break;
      case 'SUNSET':
        this.startSunsetRiverAmbient();
        this.startSunsetBgm();
        break;
      case 'PIXEL_BLEED':
        this.startBgmWithFileFallback('/assets/audio/bgm_ch3.mp3', () => this.startPixelBleedBgm());
        break;
    }
  }

  // ==========================================
  // AMBIENT GENERATORS (Procedural Web Audio)
  // ==========================================

  private createPinkNoiseBuffer(): AudioBuffer | null {
    if (!this.ctx) return null;
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    return buffer;
  }

  // 1. Tiếng Mưa Rào Ngoài Khung Kính
  private startRainAmbient(targetGain = 0.18) {
    if (!this.ctx || !this.ambientGain) return;
    const buffer = this.createPinkNoiseBuffer();
    if (!buffer) return;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    // Filter tiếng mưa rơi êm dịu, không bị chói
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(620, this.ctx.currentTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(targetGain, this.ctx.currentTime + 2.0);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.ambientGain);

    source.start();
    this.rainSource = source;
    this.rainGain = gain;
  }

  // 2. Tiếng Quạt Tản Nhiệt Case Cũ & Máy Biến Áp 50Hz
  private startCrtFanDrone() {
    if (!this.ctx || !this.ambientGain) return;

    // 55Hz Transformer Hum
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(55, this.ctx.currentTime);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(120, this.ctx.currentTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.025, this.ctx.currentTime + 1.5);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ambientGain);

    osc.start();
    this.fanOsc = osc;
    this.fanGain = gain;
  }

  // 3. Tiếng Gió Rít Lạnh Ở Hành Lang
  private startHallwayDrone() {
    if (!this.ctx || !this.ambientGain) return;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(95, this.ctx.currentTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.02, this.ctx.currentTime + 1.5);

    osc.connect(gain);
    gain.connect(this.ambientGain);

    osc.start();
    this.fanOsc = osc;
    this.fanGain = gain;
  }

  // 4. Tiếng Nước Sông Hoàng Hôn & Làn Gió Dịu Êm
  private startSunsetRiverAmbient() {
    if (!this.ctx || !this.ambientGain) return;
    const buffer = this.createPinkNoiseBuffer();
    if (!buffer) return;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(420, this.ctx.currentTime);
    filter.Q.setValueAtTime(1.5, this.ctx.currentTime);

    // LFO mô phỏng nhịp sóng dạt bờ
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.2, this.ctx.currentTime);
    lfoGain.gain.setValueAtTime(0.015, this.ctx.currentTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.035, this.ctx.currentTime + 2.0);

    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.ambientGain);

    lfo.start();
    source.start();

    this.riverSource = source;
    this.riverGain = gain;
    this.riverLfo = lfo;
  }

  private stopCurrentAmbient() {
    if (this.ctx) {
      const t = this.ctx.currentTime;
      if (this.rainGain) {
        this.rainGain.gain.linearRampToValueAtTime(0.001, t + 1.0);
        setTimeout(() => {
          try { this.rainSource?.stop(); this.rainSource?.disconnect(); } catch {}
          this.rainSource = null;
          this.rainGain = null;
        }, 1100);
      }
      if (this.fanGain) {
        this.fanGain.gain.linearRampToValueAtTime(0.001, t + 1.0);
        setTimeout(() => {
          try { this.fanOsc?.stop(); this.fanOsc?.disconnect(); } catch {}
          this.fanOsc = null;
          this.fanGain = null;
        }, 1100);
      }
      if (this.riverGain) {
        this.riverGain.gain.linearRampToValueAtTime(0.001, t + 1.0);
        setTimeout(() => {
          try { this.riverLfo?.stop(); this.riverSource?.stop(); } catch {}
          this.riverSource = null;
          this.riverLfo = null;
          this.riverGain = null;
        }, 1100);
      }
    }
  }

  // ==========================================
  // MELODIC BGM SYNTHESIZER & CUSTOM MP3
  // ==========================================

  private playSynthNote(
    freq: number,
    duration: number,
    gainVal = 0.14,
    type: OscillatorType = 'sine',
    detune = 0
  ) {
    if (!this.ctx || !this.bgmGain || this.masterVolume <= 0) return;
    const t = this.ctx.currentTime;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (detune !== 0) osc.detune.setValueAtTime(detune, t);

      // Soft Piano / Rhodes envelope với độ vang ấm
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(gainVal, t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

      osc.connect(gain);
      gain.connect(this.bgmGain);

      osc.start(t);
      osc.stop(t + duration);
    } catch {}
  }

  // 1. MENU THEME: Bản Piano Lo-Fi u buồn, hoài niệm ("Tàn Dư Ký Ức")
  private startMenuBgm() {
    this.bgmStep = 0;
    // Chords: Fmaj7 -> G6 -> Em7 -> Am9
    const chordProgressions: Array<{ root: number; notes: number[] }> = [
      { root: 174.61, notes: [261.63, 329.63, 440.0] }, // F3, C4, E4, A4
      { root: 196.00, notes: [293.66, 329.63, 493.88] }, // G3, D4, E4, B4
      { root: 164.81, notes: [246.94, 293.66, 392.00] }, // E3, B3, D4, G4
      { root: 110.00, notes: [220.00, 261.63, 392.00] }, // A2, A3, C4, G4
    ];

    const runStep = () => {
      const chordIndex = Math.floor(this.bgmStep / 4) % chordProgressions.length;
      const beat = this.bgmStep % 4;
      const current = chordProgressions[chordIndex];

      if (beat === 0) {
        // Bass note
        this.playSynthNote(current.root, 3.2, 0.14, 'triangle');
        this.playSynthNote(current.notes[0], 2.8, 0.10, 'sine');
      } else if (beat === 1) {
        this.playSynthNote(current.notes[1], 2.2, 0.09, 'sine', 2);
      } else if (beat === 2) {
        this.playSynthNote(current.notes[2], 2.4, 0.095, 'sine', -2);
      } else if (beat === 3) {
        // Melodic accent
        if (chordIndex === 3) {
          this.playSynthNote(493.88, 1.8, 0.08, 'sine'); // B4
        }
      }

      this.bgmStep++;
    };

    runStep();
    this.bgmSequencerTimer = setInterval(runStep, 800);
  }

  // 2. INTRO THEME: Drone u tối huyền bí
  private startIntroDrone() {
    this.bgmStep = 0;
    const notes = [146.83, 220.0, 349.23]; // D3, A3, F4

    const runStep = () => {
      const n = notes[this.bgmStep % notes.length];
      this.playSynthNote(n, 5.0, 0.09, 'triangle');
      this.bgmStep++;
    };

    runStep();
    this.bgmSequencerTimer = setInterval(runStep, 2400);
  }

  // 3. CHAPTER 1 THEME: Âm hưởng Suspense & Dark Ambient
  private startRoom314Bgm() {
    this.bgmStep = 0;
    const chords = [
      [146.83, 220.00, 349.23], // Dm
      [116.54, 233.08, 349.23], // Bb
      [98.00, 196.00, 293.66],  // Gm
      [110.00, 220.00, 293.66], // Asus4
    ];

    const runStep = () => {
      const c = chords[Math.floor(this.bgmStep / 6) % chords.length];
      const subIndex = this.bgmStep % 6;

      if (subIndex === 0) {
        this.playSynthNote(c[0], 4.5, 0.11, 'triangle');
        this.playSynthNote(c[1], 3.8, 0.08, 'sine');
      } else if (subIndex === 2) {
        this.playSynthNote(c[2], 3.0, 0.075, 'sine');
      } else if (subIndex === 4) {
        // High harmonic flicker
        this.playSynthNote(c[1] * 2, 2.0, 0.05, 'sine', 4);
      }

      this.bgmStep++;
    };

    runStep();
    this.bgmSequencerTimer = setInterval(runStep, 700);
  }

  // 4. CHAPTER 2 THEME: Bản Valse hoàng hôn ấm áp ("Bến An Yên")
  private startSunsetBgm() {
    this.bgmStep = 0;
    // Cmaj7 -> Am7 -> Dm7 -> G7 (Bittersweet Studio Ghibli waltz)
    const waltzChords = [
      { bass: 130.81, arps: [261.63, 329.63, 392.00, 493.88] }, // Cmaj7
      { bass: 110.00, arps: [220.00, 261.63, 329.63, 392.00] }, // Am7
      { bass: 146.83, arps: [293.66, 349.23, 440.00, 523.25] }, // Dm7
      { bass: 98.00,  arps: [196.00, 246.94, 293.66, 392.00] }, // G7
    ];

    const runStep = () => {
      const chordIdx = Math.floor(this.bgmStep / 6) % waltzChords.length;
      const beat = this.bgmStep % 6;
      const chord = waltzChords[chordIdx];

      if (beat === 0) {
        // Deep bass note
        this.playSynthNote(chord.bass, 3.2, 0.15, 'triangle');
      } else if (beat === 1) {
        this.playSynthNote(chord.arps[0], 1.8, 0.10, 'sine');
      } else if (beat === 2) {
        this.playSynthNote(chord.arps[1], 1.8, 0.11, 'sine');
      } else if (beat === 3) {
        this.playSynthNote(chord.arps[2], 2.2, 0.10, 'sine');
      } else if (beat === 4) {
        this.playSynthNote(chord.arps[3], 2.4, 0.12, 'sine');
      }

      this.bgmStep++;
    };

    runStep();
    this.bgmSequencerTimer = setInterval(runStep, 450); // Điệu 3/4 rộn rã nhẹ nhàng
  }

  /** Nốt băng từ nhão: triangle + sawtooth qua lowpass 550Hz, cao độ võng dần như băng bị kéo giãn */
  private playTapeNote(freq: number, duration: number, gainVal: number, detune: number, delay = 0) {
    if (!this.ctx || !this.bgmGain || this.masterVolume <= 0) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    try {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(550, t);
      lp.Q.setValueAtTime(0.7, t);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(gainVal, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      const sawGain = ctx.createGain();
      sawGain.gain.setValueAtTime(0.35, t);

      const tri = ctx.createOscillator();
      const saw = ctx.createOscillator();
      tri.type = 'triangle';
      saw.type = 'sawtooth';
      for (const o of [tri, saw]) {
        o.frequency.setValueAtTime(freq, t);
        o.frequency.exponentialRampToValueAtTime(freq * 0.985, t + duration);
        o.detune.setValueAtTime(detune, t);
      }
      tri.connect(lp);
      saw.connect(sawGain).connect(lp);
      lp.connect(gain).connect(this.bgmGain);
      tri.start(t);
      saw.start(t);
      tri.stop(t + duration + 0.05);
      saw.stop(t + duration + 0.05);
      tri.onended = () => {
        try { tri.disconnect(); saw.disconnect(); sawGain.disconnect(); lp.disconnect(); gain.disconnect(); } catch {}
      };
    } catch {}
  }

  /** Tiếng bíp điện tâm đồ: sine 880Hz đanh, 45ms */
  private playEcgPulse(gainVal: number) {
    if (!this.ctx || !this.bgmGain || this.masterVolume <= 0) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    try {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(880, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gainVal, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
      o.connect(g).connect(this.bgmGain);
      o.start(t);
      o.stop(t + 0.05);
      o.onended = () => {
        try { o.disconnect(); g.disconnect(); } catch {}
      };
    } catch {}
  }

  // 5. CHAPTER 3 THEME: "Điện tâm đồ đứt đoạn" — điệu Valse Màn 2 trên cuộn băng nhão, xen nhịp tim loạn
  private startPixelBleedBgm() {
    this.bgmStep = 0;
    this.ecgBeat = 0;
    // Cmaj7 -> Am7 -> Dm7: vòng Valse bến sông bị cụt mất G7, không bao giờ về được chủ âm
    const brokenWaltz = [
      { bass: 130.81, arps: [261.63, 329.63, 392.00, 493.88] }, // Cmaj7
      { bass: 110.00, arps: [220.00, 261.63, 329.63, 392.00] }, // Am7
      { bass: 146.83, arps: [293.66, 349.23, 440.00, 523.25] }, // Dm7
    ];

    const runStep = () => {
      const chord = brokenWaltz[Math.floor(this.bgmStep / 6) % brokenWaltz.length];
      const beat = this.bgmStep % 6;
      // Wow & flutter: lệch cao độ trôi chậm theo nhịp, kẹp trong [-50, +40] cents
      const detune = Math.max(-50, Math.min(40, Math.sin(this.bgmStep * 0.7) * 45 + (Math.random() - 0.5) * 10));
      // Thỉnh thoảng băng bị kẹt: nốt trễ 100ms
      const lag = Math.random() < 0.14 ? 0.1 : 0;

      if (beat === 0) {
        this.playTapeNote(chord.bass, 3.0, 0.13, detune * 0.6, lag);
      } else if (beat >= 1 && beat <= 4) {
        // Băng rơi mất nốt: đôi khi một nốt rải biến mất hẳn
        if (Math.random() > 0.12) this.playTapeNote(chord.arps[beat - 1], 1.9, 0.085, detune, lag);
      }

      this.bgmStep++;
    };

    // Nhịp tim loạn: bình thường -> rung thất dồn dập -> chậm lịm 42 BPM -> gần như ngừng, rồi lặp lại
    const ecgStep = () => {
      const p = this.ecgBeat % 34;
      let gainVal = 0.022;
      let next: number;
      if (p < 10) {
        next = (60 / 66) * (1 + (Math.random() - 0.5) * 0.16);
      } else if (p < 22) {
        next = 0.22 + Math.random() * 0.25;
        gainVal = 0.016 + Math.random() * 0.01;
      } else {
        next = 60 / 42;
        gainVal = 0.022 * (1 - ((p - 22) / 12) * 0.7);
        if (p === 33) next += 2.5;
      }
      this.playEcgPulse(gainVal);
      this.ecgBeat++;
      this.ecgTimer = setTimeout(ecgStep, next * 1000);
    };

    runStep();
    this.bgmSequencerTimer = setInterval(runStep, 520); // Valse nhão, chậm hơn Màn 2
    this.ecgTimer = setTimeout(ecgStep, 900);
  }

  /** Ưu tiên file nhạc ngoài nếu có; trong lúc tải (hoặc nếu không có file) phát nhạc tổng hợp */
  private startBgmWithFileFallback(url: string, startSynth: () => void) {
    startSynth();
    if (!this.ctx || !this.bgmGain) return;
    const token = this.bgmToken;
    const el = new Audio();
    el.loop = true;
    el.preload = 'auto';
    el.addEventListener(
      'canplaythrough',
      () => {
        if (token !== this.bgmToken || !this.ctx || !this.bgmGain) return;
        try {
          const src = this.ctx.createMediaElementSource(el);
          src.connect(this.bgmGain);
          this.clearSynthTimers();
          this.customAudioElement = el;
          this.customAudioSource = src;
          void el.play().catch(() => {});
        } catch {}
      },
      { once: true },
    );
    // Không có file: giữ nguyên nhạc tổng hợp
    el.addEventListener('error', () => el.removeAttribute('src'), { once: true });
    el.src = url;
  }

  private clearSynthTimers() {
    if (this.bgmSequencerTimer) {
      clearInterval(this.bgmSequencerTimer);
      this.bgmSequencerTimer = null;
    }
    if (this.ecgTimer) {
      clearTimeout(this.ecgTimer);
      this.ecgTimer = null;
    }
  }

  private stopCurrentBgm() {
    this.bgmToken++;
    this.clearSynthTimers();
    if (this.customAudioElement) {
      this.customAudioElement.pause();
      this.customAudioElement.removeAttribute('src');
      this.customAudioElement = null;
    }
    try { this.customAudioSource?.disconnect(); } catch {}
    this.customAudioSource = null;
  }

  public dispose() {
    this.stopCurrentAmbient();
    this.stopCurrentBgm();
    this.stopFlatline();
    if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
    this.heartbeatTimer = null;
    this.heartbeatListeners.clear();
    try {
      this.ctx?.close();
    } catch {}
    this.ctx = null;
    this.isInitialized = false;
  }
}

// Singleton Export
export const audioEngine = new HybridAudioEngine();
