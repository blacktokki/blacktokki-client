import { Auth } from '@blacktokki/account';
import { NavigationConfig } from '@blacktokki/navigation';
import React from 'react';

import { SearchPageScreen } from './agent/SearchPageScreen';
import ArchiveConfigSection, { ExportButton } from './archive/ArchiveConfigSection';
import PdfExportDefaultSection from './pdf/PdfExportDefaultSection';
import PdfExportMidnightSection from './pdf/PdfExportMidnightSection';
import PdfExportThemeSection from './pdf/PdfExportThemeSection';
import ProblemButton from './problem/ProblemButton';
import { ProblemsScreen } from './problem/ProblemScreen';
import QuickMemoButton from './quickMemo/QuickMemoButton';
import { QuickMemoScreen } from './quickMemo/QuickMemoScreen';
import RandomButton from './random/RandomButton';
import { createCommonStyles as createGitHubStyles } from './themeGithub/styles';
import { createCommonStyles as createNamuwikiStyles } from './themeNamuwiki/styles';
import TimeLineButton from './timeline/TimeLineButton';
import { TimeLineScreen } from './timeline/TimeLineScreen';
import TimerTagSection from './timeline/TimerTagSection';
import { features } from '../hooks/useExtension';
import { createCommonStyles as createVSCodeStyles } from './themeVscode/styles';

features['quickMemo'] = {
  title: 'Quick Memo',
  description: 'Add a sub-paragraph quickly to a specific note.',
  isDefault: true,
  screens: {
    QuickMemo: {
      title: '',
      component: QuickMemoScreen,
      path: 'quickmemo',
    },
  },
  NoteSections: [],
  elements: [
    {
      type: 'button',
      Component: <QuickMemoButton key={'quickMemo'} />,
    },
  ],
};

features['agent'] = {
  title: 'Search',
  description: 'Provides advanced search, including note titles, body content, and external links.',
  isDefault: false,
  screens: {
    SearchPage: {
      title: '',
      component: SearchPageScreen,
      path: 'search',
    },
  },
  search: (item: any) => ({
    screen: 'SearchPage',
    params: { query: item.query },
  }),
  NoteSections: [],
  elements: [],
};

features['timeline'] = {
  title: 'Timeline',
  description:
    'Automatically detects dates in notes to visualize schedules and manage them in a timeline format.',
  isDefault: false,
  screens: {
    TimeLine: {
      title: '',
      component: TimeLineScreen,
      path: 'timeline',
    },
  },
  NoteSections: [TimerTagSection],
  elements: [
    {
      type: 'button',
      Component: <TimeLineButton key={'timeline'} />,
    },
  ],
};

features['problem'] = {
  title: 'Edit Suggestions',
  description:
    'Suggests edits by analyzing structural flaws or readability, such as duplicate content, empty paragraphs, or broken links.',
  isDefault: false,
  screens: {
    Problem: {
      title: '',
      component: ProblemsScreen,
      path: 'problem',
    },
  },
  NoteSections: [],
  elements: [
    {
      type: 'button',
      Component: <ProblemButton key={'problem'} />,
    },
  ],
};

features['archive'] = {
  title: 'Archive',
  description: 'Manages saved note contents to export or import data in Markdown format.',
  isDefault: false,
  screens: {},
  NoteSections: [],
  extraArchiveButtons: [ExportButton],
  elements: [
    {
      type: 'config',
      Component: <ArchiveConfigSection key={'archive'} />,
    },
  ],
};

features['random'] = {
  title: 'Random Note Access',
  description: 'Open a randomly selected note to discover content from a new perspective.',
  isDefault: false,
  screens: {},
  NoteSections: [],
  elements: [
    {
      type: 'extraSearchButton',
      Component: <RandomButton key={'random'} />,
    },
  ],
};

features['pdfExportDefault'] = {
  title: 'PDF Export (Default Style)',
  description:
    'Export the current note as a PDF document with default clean styling optimized for printing.',
  isDefault: false,
  screens: {},
  NoteSections: [],
  HeaderIconButtons: [PdfExportDefaultSection],
  elements: [],
};

features['pdfExportTheme'] = {
  title: 'PDF Export (Theme Style)',
  description: 'Export the current note as a PDF document retaining the active theme styling.',
  isDefault: false,
  screens: {},
  NoteSections: [],
  HeaderIconButtons: [PdfExportThemeSection],
  elements: [],
};

features['pdfExportMidnight'] = {
  title: 'PDF Export (Midnight Style)',
  description:
    'Export the current note as a PDF document styled with a premium midnight blue dark theme.',
  isDefault: false,
  screens: {},
  NoteSections: [],
  HeaderIconButtons: [PdfExportMidnightSection],
  elements: [],
};

features['themeVscode'] = {
  title: 'VSCode Skin',
  description: 'Apply VSCode style theme.',
  isDefault: false,
  screens: {},
  NoteSections: [],
  elements: [],
  createCommonStylesList: [createVSCodeStyles],
};

features['themeGithub'] = {
  title: 'GitHub Skin',
  description: 'Apply GitHub style theme.',
  isDefault: false,
  screens: {},
  NoteSections: [],
  elements: [],
  createCommonStylesList: [createGitHubStyles],
};

features['themeNamuwiki'] = {
  title: 'Namuwiki Skin',
  description: 'Apply Namuwiki style theme.',
  isDefault: false,
  screens: {},
  NoteSections: [],
  elements: [],
  createCommonStylesList: [createNamuwikiStyles],
};

export default (title: string | ((auth: Auth) => string)) => {
  return Object.keys(features).reduce((prev, k) => {
    const screens = features[k as keyof typeof features].screens;
    Object.keys(screens).forEach((k2) => {
      prev[k2] = { ...screens[k2 as keyof typeof screens], title };
    });
    return prev;
  }, {} as NavigationConfig['main']);
};
