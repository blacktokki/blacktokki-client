import { getKnowledgeGraphPalette as basePalette } from '../utils/palette';

/** Keep inferred-node colors separate from the source graph palette. */
export const getKnowledgeGraphPalette = (isDark: boolean) => ({
  ...basePalette(isDark),
  template: { fill: isDark ? '#5DADE2' : '#2874A6', stroke: '#0065A4' },
  templateGroup: {
    fill: isDark ? '#E4E4E4' : '#FFFFFF',
    stroke: '#0065A4',
  },
});
