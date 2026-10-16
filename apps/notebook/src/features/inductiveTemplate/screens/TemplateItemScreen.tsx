import { useLangContext } from '@blacktokki/core';
import { toHtml } from '@blacktokki/editor';
import { navigate, push } from '@blacktokki/navigation';
import { RouteProp, useNavigationState, useRoute } from '@react-navigation/native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { TemplatePreviewSection } from './TemplatePreviewSection';
import { TemplateSourcesSection } from './TemplateSourcesSection';
import { TemplateWriteSection } from './TemplateWriteSection';
import LoadingView from '../../../components/LoadingView';
import { ResponsiveSearchBar } from '../../../components/SearchBar';
import UsageButton, { usageButtonStyles } from '../../../components/UsageButton';
import { useEffectExtensionScreen } from '../../../hooks/useExtension';
import { useCreateOrUpdatePage } from '../../../hooks/useNoteStorage';
import { useNotebookTheme } from '../../../hooks/useNotebookTheme';
import { templateNotes } from '../discovery';
import { templateStyles as styles } from '../styles';
import {
  applyTableLayout,
  changeTableLayout,
  findTemplateTables,
  initialTableLayout,
  renameTableColumn,
} from '../tableLayout';
import {
  fillNoteTemplate,
  templateVariables,
  validateTemplateNavigationParams,
  validNoteTitle,
} from '../template';
import { discoverTitleTemplates, titleFromTemplate } from '../titleTemplates';
import { TemplateCandidate, TemplateNavigationParams, TemplateStage } from '../types';
import { useInductiveTemplates } from '../useInductiveTemplates';

type TemplateWorkspaceProps = {
  data: ReturnType<typeof useInductiveTemplates>;
  initialTemplate: TemplateCandidate;
  initialNoteTitle?: string;
  fromNote: boolean;
};

