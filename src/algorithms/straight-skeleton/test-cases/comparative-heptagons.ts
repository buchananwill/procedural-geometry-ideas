export const SOLVABLE = {
    "nodes": [
        {
            "id": 0,
            "inEdges": [
                6
            ],
            "outEdges": [
                0,
                7
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
                8
            ],
            "position": {
                "x": 300,
                "y": 450
            }
        },
        {
            "id": 2,
            "inEdges": [
                1
            ],
            "outEdges": [
                2,
                9
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
                10
            ],
            "position": {
                "x": 493.6570191345232,
                "y": 391.26171277751615
            }
        },
        {
            "id": 4,
            "inEdges": [
                3
            ],
            "outEdges": [
                4,
                11
            ],
            "position": {
                "x": 480.0478002771541,
                "y": 333.33046132650566
            }
        },
        {
            "id": 5,
            "inEdges": [
                4
            ],
            "outEdges": [
                5,
                12
            ],
            "position": {
                "x": 508.7783124600281,
                "y": 145.1746589589634
            }
        },
        {
            "id": 6,
            "inEdges": [
                5
            ],
            "outEdges": [
                6,
                13
            ],
            "position": {
                "x": 400,
                "y": 100
            }
        },
        {
            "id": 7,
            "position": {
                "x": 418.9959251572585,
                "y": 195.72891763200428
            },
            "inEdges": [
                13,
                12
            ],
            "outEdges": [
                14
            ]
        },
        {
            "id": 8,
            "position": {
                "x": 444.0193606946537,
                "y": 399.7390955752784
            },
            "inEdges": [
                9,
                10
            ],
            "outEdges": [
                15
            ]
        },
        {
            "id": 9,
            "position": {
                "x": 379.2868220010248,
                "y": 348.4513090423009
            },
            "inEdges": [
                15,
                8
            ],
            "outEdges": [
                16
            ]
        },
        {
            "id": 10,
            "position": {
                "x": 376.614532054946,
                "y": 337.42915053932177
            },
            "inEdges": [
                11,
                16
            ],
            "outEdges": [
                17
            ]
        },
        {
            "id": 11,
            "position": {
                "x": 374.13405242963427,
                "y": 284.3831420270768
            },
            "inEdges": [
                7,
                14,
                17
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
                "x": -0.10736298310936525,
                "y": -0.9942198900936644
            }
        },
        {
            "id": 3,
            "source": 3,
            "target": 4,
            "basisVector": {
                "x": -0.22869436973540935,
                "y": -0.9734982718276001
            }
        },
        {
            "id": 4,
            "source": 4,
            "target": 5,
            "basisVector": {
                "x": 0.15094575335806046,
                "y": -0.988542047433071
            }
        },
        {
            "id": 5,
            "source": 5,
            "target": 6,
            "basisVector": {
                "x": -0.9235273268240876,
                "y": -0.3835326278286567
            }
        },
        {
            "id": 6,
            "source": 6,
            "target": 0,
            "basisVector": {
                "x": -0.7071067811865475,
                "y": 0.7071067811865475
            }
        },
        {
            "id": 7,
            "source": 0,
            "basisVector": {
                "x": 0.9637149282107609,
                "y": 0.26693358189581157
            },
            "target": 11
        },
        {
            "id": 8,
            "source": 1,
            "basisVector": {
                "x": 0.6154122094026357,
                "y": -0.7882054380161092
            },
            "target": 9
        },
        {
            "id": 9,
            "source": 2,
            "basisVector": {
                "x": -0.7440977701583862,
                "y": -0.668070736109072
            },
            "target": 8
        },
        {
            "id": 10,
            "source": 3,
            "basisVector": {
                "x": -0.9857276589067843,
                "y": 0.1683478020829211
            },
            "target": 8
        },
        {
            "id": 11,
            "source": 4,
            "basisVector": {
                "x": -0.9992157971963489,
                "y": 0.03959533600394129
            },
            "target": 10
        },
        {
            "id": 12,
            "source": 5,
            "basisVector": {
                "x": -0.8713611929806558,
                "y": 0.4906421010954198
            },
            "target": 7
        },
        {
            "id": 13,
            "source": 6,
            "basisVector": {
                "x": 0.19463946497006104,
                "y": 0.980874853728124
            },
            "target": 7
        },
        {
            "id": 14,
            "source": 7,
            "basisVector": {
                "x": -0.4515141086183456,
                "y": 0.8922639798392518
            },
            "target": 11
        },
        {
            "id": 15,
            "source": 8,
            "basisVector": {
                "x": -0.7838030268298947,
                "y": -0.6210095129161028
            },
            "target": 9
        },
        {
            "id": 16,
            "source": 9,
            "basisVector": {
                "x": -0.23562097167705584,
                "y": -0.9718450276180663
            },
            "target": 10
        },
        {
            "id": 17,
            "source": 10,
            "basisVector": {
                "x": -0.04670987030177926,
                "y": -0.998908498320237
            },
            "target": 11
        }
    ],
    "numExteriorNodes": 7,
    "interiorEdges": [
        {
            "id": 7,
            "clockwiseExteriorEdgeIndex": 0,
            "widdershinsExteriorEdgeIndex": 6,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308,
            "heapGeneration": 0
        },
        {
            "id": 8,
            "clockwiseExteriorEdgeIndex": 1,
            "widdershinsExteriorEdgeIndex": 0,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308,
            "heapGeneration": 0
        },
        {
            "id": 9,
            "clockwiseExteriorEdgeIndex": 2,
            "widdershinsExteriorEdgeIndex": 1,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308,
            "heapGeneration": 0
        },
        {
            "id": 10,
            "clockwiseExteriorEdgeIndex": 3,
            "widdershinsExteriorEdgeIndex": 2,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308,
            "heapGeneration": 0
        },
        {
            "id": 11,
            "clockwiseExteriorEdgeIndex": 4,
            "widdershinsExteriorEdgeIndex": 3,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308,
            "heapGeneration": 0
        },
        {
            "id": 12,
            "clockwiseExteriorEdgeIndex": 5,
            "widdershinsExteriorEdgeIndex": 4,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308,
            "heapGeneration": 0
        },
        {
            "id": 13,
            "clockwiseExteriorEdgeIndex": 6,
            "widdershinsExteriorEdgeIndex": 5,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308,
            "heapGeneration": 0
        },
        {
            "id": 14,
            "clockwiseExteriorEdgeIndex": 6,
            "widdershinsExteriorEdgeIndex": 4,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308,
            "heapGeneration": 0
        },
        {
            "id": 15,
            "clockwiseExteriorEdgeIndex": 3,
            "widdershinsExteriorEdgeIndex": 1,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308,
            "heapGeneration": 0
        },
        {
            "id": 16,
            "clockwiseExteriorEdgeIndex": 3,
            "widdershinsExteriorEdgeIndex": 0,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308,
            "heapGeneration": 0
        },
        {
            "id": 17,
            "clockwiseExteriorEdgeIndex": 4,
            "widdershinsExteriorEdgeIndex": 0,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308,
            "heapGeneration": 0
        }
    ]
}

