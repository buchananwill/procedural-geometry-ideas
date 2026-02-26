import {
    AlgorithmStepInput,
    AlgorithmStepOutput, BisectionParams, CollisionEvent, CollisionTypePriority,
    StraightSkeletonSolverContext
} from "@/algorithms/straight-skeleton/types";
import {collideEdges} from "@/algorithms/straight-skeleton/collision-helpers";
import {areEqual} from "@/algorithms/straight-skeleton/core-functions";
import handleCollisionEvent from "@/algorithms/straight-skeleton/collision-handling";
import {
    bisectWithParams,
    tryToAcceptExteriorEdge
} from "@/algorithms/straight-skeleton/algorithm-helpers";

function makeSameInstigatorComparator(context: StraightSkeletonSolverContext) {
    function sameInstigatorComparator(ev1: CollisionEvent, ev2: CollisionEvent) {


        const [length1a, length1b] = ev1.intersectionData;
        const [length2a, length2b] = ev2.intersectionData;
        const ev1Phantom = ev1.eventType === 'phantomDivergentOffset';
        const ev2Phantom = ev2.eventType === 'phantomDivergentOffset';

        const [ev1Id1, ev1Id2] = ev1.collidingEdges;
        const [ev2Id1, ev2Id2] = ev1.collidingEdges;
        if (ev2Id1 !== ev1Id1) {
            throw new Error("Different instigators! Invalid comparison.")
        }

        if (context.isReflexEdge(context.getInteriorWithId(ev1Id1))) {
            return ev1.offsetDistance - ev2.offsetDistance;
        }

        if (context.edgeRank(ev1Id2) !== 'exterior' && context.edgeRank(ev2Id2) !== 'exterior') {

            const interiorEdge = context.getInteriorWithId(ev1Id1);
            const ev1IsShortestForId1 = areEqual(interiorEdge.length, length1a);
            const ev2IsShortestForId1 = areEqual(interiorEdge.length, length2a);
            const ev1IsShortestForId2 = areEqual(context.getInteriorWithId(ev1Id2).length, length1b)
            const ev2IsShortestForId2 = areEqual(context.getInteriorWithId(ev2Id2).length, length2b)

            if ((ev1IsShortestForId1 && ev1IsShortestForId2) && (!ev2IsShortestForId1 || !ev2IsShortestForId2)) {
                return -1;
            }

            if ((!ev1IsShortestForId1 || !ev1IsShortestForId2) && (ev2IsShortestForId1 && ev2IsShortestForId2)) {
                return 1;
            }
        }


        if (ev1Phantom !== ev2Phantom) {
            return ev1.offsetDistance - ev2.offsetDistance;
        }

        // if (ev1.eventType === 'interiorPair') {
        //     return length1a - length2a;
        // }

        return ev1.offsetDistance - ev2.offsetDistance;

    }

    return sameInstigatorComparator;
}

export function createCollisions(interiorEdges: number[], exteriorParents: number[], context: StraightSkeletonSolverContext): CollisionEvent[][] {
    const sameInstigatorComparator = makeSameInstigatorComparator(context)

    return interiorEdges.map(e1 => {
        const list: (CollisionEvent | null)[] = [];
        const edgeData = context.getInteriorWithId(e1)
        const checkExteriorCollisions = context.isReflexEdge(edgeData);
        list.push(...interiorEdges.map(e2 => collideEdges(e1, e2, context)));

        if (checkExteriorCollisions) {
            list.push(...exteriorParents.map(e2 => collideEdges(e1, e2, context)))
        }

        return list.filter(event => {
            // console.log(`filtering events: ${JSON.stringify(event)}`);
            return event !== null;
        })
            // .filter(event => event?.intersectionData[2] !== 'diverging')
            .toSorted(sameInstigatorComparator)
    })
        .filter(list => list.length > 0);
}

