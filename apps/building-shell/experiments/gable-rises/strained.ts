// WP-G1.1 item 3: the cases where `ridgeSlope`'s definition is strained, each built under every limit variant that
// gives a different answer there (rise.ts's `Limit`), at more than one pitch pairing. Variants are explicit on each
// run, so the "vs farSlope" column is off here; `farSlope` (struck) is built as one of the variants instead.
import {DEFAULTS, fx, gableRun, report, ring, type Limit, type Run, type RunRing} from './rise.ts';

type R4 = [number, number, number, number];
const OPT = {...DEFAULTS, compareFarSlope: false};
const BASE: Limit[] = ['ridgeSlope', 'ridgeStrict', 'ridgeRoof', 'farSlope'];
const EMPTY: Limit[] = [...BASE, 'peakCap'];
const WIDE: Limit[] = ['ridgeSlope', 'ridgeSplit', 'ridgeAll', 'farSlope'];

/** A case: its name and the Rings it builds with a given limit on the rise's run. */
type Case = [string, (limit: Limit) => RunRing[]];

const run = (from: number, to: number, deg: number, limit: Limit, extra: Partial<Run> = {}): {form: 'hip'; runs: Run[]} =>
  ({form: 'hip', runs: [gableRun(from, to, deg, {limit, ...extra})]});

async function sweep(title: string, cases: Case[], limits: Limit[]): Promise<void> {
  console.log(`\n# ${title}`);
  for (const [name, rings] of cases) for (const limit of limits) await report(fx(`${name}, limit ${limit}`, rings(limit)), OPT);
}

