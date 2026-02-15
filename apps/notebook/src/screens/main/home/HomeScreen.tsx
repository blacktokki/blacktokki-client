import { useAuthContext } from '@blacktokki/account';
import { Colors, ContractFooter, useColorScheme, useLangContext } from '@blacktokki/core';
import { HomeSection, push, TabViewOption } from '@blacktokki/navigation';
import { StackScreenProps } from '@react-navigation/stack';
import React, { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { List } from 'react-native-paper';
import AntDesign from 'react-native-vector-icons/AntDesign';

import ConfigSection from './ConfigSection';
import { CurrentTabSection, RenderIcon, TabsSection } from './ContentGroupSection';
import { SearchBar } from '../../../components/SearchBar';
import { useExtension } from '../../../hooks/useExtension';
import { createCommonStyles } from '../../../styles';
import { RecentPagesSection } from '../RecentPageSection';

const NotesTabView = () => {
  const theme = useColorScheme();
  const { lang } = useLangContext();
  const { data: extension } = useExtension();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: Colors[theme].background }}>
      <CurrentTabSection />
      <TabsSection />
      <List.Subheader style={{}} selectable={false}>
        {lang('Menu')}
      </List.Subheader>
      {extension.feature.elements('button')}
      <List.Item
        left={RenderIcon('view-dashboard-variant')}
        title={lang('Board')}
        onPress={() => push('BoardList')}
      />
    </ScrollView>
  );
};

const RecentChangesTabView = () => {
  return <RecentPagesSection />;
};

const ConfigTabView = () => {
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: commonStyles.container.backgroundColor }}
      contentContainerStyle={commonStyles.container}
    >
      <ConfigSection />
    </ScrollView>
  );
};

export default function HomeScreen({ navigation, route }: StackScreenProps<any, 'Home'>) {
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const { auth } = useAuthContext();
  const title = auth.isLocal ? 'Blacktokki Notebook - Local' : 'Blacktokki Notebook';
  const tabViews: TabViewOption[] = useMemo(
    () => [
      {
        title: 'Discovery',
        component: NotesTabView,
        icon: <List.Icon icon={'compass'} />,
        headerRight: () => <></>,
      },
      {
        title: 'All Notes',
        component: RecentChangesTabView,
        icon: <List.Icon icon={'notebook'} />,
        headerRight: () => <></>,
      },
      {
        title: 'Config',
        component: ConfigTabView,
        icon: <List.Icon icon={'dots-horizontal'} />,
        headerRight: () => <></>,
      },
    ],
    []
  );
  return (
    <HomeSection
      tabViews={tabViews}
      homeView={{ title, headerRight: () => <SearchBar /> }}
      headerTitle={title}
    >
      <View style={[commonStyles.container, { width: '100%', justifyContent: 'space-between' }]}>
        <ConfigSection />
        <ContractFooter
          buttons={[
            {
              icon: <AntDesign name="github" size={24} color={Colors[theme].iconColor} />,
              url: 'https://github.com/blacktokki/blacktokki-notebook',
              isWeb: true,
            },
            {
              icon: <AntDesign name="mail" size={24} color={Colors[theme].iconColor} />,
              url: 'mailto:ydh051541@naver.com',
              isWeb: false,
            },
          ]}
        />
      </View>
    </HomeSection>
  );
}
