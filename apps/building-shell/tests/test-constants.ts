// Journal decision 145, B8: the test helpers' shared constants, in a leaf module so no helper imports another for one.

/**
 * Float epsilon for an area sum, in cm² per cm² summed: double arithmetic over float32 positions of a few thousand cm
 * rounds each term at about 1e-13 of its size, so a sum of a few hundred terms keeps 1e-9 of headroom.
 */
export const AREA_EPS_PER_CM2 = 1e-9;
