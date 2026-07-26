# Detect & Correct — ECG Lead-Swap Poster Demo

Static, self-contained prototype of the **"Detect and Correct"** QR-code flow
for the ECG limb-electrode-swap poster. Loads once and runs entirely in the
browser (phone / tablet / laptop) with no server round-trips, so it works from
cache on unreliable conference Wi-Fi.

> ⚠️ **Skeleton status:** model outputs and ECG waveforms are **simulated /
> synthetic placeholders**. Real precomputed model exports (from
> `ecg-lead-swapping/codes/website_export/`) replace the data in
> `js/cases.js` later — the UI/rendering code stays as-is.

## Run locally

```bash
# from this directory
python3 -m http.server 8000
# open http://localhost:8000/
```

(A plain static server is required — opening `index.html` via `file://` breaks
the service worker and some browsers' asset loading.)

## The three examples

1. **Obvious swap** — synthetic RA↔LA swap. Guess swap/no-swap → swap-type quiz
   → result with binary + multiclass readout, body diagram, and an **Undo swap**
   button that animates the electrodes back and morphs the ECG to corrected.
2. **Clean recording** — no swap. Correct "no swap" guess ends immediately; a
   wrong "swap" guess still runs the quiz, then shows the (incorrect) result.
3. **Real, model-flagged** — an unreviewed recording with no ground truth.
   Guess (ungraded) → model readout → toggle between raw and the model's
   counterfactual correction.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Shell; loads scripts, registers service worker |
| `css/styles.css` | Mobile-first styling, ECG aesthetic, light/dark |
| `js/ecg.js` | Synthetic ECG generation (real electrode→lead math) + canvas plot + morph animation |
| `js/bodyDiagram.js` | SVG limb-electrode diagram with swap highlight + undo animation |
| `js/cases.js` | **Fake** case data (matches the planned export JSON schema) |
| `js/app.js` | Flow controller / state machine, hash routing |
| `sw.js` | Minimal offline cache |

## Deploy

Pushing to `main` deploys the whole repo root to GitHub Pages via
`.github/workflows/static.yml`. All asset paths are relative so it works under
the `/<repo>/` Pages subpath.
