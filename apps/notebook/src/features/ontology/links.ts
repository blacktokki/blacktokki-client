import type { OntologyNode } from './types';
import type { Paragraph } from '../../components/HeaderSelectBar';

interface NoteLinkTarget {
  title: string;
  paragraph?: string;
  section?: string;
}

const matchesTargetSection = (node: OntologyNode, section?: string): boolean =>
  section === undefined ||
  node.paragraph?.autoSection === section ||
  node.paragraph?.section === section;

/** Resolve the paragraph or card containing a link before falling back to its note. */
export const findOntologyLinkSourceNodeId = (
  nodes: OntologyNode[],
  pageTitle: string,
  paragraph: Paragraph,
  defaultNodeId?: string
): string | undefined =>
  nodes.find(
    (node) =>
      node.role === 'INSTANCE' &&
      node.paragraph?.path === paragraph.path &&
      node.paragraph?.autoSection === paragraph.autoSection &&
      (node.paragraph?.origin === pageTitle || node.noteTitle === pageTitle)
  )?.id || defaultNodeId;

/** Resolve a linked paragraph before a card or note with the same destination. */
export const findOntologyLinkTargetNodeId = (
  nodes: OntologyNode[],
  titleToNodeMap: Map<string, string>,
  target: NoteLinkTarget
): string | undefined => {
  if (target.paragraph) {
    const paragraph = nodes.find(
      (node) =>
        (node.instanceKind === 'PARAGRAPH' || node.instanceKind === 'CONNECTED_PARAGRAPH') &&
        node.name === target.paragraph &&
        matchesTargetSection(node, target.section) &&
        (node.noteTitle === target.title || node.boardTitle === target.title)
    );
    if (paragraph) return paragraph.id;

    const card = nodes.find(
      (node) =>
        node.instanceKind === 'CARD' &&
        (node.name === target.paragraph || node.paragraph?.title === target.paragraph) &&
        matchesTargetSection(node, target.section) &&
        (node.noteTitle === target.title || node.boardTitle === target.title)
    );
    if (card) return card.id;

    // An explicit paragraph link is not equivalent to a note-level link. If
    // its paragraph (and optional section discriminator) cannot be resolved,
    // leave it unresolved so validation can report the broken reference.
    return undefined;
  }
  return titleToNodeMap.get(target.title);
};
