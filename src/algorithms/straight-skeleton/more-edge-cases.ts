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

export const WACKY_OCTAGON = [
    {
        "x": 323.2906905266034,
        "y": 253.92821528584113
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

export const WACKY_OCTAGON_WRONG_OUTCOME = {
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
                "x": 323.2906905266034,
                "y": 253.92821528584113
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
                "x": 427.93152096206876,
                "y": 344.1207196485682
            },
            "inEdges": [
                9
            ],
            "outEdges": [
                16,
                17
            ]
        },
        {
            "id": 9,
            "position": {
                "x": 420.20955201352274,
                "y": 384.6449710491021
            },
            "inEdges": [
                10,
                11,
                16
            ],
            "outEdges": []
        },
        {
            "id": 10,
            "position": {
                "x": 395.21156021046943,
                "y": 252.9109401636423
            },
            "inEdges": [
                8,
                17
            ],
            "outEdges": [
                18
            ]
        },
        {
            "id": 11,
            "position": {
                "x": 435.5301052237856,
                "y": 186.86721291898203
            },
            "inEdges": [
                15,
                14
            ],
            "outEdges": [
                19
            ]
        },
        {
            "id": 12,
            "position": {
                "x": 433.89720450818703,
                "y": 190.9412369275494
            },
            "inEdges": [
                13,
                19
            ],
            "outEdges": [
                20
            ]
        },
        {
            "id": 13,
            "position": {
                "x": 376.15106630978374,
                "y": 396.43335270965775
            },
            "inEdges": [
                12,
                18,
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
                "x": 0.47116343660243903,
                "y": 0.8820459262470292
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
                "x": -0.4460279791780415,
                "y": 0.8950190175579246
            }
        },
        {
            "id": 8,
            "source": 0,
            "basisVector": {
                "x": 0.9998999834585839,
                "y": -0.014142951584574875
            },
            "target": 10
        },
        {
            "id": 9,
            "source": 1,
            "basisVector": {
                "x": 0.9991131407689007,
                "y": 0.04210619839053349
            },
            "target": 8
        },
        {
            "id": 10,
            "source": 2,
            "basisVector": {
                "x": 0.8785516722176817,
                "y": -0.47764731679714806
            },
            "target": 9
        },
        {
            "id": 11,
            "source": 3,
            "basisVector": {
                "x": -0.7736153651418107,
                "y": -0.6336554795916334
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
            "target": 11
        },
        {
            "id": 15,
            "source": 7,
            "basisVector": {
                "x": 0.3785736817290082,
                "y": 0.9255711574493576
            },
            "target": 11
        },
        {
            "id": 16,
            "source": 8,
            "basisVector": {
                "x": -0.18718377781209475,
                "y": 0.982324912299384
            },
            "target": 9
        },
        {
            "id": 17,
            "source": 8,
            "basisVector": {
                "x": -0.33766352299154895,
                "y": -0.9412668831107018
            },
            "target": 10
        },
        {
            "id": 18,
            "source": 10,
            "basisVector": {
                "x": -0.13164911490796613,
                "y": 0.9912963787606354
            },
            "target": 13
        },
        {
            "id": 19,
            "source": 11,
            "basisVector": {
                "x": -0.37203700078803265,
                "y": 0.9282179000884682
            },
            "target": 12
        },
        {
            "id": 20,
            "source": 12,
            "basisVector": {
                "x": -0.27053492445329486,
                "y": 0.9627101612900167
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
            "clockwiseExteriorEdgeIndex": 1,
            "widdershinsExteriorEdgeIndex": 3,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308,
            "heapGeneration": 0
        },
        {
            "id": 17,
            "clockwiseExteriorEdgeIndex": 3,
            "widdershinsExteriorEdgeIndex": 0,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308,
            "heapGeneration": 0
        },
        {
            "id": 18,
            "clockwiseExteriorEdgeIndex": 3,
            "widdershinsExteriorEdgeIndex": 7,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308,
            "heapGeneration": 0
        },
        {
            "id": 19,
            "clockwiseExteriorEdgeIndex": 7,
            "widdershinsExteriorEdgeIndex": 5,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308,
            "heapGeneration": 0
        },
        {
            "id": 20,
            "clockwiseExteriorEdgeIndex": 7,
            "widdershinsExteriorEdgeIndex": 4,
            "intersectingEdges": [],
            "length": 1.7976931348623157e+308,
            "heapGeneration": 0
        }
    ]
}

export const WACKY_OCTAGON_CORRECT_OUTCOME = {
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
                "x": 323.2906905266034,
                "y": 253.92821528584113
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
            "outEdges": [
                16
            ],
            "inEdges": [
                11,
                12
            ],
            "position": {
                "x": 430.8361614303689,
                "y": 393.3490500913149
            }
        },
        {
            "id": 9,
            "outEdges": [
                17
            ],
            "inEdges": [
                14,
                15
            ],
            "position": {
                "x": 435.53010522378554,
                "y": 186.86721291898203
            }
        },
        {
            "id": 10,
            "outEdges": [
                18
            ],
            "inEdges": [
                17,
                13
            ],
            "position": {
                "x": 433.897204508187,
                "y": 190.9412369275494
            }
        },
        {
            "id": 11,
            "outEdges": [
                19
            ],
            "inEdges": [
                18,
                8
            ],
            "position": {
                "x": 416.5677431000337,
                "y": 252.60887049103997
            }
        },
        {
            "id": 12,
            "outEdges": [
                20
            ],
            "inEdges": [
                19,
                9
            ],
            "position": {
                "x": 435.4228889435412,
                "y": 344.43643266801826
            }
        },
        {
            "id": 13,
            "outEdges": [],
            "inEdges": [
                20,
                10,
                16
            ],
            "position": {
                "x": 421.96884247868024,
                "y": 383.688487330816
            }
        }
    ],
    "edges": [
        {
            "id": 0,
            "source": 0,
            "target": 1,
            "basisVector": {
                "x": 0.47116343660243903,
                "y": 0.8820459262470292
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
                "x": -0.4460279791780415,
                "y": 0.8950190175579246
            }
        },
        {
            "id": 8,
            "source": 0,
            "basisVector": {
                "x": 0.9998999834585839,
                "y": -0.014142951584574875
            },
            "target": 11
        },
        {
            "id": 9,
            "source": 1,
            "basisVector": {
                "x": 0.9991131407689007,
                "y": 0.04210619839053349
            },
            "target": 12
        },
        {
            "id": 10,
            "source": 2,
            "basisVector": {
                "x": 0.8785516722176817,
                "y": -0.47764731679714806
            },
            "target": 13
        },
        {
            "id": 11,
            "source": 3,
            "basisVector": {
                "x": -0.7736153651418107,
                "y": -0.6336554795916334
            },
            "target": 8
        },
        {
            "id": 12,
            "source": 4,
            "basisVector": {
                "x": -0.9984132394817924,
                "y": 0.056311661558448065
            },
            "target": 8
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
            "target": 9
        },
        {
            "id": 15,
            "source": 7,
            "basisVector": {
                "x": 0.3785736817290082,
                "y": 0.9255711574493576
            },
            "target": 9
        },
        {
            "id": 16,
            "source": 8,
            "basisVector": {
                "x": -0.6762135867127522,
                "y": -0.7367056299127048
            },
            "target": 13
        },
        {
            "id": 17,
            "source": 9,
            "basisVector": {
                "x": -0.37203700078803265,
                "y": 0.9282179000884682
            },
            "target": 10
        },
        {
            "id": 18,
            "source": 10,
            "basisVector": {
                "x": -0.27053492445329486,
                "y": 0.9627101612900167
            },
            "target": 11
        },
        {
            "id": 19,
            "source": 11,
            "basisVector": {
                "x": 0.20113579965652326,
                "y": 0.979563367065414
            },
            "target": 12
        },
        {
            "id": 20,
            "source": 12,
            "basisVector": {
                "x": -0.32424235781686567,
                "y": 0.9459740447799609
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
            "length": null,
            "heapGeneration": 1
        },
        {
            "id": 9,
            "clockwiseExteriorEdgeIndex": 1,
            "widdershinsExteriorEdgeIndex": 0,
            "intersectingEdges": [],
            "length": null,
            "heapGeneration": 0
        },
        {
            "id": 10,
            "clockwiseExteriorEdgeIndex": 2,
            "widdershinsExteriorEdgeIndex": 1,
            "intersectingEdges": [
                16
            ],
            "length": 138.82944661729547,
            "heapGeneration": 8
        },
        {
            "id": 11,
            "clockwiseExteriorEdgeIndex": 3,
            "widdershinsExteriorEdgeIndex": 2,
            "intersectingEdges": [
                12
            ],
            "length": 89.40339306336386,
            "heapGeneration": 2
        },
        {
            "id": 12,
            "clockwiseExteriorEdgeIndex": 4,
            "widdershinsExteriorEdgeIndex": 3,
            "intersectingEdges": [
                10
            ],
            "length": 86.99288781984288,
            "heapGeneration": 2
        },
        {
            "id": 13,
            "clockwiseExteriorEdgeIndex": 5,
            "widdershinsExteriorEdgeIndex": 4,
            "intersectingEdges": [],
            "length": null,
            "heapGeneration": 1
        },
        {
            "id": 14,
            "clockwiseExteriorEdgeIndex": 6,
            "widdershinsExteriorEdgeIndex": 5,
            "intersectingEdges": [
                15
            ],
            "length": 98.21310941890924,
            "heapGeneration": 2
        },
        {
            "id": 15,
            "clockwiseExteriorEdgeIndex": 7,
            "widdershinsExteriorEdgeIndex": 6,
            "intersectingEdges": [
                13
            ],
            "length": 99.01058526729179,
            "heapGeneration": 2
        },
        {
            "id": 16,
            "clockwiseExteriorEdgeIndex": 4,
            "widdershinsExteriorEdgeIndex": 2,
            "intersectingEdges": [],
            "length": null,
            "heapGeneration": 2
        },
        {
            "id": 17,
            "clockwiseExteriorEdgeIndex": 7,
            "widdershinsExteriorEdgeIndex": 5,
            "intersectingEdges": [
                13
            ],
            "length": 4.389081494958317,
            "heapGeneration": 1
        },
        {
            "id": 18,
            "clockwiseExteriorEdgeIndex": 7,
            "widdershinsExteriorEdgeIndex": 4,
            "intersectingEdges": [
                8
            ],
            "length": 64.05628198715269,
            "heapGeneration": 1
        },
        {
            "id": 19,
            "clockwiseExteriorEdgeIndex": 0,
            "widdershinsExteriorEdgeIndex": 4,
            "intersectingEdges": [
                9
            ],
            "length": 93.74336083236372,
            "heapGeneration": 1
        },
        {
            "id": 20,
            "clockwiseExteriorEdgeIndex": 1,
            "widdershinsExteriorEdgeIndex": 4,
            "intersectingEdges": [
                10,
                16
            ],
            "length": 41.49379666323503,
            "heapGeneration": 1
        }
    ]
}