import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMemo, useEffect, useState } from 'react';
import {
  ColorSchemeName,
  Appearance,
  useColorScheme as useNativeColorScheme,
  Platform,
} from 'react-native';
// The useColorScheme value is always either light or dark, but the built-in
// type suggests that it can be null. This will not happen in practice, so this
// makes it a bit easier to work with.

if (Platform.OS === 'web') {
  Appearance.setColorScheme = (scheme) => {
    scheme && document.documentElement.setAttribute('data-theme', scheme);
  };

  Appearance.getColorScheme = () => {
    const systemValue = window.matchMedia('(prefers-color-scheme: dark)') ? 'dark' : 'light';
    const userValue = document.documentElement.getAttribute('data-theme');
    return (userValue && userValue !== 'null' ? userValue : systemValue) as ColorSchemeName;
  };

  Appearance.addChangeListener = (listener) => {
    // Listen for changes of system value
    const systemValueListener = (e: any) => {
      const newSystemValue = e.matches ? 'dark' : 'light';
      const userValue = document.documentElement.getAttribute('data-theme');
      listener({
        colorScheme: userValue && userValue !== 'null' ? userValue : newSystemValue,
      } as any);
    };
    const systemValue = window.matchMedia('(prefers-color-scheme: dark)');
    systemValue.addEventListener('change', systemValueListener);

    // Listen for changes of user set value
    const observer = new MutationObserver((mutationsList) => {
      for (const mutation of mutationsList) {
        if (mutation.attributeName === 'data-theme') {
          listener({ colorScheme: Appearance.getColorScheme() });
        }
      }
    });
    observer.observe(document.documentElement, { attributes: true });

    function remove(): void {
      systemValue.removeEventListener('change', systemValueListener);
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
        Appearance.setColorScheme(v == null ? 'no-preference' : (v as any));
        setComplete(true);
      });
    }
  }, [complete]);
  return complete;
}

export function setColorScheme(colorScheme: ColorSchemeName) {
  AsyncStorage.setItem('color', colorScheme as string).then(() =>
    Appearance.setColorScheme(colorScheme)
  );
}

export default function useColorScheme(): 'light' | 'dark' {
  const scheme = useNativeColorScheme();
  return useMemo(() => (scheme === 'dark' ? 'dark' : 'light'), [scheme]);
}
