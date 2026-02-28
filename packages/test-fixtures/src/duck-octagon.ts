export const DUCK_OCTAGON_FAILS = [
    {
        "x": 250,
        "y": 250
    },
    {
        "x": 300,
        "y": 450
    },
    {
        "x": 500,
        "y": 450
    },
    {
        "x": 537.7868459349927,
        "y": 389.0072879736522
    },
    {
        "x": 543.0847949300253,
        "y": 312.1588784047538
    },
    {
        "x": 550,
        "y": 250
    },
    {
        "x": 467.4049832435403,
        "y": 279.6927706527311
    },
    {
        "x": 463.22970791151425,
        "y": 329.54084645230455
    }
]

export const DUCK_OCTAGON_PASSES = [
    {
        "x": 250,
        "y": 250
    },
    {
        "x": 300,
        "y": 450
    },
    {
        "x": 500,
        "y": 450
    },
    {
        "x": 537.7868459349927,
        "y": 389.0072879736522
    },
    {
        "x": 538.8862285081377,
        "y": 312.62538578496356
    },
    {
        "x": 550,
        "y": 250
    },
    {
        "x": 467.4049832435403,
        "y": 279.6927706527311
    },
    {
        "x": 463.22970791151425,
        "y": 329.54084645230455
    }
]

export const MOORHEN_FAILS = [
    {
        "x": 250,
        "y": 250
    },
    {
        "x": 300,
        "y": 450
    },
    {
        "x": 500,
        "y": 450
    },
    {
        "x": 537.7868459349927,
        "y": 389.0072879736522
    },
    {
        "x": 537.8786984523035,
        "y": 303.9189565813133
    },
    {
        "x": 546.1435543836416,
        "y": 249.6495408920134
    },
    {
        "x": 467.4049832435403,
        "y": 279.6927706527311
    },
    {
        "x": 463.22970791151425,
        "y": 329.54084645230455
    }
]

export const MOORHEN_PASSES = [
    {
        "x": 250,
        "y": 250
    },
    {
        "x": 300,
        "y": 450
    },
    {
        "x": 500,
        "y": 450
    },
    {
        "x": 537.7868459349927,
        "y": 389.0072879736522
    },
    {
        "x": 537.8786984523035,
        "y": 308.9545027997076
    },
    {
        "x": 546.1435543836416,
        "y": 249.6495408920134
    },
    {
        "x": 467.4049832435403,
        "y": 279.6927706527311
    },
    {
        "x": 463.22970791151425,
        "y": 329.54084645230455
    }
]

/**
 * This polygon is **robustly broken**!
 * While bisector 7 (the interior edge with node 7 as source) is colliding with e1 near to n2, the skeleton algorithm
 * fails, even for large perturbations of n0, n1, n4, n5.
 *
 * If n6, n8, n2 or n3 are adjusted so that bisector 7 (e15) strikes either e2, or further away from n2 along e1, then the algorithm
 * succeeds. See constant below for success example.
 * */
export const BISECTOR_SEVEN_FAILURE = [
    {
        "x": 250,
        "y": 250
    },
    {
        "x": 300,
        "y": 450
    },
    {
        "x": 500,
        "y": 450
    },
    {
        "x": 537.7868459349927,
        "y": 389.0072879736522
    },
    {
        "x": 563.5349625429404,
        "y": 323.89572222311347
    },
    {
        "x": 546.1435543836416,
        "y": 249.6495408920134
    },
    {
        "x": 483.2132231254724,
        "y": 280.36182894979646
    },
    {
        "x": 455.1750427158221,
        "y": 327.2846666246924
    }
]

export const BISECTOR_SEVEN_SUCCESS = [
    {
        "x": 250,
        "y": 250
    },
    {
        "x": 300,
        "y": 450
    },
    {
        "x": 500,
        "y": 450
    },
    {
        "x": 537.7868459349927,
        "y": 389.0072879736522
    },
    {
        "x": 563.5349625429404,
        "y": 323.89572222311347
    },
    {
        "x": 546.1435543836416,
        "y": 249.6495408920134
    },
    {
        "x": 490.22494242794227,
        "y": 278.6095334098634
    },
    {
        "x": 455.1750427158221,
        "y": 327.2846666246924
    }
]