/** Keep draft state above the stage sections so returning to preview preserves inputs. */
const TemplateWorkspace = ({
  data,
  initialTemplate,
  initialNoteTitle,
  fromNote,
}: TemplateWorkspaceProps) => {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const contentStyle = useMemo(() => {
    const style: ViewStyle = { ...StyleSheet.flatten(commonStyles.container) };
    delete style.flex;
    return style;
  }, [commonStyles]);
  const { height } = useWindowDimensions();
  const [viewportWidth, setViewportWidth] = useState(0);
  const panelHeight = Math.max(480, Math.min(720, height - 230));
  const { examples, notebookRoots } = data;
  const createPage = useCreateOrUpdatePage();
  const selected = initialTemplate;
  const markdown = selected.markdown;
  const [stage, setStage] = useState<TemplateStage>(fromNote ? 'sources' : 'preview');
  const [noteTitle, setNoteTitle] = useState(initialNoteTitle || '');
  const [titleTemplateId, setTitleTemplateId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const tables = useMemo(() => findTemplateTables(markdown), [markdown]);
  const [tableLayout, setTableLayout] = useState(() => initialTableLayout(tables));
  const draft = useMemo(
    () => applyTableLayout(markdown, tables, tableLayout),
    [markdown, tables, tableLayout]
  );
  const [notice, setNotice] = useState('');
  const mounted = useRef(true);
  const operation = useRef(false);
  const draftStarted = useRef(false);
  const scroll = useRef<ScrollView>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const busy = examples.isFetching || createPage.isLoading;
  const bodyVariables = useMemo(
    () => templateVariables(draft.markdown).filter((key) => key !== 'title'),
    [draft.markdown]
  );
  // Markdown table cells stay on one line; paragraph fields can accept longer, multiline text.
  const singleLineFields = useMemo(
    () => [
      ...new Set(
        draft.markdown
          .split('\n')
          .filter((line) => /^\s*\|/.test(line))
          .flatMap(templateVariables)
      ),
    ],
    [draft.markdown]
  );
  const templateHtml = useMemo(() => toHtml(markdown), [markdown]);
  const relatedNotes = useMemo(
    () => templateNotes(selected, examples.data || []),
    [selected, examples.data]
  );
  const titleTemplates = useMemo(
    () =>
      discoverTitleTemplates(relatedNotes, {
        date: lang('Date'),
        number: lang('Number'),
        keyword: lang('Keyword'),
      }),
    [relatedNotes, lang]
  );
  const selectedTitleTemplate = titleTemplates.find((template) => template.id === titleTemplateId);
  const titlePattern = selectedTitleTemplate?.pattern;
  const variables = useMemo(
    () => [...new Set([...(selectedTitleTemplate?.variables || []), ...bodyVariables])],
    [selectedTitleTemplate, bodyVariables]
  );
  const resolvedTitle = titleTemplateId
    ? selectedTitleTemplate
      ? titleFromTemplate(selectedTitleTemplate, values)
      : null
    : validNoteTitle(noteTitle)
    ? noteTitle.normalize('NFC')
    : null;
  const draftTemplateHtml = useMemo(
    () => toHtml(fillNoteTemplate(draft.markdown, values, resolvedTitle, singleLineFields)),
    [draft.markdown, values, resolvedTitle, singleLineFields]
  );
  useEffect(() => {
    if (titleTemplateId && !titlePattern) setTitleTemplateId(null);
  }, [titleTemplateId, titlePattern]);

  const errorNotice = (error: unknown) =>
    setNotice(lang(error instanceof Error ? error.message : 'Could not create note.'));
  const run = async (action: () => Promise<void>) => {
    if (operation.current) return;
    operation.current = true;
    setNotice('');
    try {
      await action();
    } catch (error) {
      if (mounted.current) errorNotice(error);
    } finally {
      operation.current = false;
    }
  };
  const createNote = () =>
    run(async () => {
      if (!resolvedTitle || !draftTemplateHtml.trim()) return;
      await createPage.mutateAsync({
        title: resolvedTitle,
        description: draftTemplateHtml,
        createOnly: true,
      });
      if (mounted.current) push('NotePage', { title: resolvedTitle });
    });

  const showCatalog = () => {
    navigate('TemplateList');
  };
  const showWriting = () => {
    if (!draftStarted.current)
      setTitleTemplateId(initialNoteTitle ? null : titleTemplates[0]?.id || null);
    draftStarted.current = true;
    setStage('writing');
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const showPreview = () => {
    setStage('preview');
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const showSources = () => {
    setStage('sources');
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const chooseTitle = (id: string | null) => {
    if (!id && resolvedTitle) setNoteTitle(resolvedTitle);
    setTitleTemplateId(id);
    setNotice('');
    createPage.reset();
  };
  const changeTitle = (title: string) => {
    setNoteTitle(title);
    setNotice('');
    createPage.reset();
  };
  const changeValue = (key: string, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setNotice('');
    createPage.reset();
  };
  const changeTable = (groupId: string, removeId?: number) => {
    setTableLayout((current) => changeTableLayout(tables, current, groupId, removeId));
    setNotice('');
    createPage.reset();
  };
  const changeTableColumn = (groupId: string, ordinal: number, label: string) => {
    setTableLayout((current) => renameTableColumn(current, groupId, ordinal, label));
    setNotice('');
    createPage.reset();
  };

  return (
    <ScrollView
      ref={scroll}
      style={[
        commonStyles.backgroundView,
        { backgroundColor: commonStyles.container.backgroundColor },
      ]}
      onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}
      contentContainerStyle={[
        contentStyle,
        styles.content,
        viewportWidth < 600 && styles.compactContent,
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.workspace}>
        <View style={[styles.row, styles.between]}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={lang('Back to templates')}
            style={[usageButtonStyles.compactAction, usageButtonStyles.inlineAction]}
            hitSlop={{ top: 4, bottom: 4 }}
            onPress={showCatalog}
          >
            <Icon name="chevron-left" size={12} color={commonStyles.text.color} />
            <Text style={[usageButtonStyles.compactCaption, { color: commonStyles.text.color }]}>
              {lang('Template list')}
            </Text>
          </TouchableOpacity>
          <UsageButton compact paragraph={'🧩 ' + lang('Extracted Templates')} />
        </View>
        {!!notice && (
          <Text
            accessibilityRole="alert"
            style={[commonStyles.text, commonStyles.resultsContainer, styles.notice]}
          >
            {notice}
          </Text>
        )}
        {stage === 'preview' && (
          <TemplatePreviewSection
            templateName={selected.name}
            templateHtml={templateHtml}
            busy={busy || !markdown.trim()}
            onSources={showSources}
            onWriting={showWriting}
          />
        )}
        {stage === 'sources' && (
          <TemplateSourcesSection
            templateName={selected.name}
            notes={relatedNotes}
            notebookRoots={notebookRoots}
            height={panelHeight}
            canWrite={!busy && !!markdown.trim()}
            onPreviewTemplate={showPreview}
            onWriting={showWriting}
            onSelect={(title) => push('NotePage', { title })}
          />
        )}
        {stage === 'writing' && (
          <TemplateWriteSection
            templateName={selected.name}
            templateHtml={draftTemplateHtml}
            form={{
              titleTemplates,
              titleTemplateId,
              noteTitle,
              resolvedTitle,
              variables,
              singleLineFields,
              values,
              tables: draft.tables,
              busy,
              onChooseTitle: chooseTitle,
              onChangeTitle: changeTitle,
              onChangeValue: changeValue,
              onChangeTable: changeTable,
              onChangeTableColumn: changeTableColumn,
            }}
            error={createPage.isError ? createPage.error : undefined}
            onSave={createNote}
            onPreview={showPreview}
          />
        )}
      </View>
    </ScrollView>
  );
};
/** ADR-2504: register this screen through the existing extension slots. */
export const TemplateItemScreen = () => {
  const route =
    useRoute<RouteProp<{ TemplateItem: TemplateNavigationParams | undefined }, 'TemplateItem'>>();
  const params = validateTemplateNavigationParams(route.params) ? route.params : undefined;
  const { isActive, isReady } = useEffectExtensionScreen('inductiveTemplate');
  const data = useInductiveTemplates();
  const { commonStyles } = useNotebookTheme();
  const fromNote = useNavigationState(
    (state) =>
      state.routes[state.routes.findIndex((item) => item.key === route.key) - 1]?.name ===
      'NotePage'
  );
  useEffect(() => {
    if (isReady && isActive && !params) navigate('TemplateList');
  }, [isReady, isActive, params]);
  return (
    <View style={commonStyles.flex}>
      <ResponsiveSearchBar />
      {!isReady || !data.enabled ? (
        <LoadingView />
      ) : isActive && params ? (
        <TemplateWorkspace
          key={data.scope}
          data={data}
          initialTemplate={params.template}
          initialNoteTitle={params.noteTitle}
          fromNote={fromNote}
        />
      ) : null}
    </View>
  );
};
