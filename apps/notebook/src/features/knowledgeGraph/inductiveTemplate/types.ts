export type TemplateGraphMode = 'off' | 'on';

export const nextTemplateGraphMode = (mode: TemplateGraphMode): TemplateGraphMode =>
  mode === 'off' ? 'on' : 'off';
