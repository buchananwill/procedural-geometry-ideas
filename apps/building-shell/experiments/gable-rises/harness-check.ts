// Convicts the harness's own measures by mutation, so a 0.000 oracle figure means something:
// 1. the oracle with the rise piece removed from the plan must disagree with the built rise;
// 2. a rise built with its far plane dropped (limit `none`) on a rise tall enough to need it must disagree with an
//    oracle that keeps the far plane;
// 3. `intervalTop` must find the hip top where no rise stands.
import {DEFAULTS, buildWithRises, fx, gableRun, intervalTop, oracleHeight, ring, runs, sampleOracle} from './rise.ts';

export async function main(): Promise<void> {
  const f = fx('F60a band [400,600] rise 45 on 45', [ring([0, 0, 1000, 500], 0, 1, 45, {S: runs(gableRun(400, 600, 45))})]);
  const rb = await buildWithRises(f, DEFAULTS);
  console.log(`as built: band worst ${sampleOracle(rb).bandWorst.toFixed(3)}`);
  const piece = rb.plans[0].roof.pieces.pop()!;
  const o = sampleOracle(rb);
  console.log(`oracle without the rise piece: band worst ${o.bandWorst.toFixed(3)} at ${o.bandWorstAt} (expect about 100)`);
  rb.plans[0].roof.pieces.push(piece);

  const tall = fx('rise [300,700] at 75 on 45, limit none', [ring([0, 0, 1000, 500], 0, 1, 45, {S: runs(gableRun(300, 700, 75, {limit: 'none'}))})]);
  const tb = await buildWithRises(tall, DEFAULTS);
  const tallP = tb.rises[0];
  const plan = tb.plans[0];
  tallP.piece.planes.push(tb.plans[0].building.walls.find(w => w.a.y === 500)!.plane);
  const ot = sampleOracle(tb);
  console.log(`built without the far plane, oracle with it: band worst ${ot.bandWorst.toFixed(3)} at ${ot.bandWorstAt} (expect > 0)`);
  const p = {x: 150.37, y: 100.41};
  console.log(`hip only at (150.37, 100.41): mesh ${(intervalTop(tb.build.union, p.x, p.y, plan.plate + 0.5)! - plan.plate).toFixed(3)}, oracle ${oracleHeight(plan, p)!.toFixed(3)} (expect 100.41)`);
}
