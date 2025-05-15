export type AutoCompleteProps = {
  autoComplete?: {
    trigger: string;
    getMatchedChars: (pattern: string) => Promise<
      {
        value: string;
        text: string;
        icon?: string;
      }[]
    >;
  }[];
};

export type EditorProps = {
  theme: 'light' | 'dark';
  value: string;
  autoResize?: boolean;
};
