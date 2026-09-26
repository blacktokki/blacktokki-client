import { Text, useLangContext, useModalsContext } from '@blacktokki/core';
import { EditorViewer, toHtml } from '@blacktokki/editor';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

import LoadingView from '../components/LoadingView';
import { onLink, urlToNoteLink } from '../components/SearchBar';
import { useOntologyData } from '../features/knowledgeGraph/useOntologyData';
import { normalizeTitle } from '../features/knowledgeGraph/utils/titleKeywordClasses';
import {
  findMatchingPhysicalNote,
  extractTopicKeyword,
  synthesizeTopicVirtualNote,
  topicNodeIdFromUrl,
} from '../features/knowledgeGraph/utils/virtualNotes';
import { useCreateOrUpdatePage, useNotePages } from '../hooks/useNoteStorage';
import { useNotebookTheme } from '../hooks/useNotebookTheme';
import { NavigationParamList } from '../types';

interface OntologyVirtualNoteModalProps {
  topicNodeId: string;
  navigation: StackNavigationProp<NavigationParamList>;
}

export default function OntologyVirtualNoteModal({
  topicNodeId,
  navigation,
}: OntologyVirtualNoteModalProps) {
  const { setModal } = useModalsContext();
  const { lang } = useLangContext();
  const { commonStyles, colorScheme } = useNotebookTheme();
  const { nodes, edges, isLoading } = useOntologyData();
  const { data: notePages = [], isLoading: isNoteLoading } = useNotePages();
  const createOrUpdatePage = useCreateOrUpdatePage();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [copied, setCopied] = useState(false);
  const isDark = colorScheme === 'dark';
  const modalBg = isDark ? '#1E222B' : '#FFFFFF';
  const borderColor = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.1)';
  const statBg = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)';

  const topicNode = useMemo(
    () =>
      nodes.find(
        (node) => node.id === topicNodeId && node.role === 'CLASS' && node.classCategory === 'TOPIC'
      ),
    [nodes, topicNodeId]
  );
  const matchingPageTitle = useMemo(() => {
    if (!topicNode) return undefined;
    const keyword = normalizeTitle(extractTopicKeyword(topicNode));
    return notePages.find((page) => normalizeTitle(page.title) === keyword)?.title;
  }, [topicNode, notePages]);
  const virtualNote = useMemo(
    () =>
      topicNode
        ? synthesizeTopicVirtualNote(topicNode, nodes, edges, lang, matchingPageTitle)
        : undefined,
    [topicNode, nodes, edges, lang, matchingPageTitle]
  );
  const matchingNode = virtualNote
    ? findMatchingPhysicalNote(virtualNote.topicKeyword, nodes)
    : undefined;
  const matchingNoteTitle = matchingPageTitle || matchingNode?.noteTitle || matchingNode?.name;

  const htmlContent = useMemo(() => {
    if (!virtualNote?.content) return '';
    try {
      return toHtml(virtualNote.content);
    } catch {
      return '';
    }
  }, [virtualNote?.content]);

  const close = useCallback(() => setModal(OntologyVirtualNoteModal, null), [setModal]);

  const openNote = useCallback(
    (params: NavigationParamList['NotePage']) => {
      const unsubscribe = navigation.addListener('focus', () => {
        unsubscribe();
        setModal(OntologyVirtualNoteModal, { topicNodeId, navigation });
      });
      close();
      navigation.push('NotePage', params);
    },
    [close, navigation, setModal, topicNodeId]
  );

  const handleCopy = useCallback(async () => {
    if (!virtualNote) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(virtualNote.content);
      } else if (typeof document !== 'undefined') {
        const textarea = document.createElement('textarea');
        textarea.value = virtualNote.content;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [virtualNote]);

  const handlePrimaryAction = useCallback(async () => {
    if (!virtualNote || isSaving) return;
    if (matchingNoteTitle) {
      openNote({ title: matchingNoteTitle });
      return;
    }
    try {
      setIsSaving(true);
      setSaveError(false);
      await createOrUpdatePage.mutateAsync({
        title: virtualNote.title,
        description: htmlContent || toHtml(virtualNote.content),
      });
      openNote({ title: virtualNote.title });
    } catch {
      setSaveError(true);
    } finally {
      setIsSaving(false);
    }
  }, [virtualNote, matchingNoteTitle, isSaving, createOrUpdatePage, htmlContent, openNote]);

  const stats = virtualNote
    ? ([
        ['Links', virtualNote.linkCount, '#2874A6'],
        ['Paragraphs', virtualNote.paragraphCount, '#8E44AD'],
        ['Cards', virtualNote.cardCount, '#27AE60'],
        ['Source Notes', virtualNote.sourceNoteTitles.length, '#3060C0'],
        ['Related Topics', virtualNote.relatedTopicCount, '#C0398F'],
      ] as const)
    : [];

  return (
    <View
      style={[
        styles.overlay,
        { backgroundColor: isDark ? 'rgba(0, 0, 0, 0.72)' : 'rgba(0, 0, 0, 0.46)' },
      ]}
    >
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        onPress={close}
        accessibilityLabel={lang('close')}
      />
      <View
        style={[
          styles.dialog,
          {
            backgroundColor: modalBg,
            borderColor,
          },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <View style={styles.badge}>
              <Icon name="globe" size={11} color="#FFFFFF" style={styles.badgeIcon} />
              <Text style={styles.badgeText}>{lang('Virtual Note')}</Text>
            </View>
            <Text
              style={[styles.headerTitle, { color: commonStyles.title.color }]}
              numberOfLines={1}
            >
              {virtualNote?.title ||
                (isLoading || isNoteLoading ? '' : lang('There are no topics.'))}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={close}
            accessibilityLabel={lang('close')}
          >
            <Icon name="times" size={16} color={commonStyles.icon.color} />
          </TouchableOpacity>
        </View>
        {virtualNote && (
          <View style={[styles.statsBar, { backgroundColor: statBg, borderColor }]}>
            {stats.map(([key, value, color], index) => (
              <React.Fragment key={key}>
                {index > 0 && <View style={styles.statDivider} />}
                <View style={styles.statItem}>
                  <Text style={[styles.statLabel, { color: commonStyles.smallText.color }]}>
                    {lang(key)}
                  </Text>
                  <Text style={[styles.statValue, { color }]}>{value}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>
        )}
        <ScrollView
          key={topicNodeId}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
        >
          {saveError && (
            <Text style={[commonStyles.smallText, { color: isDark ? '#F2A2A8' : '#B84B56' }]}>
              {lang('Failed to save')}
            </Text>
          )}
          {isLoading || isNoteLoading ? (
            <LoadingView />
          ) : virtualNote ? (
            <View style={styles.content}>
              <EditorViewer
                active
                value={htmlContent}
                theme={colorScheme}
                onLink={(url) => {
                  const relatedTopicNodeId = topicNodeIdFromUrl(url);
                  if (relatedTopicNodeId) {
                    if (relatedTopicNodeId !== topicNodeId) {
                      setModal(OntologyVirtualNoteModal, {
                        topicNodeId: relatedTopicNodeId,
                        navigation,
                      });
                    }
                    return;
                  }
                  const noteLink = urlToNoteLink(url);
                  if (noteLink) {
                    openNote(noteLink);
                  } else {
                    close();
                    onLink(url, navigation);
                  }
                }}
                autoResize
              />
            </View>
          ) : (
            <View style={[styles.content, commonStyles.centerContent]}>
              <Text style={commonStyles.text}>{lang('There are no topics.')}</Text>
            </View>
          )}
        </ScrollView>
        {virtualNote && (
          <View style={[styles.footer, { borderTopColor: commonStyles.card.borderColor }]}>
            <TouchableOpacity
              style={[commonStyles.secondaryButton, styles.footerButton]}
              onPress={handleCopy}
              accessibilityRole="button"
            >
              <Icon
                name={copied ? 'check' : 'clipboard'}
                size={14}
                color={commonStyles.title.color}
                style={styles.iconBefore}
              />
              <Text style={[commonStyles.buttonText, { color: commonStyles.title.color }]}>
                {copied ? lang('Copied to clipboard.') : lang('Copy')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                matchingNoteTitle ? commonStyles.secondaryButton : commonStyles.button,
                styles.footerButton,
                isSaving && styles.saving,
              ]}
              onPress={handlePrimaryAction}
              disabled={isSaving}
              accessibilityRole="button"
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#FFFFFF" style={styles.iconBefore} />
              ) : (
                <Icon
                  name={matchingNoteTitle ? 'external-link' : 'save'}
                  size={14}
                  color={matchingNoteTitle ? commonStyles.title.color : '#FFFFFF'}
                  style={styles.iconBefore}
                />
              )}
              <Text
                style={[
                  commonStyles.buttonText,
                  matchingNoteTitle && { color: commonStyles.title.color },
                ]}
              >
                {isSaving
                  ? lang('Saving...')
                  : matchingNoteTitle
                  ? lang('Go to Real Note')
                  : lang('Save as Real Note')}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  dialog: {
    width: '100%',
    maxWidth: 780,
    height: '88%',
    maxHeight: 740,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, padding: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10, gap: 8 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#AD3D76',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
  },
  badgeIcon: { marginRight: 5 },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  headerTitle: { fontSize: 16, fontWeight: '700', flex: 1 },
  iconButton: { padding: 6 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    padding: 12,
    borderTopWidth: 1,
  },
  footerButton: {
    flexDirection: 'row',
    marginVertical: 4,
    marginLeft: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  saving: { opacity: 0.7 },
  iconBefore: { marginRight: 6 },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  statLabel: { fontSize: 11.5, textAlign: 'center' },
  statValue: { fontSize: 12, fontWeight: '700' },
  statDivider: { width: 1, height: 12, backgroundColor: 'rgba(128, 128, 128, 0.25)' },
  content: { flex: 1, minHeight: 240 },
});
