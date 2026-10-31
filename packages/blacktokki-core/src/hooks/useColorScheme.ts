import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMemo, useEffect, useState } from 'react';
import {
  ColorSchemeName,
  Appearance,
  useColorScheme as useOriginalColorScheme,
  Platform,
} from 'react-native';

const NO_PREFERENCE = 'no-preference';
type UserColorScheme = 'light' | 'dark' | null;

const normalizeColorScheme = (scheme: string | null | undefined): UserColorScheme =>
  scheme === 'light' || scheme === 'dark' ? scheme : null;

function getUserScheme(): UserColorScheme {
  if (Platform.OS === 'web') {
    return normalizeColorScheme(document.documentElement.getAttribute('data-theme'));
  }
  return normalizeColorScheme(Appearance.getColorScheme());
}
const userListener = new Set<(scheme: UserColorScheme) => void>();

if (Platform.OS === 'web') {
  Appearance.setColorScheme = (scheme) => {
    document.documentElement.setAttribute(
      'data-theme',
      normalizeColorScheme(scheme) || NO_PREFERENCE
    );
  };

  Appearance.getColorScheme = () => {
    const systemValue = window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
    const userValue = getUserScheme();
    return userValue ? userValue : systemValue;
  };

  Appearance.addChangeListener = (listener) => {
    // Listen for changes of system value
    const systemValueListener = () => {
      const colorScheme = Appearance.getColorScheme() ?? 'unspecified';
      listener({ colorScheme });
    };

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', systemValueListener);

    // Listen for changes of user set value
    const observer = new MutationObserver((mutationsList) => {
      for (const mutation of mutationsList) {
        if (mutation.attributeName === 'data-theme') {
          listener({ colorScheme: Appearance.getColorScheme() ?? 'unspecified' });
          userListener.forEach((l) => l(getUserScheme()));
        }
      }
    });
    observer.observe(document.documentElement, { attributes: true });

    function remove(): void {
      media.removeEventListener('change', systemValueListener);
      observer.disconnect();
    }

    return { remove };
  };
}

export function useInitColorScheme() {
  const [complete, setComplete] = useState(false);
  useEffect(() => {
    if (!complete) {
      AsyncStorage.getItem('color').then((v) => {
        Appearance.setColorScheme(normalizeColorScheme(v) ?? 'unspecified');
        setComplete(true);
      });
    }
  }, [complete]);
  return complete;
}

export function useUserColorScheme(): [
  UserColorScheme,
  (colorScheme: ColorSchemeName | null | undefined) => void,
] {
  const [scheme, setScheme] = useState<UserColorScheme>(getUserScheme());
  useEffect(() => {
    userListener.add(setScheme);
    return () => {
      userListener.delete(setScheme);
    };
  }, []);
  return [
    scheme || null,
    (colorScheme) => {
      const preference = normalizeColorScheme(colorScheme);
      return AsyncStorage.setItem('color', preference || NO_PREFERENCE).then(() =>
        Appearance.setColorScheme(preference ?? 'unspecified')
      );
    },
  ];
}

export default function useColorScheme(): 'light' | 'dark' {
  const scheme = useOriginalColorScheme();
  return useMemo(() => (scheme === 'dark' ? 'dark' : 'light'), [scheme]);
}
