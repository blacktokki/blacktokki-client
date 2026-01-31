import { useColorScheme, useLangContext } from '@blacktokki/core';
import { markdownFs } from '@blacktokki/editor';
import { ConfigSection } from '@blacktokki/navigation';
import { View } from 'react-native';

import { useCreateOrUpdatePage, useNotePages } from '../../hooks/useNoteStorage';
import { OptionButton } from '../../screens/main/home/ConfigSection';
import { createCommonStyles } from '../../styles';

export default () => {
  const { lang } = useLangContext();
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const { data: contents } = useNotePages();
  const mutation = useCreateOrUpdatePage();
  const mdfs = markdownFs();
  return (
    <View style={commonStyles.card}>
      <ConfigSection title={lang('* Archive')}>
        <View style={{ flexDirection: 'row' }}>
          <OptionButton
            title={lang('Export')}
            onPress={() => contents && mdfs.export(contents)}
            active={false}
          />
          <OptionButton
            title={lang('Import')}
            onPress={() =>
              mdfs
                .import()
                .then((v) =>
                  v.forEach((v2, i) => mutation.mutate({ ...v2, isLast: i + 1 === v.length }))
                )
            }
            active={false}
          />
        </View>
      </ConfigSection>
    </View>
  );
};