const CRAZY_COLLISION_WITH_EXTERIOR_EDGE = {
    "nodes": [
        {
            "id": 0,
            "inEdges": [
                7
            ],
            "outEdges": [
                0,
                8
            ],
            "position": {
                "x": 250,
                "y": 250
            }
        },
        {
            "id": 1,
            "inEdges": [
                0
            ],
            "outEdges": [
                1,
                9
            ],
            "position": {
                "x": 300,
                "y": 450
            }
        },
        {
            "id": 2,
            "inEdges": [
                1,
                19
            ],
            "outEdges": [
                2,
                10
            ],
            "position": {
                "x": 500,
                "y": 450
            }
        },
        {
            "id": 3,
            "inEdges": [
                2
            ],
            "outEdges": [
                3,
                11
            ],
            "position": {
                "x": 537.7868459349927,
                "y": 389.0072879736522
            }
        },
        {
            "id": 4,
            "inEdges": [
                3
            ],
            "outEdges": [
                4,
                12
            ],
            "position": {
                "x": 572.2271765542667,
                "y": 326.21280723459523
            }
        },
        {
            "id": 5,
            "inEdges": [
                4
            ],
            "outEdges": [
                5,
                13
            ],
            "position": {
                "x": 546.1435543836416,
                "y": 249.6495408920134
            }
        },
        {
            "id": 6,
            "inEdges": [
                5
            ],
            "outEdges": [
                6,
                14
            ],
            "position": {
                "x": 488.47201260232487,
                "y": 273.35264679006406
            }
        },
        {
            "id": 7,
            "inEdges": [
                6
            ],
            "outEdges": [
                7,
                15
            ],
            "position": {
                "x": 455.1750427158221,
                "y": 327.2846666246924
            }
        },
        {
            "id": 8,
            "position": {
                "x": 519.0322196303522,
                "y": 309.35482670156557
            },
            "inEdges": [
                13,
                14
            ],
            "outEdges": [
                16
            ]
        },
        {
            "id": 9,
            "position": {
                "x": 517.6646564035119,
                "y": 321.4727539622314
            },
            "inEdges": [
                12,
                16
            ],
            "outEdges": [
                17
            ]
        },
        {
            "id": 10,
            "position": {
                "x": 493.41106226669757,
                "y": 363.1164005917342
            },
            "inEdges": [
                17,
                11
            ],
            "outEdges": [
                18
            ]
        },
        {
            "id": 11,
            "position": {
                "x": 439.6281442436598,
                "y": 450.07923918516326
            },
            "inEdges": [
                18,
                10
            ],
            "outEdges": [
                19,
                20
            ]
        },
        {
            "id": 12,
            "position": {
                "x": 359.8682963271771,
                "y": 373.3220985725235
            },
            "inEdges": [
                8,
                9
            ],
            "outEdges": [
                21
            ]
        },
        {
            "id": 13,
            "position": {
                "x": 478.23016627381804,
                "y": 394.87501900672555
            },
            "inEdges": [
                15,
                20,
                21
            ],
            "outEdges": []
        }
    ],
    "edges": [
        {
            "id": 0,
            "source": 0,
            "target": 1,
            "basisVector": {
                "x": 0.24253562503633297,
                "y": 0.9701425001453319
            }
        },
        {
            "id": 1,
            "source": 1,
            "target": 2,
            "basisVector": {
                "x": 1,
                "y": 0
            }
        },
        {
            "id": 2,
            "source": 2,
            "target": 3,
            "basisVector": {
                "x": 0.526651350880746,
                "y": -0.850081381172112
            }
        },
        {
            "id": 3,
            "source": 3,
            "target": 4,
            "basisVector": {
                "x": 0.4808825008180008,
                "y": -0.8767850480060807
            }
        },
        {
            "id": 4,
            "source": 4,
            "target": 5,
            "basisVector": {
                "x": -0.3224801855408713,
                "y": -0.9465762145403428
            }
        },
        {
            "id": 5,
            "source": 5,
            "target": 6,
            "basisVector": {
                "x": -0.9249263430442581,
                "y": 0.3801463664731983
            }
        },
        {
            "id": 6,
            "source": 6,
            "target": 7,
            "basisVector": {
                "x": -0.5253331732048868,
                "y": 0.8508966195317056
            }
        },
        {
            "id": 7,
            "source": 7,
            "target": 0,
            "basisVector": {
                "x": -0.9358122933281978,
                "y": -0.35249872575063135
            }
        },
        {
            "id": 8,
            "source": 0,
            "basisVector": {
                "x": 0.6652044138388129,
                "y": 0.746661293900629
            },
            "target": 12
        },
        {
            "id": 9,
            "source": 1,
            "basisVector": {
                "x": 0.6154122094026357,
                "y": -0.7882054380161092
            },
            "target": 12
        },
        {
            "id": 10,
            "source": 2,
            "basisVector": {
                "x": -0.4864918545665764,
                "y": -0.8736851122918216
            },
            "target": 11
        },
        {
            "id": 11,
            "source": 3,
            "basisVector": {
                "x": -0.8637364256326577,
                "y": -0.5039438332148933
            },
            "target": 10
        },
        {
            "id": 12,
            "source": 4,
            "basisVector": {
                "x": -0.996247697561785,
                "y": -0.08654781974632329
            },
            "target": 9
        },
        {
            "id": 13,
            "source": 5,
            "basisVector": {
                "x": -0.41345620852514847,
                "y": 0.9105240049729656
            },
            "target": 8
        },
        {
            "id": 14,
            "source": 6,
            "basisVector": {
                "x": 0.6471362945265371,
                "y": 0.7623743282052874
            },
            "target": 8
        },
        {
            "id": 15,
            "source": 7,
            "basisVector": {
                "x": 0.3228364789574664,
                "y": 0.9464547574260195
            },
            "target": 13
        },
        {
            "id": 16,
            "source": 8,
            "basisVector": {
                "x": -0.11214267642743558,
                "y": 0.9936921153575143
            },
            "target": 9
        },
        {
            "id": 17,
            "source": 9,
            "basisVector": {
                "x": -0.503274327126421,
                "y": 0.8641266988442426
            },
            "target": 10
        },
        {
            "id": 18,
            "source": 10,
            "basisVector": {
                "x": -0.5259924199856064,
                "y": 0.8504892557332429
            },
            "target": 11
        },
        {
            "id": 19,
            "source": 11,
            "basisVector": {
                "x": 0.4864918545665764,
                "y": 0.8736851122918216
            },
            "target": 2
        },
        {
            "id": 20,
            "source": 11,
            "basisVector": {
                "x": -0.8733078418303842,
                "y": 0.48716877301152683
            },
            "target": 13
        },
        {
            "id": 21,
            "source": 12,
            "basisVector": {
                "x": 0.9838222129348875,
                "y": 0.1791475741836909
            },
            "target": 13
        }
    ],
    "numExteriorNodes": 8,
    "interiorEdges": [
        {
            "id": 8,
            "clockwiseExteriorEdgeIndex": 0,
            "widdershinsExteriorEdgeIndex": 7,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308
        },
        {
            "id": 9,
            "clockwiseExteriorEdgeIndex": 1,
            "widdershinsExteriorEdgeIndex": 0,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308
        },
        {
            "id": 10,
            "clockwiseExteriorEdgeIndex": 2,
            "widdershinsExteriorEdgeIndex": 1,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308
        },
        {
            "id": 11,
            "clockwiseExteriorEdgeIndex": 3,
            "widdershinsExteriorEdgeIndex": 2,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308
        },
        {
            "id": 12,
            "clockwiseExteriorEdgeIndex": 4,
            "widdershinsExteriorEdgeIndex": 3,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308
        },
        {
            "id": 13,
            "clockwiseExteriorEdgeIndex": 5,
            "widdershinsExteriorEdgeIndex": 4,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308
        },
        {
            "id": 14,
            "clockwiseExteriorEdgeIndex": 6,
            "widdershinsExteriorEdgeIndex": 5,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308
        },
        {
            "id": 15,
            "clockwiseExteriorEdgeIndex": 7,
            "widdershinsExteriorEdgeIndex": 6,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308
        },
        {
            "id": 16,
            "clockwiseExteriorEdgeIndex": 6,
            "widdershinsExteriorEdgeIndex": 4,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308
        },
        {
            "id": 17,
            "clockwiseExteriorEdgeIndex": 6,
            "widdershinsExteriorEdgeIndex": 3,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308
        },
        {
            "id": 18,
            "clockwiseExteriorEdgeIndex": 6,
            "widdershinsExteriorEdgeIndex": 2,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308
        },
        {
            "id": 19,
            "clockwiseExteriorEdgeIndex": 1,
            "widdershinsExteriorEdgeIndex": 2,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308
        },
        {
            "id": 20,
            "clockwiseExteriorEdgeIndex": 6,
            "widdershinsExteriorEdgeIndex": 1,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308
        },
        {
            "id": 21,
            "clockwiseExteriorEdgeIndex": 1,
            "widdershinsExteriorEdgeIndex": 7,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308
        }
    ]
}