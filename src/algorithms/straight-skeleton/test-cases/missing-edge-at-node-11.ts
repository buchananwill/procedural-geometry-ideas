const MissingEdgeAtNode11 =  [
    {
        "x": 433.2906905266034,
        "y": 257.92821528584113
    },
    {
        "x": 370.16856653872605,
        "y": 341.6863823154601
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
        "x": 487.97161513206436,
        "y": 390.12654441469925
    },
    {
        "x": 503.88628075513344,
        "y": 204.6069399530199
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

const INCORRECT_OUTCOME = {
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
                "x": 433.2906905266034,
                "y": 257.92821528584113
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
                "x": 390.038048876619,
                "y": 334.8562477618094
            }
        },
        {
            "id": 2,
            "inEdges": [
                1
            ],
            "outEdges": [
                2,
                10
            ],
            "position": {
                "x": 361.4806073122307,
                "y": 397.30085957843926
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
                "x": 500,
                "y": 450
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
                "x": 487.97161513206436,
                "y": 390.12654441469925
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
                "x": 503.88628075513344,
                "y": 204.6069399530199
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
                "x": 523.1215950226947,
                "y": 142.44260513750308
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
                "x": 400,
                "y": 100
            }
        },
        {
            "id": 8,
            "position": {
                "x": 466.9152124341169,
                "y": 263.0864991111751
            },
            "inEdges": [
                8
            ],
            "outEdges": [
                16,
                17
            ]
        },
        {
            "id": 9,
            "position": {
                "x": 451.05010826294443,
                "y": 392.20896010874685
            },
            "inEdges": [
                12,
                11
            ],
            "outEdges": [
                18
            ]
        },
        {
            "id": 10,
            "position": {
                "x": 462.84812747555816,
                "y": 196.5940435768246
            },
            "inEdges": [
                13,
                17
            ],
            "outEdges": [
                19
            ]
        },
        {
            "id": 11,
            "position": {
                "x": 437.38156620989406,
                "y": 358.9386887626651
            },
            "inEdges": [
                9,
                16
            ],
            "outEdges": []
        },
        {
            "id": 12,
            "position": {
                "x": 463.96367583143535,
                "y": 172.44628886606608
            },
            "inEdges": [
                14,
                15,
                19
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
                "x": -0.4900944463509439,
                "y": 0.871669337338398
            }
        },
        {
            "id": 1,
            "source": 1,
            "target": 2,
            "basisVector": {
                "x": -0.41589627780841726,
                "y": 0.909412055179116
            }
        },
        {
            "id": 2,
            "source": 2,
            "target": 3,
            "basisVector": {
                "x": 0.9346451122339546,
                "y": 0.35558193736068544
            }
        },
        {
            "id": 3,
            "source": 3,
            "target": 4,
            "basisVector": {
                "x": -0.19696146636699435,
                "y": -0.9804112304367812
            }
        },
        {
            "id": 4,
            "source": 4,
            "target": 5,
            "basisVector": {
                "x": 0.08547037029015028,
                "y": -0.9963407127094951
            }
        },
        {
            "id": 5,
            "source": 5,
            "target": 6,
            "basisVector": {
                "x": 0.2955991980355135,
                "y": -0.955312050651912
            }
        },
        {
            "id": 6,
            "source": 6,
            "target": 7,
            "basisVector": {
                "x": -0.9454040183266429,
                "y": -0.3259006629815851
            }
        },
        {
            "id": 7,
            "source": 7,
            "target": 0,
            "basisVector": {
                "x": 0.20626348293888347,
                "y": 0.9784964872731639
            }
        },
        {
            "id": 8,
            "source": 0,
            "basisVector": {
                "x": 0.9884366373528195,
                "y": 0.15163447476959452
            },
            "target": 8
        },
        {
            "id": 9,
            "source": 1,
            "basisVector": {
                "x": 0.891313117679079,
                "y": 0.4533882731756526
            },
            "target": 11
        },
        {
            "id": 10,
            "source": 2,
            "basisVector": {
                "x": 0.9252258977378672,
                "y": -0.37941670779653014
            }
        },
        {
            "id": 11,
            "source": 3,
            "basisVector": {
                "x": -0.6463252072716411,
                "y": -0.7630620724720042
            },
            "target": 9
        },
        {
            "id": 12,
            "source": 4,
            "basisVector": {
                "x": -0.9984132394817924,
                "y": 0.056311661558448065
            },
            "target": 9
        },
        {
            "id": 13,
            "source": 5,
            "basisVector": {
                "x": -0.9814660759529411,
                "y": -0.19163596153523932
            },
            "target": 10
        },
        {
            "id": 14,
            "source": 6,
            "basisVector": {
                "x": -0.891851304954661,
                "y": 0.45232869669154135
            },
            "target": 12
        },
        {
            "id": 15,
            "source": 7,
            "basisVector": {
                "x": 0.6618571113454147,
                "y": 0.7496300181833058
            },
            "target": 12
        },
        {
            "id": 16,
            "source": 8,
            "basisVector": {
                "x": -0.2944561979276448,
                "y": 0.9556649766011077
            },
            "target": 11
        },
        {
            "id": 17,
            "source": 8,
            "basisVector": {
                "x": -0.06105201152458483,
                "y": -0.9981345860598169
            },
            "target": 10
        },
        {
            "id": 18,
            "source": 9,
            "basisVector": {
                "x": -0.5318997909714369,
                "y": -0.8468073053325306
            }
        },
        {
            "id": 19,
            "source": 10,
            "basisVector": {
                "x": 0.046147557067712404,
                "y": -0.9989346339859692
            },
            "target": 12
        }
    ],
    "numExteriorNodes": 8,
    "interiorEdges": [
        {
            "id": 8,
            "clockwiseExteriorEdgeIndex": 0,
            "widdershinsExteriorEdgeIndex": 7,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308,
            "heapGeneration": 0
        },
        {
            "id": 9,
            "clockwiseExteriorEdgeIndex": 1,
            "widdershinsExteriorEdgeIndex": 0,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308,
            "heapGeneration": 0
        },
        {
            "id": 10,
            "clockwiseExteriorEdgeIndex": 2,
            "widdershinsExteriorEdgeIndex": 1,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308,
            "heapGeneration": 0
        },
        {
            "id": 11,
            "clockwiseExteriorEdgeIndex": 3,
            "widdershinsExteriorEdgeIndex": 2,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308,
            "heapGeneration": 0
        },
        {
            "id": 12,
            "clockwiseExteriorEdgeIndex": 4,
            "widdershinsExteriorEdgeIndex": 3,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308,
            "heapGeneration": 0
        },
        {
            "id": 13,
            "clockwiseExteriorEdgeIndex": 5,
            "widdershinsExteriorEdgeIndex": 4,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308,
            "heapGeneration": 0
        },
        {
            "id": 14,
            "clockwiseExteriorEdgeIndex": 6,
            "widdershinsExteriorEdgeIndex": 5,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308,
            "heapGeneration": 0
        },
        {
            "id": 15,
            "clockwiseExteriorEdgeIndex": 7,
            "widdershinsExteriorEdgeIndex": 6,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308,
            "heapGeneration": 0
        },
        {
            "id": 16,
            "clockwiseExteriorEdgeIndex": 0,
            "widdershinsExteriorEdgeIndex": 4,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308,
            "heapGeneration": 0
        },
        {
            "id": 17,
            "clockwiseExteriorEdgeIndex": 4,
            "widdershinsExteriorEdgeIndex": 7,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308,
            "heapGeneration": 0
        },
        {
            "id": 18,
            "clockwiseExteriorEdgeIndex": 4,
            "widdershinsExteriorEdgeIndex": 2,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308,
            "heapGeneration": 0
        },
        {
            "id": 19,
            "clockwiseExteriorEdgeIndex": 5,
            "widdershinsExteriorEdgeIndex": 7,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308,
            "heapGeneration": 0
        }
    ]
}