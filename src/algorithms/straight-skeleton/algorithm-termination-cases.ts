import {
    AlgorithmStepInput,
    AlgorithmStepOutput,
    StraightSkeletonSolverContext,
    Vector2
} from "@/algorithms/straight-skeleton/types";
import {areEqual, dotProduct} from "@/algorithms/straight-skeleton/core-functions";
import {collideInteriorEdges} from "@/algorithms/straight-skeleton/collision-helpers";
import {makeStraightSkeletonSolverContext} from "@/algorithms/straight-skeleton/solver-context";
import {initInteriorEdges, tryToAcceptExteriorEdge} from "@/algorithms/straight-skeleton/algorithm-helpers";

export function handleInteriorEdgePair(context: StraightSkeletonSolverContext, input: AlgorithmStepInput): AlgorithmStepOutput {
    if (input.interiorEdges.length !== 2) {
        throw new Error("Invalid call: expecting two interior edges");
    }

    const [id1, id2] = input.interiorEdges;
    const edgeData1 = context.getEdgeWithId(id1);
    const edgeData2 = context.getEdgeWithId(id2);


    const dotEdges = dotProduct(edgeData1.basisVector, edgeData2.basisVector);
    if (!areEqual(dotEdges, -1)) {
        throw new Error("Expecting a head on collision for final interior edge pair")
    }

    edgeData1.target = edgeData2.source;
    edgeData2.target = edgeData1.source;

    const source1 = context.findSource(id1);
    const source2 = context.findSource(id2);

    source1.inEdges.push(id2);
    source2.inEdges.push(id1);

    context.acceptAll(input.interiorEdges);

    return {
        childSteps: []
    }
}

export function handleInteriorEdgeTriangle(context: StraightSkeletonSolverContext, input: AlgorithmStepInput): AlgorithmStepOutput {
    if (input.interiorEdges.length !== 3) {
        throw new Error("Invalid call: expecting two interior edges");
    }

    const edgeData = context.getEdges(input.interiorEdges);
    const [interior1, interior2] = context.getInteriorEdges(input.interiorEdges);

    const event = collideInteriorEdges(interior1, interior2, context);

    if (event === null) {
        throw new Error("Failed to collide interior edges in triangle");
    }

    const newNode = context.findOrAddNode(event.position)
    newNode.inEdges.push(...input.interiorEdges);
    edgeData.forEach(e => {
        e.target = newNode.id;
    })

    context.acceptAll(input.interiorEdges);

    return {
        childSteps: []
    }
}

export function handleInteriorEdges(context: StraightSkeletonSolverContext, input: AlgorithmStepInput): AlgorithmStepOutput {
    if (input.interiorEdges.length < 3) {
        throw new Error("Greater than 3 edges required for generic step handling.")
    }

    const result: AlgorithmStepOutput = {
        childSteps: []
    };

    // Generate all currently valid collision events
    // Resolve those that meet the same offset threshold
    // Collapse/partition into child

    return result;
}


export function HandleAlgorithmStepInput(context: StraightSkeletonSolverContext, input: AlgorithmStepInput): AlgorithmStepOutput {
    const result: AlgorithmStepOutput = {
        childSteps: []
    };

    if (input.interiorEdges.length < 2) {
        throw new Error("Fewer than 2 interior edges is not a valid skeleton state")
    }

    if (input.interiorEdges.length === 2) {
        result.childSteps.push(...handleInteriorEdgePair(context, input).childSteps)
    }

    if (input.interiorEdges.length === 3) {
        result.childSteps.push(...handleInteriorEdgeTriangle(context, input).childSteps)
    }

    if (input.interiorEdges.length > 3) {
        result.childSteps.push(...handleInteriorEdges(context, input).childSteps)
    }

    return result;
}

export function StepAlgorithm(context: StraightSkeletonSolverContext, inputs: AlgorithmStepInput[]): AlgorithmStepOutput {
    return {
        childSteps: inputs
            .flatMap(inputList => HandleAlgorithmStepInput(context, inputList).childSteps)
            .filter(steps => steps.interiorEdges.length > 1)
    }
}

export function RunAlgorithmV5(nodes: Vector2[]): StraightSkeletonSolverContext {
    if (nodes.length < 3) {
        throw new Error("Must have at least three nodes to perform algorithm");
    }
    const context = makeStraightSkeletonSolverContext(nodes);
    const exteriorEdges = [...context.graph.edges]

    initInteriorEdges(context);

    let inputs: AlgorithmStepInput[] = [{interiorEdges: context.graph.interiorEdges.map(e => e.id)}]
    while (inputs.length > 0) {
        inputs = StepAlgorithm(context, inputs).childSteps
        exteriorEdges.forEach(e => tryToAcceptExteriorEdge(context, e.id))
    }

    return context
}