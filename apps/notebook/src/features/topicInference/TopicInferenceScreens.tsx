import { Text, useLangContext } from '@blacktokki/core';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Button, Checkbox } from 'react-native-paper';

import { emptyTopicPreferences, normalizeTopicText } from './inferTopics';
import { InferredTopic, TopicMember } from './types';
import { useTopicInference } from './useTopicInference';
import LoadingView from '../../components/LoadingView';
import { ResponsiveSearchBar, toNoteParams } from '../../components/SearchBar';
import UsageButton from '../../components/UsageButton';
import { useEffectExtensionScreen } from '../../hooks/useExtension';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';
import { NavigationParamList } from '../../types';

const toggle = (values: string[], id: string) =>
  values.includes(id) ? values.filter((value) => value !== id) : [...values, id];

export function TopicInferenceScreens() {
  const { isActive } = useEffectExtensionScreen('topicInference');
  const isFocused = useIsFocused();
  const data = useTopicInference(isFocused && isActive);
  const { commonStyles } = useNotebookTheme();
  const { lang } = useLangContext();
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [label, setLabel] = useState('');
  const [showUnclassified, setShowUnclassified] = useState(false);
  const topic = data.topics.find((candidate) => candidate.id === selectedId);
  const saving = data.updatePreferences.isLoading;
  useEffect(() => {
    setSelectedId(null);
    setSelectedTopics([]);
    setSelectedMembers([]);
    setExpanded([]);
    setQuery('');
    setShowUnclassified(false);
  }, [data.scope]);
  useEffect(() => {
    setLabel(topic?.label || '');
    setSelectedMembers([]);
    setExpanded([]);
  }, [topic?.id]);
  const deferredQuery = useDeferredValue(query);
  const topics = useMemo(() => {
    const value = normalizeTopicText(deferredQuery);
    if (!value) return data.topics;
    return data.topics.filter(
      (item) =>
        item.searchText.includes(value) ||
        item.members.some((member) => member.searchText.includes(value))
    );
  }, [deferredQuery, data.topics]);

  const createCollection = (memberIds: string[], sourceIds: string[]) => {
    data.updatePreferences.mutate((current) => ({
      ...current,
      hidden: [
        ...new Set([...current.hidden, ...sourceIds.filter((id) => !id.startsWith('collection:'))]),
      ],
      collections: [
        ...current.collections.filter((item) => !sourceIds.includes(item.id)),
        {
          id: `collection:${Date.now()}:${Math.random().toString(16).slice(2)}`,
          label:
            label.trim() ||
            topic?.label ||
            data.topics.find((item) => sourceIds.includes(item.id))?.label ||
            lang('Topic Explorer'),
          memberIds: [...new Set(memberIds)],
        },
      ],
    }));
    setSelectedId(null);
    setSelectedTopics([]);
    setSelectedMembers([]);
  };

  const renderMember = ({ item: member }: { item: TopicMember }) => {
    const evidence =
      topic?.evidence.filter((item) => item.source === member.id || item.target === member.id) ||
      [];
    const occurrences = expanded.includes(member.id)
      ? member.occurrences
      : member.occurrences.slice(0, 1);
    return (
      <View style={commonStyles.card}>
        <View style={styles.row}>
          {topic && (
            <Checkbox
              status={selectedMembers.includes(member.id) ? 'checked' : 'unchecked'}
              onPress={() => setSelectedMembers((current) => toggle(current, member.id))}
              disabled={saving}
            />
          )}
          <Text style={[commonStyles.title, styles.grow]}>
            {member.heading || member.text.slice(0, 72)}
          </Text>
        </View>
        <Text style={commonStyles.text}>
          {member.text.slice(0, 480)}
          {member.text.length > 480 ? '…' : ''}
        </Text>
        {evidence.slice(0, 3).map((item) => (
          <View key={`${item.source}:${item.target}`} style={styles.evidence}>
            <Text style={commonStyles.smallText}>
              {lang('Matching fragments')}: {item.fragments.join(' · ')}
            </Text>
            {!!item.contextFragments?.length && (
              <Text style={commonStyles.smallText}>
                {lang('Matching surrounding content')}: {item.contextFragments.join(' · ')}
              </Text>
            )}
            {item.references.length > 0 && (
              <Text style={commonStyles.smallText}>
                {lang('Reference supports matching content')}
              </Text>
            )}
          </View>
        ))}
        {!evidence.length &&
          topic?.kind === 'INFERRED' &&
          new Set(member.occurrences.map((occurrence) => occurrence.contentId)).size >= 2 && (
            <Text style={commonStyles.smallText}>
              {lang('Repeated content in independent documents')}
            </Text>
          )}
        {occurrences.map((occurrence) => (
          <TouchableOpacity
            key={`${occurrence.documentId}:${occurrence.sectionId}`}
            accessibilityRole="link"
            onPress={() =>
              navigation.push(
                'NotePage',
                toNoteParams(occurrence.title, occurrence.paragraph, occurrence.section)
              )
            }
            style={styles.location}
          >
            <Text style={[commonStyles.text, styles.sourceLink]}>
              {occurrence.title}
              {occurrence.paragraph ? ` › ${occurrence.paragraph}` : ''}
            </Text>
          </TouchableOpacity>
        ))}
        {member.occurrences.length > 1 && (
          <Button onPress={() => setExpanded((current) => toggle(current, member.id))}>
            {lang('Original locations')} ({member.occurrences.length})
          </Button>
        )}
        {topic && (
          <Button
            disabled={saving}
            onPress={() =>
              data.updatePreferences.mutate((current) => ({
                ...current,
                excluded: {
                  ...current.excluded,
                  [topic.id]: [...(current.excluded[topic.id] || []), member.id],
                },
              }))
            }
          >
            {lang('Exclude from this topic')}
          </Button>
        )}
      </View>
    );
  };

  const renderTopic = ({ item }: { item: InferredTopic }) => (
    <View style={[commonStyles.card, styles.row]}>
      <Checkbox
        status={selectedTopics.includes(item.id) ? 'checked' : 'unchecked'}
        onPress={() => setSelectedTopics((current) => toggle(current, item.id))}
        disabled={saving}
      />
      <TouchableOpacity
        style={styles.grow}
        onPress={() => {
          setSelectedId(item.id);
          setShowUnclassified(false);
        }}
      >
        <Text style={commonStyles.title} numberOfLines={item.nameFragments ? undefined : 2}>
          {item.label}
        </Text>
        {!!item.example && (
          <Text style={commonStyles.smallText}>
            {lang('Content example')}: {item.example.text}
          </Text>
        )}
        <Text style={commonStyles.smallText}>
          {lang(item.kind === 'CURATED' ? 'User collection' : 'Inferred topic')} ·{' '}
          {item.members.length} {lang('Content blocks')} · {item.documentCount}{' '}
          {lang('Distinct contents')}
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <ResponsiveSearchBar />
      <UsageButton paragraph={lang('Topic Explorer')} />
      <View style={[commonStyles.container, styles.content]}>
        <Text style={commonStyles.title}>{lang('Topic Explorer')}</Text>
        <Text style={commonStyles.smallText}>
          {lang(
            'Topics require recurring, distinctive body evidence. Weaker matches remain unclassified. Open a topic to review its evidence.'
          )}
        </Text>
        <Text style={commonStyles.smallText}>
          {lang(
            'Repeated names use shared body phrases or a content example to distinguish their context.'
          )}
        </Text>
        <Text style={commonStyles.smallText}>
          {data.documentCount} {lang('Documents')} · {data.distinctContentCount}{' '}
          {lang('Distinct contents')} · {data.topics.length} {lang('Topics')}
        </Text>
        {data.error && (
          <Text style={commonStyles.text}>
            {lang('Topic inference failed')}: {data.error}
          </Text>
        )}
        {data.updatePreferences.isError && (
          <Text style={commonStyles.text}>{lang('Unable to save topic changes')}</Text>
        )}
        {data.isRefreshing && !data.isLoading && (
          <Text style={commonStyles.smallText}>{lang('Updating topics')}</Text>
        )}
        {data.isLoading ? (
          <LoadingView />
        ) : topic || showUnclassified ? (
          <>
            <Button
              onPress={() => {
                setSelectedId(null);
                setShowUnclassified(false);
              }}
            >
              {lang('Back to topics')}
            </Button>
            {topic ? (
              <>
                {!!topic.example && (
                  <Text style={commonStyles.smallText}>
                    {lang('Content example')}: {topic.example.text}
                  </Text>
                )}
                <TextInput
                  accessibilityLabel={lang('Topic name')}
                  style={commonStyles.input}
                  value={label}
                  onChangeText={setLabel}
                />
                <View style={styles.actions}>
                  <Button
                    disabled={saving || !label.trim()}
                    onPress={() =>
                      data.updatePreferences.mutate((current) => ({
                        ...current,
                        labels: { ...current.labels, [topic.id]: label.trim() },
                      }))
                    }
                  >
                    {lang('Rename topic')}
                  </Button>
                  <Button
                    disabled={
                      saving ||
                      !selectedMembers.length ||
                      selectedMembers.length === topic.members.length
                    }
                    onPress={() => {
                      data.updatePreferences.mutate((current) => ({
                        ...current,
                        excluded: {
                          ...current.excluded,
                          [topic.id]: [...(current.excluded[topic.id] || []), ...selectedMembers],
                        },
                        collections: [
                          ...current.collections,
                          {
                            id: `collection:${Date.now()}`,
                            label: label.trim() || topic.label,
                            memberIds: selectedMembers,
                          },
                        ],
                      }));
                      setSelectedMembers([]);
                    }}
                  >
                    {lang('Split selected blocks')}
                  </Button>
                  <Button
                    disabled={saving}
                    onPress={() => {
                      data.updatePreferences.mutate((current) => ({
                        ...current,
                        hidden: [...current.hidden, topic.id],
                        collections: current.collections.filter((item) => item.id !== topic.id),
                      }));
                      setSelectedId(null);
                    }}
                  >
                    {lang('Hide topic')}
                  </Button>
                </View>
              </>
            ) : (
              <Text style={commonStyles.title}>{lang('Unclassified content')}</Text>
            )}
            <FlatList
              data={topic?.members || data.unclassified}
              renderItem={renderMember}
              keyExtractor={(item) => item.id}
              initialNumToRender={8}
              maxToRenderPerBatch={8}
              windowSize={5}
            />
          </>
        ) : (
          <>
            <TextInput
              accessibilityLabel={lang('Filter topics')}
              placeholder={lang('Filter topics')}
              value={query}
              onChangeText={setQuery}
              style={commonStyles.input}
            />
            <View style={styles.actions}>
              <Button
                disabled={saving || selectedTopics.length < 2}
                onPress={() => {
                  const members = data.topics
                    .filter((item) => selectedTopics.includes(item.id))
                    .flatMap((item) => item.members.map((member) => member.id));
                  createCollection(members, selectedTopics);
                }}
              >
                {lang('Merge selected topics')}
              </Button>
              <Button onPress={() => setShowUnclassified(true)}>
                {lang('Unclassified content')} ({data.unclassified.length})
              </Button>
              <Button
                disabled={saving}
                onPress={() => data.updatePreferences.mutate(() => emptyTopicPreferences())}
              >
                {lang('Reset topic changes')}
              </Button>
            </View>
            <FlatList
              data={topics}
              renderItem={renderTopic}
              keyExtractor={(item) => item.id}
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              windowSize={5}
              ListEmptyComponent={
                <Text style={commonStyles.text}>
                  {lang('No supported topics were found. Unclassified content remains available.')}
                </Text>
              }
            />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingTop: 12 },
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap' },
  evidence: { marginTop: 8 },
  location: { paddingVertical: 8 },
  sourceLink: { textDecorationLine: 'underline' },
});
