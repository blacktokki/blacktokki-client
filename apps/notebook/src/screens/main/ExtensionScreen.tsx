import { useLangContext, Spacer } from '@blacktokki/core';
import React, { useCallback } from 'react';
import { View, FlatList, Text } from 'react-native';
import { List, Switch } from 'react-native-paper';

import { ResponsiveSearchBar } from '../../components/SearchBar';
import { useExtension, useSetExtensionConfig } from '../../hooks/useExtension';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';

export const ExtensionScreen: React.FC = () => {
  const { commonStyles } = useNotebookTheme();
  const { lang } = useLangContext();

  const { data: extension } = useExtension();
  const setExtensionConfig = useSetExtensionConfig();

  const renderItem = useCallback(
    ({ item }: { item: (typeof extension.info)[number] }) => {
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
    },
    [commonStyles, lang, setExtensionConfig]
  );

  const ItemSeparator = useCallback(() => <Spacer height={4} />, []);

  return (
    <>
      <ResponsiveSearchBar />
      <View style={{ flex: 1 }}>
        <View
          style={{
            paddingTop: commonStyles.container.paddingVertical,
            paddingHorizontal: commonStyles.container.paddingHorizontal,
            backgroundColor: commonStyles.container.backgroundColor,
          }}
        >
          <Text style={[commonStyles.title, { marginBottom: 16 }]}>
            {lang('Extension Settings')}
          </Text>
        </View>
        <FlatList
          data={extension.info}
          keyExtractor={(item) => item.key}
          style={commonStyles.container}
          renderItem={renderItem}
          ItemSeparatorComponent={ItemSeparator}
        />
      </View>
    </>
  );
};
