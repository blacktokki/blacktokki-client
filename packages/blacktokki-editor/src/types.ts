export type EditorProps = {
  theme: 'light' | 'dark';
  value: string;
  onReady?: () => void;
  autoResize?: boolean;
};
