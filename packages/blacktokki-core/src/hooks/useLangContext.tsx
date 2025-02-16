import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

export type Translations = Record<string, Record<string, string>>;

const IntlContext = createContext<{
  locale?: string;
  setLocale: (locale: string | undefined) => void;
  translations?: Translations;
}>({ locale: 'auto', setLocale: () => {} });

export const IntlProvider = (props: { children: React.ReactNode; translations?: Translations }) => {
  const [complete, setComplete] = useState(false);
  const [locale, setLocale] = useState<string>();
  useEffect(() => {
    AsyncStorage.getItem('locale').then((v) => {
      setLocale(v || 'auto');
      setComplete(true);
    });
  }, []);
  return complete ? (
    <IntlContext.Provider value={{ locale, setLocale, translations: props.translations }}>
      {props.children}
    </IntlContext.Provider>
  ) : (
    <></>
  );
};

export default () => {
  const { locale, setLocale, translations } = useContext(IntlContext);
  const lang = useCallback(
    (key: string) => {
      if (locale === 'en' || key.length === 0) return key;
      if (translations) {
        if (locale !== undefined && locale !== 'auto') return translations[locale][key];
        if (translations['ko']) return translations['ko'][key];
      }
      return key;
    },
    [locale, translations]
  );
  const localeActived = useMemo(() => translations !== undefined, [translations]);
  return {
    lang,
    locale,
    setLocale: (locale: string) => {
      AsyncStorage.setItem('locale', locale).then(() => setLocale(locale));
    },
    localeActived,
  };
};
