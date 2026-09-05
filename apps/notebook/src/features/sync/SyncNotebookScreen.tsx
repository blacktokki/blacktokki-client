import { useLangContext } from '@blacktokki/core';
import { useNavigation } from '@react-navigation/native';
import React, { useMemo } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

import { useExecuteSync, useNotebookSync, useSyncOptions } from './useNotebookSync';
import { ChangedItem } from '../../components/ChangedBlock';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';
import { useUsageMode } from '../../hooks/useUsageMode';
import {
  MoveActionButtons,
  MoveChangedPreview,
  MoveOptionCheckbox,
  MovePageContainer,
} from '../../screens/main/MovePageScreen';

export const SyncNotebookScreen: React.FC = () => {
  const navigation = useNavigation();
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const { notebook } = useUsageMode();
  const { options, setOptions } = useSyncOptions();

  const {
    isSyncAvailable,
    isLoading,
    isFetching,
    matchedLocalNotebook,
    isLocalNotebookMissing,
    diffItems,
    manualRefresh,
  } = useNotebookSync();

  const executeSync = useExecuteSync();

  // 로컬 계정 / 내 계정 노트북 이름
  const localNotebookName = matchedLocalNotebook?.title || notebook?.title || lang('Local Account');
  const accountNotebookName = notebook?.title || lang('My Account');

  // 항상 스마트 동기화 (보드는 항상 포함):
  // - LOCAL_ONLY -> LOCAL_TO_REMOTE
  // - REMOTE_ONLY -> REMOTE_TO_LOCAL
  // - MODIFIED -> 최신 수정본 우선
  const resolvedItems = useMemo(() => {
    return diffItems.map((item) => {
      let action: 'LOCAL_TO_REMOTE' | 'REMOTE_TO_LOCAL';
      if (item.status === 'LOCAL_ONLY') {
        action = 'LOCAL_TO_REMOTE';
      } else if (item.status === 'REMOTE_ONLY') {
        action = 'REMOTE_TO_LOCAL';
      } else {
        const localTime = new Date(item.localContent?.lastModified || 0).getTime();
        const remoteTime = new Date(item.remoteContent?.updated || 0).getTime();
        action = localTime > remoteTime ? 'LOCAL_TO_REMOTE' : 'REMOTE_TO_LOCAL';
      }
      return { ...item, action };
    });
  }, [diffItems]);

  // MoveChangedPreview에 전달할 ChangedItem[] 생성 (보드는 미리보기에 미노출, 반영은 수행)
  const previewData = useMemo(() => {
    const data: ChangedItem[] = [];

    for (const item of resolvedItems) {
      if (item.type !== 'NOTE') continue;

      const isLocalToRemote = item.action === 'LOCAL_TO_REMOTE';
      const sourceName = isLocalToRemote
        ? `${lang('Local Account')}: ${localNotebookName}`
        : `${lang('My Account')}: ${accountNotebookName}`;
      const targetName = isLocalToRemote
        ? `${lang('My Account')}: ${accountNotebookName}`
        : `${lang('Local Account')}: ${localNotebookName}`;

      if (item.status === 'MODIFIED') {
        const sourceDesc = isLocalToRemote
          ? item.localContent?.description || ''
          : item.remoteContent?.description || '';
        const targetDesc = isLocalToRemote
          ? item.remoteContent?.description || ''
          : item.localContent?.description || '';

        data.push({
          renderType: 'diff',
          fetchType: 'part',
          title: item.title,
          description: targetDesc,
          newDescription: sourceDesc,
          oldNotebookName: sourceName,
          newNotebookName: targetName,
        });
      } else {
        const desc = isLocalToRemote
          ? item.localContent?.description || ''
          : item.remoteContent?.description || '';

        data.push({
          renderType: 'plain',
          fetchType: 'move',
          title: item.title,
          newTitle: item.title,
          newDescription: desc,
          oldNotebookName: sourceName,
          newNotebookName: targetName,
        });
      }
    }

    return data;
  }, [resolvedItems, localNotebookName, accountNotebookName, lang]);

  const anyExists = useMemo(
    () => previewData.some((item) => item.renderType === 'diff' || item.renderType === 'override'),
    [previewData]
  );

  const handleSync = async () => {
    if (resolvedItems.length === 0) {
      Alert.alert(lang('error'), lang('No items selected for sync.'));
      return;
    }

    try {
      await executeSync.mutateAsync({
        diffItems: resolvedItems,
        matchedLocalNotebook,
      });
      Alert.alert(lang('Saved'), lang('Sync completed successfully.'), [
        {
          text: lang('back'),
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (error: any) {
      Alert.alert(lang('error'), error.message || lang('Failed to sync.'));
    }
  };

  const handleCancel = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  const syncDisabled = resolvedItems.length === 0 || executeSync.isLoading || isLoading;

  if (!isSyncAvailable) {
    return (
      <MovePageContainer>
        <Text style={commonStyles.text}>
          {lang('Notebook sync is only available in account notebook mode.')}
        </Text>
      </MovePageContainer>
    );
  }

  return (
    <MovePageContainer
      actionButtons={
        <MoveActionButtons
          onCancel={handleCancel}
          onSubmit={handleSync}
          submitLabel={lang(anyExists ? 'overwrite' : 'save')}
          disabled={syncDisabled}
          isDanger={anyExists}
          isLoading={executeSync.isLoading}
        />
      }
    >
      {/* 현재 노트북 & 새로고침 */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={commonStyles.text}>{lang('Current Notebook & Note')}</Text>
        <TouchableOpacity
          onPress={() => manualRefresh()}
          disabled={isFetching}
          style={{ padding: 4 }}
        >
          {isFetching ? (
            <ActivityIndicator size="small" color={commonStyles.text.color} />
          ) : (
            <Icon name="refresh" size={16} color={commonStyles.text.color} />
          )}
        </TouchableOpacity>
      </View>

      <Text style={[commonStyles.title, { marginTop: 8, marginBottom: 16 }]}>
        <Text style={{ fontSize: 14, color: 'gray' }}>[{accountNotebookName}] </Text>
        {notebook?.title}
      </Text>

      {/* 로컬 노트북 부재 시 자동 생성 안내 */}
      {isLocalNotebookMissing && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: '#FEF9E7',
            padding: 10,
            borderRadius: 6,
            marginBottom: 16,
          }}
        >
          <Icon name="info-circle" size={16} color="#E67E22" style={{ marginRight: 8 }} />
          <Text style={{ fontSize: 13, color: '#E67E22', flex: 1 }}>
            {lang('Local notebook does not exist. It will be created automatically upon sync.')}
          </Text>
        </View>
      )}

      {/* 옵션 체크박스 (MoveOptionCheckbox 공통 컴포넌트 재사용) */}
      <MoveOptionCheckbox
        checked={options.autoCheckOnFocus}
        onPress={() => setOptions({ ...options, autoCheckOnFocus: !options.autoCheckOnFocus })}
        label={lang('Check on Focus')}
      />

      <MoveOptionCheckbox
        checked={options.autoCheckOnSave}
        onPress={() => setOptions({ ...options, autoCheckOnSave: !options.autoCheckOnSave })}
        label={lang('Check on Save')}
      />

      {/* 로딩 인디케이터 */}
      {isLoading && (
        <View style={{ padding: 24, alignItems: 'center' }}>
          <ActivityIndicator size="small" color={commonStyles.text.color} />
          <Text style={[commonStyles.smallText, { marginTop: 8 }]}>
            {lang('Comparing local and account contents...')}
          </Text>
        </View>
      )}

      {/* 변경 항목 프리뷰 (MoveChangedPreview 공통 컴포넌트 재사용) */}
      {!isLoading && (
        <MoveChangedPreview
          items={previewData}
          emptyMessage={lang('All notes and boards are in sync.')}
        />
      )}
    </MovePageContainer>
  );
};

export default SyncNotebookScreen;
