// A small WebAudio synth, started on the first key or click: engine hum tied to throttle and airspeed,
// wind noise, a chime for each ring, a thud for damage, a stall horn and a splash. M mutes it.

function createAudio() {
  const audio = { ctx: null, muted: false, engine: null, lastStallBeep: -10 };

  audio.start = function start() {
    if (audio.ctx) return;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    audio.ctx = ctx;
    audio.master = ctx.createGain();
    audio.master.gain.value = audio.muted ? 0 : 0.6;
    audio.master.connect(ctx.destination);
    audio.noise = makeNoiseBuffer(ctx);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const saw = ctx.createOscillator();
    saw.type = 'sawtooth';
    const sub = ctx.createOscillator();
    sub.type = 'square';
    const flutter = ctx.createOscillator();
    flutter.type = 'sine';
    const flutterDepth = ctx.createGain();
    flutterDepth.gain.value = 0.03;
    flutter.connect(flutterDepth).connect(engineGain.gain);
    saw.connect(filter);
    sub.connect(filter);
    filter.connect(engineGain).connect(audio.master);

    const wind = ctx.createBufferSource();
    wind.buffer = audio.noise;
    wind.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 800;
    windFilter.Q.value = 0.6;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    wind.connect(windFilter).connect(windGain).connect(audio.master);
    for (const node of [saw, sub, flutter, wind]) node.start();
    audio.engine = { saw, sub, flutter, flutterDepth, filter, engineGain, windGain, windFilter };
  };

  audio.setEngine = function setEngine(throttle, speed, running) {
    if (!audio.engine) return;
    const e = audio.engine;
    const t = audio.ctx.currentTime;
    const rpm = running ? 55 + throttle * 85 + speed * 0.25 : speed * 0.4;
    e.saw.frequency.setTargetAtTime(rpm, t, 0.08);
    e.sub.frequency.setTargetAtTime(rpm * 0.5, t, 0.08);
    e.flutter.frequency.setTargetAtTime(rpm / 4, t, 0.08);
    e.filter.frequency.setTargetAtTime(280 + throttle * 1100, t, 0.1);
    e.engineGain.gain.setTargetAtTime(running ? 0.05 + throttle * 0.09 : 0, t, 0.15);
    e.flutterDepth.gain.setTargetAtTime(running ? 0.015 + throttle * 0.03 : 0, t, 0.15);
    e.windGain.gain.setTargetAtTime(Math.min(0.12, speed * speed * 0.000018), t, 0.2);
    e.windFilter.frequency.setTargetAtTime(500 + speed * 12, t, 0.2);
  };

  audio.tone = function tone(freq, duration, type, volume, delay) {
    if (!audio.ctx) return;
    const ctx = audio.ctx;
    const t = ctx.currentTime + (delay || 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(audio.master);
    osc.start(t);
    osc.stop(t + duration + 0.05);
    return osc;
  };

  audio.chime = function chime() {
    audio.tone(1318.5, 0.6, 'sine', 0.22, 0);
    audio.tone(1975.5, 0.8, 'sine', 0.16, 0.09);
    audio.tone(2637, 0.9, 'triangle', 0.05, 0.18);
  };

  audio.burst = function burst(duration, cutoff, volume) {
    if (!audio.ctx) return;
    const ctx = audio.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = audio.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, t);
    filter.frequency.exponentialRampToValueAtTime(80, t + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(gain).connect(audio.master);
    src.start(t);
    src.stop(t + duration + 0.05);
  };

  audio.thud = function thud(strength) {
    audio.burst(0.35 + strength * 0.5, 600 + strength * 900, 0.4 + strength * 0.5);
    const osc = audio.tone(90, 0.4 + strength * 0.4, 'sine', 0.5, 0);
    if (osc) osc.frequency.exponentialRampToValueAtTime(35, audio.ctx.currentTime + 0.4);
  };

  audio.splash = function splash() {
    audio.burst(1.6, 4000, 0.6);
    audio.thud(0.6);
  };

  audio.stallHorn = function stallHorn(now) {
    if (now - audio.lastStallBeep < 0.6) return;
    audio.lastStallBeep = now;
    audio.tone(880, 0.25, 'square', 0.06, 0);
  };

  audio.toggleMute = function toggleMute() {
    audio.muted = !audio.muted;
    if (audio.master) audio.master.gain.setTargetAtTime(audio.muted ? 0 : 0.6, audio.ctx.currentTime, 0.05);
  };

  return audio;
}

function makeNoiseBuffer(ctx) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const rng = mulberry32(CONFIG.seed + 7);
  for (let i = 0; i < data.length; i++) data[i] = rng() * 2 - 1;
  return buffer;
}
