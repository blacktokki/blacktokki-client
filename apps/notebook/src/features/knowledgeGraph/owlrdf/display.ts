import {
  KnowledgeGraphRelationLabelMode,
  getKnowledgeGraphRelationDisplayLabel,
} from './relations';
import { KnowledgeGraphEdge } from '../types';

export const nextKnowledgeGraphLabelMode = (
  mode: KnowledgeGraphRelationLabelMode
): KnowledgeGraphRelationLabelMode => (mode === 'rdf' ? 'intuitive' : 'rdf');

export const knowledgeGraphLabelModeTitle = (
  mode: KnowledgeGraphRelationLabelMode,
  translate: (key: string) => string
): string => translate(mode === 'rdf' ? 'RDF/OWL terms' : 'Intuitive terms');

export const knowledgeGraphClassMembershipTitle = (
  mode: KnowledgeGraphRelationLabelMode,
  translate: (key: string) => string
): string => (mode === 'rdf' ? 'rdf:type' : translate('Category'));

export const knowledgeGraphRelationLegendDetail = (
  relation: Pick<KnowledgeGraphEdge, 'type' | 'propertyLabel' | 'label'>,
  mode: KnowledgeGraphRelationLabelMode,
  translate: (key: string) => string
): string =>
  mode === 'rdf' && relation.type === 'PART_OF'
    ? ` · ${getKnowledgeGraphRelationDisplayLabel(relation, 'intuitive', translate)}`
    : '';
