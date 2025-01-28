/**
 * Learn more about deep linking with React Navigation
 * https://reactnavigation.org/docs/deep-linking
 * https://reactnavigation.org/docs/configuring-links
 */

import { LinkingOptions } from '@react-navigation/native';

import { NavigationConfig } from '../types';

export default (config: NavigationConfig) => {
  return {
    prefixes: config.prefixes,
    config: {
      screens: {
        ...config.main,
        ...config.login,
        NotFound: '*',
      },
    },
  } as LinkingOptions;
};
