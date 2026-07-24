# Pen Stroke → Spline Explorer — Design Points

Running log of design points dictated by Will, one per turn. Questions held until end.

Baseline concept (from initial discussion, confirmed): staged pipeline (capture → smoothing → simplification/resampling → corner detection → curve fitting), explorer UI with toggleable overlay layers, parameter sliders with live re-fit, error visualization, stats readout; follows existing module pattern (core algorithms in `@proc-geo/core`, components + scene adapter in `@proc-geo/dashboard`, route in demo app).

## Points

1. The overall concept shape as discussed is confirmed exact — refinements to follow in subsequent points.
2. First implementation pass is a **horizontal slice** (Will's preferred term — it's a row): exactly one algorithm in each pipeline stage ("one thing in each column"), end to end. Purpose: exercise the page UI/UX for real, and let Will review the architectural approach before adding per-stage variants that would multiply the maintenance surface.
3. **Licensing**: do NOT use or port Inkscape code (GPL). Paper.js is MIT (believed — verify before borrowing anything). Implementing Schneider's algorithm from the paper / Graphics Gems description is fine; write our own implementation rather than porting GPL sources.
4. **End-state controls UI**: each pipeline stage gets a **dropdown** for its discrete variant choice (e.g. which noise-smoothing algorithm, which curve-fitting algorithm); numerical parameters get **slider + number input** pairs.
5. Boolean config params use **toggle/switch** affordances (Mantine `Switch`), not checkboxes — neater in this context.
6. **Core drawing UX**: LMB down begins a stroke; while dragging, capture raw points; LMB up terminates the line.
7. **Single-stroke canvas** in initial design: only one line exists at a time; starting a new stroke wipes the previous one. Keeps focus on how raw input is processed downstream.
8. **Flagship feature**: a slider that **lerps between the raw input capture and the smoothed spline line** — a continuous morph between the raw polyline and the fitted curve.
9. **Correspondence mapping for the lerp** (Will's proposal, refined and accepted — this is the crux of the page's design): process raw input non-destructively to produce the spline; make an index-matched copy of the raw input with each point mapped onto the spline; spline drawn as a straight-segment polyline of small subdivisions; lerp is per-point between index-matched pairs. **Accepted refinement**: map via *matched* arc-length fractions (raw point's cumulative arc-length fraction → same fraction along the spline) rather than uniform spacing, so points move ~normal to the stroke and the morph reads as smoothing, not tangential sliding. Preferred correspondence when available: the fitter's own per-point parameterization (Schneider assigns each raw point a `t` while measuring fit error) — use that as default, arc-length-fraction method as the general fallback.

## Resolved Questions (question round, answered by Will)

1. **Slice columns**: ALL pipeline columns exist in V1, with pass-through variants where no real algorithm ships yet — purpose is to prototype the full UI and architecture. Real algorithms in the slice: simple smoothing (moving average), Schneider curve fitting. Simplification and corner detection columns present as pass-throughs.
2. **Corner rounding**: Schneider rounding sharp corners is fine for V1 (no corner detection algorithm yet).
3. **Recompute semantics**: each parameter/slider has its own recompute cascade — a change recomputes from its pipeline stage downstream. Ideal: hot-update of the full render from raw input on every UI tweak. The raw input acts as the fixture until a new stroke is drawn. Lerp slider is view-level only, no recompute.
4. **Canvas contents**: V1 canvas is blank apart from the (lerped) line — no overlays yet.
5. **Output/interop**: V1 is purely self-contained; design with potential for downstream interop (e.g. skeleton solver, L-systems) later, but no closure/polygon support needed now.
6. **Capture record**: `(x, y, t)` per point from day one, plus pressure via Pointer Events when available. Approved.
7. **Naming**: route `/pen-stroke`; core module `packages/core/src/stroke-spline/`; store `usePenStrokeStore`; components `packages/dashboard/src/components/pen-stroke/`. Approved.
8. **Lerp slider**: plain manual slider in V1, no playback/animation.
