import {
  Colors,
  useColorScheme,
  useLangContext,
  setColorScheme,
  TextButton,
  Text,
} from '@blacktokki/core';
import React from 'react';
import {
  TouchableOpacity,
  ColorSchemeName,
  useColorScheme as useColorConfigScheme,
  View,
} from 'react-native';

export const ConfigSection = ({
  title,
  children,
  onPress,
}: {
  title: string;
  children?: React.ReactNode;
  onPress?: () => void;
}) => {
  const theme = useColorScheme();
  const color = Colors[theme].text;
  return (
    <View>
      <TouchableOpacity
        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        onPress={onPress}
        disabled={!onPress}
      >
        <Text style={{ fontSize: 20, color, fontWeight: '600' }}>{title}</Text>
        {onPress && <Text>{'>'}</Text>}
      </TouchableOpacity>
      {children}
    </View>
  );
};

// export const NotificationConfigSection = () => {
//   const { enable: noti, setEnable: setNoti } = useFirebaseContext();
//   const { lang } = useLangContext();
//   const theme = useColorScheme();
//   const color = Colors[theme].text;
//   return (
//     <ConfigSection title={lang('* Notification Settings')}>
//       <View style={{ flexDirection: 'row' }}>
//         {[
//           [lang('On'), true],
//           [lang('Off'), false],
//         ].map(([title, n]) => (
//           <TextButton
//             key={title}
//             title={title || ''}
//             textStyle={{
//               fontSize: 16,
//               color,
//               textDecorationLine: noti == n ? 'underline' : 'none',
//             }}
//             style={{ borderRadius: 20 }}
//             onPress={() => {
//               setNoti(n);
//             }}
//           />
//         ))}
//       </View>
//     </ConfigSection>
//   );
// };

export const LanguageConfigSection = () => {
  const { lang, locale, setLocale, localeActived } = useLangContext();
  const theme = useColorScheme();
  const color = Colors[theme].text;
  return (
    localeActived && (
      <ConfigSection title={lang('* Language Settings')}>
        <View style={{ flexDirection: 'row' }}>
          {[
            [lang('Auto'), 'auto'],
            ['한국어', 'ko'],
            ['English', 'en'],
          ].map(([title, l]) => (
            <TextButton
              key={title}
              title={title || ''}
              textStyle={{
                fontSize: 16,
                color,
                textDecorationLine: locale === l ? 'underline' : 'none',
              }}
              style={{ borderRadius: 20 }}
              onPress={() => setLocale(l)}
            />
          ))}
        </View>
      </ConfigSection>
    )
  );
};

export const SkinConfigSection = () => {
  const { lang } = useLangContext();
  const theme = useColorScheme();
  const configTheme = useColorConfigScheme();
  const color = Colors[theme].text;
  return (
    <ConfigSection title={lang('* Skin Settings')}>
      <View style={{ flexDirection: 'row' }}>
        {[
          [lang('Auto'), 'no-preference'],
          [lang('Light'), 'light'],
          [lang('Dark'), 'dark'],
        ].map(([title, colorScheme]) => (
          <TextButton
            key={title}
            title={title}
            textStyle={{
              fontSize: 16,
              color,
              textDecorationLine: configTheme === colorScheme ? 'underline' : 'none',
            }}
            style={{ borderRadius: 20 }}
            onPress={() => setColorScheme(colorScheme as ColorSchemeName)}
          />
        ))}
      </View>
    </ConfigSection>
  );
};
