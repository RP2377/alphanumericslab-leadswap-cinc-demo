/* ===========================================================================
   cases.js — FAKE case data for the skeleton
   ---------------------------------------------------------------------------
   Mirrors the JSON schema the Python export pipeline will eventually produce
   (see repo TODO.md section 2). All numbers here are INVENTED placeholders so
   we can build and test the UI without running the models. Waveforms are
   synthesized on the fly from a seed via ECG.synthElectrodes().

   category:
     'synthetic_swap'   — Example 1: real record + synthetic swap, full quiz + undo
     'clean'            — Example 2: no swap; correct guess ends, wrong guess -> quiz
     'real_unconfirmed' — Example 3: real flagged record, no ground truth, compare toggle

   Quiz option -> classId:  RA-LA = 1, RA-LL = 2, LA-LL = 3
   =========================================================================== */
(function (global) {
  'use strict';

  var CLASS_LABELS = {
    0: 'No swap',
    1: 'RA ↔ LA',
    2: 'RA ↔ LL',
    3: 'LA ↔ LL',
    4: 'RA→LA→LL',
    5: 'RA→LL→LA'
  };

  var QUIZ_OPTIONS = [
    { label: 'RA ↔ LA', classId: 1 },
    { label: 'RA ↔ LL', classId: 2 },
    { label: 'LA ↔ LL', classId: 3 }
  ];

  // Build the electrode signals + recorded/corrected lead arrays for a case.
  function buildWaveforms(seed, recordedClass, correctedClass) {
    var base = ECG.synthElectrodes(seed);                 // "true" electrode potentials
    var recordedE = ECG.permuteElectrodes(base, recordedClass);
    var correctedE = ECG.permuteElectrodes(base, correctedClass);
    return {
      recorded: ECG.leadsToArray(ECG.deriveLimbLeads(recordedE)),
      corrected: ECG.leadsToArray(ECG.deriveLimbLeads(correctedE))
    };
  }

  var CASES = [
    {
      id: 'ex1-synth-swap',
      category: 'synthetic_swap',
      num: 1,
      title: 'Obvious swap',
      subtitle: 'Synthetic RA↔LA swap on a normal ECG',
      trueClass: 1,
      // FAKE model outputs
      binary: { swapProbability: 0.994, threshold: 0.38 },
      multiclass: {
        predictedClass: 1,
        probabilities: [0.02, 0.88, 0.02, 0.02, 0.02, 0.04]  // peaks at class 1
      },
      explanation: 'This reversal produces a strong, recognizable change in the limb leads — a good first example of what an accidental electrode swap looks like.',
      // recorded shows the swap (class 1); corrected undoes it (class 0)
      seed: 101, recordedClass: 1, correctedClass: 0
    },
    {
      id: 'ex2-clean',
      category: 'clean',
      num: 2,
      title: 'Clean recording',
      subtitle: 'A normal ECG with no swap',
      trueClass: 0,
      binary: { swapProbability: 0.031, threshold: 0.38 },
      multiclass: {
        predictedClass: 0,
        probabilities: [0.86, 0.03, 0.03, 0.03, 0.02, 0.03]
      },
      explanation: 'No electrode swap is present. A well-behaved detector should stay quiet here.',
      seed: 202, recordedClass: 0, correctedClass: 0
    },
    {
      id: 'ex3-real-flagged',
      category: 'real_unconfirmed',
      num: 3,
      title: 'Real, model-flagged',
      subtitle: 'An unreviewed ECG the model flagged as a likely swap',
      trueClass: null,               // no ground truth
      binary: { swapProbability: 0.87, threshold: 0.38 },
      multiclass: {
        predictedClass: 2,
        probabilities: [0.05, 0.10, 0.63, 0.09, 0.08, 0.05] // peaks at class 2 (RA-LL)
      },
      explanation: 'A real recording the detector scored highly. There is no confirmed answer — the correction below is the model’s hypothesis, not a verified fact.',
      // recorded = as-recorded (treat as class 0 baseline); corrected = undo predicted class 2
      seed: 303, recordedClass: 0, correctedClass: 2
    }
  ];

  // Attach generated waveforms once at load.
  CASES.forEach(function (c) {
    c.waveforms = buildWaveforms(c.seed, c.recordedClass, c.correctedClass);
  });

  function byId(id) {
    for (var i = 0; i < CASES.length; i++) if (CASES[i].id === id) return CASES[i];
    return null;
  }

  global.CASES = CASES;
  global.CaseData = {
    all: CASES,
    byId: byId,
    CLASS_LABELS: CLASS_LABELS,
    QUIZ_OPTIONS: QUIZ_OPTIONS
  };
})(window);
