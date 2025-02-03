import {
  Colors,
  useColorScheme,
  useLangContext,
  setColorScheme,
  TextButton,
} from '@blacktokki/core';
import React from 'react';
import { ColorSchemeName, useColorScheme as useColorConfigScheme, Text, View } from 'react-native';

const ConfigSection = ({ title, children }: { title: string; children?: React.ReactNode }) => {
  const theme = useColorScheme();
  const color = Colors[theme].text;
  return (
    <View>
      <Text style={{ fontSize: 20, color, fontWeight: '600' }}>{title}</Text>
      {children}
    </View>
  );
};

export default () => {
  const { lang, locale, setLocale } = useLangContext();
  const theme = useColorScheme();
  const configTheme = useColorConfigScheme();
  // const {enable:noti, setEnable:setNoti} = useFirebaseContext()
  const color = Colors[theme].text;
  return (
    <>
      {/* <ConfigSection title={lang('* Notification Settings')}>
      <View style={{flexDirection:'row'}}>
        {[[lang('On'), true], [lang('Off'), false]].map(([title, n])=><TextButton
          key={title} title={title || ''} textStyle={{fontSize:16, color, textDecorationLine:noti==n?'underline':'none'}} style={{borderRadius:20}} onPress={()=>{setNoti(n)}}/>)}
      </View>
    </ConfigSection> */}
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
    </>
  );
};
