import { initContextV2, isEventValid, processCollisionV2 } from './algorithm-v2';
import { acceptEdge } from './algorithm-helpers';
import { addNode, addVectors, positionsAreClose, scaleVector } from './core-functions';
import type { Vector2 } from './types';

const PENTAGON: Vector2[] = [{x: 3, y: 9}, {x: 6, y: 6}, {x: 6, y: 0}, {x: 0, y: 0}, {x: 0, y: 6}];

describe('V2 full trace — pentagon', () => {
    it('traces full algorithm with detailed event logging', () => {
        const { context, exteriorBounds, heap } = initContextV2(PENTAGON);
        const { graph, acceptedEdges } = context;
        const numExterior = graph.numExteriorNodes;

        let eventCount = 0;
        let validCount = 0;
        while (heap.length > 0 && eventCount < 100) {
            const event = heap.pop()!;
            eventCount++;
            if (!isEventValid(event, acceptedEdges)) {
                continue;
            }
            validCount++;

            const activeParticipants: { edgeId: number; distance: number }[] = [];
            for (let i = 0; i < event.participatingEdges.length; i++) {
                if (!acceptedEdges[event.participatingEdges[i]]) {
                    activeParticipants.push({ edgeId: event.participatingEdges[i], distance: event.distances[i] });
                }
            }

            const first = activeParticipants[0];
            const firstEdge = graph.edges[first.edgeId];
            const firstSource = graph.nodes[firstEdge.source].position;
            const collisionPos = addVectors(firstSource, scaleVector(firstEdge.basisVector, first.distance));

            let nodeIndex = -1;
            for (let i = numExterior; i < graph.nodes.length; i++) {
                if (positionsAreClose(graph.nodes[i].position, collisionPos)) {
                    nodeIndex = i;
                    break;
                }
            }
            if (nodeIndex < 0) {
                nodeIndex = addNode(collisionPos, graph);
            }

            for (const { edgeId, distance } of activeParticipants) {
                graph.edges[edgeId].target = nodeIndex;
                graph.interiorEdges[edgeId - numExterior].length = distance;
                if (!graph.nodes[nodeIndex].inEdges.includes(edgeId)) {
                    graph.nodes[nodeIndex].inEdges.push(edgeId);
                }
            }

            for (const { edgeId } of activeParticipants) {
                acceptEdge(edgeId, context);
            }

            const allAtNode = graph.nodes[nodeIndex].inEdges.filter(e => e >= numExterior);
            const newEdges = processCollisionV2(allAtNode, nodeIndex, context, exteriorBounds, heap);

            const extAccepted = acceptedEdges.slice(0, numExterior).map((a, i) => a ? i : null).filter(x => x !== null);
            console.log(`Step ${validCount}: edges=${JSON.stringify(activeParticipants.map(p => p.edgeId))} pos=(${collisionPos.x.toFixed(2)},${collisionPos.y.toFixed(2)}) node=${nodeIndex} allAtNode=${JSON.stringify(allAtNode)} new=${JSON.stringify(newEdges)} extAccepted=${JSON.stringify(extAccepted)}`);

            // Log remaining active interior edges
            const activeInterior = graph.interiorEdges.filter(ie => !acceptedEdges[ie.id]).map(ie => ie.id);
            console.log(`  Active interior edges: ${JSON.stringify(activeInterior)}`);
            console.log(`  Heap size: ${heap.length}`);

            if (acceptedEdges.slice(0, numExterior).every(f => f)) {
                console.log('  ALL EXTERIOR ACCEPTED');
                break;
            }
        }

        console.log('\nFinal state:');
        console.log('Exterior accepted:', acceptedEdges.slice(0, numExterior));
        console.log('All accepted:', acceptedEdges);
        console.log('Total events popped:', eventCount, 'Valid:', validCount);
        console.log('Remaining heap:', heap.length);

        // Dump remaining heap events
        while (heap.length > 0) {
            const e = heap.pop()!;
            const active = e.participatingEdges.filter(id => !acceptedEdges[id]);
            console.log(`  Remaining: edges=${JSON.stringify(e.participatingEdges)} active=${JSON.stringify(active)} dist=${e.eventDistance.toFixed(4)}`);
        }

        const allExteriorAccepted = acceptedEdges.slice(0, numExterior).every(f => f);
        expect(allExteriorAccepted).toBe(true);
    });
});
