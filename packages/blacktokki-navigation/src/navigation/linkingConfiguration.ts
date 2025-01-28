/**
 * Learn more about deep linking with React Navigation
 * https://reactnavigation.org/docs/deep-linking
 * https://reactnavigation.org/docs/configuring-links
 */

import { LinkingOptions } from '@react-navigation/native';

import { NavigationConfig } from '../types';

export default (config: NavigationConfig) => {
  const screens = Object.fromEntries(
    Object.entries({ ...config.main, ...config.login }).map((entry) => {
      const { initialRouteName, exact, parse, path, screens, stringify } = entry[1];
      return [entry[0], { initialRouteName, exact, parse, path, screens, stringify }];
    })
  );
  return {
    prefixes: config.prefixes,
    config: {
      screens: {
        ...screens,
        NotFound: '*',
      },
    },
  } as LinkingOptions<any>;
};
