// Every case with its plain numbers. expected() is hand-derived or from the spec; `source` says which.
import {Building, Pt, Rect, Sel, buildCourtyard, buildFromRects, pt, transformBuilding} from './model.ts';

const tand = (deg: number): number => Math.tan((deg * Math.PI) / 180);
const {min, max} = Math;

export interface Worked { p: [number, number]; h: number; label: string }
export interface RidgeLine { a: [number, number]; b: [number, number]; h: number; label: string }
export interface Seg { a: [number, number]; b: [number, number]; label: string }

export interface Case {
  id: string;
  group: string;
  title: string;
  build: () => Building;
  expected?: (p: Pt) => number;
  /** Height at p when p lies on a stated rake, for cases with no whole expected function. */
  rake?: (p: Pt) => number | undefined;
  source: string;
  worked?: Worked[];
  ridges?: RidgeLine[];
  /** Where the spec or journal says a cheek stands, for cases with no expected function. */
  specCheeks?: Seg[];
  /** Plan region measured for nothing: a masked Ring. */
  mask?: (p: Pt) => boolean;
  interpret?: string;
}

const rect = (w: number, h: number): Rect[] => [[0, 0, w, h]];
const T_RECTS: Rect[] = [[0, 0, 1000, 500], [1000, 150, 1400, 350]];
const L_RECTS: Rect[] = [[0, 0, 800, 500], [800, 0, 1000, 300]];
const TWO_WINGS: Rect[] = [[0, 0, 1000, 500], [1000, 50, 1300, 150], [1000, 350, 1300, 450]];
const CROSS: Rect[] = [[0, 300, 1000, 700], [300, 0, 700, 1000]];
const fromRects = (rects: Rect[], sels: Sel[]) => (): Building => buildFromRects(rects, sels);
const annulus = (w: number, h: number, ix0: number, iy0: number, ix1: number, iy1: number) => (p: Pt): number =>
  min(min(p.x, w - p.x, p.y, h - p.y), max(ix0 - p.x, p.x - ix1, iy0 - p.y, p.y - iy1));

export const SLIT = {width: 0};

