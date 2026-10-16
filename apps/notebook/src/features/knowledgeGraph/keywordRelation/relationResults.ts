import { independentSupportRank } from './optimizer/validation';
import type {
  InductiveRelationCandidate,
  RelationEntityResult,
  RelationObservation,
  RelationValidation,
  RelationEntitySources,
} from './relationDiscovery';
import { relationKeywordEntityKey, relationKeywordKey } from './relationKeywords';

export type RelationSupportRank = {
  meanSupport: number;
  supportCount: number;
  confidence: number;
};
export type EntityRelationship = RelationSupportRank & {
  id: string;
  name: string;
  template: string;
  sentences: {
    context: Pick<
      RelationEntitySources['sentences'][number],
      'noteTitle' | 'section' | 'sectionPath' | 'text'
    >;
    relatedEntityKey: string;
    evidence: RelationEvidence;
    observationIndex: number;
  }[];
};
export type RelationEntityDetail = RelationEntityResult['entities'][number] & {
  key: string;
  relationships: Map<string, EntityRelationship>;
  relatedEntities: Set<string>;
  sources: RelationEntitySources['sources'];
};
export type RelationEvidence = {
  observation: RelationObservation;
  validation?: RelationValidation;
};
export type RelationDetail = RelationSupportRank & {
  candidate: InductiveRelationCandidate;
  evidence: RelationEvidence[];
};

/** Balance mean support with independent supported claims, counting copied inputs once. */
export const relationSupportRank = independentSupportRank;

export const compareRelationConfidence = (a: RelationSupportRank, b: RelationSupportRank) =>
  b.confidence - a.confidence || b.meanSupport - a.meanSupport || b.supportCount - a.supportCount;

/** Original keyword identity stays independent of its classification pattern. */
export { relationKeywordKey as relationEntityKey };

const relationSentenceEntityKeys = (sentence: RelationEntitySources['sentences'][number]) =>
  sentence.entityKeys ?? sentence.entities.map(relationKeywordKey);

/** Substitute once so literal placeholders or replacement tokens inside entity names stay intact. */
export function relationStatement(template: string, source: string, target: string) {
  return template.replace(/\{\{E([12])\}\}/g, (_, position) =>
    position === '1' ? source : target
  );
}

/** Index once per result; detail navigation never scans the entire evidence corpus. */
export function createRelationResultsIndex(
  inventory: RelationEntityResult['entities'],
  candidates: InductiveRelationCandidate[],
  details: Record<string, RelationEntitySources> = {}
) {
  const entities = new Map<string, RelationEntityDetail>(
    inventory.map((entity) => {
      const key = relationKeywordEntityKey(entity);
      return [
        key,
        {
          ...entity,
          key,
          relationships: new Map(),
          relatedEntities: new Set(),
          sources: details[key]?.sources || [],
        },
      ];
    })
  );
  const relations = new Map<string, RelationDetail>();
  const relationshipSentences = new WeakMap<EntityRelationship, Set<string>>();
  const sentenceLocations = new Map<string, Map<string, RelationEntitySources['sentences']>>();
  for (const key of entities.keys()) {
    const locations = new Map<string, RelationEntitySources['sentences']>();
    for (const sentence of details[key]?.sentences || []) {
      const location = JSON.stringify([sentence.noteTitle, sentence.section]);
      const rows = locations.get(location) || [];
      rows.push(sentence);
      locations.set(location, rows);
    }
    sentenceLocations.set(key, locations);
  }
  for (const candidate of candidates) {
    const ranking = relationSupportRank(candidate.validations, candidate.observations.length);
    const verificationIds = new Map<string, number>();
    const evidence = candidate.observations.map((observation, index) => {
      const validation = candidate.validations[index];
      const relationEvidence = { observation, validation };
      const verificationKey = JSON.stringify(relationEvidence);
      const verificationId = verificationIds.get(verificationKey) ?? verificationIds.size;
      verificationIds.set(verificationKey, verificationId);
      const source = relationKeywordKey(observation.source);
      const target = relationKeywordKey(observation.target);
      for (const key of new Set([source, target])) {
        const entity = entities.get(key);
        if (!entity) continue;
        let relationship = entity.relationships.get(candidate.id);
        if (!relationship) {
          relationship = {
            id: candidate.id,
            name: candidate.label,
            template: candidate.template,
            ...ranking,
            sentences: [],
          };
          entity.relationships.set(candidate.id, relationship);
          relationshipSentences.set(relationship, new Set());
        }
        const other = key === source ? target : source;
        if (other !== key && entities.has(other)) {
          entity.relatedEntities.add(other);
        }
        const matching = (
          sentenceLocations
            .get(key)
            ?.get(JSON.stringify([observation.noteTitle, observation.section])) || []
        ).filter(
          (sentence) =>
            relationKeywordKey(sentence.text).includes(relationKeywordKey(observation.evidence)) &&
            relationSentenceEntityKeys(sentence).includes(other)
        );
        const sentences = matching.length
          ? matching
          : [
              {
                noteTitle: observation.noteTitle,
                section: observation.section,
                sectionPath: observation.sectionPath,
                text: observation.evidence,
              },
            ];
        for (const sentence of sentences) {
          const indexed = relationshipSentences.get(relationship)!;
          const sentenceKey = JSON.stringify([
            sentence.noteTitle,
            sentence.section,
            sentence.sectionPath,
            sentence.text,
            other,
            verificationId,
          ]);
          if (indexed.has(sentenceKey)) continue;
          indexed.add(sentenceKey);
          relationship.sentences.push({
            context: sentence,
            relatedEntityKey: other,
            evidence: relationEvidence,
            observationIndex: index,
          });
        }
      }
      // Discovery creates one validation per observation in the same order. Text is not unique.
      return relationEvidence;
    });
    relations.set(candidate.id, { candidate, ...ranking, evidence });
  }
  return { entities, relations };
}
