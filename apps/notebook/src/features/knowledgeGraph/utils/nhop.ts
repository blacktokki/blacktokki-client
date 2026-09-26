import type { OntologyEdge, OntologyNode } from '../types';

export const DEFAULT_NHOP_DEPTH_OPTIONS = [1, 2, 99] as const;
export const EXTENDED_NHOP_DEPTH_OPTIONS = [1, 2, 3, 99] as const;

/**
 * Return whether the selected root class can expose the additional 3-hop range.
 * (Board class 3-hop has been removed; all nodes now use standard [1, 2, 99] options).
 */
export const supportsThreeHopRange = (_node?: OntologyNode, _edges?: OntologyEdge[]): boolean =>
  false;

export const getNhopDepthOptions = (
  _node?: OntologyNode,
  _edges?: OntologyEdge[]
): readonly number[] => DEFAULT_NHOP_DEPTH_OPTIONS;

/** Keep the selected range valid when focus moves between node categories. */
export const normalizeNhopDepth = (
  node: OntologyNode,
  edges: OntologyEdge[],
  depth: number
): number => (getNhopDepthOptions(node, edges).includes(depth) ? depth : 2);
