import {Vector2} from "@/algorithms/straight-skeleton/types";

const AWKWARD_HEPTAGON: Vector2[] = [
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
        "x": 562.2692018374426,
        "y": 407.2957030936534
    },
    {
        "x": 740,
        "y": 201
    },
    {
        "x": 616.8069677084923,
        "y": 263.66030511340506
    },
    {
        "x": 519,
        "y": 201
    }
]

/*
PREDICTIONS:
1. Edges [10,13] collide first, producing two new interior edges, [14,15]
2. Edge 14 has parents [6,2].
3. Edge 15 has parents [3,5].
* */