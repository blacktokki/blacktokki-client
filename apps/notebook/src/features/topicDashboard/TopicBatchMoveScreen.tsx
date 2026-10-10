import { Spacer, useLangContext } from '@blacktokki/core';
import { navigate } from '@blacktokki/navigation';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import FaIcon from 'react-native-vector-icons/FontAwesome';

import { TopicDashboardNavigationProp, TopicNavigationParamList } from './types';
import { ChangedItem } from '../../components/ChangedBlock';
import { SearchBar } from '../../components/SearchBar';
import { useCreateOrUpdateBoard } from '../../hooks/useBoardStorage';
import { useEffectExtensionScreen } from '../../hooks/useExtension';
import { useCreateOrUpdatePage, useMovePage, useNotePages } from '../../hooks/useNoteStorage';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';
import { useUsageMode } from '../../hooks/useUsageMode';
import {
  MoveActionButtons,
  MoveChangedPreview,
  MoveOptionCheckbox,
  MovePageContainer,
  replaceBacklinks,
} from '../../screens/main/MovePageScreen';
import { BoardOption, Content } from '../../types';

type TopicBatchMoveScreenRouteProp = RouteProp<TopicNavigationParamList, 'TopicBatchMove'>;

export const TopicBatchMoveScreen: React.FC = () => {
  useEffectExtensionScreen('topicDashboard');

  const route = useRoute<TopicBatchMoveScreenRouteProp>();
  const { title = '', batchTitles = [], boardOption } = route.params || {};
  const navigation = useNavigation<TopicDashboardNavigationProp>();

  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();

  const [newTitle, setNewTitle] = useState(title);
  const [boardType, setBoardType] = useState<'KANBAN' | 'SCRUM'>(
    boardOption?.BOARD_TYPE || 'SCRUM'
  );
  const [includeSubNotes, setIncludeSubNotes] = useState(true);
  const [updateBacklinks, setUpdateBacklinks] = useState(true);

  const { usageMode, notebook, isBoardEnabled } = useUsageMode();
  const notebookId = notebook?.id || 0;

  const notebookName =
    usageMode === 'SIMPLE' ? '' : notebookId === 0 ? lang('Note Mode') : notebook?.title || '';

  const { data: pages = [] } = useNotePages(notebookId);

  const createMutation = useCreateOrUpdatePage();
  const moveMutation = useMovePage();
  const createBoardMutation = useCreateOrUpdateBoard();

  const mainNewTitle = newTitle.trim();

  // 하위 노트 개수 계산
  const subNotesCount = useMemo(() => {
    let count = 0;
    batchTitles.forEach((t) => {
      count += pages.filter((n) => n.title.startsWith(t + '/') && n.description).length;
    });
    return count;
  }, [batchTitles, pages]);

  // 역링크 개수 계산
  const backLinksCount = useMemo(() => {
    const mappings = batchTitles.map((t) => ({ oldTitle: t, newTitle: `${mainNewTitle}/${t}` }));
    let count = 0;
    const titlesSet = new Set(batchTitles);
    pages.forEach((p) => {
      if (titlesSet.has(p.title)) return;
      if (!p.description) return;
      const replaced = replaceBacklinks(p.description, mappings, undefined, p.title);
      if (replaced !== p.description) {
        count++;
      }
    });
    return count;
  }, [batchTitles, mainNewTitle, pages]);

  // 변경 프리뷰 데이터 생성
  const previewData = useMemo(() => {
    if (!mainNewTitle) return [];

    const data: ChangedItem[] = [];
    const checkExisting = (checkTitle: string) =>
      pages.find((p: Content) => p.title === checkTitle && p.description);

    const mappings: { oldTitle: string; newTitle: string }[] = [];
    batchTitles.forEach((t) => {
      const targetTitle = `${mainNewTitle}/${t}`;
      mappings.push({ oldTitle: t, newTitle: targetTitle });

      const p = pages.find((n) => n.title === t);
      const existing = checkExisting(targetTitle);
      const existingDescription = (existing?.description || '').length > 0;
      if (existing && existingDescription) {
        data.push({
          renderType: 'override',
          fetchType: 'override',
          title: t,
          newTitle: targetTitle,
          description: existing.description || '',
          newDescription: p?.description || '',
          oldNotebookName: notebookName,
          newNotebookName: notebookName,
        });
      } else {
        data.push({
          renderType: 'plain',
          fetchType: existing ? 'override' : 'move',
          title: t,
          newTitle: targetTitle,
          newDescription: p?.description || '',
          oldNotebookName: notebookName,
          newNotebookName: notebookName,
        });
      }

      if (includeSubNotes) {
        const sNotes = pages.filter((n) => n.title.startsWith(t + '/') && n.description);
        sNotes.forEach((sn) => {
          const snTargetTitle = targetTitle + sn.title.substring(t.length);
          mappings.push({ oldTitle: sn.title, newTitle: snTargetTitle });
          const exSub = checkExisting(snTargetTitle);
          const exSubDescription = (exSub?.description || '').length > 0;
          if (exSub && exSubDescription) {
            data.push({
              renderType: 'override',
              fetchType: 'override',
              title: sn.title,
              newTitle: snTargetTitle,
              description: exSub.description || '',
              newDescription: sn.description || '',
              oldNotebookName: notebookName,
              newNotebookName: notebookName,
            });
          } else {
            data.push({
              renderType: 'plain',
              fetchType: exSub ? 'override' : 'move',
              title: sn.title,
              newTitle: snTargetTitle,
              newDescription: sn.description || '',
              oldNotebookName: notebookName,
              newNotebookName: notebookName,
            });
          }
        });
      }
    });

    if (updateBacklinks && mappings.length > 0) {
      data.forEach((item) => {
        if ('newDescription' in item && item.newDescription) {
          item.newDescription = replaceBacklinks(
            item.newDescription,
            mappings,
            undefined,
            item.title
          );
        }
      });
      const handledTitles = new Set(data.map((d) => d.title));
      pages.forEach((p) => {
        if (handledTitles.has(p.title)) return;
        if (!p.description) return;
        const newDesc = replaceBacklinks(p.description, mappings, undefined, p.title);
        if (newDesc !== p.description) {
          data.push({
            renderType: 'diff',
            fetchType: 'part',
            title: p.title,
            description: p.description,
            newDescription: newDesc,
          });
        }
      });
    }

    return data;
  }, [mainNewTitle, batchTitles, pages, notebookName, includeSubNotes, updateBacklinks]);

  const anyExists = previewData.some((d) => d.fetchType === 'override');
  const moveDisabled = !mainNewTitle || previewData.length === 0 || !isBoardEnabled;

  const handleMove = async () => {
    if (moveDisabled) return;
    try {
      for (let i = 0; i < previewData.length; i++) {
        const item = previewData[i];
        const isLast = i === previewData.length - 1;
        switch (item.fetchType) {
          case 'move':
            await moveMutation.mutateAsync({
              oldTitle: item.title,
              newTitle: item.newTitle,
              isLast,
              newParentId: notebookId,
            });
            break;
          case 'override':
            await createMutation.mutateAsync({
              title: item.newTitle,
              description: item.newDescription,
              isLast: false,
              newParentId: notebookId,
            });
            await createMutation.mutateAsync({
              title: item.title,
              description: '',
              isLast,
            });
            break;
          case 'part':
            await createMutation.mutateAsync({
              title: item.title,
              description: item.newDescription,
              isLast,
              newParentId: notebookId,
            });
            break;
        }
      }

      // 보드 전환 및 생성
      const finalOption: BoardOption = {
        ...(boardOption || {}),
        BOARD_TYPE: boardType,
        BOARD_HEADER_LEVEL: boardOption?.BOARD_HEADER_LEVEL || 3,
      };
      await createBoardMutation.mutateAsync({
        title: mainNewTitle,
        description: '',
        option: finalOption,
        newParentId: notebookId,
      });

      Alert.alert(lang('Success'), lang('Board created successfully!'));
      navigation.push('RecentPages', { title: mainNewTitle });
    } catch (error: any) {
      Alert.alert(lang('error'), error.message || lang('An error occurred while moving note.'));
    }
  };

  const handleCancel = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigate('TopicDashboard');
    }
  };

  return (
    <MovePageContainer
      actionButtons={
        <MoveActionButtons
          onCancel={handleCancel}
          onSubmit={handleMove}
          submitLabel={lang('Save as Board')}
          disabled={moveDisabled}
          isDanger={!moveDisabled && anyExists}
          isLoading={
            moveMutation.isLoading || createMutation.isLoading || createBoardMutation.isLoading
          }
        />
      }
    >
      {/* 보드 전환 (칸반 / 스크럼) 옵션 선택 UI */}
      <Text style={[commonStyles.text, { marginBottom: 8 }]}>{lang('Board Type')}</Text>
      <View style={{ flexDirection: 'row', marginBottom: 16 }}>
        <TouchableOpacity
          onPress={() => setBoardType('KANBAN')}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 6,
            paddingHorizontal: 12,
            borderRadius: 6,
            borderWidth: 1,
            borderColor:
              boardType === 'KANBAN'
                ? (commonStyles.activeTab.color as string)
                : (commonStyles.card.borderColor as string),
            backgroundColor:
              boardType === 'KANBAN'
                ? (commonStyles.activeTab.backgroundColor as string)
                : 'transparent',
            marginRight: 8,
          }}
        >
          <FaIcon
            name="columns"
            size={13}
            color={
              boardType === 'KANBAN'
                ? (commonStyles.activeTab.color as string)
                : (commonStyles.text.color as string)
            }
            style={{ marginRight: 6 }}
          />
          <Text
            style={{
              fontSize: 13,
              fontWeight: boardType === 'KANBAN' ? 'bold' : 'normal',
              color:
                boardType === 'KANBAN'
                  ? (commonStyles.activeTab.color as string)
                  : (commonStyles.text.color as string),
            }}
          >
            {lang('Kanban')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setBoardType('SCRUM')}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 6,
            paddingHorizontal: 12,
            borderRadius: 6,
            borderWidth: 1,
            borderColor:
              boardType === 'SCRUM' ? '#E67E22' : (commonStyles.card.borderColor as string),
            backgroundColor: boardType === 'SCRUM' ? '#E67E2222' : 'transparent',
          }}
        >
          <FaIcon
            name="trello"
            size={13}
            color={boardType === 'SCRUM' ? '#E67E22' : (commonStyles.text.color as string)}
            style={{ marginRight: 6 }}
          />
          <Text
            style={{
              fontSize: 13,
              fontWeight: boardType === 'SCRUM' ? 'bold' : 'normal',
              color: boardType === 'SCRUM' ? '#E67E22' : (commonStyles.text.color as string),
            }}
          >
            {lang('Scrum')}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={commonStyles.text}>{lang('New note title:')}</Text>

      {newTitle && (
        <Text style={[commonStyles.title, { marginTop: 8, marginBottom: 16 }]}>{newTitle}</Text>
      )}
      <SearchBar
        onPress={setNewTitle}
        addKeyword={false}
        useExtraSearch={false}
        useTextSearch={false}
      />
      <Spacer height={12} />

      {subNotesCount > 0 && (
        <MoveOptionCheckbox
          checked={includeSubNotes}
          onPress={() => setIncludeSubNotes(!includeSubNotes)}
          label={`${lang('Move sub-notes')} (${subNotesCount})`}
        />
      )}

      {backLinksCount > 0 && (
        <MoveOptionCheckbox
          checked={updateBacklinks}
          onPress={() => setUpdateBacklinks(!updateBacklinks)}
          label={`${lang('Update backlinks')} (${backLinksCount})`}
        />
      )}

      {!moveDisabled && <MoveChangedPreview items={previewData} />}
    </MovePageContainer>
  );
};

export default TopicBatchMoveScreen;
