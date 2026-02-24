export const CAUSES_MISSING_SECONDARY_EDGE = [
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

export const INCORRECT_OUTCOME = {
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
                "x": 234.29069052660338,
                "y": 260.92821528584113
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
                "x": 491.6079787684279,
                "y": 391.94472623288107
            }
        },
        {
            "id": 4,
            "inEdges": [
                3,
                15
            ],
            "outEdges": [
                4,
                11
            ],
            "position": {
                "x": 503.88628075513344,
                "y": 204.6069399530199
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
                "x": 523.1215950226947,
                "y": 142.44260513750308
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
                "x": 435.48223331487526,
                "y": 394.137846516456
            },
            "inEdges": [
                10,
                9
            ],
            "outEdges": [
                14
            ]
        },
        {
            "id": 8,
            "position": {
                "x": 428.1521143919605,
                "y": 190.609178601626
            },
            "inEdges": [
                12,
                11
            ],
            "outEdges": [
                15,
                16
            ]
        },
        {
            "id": 9,
            "position": {
                "x": 421.23078280735524,
                "y": 195.2103118783986
            },
            "inEdges": [
                13,
                16
            ],
            "outEdges": []
        },
        {
            "id": 10,
            "position": {
                "x": 332.53147387053923,
                "y": 284.2187117530587
            },
            "inEdges": [
                7,
                8,
                14
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
                "x": 0.32827643312709426,
                "y": 0.9445816976065927
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
                "x": -0.14306529089875347,
                "y": -0.9897132526848649
            }
        },
        {
            "id": 3,
            "source": 3,
            "target": 4,
            "basisVector": {
                "x": 0.06540066170677253,
                "y": -0.9978590849655659
            }
        },
        {
            "id": 4,
            "source": 4,
            "target": 5,
            "basisVector": {
                "x": 0.2955991980355135,
                "y": -0.955312050651912
            }
        },
        {
            "id": 5,
            "source": 5,
            "target": 6,
            "basisVector": {
                "x": -0.9454040183266429,
                "y": -0.3259006629815851
            }
        },
        {
            "id": 6,
            "source": 6,
            "target": 0,
            "basisVector": {
                "x": -0.7173800757094163,
                "y": 0.6966820128115497
            }
        },
        {
            "id": 7,
            "source": 0,
            "basisVector": {
                "x": 0.973029303465174,
                "y": 0.2306815436875656
            },
            "target": 10
        },
        {
            "id": 8,
            "source": 1,
            "basisVector": {
                "x": 0.5795358344713921,
                "y": -0.8149467568887842
            },
            "target": 10
        },
        {
            "id": 9,
            "source": 2,
            "basisVector": {
                "x": -0.7559977813786074,
                "y": -0.6545741780353265
            },
            "target": 7
        },
        {
            "id": 10,
            "source": 3,
            "basisVector": {
                "x": -0.9992374406001968,
                "y": 0.03904532369911013
            },
            "target": 7
        },
        {
            "id": 11,
            "source": 4,
            "basisVector": {
                "x": -0.9833449103871392,
                "y": -0.18174924268262949
            },
            "target": 8
        },
        {
            "id": 12,
            "source": 5,
            "basisVector": {
                "x": -0.891851304954661,
                "y": 0.45232869669154135
            },
            "target": 8
        },
        {
            "id": 13,
            "source": 6,
            "basisVector": {
                "x": 0.21764290006133596,
                "y": 0.9760284668250673
            },
            "target": 9
        },
        {
            "id": 14,
            "source": 7,
            "basisVector": {
                "x": -0.6835932044327341,
                "y": -0.7298632274977184
            },
            "target": 10
        },
        {
            "id": 15,
            "source": 8,
            "basisVector": {
                "x": -0.9833449103871392,
                "y": -0.18174924268262949
            },
            "target": 4
        },
        {
            "id": 16,
            "source": 8,
            "basisVector": {
                "x": -0.8327763762653452,
                "y": 0.5536095258703195
            },
            "target": 9
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
            "clockwiseExteriorEdgeIndex": 3,
            "widdershinsExteriorEdgeIndex": 1,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308,
            "heapGeneration": 0
        },
        {
            "id": 15,
            "clockwiseExteriorEdgeIndex": 3,
            "widdershinsExteriorEdgeIndex": 4,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308,
            "heapGeneration": 0
        },
        {
            "id": 16,
            "clockwiseExteriorEdgeIndex": 5,
            "widdershinsExteriorEdgeIndex": 3,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308,
            "heapGeneration": 0
        }
    ]
}