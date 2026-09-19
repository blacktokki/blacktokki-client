import { Text, useLangContext } from '@blacktokki/core';
import { EditorViewer, getMarkdownUtil } from '@blacktokki/editor';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

import { topicNodeIdFromUrl, TopicVirtualNote } from './virtualNotes';
import { onLink } from '../../components/SearchBar';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';

export interface VirtualNoteModalProps {
  visible: boolean;
  virtualNote: TopicVirtualNote | null;
  navigation?: any;
  onClose: () => void;
  onSaveAsNote: (title: string, content: string) => Promise<void>;
  onOpenRelatedTopic: (topicNodeId: string) => void;
}

export const VirtualNoteModal: React.FC<VirtualNoteModalProps> = ({
  visible,
  virtualNote,
  navigation,
  onClose,
  onSaveAsNote,
  onOpenRelatedTopic,
}) => {
  const { lang } = useLangContext();
  const { commonStyles, colorScheme } = useNotebookTheme();
  const isDark = colorScheme === 'dark';

  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [htmlContent, setHtmlContent] = useState('');

  // Convert markdown content to clean HTML format using (await getMarkdownUtil()).renderer
  useEffect(() => {
    let active = true;
    if (!virtualNote?.content) {
      setHtmlContent('');
      return;
    }

    (async () => {
      try {
        const util = await getMarkdownUtil();
        const html = util.renderer(virtualNote.content);
        if (active) {
          setHtmlContent(html);
        }
      } catch {
        if (active) {
          setHtmlContent('');
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [virtualNote?.content]);

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

  const handleSave = useCallback(async () => {
    if (!virtualNote || isSaving) return;
    try {
      setIsSaving(true);
      const util = await getMarkdownUtil();
      const contentToSave = htmlContent || util.renderer(virtualNote.content);
      await onSaveAsNote(virtualNote.title, contentToSave);
    } catch {
      setIsSaving(false);
    }
  }, [virtualNote, isSaving, onSaveAsNote, htmlContent]);

  if (!visible || !virtualNote) return null;

  const modalBg = isDark ? '#1E222B' : '#FFFFFF';
  const borderColor = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.1)';
  const statBg = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)';
  const contentBg = isDark ? '#161920' : '#F8F9FA';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View
          style={[
            styles.container,
            {
              backgroundColor: modalBg,
              borderColor,
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <View style={styles.badge}>
                <Icon name="globe" size={11} color="#FFFFFF" style={{ marginRight: 5 }} />
                <Text style={styles.badgeText}>{lang('Virtual Note') || '가상노트'}</Text>
              </View>
              <Text
                style={[styles.headerTitle, { color: commonStyles.title?.color || '#333' }]}
                numberOfLines={1}
              >
                {virtualNote.title}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Icon name="times" size={16} color={commonStyles.text?.color || '#666'} />
            </TouchableOpacity>
          </View>

          {/* Stats Row */}
          <View style={[styles.statsBar, { backgroundColor: statBg, borderColor }]}>
            <View style={styles.statItem}>
              <Text style={[styles.statLabel, { color: commonStyles.smallText?.color }]}>
                {lang('Subclasses') || '하위 분류'}
              </Text>
              <Text style={[styles.statValue, { color: '#AD3D76' }]}>
                {virtualNote.subclassCount}
              </Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statLabel, { color: commonStyles.smallText?.color }]}>
                {lang('Paragraphs') || '문단'}
              </Text>
              <Text style={[styles.statValue, { color: '#8E44AD' }]}>
                {virtualNote.paragraphCount}
              </Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statLabel, { color: commonStyles.smallText?.color }]}>
                {lang('Cards') || '카드'}
              </Text>
              <Text style={[styles.statValue, { color: '#27AE60' }]}>{virtualNote.cardCount}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statLabel, { color: commonStyles.smallText?.color }]}>
                {lang('Source Notes') || '출처 노트'}
              </Text>
              <Text style={[styles.statValue, { color: '#3060C0' }]}>
                {virtualNote.sourceNoteTitles.length}
              </Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statLabel, { color: commonStyles.smallText?.color }]}>
                {lang('Related Topics') || '연관 주제'}
              </Text>
              <Text style={[styles.statValue, { color: '#C0398F' }]}>
                {virtualNote.relatedTopicCount}
              </Text>
            </View>
          </View>

          {/* Markdown Content Viewer with EditorViewer */}
          <ScrollView
            style={[styles.contentScrollView, { backgroundColor: contentBg }]}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator
            nestedScrollEnabled
          >
            <EditorViewer
              active={visible}
              value={htmlContent}
              theme={colorScheme}
              onLink={(url) => {
                const topicNodeId = topicNodeIdFromUrl(url);
                if (topicNodeId) {
                  onOpenRelatedTopic(topicNodeId);
                  return;
                }
                if (navigation) {
                  onClose();
                  onLink(url, navigation);
                }
              }}
              autoResize
            />
          </ScrollView>

          {/* Footer Actions */}
          <View style={[styles.footer, { borderColor }]}>
            <Text style={[styles.footerNotice, { color: commonStyles.smallText?.color }]}>
              {lang('Virtual note saved as a real note.') ||
                '* 실제 일반 노트로 저장하면 영구 보관됩니다.'}
            </Text>
            <View style={styles.buttonGroup}>
              <TouchableOpacity
                style={[
                  styles.copyButton,
                  {
                    backgroundColor: copied
                      ? '#27AE60'
                      : isDark
                      ? 'rgba(255, 255, 255, 0.08)'
                      : '#EAECEE',
                  },
                ]}
                onPress={handleCopy}
              >
                <Icon
                  name={copied ? 'check' : 'clipboard'}
                  size={12}
                  color={copied ? '#FFFFFF' : commonStyles.text?.color || '#333'}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={[
                    styles.buttonText,
                    {
                      color: copied ? '#FFFFFF' : commonStyles.text?.color || '#333',
                    },
                  ]}
                >
                  {copied
                    ? lang('Copied to clipboard.') || '복사 완료!'
                    : lang('Copy') || '클립보드 복사'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.saveButton,
                  {
                    backgroundColor: '#AD3D76',
                    opacity: isSaving ? 0.7 : 1,
                  },
                ]}
                onPress={handleSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 6 }} />
                ) : (
                  <Icon name="save" size={12} color="#FFFFFF" style={{ marginRight: 6 }} />
                )}
                <Text style={[styles.buttonText, { color: '#FFFFFF' }]}>
                  {isSaving
                    ? lang('Saving...') || '저장 중...'
                    : lang('Save as Real Note') || '실제 일반 노트로 저장'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    padding: 16,
  },
  container: {
    width: '100%',
    maxWidth: 780,
    height: '88%',
    maxHeight: 740,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
    gap: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#AD3D76',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  closeButton: {
    padding: 6,
  },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  statLabel: {
    fontSize: 11.5,
    textAlign: 'center',
  },
  statValue: {
    fontSize: 12,
    fontWeight: '700',
  },
  statDivider: {
    width: 1,
    height: 12,
    backgroundColor: 'rgba(128, 128, 128, 0.25)',
  },
  contentScrollView: {
    flex: 1,
    minHeight: 0,
  },
  contentContainer: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexWrap: 'wrap',
    gap: 10,
  },
  footerNotice: {
    fontSize: 11,
    flex: 1,
    minWidth: 200,
  },
  buttonGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  buttonText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
