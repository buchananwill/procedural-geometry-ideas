const INPUT_OCTAGON = [
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

const PREMATURE_SPLIT_OUTCOME_V5_ALGORITHM = {
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
                "x": 370.16856653872605,
                "y": 341.6863823154601
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
                "x": 300,
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
                "x": 448.04168914940664,
                "y": 261.2118147531929
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
                "x": 421.5478521476982,
                "y": 377.62168314829944
            },
            "inEdges": [
                16,
                9
            ],
            "outEdges": [
                18
            ]
        },
        {
            "id": 10,
            "position": {
                "x": 419.37454549080405,
                "y": 121.94392209375985
            },
            "inEdges": [
                15,
                17
            ],
            "outEdges": [
                19
            ]
        },
        {
            "id": 11,
            "position": {
                "x": 420.2095520135227,
                "y": 384.64497104910214
            },
            "inEdges": [
                10,
                11,
                18
            ],
            "outEdges": []
        },
        {
            "id": 12,
            "position": {
                "x": 429.2763449350834,
                "y": 190.0389919196909
            },
            "inEdges": [
                13,
                14
            ],
            "outEdges": [
                20
            ]
        },
        {
            "id": 13,
            "position": {
                "x": 86.8320115148868,
                "y": 412.75128205169693
            },
            "inEdges": [
                12,
                19,
                20
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
                "x": -0.6018504041574192,
                "y": 0.7986088473186052
            }
        },
        {
            "id": 1,
            "source": 1,
            "target": 2,
            "basisVector": {
                "x": -0.5437060815129698,
                "y": 0.8392756978048465
            }
        },
        {
            "id": 2,
            "source": 2,
            "target": 3,
            "basisVector": {
                "x": 1,
                "y": 0
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
                "x": 0.9761085268493994,
                "y": 0.21728355623906567
            },
            "target": 8
        },
        {
            "id": 9,
            "source": 1,
            "basisVector": {
                "x": 0.8194581358144591,
                "y": 0.573139043904262
            },
            "target": 9
        },
        {
            "id": 10,
            "source": 2,
            "basisVector": {
                "x": 0.8785516722176817,
                "y": -0.47764731679714806
            },
            "target": 11
        },
        {
            "id": 11,
            "source": 3,
            "basisVector": {
                "x": -0.7736153651418107,
                "y": -0.6336554795916334
            },
            "target": 11
        },
        {
            "id": 12,
            "source": 4,
            "basisVector": {
                "x": -0.9984132394817924,
                "y": 0.056311661558448065
            },
            "target": 13
        },
        {
            "id": 13,
            "source": 5,
            "basisVector": {
                "x": -0.9814660759529411,
                "y": -0.19163596153523932
            },
            "target": 12
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
            "target": 10
        },
        {
            "id": 16,
            "source": 8,
            "basisVector": {
                "x": -0.22191617699736682,
                "y": 0.9750657466996127
            },
            "target": 9
        },
        {
            "id": 17,
            "source": 8,
            "basisVector": {
                "x": -0.20161474771461435,
                "y": -0.9794649016192323
            },
            "target": 10
        },
        {
            "id": 18,
            "source": 9,
            "basisVector": {
                "x": -0.18718377781209475,
                "y": 0.982324912299384
            },
            "target": 11
        },
        {
            "id": 19,
            "source": 10,
            "basisVector": {
                "x": -0.7527644081102248,
                "y": 0.6582900165447315
            },
            "target": 13
        },
        {
            "id": 20,
            "source": 12,
            "basisVector": {
                "x": -0.8383054724704305,
                "y": 0.5452008206396319
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
            "widdershinsExteriorEdgeIndex": 3,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308,
            "heapGeneration": 0
        },
        {
            "id": 17,
            "clockwiseExteriorEdgeIndex": 3,
            "widdershinsExteriorEdgeIndex": 7,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308,
            "heapGeneration": 0
        },
        {
            "id": 18,
            "clockwiseExteriorEdgeIndex": 1,
            "widdershinsExteriorEdgeIndex": 3,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308,
            "heapGeneration": 0
        },
        {
            "id": 19,
            "clockwiseExteriorEdgeIndex": 3,
            "widdershinsExteriorEdgeIndex": 6,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308,
            "heapGeneration": 0
        },
        {
            "id": 20,
            "clockwiseExteriorEdgeIndex": 6,
            "widdershinsExteriorEdgeIndex": 4,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308,
            "heapGeneration": 0
        }
    ]
}