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
export type SilenceAccent = 'chime' | 'click' | 'sigh' | 'rain' | 'none';

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
  // Ù tai trầm: tiếng ồn trắng lọc thấp như đang chìm dưới nước (thay cho tiếng rít 3.9kHz cũ, nghe chói tai)
  private earRumbleSource: AudioBufferSourceNode | null = null;
  private earRumbleFilter: BiquadFilterNode | null = null;
  private earRumbleGain: GainNode | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  // Đếm nhịp để chen tiếng thở dốc giữa các nhịp tim
  private heartbeatCount = 0;
  private whiteNoise: AudioBuffer | null = null;
  // Nghẹt tai theo từng nhịp tim (nằm sau sanityFilter để hai bộ lọc không giành nhau)
  private beatFilter: BiquadFilterNode | null = null;
  private heartbeatListeners = new Set<(bpm: number) => void>();
  // Khoảng lặng chân không: chặn cuối chuỗi, trước loa
  private silenceGain: GainNode | null = null;
  private silencedUntil = 0;

  // Bus riêng của scene đang phát: nhạc (nối vào bgmGain) + môi trường (nối vào ambientGain).
  // Đổi scene = hạ bus cũ về 0 trong 50ms rồi dừng & ngắt hết nguồn trên đó, kể cả nốt synth đang ngân dở,
  // nên không âm nào của cảnh trước lọt sang cảnh sau. bgmGain / ambientGain chỉ giữ âm lượng người chơi chỉnh.
  private sceneBgmBus: GainNode | null = null;
  private sceneAmbientBus: GainNode | null = null;
  private ambientSources: AudioScheduledSourceNode[] = [];
  // Còi 115 vọng xa của Màn 3 (chuỗi setTimeout nhịp ngẫu nhiên)
  private sirenTimer: ReturnType<typeof setTimeout> | null = null;

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
    // Đã dựng chuỗi âm thanh rồi thì chỉ đánh thức lại AudioContext: dựng lại chuỗi + phát lại scene
    // sẽ để nguồn cũ kêu tiếp trên chuỗi cũ, chồng lên nguồn mới
    if (this.isInitialized && this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
      return;
    }

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

    // Ù tai trầm (đi thẳng vào master, không qua Sanity filter): ồn trắng → lọc thấp ~420Hz, mặc định câm
    const noise = this.getWhiteNoise();
    if (noise) {
      this.earRumbleSource = ctx.createBufferSource();
      this.earRumbleSource.buffer = noise;
      this.earRumbleSource.loop = true;
      this.earRumbleFilter = ctx.createBiquadFilter();
      this.earRumbleFilter.type = 'lowpass';
      this.earRumbleFilter.frequency.setValueAtTime(420, ctx.currentTime);
      this.earRumbleFilter.Q.setValueAtTime(0.7, ctx.currentTime);
      this.earRumbleGain = ctx.createGain();
      this.earRumbleGain.gain.setValueAtTime(0.00001, ctx.currentTime);
      this.earRumbleSource.connect(this.earRumbleFilter);
      this.earRumbleFilter.connect(this.earRumbleGain);
      this.earRumbleGain.connect(this.masterGain);
      this.earRumbleSource.start();
    }
  }

  /** Bộ đệm ồn trắng 2 giây dùng chung (ù tai, thở dốc, thân nhịp tim) */
  private getWhiteNoise(): AudioBuffer | null {
    if (!this.ctx) return null;
    if (this.whiteNoise && this.whiteNoise.sampleRate === this.ctx.sampleRate) return this.whiteNoise;
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.whiteNoise = buf;
    return buf;
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
    if (!this.ctx || !this.sanityFilter) return;
    const t = this.ctx.currentTime;

    // 1. Lowpass Filter: Khi Sanity < 50%, tần số cắt giảm dần từ 20000Hz xuống 350Hz (ngạt thở)
    let cutoff = 20000;
    if (sanity < 50) {
      cutoff = 350 + (sanity / 50) * 4500;
    }
    this.sanityFilter.frequency.exponentialRampToValueAtTime(Math.max(150, cutoff), t + 0.3);

    // 2. Ù tai trầm khi Sanity < 35%: to dần và đục dần (420Hz → 180Hz), như tai bị nước tràn vào
    if (this.earRumbleGain && this.earRumbleFilter) {
      const depth = sanity < HEARTBEAT_SANITY ? (HEARTBEAT_SANITY - Math.max(0, sanity)) / HEARTBEAT_SANITY : 0;
      const vol = depth > 0 ? 0.01 + depth * 0.05 : 0.00001;
      this.earRumbleGain.gain.cancelScheduledValues(t);
      this.earRumbleGain.gain.setValueAtTime(Math.max(0.00001, this.earRumbleGain.gain.value), t);
      this.earRumbleGain.gain.linearRampToValueAtTime(vol, t + 0.6);
      this.earRumbleFilter.frequency.cancelScheduledValues(t);
      this.earRumbleFilter.frequency.setValueAtTime(this.earRumbleFilter.frequency.value, t);
      this.earRumbleFilter.frequency.exponentialRampToValueAtTime(420 - depth * 240, t + 0.6);
    }
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
    // Thở dốc nghẹt: 3 nhịp một hơi, dưới 15% dồn còn 2 nhịp một hơi
    const beatsPerBreath = this.currentSanity <= 15 ? 2 : 3;
    if (this.heartbeatCount++ % beatsPerBreath === 0) {
      this.triggerBreath(Math.min(1.7, (60 / bpm) * beatsPerBreath * 0.85));
    }
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

    // Sanity càng thấp nhịp càng nặng (0 ở 35% → 1 ở 0%)
    const depth = Math.min(1, Math.max(0, (HEARTBEAT_SANITY - this.currentSanity) / HEARTBEAT_SANITY));
    try {
      // "Thình" (80→55Hz) rồi "thịch" nhẹ hơn (70→55Hz) sau 170ms — chỉ dải trầm, không có tần số chói
      this.heartPulse(t, 80, 0.12 + depth * 0.06, 0.2);
      this.heartPulse(t + 0.17, 70, 0.08 + depth * 0.04, 0.18);
    } catch {}
  }

  /** Một nhịp đập bass: sine trượt từ `freq` xuống 55Hz + cú "bịch" ồn trắng lọc dưới 160Hz làm thân */
  private heartPulse(at: number, freq: number, gain: number, dur: number) {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, at);
    osc.frequency.exponentialRampToValueAtTime(55, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(gain, at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g).connect(this.masterGain);
    osc.start(at);
    osc.stop(at + dur + 0.02);

    const noise = this.getWhiteNoise();
    if (!noise) return;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 160;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, at);
    ng.gain.linearRampToValueAtTime(gain * 0.9, at + 0.01);
    ng.gain.exponentialRampToValueAtTime(0.0001, at + dur * 0.6);
    src.connect(lp).connect(ng).connect(this.masterGain);
    src.start(at, Math.random() * 1.5);
    src.stop(at + dur);
  }

  /** Thở dốc nghẹt: hít vào gấp rồi thở ra, ồn trắng lọc thấp ~650Hz nên nghe đục như sau lớp vải */
  private triggerBreath(dur: number) {
    if (!this.ctx || !this.masterGain || this.masterVolume <= 0) return;
    const noise = this.getWhiteNoise();
    if (!noise) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.05;
    const depth = Math.min(1, Math.max(0, (HEARTBEAT_SANITY - this.currentSanity) / HEARTBEAT_SANITY));
    const peak = 0.015 + depth * 0.02;
    const inhale = dur * 0.4;
    try {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      // Hít vào sáng hơn một chút, thở ra trầm xuống
      lp.frequency.setValueAtTime(520, t);
      lp.frequency.linearRampToValueAtTime(680, t + inhale);
      lp.frequency.exponentialRampToValueAtTime(300, t + dur);
      lp.Q.value = 0.9;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak * 0.8, t + inhale * 0.8);
      g.gain.linearRampToValueAtTime(peak * 0.25, t + inhale);   // Nghẹn giữa hai hơi
      g.gain.linearRampToValueAtTime(peak, t + inhale + 0.12);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(lp).connect(g).connect(this.masterGain);
      src.start(t, Math.random() * 0.3);
      src.stop(t + dur + 0.05);
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
    if (accent === 'rain') {
      if (this.masterVolume > 0) this.playSilenceRain(t + 0.15, (durationMs + fadeBackMs) / 1000);
      return;
    }
    if (accent !== 'none' && this.masterVolume > 0) this.playSilenceAccent(accent, t + Math.min(0.7, durationMs / 2500));
  }

  /** Khoảng lặng chỉ còn tiếng mưa: mưa rào lọc trầm nổi lên, kéo dài suốt khoảng lặng rồi chìm dần */
  private playSilenceRain(at: number, totalSec: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const buffer = this.createPinkNoiseBuffer();
    if (!buffer) return;
    try {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 620;
      const e = ctx.createGain();
      const peak = 0.3 * this.masterVolume;
      e.gain.setValueAtTime(0.0001, at);
      e.gain.linearRampToValueAtTime(peak, at + 1.2);
      e.gain.setValueAtTime(peak, at + Math.max(1.3, totalSec - 2));
      e.gain.linearRampToValueAtTime(0.0001, at + totalSec);
      src.connect(f).connect(e).connect(ctx.destination);
      src.start(at);
      src.stop(at + totalSec + 0.1);
      src.onended = () => e.disconnect();
    } catch {}
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

  // Khởi động tiếng Flatline liên tục khi Sanity = 0%: không còn còi 880Hz nhói tai, mà là tiếng máy đo
  // vọng xa qua lớp nước (440Hz bị lọc đục dưới 500Hz), nhỏ và trầm
  public startFlatline() {
    if (!this.ctx || !this.masterGain) return;
    this.stopFlatline();

    try {
      const ctx = this.ctx;
      this.flatlineOsc = ctx.createOscillator();
      this.flatlineGain = ctx.createGain();
      const muffle = ctx.createBiquadFilter();

      this.flatlineOsc.type = 'sine';
      this.flatlineOsc.frequency.setValueAtTime(440, ctx.currentTime);
      muffle.type = 'lowpass';
      muffle.frequency.setValueAtTime(500, ctx.currentTime);

      this.flatlineGain.gain.setValueAtTime(0.0001, ctx.currentTime);
      this.flatlineGain.gain.linearRampToValueAtTime(0.03, ctx.currentTime + 0.6);

      this.flatlineOsc.connect(muffle);
      muffle.connect(this.flatlineGain);
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

  // Chuyển Scene âm thanh: cắt dứt khoát cảnh cũ (fade 50ms) rồi mới dựng cảnh mới
  public setScene(scene: AudioScene) {
    if (this.currentScene === scene) return;
    this.currentScene = scene;

    if (!this.isInitialized) {
      // Sẽ kích hoạt ngay khi người dùng chạm hoặc click chuột
      return;
    }

    this.applyScene(scene);
  }

  /**
   * Mỗi scene độc quyền phần âm thanh của mình:
   * MENU        : chỉ bản Piano Lo-Fi, không mưa, không quạt
   * INTRO / VOID: im hoàn toàn — cutscene (Intro, kết cục, chuyển cảnh) và Màn 4 tự tổng hợp âm thanh riêng
   * ROOM_314    : quạt tản nhiệt CRT + mưa rào + nhạc Màn 1
   * HALLWAY     : gió lùa hành lang + mưa nhỏ (không quạt, không nhạc)
   * SUNSET      : sóng nước bến sông + Valse hoàng hôn
   * PIXEL_BLEED : âm hưởng phòng hồi sức, nhịp tim đứt quãng, còi 115 xa xăm
   */
  private applyScene(scene: AudioScene) {
    this.stopCurrentAmbient();
    this.stopCurrentBgm();
    if (scene === 'INTRO' || scene === 'VOID') return;
    this.openSceneBuses();

    switch (scene) {
      case 'MENU':
        this.startMenuBgm();
        break;
      case 'ROOM_314':
        this.startRainAmbient(0.4);
        this.startCrtFanDrone();
        this.startRoom314Bgm();
        break;
      case 'HALLWAY':
        this.startRainAmbient(0.2);
        this.startHallwayWind();
        break;
      case 'SUNSET':
        this.startSunsetRiverAmbient();
        this.startSunsetBgm();
        break;
      case 'PIXEL_BLEED':
        this.startErAmbient();
        this.startBgmWithFileFallback('/assets/audio/bgm_ch3.mp3', () => this.startPixelBleedBgm());
        break;
    }
  }

  /** Bus nhạc + bus môi trường mới cho scene sắp phát */
  private openSceneBuses() {
    if (!this.ctx || !this.bgmGain || !this.ambientGain) return;
    this.sceneBgmBus = this.ctx.createGain();
    this.sceneBgmBus.connect(this.bgmGain);
    this.sceneAmbientBus = this.ctx.createGain();
    this.sceneAmbientBus.connect(this.ambientGain);
  }

  /** Hạ một bus về 0 trong 50ms; sau 60ms gọi `then` (dừng nguồn, ngắt bus) */
  private quickFade(bus: GainNode | null, then: () => void) {
    if (!this.ctx || !bus) {
      then();
      return;
    }
    const t = this.ctx.currentTime;
    try {
      bus.gain.cancelScheduledValues(t);
      bus.gain.setValueAtTime(Math.max(0.0001, bus.gain.value), t);
      bus.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    } catch {}
    setTimeout(then, 60);
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
    if (!this.ctx || !this.sceneAmbientBus) return;
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
    gain.connect(this.sceneAmbientBus);

    source.start();
    this.ambientSources.push(source);
  }

  // 2. Tiếng Quạt Tản Nhiệt Case Cũ & Máy Biến Áp 50Hz
  private startCrtFanDrone() {
    if (!this.ctx || !this.sceneAmbientBus) return;

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
    gain.connect(this.sceneAmbientBus);

    osc.start();
    this.ambientSources.push(osc);
  }

  // 3. Gió lùa hành lang đêm: ồn hồng lọc dải, tần số và độ lớn trôi chậm theo từng cơn gió
  private startHallwayWind() {
    if (!this.ctx || !this.sceneAmbientBus) return;
    const ctx = this.ctx;
    const buffer = this.createPinkNoiseBuffer();
    if (!buffer) return;
    const t = ctx.currentTime;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(420, t);
    filter.Q.setValueAtTime(0.9, t);
    // Cơn gió: tâm lọc trôi 240–600Hz (~12 giây một vòng)
    const sweep = ctx.createOscillator();
    const sweepDepth = ctx.createGain();
    sweep.frequency.setValueAtTime(0.083, t);
    sweepDepth.gain.setValueAtTime(180, t);
    sweep.connect(sweepDepth).connect(filter.frequency);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.06, t + 2.0);
    // Gió mạnh lên rồi lặng đi (lệch nhịp với vòng lọc cho đỡ đều)
    const gust = ctx.createOscillator();
    const gustDepth = ctx.createGain();
    gust.frequency.setValueAtTime(0.13, t);
    gustDepth.gain.setValueAtTime(0.025, t);
    gust.connect(gustDepth).connect(gain.gain);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.sceneAmbientBus);
    source.start();
    sweep.start();
    gust.start();
    this.ambientSources.push(source, sweep, gust);
  }

  // 4. Tiếng Nước Sông Hoàng Hôn & Làn Gió Dịu Êm
  private startSunsetRiverAmbient() {
    if (!this.ctx || !this.sceneAmbientBus) return;
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
    gain.connect(this.sceneAmbientBus);

    lfo.start();
    source.start();
    this.ambientSources.push(source, lfo);
  }

  // 5. Phòng hồi sức Màn 3: tiếng ù phòng bệnh + đèn tuýp 100Hz, nhịp bóp bóng thở 4 giây, còi 115 vọng xa
  private startErAmbient() {
    if (!this.ctx || !this.sceneAmbientBus) return;
    const ctx = this.ctx;
    const bus = this.sceneAmbientBus;
    const buffer = this.createPinkNoiseBuffer();
    if (!buffer) return;
    const t = ctx.currentTime;

    // Ù phòng: ồn hồng lọc thấp 300Hz
    const room = ctx.createBufferSource();
    room.buffer = buffer;
    room.loop = true;
    const roomLp = ctx.createBiquadFilter();
    roomLp.type = 'lowpass';
    roomLp.frequency.setValueAtTime(300, t);
    const roomGain = ctx.createGain();
    roomGain.gain.setValueAtTime(0.001, t);
    roomGain.gain.linearRampToValueAtTime(0.05, t + 2.0);
    room.connect(roomLp).connect(roomGain).connect(bus);

    // Đèn tuýp rè 100Hz (điện lưới 50Hz)
    const hum = ctx.createOscillator();
    hum.frequency.setValueAtTime(100, t);
    const humGain = ctx.createGain();
    humGain.gain.setValueAtTime(0.006, t);
    hum.connect(humGain).connect(bus);

    // Bóp bóng thở: luồng hơi lọc dải 700Hz phồng lên xẹp xuống mỗi 4 giây
    const air = ctx.createBufferSource();
    air.buffer = buffer;
    air.loop = true;
    air.playbackRate.setValueAtTime(1.3, t);
    const airBp = ctx.createBiquadFilter();
    airBp.type = 'bandpass';
    airBp.frequency.setValueAtTime(700, t);
    airBp.Q.setValueAtTime(1.1, t);
    const airGain = ctx.createGain();
    airGain.gain.setValueAtTime(0.012, t);
    const breath = ctx.createOscillator();
    const breathDepth = ctx.createGain();
    breath.frequency.setValueAtTime(0.25, t);
    breathDepth.gain.setValueAtTime(0.012, t);
    breath.connect(breathDepth).connect(airGain.gain);
    air.connect(airBp).connect(airGain).connect(bus);

    room.start();
    hum.start();
    air.start();
    breath.start();
    this.ambientSources.push(room, hum, air, breath);

    // Còi 115 vọng xa: mỗi 25–45 giây một hồi "hi–lo" 6 giây, lọc đục, nhỏ và trôi cao độ như xe chạy ngang
    const siren = () => {
      if (!this.ctx || this.sceneAmbientBus !== bus) return;
      const at = this.ctx.currentTime + 0.05;
      const dur = 6;
      try {
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        for (let k = 0; k * 0.6 < dur; k++) {
          osc.frequency.setValueAtTime(k % 2 === 0 ? 650 : 870, at + k * 0.6);
        }
        osc.detune.setValueAtTime(-60, at);
        osc.detune.linearRampToValueAtTime(40, at + dur);
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(900, at);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, at);
        g.gain.linearRampToValueAtTime(0.012, at + dur * 0.45);
        g.gain.linearRampToValueAtTime(0.0001, at + dur);
        osc.connect(lp).connect(g).connect(bus);
        osc.start(at);
        osc.stop(at + dur + 0.05);
        this.ambientSources.push(osc);
      } catch {}
      this.sirenTimer = setTimeout(siren, 25000 + Math.random() * 20000);
    };
    this.sirenTimer = setTimeout(siren, 9000 + Math.random() * 6000);
  }

  /** Cắt môi trường của scene cũ: fade 50ms rồi dừng & ngắt mọi nguồn (giữ tham chiếu riêng, scene mới không bị đụng tới) */
  private stopCurrentAmbient() {
    if (this.sirenTimer) {
      clearTimeout(this.sirenTimer);
      this.sirenTimer = null;
    }
    const bus = this.sceneAmbientBus;
    const sources = this.ambientSources;
    this.sceneAmbientBus = null;
    this.ambientSources = [];
    this.quickFade(bus, () => {
      sources.forEach((src) => {
        try { src.stop(); } catch {}
        try { src.disconnect(); } catch {}
      });
      try { bus?.disconnect(); } catch {}
    });
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
    if (!this.ctx || !this.sceneBgmBus || this.masterVolume <= 0) return;
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
      gain.connect(this.sceneBgmBus);

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
    if (!this.ctx || !this.sceneBgmBus || this.masterVolume <= 0) return;
    const ctx = this.ctx;
    const bus = this.sceneBgmBus;
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
      lp.connect(gain).connect(bus);
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
    if (!this.ctx || !this.sceneBgmBus || this.masterVolume <= 0) return;
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
      o.connect(g).connect(this.sceneBgmBus);
      o.start(t);
      o.stop(t + 0.05);
      o.onended = () => {
        try { o.disconnect(); g.disconnect(); } catch {}
      };
    } catch {}
  }

  // 5. CHAPTER 3 THEME: "Hồi sức" — nền trầm u uất trên cuộn băng nhão (không còn giai điệu Valse Màn 2),
  //    xen nhịp điện tim đứt quãng
  private startPixelBleedBgm() {
    this.bgmStep = 0;
    this.ecgBeat = 0;
    // Am(add9) thấp → Fmaj7 thấp → Dm(add9) thấp: hợp âm dài, không có nhịp ba
    const pads = [
      [110.0, 164.81, 246.94],
      [87.31, 130.81, 220.0],
      [73.42, 146.83, 220.0],
    ];

    const runStep = () => {
      const step = this.bgmStep % 6;
      // Wow & flutter: lệch cao độ trôi chậm theo nhịp, kẹp trong [-40, +30] cents
      const detune = Math.max(-40, Math.min(30, Math.sin(this.bgmStep * 0.4) * 35 + (Math.random() - 0.5) * 8));
      if (step === 0) {
        const pad = pads[Math.floor(this.bgmStep / 6) % pads.length];
        this.playTapeNote(pad[0], 6.5, 0.1, detune * 0.5);
        this.playTapeNote(pad[1], 6.0, 0.06, detune, 0.25);
        this.playTapeNote(pad[2], 5.5, 0.045, detune, 0.5);
      } else if (step === 3 && Math.random() < 0.5) {
        // Một nốt cao lạc lõng như tiếng máy móc vọng lại
        this.playTapeNote(pads[0][2] * 2, 2.4, 0.03, detune);
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
    this.bgmSequencerTimer = setInterval(runStep, 1000);
    this.ecgTimer = setTimeout(ecgStep, 900);
  }

  /** Ưu tiên file nhạc ngoài nếu có; trong lúc tải (hoặc nếu không có file) phát nhạc tổng hợp */
  private startBgmWithFileFallback(url: string, startSynth: () => void) {
    startSynth();
    if (!this.ctx || !this.sceneBgmBus) return;
    const token = this.bgmToken;
    const bus = this.sceneBgmBus;
    const el = new Audio();
    el.loop = true;
    el.preload = 'auto';
    el.addEventListener(
      'canplaythrough',
      () => {
        if (token !== this.bgmToken || !this.ctx) return;
        try {
          const src = this.ctx.createMediaElementSource(el);
          src.connect(bus);
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

  /** Cắt nhạc của scene cũ: dừng bộ đếm nhịp ngay, fade bus 50ms (nốt đang ngân tắt theo) rồi ngắt hẳn */
  private stopCurrentBgm() {
    this.bgmToken++;
    this.clearSynthTimers();
    const bus = this.sceneBgmBus;
    const el = this.customAudioElement;
    const src = this.customAudioSource;
    this.sceneBgmBus = null;
    this.customAudioElement = null;
    this.customAudioSource = null;
    this.quickFade(bus, () => {
      if (el) {
        el.pause();
        el.removeAttribute('src');
      }
      try { src?.disconnect(); } catch {}
      try { bus?.disconnect(); } catch {}
    });
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
