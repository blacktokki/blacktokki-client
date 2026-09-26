export interface OntologyNodeColor {
  fill: string;
  stroke: string;
}

/** Galaxy centers are brighter than their nearby nodes; categories stay distinct in both themes. */
export const getOntologyPalette = (
  isDark: boolean
): Record<
  | 'builtInClass'
  | 'boardClass'
  | 'topicClass'
  | 'note'
  | 'boardNote'
  | 'card'
  | 'paragraph'
  | 'boardParagraph'
  | 'connectedParagraph'
  | 'externalLink'
  | 'connectedExternalLink'
  | 'literal',
  OntologyNodeColor
> => ({
  builtInClass: { fill: isDark ? '#587B9A' : '#B7C8D5', stroke: isDark ? '#83A1BB' : '#486F8E' },
  boardClass: { fill: isDark ? '#5A8D77' : '#B8CFC1', stroke: isDark ? '#86AF9B' : '#467C62' },
  topicClass: { fill: isDark ? '#806C9E' : '#C7BBD4', stroke: isDark ? '#A99ABF' : '#725D89' },
  note: { fill: isDark ? '#446A8C' : '#8FAFC5', stroke: isDark ? '#7796B1' : '#3A6282' },
  boardNote: { fill: isDark ? '#3F755D' : '#91B8A2', stroke: isDark ? '#71A088' : '#3B7355' },
  boardParagraph: { fill: isDark ? '#3F755D' : '#91B8A2', stroke: isDark ? '#71A088' : '#3B7355' },
  card: { fill: isDark ? '#74894D' : '#B4C691', stroke: isDark ? '#9EAE7A' : '#62783C' },
  paragraph: { fill: isDark ? '#6F7587' : '#ABB1BF', stroke: isDark ? '#949AAC' : '#586174' },
  connectedParagraph: {
    fill: isDark ? '#8F5B7C' : '#C8A5BD',
    stroke: isDark ? '#AF84A0' : '#86506E',
  },
  externalLink: { fill: isDark ? '#986F50' : '#CDAE91', stroke: isDark ? '#B28D70' : '#885C3E' },
  connectedExternalLink: {
    fill: isDark ? '#955860' : '#C69EA5',
    stroke: isDark ? '#B7898F' : '#854C58',
  },
  literal: { fill: isDark ? '#92865B' : '#CDC298', stroke: isDark ? '#ADA178' : '#74693B' },
});
