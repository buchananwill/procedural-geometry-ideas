import {Vector2} from '@proc-geo/core';

/**
 * A 32-gon that exposed a false split event in the straight-skeleton solver.
 *
 * The two fixtures differ at exactly one vertex — index 27 — by about (1.05, 0.53).
 * That perturbation is enough to flip the solver's output, which is what makes the
 * pair useful: everything else is held constant.
 *
 * In the FAILS variant the bisector at the target of exterior edge 10 registers a
 * split against exterior edge 27, even though edge 26 occludes it. The validator
 * accepted that split because it delimited edge 27's wavefront with a bisector whose
 * own source offset (69.86) is later than the offset being tested (44.15); projecting
 * that bisector backwards inflated the segment from ~110 to ~201 units, long enough
 * for the strike to appear to land.
 *
 * The resulting skeleton is locally well-formed — every bisector is still equidistant
 * from its parents, the faces still tile the polygon — but it is causally impossible:
 * one skeleton edge runs from a node at offset 71.64 to a node at offset 62.70, i.e.
 * an event preceding the event that caused it. See
 * assertOffsetsIncreaseAwayFromBoundary in the core test suite.
 *
 * Both are wound clockwise, as runAlgorithmV5 requires.
 */
export const PREMATURE_BISECTOR_SPLIT_FAILS: Vector2[] = [
    {x: 357.1282238, y: 266.8750977431804},
    {x: 430.4404646055483, y: 357.46022576060363},
    {x: 465.2756478344818, y: 456.430337904654},
    {x: 538.8299926295774, y: 504.5666263934779},
    {x: 547.3151281996757, y: 571.6139326938707},
    {x: 527.8194717090279, y: 659.1000350506195},
    {x: 717.433783622365, y: 838.1506004222233},
    {x: 701.080700845706, y: 951.2318808490918},
    {x: 666.7465397988484, y: 967.2622963781478},
    {x: 606.2563504682785, y: 989.294636891941},
    {x: 615.6312171809441, y: 1059.0384833177984},
    {x: 681.8418242277202, y: 1095.6031176319032},
    {x: 659.814337972926, y: 1184.1808770260811},
    {x: 652.9945814577154, y: 1244.0867682557907},
    {x: 710.567476036075, y: 1272.01884342682},
    {x: 685.9904565659375, y: 1354.883122263904},
    {x: 600.0864698618002, y: 1407.4593002303786},
    {x: 579.29508351339, y: 1467.9730267970865},
    {x: 629.5743438920324, y: 1509.6374955488552},
    {x: 683.1378894521803, y: 1493.0233615156585},
    {x: 724.1324012109544, y: 1403.8453906531354},
    {x: 735.9333850966899, y: 1320.7549841192697},
    {x: 712.1855023808566, y: 1259.9002700896351},
    {x: 718.7004867874936, y: 1206.015909453782},
    {x: 744.8440350486887, y: 1163.641630735596},
    {x: 805.9385138436218, y: 1139.4253845961139},
    {x: 833.0552152741028, y: 1092.2498334387924},
    {x: 832.1275480966812, y: 1027.9778986287881},
    {x: 889.7170171501264, y: 963.0489532435678},
    {x: 973.0865408347017, y: 907.7290747225239},
    {x: 994.5195663888803, y: 849.9366426326947},
    {x: 756.6161044477649, y: 566.9433956383427},
];

/** The same polygon with vertex 27 nudged; the false split does not arise. */
export const PREMATURE_BISECTOR_SPLIT_PASSES: Vector2[] = [
    {x: 357.1282238, y: 266.8750977431804},
    {x: 430.4404646055483, y: 357.46022576060363},
    {x: 465.2756478344818, y: 456.430337904654},
    {x: 538.8299926295774, y: 504.5666263934779},
    {x: 547.3151281996757, y: 571.6139326938707},
    {x: 527.8194717090279, y: 659.1000350506195},
    {x: 717.433783622365, y: 838.1506004222233},
    {x: 701.080700845706, y: 951.2318808490918},
    {x: 666.7465397988484, y: 967.2622963781478},
    {x: 606.2563504682785, y: 989.294636891941},
    {x: 615.6312171809441, y: 1059.0384833177984},
    {x: 681.8418242277202, y: 1095.6031176319032},
    {x: 659.814337972926, y: 1184.1808770260811},
    {x: 652.9945814577154, y: 1244.0867682557907},
    {x: 710.567476036075, y: 1272.01884342682},
    {x: 685.9904565659375, y: 1354.883122263904},
    {x: 600.0864698618002, y: 1407.4593002303786},
    {x: 579.29508351339, y: 1467.9730267970865},
    {x: 629.5743438920324, y: 1509.6374955488552},
    {x: 683.1378894521803, y: 1493.0233615156585},
    {x: 724.1324012109544, y: 1403.8453906531354},
    {x: 735.9333850966899, y: 1320.7549841192697},
    {x: 712.1855023808566, y: 1259.9002700896351},
    {x: 718.7004867874936, y: 1206.015909453782},
    {x: 744.8440350486887, y: 1163.641630735596},
    {x: 805.9385138436218, y: 1139.4253845961139},
    {x: 833.0552152741028, y: 1092.2498334387924},
    {x: 833.181108337827, y: 1028.5045088586703},
    {x: 889.7170171501264, y: 963.0489532435678},
    {x: 973.0865408347017, y: 907.7290747225239},
    {x: 994.5195663888803, y: 849.9366426326947},
    {x: 756.6161044477649, y: 566.9433956383427},
];
