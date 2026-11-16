// Decision 12 and the storeys around a rise: under a flush upper wall, under a set-back storey directly above, under an
// overhanging storey two levels up (the floor cap), and with its own maxHeight. Every capped rise reports its flat top:
// face kind and tag, the Edge kinds that bound it, and its Cells. Storeys are 250 cm.
import {DEFAULTS, fx, gableRun, report, ring, runs} from './rise.ts';

type R4 = [number, number, number, number];
const MAIN: R4 = [0, 0, 1000, 500];

export async function main(): Promise<void> {
  console.log('# Under a flush upper wall (storey 1 stands on the rise\'s wall line)');
  await report(fx('upper [300,0,700,300] covers rise [400,600]@45 on 45', [ring(MAIN, 0, 1, 45, {S: runs(gableRun(400, 600, 45))}), ring([300, 0, 700, 300], 1, 1, 45)]));
  await report(fx('upper [500,0,900,300] covers half of rise [400,600]@45 on 45', [ring(MAIN, 0, 1, 45, {S: runs(gableRun(400, 600, 45))}), ring([500, 0, 900, 300], 1, 1, 45)]));
  await report(fx('upper [500,0,900,300] covers half of rise [400,600]@60 on 30', [ring(MAIN, 0, 1, 30, {S: runs(gableRun(400, 600, 60))}), ring([500, 0, 900, 300], 1, 1, 30)]));
  await report(fx('upper [300,0,700,300], rise [400,600]@75 on 45 (apex 373 above the upper plate)', [ring(MAIN, 0, 1, 45, {S: runs(gableRun(400, 600, 75))}), ring([300, 0, 700, 300], 1, 1, 45)]));

  console.log('\n# Under a set-back storey directly above (not an overhang under the lead\'s reading)');
  await report(fx('upper [300,100,700,400], rise [400,600]@30 on 45 (dies before the upper wall)', [ring(MAIN, 0, 1, 45, {S: runs(gableRun(400, 600, 30))}), ring([300, 100, 700, 400], 1, 1, 45)]));
  await report(fx('upper [300,100,700,400], rise [350,650]@45 on 45 (ridge runs into the upper wall)', [ring(MAIN, 0, 1, 45, {S: runs(gableRun(350, 650, 45))}), ring([300, 100, 700, 400], 1, 1, 45)]));
  await report(fx('upper [300,100,700,400], rise [350,650]@60 on 45 (ridge 260 above the plate)', [ring(MAIN, 0, 1, 45, {S: runs(gableRun(350, 650, 60))}), ring([300, 100, 700, 400], 1, 1, 45)]));
  await report(fx('upper [200,150,800,450], rise [300,700]@45 on 30', [ring(MAIN, 0, 1, 30, {S: runs(gableRun(300, 700, 45))}), ring([200, 150, 800, 450], 1, 1, 30)]));
  await report(fx('upper [300,100,700,400], rise [350,650]@45 on 45, the other reading: the storey directly above caps',
    [ring(MAIN, 0, 1, 45, {S: runs(gableRun(350, 650, 45))}), ring([300, 100, 700, 400], 1, 1, 45)]), {...DEFAULTS, capDirectlyAbove: true});

  console.log('\n# Under an overhanging storey two levels up: tower [800,0,1000,500] storeys 0 and 1, overhang at storey 2');
  const tower = ring([800, 0, 1000, 500], 0, 2, 30);
  for (const floorCap of [true, false]) {
    await report(fx(`overhang [300,0,1000,500] covers the rise [400,600]@75 on 30, floor cap ${floorCap ? 'on' : 'off'}`,
      [ring(MAIN, 0, 1, 30, {S: runs(gableRun(400, 600, 75))}), tower, ring([300, 0, 1000, 500], 2, 1, 30)]), {...DEFAULTS, floorCap});
    await report(fx(`overhang [500,0,1000,500] covers half the rise [400,600]@75 on 30, floor cap ${floorCap ? 'on' : 'off'}`,
      [ring(MAIN, 0, 1, 30, {S: runs(gableRun(400, 600, 75))}), tower, ring([500, 0, 1000, 500], 2, 1, 30)]), {...DEFAULTS, floorCap});
  }
  await report(fx('overhang [500,0,1000,500], rise [300,700]@60 on 30 (cap 250, apex 346)',
    [ring(MAIN, 0, 1, 30, {S: runs(gableRun(300, 700, 60))}), tower, ring([500, 0, 1000, 500], 2, 1, 30)]));
  await report(fx('baseline: the overhang building with no rise', [ring(MAIN, 0, 1, 30), tower, ring([500, 0, 1000, 500], 2, 1, 30)]));
  await report(fx('overhang [300,0,1000,500], rise [400,600]@45 on 30 stays below the floor (apex 100, cap 250)',
    [ring(MAIN, 0, 1, 30, {S: runs(gableRun(400, 600, 45))}), tower, ring([300, 0, 1000, 500], 2, 1, 30)]));
  await report(fx('overhang [300,0,1000,500], rise [400,600]@75 on 30, maxHeight 200 under the floor cap of 250',
    [ring(MAIN, 0, 1, 30, {S: runs(gableRun(400, 600, 75, {maxHeight: 200}))}), tower, ring([300, 0, 1000, 500], 2, 1, 30)]));

  console.log('\n# The rise\'s own maxHeight, one storey');
  for (const maxHeight of [100, 200, 300, 400]) {
    await report(fx(`[300,700]@60 on 45, maxHeight ${maxHeight} (apex 346, ridge 250)`, [ring(MAIN, 0, 1, 45, {S: runs(gableRun(300, 700, 60, {maxHeight}))})]));
  }
  await report(fx('[700,1000]@60 on 45 at the corner, maxHeight 120', [ring(MAIN, 0, 1, 45, {S: runs(gableRun(700, 1000, 60, {maxHeight: 120}))})]));
  await report(fx('[300,700]@75 on 30, maxHeight 200 (the far slope truncates first at the wall: 289)', [ring(MAIN, 0, 1, 30, {S: runs(gableRun(300, 700, 75, {maxHeight: 200}))})]));
  await report(fx('two rises [200,400] and [600,800]@60 on 45, both maxHeight 120 (one cap plane, decision 9)',
    [ring(MAIN, 0, 1, 45, {S: runs(gableRun(200, 400, 60, {maxHeight: 120}), gableRun(600, 800, 60, {maxHeight: 120}))})]));
  await report(fx('L [0,0,1000,400] + [600,0,1000,1000], S [500,700]@60 on 45, maxHeight 150',
    [ring([0, 0, 1000, 400], 0, 1, 45, {S: runs(gableRun(500, 700, 60, {maxHeight: 150}))}), ring([600, 0, 1000, 1000], 0, 1, 45)]));
}
