/* ===========================================================================
   ecg.js — synthetic ECG generation + canvas rendering
   ---------------------------------------------------------------------------
   SKELETON: waveforms are procedurally SYNTHESIZED, not real patient data.
   We build three limb-electrode potential signals (RA, LA, LL) and derive the
   six limb leads from them using the *real* electrode->lead relationships, so
   that applying a limb-electrode swap actually distorts the leads the way a
   true swap would (e.g. an RA<->LA swap inverts Lead I). Precordial leads are
   unaffected by limb swaps, so we only display the six limb leads here.

   When real data lands, replace generateCase()'s waveforms with the exported
   arrays from the Python pipeline; the plotting/morphing code stays as-is.
   =========================================================================== */
(function (global) {
  'use strict';

  var FS = 125;            // display sample rate (Hz)
  var DURATION = 4.0;      // seconds shown
  var N = Math.round(FS * DURATION);

  var LIMB_LEADS = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF'];

  // Limb-electrode permutation classes (mirrors src/class_consts.py CLASS_TO_PERM).
  // Each entry says which source electrode's signal sits in [RA, LA, LL] positions.
  // 0:no swap  1:RA<->LA  2:RA<->LL  3:LA<->LL  (3-cycles 4,5 unused in the quiz)
  var CLASS_TO_PERM = {
    0: ['RA', 'LA', 'LL'],
    1: ['LA', 'RA', 'LL'],
    2: ['LL', 'LA', 'RA'],
    3: ['RA', 'LL', 'LA'],
    4: ['LA', 'LL', 'RA'],
    5: ['LL', 'RA', 'LA']
  };

  // --- tiny deterministic PRNG so a given seed always yields the same trace ---
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gauss(x, mu, sigma, amp) {
    var d = (x - mu) / sigma;
    return amp * Math.exp(-0.5 * d * d);
  }

  // One PQRST beat as a function of phase in [0,1). `k` scales the QRS/T height.
  function beat(phase, k) {
    var v = 0;
    v += gauss(phase, 0.16, 0.022, 0.10 * k);   // P wave
    v += gauss(phase, 0.238, 0.008, -0.09 * k);  // Q
    v += gauss(phase, 0.255, 0.009, 1.00 * k);   // R
    v += gauss(phase, 0.272, 0.009, -0.16 * k);  // S
    v += gauss(phase, 0.42, 0.035, 0.24 * k);    // T wave
    return v;
  }

  // Generate absolute-ish potentials for the three limb electrodes.
  // Amplitude ordering (RA lowest, LL highest) yields a normal frontal axis:
  //   I  = LA - RA  > 0,  II = LL - RA (tallest),  III = LL - LA (small +).
  function synthElectrodes(seed) {
    var rnd = mulberry32(seed);
    var hr = 60 + Math.floor(rnd() * 24);        // 60-84 bpm
    var rr = 60 / hr;                            // seconds per beat
    var phase0 = rnd() * 0.4;
    var kRA = 0.12, kLA = 0.9, kLL = 1.35;       // per-electrode R-wave scale
    var wander = 0.03 + rnd() * 0.02;

    var RA = new Float32Array(N), LA = new Float32Array(N), LL = new Float32Array(N);
    for (var i = 0; i < N; i++) {
      var t = i / FS;
      var ph = ((t / rr) + phase0) % 1;
      var base = wander * Math.sin(2 * Math.PI * 0.25 * t);   // slow baseline drift
      var noise = (rnd() - 0.5) * 0.012;
      RA[i] = kRA * beat(ph, 1) + base * 0.6 + noise;
      LA[i] = kLA * beat(ph, 1) + base + noise;
      LL[i] = kLL * beat(ph, 1) + base + (rnd() - 0.5) * 0.012;
    }
    return { RA: RA, LA: LA, LL: LL };
  }

  // Reassign electrode signals into swapped positions per a permutation class.
  function permuteElectrodes(e, classId) {
    var perm = CLASS_TO_PERM[classId] || CLASS_TO_PERM[0];
    return { RA: e[perm[0]], LA: e[perm[1]], LL: e[perm[2]] };
  }

  // Standard limb-lead definitions from electrode potentials.
  function deriveLimbLeads(e) {
    var I = new Float32Array(N), II = new Float32Array(N), III = new Float32Array(N);
    var aVR = new Float32Array(N), aVL = new Float32Array(N), aVF = new Float32Array(N);
    for (var i = 0; i < N; i++) {
      var ra = e.RA[i], la = e.LA[i], ll = e.LL[i];
      I[i] = la - ra;
      II[i] = ll - ra;
      III[i] = ll - la;
      aVR[i] = ra - (la + ll) / 2;
      aVL[i] = la - (ra + ll) / 2;
      aVF[i] = ll - (ra + la) / 2;
    }
    return { I: I, II: II, III: III, aVR: aVR, aVL: aVL, aVF: aVF };
  }

  function leadsToArray(leads) {
    return LIMB_LEADS.map(function (name) { return leads[name]; });
  }

  // ---- Rendering ------------------------------------------------------------
  function drawGrid(ctx, w, h) {
    ctx.save();
    ctx.fillStyle = getVar('--ecg-bg', '#0a0f1e');
    ctx.fillRect(0, 0, w, h);
    var small = 8;   // px per small square
    ctx.lineWidth = 1;
    ctx.strokeStyle = getVar('--ecg-grid', 'rgba(255,90,90,0.16)');
    ctx.beginPath();
    for (var x = 0; x <= w; x += small) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (var y = 0; y <= h; y += small) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
    ctx.strokeStyle = getVar('--ecg-grid-strong', 'rgba(255,90,90,0.30)');
    ctx.beginPath();
    for (var x2 = 0; x2 <= w; x2 += small * 5) { ctx.moveTo(x2, 0); ctx.lineTo(x2, h); }
    for (var y2 = 0; y2 <= h; y2 += small * 5) { ctx.moveTo(0, y2); ctx.lineTo(w, y2); }
    ctx.stroke();
    ctx.restore();
  }

  function getVar(name, fallback) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch (e) { return fallback; }
  }

  // Plot 6 stacked limb leads onto a canvas. `signals` = array of 6 Float32Arrays.
  function renderLeads(canvas, signals) {
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var cssW = canvas.clientWidth || 320;
    var rowH = 58;
    var cssH = rowH * 6;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.height = cssH + 'px';
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    drawGrid(ctx, cssW, cssH);

    var trace = getVar('--ecg-trace', '#35e08f');
    var padX = 6;
    var plotW = cssW - padX * 2;
    var gain = 16; // px per mV

    for (var r = 0; r < 6; r++) {
      var sig = signals[r];
      var midY = r * rowH + rowH / 2;

      // lead label
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '600 12px -apple-system, system-ui, sans-serif';
      ctx.fillText(LIMB_LEADS[r], padX + 2, r * rowH + 14);

      ctx.beginPath();
      ctx.strokeStyle = trace;
      ctx.lineWidth = 1.4;
      ctx.lineJoin = 'round';
      for (var i = 0; i < sig.length; i++) {
        var x = padX + (i / (sig.length - 1)) * plotW;
        var y = midY - sig[i] * gain;
        if (y < r * rowH + 3) y = r * rowH + 3;
        if (y > (r + 1) * rowH - 3) y = (r + 1) * rowH - 3;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();

      if (r < 5) {
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, (r + 1) * rowH);
        ctx.lineTo(cssW, (r + 1) * rowH);
        ctx.stroke();
      }
    }
  }

  // Animate a morph from one set of 6 signals to another (used by "Undo swap").
  function morphLeads(canvas, fromSignals, toSignals, durationMs, onDone) {
    var start = null;
    var dur = durationMs || 650;
    function frame(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // easeInOut
      var blended = fromSignals.map(function (f, idx) {
        var t = toSignals[idx];
        var out = new Float32Array(f.length);
        for (var i = 0; i < f.length; i++) out[i] = f[i] + (t[i] - f[i]) * ease;
        return out;
      });
      renderLeads(canvas, blended);
      if (p < 1) requestAnimationFrame(frame);
      else if (onDone) onDone();
    }
    requestAnimationFrame(frame);
  }

  global.ECG = {
    FS: FS,
    LIMB_LEADS: LIMB_LEADS,
    CLASS_TO_PERM: CLASS_TO_PERM,
    synthElectrodes: synthElectrodes,
    permuteElectrodes: permuteElectrodes,
    deriveLimbLeads: deriveLimbLeads,
    leadsToArray: leadsToArray,
    renderLeads: renderLeads,
    morphLeads: morphLeads
  };
})(window);
