import { useLangContext } from '@blacktokki/core';
import React, { useEffect, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import MciIcon from 'react-native-vector-icons/MaterialCommunityIcons';

import { updatedFormat } from './ContentGroupSection';
import { useNotebookTheme } from '../../../hooks/useNotebookTheme';
import { getStorageConfig, getStorageStats, StorageConfig } from '../../../services/storage';

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const NotebookPathBadge = ({ nbId, updated }: { nbId: number; updated?: string }) => {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const [config, setConfig] = useState<StorageConfig | null>(null);
  const [stats, setStats] = useState<{
    count: number;
    totalSize: number;
    lastModified: number;
  } | null>(null);

  useEffect(() => {
    getStorageConfig(nbId).then(setConfig);
    getStorageStats(nbId).then(setStats);
  }, [nbId, updated]);

  if (!config || !config.pathName) return null;

  const countText = stats ? `${stats.count}${lang(' items')}` : '';
  const sizeText = stats ? formatSize(stats.totalSize) : '';
  const timeStr =
    stats && stats.lastModified ? new Date(stats.lastModified).toISOString() : updated;
  const timeText = timeStr ? updatedFormat(timeStr) : '';

  const details = [countText, sizeText, timeText].filter(Boolean).join(' · ');

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 26, marginTop: 2 }}>
      <MciIcon
        name="folder-outline"
        size={13}
        color={commonStyles.smallText.color}
        style={{ marginRight: 4 }}
      />
      <Text style={[commonStyles.smallText, { fontSize: 12 }]} numberOfLines={1}>
        {config.pathName}
        {details ? ` (${details})` : ''}
      </Text>
    </View>
  );
};

export const NotebookStorageFormSection = ({
  pathName,
  setPathName,
  setHandle,
  hasError,
}: {
  pathName: string;
  setPathName: (s: string) => void;
  setHandle: (h: any) => void;
  hasError?: boolean;
}) => {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();

  const handlePickLocal = async () => {
    if (!(window as any).showDirectoryPicker) {
      Alert.alert(
        lang('error'),
        lang('PC folder direct integration is not supported in this browser.')
      );
      return;
    }
    try {
      const dirHandle = await (window as any).showDirectoryPicker();
      setHandle(dirHandle);
      setPathName(dirHandle.name);
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        Alert.alert(lang('error'), e.message || lang('Failed to select folder.'));
      }
    }
  };

  return (
    <View style={{ marginBottom: hasError ? 4 : 12 }}>
      <TouchableOpacity
        onPress={handlePickLocal}
        style={[
          commonStyles.input,
          {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'transparent',
            paddingVertical: 10,
            borderColor: hasError
              ? commonStyles.button.backgroundColor
              : commonStyles.input.borderColor,
            borderWidth: hasError ? 1.5 : commonStyles.input.borderWidth || 1,
          },
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
          <MciIcon
            name="folder-outline"
            size={18}
            color={
              hasError
                ? commonStyles.button.backgroundColor
                : pathName
                ? commonStyles.button.backgroundColor
                : commonStyles.placeholder.color
            }
            style={{ marginRight: 8 }}
          />
          <Text
            style={[
              commonStyles.text,
              {
                color: hasError
                  ? commonStyles.button.backgroundColor
                  : pathName
                  ? commonStyles.text.color
                  : commonStyles.placeholder.color,
              },
            ]}
            numberOfLines={1}
          >
            {pathName || lang('Select Local Storage Folder (Required):')}
          </Text>
        </View>
        <Text
          style={{
            color: commonStyles.button.backgroundColor,
            fontSize: 12,
            fontWeight: '500',
          }}
        >
          {lang(pathName ? 'Change' : 'Select')}
        </Text>
      </TouchableOpacity>
      {hasError && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, marginLeft: 4 }}>
          <MciIcon
            name="alert-circle-outline"
            size={14}
            color={commonStyles.button.backgroundColor}
            style={{ marginRight: 4 }}
          />
          <Text
            style={{ color: commonStyles.button.backgroundColor, fontSize: 12, fontWeight: '500' }}
          >
            {lang('Please select a local folder on your computer to save.')}
          </Text>
        </View>
      )}
    </View>
  );
};
