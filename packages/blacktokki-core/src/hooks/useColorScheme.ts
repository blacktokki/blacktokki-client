import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMemo, useEffect, useState } from 'react';
import {
  ColorSchemeName,
  Appearance,
  useColorScheme as useOriginalColorScheme,
  Platform,
} from 'react-native';
// The useColorScheme value is always either light or dark, but the built-in
// type suggests that it can be null. This will not happen in practice, so this
// makes it a bit easier to work with.

const NO_PREFERENCE = 'no-preference'

function getUserScheme(){
  if (Platform.OS === 'web'){
    const userValue = document.documentElement.getAttribute('data-theme');
    return userValue && userValue !== NO_PREFERENCE ? userValue as ColorSchemeName : null;
  }
  return Appearance.getColorScheme()
}
const userListener = new Set<(scheme:ColorSchemeName) => void>()

if (Platform.OS === 'web') {
  Appearance.setColorScheme = (scheme/*: 'light' | 'dark' | null */) => {
    document.documentElement.setAttribute('data-theme', scheme || NO_PREFERENCE);
  };

  Appearance.getColorScheme/*: () => 'light' | 'dark' */ = () => {
    const systemValue = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const userValue = getUserScheme();
    return userValue ? userValue : systemValue;
  };

  Appearance.addChangeListener = (listener) => {
    // Listen for changes of system value
    const systemValueListener = (e: any) => {
      const colorScheme = Appearance.getColorScheme();
      listener({ colorScheme });
    };
    
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', systemValueListener);

    // Listen for changes of user set value
    const observer = new MutationObserver((mutationsList) => {
      for (const mutation of mutationsList) {
        if (mutation.attributeName === 'data-theme') {
          listener({ colorScheme: Appearance.getColorScheme() });
          userListener.forEach(l => l(getUserScheme()))
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
        Appearance.setColorScheme(v === NO_PREFERENCE ? null : (v as ColorSchemeName));
        setComplete(true);
      });
    }
  }, [complete]);
  return complete;
}

export function useUserColorScheme():['light' | 'dark' | null, (colorScheme: ColorSchemeName) => void] {
  const [scheme, setScheme] = useState<ColorSchemeName>(getUserScheme());
  useEffect(() => {
    userListener.add(setScheme);
    return () => { userListener.delete(setScheme) };
  }, []);
  return [
    scheme || null,
    (colorScheme) => AsyncStorage.setItem('color', colorScheme || NO_PREFERENCE).then(() =>
      Appearance.setColorScheme(colorScheme)
    )
  ]
}

export default function useColorScheme(): 'light' | 'dark' {
  const scheme = useOriginalColorScheme();
  return useMemo(() => (scheme === 'dark' ? 'dark' : 'light'), [scheme]);
}