export const NOT_SOLVABLE = [
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
        "x": 493.6570191345232,
        "y": 391.26171277751615
    },
    {
        "x": 472.53465226813836,
        "y": 333.33046132650566
    },
    {
        "x": 508.7783124600281,
        "y": 145.1746589589634
    },
    {
        "x": 400,
        "y": 100
    }
]

export const REMAINING_DATA_AT_FAILURE = {
    "polygonEdges": [
        {
            "id": 11,
            "source": 4,
            "basisVector": {"x": -0.9968281651547004, "y": 0.0795839754869851}
        },
        {
            "id": 16,
            "source": 9,
            "basisVector": {"x": 0.2929445699643231, "y": 0.9561294258249862}
        },
        {
            "id": 17,
            "source": 10,
            "basisVector": {"x": -0.02733841317112187, "y": -0.9996262357327788}
        }
    ],
    "interiorEdges": [
        {
            "id": 11,
            "clockwiseExteriorEdgeIndex": 4,
            "widdershinsExteriorEdgeIndex": 3,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308,
            "heapGeneration": 0
        },
        {
            "id": 16,
            "clockwiseExteriorEdgeIndex": 3,
            "widdershinsExteriorEdgeIndex": 0,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308,
            "heapGeneration": 0
        },
        {
            "id": 17,
            "clockwiseExteriorEdgeIndex": 0,
            "widdershinsExteriorEdgeIndex": 4,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308,
            "heapGeneration": 0
        }
    ],
    "sourceNodes": [
        {
            "id": 4,
            "inEdges": [3],
            "outEdges": [4, 11],
            "position": {"x": 472.53465226813836, "y": 333.33046132650566}
        },
        {
            "id": 9,
            "position": {"x": 375.99131575643673, "y": 352.6721156875277},
            "inEdges": [8, 15],
            "outEdges": [16]
        },
        {
            "id": 10,
            "position": {"x": 370.93065820235194, "y": 283.49585319271125},
            "inEdges": [7, 14],
            "outEdges": [17]
        }
    ]
}

export const WRONG_COLLISION_AT_NODE_10 = [
    {
        "x": 234.29069052660338,
        "y": 260.92821528584113
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
        "x": 491.6079787684279,
        "y": 391.94472623288107
    },
    {
        "x": 506.6853250363918,
        "y": 208.33899899469776
    },
    {
        "x": 523.1215950226947,
        "y": 142.44260513750308
    },
    {
        "x": 400,
        "y": 100
    }
]