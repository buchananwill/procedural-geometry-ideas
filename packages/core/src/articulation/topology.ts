/** True when the sorted index list has no gaps. */
export function isContiguous(sortedIndices: number[]): boolean {
    for (let i = 1; i < sortedIndices.length; i++) {
        if (sortedIndices[i] !== sortedIndices[i - 1] + 1) return false;
    }
    return true;
}

/**
 * Split a sorted, unique, contiguous selection into spans walking away from
 * the pivot. Pivot outside the selection: one span ordered from the
 * nearest-to-pivot element outward. Pivot inside: two spans (below
 * descending, above ascending), pivot excluded.
 */
export function splitSpans(sortedSelection: number[], pivotIndex: number): number[][] {
    const below = sortedSelection.filter((i) => i < pivotIndex).reverse();
    const above = sortedSelection.filter((i) => i > pivotIndex);
    const spans: number[][] = [];
    if (below.length > 0) spans.push(below);
    if (above.length > 0) spans.push(above);
    return spans;
}
