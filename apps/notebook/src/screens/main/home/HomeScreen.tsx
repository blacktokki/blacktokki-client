import { useAuthContext } from '@blacktokki/account';
import { ContractFooter, useLangContext } from '@blacktokki/core';
import { HomeSection, push, TabViewOption } from '@blacktokki/navigation';
import { useIsFocused } from '@react-navigation/native';
import { StackScreenProps } from '@react-navigation/stack';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { List } from 'react-native-paper';
import AntDesign from 'react-native-vector-icons/AntDesign';

import ConfigSection from './ConfigSection';
import { CurrentTabSection, RenderIcon, TabsSection } from './ContentGroupSection';
import HeaderNotebookDropdown from '../../../components/HeaderNotebookDropdown';
import { SearchBar } from '../../../components/SearchBar';
import { useBoardPages } from '../../../hooks/useBoardStorage';
import { useExtension } from '../../../hooks/useExtension';
import { useNotePages } from '../../../hooks/useNoteStorage';
import { useNotebookTheme } from '../../../hooks/useNotebookTheme';
import { useUsageMode } from '../../../hooks/useUsageMode';
import { RecentPagesSection } from '../RecentPageSection';
import { findBoardReferencePatterns } from '../findBoardReferencePatterns';
import { inferBoardCandidates, inferTopLevelBoardCandidates } from '../inferBoardCandidates';

const NotesTabView = () => {
  const { commonStyles } = useNotebookTheme();
  const { lang } = useLangContext();
  const { isBoardEnabled } = useUsageMode();
  const { data: extension } = useExtension();
  const buttons = extension.feature.elements('button');
  return (
    <ScrollView style={commonStyles.backgroundView}>
      <CurrentTabSection />
      <TabsSection />
      {(buttons.length > 0 || isBoardEnabled) && (
        <List.Subheader style={{}} selectable={false}>
          {lang('Menu')}
        </List.Subheader>
      )}
      {buttons}
      {isBoardEnabled && (
        <List.Item
          left={RenderIcon('view-dashboard-variant')}
          title={lang('Board')}
          onPress={() => push('BoardList')}
        />
      )}
    </ScrollView>
  );
};

const RecentChangesTabView = ({
  onBoardViewChange,
}: {
  onBoardViewChange: (boardView: boolean) => void;
}) => {
  const [title, setTitle] = useState<string>();
  return (
    <RecentPagesSection title={title} setTitle={setTitle} onBoardViewChange={onBoardViewChange} />
  );
};

const ConfigTabView = () => {
  const { commonStyles } = useNotebookTheme();
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
  const isFocused = useIsFocused();
  const [boardView, setBoardView] = useState(false);
  const { commonStyles } = useNotebookTheme();
  const { auth } = useAuthContext();
  const { usageMode, notebook } = useUsageMode();
  const { data: boards = [], isFetching: isBoardFetching } = useBoardPages();
  const { data: pages = [], isFetching: isNoteFetching } = useNotePages();
  const hasLoggedCandidatesRef = useRef(false);

  useEffect(() => {
    if (!isFocused) {
      hasLoggedCandidatesRef.current = false;
      return;
    }
    if (isBoardFetching || isNoteFetching || hasLoggedCandidatesRef.current) return;

    const candidates = [
      ...inferBoardCandidates(pages, boards),
      ...inferTopLevelBoardCandidates(pages, boards),
    ];
    console.log('[HomeScreen] Board candidates', candidates);
    console.log(
      '[HomeScreen] Board reference patterns',
      findBoardReferencePatterns(pages, boards, candidates)
    );
    hasLoggedCandidatesRef.current = true;
  }, [isFocused, isBoardFetching, isNoteFetching, pages, boards]);

  const title =
    usageMode === 'NOTEBOOK' && notebook?.title
      ? notebook.title
      : auth.isLocal
      ? 'Blacktokki Notebook - Local'
      : 'Blacktokki Notebook';

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => <HeaderNotebookDropdown />,
    });
  }, [navigation, title, usageMode, notebook]);

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
        component: () => <RecentChangesTabView onBoardViewChange={setBoardView} />,
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
      swipeEnabled={!boardView || parseInt(route.params?.['tab'] || 0, 10) !== 1}
      homeView={{ title, headerRight: () => <SearchBar /> }}
      headerTitle={title}
    >
      <View style={[commonStyles.container, { width: '100%', justifyContent: 'space-between' }]}>
        <ConfigSection />
        {usageMode !== 'SIMPLE' && (
          <ContractFooter
            buttons={[
              {
                icon: <AntDesign name="github" size={24} color={commonStyles.iconColor.color} />,
                url: 'https://github.com/blacktokki/blacktokki-notebook',
                isWeb: true,
              },
              {
                icon: <AntDesign name="mail" size={24} color={commonStyles.iconColor.color} />,
                url: 'mailto:ydh051541@naver.com',
                isWeb: false,
              },
            ]}
          />
        )}
      </View>
    </HomeSection>
  );
}
