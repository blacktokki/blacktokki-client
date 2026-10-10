import { useLangContext } from '@blacktokki/core';
import { EditorViewer, toHtml } from '@blacktokki/editor';
import { push } from '@blacktokki/navigation';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View, ViewStyle } from 'react-native';
import { Icon, Switch } from 'react-native-paper';

import { SimilarNotesSection } from './SimilarNotesSection';
import { TemplateAction } from './TemplateAction';
import { TemplateCatalogSection } from './TemplateCatalogSection';
import { TemplateFormSection } from './TemplateFormSection';
import { discoverTemplates, templateNotes } from './discovery';
import { templateStyles as styles } from './styles';
import { fillTemplate, templateVariables, validNoteTitle } from './template';
import { groupSimilarTemplates } from './templateSimilarity';
import { discoverTitleTemplates, titleFromTemplate } from './titleTemplates';
import { TemplateCandidate } from './types';
import { useInductiveTemplates } from './useInductiveTemplates';
import LoadingView from '../../components/LoadingView';
import { ResponsiveSearchBar } from '../../components/SearchBar';
import UsageButton from '../../components/UsageButton';
import { useEffectExtensionScreen } from '../../hooks/useExtension';
import { useCreateOrUpdatePage } from '../../hooks/useNoteStorage';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';
import { EditPageSection } from '../../screens/main/EditPageScreen';

type TemplateWorkspaceProps = { data: ReturnType<typeof useInductiveTemplates> };

