import { useAuthContext } from '@blacktokki/account';
import { useLangContext, Text, useModalsContext } from '@blacktokki/core';
import React, { useState } from 'react';
import { View, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import MciIcon from 'react-native-vector-icons/MaterialCommunityIcons';

import { useNotebooks } from '../hooks/useNotebookStorage';
import { useNotebookTheme } from '../hooks/useNotebookTheme';
import { usePrivate } from '../hooks/usePrivate';
import { useSetUsageMode, useUsageMode } from '../hooks/useUsageMode';
import UsageModeModal from '../modals/UsageModeModal';
import { Content } from '../types';

export default function HeaderNotebookDropdown() {
  const { lang } = useLangContext();
  const { auth } = useAuthContext();
  const { setModal } = useModalsContext();
  const { commonStyles } = useNotebookTheme();

  const { data: privateConfig } = usePrivate();
  const { usageMode, notebook: currentNotebook } = useUsageMode();
  const setUsageMode = useSetUsageMode();
  const { data: notebooks = [] } = useNotebooks();

  const [isOpen, setIsOpen] = useState(false);

  const currentNotebookId = currentNotebook?.id || 0;

  const visibleNotebooks = privateConfig.enabled
    ? notebooks
    : notebooks.filter((nb) => !nb.option?.NOTEBOOK_TYPE?.includes('PRIVATE'));

  const defaultTitle = auth.isLocal ? 'Blacktokki Notebook - Local' : 'Blacktokki Notebook';
  const isNotebookMode = usageMode === 'NOTEBOOK' && !!currentNotebook?.title;
  const headerTitle = isNotebookMode ? currentNotebook.title : defaultTitle;

  if (usageMode === 'SIMPLE') {
    return (
      <View style={styles.headerTitleContainer}>
        <Text numberOfLines={1} style={[commonStyles.appHeaderTitle, styles.headerText]}>
          {headerTitle}
        </Text>
      </View>
    );
  }

  const handleSelectNotebook = (nb: Content) => {
    setUsageMode.mutate({ mode: 'NOTEBOOK', notebookId: nb.id });
    setIsOpen(false);
  };

  const handleSwitchToNoteMode = () => {
    setUsageMode.mutate({ mode: 'NOTE' });
    setIsOpen(false);
  };

  const handleOpenAddModal = () => {
    setIsOpen(false);
    setModal(UsageModeModal, { isAdding: true });
  };

  const handleOpenEditModal = (nb: Content) => {
    setIsOpen(false);
    setModal(UsageModeModal, { editingNotebook: nb });
  };

  return (
    <View style={styles.container}>
      {/* Header Title Button */}
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setIsOpen(!isOpen)}
        style={styles.headerButton}
      >
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={[commonStyles.appHeaderTitle, styles.headerText]}
        >
          {headerTitle}
        </Text>
        <Icon
          name={isOpen ? 'caret-up' : 'caret-down'}
          size={14}
          color={commonStyles.appHeaderTitle?.color || commonStyles.text.color}
          style={styles.caretIcon}
        />
      </TouchableOpacity>

      {/* Floating Popover Overlay */}
      {isOpen && (
        <>
          <TouchableOpacity
            style={styles.backdrop}
            activeOpacity={1}
            onPress={() => setIsOpen(false)}
          />
          <View style={[commonStyles.resultsContainer, styles.resultsContainer]}>
            {/* Notebook List */}
            <FlatList
              data={visibleNotebooks}
              keyExtractor={(item) => String(item.id)}
              style={styles.list}
              renderItem={({ item }) => {
                const isActive = usageMode === 'NOTEBOOK' && currentNotebookId === item.id;
                return (
                  <View
                    style={[
                      styles.resultItem,
                      isActive && {
                        backgroundColor: commonStyles.activeTab.backgroundColor || '#3498DB15',
                      },
                    ]}
                  >
                    <TouchableOpacity
                      style={styles.itemSelectArea}
                      onPress={() => handleSelectNotebook(item)}
                    >
                      <Icon
                        name="book"
                        size={14}
                        color={isActive ? '#3498DB' : commonStyles.text.color}
                        style={styles.itemIcon}
                      />
                      <Text
                        numberOfLines={1}
                        ellipsizeMode="tail"
                        style={[
                          commonStyles.text,
                          styles.resultText,
                          isActive && {
                            color: '#3498DB',
                            fontWeight: 'bold',
                          },
                        ]}
                      >
                        {item.title}
                      </Text>
                    </TouchableOpacity>

                    <View style={styles.itemRight}>
                      {isActive && (
                        <Icon name="check" size={13} color="#3498DB" style={{ marginRight: 6 }} />
                      )}
                      <TouchableOpacity
                        style={styles.editButton}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        onPress={() => handleOpenEditModal(item)}
                      >
                        <Icon name="ellipsis-v" size={14} color={commonStyles.text.color} />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              }}
              ItemSeparatorComponent={() => <View style={[commonStyles.resultSeparator]} />}
            />

            <View style={[commonStyles.resultSeparator]} />

            <View style={styles.actionContainer}>
              {/* Add Notebook Mode Button */}
              <TouchableOpacity style={styles.actionItem} onPress={handleOpenAddModal}>
                <View style={styles.itemLeft}>
                  <MciIcon name="plus" size={17} color="#3498DB" style={styles.itemIcon} />
                  <Text
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    style={[
                      commonStyles.text,
                      styles.resultText,
                      { color: '#3498DB', fontWeight: '500' },
                    ]}
                  >
                    {lang('Add Notebook Mode')}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Switch to Note Mode Button (Below Add Notebook Mode) */}
              {usageMode === 'NOTEBOOK' && (
                <TouchableOpacity style={styles.actionItem} onPress={handleSwitchToNoteMode}>
                  <View style={styles.itemLeft}>
                    <MciIcon
                      name="chevron-left"
                      size={17}
                      color="#3498DB"
                      style={styles.itemIcon}
                    />
                    <Text
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      style={[
                        commonStyles.text,
                        styles.resultText,
                        { color: '#3498DB', fontWeight: '500' },
                      ]}
                    >
                      {lang('Switch to Note Mode')}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    zIndex: 1000,
  },
  headerTitleContainer: {
    justifyContent: 'center',
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  headerText: {
    fontSize: 18,
    fontWeight: 'bold',
    maxWidth: 260,
  },
  caretIcon: {
    marginLeft: 6,
    top: 1,
  },
  backdrop: {
    position: 'absolute',
    top: -100,
    left: -1000,
    right: -1000,
    bottom: -1000,
    zIndex: 999,
  },
  resultsContainer: {
    position: 'absolute',
    top: 36,
    left: 0,
    minWidth: 260,
    maxWidth: 340,
    maxHeight: 420,
    zIndex: 1000,
    elevation: 6,
  },
  list: {
    maxHeight: 260,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 12,
    paddingRight: 6,
  },
  itemSelectArea: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingVertical: 10,
    marginRight: 4,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  itemIcon: {
    width: 20,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultText: {
    fontSize: 14,
    flexShrink: 1,
  },
  itemRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  editButton: {
    padding: 8,
    borderRadius: 4,
  },
  actionContainer: {
    paddingVertical: 4,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
});