export const CASES: Case[] = [
  // 1. Rectangle
  {
    id: '1a', group: '1 Rectangle', title: 'One gable, short wall, 400x300, x=0',
    build: fromRects(rect(400, 300), [{x: 0, form: 'gable'}]),
    expected: p => min(p.y, 300 - p.y, 400 - p.x),
    source: 'spec decision 13',
    worked: [{p: [0, 150], h: 150, label: 'apex, d13'}, {p: [250, 150], h: 150, label: 'ridge end, d13'}, {p: [400, 150], h: 0, label: 'far eave'}],
    ridges: [{a: [0, 150], b: [250, 150], h: 150, label: 'ridge, d13'}],
  },
  {
    id: '1b', group: '1 Rectangle', title: 'One gable, long wall, 800x400, y=0',
    build: fromRects(rect(800, 400), [{y: 0, form: 'gable'}]),
    expected: p => min(p.x, 800 - p.x, 400 - p.y),
    source: 'derived: the three remaining slopes',
    worked: [{p: [400, 0], h: 400, label: 'apex'}],
    interpret: 'Added: the brief says "one gable". The long wall is where B\'s two end planes alone overrun the far wall.',
  },
  {
    id: '1c', group: '1 Rectangle', title: 'One gable, long wall of a narrow plan, 400x1000, x=400',
    build: fromRects(rect(400, 1000), [{x: 400, form: 'gable'}]),
    expected: p => min(p.y, 1000 - p.y, p.x),
    source: 'derived: the far plane truncates the rake to a flat top at 400',
    worked: [{p: [400, 400], h: 400, label: 'flat top start'}, {p: [400, 500], h: 400, label: 'flat top'}],
    interpret: 'Added. The rake is a trapezoid: min(y, 1000-y, 400). No wall can seat at 500 with the far wall 400 away at 45.',
  },
  {
    id: '1d', group: '1 Rectangle', title: 'Opposite gables, 400x300, x=0 and x=400',
    build: fromRects(rect(400, 300), [{x: 0, form: 'gable'}, {x: 400, form: 'gable'}]),
    expected: p => min(p.y, 300 - p.y),
    source: 'spec decision 14 at one pitch',
    worked: [{p: [0, 150], h: 150, label: 'apex'}, {p: [400, 150], h: 150, label: 'apex'}],
    ridges: [{a: [0, 150], b: [400, 150], h: 150, label: 'ridge'}],
  },
  {
    id: '1e', group: '1 Rectangle', title: 'Two adjacent gables, 400x300, x=0 and y=0',
    build: fromRects(rect(400, 300), [{x: 0, form: 'gable'}, {y: 0, form: 'gable'}]),
    expected: p => max(min(p.y, 300 - p.y, 400 - p.x), min(p.x, 400 - p.x, 300 - p.y)),
    source: 'spec decision 12: two pieces, each axis\'s slopes removed from one',
    worked: [{p: [0, 150], h: 150, label: 'x=0 apex'}, {p: [200, 0], h: 200, label: 'y=0 apex'}],
    interpret: 'A runs twice whenever promoted walls face both axes, extending the brief\'s "crossed-gable square runs twice". The single pass is measured apart.',
  },
  {
    id: '1f', group: '1 Rectangle', title: 'Three gables, 400x300, x=0, x=400, y=0',
    build: fromRects(rect(400, 300), [{x: 0, form: 'gable'}, {x: 400, form: 'gable'}, {y: 0, form: 'gable'}]),
    expected: p => max(min(p.y, 300 - p.y), min(p.x, 400 - p.x, 300 - p.y)),
    source: 'spec decision 12',
    worked: [{p: [0, 150], h: 150, label: 'x=0 apex'}, {p: [400, 150], h: 150, label: 'x=400 apex'}, {p: [200, 0], h: 200, label: 'y=0 apex'}],
  },
  {
    id: '1g', group: '1 Rectangle', title: 'Four gables, 400x300',
    build: fromRects(rect(400, 300), [{x: 0, form: 'gable'}, {x: 400, form: 'gable'}, {y: 0, form: 'gable'}, {y: 300, form: 'gable'}]),
    expected: p => max(min(p.y, 300 - p.y), min(p.x, 400 - p.x)),
    source: 'spec decision 20\'s algebra',
    worked: [{p: [200, 150], h: 200, label: 'crossing'}],
  },

  // 2. T
  {
    id: '2a', group: '2 T', title: 'T, whole line x=1000 gabled',
    build: fromRects(T_RECTS, [{x: 1000, form: 'gable'}]),
    expected: p => (p.x <= 1000 ? min(p.x, p.y, 500 - p.y) : min(p.y - 150, 350 - p.y, 1400 - p.x)),
    source: 'spec decision 16',
    worked: [{p: [1000, 250], h: 250, label: 'apex, d16'}, {p: [250, 250], h: 250, label: 'ridge start, d16'}, {p: [1300, 250], h: 100, label: 'wing ridge end, d16'}, {p: [1100, 250], h: 100, label: 'wing ridge, d16'}],
    ridges: [{a: [250, 250], b: [1000, 250], h: 250, label: 'main ridge, d16'}, {a: [1001, 250], b: [1300, 250], h: 100, label: 'wing ridge, d16'}],
  },
  {
    id: '2b', group: '2 T', title: 'T, only the south segment gabled, north hipped',
    build: fromRects(T_RECTS, [{x: 1000, to: 150, form: 'gable'}]),
    rake: p => (Math.abs(p.x - 1000) < 1 && p.y <= 150 ? p.y : undefined),
    source: 'journal 276, spec decision 47: rake to 150 at (1000,150), cheek on y=150 x[850,1000]',
    worked: [{p: [1000, 150], h: 150, label: 'rake top, d47'}, {p: [250, 250], h: 250, label: 'main ridge'}, {p: [750, 250], h: 250, label: 'main ridge end, untouched'}],
    ridges: [{a: [250, 250], b: [750, 250], h: 250, label: 'main ridge'}],
    specCheeks: [{a: [850, 150], b: [1000, 150], label: 'd47 cheek'}],
  },
  {
    id: '2c', group: '2 T', title: 'T, whole line gabled, wing far end x=1400 gabled too',
    build: fromRects(T_RECTS, [{x: 1000, form: 'gable'}, {x: 1400, form: 'gable'}]),
    expected: p => (p.x <= 1000 ? min(p.x, p.y, 500 - p.y) : min(p.y - 150, 350 - p.y)),
    source: 'derived from spec decision 16',
    worked: [{p: [1000, 250], h: 250, label: 'apex'}, {p: [1400, 250], h: 100, label: 'wing apex'}],
    ridges: [{a: [1001, 250], b: [1400, 250], h: 100, label: 'wing ridge'}],
  },

  {
    id: '2d', group: '2 T', title: 'T, a wing side wall y=150 gabled: its line runs on through the main',
    build: fromRects(T_RECTS, [{y: 150, form: 'gable'}]),
    source: 'no authority: spec decision 11 carries a line through the footprint; the algorithms are compared',
    interpret: 'Added as a stress: the straight line is 1400 long but the wall only 400.',
  },

  // 3. L stub
  {
    id: '3a', group: '3 L stub', title: 'L stub, x=800 gabled',
    build: fromRects(L_RECTS, [{x: 800, form: 'gable'}]),
    expected: p => (p.x <= 800 ? min(p.x, p.y, 500 - p.y) : min(p.y, 300 - p.y, 1000 - p.x)),
    source: 'spec decision 17',
    worked: [{p: [800, 250], h: 250, label: 'apex past the stub, d17'}, {p: [250, 250], h: 250, label: 'ridge start, d17'}, {p: [850, 150], h: 150, label: 'arm ridge end, d17'}],
    ridges: [{a: [250, 250], b: [800, 250], h: 250, label: 'ridge, d17'}, {a: [801, 150], b: [850, 150], h: 150, label: 'arm ridge, d17'}],
  },
  {
    id: '3b', group: '3 L stub', title: 'L stub, x=800 and x=1000 gabled',
    build: fromRects(L_RECTS, [{x: 800, form: 'gable'}, {x: 1000, form: 'gable'}]),
    expected: p => (p.x <= 800 ? min(p.x, p.y, 500 - p.y) : min(p.y, 300 - p.y)),
    source: 'derived from spec decision 17',
    worked: [{p: [800, 250], h: 250, label: 'apex'}, {p: [1000, 150], h: 150, label: 'arm apex'}],
    ridges: [{a: [801, 150], b: [1000, 150], h: 150, label: 'arm ridge'}],
  },

  {
    id: '3c', group: '3 L stub', title: 'L stub, the arm top y=300 gabled: its line runs on to x=0',
    build: fromRects(L_RECTS, [{y: 300, form: 'gable'}]),
    source: 'no authority: spec decision 11; the algorithms are compared',
    interpret: 'Added as a stress, the same shape as 2d on an L.',
  },

  // 4. Wings and broken lines
  {
    id: '4a', group: '4 Wings', title: 'Two wings on one wall, whole line gabled',
    build: fromRects(TWO_WINGS, [{x: 1000, form: 'gable'}]),
    expected: p => (p.x <= 1000 ? min(p.x, p.y, 500 - p.y) : p.y < 250 ? min(p.y - 50, 150 - p.y, 1300 - p.x) : min(p.y - 350, 450 - p.y, 1300 - p.x)),
    source: 'derived from spec decision 16',
    worked: [{p: [1000, 250], h: 250, label: 'apex'}, {p: [1100, 100], h: 50, label: 'south wing ridge'}, {p: [1100, 400], h: 50, label: 'north wing ridge'}],
  },
  {
    id: '4b', group: '4 Wings', title: 'Two wings on one wall, only the middle segment gabled',
    build: fromRects(TWO_WINGS, [{x: 1000, from: 150, to: 350, form: 'gable'}]),
    source: 'open in journal 276; spec decision 47 keeps a hip and warns, the brief asks for it gabled',
    ridges: [{a: [250, 250], b: [750, 250], h: 250, label: 'main ridge'}],
    interpret: 'No authority gives this rake. The two algorithms\' rakes are compared, not judged: A reads the wings\' outer walls, B the main\'s end walls.',
  },
  {
    id: '4c', group: '4 Wings', title: 'Cross plan, all four arm ends gabled',
    build: fromRects(CROSS, [{x: 0, form: 'gable'}, {x: 1000, form: 'gable'}, {y: 0, form: 'gable'}, {y: 1000, form: 'gable'}]),
    expected: p => max(p.y >= 300 && p.y <= 700 ? min(p.y - 300, 700 - p.y) : 0, p.x >= 300 && p.x <= 700 ? min(p.x - 300, 700 - p.x) : 0),
    source: 'derived: two crossed prisms',
    worked: [{p: [500, 500], h: 200, label: 'crossing'}, {p: [0, 500], h: 200, label: 'x=0 apex'}, {p: [500, 0], h: 200, label: 'y=0 apex'}],
  },
  {
    id: '4d', group: '4 Wings', title: 'Cross plan, whole line x=700 gabled across the east arm',
    build: fromRects(CROSS, [{x: 700, form: 'gable'}]),
    expected: p => {
      const h = p.y >= 300 && p.y <= 700 ? min(p.y - 300, 700 - p.y, p.x, 1000 - p.x) : 0;
      const v = p.x >= 300 && p.x <= 700 ? min(p.x - 300, 700 - p.x, p.y, 1000 - p.y) : 0;
      return p.x <= 700 ? max(h, v, p.x >= 300 ? min(p.y, 1000 - p.y, p.x - 300) : 0) : min(p.y - 300, 700 - p.y, 1000 - p.x);
    },
    source: 'derived: the default cross, under end planes y=0, y=1000 and far plane x=300; the east arm untouched',
    worked: [{p: [700, 400], h: 400, label: 'flat top'}, {p: [850, 500], h: 150, label: 'east arm ridge'}],
    interpret: 'Rake truncated to 400 by the far wall x=300, as on 1c. The hand derivation assumes that truncation: no authority states it.',
  },
  {
    id: '4e', group: '4 Wings', title: 'Wing on the neighbouring wall leaves a 50 cm end wall stub (short end wall)',
    build: fromRects([[0, 0, 1000, 500], [850, -200, 950, 0]], [{x: 1000, form: 'gable'}]),
    expected: p => {
      const main = p.y >= 0 ? min(p.x, p.y, 500 - p.y) : -1;
      const wing = p.x >= 850 && p.x <= 950 && p.y <= 50 ? min(p.x - 850, 950 - p.x, p.y + 200) : -1;
      return max(main, wing);
    },
    source: 'derived: main roof with the wing roof dying into it',
    worked: [{p: [1000, 250], h: 250, label: 'apex'}, {p: [900, 50], h: 50, label: 'wing ridge meets main slope'}],
    interpret: 'The brief\'s "wing near a corner, so an end wall is short": the y=0 wall keeps only (950,0)-(1000,0).',
  },
  {
    id: '4f', group: '4 Wings', title: 'Wing on the neighbouring wall, end wall broken in two',
    build: fromRects([[0, 0, 1000, 500], [600, -300, 800, 0]], [{x: 1000, form: 'gable'}]),
    expected: p => {
      const main = p.y >= 0 ? min(p.x, p.y, 500 - p.y) : -1;
      const wing = p.x >= 600 && p.x <= 800 && p.y <= 100 ? min(p.x - 600, 800 - p.x, p.y + 300) : -1;
      return max(main, wing);
    },
    source: 'derived',
    worked: [{p: [1000, 250], h: 250, label: 'apex'}, {p: [700, 100], h: 100, label: 'wing ridge meets main slope'}],
  },
  {
    id: '4g', group: '4 Wings', title: 'End wall broken in two at different pitches: y=0 at 30 east of the wing, 45 west',
    build: fromRects([[0, 0, 1000, 500], [600, -300, 800, 0]], [{x: 1000, form: 'gable'}, {y: 0, from: 800, to: 1000, deg: 30}]),
    rake: p => (Math.abs(p.x - 1000) < 1 ? min(tand(30) * p.y, 500 - p.y) : undefined),
    source: 'derived: the near segment\'s plane',
    interpret: 'Added, to show which plane each algorithm reads when an end wall is broken and its parts differ.',
  },
  {
    id: '4h', group: '4 Wings', title: 'Wing on the gabled wall near its corner, 50 cm segment south of it',
    build: fromRects([[0, 0, 1000, 500], [1000, 50, 1400, 250]], [{x: 1000, form: 'gable'}]),
    expected: p => (p.x <= 1000 ? min(p.x, p.y, 500 - p.y) : min(p.y - 50, 250 - p.y, 1400 - p.x)),
    source: 'derived from spec decision 16',
    worked: [{p: [1000, 250], h: 250, label: 'apex'}],
  },
  {
    id: '4i', group: '4 Wings', title: 'Wing on the far wall behind a gable',
    build: fromRects([[0, 0, 1000, 500], [-400, 150, 0, 350]], [{x: 1000, form: 'gable'}]),
    expected: p => (p.x >= 0 ? min(p.x + 0, p.y, 500 - p.y) >= 0 ? max(min(p.x, p.y, 500 - p.y), min(p.y - 150, 350 - p.y, p.x + 400)) : 0 : min(p.y - 150, 350 - p.y, p.x + 400)),
    source: 'derived: the far wall\'s plane stops the piece, the far wing is untouched',
    worked: [{p: [1000, 250], h: 250, label: 'apex'}, {p: [-100, 250], h: 100, label: 'far wing ridge'}],
    interpret: 'Added: tests that the piece does not run on over a far wing.',
  },

  {
    id: '4j', group: '4 Wings', title: 'A notch in the end wall near the gabled corner, x=1000 gabled',
    build: fromRects([[0, 0, 1000, 400], [0, 400, 800, 500], [900, 400, 1000, 500]], [{x: 1000, form: 'gable'}]),
    source: 'no authority: the rake is measured; the ideal two-plane apex is 250 at y=250',
    interpret: 'Added: the inward counterpart of a wing on the neighbouring wall. Wall x=900 faces the gable from only 100 away and spans only y[400,500].',
  },
  {
    id: '4k', group: '4 Wings', title: 'A bay cut into the gabled line, both segments gabled',
    build: fromRects([[0, 0, 800, 500], [800, 0, 1000, 150], [800, 350, 1000, 500]], [{x: 1000, form: 'gable'}]),
    rake: p => (Math.abs(p.x - 1000) < 1 ? (p.y < 250 ? min(p.y, 150 - p.y) : min(p.y - 350, 500 - p.y)) : undefined),
    source: 'derived: each segment is its own gable, the bay is outside the footprint',
    worked: [{p: [1000, 75], h: 75, label: 'south apex'}, {p: [1000, 425], h: 75, label: 'north apex'}],
    interpret: 'Added. A bay breaks the line, so each segment reads the bay walls as its end walls.',
  },
  {
    id: '4l', group: '4 Wings', title: 'U plan, the inner wall y=300 gabled',
    build: fromRects([[0, 0, 1000, 300], [0, 300, 300, 700], [700, 300, 1000, 700]], [{y: 300, from: 300, to: 700, form: 'gable'}]),
    source: 'no authority: the algorithms are compared',
    interpret: 'Added: a gabled wall at the bottom of a court, with reflex corners at both ends.',
  },

  // 5. Monopitch
  {
    id: '5a', group: '5 Monopitch', title: 'Monopitch 400x300, wall x=0, low at (0,0)',
    build: fromRects(rect(400, 300), [{x: 0, form: 'mono', low: [0, 0]}]),
    expected: p => min(p.y, 400 - p.x),
    source: 'spec decision 18',
    worked: [{p: [0, 300], h: 300, label: 'rake top, d18'}, {p: [100, 300], h: 300, label: 'hip end, d18'}, {p: [250, 150], h: 150, label: 'on the hip'}, {p: [400, 0], h: 0, label: 'hip start, d18'}],
  },
  {
    id: '5b', group: '5 Monopitch', title: 'Monopitch 400x300, wall x=0, low at (0,300)',
    build: fromRects(rect(400, 300), [{x: 0, form: 'mono', low: [0, 300]}]),
    expected: p => min(300 - p.y, 400 - p.x),
    source: 'spec decision 18, the other low end',
    worked: [{p: [0, 0], h: 300, label: 'rake top'}],
  },
  {
    id: '5c', group: '5 Monopitch', title: 'Skillion, x=0 and x=400 both monopitch, low on y=0',
    build: fromRects(rect(400, 300), [{x: 0, form: 'mono', low: [0, 0]}, {x: 400, form: 'mono', low: [400, 0]}]),
    expected: p => p.y,
    source: 'spec decision 18',
    worked: [{p: [200, 300], h: 300, label: 'high wall'}],
  },
  {
    id: '5d', group: '5 Monopitch', title: 'Skillion by a gable opposite: x=0 monopitch, x=400 gable',
    build: fromRects(rect(400, 300), [{x: 0, form: 'mono', low: [0, 0]}, {x: 400, form: 'gable'}]),
    expected: p => p.y,
    source: 'spec decision 18: "if the opposite wall is also gabled or Monopitch"',
    worked: [{p: [400, 300], h: 300, label: 'gable\'s top follows the dead wall'}],
  },
  {
    id: '5e', group: '5 Monopitch', title: 'Monopitch beside a neighbouring gable: x=0 monopitch low (0,0), y=0 gable',
    build: fromRects(rect(400, 300), [{x: 0, form: 'mono', low: [0, 0]}, {y: 0, form: 'gable'}]),
    expected: p => max(min(p.y, 400 - p.x), min(p.x, 400 - p.x)),
    source: 'derived from spec decisions 12 and 18: the gable keeps its slope in the other piece, the dead wall has none in any',
    worked: [{p: [200, 0], h: 200, label: 'y=0 apex'}, {p: [0, 300], h: 300, label: 'rake top'}],
    interpret: 'The monopitch\'s low wall is itself gabled, the hardest neighbour. Its plane stays usable by spec decision 12.',
  },

  // 6. Crossed gables
  {
    id: '6a', group: '6 Crossed', title: 'Crossed gables 600x600',
    build: fromRects(rect(600, 600), [{x: 0, form: 'gable'}, {x: 600, form: 'gable'}, {y: 0, form: 'gable'}, {y: 600, form: 'gable'}]),
    expected: p => max(min(p.x, 600 - p.x), min(p.y, 600 - p.y)),
    source: 'spec decision 20',
    worked: [{p: [300, 300], h: 300, label: 'crossing, d20'}, {p: [100, 100], h: 100, label: 'valley, d20'}, {p: [0, 300], h: 300, label: 'apex'}],
  },
  {
    id: '6b', group: '6 Crossed', title: 'Crossed gables 800x400, different spans',
    build: fromRects(rect(800, 400), [{x: 0, form: 'gable'}, {x: 800, form: 'gable'}, {y: 0, form: 'gable'}, {y: 400, form: 'gable'}]),
    expected: p => max(min(p.x, 800 - p.x), min(p.y, 400 - p.y)),
    source: 'spec decision 20',
    worked: [{p: [200, 200], h: 200, label: 'lower ridge dies, d20'}, {p: [600, 200], h: 200, label: 'lower ridge dies, d20'}, {p: [400, 200], h: 400, label: 'upper ridge, d20'}],
    ridges: [{a: [400, 0], b: [400, 400], h: 400, label: 'upper ridge'}, {a: [0, 200], b: [200, 200], h: 200, label: 'lower ridge'}],
  },

  // 7. Mixed pitch
  {
    id: '7a', group: '7 Mixed pitch', title: 'x=0 gable, y=0 at 45, y=300 at tan 0.5, x=400 at 45',
    build: fromRects(rect(400, 300), [{x: 0, form: 'gable'}, {y: 300, tan: 0.5}]),
    expected: p => min(p.y, 0.5 * (300 - p.y), 400 - p.x),
    source: 'derived from spec decision 14',
    worked: [{p: [0, 100], h: 100, label: 'apex off-centre'}],
  },
  {
    id: '7b', group: '7 Mixed pitch', title: 'Both x walls gabled, y=0 at 45, y=300 at tan 0.5',
    build: fromRects(rect(400, 300), [{x: 0, form: 'gable'}, {x: 400, form: 'gable'}, {y: 300, tan: 0.5}]),
    expected: p => min(p.y, 0.5 * (300 - p.y)),
    source: 'spec decision 14',
    worked: [{p: [0, 100], h: 100, label: 'd14'}, {p: [400, 100], h: 100, label: 'd14'}],
    ridges: [{a: [0, 100], b: [400, 100], h: 100, label: 'ridge, d14'}],
  },
  {
    id: '7c', group: '7 Mixed pitch', title: 'x=0 gable, y=0 at 30, y=300 at 45, x=400 at 45',
    build: fromRects(rect(400, 300), [{x: 0, form: 'gable'}, {y: 0, deg: 30}]),
    expected: p => min(tand(30) * p.y, 300 - p.y, 400 - p.x),
    source: 'derived',
  },
  {
    id: '7d', group: '7 Mixed pitch', title: 'x=0 gable, y=0 at 10, y=300 at 70, x=400 at 45',
    build: fromRects(rect(400, 300), [{x: 0, form: 'gable'}, {y: 0, deg: 10}, {y: 300, deg: 70}]),
    expected: p => min(tand(10) * p.y, tand(70) * (300 - p.y), 400 - p.x),
    source: 'derived',
  },
  {
    id: '7e', group: '7 Mixed pitch', title: 'x=0 gable, y=0 at 10, y=300 at 85, x=400 at 85: strong walls span 65:1',
    build: fromRects(rect(400, 300), [{x: 0, form: 'gable'}, {y: 0, deg: 10}, {y: 300, deg: 85}, {x: 400, deg: 85}]),
    expected: p => min(tand(10) * p.y, tand(85) * (300 - p.y), tand(85) * (400 - p.x)),
    source: 'derived',
    interpret: 'Added: at the port door the weak wall is barely slower than the 85 degree walls.',
  },
  {
    id: '7f', group: '7 Mixed pitch', title: 'Opposite gables, y=0 at 5, y=300 at 85: strong walls span 131:1',
    build: fromRects(rect(400, 300), [{x: 0, form: 'gable'}, {x: 400, form: 'gable'}, {y: 0, deg: 5}, {y: 300, deg: 85}]),
    expected: p => min(tand(5) * p.y, tand(85) * (300 - p.y)),
    source: 'spec test Prism.Rectangle',
    interpret: 'The C++ door refuses this at 100. The upstream door does not.',
  },
  {
    id: '7g', group: '7 Mixed pitch', title: 'T, whole line gabled, y=0 at 30, y=500 at 45, wing at 60',
    build: fromRects(T_RECTS, [{x: 1000, form: 'gable'}, {y: 0, deg: 30}, {y: 150, deg: 60}, {y: 350, deg: 60}, {x: 1400, deg: 60}]),
    expected: p => (p.x <= 1000
      ? min(p.x, tand(30) * p.y, 500 - p.y)
      : min(tand(60) * (p.y - 150), tand(60) * (350 - p.y), tand(60) * (1400 - p.x))),
    source: 'derived from spec decision 16',
  },

  {
    id: '7h', group: '7 Mixed pitch', title: 'L stub, x=800 gabled, y=500 at 30, y=300 at 60: parallel walls, the faster behind',
    build: fromRects(L_RECTS, [{x: 800, form: 'gable'}, {y: 500, deg: 30}, {y: 300, deg: 60}]),
    expected: p => (p.x <= 800 ? min(p.x, p.y, tand(30) * (500 - p.y)) : min(p.y, tand(60) * (300 - p.y), 1000 - p.x)),
    source: 'derived from spec decision 17',
    interpret: 'Added: y=500 and y=300 face the same way at different speeds, so one front can overtake the other.',
  },
  {
    id: '7i', group: '7 Mixed pitch', title: 'The same T as 7g with no gable at all, the wing alone measured',
    build: fromRects(T_RECTS, [{y: 0, deg: 30}, {y: 150, deg: 60}, {y: 350, deg: 60}, {x: 1400, deg: 60}]),
    expected: p => min(tand(60) * (p.y - 150), tand(60) * (350 - p.y), tand(60) * (1400 - p.x)),
    mask: p => p.x <= 1000,
    source: 'derived: the wing, by its own three walls',
    interpret: 'Added to isolate 7g: no promotion here, so any disagreement is the default skeleton alone.',
  },

  // 8. Unions
  {
    id: '8a', group: '8 Unions', title: 'Flush L from rectangles, y=0 gabled across both',
    build: fromRects(L_RECTS, [{y: 0, form: 'gable'}]),
    source: 'no authority: the rake is measured and the algorithms compared',
    interpret: 'The brief names the plan, not the gabled wall. Chosen: the flush line, the one journal 277 hands to the roof spec.',
  },
  {
    id: '8b', group: '8 Unions', title: 'Flush L, only the arm\'s run of y=0 gabled',
    build: fromRects(L_RECTS, [{y: 0, from: 800, to: 1000, form: 'gable'}]),
    rake: p => (Math.abs(p.y) < 1 && p.x >= 800 ? 1000 - p.x : undefined),
    source: 'derived: the line\'s end plane x=1000, as decision 47',
    interpret: 'Added: two collinear runs of different forms, the door\'s turn rule.',
  },
  {
    id: '8c', group: '8 Unions', title: 'Party wall terrace, y=0 gabled across both Rings',
    build: fromRects([[0, 0, 400, 300], [400, 0, 800, 300]], [{y: 0, form: 'gable'}]),
    expected: p => min(p.x, 800 - p.x, 300 - p.y),
    source: 'derived: one gable on a long wall',
    interpret: 'Read "a gable across both" as one line spanning the two Rings.',
  },
  {
    id: '8d', group: '8 Unions', title: 'Party wall terrace, both end walls gabled',
    build: fromRects([[0, 0, 400, 300], [400, 0, 800, 300]], [{x: 0, form: 'gable'}, {x: 800, form: 'gable'}]),
    expected: p => min(p.y, 300 - p.y),
    source: 'derived',
    worked: [{p: [400, 150], h: 150, label: 'over the party wall'}],
  },
  {
    id: '8e', group: '8 Unions', title: 'Detached islands, west one x=0 gabled, east one hipped',
    build: fromRects([[0, 0, 400, 300], [600, 0, 1000, 300]], [{x: 0, form: 'gable'}]),
    expected: p => (p.x < 500 ? min(p.y, 300 - p.y, 400 - p.x) : min(p.y, 300 - p.y, p.x - 600, 1000 - p.x)),
    source: 'derived from spec decision 13',
    worked: [{p: [0, 150], h: 150, label: 'gable apex'}, {p: [750, 150], h: 150, label: 'hip ridge'}],
  },
  {
    id: '8f', group: '8 Unions', title: 'Low Ring against a tall one: A masked, B showing, default hip',
    build: fromRects([[0, 0, 400, 400], [400, 0, 800, 400]], [{x: 0, form: 'hip'}]),
    expected: p => min(p.x, 800 - p.x, p.y, 400 - p.y),
    mask: p => p.x < 400,
    source: 'spec decision 4',
    worked: [{p: [600, 200], h: 200, label: 'ridge end, d4'}, {p: [401, 200], h: 200, label: 'ridge dies into the tall wall, d4'}],
  },
  {
    id: '8g', group: '8 Unions', title: 'Lean-to with its free end gabled: A masked, x=800 gabled',
    build: fromRects([[0, 0, 400, 400], [400, 0, 800, 400]], [{x: 800, form: 'gable'}]),
    expected: p => min(p.x, p.y, 400 - p.y),
    mask: p => p.x < 400,
    source: 'derived from spec decisions 4 and 13',
    worked: [{p: [800, 200], h: 200, label: 'apex'}],
  },

  // 9. Courtyards
  {
    id: '9a', group: '9 Courtyard', title: 'Courtyard, clean cut x=500, y[0,200]',
    build: () => buildCourtyard([0, 0, 1000, 1000], [200, 200, 800, 800], pt(500, 0), pt(500, 200), SLIT.width),
    expected: annulus(1000, 1000, 200, 200, 800, 800),
    source: 'spec decision 41',
    worked: [{p: [500, 100], h: 100, label: 'ridge through the cut, d41'}],
    ridges: [{a: [300, 100], b: [700, 100], h: 100, label: 'ridge through the cut'}],
  },
  {
    id: '9b', group: '9 Courtyard', title: 'Courtyard, cut forced at a corner, y=200, x[800,1000]',
    build: () => buildCourtyard([0, 0, 1000, 1000], [200, 200, 800, 800], pt(1000, 200), pt(800, 200), SLIT.width),
    expected: annulus(1000, 1000, 200, 200, 800, 800),
    source: 'spec decision 41: the true roof is 100 at (900,150)',
    worked: [{p: [900, 150], h: 100, label: 'true roof, d41'}],
  },
  {
    id: '9c', group: '9 Courtyard', title: 'Short ranges, outer 600, inner (250,250)-(350,350), cut x=300',
    build: () => buildCourtyard([0, 0, 600, 600], [250, 250, 350, 350], pt(300, 0), pt(300, 250), SLIT.width),
    expected: annulus(600, 600, 250, 250, 350, 350),
    source: 'spec decision 41 and test Courtyard.ShortRanges',
    worked: [{p: [300, 125], h: 125, label: 'ridge through the cut'}],
    interpret: 'The inner wall is 100, so the cut stands 50 from its corners against a half-span of 125: not clean, no refusal.',
  },
  {
    id: '9d', group: '9 Courtyard', title: 'Short ranges with no off-corner lattice cut: outer 250, inner (100,100)-(150,150), cut x=100',
    build: () => buildCourtyard([0, 0, 250, 250], [100, 100, 150, 150], pt(100, 0), pt(100, 100), SLIT.width),
    expected: annulus(250, 250, 100, 100, 150, 150),
    source: 'spec decision 41',
    interpret: 'A 50 cm inner wall leaves only cuts at its corners, collinear with an inner wall.',
  },
];

