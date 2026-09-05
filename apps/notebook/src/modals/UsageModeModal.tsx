import { useAuthContext } from '@blacktokki/account';
import { useLangContext, useModalsContext, Text } from '@blacktokki/core';
import React, { useEffect, useState } from 'react';
import { View, TextInput, TouchableOpacity, Alert, ScrollView, StyleSheet } from 'react-native';
import MciIcon from 'react-native-vector-icons/MaterialCommunityIcons';

import { useCreateOrUpdateNotebook, useDeleteNotebook } from '../hooks/useNotebookStorage';
import { useNotebookTheme } from '../hooks/useNotebookTheme';
import { usePrivate } from '../hooks/usePrivate';
import { useSetUsageMode } from '../hooks/useUsageMode';
import { NotebookStorageFormSection } from '../screens/main/home/StoragePathSection';
import { getStorageConfig } from '../services/storage';
import { NotebookOption } from '../types';

const OptionButton = (props: { title: string; onPress: () => void; active: boolean }) => {
  const { commonStyles } = useNotebookTheme();
  const color = commonStyles.text.color;
  return (
    <TouchableOpacity
      onPress={props.onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        backgroundColor: props.active ? '#3498DB22' : 'transparent',
        marginRight: 6,
      }}
    >
      <Text
        style={{
          fontSize: 14,
          color: props.active ? '#3498DB' : color,
          fontWeight: props.active ? 'bold' : 'normal',
          textDecorationLine: props.active ? 'underline' : 'none',
        }}
      >
        {props.title}
      </Text>
    </TouchableOpacity>
  );
};

