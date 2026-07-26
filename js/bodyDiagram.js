/* ===========================================================================
   bodyDiagram.js — SVG limb-electrode placement diagram
   ---------------------------------------------------------------------------
   Draws a torso with the four limb electrodes (RA, LA, LL, RL). Given a swap
   CLASS (0-5) it places each electrode at the location dictated by that class's
   permutation, highlights any displaced electrodes in red, and can animate
   between the swapped and corrected states. Handles single swaps (classes
   1-3) AND 3-cycles (classes 4-5), so any class the model predicts renders
   cleanly. Each electrode is a <g transform> with a CSS transition for smooth,
   reliable movement across browsers.
   =========================================================================== */
(function (global) {
  'use strict';

  // Body locations (viewBox 0..200 x, 0..240 y). RL = right leg (ground).
  var LOC = {
    RA: { x: 44, y: 78, color: '#f87171' },
    LA: { x: 156, y: 78, color: '#fbbf24' },
    LL: { x: 132, y: 196, color: '#34d399' },
    RL: { x: 68, y: 196, color: '#94a3b8' }
  };

  // For each class, which electrode sits at [RA-loc, LA-loc, LL-loc].
  // Mirrors src/class_consts.py CLASS_TO_PERM (RL is never involved).
  var CLASS_PERM = {
    0: ['RA', 'LA', 'LL'],
    1: ['LA', 'RA', 'LL'],
    2: ['LL', 'LA', 'RA'],
    3: ['RA', 'LL', 'LA'],
    4: ['LA', 'LL', 'RA'],
    5: ['LL', 'RA', 'LA']
  };
  var LIMB_POS = ['RA', 'LA', 'LL'];   // the three limb-location names, in order

  function el(tag, attrs) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  // Where does electrode `e` sit for a given class? Returns a location name.
  function swappedLocationOf(e, classId) {
    if (e === 'RL') return 'RL';
    var perm = CLASS_PERM[classId] || CLASS_PERM[0];
    var idx = perm.indexOf(e);        // position holding electrode e
    return LIMB_POS[idx];
  }

  // Create the diagram. classId: the swap to depict (0 = none).
  // Returns { node, undo(), applySwap(), hasSwap }.
  function create(classId) {
    classId = CLASS_PERM[classId] ? classId : 0;
    var displaced = ['RA', 'LA', 'LL'].filter(function (e) {
      return swappedLocationOf(e, classId) !== e;
    });

    var svg = el('svg', {
      viewBox: '0 0 200 240', width: '100%',
      role: 'img', 'aria-label': 'Electrode placement diagram'
    });
    svg.style.maxWidth = '260px';
    svg.style.display = 'block';
    svg.style.margin = '0 auto';

    var body = el('path', {
      d: 'M100 20 ' +
         'C120 20 132 32 132 50 C132 62 126 70 120 74 ' +
         'L150 92 C170 104 176 120 176 150 L168 150 ' +
         'C168 128 160 116 146 108 L140 150 L150 220 L120 220 L108 150 ' +
         'L92 150 L80 220 L50 220 L60 150 L54 108 ' +
         'C40 116 32 128 32 150 L24 150 C24 120 30 104 50 92 ' +
         'L80 74 C74 70 68 62 68 50 C68 32 80 20 100 20 Z',
      fill: 'rgba(148,163,184,0.10)', stroke: 'rgba(148,163,184,0.35)', 'stroke-width': '1.5'
    });
    svg.appendChild(body);

    // Dashed connectors among displaced electrodes (their swapped positions).
    // 2 displaced -> one line; 3 displaced (a cycle) -> a triangle.
    var swapLines = [];
    for (var a = 0; a < displaced.length; a++) {
      for (var b = a + 1; b < displaced.length; b++) {
        var la = LOC[swappedLocationOf(displaced[a], classId)];
        var lb = LOC[swappedLocationOf(displaced[b], classId)];
        var line = el('line', {
          x1: la.x, y1: la.y, x2: lb.x, y2: lb.y,
          stroke: '#f87171', 'stroke-width': '2', 'stroke-dasharray': '4 4', opacity: '0.9'
        });
        line.style.transition = 'opacity 0.4s ease';
        svg.appendChild(line);
        swapLines.push(line);
      }
    }

    // Electrode groups, keyed by electrode identity.
    var groups = {};
    ['RA', 'LA', 'LL', 'RL'].forEach(function (e) {
      var home = LOC[e];
      var swapLocName = swappedLocationOf(e, classId);
      var swapPos = LOC[swapLocName];
      var isDisplaced = swapLocName !== e;

      var g = el('g', { transform: 'translate(' + swapPos.x + ',' + swapPos.y + ')' });
      g.style.transition = 'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)';

      // Solid dark fill so the white label stays legible in light and dark themes.
      var ring = el('circle', {
        r: '15',
        fill: isDisplaced ? '#5b1a1f' : '#1b2440',
        stroke: isDisplaced ? '#f87171' : home.color,
        'stroke-width': isDisplaced ? '3' : '2'
      });
      ring.style.transition = 'stroke 0.4s ease, fill 0.4s ease';

      var txt = el('text', {
        x: '0', y: '4', 'text-anchor': 'middle',
        'font-size': '12', 'font-weight': '700',
        fill: '#eef2ff', 'font-family': 'system-ui, sans-serif'
      });
      txt.textContent = e;   // label = the electrode's true identity, travels with it

      g.appendChild(ring); g.appendChild(txt); svg.appendChild(g);
      groups[e] = { g: g, ring: ring, home: home, swapPos: swapPos, displaced: isDisplaced };
    });

    // Animate to the CORRECTED state: electrodes glide home and turn green.
    function undo() {
      if (!displaced.length) return;
      Object.keys(groups).forEach(function (e) {
        var grp = groups[e];
        grp.g.setAttribute('transform', 'translate(' + grp.home.x + ',' + grp.home.y + ')');
        grp.ring.setAttribute('stroke', e === 'RL' ? grp.home.color : '#34d399');
        grp.ring.setAttribute('fill', e === 'RL' ? '#1b2440' : '#0f2e24');
        grp.ring.setAttribute('stroke-width', '2');
      });
      swapLines.forEach(function (l) { l.setAttribute('opacity', '0'); });
    }

    // Animate back to the SWAPPED state: electrodes glide to swapped positions,
    // displaced ones turn red again (mirror of undo()).
    function applySwap() {
      if (!displaced.length) return;
      Object.keys(groups).forEach(function (e) {
        var grp = groups[e];
        grp.g.setAttribute('transform', 'translate(' + grp.swapPos.x + ',' + grp.swapPos.y + ')');
        grp.ring.setAttribute('stroke', grp.displaced ? '#f87171' : grp.home.color);
        grp.ring.setAttribute('fill', grp.displaced ? '#5b1a1f' : '#1b2440');
        grp.ring.setAttribute('stroke-width', grp.displaced ? '3' : '2');
      });
      swapLines.forEach(function (l) { l.setAttribute('opacity', '0.9'); });
    }

    return { node: svg, undo: undo, applySwap: applySwap, hasSwap: displaced.length > 0 };
  }

  global.BodyDiagram = { create: create };
})(window);
