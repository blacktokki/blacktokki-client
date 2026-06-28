import { useColorScheme } from '@blacktokki/core';
import { useMemo } from 'react';

import { createCommonStyles as _createCommonStyles } from '../styles';
import { useExtension } from './useExtension';

const styleCache: Record<string, ReturnType<typeof _createCommonStyles>> = {};
let fnIdCounter = 0;
const fnIds = new WeakMap<Function, number>();

const getThemeListKey = (themeList?: ((colorScheme: 'light' | 'dark') => any)[]) => {
  if (!themeList || themeList.length === 0) return 'default';
  return themeList
    .map((fn) => {
      let id = fnIds.get(fn);
      if (id === undefined) {
        id = fnIdCounter++;
        fnIds.set(fn, id);
      }
      return id;
    })
    .join(',');
};

export const createCommonStyles = (
  colorScheme: 'light' | 'dark',
  themeList?: ((colorScheme: 'light' | 'dark') => any)[]
) => {
  const cacheKey = `${colorScheme}:${getThemeListKey(themeList)}`;
  if (styleCache[cacheKey]) {
    return styleCache[cacheKey];
  }

  const instances =
    themeList && themeList.length > 0
      ? themeList.map((t) => t(colorScheme))
      : [_createCommonStyles(colorScheme)];

  if (instances.length === 1) {
    styleCache[cacheKey] = instances[0] as ReturnType<typeof _createCommonStyles>;
    return styleCache[cacheKey];
  }

  const mergedStyles: any = {};
  const mergedColors: any = {};

  let colorIndex = 0;
  for (const key of Object.keys(instances[0].colors)) {
    mergedColors[key] = instances[colorIndex % instances.length].colors[key];
    colorIndex++;
  }

  let styleIndex = 0;
  for (const key of Object.keys(instances[0])) {
    if (key === 'colors') continue;
    mergedStyles[key] = instances[styleIndex % instances.length][key];
    styleIndex++;
  }

  styleCache[cacheKey] = { ...mergedStyles, colors: mergedColors } as ReturnType<
    typeof _createCommonStyles
  >;
  return styleCache[cacheKey];
};

export function useNotebookTheme() {
  const colorScheme = useColorScheme();
  const { data: extension } = useExtension();
  const commonStyles = useMemo(() => {
    return createCommonStyles(colorScheme, extension?.feature.createCommonStylesList || []);
  }, [colorScheme, extension?.feature.createCommonStylesList]);

  return {
    colorScheme,
    commonStyles,
  };
}