export async function main(): Promise<void> {
  const R: R4 = [0, 0, 1000, 500];
  await sweep('A. No ridge crosses the rise\'s path', [
    ['N gabled, S [300,700]@75 on 45', l => [ring(R, 0, 1, 45, {N: {form: 'gable'}, S: run(300, 700, 75, l)})]],
    ['N gabled, S [400,600]@60 on 30', l => [ring(R, 0, 1, 30, {N: {form: 'gable'}, S: run(400, 600, 60, l)})]],
    ['hip end: E side y[150,350]@75 on 45 (centreline along the main ridge)', l => [ring(R, 0, 1, 45, {E: run(150, 350, 75, l)})]],
    ['hip end: E side y[150,350]@60 on 30', l => [ring(R, 0, 1, 30, {E: run(150, 350, 60, l)})]],
    ['L wing end: stem N y=1000 x[700,900]@75 on 45 (centreline along the stem ridge)', l => [ring([600, 0, 1000, 1000], 0, 1, 45, {N: run(100, 300, 75, l)}), ring([0, 0, 1000, 400], 0, 1, 45)]],
    ['L E x=1000 y[250,450]@75 on 45 (centreline into the bar, along its ridge)', l => [ring([600, 0, 1000, 1000], 0, 1, 45, {E: run(250, 450, 75, l)}), ring([0, 0, 1000, 400], 0, 1, 45)]],
  ], EMPTY);

  await sweep('B. The centreline meets a hip or valley line, or a reflex corner, not a ridge', [
    ['near corner S [850,950]@75 on 45', l => [ring(R, 0, 1, 45, {S: run(850, 950, 75, l)})]],
    ['near corner S [820,980]@60 on 30', l => [ring(R, 0, 1, 30, {S: run(820, 980, 60, l)})]],
    ['L E x=1000 y[300,500]@60 on 45 (centreline to the reflex corner)', l => [ring([600, 0, 1000, 1000], 0, 1, 45, {E: run(300, 500, 60, l)}), ring([0, 0, 1000, 400], 0, 1, 45)]],
    ['L E x=1000 y[300,500]@75 on 30', l => [ring([600, 0, 1000, 1000], 0, 1, 30, {E: run(300, 500, 75, l)}), ring([0, 0, 1000, 400], 0, 1, 30)]],
  ], EMPTY);

  const SQ: R4 = [0, 0, 600, 600];
  await sweep('C. The centreline meets a pyramid apex (square plan)', [
    ['square, centred S [250,350]@75 on 45', l => [ring(SQ, 0, 1, 45, {S: run(250, 350, 75, l)})]],
    ['square, centred S [200,400]@60 on 30', l => [ring(SQ, 0, 1, 30, {S: run(200, 400, 60, l)})]],
    ['square, off-centre S [150,250]@75 on 45', l => [ring(SQ, 0, 1, 45, {S: run(150, 250, 75, l)})]],
    ['square, off-centre S [100,300]@60 on 30', l => [ring(SQ, 0, 1, 30, {S: run(100, 300, 60, l)})]],
  ], EMPTY);

  await sweep('D. A wide band facing more than one slope', [
    ['L S [300,900]@60 on 45', l => [ring([0, 0, 1000, 400], 0, 1, 45, {S: run(300, 900, 60, l)}), ring([600, 0, 1000, 1000], 0, 1, 45)]],
    ['L S [300,900]@75 on 30', l => [ring([0, 0, 1000, 400], 0, 1, 30, {S: run(300, 900, 75, l)}), ring([600, 0, 1000, 1000], 0, 1, 30)]],
    ['U S [200,800]@60 on 45', l => [ring([0, 0, 1000, 300], 0, 1, 45, {S: run(200, 800, 60, l)}), ring([0, 300, 400, 600], 0, 1, 45), ring([600, 300, 1000, 600], 0, 1, 45)]],
    ['T S [250,750]@75 on 45', l => [ring([0, 0, 1000, 400], 0, 1, 45, {S: run(250, 750, 75, l)}), ring([400, 400, 600, 1000], 0, 1, 45)]],
  ], WIDE);

  const COURT: R4[] = [[0, 0, 1000, 300], [0, 700, 1000, 1000], [0, 300, 300, 700], [700, 300, 1000, 700]];
  const court = (deg: number, sides: Record<number, RunRing['sides']>): RunRing[] => COURT.map((r, i) => ring(r, 0, 1, deg, sides[i] ?? {}));
  await sweep('E. The slope beyond the ridge is a gabled wall\'s, a courtyard cut\'s, or near another rise', [
    ['N gabled, S [300,700]@60 on 45', l => [ring(R, 0, 1, 45, {N: {form: 'gable'}, S: run(300, 700, 60, l)})]],
    ['courtyard 30, S [100,300]@60 (beyond the ridge: the cut)', l => court(30, {0: {S: run(100, 300, 60, l)}})],
    ['courtyard 45, S [100,300]@75', l => court(45, {0: {S: run(100, 300, 75, l)}})],
    ['courtyard 30, outer W y[200,400]@45 (centreline along the cut)', l => court(30, {0: {W: run(0, 100, 45, l)}, 2: {W: run(300, 400, 45, l)}})],
    ['courtyard 45, outer W y[200,400]@60', l => court(45, {0: {W: run(0, 100, 60, l)}, 2: {W: run(300, 400, 60, l)}})],
    ['opposite rises S and N [400,600]@75 on 45', l => [ring(R, 0, 1, 45, {S: run(400, 600, 75, l), N: run(400, 600, 75, l)})]],
    ['opposite rises S [400,600]@75, N [300,700]@45 on 45', l => [ring(R, 0, 1, 45, {S: run(400, 600, 75, l), N: run(300, 700, 45, l)})]],
  ], EMPTY);

  await sweep('F. A rise on a courtyard hole wall, facing outward across the ring', [
    ['courtyard 30, hole S y=300 x[400,600]@60', l => court(30, {0: {N: run(400, 600, 60, l)}})],
    ['courtyard 45, hole S y=300 x[400,600]@75', l => court(45, {0: {N: run(400, 600, 75, l)}})],
    ['courtyard 30, hole W x=300 y[400,600]@75 (into the cut-side wing)', l => court(30, {2: {E: run(100, 300, 75, l)}})],
    ['courtyard 45, hole E x=700 y[400,600]@60', l => court(45, {3: {W: run(100, 300, 60, l)}})],
  ], BASE);

  const mixed = (s: number, n: number, sides: RunRing['sides']): RunRing[] => [ring(R, 0, 1, 45, {...sides, S: {...(sides?.S ?? {form: 'hip'}), deg: s}, N: {...(sides?.N ?? {form: 'hip'}), deg: n}})];
  await sweep('G. Mixed pitch: the main ridge off-centre (S and N walls at different pitches)', [
    ['S 30 N 60, S rise [400,600]@60', l => mixed(30, 60, {S: run(400, 600, 60, l)})],
    ['S 30 N 60, S rise [400,600]@75', l => mixed(30, 60, {S: run(400, 600, 75, l)})],
    ['S 30 N 60, N rise [400,600]@45', l => mixed(30, 60, {N: run(400, 600, 45, l)})],
    ['S 30 N 60, N rise [400,600]@75', l => mixed(30, 60, {N: run(400, 600, 75, l)})],
    ['S 60 N 22.5, S rise [300,700]@75', l => mixed(60, 22.5, {S: run(300, 700, 75, l)})],
  ], BASE);
}
