import { useLangContext } from '@blacktokki/core';
import { toHtml } from '@blacktokki/editor';
import { navigate, push } from '@blacktokki/navigation';
import { RouteProp, useNavigationState, useRoute } from '@react-navigation/native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Icon } from 'react-native-paper';
import { useQuery } from 'react-query';

import { TemplatePreviewSection } from './TemplatePreviewSection';
import { TemplateSheetSection } from './TemplateSheetSection';
import { TemplateSourcesSection } from './TemplateSourcesSection';
import { TemplateWriteSection } from './TemplateWriteSection';
import LoadingView from '../../../components/LoadingView';
import { ResponsiveSearchBar } from '../../../components/SearchBar';
import StatusCard from '../../../components/StatusCard';
import { useEffectExtensionScreen } from '../../../hooks/useExtension';
import { useCreateOrUpdatePage } from '../../../hooks/useNoteStorage';
import { useNotebookTheme } from '../../../hooks/useNotebookTheme';
import { pageStyles } from '../../../screens/main/NoteItemSections';
import { discoverTemplates, templateNotes } from '../discovery';
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
  resolveTemplateLink,
  templateVariables,
  validateTemplateNavigationParams,
  validNoteTitle,
} from '../template';
import { discoverTitleTemplates, titleFromTemplate } from '../titleTemplates';
import { ExampleNote, TemplateCandidate, TemplateNavigationParams, TemplateStage } from '../types';
import { useInductiveTemplates } from '../useInductiveTemplates';

type TemplateWorkspaceProps = {
  data: ReturnType<typeof useInductiveTemplates>;
  initialTemplate: TemplateCandidate;
  initialNoteTitle?: string;
  fromNote: boolean;
  resolving?: boolean;
};

