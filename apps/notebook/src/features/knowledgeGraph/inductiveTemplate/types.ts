import type { ExtractionMode } from '../../inductiveTemplate/types';

export type TemplateGraphMode = 'off' | ExtractionMode;

export const nextTemplateGraphMode = (mode: TemplateGraphMode): TemplateGraphMode =>
  mode === 'off' ? 'previous' : mode === 'previous' ? 'current' : 'off';

export const templateGraphModeLabel = (mode: TemplateGraphMode): string =>
  mode === 'previous' ? 'Whole-note structure' : 'Whole notes + shared table forms';
