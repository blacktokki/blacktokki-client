import { Auth } from '@blacktokki/account';
import { NavigationConfig } from '@blacktokki/navigation';
import React from 'react';

import { SearchPageScreen } from './agent/SearchPageScreen';
import ProblemButton from './problem/ProblemButton';
import { ProblemsScreen } from './problem/ProblemScreen';
import TimeLineButton from './timeline/TimeLineButton';
import { TimeLineScreen } from './timeline/TimeLineScreen';
import TimerTagSection from './timeline/TimerTagSection';
import { features } from '../hooks/useExtension';
import ArchiveConfigSection from './archive/ArchiveConfigSection';

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
  buttons: [],
  configs: [],
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
  buttons: [<TimeLineButton key={'timeline'} />],
  configs: [],
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
  buttons: [<ProblemButton key={'problem'} />],
  configs: [],
};

features['archive'] = {
  title: 'Archive',
  description: 'Manages saved note contents to export or import data in Markdown format.',
  isDefault: false,
  screens: {},
  NoteSections: [],
  buttons: [],
  configs: [<ArchiveConfigSection key={'archive'} />],
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