const TemplateWorkspace = ({ data }: TemplateWorkspaceProps) => {
  const { lang } = useLangContext();
  const { commonStyles, colorScheme } = useNotebookTheme();
  const contentStyle = useMemo(() => {
    const style: ViewStyle = { ...StyleSheet.flatten(commonStyles.container) };
    delete style.flex;
    return style;
  }, [commonStyles]);
  const { height } = useWindowDimensions();
  const [viewportWidth, setViewportWidth] = useState(0);
  const [workspaceWidth, setWorkspaceWidth] = useState(0);
  const wide = workspaceWidth >= 900;
  const panelHeight = Math.max(480, Math.min(720, height - 230));
  const { examples, notebookRoots } = data;
  const createPage = useCreateOrUpdatePage();
  const [candidates, setCandidates] = useState<TemplateCandidate[]>([]);
  const [currentCriteria, setCurrentCriteria] = useState(false);
  const [working, setWorking] = useState(false);
  const [selected, setSelected] = useState<TemplateCandidate | null>(null);
  const [previewMode, setPreviewMode] = useState<'template' | 'note'>('template');
  const [sourceTitle, setSourceTitle] = useState<string>();
  const markdown = selected?.markdown || '';
  const [writing, setWriting] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [titleTemplateId, setTitleTemplateId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [noteHtml, setNoteHtml] = useState<string | null>(null);
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
  useEffect(() => {
    if (!examples.data) return;
    setWorking(true);
    const timer = setTimeout(() => {
      try {
        setCandidates(
          discoverTemplates(
            examples.data!,
            lang('Date'),
            notebookRoots,
            currentCriteria ? 'current' : 'previous'
          )
        );
      } catch {
        setCandidates([]);
        setNotice(lang('Could not discover templates.'));
      } finally {
        setWorking(false);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [examples.data, examples.dataUpdatedAt, lang, notebookRoots, currentCriteria]);
  const discovering = working || examples.isFetching;
  const busy = discovering || createPage.isLoading;
  const templateGroups = useMemo(() => groupSimilarTemplates(candidates, toHtml), [candidates]);
  const bodyVariables = useMemo(
    () => templateVariables(markdown).filter((key) => key !== 'title'),
    [markdown]
  );
  const templateHtml = useMemo(() => toHtml(markdown), [markdown]);
  const relatedNotes = useMemo(
    () => (selected ? templateNotes(selected, examples.data || []) : []),
    [selected, examples.data]
  );
  const activeSource = relatedNotes.find((note) => note.title === sourceTitle) || relatedNotes[0];
  const sourcePreview = previewMode === 'note' && !!activeSource;
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
  useEffect(() => {
    setNoteHtml(null);
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
  const selectTemplate = (template: TemplateCandidate) => {
    draftStarted.current = false;
    setSelected(template);
    setPreviewMode('template');
    setSourceTitle(undefined);
    setWriting(false);
    setNoteHtml(null);
    setNoteTitle('');
    setTitleTemplateId(null);
    setValues({});
    setNotice('');
    createPage.reset();
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const previewNote = () => {
    if (!resolvedTitle) return;
    createPage.reset();
    const title = resolvedTitle
      .split('/')
      .at(-1)!
      .replace(/([\\\x60*_{}[\]<>#|!])/g, '\\$1');
    setNoteHtml(toHtml(fillTemplate(markdown, { ...values, title })));
    setNotice('');
    if (!wide)
      setTimeout(() => {
        if (mounted.current) scroll.current?.scrollToEnd({ animated: true });
      }, 0);
  };
  const createNote = () =>
    run(async () => {
      if (!resolvedTitle || !noteHtml?.trim()) return;
      await createPage.mutateAsync({
        title: resolvedTitle,
        description: noteHtml,
        createOnly: true,
      });
      if (mounted.current) push('NotePage', { title: resolvedTitle });
    });

  const showCatalog = () => {
    setSelected(null);
    setWriting(false);
    setNotice('');
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const showWriting = () => {
    if (!selected) return;
    if (!draftStarted.current) setTitleTemplateId(titleTemplates[0]?.id || null);
    draftStarted.current = true;
    setWriting(true);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const showPreview = (mode: 'template' | 'note', title?: string) => {
    if (title) setSourceTitle(title);
    setPreviewMode(mode);
    if (!wide)
      setTimeout(() => {
        if (mounted.current) scroll.current?.scrollToEnd({ animated: true });
      }, 0);
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
      <View
        style={styles.workspace}
        onLayout={(event) => setWorkspaceWidth(event.nativeEvent.layout.width)}
      >
        <View style={[styles.row, styles.between]}>
          <Text style={[commonStyles.smallText, styles.intro, styles.grow]}>
            {lang(
              'Select an automatically discovered template to compare similar notes and write a new note.'
            )}
          </Text>
          <UsageButton paragraph={'🧩 ' + lang('Extracted Templates')} />
        </View>
        <View style={[styles.wrap, viewportWidth >= 600 && styles.steps]}>
          <TemplateAction
            icon="format-list-bulleted"
            label="Back to templates"
            caption="Template list"
            active={!selected}
            disabled={busy}
            onPress={showCatalog}
          />
          <TemplateAction
            icon="file-document-outline"
            label="Template preview"
            caption="Preview"
            active={!!selected && !writing}
            disabled={busy || !selected}
            onPress={() => {
              setWriting(false);
              setPreviewMode('template');
              scroll.current?.scrollTo({ y: 0, animated: false });
            }}
          />
          <TemplateAction
            icon="file-plus-outline"
            label="Write a new note with this template"
            caption="New note"
            active={writing}
            disabled={busy || !writing}
            onPress={showWriting}
          />
        </View>
        {!!notice && (
          <Text
            accessibilityRole="alert"
            style={[commonStyles.text, commonStyles.resultsContainer, styles.notice]}
          >
            {notice}
          </Text>
        )}
        {!selected ? (
          <>
            {examples.isError && (
              <Text accessibilityRole="alert" style={commonStyles.text}>
                {lang('Could not load notes.')}
              </Text>
            )}
            <TemplateCatalogSection
              groups={templateGroups}
              disabled={busy}
              loading={discovering}
              onSelect={selectTemplate}
              criteria={
                <View style={[styles.row, styles.criteria]}>
                  <View style={styles.grow}>
                    <Text style={[commonStyles.text, styles.sourceRootText]}>
                      {lang('Extraction criteria')}
                    </Text>
                    <Text style={[commonStyles.smallText, styles.helper]}>
                      {lang(
                        currentCriteria
                          ? 'Whole notes + shared table forms'
                          : 'Whole-note structure'
                      )}
                    </Text>
                  </View>
                  <Switch
                    accessibilityLabel={lang('Extraction criteria')}
                    value={currentCriteria}
                    disabled={busy || !examples.data}
                    color={commonStyles.button.backgroundColor}
                    onValueChange={(value) => {
                      setWorking(true);
                      setNotice('');
                      setCurrentCriteria(value);
                    }}
                  />
                </View>
              }
            />
            {!discovering && !examples.isLoading && !examples.isError && !candidates.length && (
              <View style={[commonStyles.card, styles.panel, styles.empty]}>
                <Icon
                  source="file-document-outline"
                  size={40}
                  color={commonStyles.smallText.color}
                />
                <Text style={[commonStyles.smallText, styles.emptyText]}>
                  {lang(
                    'No templates found. Templates appear when at least two notes share similar headings, fields or tables.'
                  )}
                </Text>
              </View>
            )}
          </>
        ) : (
          <>
            {writing && (
              <View style={[styles.wrap, styles.between]}>
                <Text accessibilityRole="header" style={[commonStyles.title, styles.title]}>
                  {lang('Write a note from the template')}
                </Text>
                <View style={styles.wrap}>
                  <Text style={commonStyles.smallText}>{selected.name}</Text>
                  <Text
                    style={[commonStyles.smallText, commonStyles.resultsContainer, styles.badge]}
                    accessibilityLabel={lang('Similar notes') + ': ' + relatedNotes.length}
                  >
                    {'▤ ' + relatedNotes.length}
                  </Text>
                </View>
              </View>
            )}
            {!writing ? (
              <View style={wide ? styles.columns : styles.stack}>
                <View style={wide ? styles.sourceColumn : undefined}>
                  <SimilarNotesSection
                    templateName={selected.name}
                    notes={relatedNotes}
                    notebookRoots={notebookRoots}
                    height={wide ? panelHeight : 300}
                    selectedTitle={sourcePreview ? activeSource.title : undefined}
                    onPreviewTemplate={() => showPreview('template')}
                    onSelect={(title) => showPreview('note', title)}
                  />
                </View>
                <View style={wide ? styles.previewColumn : undefined}>
                  <View
                    style={[
                      commonStyles.card,
                      styles.panel,
                      styles.previewPanel,
                      { height: panelHeight },
                    ]}
                  >
                    <View style={[styles.row, styles.between]}>
                      <Text
                        accessibilityRole="header"
                        style={[commonStyles.title, styles.title, styles.grow]}
                      >
                        {sourcePreview ? activeSource.title : selected.name}
                      </Text>
                      {sourcePreview ? (
                        <TemplateAction
                          icon="open-in-new"
                          label="Open note"
                          onPress={() => push('NotePage', { title: activeSource.title })}
                        />
                      ) : (
                        <TemplateAction
                          icon="file-plus-outline"
                          label="Write a new note with this template"
                          caption="New note"
                          primary
                          disabled={busy || !markdown.trim()}
                          onPress={showWriting}
                        />
                      )}
                    </View>
                    <View style={[commonStyles.resultsContainer, styles.viewerFrame, styles.grow]}>
                      <EditorViewer
                        active
                        value={sourcePreview ? activeSource.description || '' : templateHtml}
                        theme={colorScheme}
                      />
                    </View>
                  </View>
                </View>
              </View>
            ) : (
              <View style={wide ? styles.columns : styles.stack}>
                <View style={wide ? styles.formColumn : undefined}>
                  <TemplateFormSection
                    titleTemplates={titleTemplates}
                    titleTemplateId={titleTemplateId}
                    noteTitle={noteTitle}
                    resolvedTitle={resolvedTitle}
                    variables={variables}
                    values={values}
                    busy={busy}
                    onChooseTitle={(id) => {
                      if (!id && resolvedTitle) setNoteTitle(resolvedTitle);
                      setTitleTemplateId(id);
                      setNoteHtml(null);
                      createPage.reset();
                    }}
                    onChangeTitle={(title) => {
                      setNoteTitle(title);
                      setNoteHtml(null);
                    }}
                    onChangeValue={(key, value) => {
                      setValues((current) => ({ ...current, [key]: value }));
                      setNoteHtml(null);
                    }}
                    onPreview={previewNote}
                  />
                </View>
                <View style={wide ? styles.editorColumn : undefined}>
                  <View style={[commonStyles.card, styles.panel, styles.previewPanel]}>
                    <Text style={[commonStyles.title, styles.title]}>
                      {lang(noteHtml === null ? 'Template preview' : 'Preview new note')}
                    </Text>
                    <View
                      style={[
                        commonStyles.resultsContainer,
                        styles.viewerFrame,
                        styles.editor,
                        { height: panelHeight - 82 },
                      ]}
                    >
                      {noteHtml === null ? (
                        <EditorViewer active value={templateHtml} theme={colorScheme} />
                      ) : (
                        <EditPageSection
                          title={resolvedTitle || ''}
                          content={noteHtml}
                          setContent={setNoteHtml}
                          onCancel={() => setNoteHtml(null)}
                          onSave={
                            busy || !resolvedTitle || !noteHtml.trim() ? undefined : createNote
                          }
                        />
                      )}
                    </View>
                    {createPage.isError && (
                      <Text accessibilityRole="alert" style={[commonStyles.text, styles.notice]}>
                        {lang(
                          createPage.error instanceof Error
                            ? createPage.error.message
                            : 'Could not create note.'
                        )}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            )}
          </>
        )}
      </View>
    </ScrollView>
  );
};
/** ADR-2504: register this screen through the existing extension slots. */
export const InductiveTemplateScreen = () => {
  const { isActive, isReady } = useEffectExtensionScreen('inductiveTemplate');
  const data = useInductiveTemplates();
  const { commonStyles } = useNotebookTheme();
  return (
    <View style={commonStyles.flex}>
      <ResponsiveSearchBar />
      {!isReady || !data.enabled ? (
        <LoadingView />
      ) : isActive ? (
        <TemplateWorkspace key={data.scope} data={data} />
      ) : null}
    </View>
  );
};