export type VariantId = 'base' | 'mirrorX' | 'mirrorY' | 'transpose';

/** The case in a mirrored or transposed frame, its expectations mapped through the inverse. */
export function variantOf(c: Case, v: VariantId): Case {
  if (v === 'base') return c;
  const base = c.build();
  const cx = base.bbox.x0 + base.bbox.x1, cy = base.bbox.y0 + base.bbox.y1;
  const f = v === 'mirrorX' ? (p: Pt) => pt(cx - p.x, p.y) : v === 'mirrorY' ? (p: Pt) => pt(p.x, cy - p.y) : (p: Pt) => pt(p.y, p.x);
  // Each map is its own inverse.
  const mapP = (q: [number, number]): [number, number] => { const m = f(pt(q[0], q[1])); return [m.x, m.y]; };
  return {
    ...c,
    id: `${c.id}/${v}`,
    build: () => transformBuilding(c.build(), f),
    expected: c.expected ? p => c.expected!(f(p)) : undefined,
    rake: c.rake ? p => c.rake!(f(p)) : undefined,
    mask: c.mask ? p => c.mask!(f(p)) : undefined,
    worked: c.worked?.map(w => ({...w, p: mapP(w.p)})),
    ridges: c.ridges?.map(r => ({...r, a: mapP(r.a), b: mapP(r.b)})),
    specCheeks: c.specCheeks?.map(s => ({...s, a: mapP(s.a), b: mapP(s.b)})),
  };
}