const NotebookForm = ({
  initialNotebook,
  onSuccess,
  onCancel,
  submitLabel,
  showDelete,
}: {
  initialNotebook?: any;
  onSuccess: (createdNotebook?: any) => void;
  onCancel: () => void;
  submitLabel: string;
  showDelete?: boolean;
}) => {
  const { lang } = useLangContext();
  const { auth } = useAuthContext();
  const { commonStyles } = useNotebookTheme();
  const { data: privateConfig } = usePrivate();
  const createNotebook = useCreateOrUpdateNotebook();
  const deleteNotebook = useDeleteNotebook();

  const [title, setTitle] = useState(initialNotebook?.title || '');
  const [description, setDescription] = useState(initialNotebook?.description || '');
  const [type, setType] = useState<NotebookOption['NOTEBOOK_TYPE']>(
    initialNotebook?.option?.NOTEBOOK_TYPE || 'WORKSPACE'
  );
  const [pathName, setPathName] = useState('');
  const [handle, setHandle] = useState<any>(null);
  const [titleError, setTitleError] = useState(false);
  const [storageError, setStorageError] = useState(false);

  const availableNotebookTypes: NotebookOption['NOTEBOOK_TYPE'][] = privateConfig.enabled
    ? ['PRIVATE_NOTE', 'WORKSPACE', 'PRIVATE_WORKSPACE']
    : ['WORKSPACE'];

  useEffect(() => {
    if (initialNotebook) {
      setTitle(initialNotebook.title || '');
      setDescription(initialNotebook.description || '');
      setType(initialNotebook.option?.NOTEBOOK_TYPE || 'WORKSPACE');
      getStorageConfig(initialNotebook.id).then((conf) => {
        setPathName(conf.pathName || `notebook-${initialNotebook.id}`);
        setHandle(conf.handle || null);
      });
    } else {
      setTitle('');
      setDescription('');
      setType('WORKSPACE');
      setPathName('');
      setHandle(null);
    }
    setTitleError(false);
    setStorageError(false);
  }, [initialNotebook]);

  const handleSubmit = async () => {
    let hasErr = false;
    if (!title.trim()) {
      setTitleError(true);
      hasErr = true;
    } else {
      setTitleError(false);
    }
    if (auth.isLocal && !handle) {
      setStorageError(true);
      hasErr = true;
    } else {
      setStorageError(false);
    }
    if (hasErr) return;

    try {
      const res = await createNotebook.mutateAsync({
        id: initialNotebook?.id,
        title,
        description,
        notebookType: type,
        storageConfig: auth.isLocal
          ? {
              pathName,
              handle,
            }
          : undefined,
      });
      onSuccess(res);
    } catch (e: any) {
      Alert.alert(lang('error'), e.message || lang('Failed to save notebook.'));
    }
  };

  const handleDelete = () => {
    if (initialNotebook?.id) {
      deleteNotebook.mutate(initialNotebook.id);
      onSuccess();
    }
  };

  return (
    <View>
      <TextInput
        style={[
          commonStyles.input,
          {
            backgroundColor: 'transparent',
            borderColor: titleError
              ? commonStyles.button.backgroundColor
              : commonStyles.input.borderColor,
            borderWidth: titleError ? 1.5 : commonStyles.input.borderWidth || 1,
          },
        ]}
        placeholder={lang('Enter Notebook Title')}
        placeholderTextColor={
          titleError ? commonStyles.button.backgroundColor : commonStyles.placeholder.color
        }
        value={title}
        onChangeText={(t) => {
          setTitle(t);
          if (t.trim()) setTitleError(false);
        }}
      />
      {titleError && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: 4,
            marginLeft: 4,
          }}
        >
          <MciIcon
            name="alert-circle-outline"
            size={14}
            color={commonStyles.button.backgroundColor}
            style={{ marginRight: 4 }}
          />
          <Text
            style={{
              color: commonStyles.button.backgroundColor,
              fontSize: 12,
              fontWeight: '500',
            }}
          >
            {lang('Please enter a notebook title.')}
          </Text>
        </View>
      )}

      <TextInput
        style={[commonStyles.input, { backgroundColor: 'transparent' }]}
        placeholder={lang('Enter Notebook Description')}
        placeholderTextColor={commonStyles.placeholder.color}
        value={description}
        onChangeText={setDescription}
      />

      {auth.isLocal && (
        <NotebookStorageFormSection
          pathName={pathName}
          setPathName={(s) => {
            setPathName(s);
            if (s) setStorageError(false);
          }}
          setHandle={(h) => {
            setHandle(h);
            if (h) setStorageError(false);
          }}
          hasError={storageError}
        />
      )}

      <Text style={[commonStyles.smallText, { marginBottom: 4 }]}>{lang('Select Sub-mode:')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 }}>
        {availableNotebookTypes.map((t) => (
          <OptionButton key={t} title={lang(t)} active={type === t} onPress={() => setType(t)} />
        ))}
      </View>
      <Text style={[commonStyles.smallText, { marginBottom: 12, color: 'gray' }]}>
        {lang(
          type === 'WORKSPACE' || type === 'PRIVATE_WORKSPACE'
            ? 'An integrated environment with all features including boards.'
            : 'An environment managed by dynamically added notebooks with isolated namespaces.'
        )}
      </Text>

      <View
        style={{
          flexDirection: 'row',
          justifyContent: showDelete ? 'space-between' : 'flex-end',
          alignItems: 'center',
        }}
      >
        {showDelete && (
          <TouchableOpacity onPress={handleDelete} style={{ padding: 8 }}>
            <Text style={{ color: '#d9534f', fontWeight: 'bold' }}>{lang('Delete')}</Text>
          </TouchableOpacity>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={onCancel} style={{ marginRight: 16, padding: 8 }}>
            <Text style={commonStyles.smallText}>{lang('cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSubmit} style={{ padding: 8 }}>
            <Text style={{ color: '#3498DB', fontWeight: 'bold' }}>{lang(submitLabel)}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default function UsageModeModal(props?: { editingNotebook?: any; isAdding?: boolean }) {
  const { lang } = useLangContext();
  const { setModal } = useModalsContext();
  const { commonStyles } = useNotebookTheme();
  const setUsageMode = useSetUsageMode();

  const editingNotebook = props?.editingNotebook || null;
  const isEditing = !!editingNotebook;
  const modalTitle = isEditing ? lang('Edit Notebook Mode') : lang('Add Notebook Mode');

  const closeModal = () => {
    setModal(UsageModeModal, null);
  };

  return (
    <View style={styles.overlay}>
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeModal} />
      <View
        style={[
          styles.container,
          {
            backgroundColor: commonStyles.container.backgroundColor,
            borderColor: commonStyles.card.borderColor,
          },
        ]}
      >
        {/* Modal Header */}
        <View style={styles.header}>
          <Text style={[commonStyles.text, { fontSize: 18, fontWeight: 'bold' }]}>
            {modalTitle}
          </Text>
          <TouchableOpacity onPress={closeModal} style={{ padding: 4 }}>
            <MciIcon name="close" size={22} color={commonStyles.text.color as string} />
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingBottom: 12 }}>
          {isEditing ? (
            /* --- Edit Specific Notebook Form --- */
            <NotebookForm
              initialNotebook={editingNotebook}
              onCancel={closeModal}
              onSuccess={() => {
                closeModal();
              }}
              submitLabel="Edit"
              showDelete
            />
          ) : (
            /* --- Add Notebook Form --- */
            <NotebookForm
              onCancel={closeModal}
              onSuccess={(created) => {
                if (created?.id) {
                  setUsageMode.mutate({ mode: 'NOTEBOOK', notebookId: created.id });
                }
                closeModal();
              }}
              submitLabel="Add"
            />
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 16,
  },
  container: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '100%',
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128,128,128,0.2)',
  },
});
