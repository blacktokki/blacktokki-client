import { Auth } from '@blacktokki/account';
import { NavigationConfig } from '@blacktokki/navigation';
import React from 'react';

import { SearchPageScreen } from './agent/SearchPageScreen';
import ProblemButton from './problem/ProblemButton';
import { ProblemsScreen } from './problem/ProblemScreen';
import QuickMemoButton from './quickMemo/QuickMemoButton';
import { QuickMemoScreen } from './quickMemo/QuickMemoScreen';
import TimeLineButton from './timeline/TimeLineButton';
import { TimeLineScreen } from './timeline/TimeLineScreen';
import TimerTagSection from './timeline/TimerTagSection';
import { features } from '../hooks/useExtension';
import ArchiveConfigSection, { ExportButton } from './archive/ArchiveConfigSection';
import RandomButton from './random/RandomButton';

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
  extraArchiveButtons: [],
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
  extraArchiveButtons: [],
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
  extraArchiveButtons: [],
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
  extraArchiveButtons: [],
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
  extraArchiveButtons: [],
  elements: [
    {
      type: 'extraSearchButton',
      Component: <RandomButton key={'random'} />,
    },
  ],
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
