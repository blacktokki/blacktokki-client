import { Text, useLangContext } from '@blacktokki/core';
import React, { useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

import { useNotebookTheme } from '../../../hooks/useNotebookTheme';
import { useUsageMode } from '../../../hooks/useUsageMode';
import type { KnowledgeGraphNode } from '../types';
import { getKnowledgeGraphNodeKind, getKnowledgeGraphNodeKindLabel } from '../utils/relations';

const normalize = (value: string) =>
  value.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();

/** Search names within the nodes currently displayed by the graph's view options. */
export function KnowledgeGraphSearch({
  nodes,
  maxHeight,
  onSelectNode,
}: {
  nodes: KnowledgeGraphNode[];
  maxHeight: number;
  onSelectNode: (node: KnowledgeGraphNode) => void;
}) {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const { usageMode } = useUsageMode();
  const input = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const index = useMemo(
    () =>
      nodes.map((node) => ({
        node,
        name: normalize(node.name),
      })),
    [nodes]
  );
  const search = normalize(query);
  const results = useMemo(() => {
    if (!search) return [];
    const terms = search.split(' ');
    const rank = (name: string) =>
      name === search ? 0 : name.startsWith(search) ? 1 : name.includes(search) ? 2 : 3;
    return index
      .filter((item) => terms.every((term) => item.name.includes(term)))
      .sort(
        (left, right) =>
          rank(left.name) - rank(right.name) ||
          left.node.name.localeCompare(right.node.name) ||
          left.node.id.localeCompare(right.node.id)
      );
  }, [index, search]);
  const select = (node: KnowledgeGraphNode) => {
    setQuery(node.name);
    setOpen(false);
    input.current?.blur();
    onSelectNode(node);
  };
  return (
    <View style={styles.container}>
      <View style={styles.inputRow}>
        <Icon name="search" size={11} color={commonStyles.smallText?.color} />
        <TextInput
          ref={input}
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onSubmitEditing={() => {
            if (results[0]) select(results[0].node);
          }}
          onKeyPress={(event) => {
            if (event.nativeEvent.key === 'Escape') setOpen(false);
          }}
          placeholder={lang('Search')}
          placeholderTextColor={commonStyles.smallText?.color}
          accessibilityLabel={lang('Search')}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          style={[commonStyles.text, styles.input]}
        />
        {!!query && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={lang('Clear')}
            style={styles.clear}
            onPress={() => {
              setQuery('');
              setOpen(false);
            }}
          >
            <Icon name="times" size={12} color={commonStyles.smallText?.color} />
          </Pressable>
        )}
      </View>
      {open && !!search && (
        <View style={[commonStyles.resultsContainer, styles.results]}>
          <Text style={[commonStyles.smallText, styles.summary]}>
            {lang('Search Results')} ({results.length})
          </Text>
          <FlatList
            data={results}
            keyExtractor={(item) => item.node.id}
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight }}
            initialNumToRender={8}
            ListEmptyComponent={
              <Text style={[commonStyles.smallText, styles.empty]}>{lang('None')}</Text>
            }
            renderItem={({ item: { node } }) => {
              const kind = getKnowledgeGraphNodeKind(node);
              const context = [
                getKnowledgeGraphNodeKindLabel(kind, lang, usageMode),
                (kind === 'paragraph' || kind === 'connectedParagraph') &&
                  (node.noteTitle || node.paragraph?.origin),
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={node.name + ' · ' + context}
                  style={styles.result}
                  onPress={() => select(node)}
                >
                  <View style={styles.resultText}>
                    <Text style={[commonStyles.text, styles.name]} numberOfLines={2}>
                      {node.name}
                    </Text>
                    <Text style={[commonStyles.smallText, styles.context]} numberOfLines={2}>
                      {context}
                    </Text>
                  </View>
                  <Icon name="chevron-right" size={10} color={commonStyles.smallText?.color} />
                </Pressable>
              );
            }}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignSelf: 'stretch', position: 'relative', zIndex: 2 },
  inputRow: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 10,
    paddingRight: 4,
  },
  input: { flex: 1, minWidth: 0, fontSize: 11, lineHeight: 14, paddingVertical: 5 },
  clear: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  results: {
    position: 'absolute',
    top: '100%',
    marginTop: 4,
    left: 0,
    right: 0,
    borderRadius: 10,
    overflow: 'hidden',
    elevation: 8,
  },
  summary: { paddingHorizontal: 12, paddingVertical: 8, fontSize: 11 },
  empty: { padding: 12, fontSize: 12 },
  result: { padding: 12, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  resultText: { flex: 1, minWidth: 0, gap: 3 },
  name: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  context: { fontSize: 11, lineHeight: 16 },
});
