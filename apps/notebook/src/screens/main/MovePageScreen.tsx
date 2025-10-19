import { useColorScheme, useLangContext } from '@blacktokki/core';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Alert, StyleSheet } from 'react-native';

import { useMovePage, useNotePage, useNotePages } from '../../hooks/useNoteStorage';
import { createCommonStyles } from '../../styles';
import { NavigationParamList } from '../../types';

type MovePageScreenRouteProp = RouteProp<NavigationParamList, 'MovePage'>;

export const MovePageScreen: React.FC = () => {
  const route = useRoute<MovePageScreenRouteProp>();
  const { title } = route.params;
  const [newTitle, setNewTitle] = useState('');
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const theme = useColorScheme();
  const { lang } = useLangContext();
  const { data: page, isLoading } = useNotePage(title);
  const { data: pages } = useNotePages();
  const commonStyles = createCommonStyles(theme);

  const mutation = useMovePage();

  const handleMove = () => {
    mutation.mutate(
      {
        oldTitle: title,
        newTitle: newTitle.trim(),
        description: exists ? page?.description : undefined,
      },
      {
        onSuccess: (data) => {
          navigation.reset({
            index: 1,
            routes: [{ name: 'Home' }, { name: 'NotePage', params: { title: data.newTitle } }],
          });
        },
        onError: (error: any) => {
          Alert.alert(lang('error'), error.message || lang('An error occurred while moving note.'));
        },
      }
    );
  };
  const handleCancel = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('NotePage', { title });
    }
  };

  useEffect(() => {
    if (!isLoading && !page) {
      handleCancel();
    }
  }, [page, isLoading]);

  const exists = pages?.find((v) => newTitle.trim() === v.title.trim());
  const active = newTitle.trim() && newTitle.trim() !== title.trim();

  return (
    <View style={commonStyles.container}>
      <View style={commonStyles.card}>
        <Text style={commonStyles.text}>{lang('Current note title:')}</Text>
        <Text style={[commonStyles.title, { marginTop: 8, marginBottom: 16 }]}>{title}</Text>

        <Text style={commonStyles.text}>{lang('New note title:')}</Text>
        <TextInput
          style={[commonStyles.input, { marginTop: 8 }]}
          value={newTitle}
          onChangeText={setNewTitle}
          placeholder={lang('Enter a new note title')}
          placeholderTextColor={theme === 'dark' ? '#777777' : '#999999'}
        />

        {exists && (
          <Text style={[commonStyles.smallText, { marginBottom: 16 }]}>
            {lang('This note title already exists.')}
          </Text>
        )}

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[commonStyles.button, styles.cancelButton]}
            onPress={handleCancel}
          >
            <Text style={commonStyles.buttonText}>{lang('cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              commonStyles.button,
              styles.moveButton,
              active ? {} : { backgroundColor: styles.cancelButton.backgroundColor },
              exists ? { backgroundColor: '#d9534f' } : {},
            ]}
            onPress={handleMove}
            disabled={!active}
          >
            <Text style={commonStyles.buttonText}>{lang(exists ? 'overwrite' : 'move')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  backButton: {
    padding: 8,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cancelButton: {
    flex: 1,
    marginRight: 8,
    backgroundColor: '#95A5A6',
  },
  moveButton: {
    flex: 1,
    marginLeft: 8,
  },
});
