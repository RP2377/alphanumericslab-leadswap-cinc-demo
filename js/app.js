/* ===========================================================================
   app.js — flow controller / state machine for "Detect and Correct"
   ---------------------------------------------------------------------------
   Renders everything client-side. Top-level routing is hash-based (#/ home,
   #/case/:id case) so a GitHub Pages refresh won't 404; step-within-a-case is
   held in JS state. See ecg.js / bodyDiagram.js / cases.js for the pieces.
   =========================================================================== */
(function () {
  'use strict';

  var root = document.getElementById('app');

  var state = {
    caseId: null,
    step: null,
    swapGuess: null,     // 'swap' | 'noswap'
    classGuess: null,    // classId chosen in the quiz
    showingCorrected: false
  };

  // ---- tiny DOM helper ------------------------------------------------------
  function h(tag, props, children) {
    var e = document.createElement(tag);
    if (props) {
      for (var k in props) {
        if (k === 'class') e.className = props[k];
        else if (k === 'html') e.innerHTML = props[k];
        else if (k.slice(0, 2) === 'on' && typeof props[k] === 'function') {
          e.addEventListener(k.slice(2).toLowerCase(), props[k]);
        } else if (props[k] != null) e.setAttribute(k, props[k]);
      }
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  }

  function pct(p) { return Math.round(p * 100) + '%'; }

  // ---- shared components ----------------------------------------------------
  function topbar(crumb) {
    return h('div', { class: 'topbar' }, [
      h('button', { class: 'back', onclick: goHome }, ['← Examples']),
      h('span', { class: 'crumb' }, [crumb || ''])
    ]);
  }

  // ECG panel; returns { node, canvas, render(signals) }
  function ecgPanel(signals, pillText, pillClass) {
    var canvas = h('canvas', { class: 'ecg-canvas' });
    var wrap = h('div', { class: 'ecg-wrap' }, [canvas]);
    var caption = h('div', { class: 'ecg-caption' }, [
      h('span', {}, ['Limb leads · I, II, III, aVR, aVL, aVF']),
      pillText ? h('span', { class: 'pill ' + (pillClass || '') }, [pillText]) : null
    ]);
    var node = h('div', {}, [wrap, caption]);
    // render after layout so canvas.clientWidth is known
    requestAnimationFrame(function () { ECG.renderLeads(canvas, signals); });
    return { node: node, canvas: canvas, caption: caption };
  }

  function binaryReadout(c) {
    var p = c.binary.swapProbability;
    var detected = p >= c.binary.threshold;
    return h('div', { class: 'panel' }, [
      h('div', { class: 'section-label' }, ['Binary detector']),
      h('div', { class: 'readout' }, [
        h('div', { class: 'row' }, [
          h('span', { class: 'k' }, ['Prediction']),
          h('span', { class: 'v' }, [detected ? 'Swap detected' : 'No swap detected'])
        ]),
        h('div', { class: 'row' }, [
          h('span', { class: 'k' }, ['Swap probability']),
          h('span', { class: 'v' }, [
            pct(p),
            h('span', { class: 'sub' }, ['softmax confidence · threshold ' + pct(c.binary.threshold)])
          ])
        ])
      ])
    ]);
  }

  // Multiclass readout. `highlightClass` forces which row is emphasised (else top).
  function multiclassReadout(c, opts) {
    opts = opts || {};
    var probs = c.multiclass.probabilities;
    var topClass = opts.highlightClass != null ? opts.highlightClass : c.multiclass.predictedClass;

    var headParts = [];
    if (opts.scoreForClass != null) {
      headParts.push(h('div', { class: 'readout' }, [
        h('div', { class: 'row' }, [
          h('span', { class: 'k' }, ['Score for your guess (' + CaseData.CLASS_LABELS[opts.scoreForClass] + ')']),
          h('span', { class: 'v' }, [pct(probs[opts.scoreForClass])])
        ])
      ]));
    } else {
      headParts.push(h('div', { class: 'readout' }, [
        h('div', { class: 'row' }, [
          h('span', { class: 'k' }, ['Predicted swap']),
          h('span', { class: 'v' }, [CaseData.CLASS_LABELS[topClass]])
        ]),
        h('div', { class: 'row' }, [
          h('span', { class: 'k' }, ['Class probability']),
          h('span', { class: 'v' }, [pct(probs[topClass])])
        ])
      ]));
    }

    var bars = probs.map(function (p, idx) {
      return h('div', { class: 'prob' + (idx === topClass ? ' top' : '') }, [
        h('span', { class: 'lab' }, [CaseData.CLASS_LABELS[idx]]),
        h('span', { class: 'bar' }, [h('span', { style: 'width:' + pct(p) })]),
        h('span', { class: 'val' }, [pct(p)])
      ]);
    });

    var details = h('details', { class: 'more' }, [
      h('summary', {}, ['Show all class probabilities']),
      h('div', { class: 'probs' }, bars)
    ]);

    return h('div', { class: 'panel' }, [
      h('div', { class: 'section-label' }, ['Multiclass classifier (2-lead)'])
    ].concat(headParts, [details]));
  }

  function banner(kind, text) {
    var ico = kind === 'good' ? '✓' : kind === 'bad' ? '✕' : 'ℹ';
    return h('div', { class: 'result-banner ' + kind }, [
      h('span', { class: 'ico' }, [ico]),
      h('span', {}, [text])
    ]);
  }

  function quizButtons(onPick) {
    return h('div', { class: 'btn-stack' }, CaseData.QUIZ_OPTIONS.map(function (opt) {
      return h('button', { class: 'btn choice', onclick: function () { onPick(opt.classId); } }, [opt.label]);
    }));
  }

  // ---- HOME -----------------------------------------------------------------
  function renderHome() {
    var cards = CaseData.all.map(function (c) {
      return h('button', { class: 'case-card fade-in', onclick: function () { openCase(c.id); } }, [
        h('div', { class: 'num' }, [String(c.num)]),
        h('div', { class: 'meta' }, [
          h('div', { class: 't' }, [c.title]),
          h('div', { class: 'd' }, [c.subtitle])
        ]),
        h('div', { class: 'chev' }, ['›'])
      ]);
    });

    mount([
      h('div', { class: 'hero fade-in' }, [
        h('span', { class: 'badge' }, ['Detect & Correct']),
        h('h1', {}, ['Can you spot the electrode swap?']),
        h('p', {}, ['Inspect each ECG, make your guess, then see what the model predicts. About a minute.'])
      ]),
      h('div', { class: 'case-list' }, cards),
      h('div', { class: 'notice', style: 'margin-top:16px' }, [
        'This demonstration uses simulated model outputs for synthetic ECG examples.'
      ])
    ]);
  }

  // ---- CASE dispatch --------------------------------------------------------
  function renderCase() {
    var c = CaseData.byId(state.caseId);
    if (!c) return goHome();
    if (c.category === 'synthetic_swap') return renderSyntheticSwap(c);
    if (c.category === 'clean') return renderClean(c);
    if (c.category === 'real_unconfirmed') return renderRealUnconfirmed(c);
  }

  // ---- Example 1: synthetic obvious swap ------------------------------------
  function renderSyntheticSwap(c) {
    var crumb = 'Example 1 · ' + c.title;

    if (state.step === 'inspect') {
      var panel = ecgPanel(c.waveforms.recorded, 'Recorded', 'recorded');
      return mount([
        topbar(crumb),
        h('div', { class: 'fade-in' }, [
          h('div', { class: 'prompt' }, ['Is this ECG swapped?']),
          panel.node,
          h('div', { class: 'btn-row' }, [
            h('button', { class: 'btn primary', onclick: function () { setStep('quiz'); state.swapGuess = 'swap'; } }, ['Swap']),
            h('button', { class: 'btn', onclick: function () { state.swapGuess = 'noswap'; setStep('binaryReveal'); } }, ['No swap'])
          ])
        ])
      ]);
    }

    if (state.step === 'binaryReveal') {   // reached only from a "No swap" (wrong) guess
      return mount([
        topbar(crumb),
        h('div', { class: 'fade-in' }, [
          banner('bad', 'Incorrect — this ECG is swapped.'),
          binaryReadout(c),
          h('button', { class: 'btn primary', onclick: function () { setStep('quiz'); } }, ['Continue → which swap?'])
        ])
      ]);
    }

    if (state.step === 'quiz') {
      var panelQ = ecgPanel(c.waveforms.recorded, 'Recorded', 'recorded');
      return mount([
        topbar(crumb),
        h('div', { class: 'fade-in' }, [
          h('div', { class: 'prompt' }, ['Which electrodes were swapped?']),
          panelQ.node,
          quizButtons(function (classId) { state.classGuess = classId; setStep('final'); })
        ])
      ]);
    }

    if (state.step === 'final') {
      var correct = state.classGuess === c.trueClass;
      return mountFinalSwap(c, crumb, correct);
    }
  }

  // Shared final page for Example 1 (both branches converge here).
  function mountFinalSwap(c, crumb, correct) {
    var diagram = BodyDiagram.create(c.multiclass.predictedClass);
    var panel = ecgPanel(
      state.showingCorrected ? c.waveforms.corrected : c.waveforms.recorded,
      state.showingCorrected ? 'Corrected' : 'Recorded',
      state.showingCorrected ? 'corrected' : 'recorded'
    );

    var undoBtn = h('button', { class: 'btn primary' }, [
      state.showingCorrected ? 'Show recorded again' : 'Undo swap →'
    ]);
    undoBtn.addEventListener('click', function () {
      var toCorrected = !state.showingCorrected;
      var from = toCorrected ? c.waveforms.recorded : c.waveforms.corrected;
      var to = toCorrected ? c.waveforms.corrected : c.waveforms.recorded;
      ECG.morphLeads(panel.canvas, from, to, 650);
      if (toCorrected) diagram.undo();
      state.showingCorrected = toCorrected;
      panel.caption.replaceWith(h('div', { class: 'ecg-caption' }, [
        h('span', {}, ['Limb leads · I, II, III, aVR, aVL, aVF']),
        h('span', { class: 'pill ' + (toCorrected ? 'corrected' : 'recorded') }, [toCorrected ? 'Corrected' : 'Recorded'])
      ]));
      undoBtn.textContent = toCorrected ? 'Show recorded again' : 'Undo swap →';
    });

    mount([
      topbar(crumb),
      h('div', { class: 'fade-in' }, [
        banner(correct ? 'good' : 'bad', correct ? 'Correct!' : 'Not quite.'),
        binaryReadout(c),
        multiclassReadout(c),
        h('div', { class: 'panel' }, [
          h('div', { class: 'section-label' }, ['Electrode placement']),
          diagram.node,
          h('p', { class: 'tiny', style: 'margin-top:10px;text-align:center' }, [c.explanation]),
          panel.node,
          undoBtn
        ])
      ])
    ]);
  }

  // ---- Example 2: clean, no swap --------------------------------------------
  function renderClean(c) {
    var crumb = 'Example 2 · ' + c.title;

    if (state.step === 'inspect') {
      var panel = ecgPanel(c.waveforms.recorded, 'Recorded', 'recorded');
      return mount([
        topbar(crumb),
        h('div', { class: 'fade-in' }, [
          h('div', { class: 'prompt' }, ['Is this ECG swapped?']),
          panel.node,
          h('div', { class: 'btn-row' }, [
            h('button', { class: 'btn', onclick: function () { state.swapGuess = 'swap'; setStep('quiz'); } }, ['Swap']),
            h('button', { class: 'btn primary', onclick: function () { state.swapGuess = 'noswap'; setStep('finalCorrect'); } }, ['No swap'])
          ])
        ])
      ]);
    }

    if (state.step === 'finalCorrect') {   // guessed "no swap" — correct, ends here
      return mount([
        topbar(crumb),
        h('div', { class: 'fade-in' }, [
          banner('good', 'Correct — no swap here.'),
          binaryReadout(c),
          h('p', { class: 'tiny' }, [c.explanation]),
          h('button', { class: 'btn ghost', onclick: goHome }, ['Back to examples'])
        ])
      ]);
    }

    if (state.step === 'quiz') {           // guessed "swap" — wrong, quiz anyway
      var panelQ = ecgPanel(c.waveforms.recorded, 'Recorded', 'recorded');
      return mount([
        topbar(crumb),
        h('div', { class: 'fade-in' }, [
          h('div', { class: 'prompt' }, ['If it were swapped — which electrodes?']),
          panelQ.node,
          quizButtons(function (classId) { state.classGuess = classId; setStep('finalWrong'); })
        ])
      ]);
    }

    if (state.step === 'finalWrong') {
      return mount([
        topbar(crumb),
        h('div', { class: 'fade-in' }, [
          banner('bad', 'Incorrect — there is no swap in this ECG.'),
          binaryReadout(c),
          multiclassReadout(c, { scoreForClass: state.classGuess }),
          h('button', { class: 'btn ghost', onclick: goHome }, ['Back to examples'])
        ])
      ]);
    }
  }

  // ---- Example 3: real, unconfirmed -----------------------------------------
  function renderRealUnconfirmed(c) {
    var crumb = 'Example 3 · ' + c.title;

    if (state.step === 'inspect') {
      var panel = ecgPanel(c.waveforms.recorded, 'As recorded', 'recorded');
      return mount([
        topbar(crumb),
        h('div', { class: 'fade-in' }, [
          h('div', { class: 'notice strong' }, [
            'This is a real, unreviewed ECG the model flagged as a likely swap — the correction shown is a hypothesis, not a confirmed fact.'
          ]),
          h('div', { class: 'prompt' }, ['Does this look swapped to you?']),
          panel.node,
          h('div', { class: 'btn-row' }, [
            h('button', { class: 'btn', onclick: function () { state.swapGuess = 'swap'; setStep('binary'); } }, ['Swapped']),
            h('button', { class: 'btn', onclick: function () { state.swapGuess = 'noswap'; setStep('binary'); } }, ['Not swapped'])
          ])
        ])
      ]);
    }

    if (state.step === 'binary') {
      return mount([
        topbar(crumb),
        h('div', { class: 'fade-in' }, [
          banner('neutral', 'Here’s what the model thinks:'),
          binaryReadout(c),
          multiclassReadout(c),
          h('p', { class: 'tiny' }, ['No confirmed answer exists for this recording, so there’s no right or wrong guess.']),
          h('button', { class: 'btn primary', onclick: function () { setStep('compare'); } }, ['See the counterfactual correction →'])
        ])
      ]);
    }

    if (state.step === 'compare') {
      var panel2 = ecgPanel(
        state.showingCorrected ? c.waveforms.corrected : c.waveforms.recorded,
        state.showingCorrected ? 'Counterfactual corrected' : 'Raw (as recorded)',
        state.showingCorrected ? 'corrected' : 'recorded'
      );
      var toggle = h('button', { class: 'btn primary' }, [
        state.showingCorrected ? 'Show raw recording' : 'Show corrected hypothesis'
      ]);
      toggle.addEventListener('click', function () {
        var toCorrected = !state.showingCorrected;
        ECG.morphLeads(panel2.canvas,
          toCorrected ? c.waveforms.recorded : c.waveforms.corrected,
          toCorrected ? c.waveforms.corrected : c.waveforms.recorded, 650);
        state.showingCorrected = toCorrected;
        panel2.caption.replaceWith(h('div', { class: 'ecg-caption' }, [
          h('span', {}, ['Limb leads · I, II, III, aVR, aVL, aVF']),
          h('span', { class: 'pill ' + (toCorrected ? 'corrected' : 'recorded') }, [toCorrected ? 'Counterfactual corrected' : 'Raw (as recorded)'])
        ]));
        toggle.textContent = toCorrected ? 'Show raw recording' : 'Show corrected hypothesis';
      });

      return mount([
        topbar(crumb),
        h('div', { class: 'fade-in' }, [
          h('div', { class: 'notice strong' }, ['Hypothesis only — no confirmed ground truth for this recording.']),
          h('div', { class: 'prompt' }, ['Compare raw vs. counterfactual']),
          panel2.node,
          toggle,
          h('button', { class: 'btn ghost', style: 'margin-top:12px', onclick: goHome }, ['Back to examples'])
        ])
      ]);
    }
  }

  // ---- plumbing -------------------------------------------------------------
  function mount(nodes) {
    root.innerHTML = '';
    nodes.forEach(function (n) { if (n) root.appendChild(n); });
    window.scrollTo(0, 0);
  }

  function setStep(step) {
    state.step = step;
    state.showingCorrected = false;
    render();
  }

  function openCase(id) {
    state.caseId = id;
    state.step = 'inspect';
    state.swapGuess = null;
    state.classGuess = null;
    state.showingCorrected = false;
    location.hash = '#/case/' + id;
  }

  function goHome() {
    state.caseId = null;
    location.hash = '#/';
  }

  function render() {
    if (state.caseId) renderCase();
    else renderHome();
  }

  function onHashChange() {
    var m = location.hash.match(/^#\/case\/(.+)$/);
    if (m) {
      // entering (or refreshing) a case: start at its first step
      if (state.caseId !== m[1] || !state.step) {
        state.caseId = m[1];
        state.step = 'inspect';
        state.swapGuess = null;
        state.classGuess = null;
        state.showingCorrected = false;
      }
      render();
    } else {
      state.caseId = null;
      renderHome();
    }
  }

  window.addEventListener('hashchange', onHashChange);
  onHashChange();
})();