/** Keep draft state above the stage sections so returning to preview preserves inputs. */
const TemplateWorkspace = ({
  data,
  initialTemplate,
  initialNoteTitle,
  fromNote,
  resolving = false,
}: TemplateWorkspaceProps) => {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const contentStyle = useMemo(() => {
    const style: ViewStyle = { ...StyleSheet.flatten(commonStyles.container) };
    delete style.flex;
    return style;
  }, [commonStyles]);
  const sourceInset = {
    paddingHorizontal: commonStyles.container.paddingHorizontal,
  };
  const { examples, notebookRoots } = data;
  const createPage = useCreateOrUpdatePage();
  const selected = initialTemplate;
  const markdown = selected.markdown;
  const [stage, setStage] = useState<TemplateStage | 'editing'>(fromNote ? 'sources' : 'preview');
  const [editing, setEditing] = useState<{ notes: ExampleNote[]; groupPath: string } | null>(null);
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
  const busy = examples.isFetching || createPage.isLoading || resolving;
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

  const workspace = (
    <View
      style={[
        styles.workspace,
        styles.pageWorkspace,
        (stage === 'sources' || stage === 'editing') && styles.sourceWorkspace,
      ]}
    >
      {!!notice && (
        <View
          accessibilityRole="alert"
          style={[
            commonStyles.resultsContainer,
            styles.warning,
            styles.notice,
            stage === 'sources' && { marginHorizontal: sourceInset.paddingHorizontal },
          ]}
        >
          <Icon source="alert-circle-outline" size={18} color={commonStyles.text.color} />
          <Text style={[commonStyles.text, styles.grow]}>{notice}</Text>
        </View>
      )}
      {stage === 'preview' && (
        <TemplatePreviewSection
          templateName={selected.name}
          templateHtml={templateHtml}
          busy={busy || !markdown.trim()}
          onSources={showSources}
          onWriting={showWriting}
          onCatalog={showCatalog}
        />
      )}
      {stage === 'sources' && (
        <TemplateSourcesSection
          templateName={selected.name}
          notes={relatedNotes}
          notebookRoots={notebookRoots}
          initialGroupPath={editing?.groupPath}
          paddingHorizontal={sourceInset.paddingHorizontal}
          canWrite={!busy && !!markdown.trim()}
          onPreviewTemplate={showPreview}
          onWriting={(notes, groupPath) => {
            setEditing({ notes, groupPath });
            setStage('editing');
          }}
          onCatalog={showCatalog}
          onSelect={(title) => push('NotePage', { title })}
          onNotesChange={() => examples.refetch()}
        />
      )}
      {stage === 'editing' && (
        <TemplateSheetSection
          templateName={[selected.name, editing?.groupPath].filter(Boolean).join('/')}
          markdown={markdown}
          notes={editing?.notes || relatedNotes}
          allNotes={examples.data || []}
          paddingHorizontal={sourceInset.paddingHorizontal}
          onCancel={showSources}
          onCatalog={showCatalog}
          onSaved={() => {
            navigate('TemplateList');
            examples.refetch();
          }}
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
          onCatalog={showCatalog}
        />
      )}
    </View>
  );

  return stage === 'sources' || stage === 'editing' ? (
    <View style={[commonStyles.container, styles.sourceContent]}>{workspace}</View>
  ) : (
    <ScrollView
      ref={scroll}
      style={[
        commonStyles.backgroundView,
        { backgroundColor: commonStyles.container.backgroundColor },
      ]}
      contentContainerStyle={[contentStyle, pageStyles.contentContainer]}
      keyboardShouldPersistTaps="handled"
    >
      {workspace}
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
  const { lang } = useLangContext();
  const dateLabel = lang('Date');
  const { commonStyles } = useNotebookTheme();
  const { examples, notebookRoots } = data;
  const pending = !isReady || !data.enabled || !examples.isFetchedAfterMount;
  const linkKey = JSON.stringify([data.scope, params?.template, params?.group]);
  const canResolve = !pending && isActive && !!params && !!examples.data && !examples.isError;
  const resolution = useQuery({
    queryKey: ['inductiveTemplateLink', linkKey, dateLabel, notebookRoots, examples.dataUpdatedAt],
    queryFn: async () => ({
      key: linkKey,
      template:
        (await resolveTemplateLink(
          discoverTemplates(examples.data || [], dateLabel, notebookRoots),
          params!,
          notebookRoots
        )) || null,
    }),
    enabled: canResolve,
    keepPreviousData: true,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const selected = resolution.data?.key === linkKey ? resolution.data.template : undefined;
  const resolving = canResolve && (resolution.isLoading || resolution.isFetching);
  const failed = examples.isError || resolution.isError;
  const fromNote = useNavigationState(
    (state) =>
      state.routes[state.routes.findIndex((item) => item.key === route.key) - 1]?.name ===
      'NotePage'
  );
  useEffect(() => {
    if (
      isReady &&
      isActive &&
      (!params ||
        (!pending &&
          !examples.isFetching &&
          !resolving &&
          !failed &&
          resolution.isSuccess &&
          !selected))
    )
      navigate('TemplateList');
  }, [
    isReady,
    isActive,
    params,
    pending,
    examples.isFetching,
    resolving,
    failed,
    resolution.isSuccess,
    selected,
  ]);
  return (
    <View style={commonStyles.flex}>
      <ResponsiveSearchBar />
      {pending ? (
        <LoadingView />
      ) : isActive && params && selected ? (
        <TemplateWorkspace
          key={`${data.scope}:${params.template}:${params.group}`}
          data={data}
          initialTemplate={selected}
          initialNoteTitle={params.noteTitle}
          fromNote={fromNote}
          resolving={resolving}
        />
      ) : isActive && params && (examples.isFetching || resolving) ? (
        <LoadingView />
      ) : isActive && params && failed ? (
        <StatusCard
          message="Could not discover templates."
          buttonTitle="Retry"
          onButtonPress={() => {
            examples.refetch();
            resolution.refetch();
          }}
        />
      ) : null}
    </View>
  );
};
