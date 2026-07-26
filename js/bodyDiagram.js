/* ===========================================================================
   bodyDiagram.js — SVG limb-electrode placement diagram
   ---------------------------------------------------------------------------
   Draws a simple torso with the four limb electrodes (RA, LA, LL, RL). Given a
   swap class it can render the electrodes in swapped positions (highlighted),
   and animate them back to correct positions when the "Undo swap" button is
   pressed. Each electrode lives in a <g transform> so CSS transitions on the
   transform give smooth, reliable movement across browsers.
   =========================================================================== */
(function (global) {
  'use strict';

  // Home positions (viewBox 0..200 x, 0..240 y). RL = right leg (ground).
  var HOME = {
    RA: { x: 44, y: 78, label: 'RA', color: '#f87171' },
    LA: { x: 156, y: 78, label: 'LA', color: '#fbbf24' },
    LL: { x: 132, y: 196, label: 'LL', color: '#34d399' },
    RL: { x: 68, y: 196, label: 'RL', color: '#94a3b8' }
  };

  // Which two electrode positions a swap class exchanges (quiz classes only).
  var SWAP_PAIR = { 1: ['RA', 'LA'], 2: ['RA', 'LL'], 3: ['LA', 'LL'] };

  function el(tag, attrs) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  // Create the diagram. classId: the swap to depict (0 = none).
  // Returns { node, undo() }.
  function create(classId) {
    var pair = SWAP_PAIR[classId] || null;

    var svg = el('svg', {
      viewBox: '0 0 200 240',
      width: '100%',
      role: 'img',
      'aria-label': 'Electrode placement diagram'
    });
    svg.style.maxWidth = '260px';
    svg.style.display = 'block';
    svg.style.margin = '0 auto';

    // torso silhouette
    var body = el('path', {
      d: 'M100 20 ' +
         'C120 20 132 32 132 50 C132 62 126 70 120 74 ' +
         'L150 92 C170 104 176 120 176 150 L168 150 ' +
         'C168 128 160 116 146 108 L140 150 L150 220 L120 220 L108 150 ' +
         'L92 150 L80 220 L50 220 L60 150 L54 108 ' +
         'C40 116 32 128 32 150 L24 150 C24 120 30 104 50 92 ' +
         'L80 74 C74 70 68 62 68 50 C68 32 80 20 100 20 Z',
      fill: 'rgba(148,163,184,0.10)',
      stroke: 'rgba(148,163,184,0.35)',
      'stroke-width': '1.5'
    });
    svg.appendChild(body);

    // connection line between swapped electrodes (shows the exchange)
    var swapLine = null;
    if (pair) {
      swapLine = el('line', {
        x1: HOME[pair[0]].x, y1: HOME[pair[0]].y,
        x2: HOME[pair[1]].x, y2: HOME[pair[1]].y,
        stroke: '#f87171', 'stroke-width': '2', 'stroke-dasharray': '4 4',
        opacity: '0.9'
      });
      swapLine.style.transition = 'opacity 0.4s ease';
      svg.appendChild(swapLine);
    }

    // electrode groups
    var groups = {};
    Object.keys(HOME).forEach(function (name) {
      var home = HOME[name];
      // start position: swapped if this electrode is part of the pair
      var startName = name;
      if (pair) {
        if (name === pair[0]) startName = pair[1];
        else if (name === pair[1]) startName = pair[0];
      }
      var start = HOME[startName];
      var swapped = pair && (name === pair[0] || name === pair[1]);

      var g = el('g', { transform: 'translate(' + start.x + ',' + start.y + ')' });
      g.style.transition = 'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)';

      // Solid dark fill (not translucent) so the white label stays legible on
      // both light and dark page themes; the coloured stroke carries the state.
      var ring = el('circle', {
        r: '15',
        fill: swapped ? '#5b1a1f' : '#1b2440',
        stroke: swapped ? '#f87171' : home.color,
        'stroke-width': swapped ? '3' : '2'
      });
      ring.style.transition = 'stroke 0.4s ease, fill 0.4s ease';

      var txt = el('text', {
        x: '0', y: '4', 'text-anchor': 'middle',
        'font-size': '12', 'font-weight': '700',
        fill: '#eef2ff', 'font-family': 'system-ui, sans-serif'
      });
      // label reflects the electrode's TRUE identity (its signal), which travels
      // with it — i.e. at RA's position currently sits the electrode named startName.
      txt.textContent = home.label;

      g.appendChild(ring);
      g.appendChild(txt);
      svg.appendChild(g);
      groups[name] = { g: g, ring: ring, home: home };
    });

    function undo() {
      if (!pair) return;
      Object.keys(groups).forEach(function (name) {
        var grp = groups[name];
        grp.g.setAttribute('transform', 'translate(' + grp.home.x + ',' + grp.home.y + ')');
        grp.ring.setAttribute('stroke', name === 'RL' ? grp.home.color : '#34d399');
        grp.ring.setAttribute('fill', name === 'RL' ? '#1b2440' : '#0f2e24');
        grp.ring.setAttribute('stroke-width', '2');
      });
      if (swapLine) swapLine.setAttribute('opacity', '0');
    }

    return { node: svg, undo: undo, hasSwap: !!pair };
  }

  global.BodyDiagram = { create: create, SWAP_PAIR: SWAP_PAIR };
})(window);
