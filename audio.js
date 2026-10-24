// AURABATTLE 2000 - original chiptune funk loop + crowd SFX, all synthesized.
// Tamborzao-style kick pattern + phonk-style cowbell riff on square waves.
// No samples, no third-party audio.
(function (root) {
  'use strict';
  const A = { ctx: null, on: false, muted: false };
  let master, music, sfx, noise, step = 0, next = 0, timer = null;
  const BPM = 128, SD = 60 / BPM / 4;

  A.init = function () {
    if (A.ctx) return;
    const C = window.AudioContext || window.webkitAudioContext;
    A.ctx = new C();
    master = A.ctx.createGain(); master.gain.value = 0.55; master.connect(A.ctx.destination);
    music = A.ctx.createGain(); music.gain.value = 0.3; music.connect(master);
    sfx = A.ctx.createGain(); sfx.gain.value = 0.85; sfx.connect(master);
    noise = A.ctx.createBuffer(1, A.ctx.sampleRate, A.ctx.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  };

  A.start = function () {
    A.init(); if (A.ctx.state === 'suspended') A.ctx.resume();
    if (A.on) return; A.on = true; next = A.ctx.currentTime + 0.1;
    timer = setInterval(sched, 25);
  };
  A.toggleMute = function () {
    A.muted = !A.muted; if (master) master.gain.value = A.muted ? 0 : 0.55; return A.muted;
  };

  function env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }
  function osc(type, f, t, dur, peak, dest, f2) {
    const o = A.ctx.createOscillator(), g = A.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    env(g, t, 0.004, peak, dur); o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05); return o;
  }
  function nz(t, dur, peak, type, f, q, dest) {
    const s = A.ctx.createBufferSource(), fl = A.ctx.createBiquadFilter(), g = A.ctx.createGain();
    s.buffer = noise; fl.type = type; fl.frequency.value = f; fl.Q.value = q || 1;
    env(g, t, 0.003, peak, dur); s.connect(fl); fl.connect(g); g.connect(dest);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  // ---- the loop -------------------------------------------------------
  const KICK = new Set([0, 3, 6, 10, 12]);
  const CLAP = new Set([4, 12]);
  const TOM = new Set([7, 14, 15]);
  const ROOT = [110, 87.31, 98, 82.41];                  // Am F G E
  const TONES = [
    [440, 523.3, 659.3, 880, 784],
    [349.2, 440, 523.3, 698.5, 659.3],
    [392, 493.9, 587.3, 784, 698.5],
    [329.6, 415.3, 493.9, 659.3, 587.3],
  ];
  const RIFF = [0, -1, 2, -1, 0, -1, 3, -1, -1, 2, -1, 0, -1, 4, -1, 1];
  const BASS = new Set([0, 6, 10]);

  function cowbell(f, t, peak) {
    const bp = A.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 1.6; bp.Q.value = 2;
    bp.connect(music);
    osc('square', f, t, 0.16, peak, bp); osc('square', f * 1.48, t, 0.12, peak * 0.7, bp);
  }

  function play(s, t) {
    const bar = Math.floor(s / 16) % 4, st = s % 16;
    const section = Math.floor(s / 64) % 4;          // every 4 bars: drop the riff once
    if (KICK.has(st)) osc('sine', 150, t, 0.22, 0.9, music, 42);
    if (CLAP.has(st)) { nz(t, 0.08, 0.4, 'bandpass', 1500, 1, music); nz(t + 0.012, 0.1, 0.3, 'bandpass', 1200, 1, music); }
    if (TOM.has(st)) osc('square', 260, t, 0.1, 0.12, music, 120);
    nz(t, st % 2 ? 0.02 : 0.035, st % 2 ? 0.06 : 0.12, 'highpass', 7000, 1, music);
    if (BASS.has(st)) { osc('triangle', ROOT[bar], t, 0.3, 0.45, music); osc('square', ROOT[bar] * 2, t, 0.08, 0.06, music); }
    const r = RIFF[st];
    if (r >= 0 && section !== 3) cowbell(TONES[bar][r], t, 0.16);
  }

  function sched() {
    while (next < A.ctx.currentTime + 0.12) { play(step, next); step++; next += SD; }
  }

  // ---- crowd + game SFX -----------------------------------------------
  function now() { return A.ctx ? A.ctx.currentTime + 0.01 : 0; }
  function crowdVoices(n, f0, sweep, dur, peak) {
    const t = now();
    for (let i = 0; i < n; i++) {
      const o = A.ctx.createOscillator(), bp = A.ctx.createBiquadFilter(), g = A.ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = f0 * (0.8 + Math.random() * 0.5);
      bp.type = 'bandpass'; bp.Q.value = 5;
      bp.frequency.setValueAtTime(sweep[0], t); bp.frequency.linearRampToValueAtTime(sweep[1], t + dur * 0.4);
      bp.frequency.linearRampToValueAtTime(sweep[2], t + dur);
      const d = Math.random() * 0.08;
      g.gain.setValueAtTime(0.0001, t + d); g.gain.linearRampToValueAtTime(peak / n, t + d + 0.08);
      g.gain.linearRampToValueAtTime(0.0001, t + d + dur);
      o.connect(bp); bp.connect(g); g.connect(sfx); o.start(t + d); o.stop(t + d + dur + 0.05);
    }
  }
  A.sfx = function (name, k) {
    if (!A.ctx || A.muted) return;
    const t = now(); k = k == null ? 1 : k;
    switch (name) {
      case 'ohh': crowdVoices(6, 170, [450, 950, 600], 0.9, 0.9 * k); break;
      case 'cheer':
        nz(t, 1.0, 0.25 * k, 'bandpass', 2400, 0.7, sfx);
        osc('sine', 1700, t + 0.05, 0.16, 0.18, sfx, 2600); osc('sine', 2500, t + 0.24, 0.2, 0.18, sfx, 1700);
        crowdVoices(5, 220, [700, 1100, 800], 0.8, 0.6 * k); break;
      case 'meh': crowdVoices(4, 140, [500, 380, 300], 0.7, 0.5); break;
      case 'laugh': [520, 470, 430, 400].forEach((f, i) => osc('square', f, t + i * 0.1, 0.06, 0.15, sfx)); break;
      case 'shutter': nz(t, 0.03, 0.35, 'highpass', 3000, 1, sfx); nz(t + 0.07, 0.03, 0.3, 'highpass', 3000, 1, sfx); break;
      case 'blip': osc('square', 880, t, 0.05, 0.1, sfx); break;
      case 'reveal': osc('square', 440, t, 0.06, 0.12, sfx); osc('square', 660, t + 0.07, 0.08, 0.12, sfx); break;
      case 'ko': [784, 659, 523, 392, 262].forEach((f, i) => osc('square', f, t + i * 0.11, 0.1, 0.16, sfx)); break;
      case 'win': [523, 659, 784, 1047].forEach((f, i) => osc('square', f, t + i * 0.09, 0.12, 0.14, sfx)); break;
    }
  };

  root.Sound = A;
})(this);
