import { useColorScheme, useLangContext, Spacer } from '@blacktokki/core';
import React from 'react';
import { View, FlatList, Text } from 'react-native';
import { List, Switch } from 'react-native-paper';

import { ResponsiveSearchBar } from '../../components/SearchBar';
import { useExtension, useSetExtensionConfig } from '../../hooks/useExtension';
import { createCommonStyles } from '../../styles';

export const ExtensionScreen: React.FC = () => {
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const { lang } = useLangContext();

  const { data: extension } = useExtension();
  const setExtensionConfig = useSetExtensionConfig();

  return (
    <>
      <ResponsiveSearchBar />
      <View style={commonStyles.container}>
        <Text style={[commonStyles.title, { marginBottom: 16 }]}>{lang('Extension Settings')}</Text>

        <FlatList
          data={extension.info}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) => {
            return (
              <List.Item
                title={lang(item.title)}
                description={lang(item.description)}
                style={[commonStyles.card, { marginBottom: 16, paddingVertical: 8 }]}
                right={() => (
                  <Switch
                    style={{ marginTop: 4 }}
                    value={item.active}
                    onValueChange={() =>
                      setExtensionConfig.mutate({ key: item.key, value: !item.active })
                    }
                  />
                )}
              />
            );
          }}
          ItemSeparatorComponent={() => <Spacer height={4} />}
        />
      </View>
    </>
  );
};