export function handleInteriorEdges(context: StraightSkeletonSolverContext, input: AlgorithmStepInput): AlgorithmStepOutput {
    if (input.interiorEdges.length < 3) {
        throw new Error("Greater than 3 edges required for generic step handling.")
    }

    const result: AlgorithmStepOutput = {
        childSteps: []
    };


    const exteriorParents = input.interiorEdges
        .map(context.getInteriorWithId)
        .map(iEdge => iEdge.clockwiseExteriorEdgeIndex);
    exteriorParents.push(context.widdershinsParent(context.getInteriorWithId(input.interiorEdges[0])).id)


    // Generate all currently valid collision events
    const collisionLists: CollisionEvent[][] = createCollisions(input.interiorEdges, exteriorParents, context)

    const collisionEventSlices: CollisionEvent[][] = [];

    let bestOffset = Number.POSITIVE_INFINITY;
    let slicesRemaining = true;
    while (slicesRemaining) {
        slicesRemaining = false;
        let sliceInputs: [number, number][] = [];
        const nextSlice: CollisionEvent[] = [];


        for (let i = 0; i < collisionLists.length; i++) {
            const collisionList = collisionLists[i];
            if (collisionList.length === 0) {
                continue;
            }

            slicesRemaining = true;
            if (collisionList[0].offsetDistance < bestOffset) {
                bestOffset = collisionList[0].offsetDistance;
                sliceInputs = []
            }

            let slicePointer = 0;

            while (slicePointer < collisionList.length && areEqual(collisionList[slicePointer].offsetDistance, bestOffset)) {
                slicePointer++;
            }

            sliceInputs.push([i, slicePointer])
        }

        sliceInputs.forEach(([list, count]) => {
            const collisionList = collisionLists[list];
            nextSlice.push(...collisionList.slice(0, count))
            collisionLists[list] = collisionList.slice(count)
        })

        collisionEventSlices.push(nextSlice);
        bestOffset = Number.POSITIVE_INFINITY;
    }

    let collisionsToHandle: CollisionEvent[] | null = null;

    for (const collisionEventSlice of collisionEventSlices) {
        const validEvents = collisionEventSlice.filter(e => e.eventType !== 'phantomDivergentOffset')
        if (validEvents.length > 0) {
            collisionsToHandle = validEvents;
            break;
        }
    }


    if (collisionsToHandle === null || collisionLists.length === 0) {
        throw new Error("Unable to generate any collisions from graph context. Skeleton remains incomplete.");
    }

    // Handle collisions
    const collapseEvents: BisectionParams[] = [];
    let partitionEvents: BisectionParams[] = [];
    collisionsToHandle
        .toSorted((e1, e2) => {
            return CollisionTypePriority[e1.eventType] - CollisionTypePriority[e2.eventType]
        })
        .map(event => handleCollisionEvent(event, context))
        .forEach(bisectionList => {
            if (bisectionList.length > 1) {
                partitionEvents.push(...bisectionList)
            } else {
                collapseEvents.push(...bisectionList)
            }
        })

    exteriorParents.forEach(e => tryToAcceptExteriorEdge(context, e))

    const partitionSpan = (params: BisectionParams) => {
        return (params.clockwiseExteriorEdgeIndex - params.widdershinsExteriorEdgeIndex + context.graph.numExteriorNodes) % context.graph.numExteriorNodes
    }
    // Collapse/partition into child
    // How do we resolve precedence/priority of conflicting partition splits? Take the smallest?
    /* Clover Leaf Example:

    Partition Pair 1:  [[0,4], [4,0]]
    Partition Pair 2:  [[4,8], [8,4]]
    Partition Pair 3:  [[8,0], [0,8]]

    Outcome we want is: [[0,4], [4,8], [8,0]]

    Rule is: sort by clockwise bisection first, then span of bisection.
    Span of bisection = (end - start + length) % length

     * */
    partitionEvents = partitionEvents.filter(params => !context.isAccepted(params.widdershinsExteriorEdgeIndex) && !context.isAccepted(params.clockwiseExteriorEdgeIndex))
        .toSorted((params1, params2) => {
            if (params1.clockwiseExteriorEdgeIndex !== params2.clockwiseExteriorEdgeIndex) {
                return params1.clockwiseExteriorEdgeIndex - params2.clockwiseExteriorEdgeIndex;
            }

            return partitionSpan(params1) - partitionSpan(params2);
        });

    let currentPartitionStart = -1;
    let currentPartitionEnd = -1;
    const finalPartitionEvents: BisectionParams[] = [];
    for (const partitionEvent of partitionEvents) {
        if (currentPartitionStart === partitionEvent.clockwiseExteriorEdgeIndex) {
            if (partitionEvent.widdershinsExteriorEdgeIndex < currentPartitionEnd) {
                throw new Error(`Partition sorting failure: start: ${currentPartitionStart}, end: ${currentPartitionEnd}, event end: ${partitionEvent.widdershinsExteriorEdgeIndex}`)
            }
            continue;
        }

        currentPartitionStart = partitionEvent.clockwiseExteriorEdgeIndex;
        currentPartitionEnd = partitionEvent.widdershinsExteriorEdgeIndex;

        finalPartitionEvents.push(partitionEvent)
    }

    const allOutgoingInteriorEdges = [...input.interiorEdges.filter(e => !context.isAccepted(e))]

    allOutgoingInteriorEdges.push(...finalPartitionEvents
        .filter(params => !context.isAccepted(params.widdershinsExteriorEdgeIndex)
            && !context.isAccepted(params.clockwiseExteriorEdgeIndex))
        .map(params => {
            return bisectWithParams(context, params)
        }))

    allOutgoingInteriorEdges.push(
        ...collapseEvents.filter(params => !(context.isAccepted(params.widdershinsExteriorEdgeIndex) && context.isAccepted(params.clockwiseExteriorEdgeIndex)))
            .map(params => bisectWithParams(context, params))
    )

    if (finalPartitionEvents.length === 0) {
        result.childSteps.push({interiorEdges: allOutgoingInteriorEdges})

        return result;
    }

    result.childSteps = finalPartitionEvents.map(() => ({interiorEdges: []}))

    const N = context.graph.numExteriorNodes;
    for (const interiorEdge of allOutgoingInteriorEdges) {
        const cwParent = context.clockwiseParent(context.getInteriorWithId(interiorEdge));
        const wsParent = context.widdershinsParent(context.getInteriorWithId(interiorEdge));

        let success = false;

        for (let i = 0; i < finalPartitionEvents.length; i++) {
            const event = finalPartitionEvents[i];
            const cwInSpan = (cwParent.id - event.clockwiseExteriorEdgeIndex + N) % N;
            const wsInSpan = (wsParent.id - event.clockwiseExteriorEdgeIndex + N) % N;
            const spanSize = (event.widdershinsExteriorEdgeIndex - event.clockwiseExteriorEdgeIndex + N) % N;
            if (cwInSpan <= spanSize && wsInSpan <= spanSize) {
                const partitionSet = result.childSteps[i];
                partitionSet.interiorEdges.push(interiorEdge);
                success = true;
                break;
            }
        }

        if (!success) {
            throw new Error(`Unable to play interior edge ${interiorEdge} in any span: ${finalPartitionEvents.flatMap(e => [e.clockwiseExteriorEdgeIndex, e.widdershinsExteriorEdgeIndex])}`)
        }
    }

    return result;
}
