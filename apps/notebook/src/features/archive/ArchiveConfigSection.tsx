import { useAuthContext } from '@blacktokki/account';
import { TextButton, useLangContext } from '@blacktokki/core';
import { markdownFs } from '@blacktokki/editor';
import { ConfigSection } from '@blacktokki/navigation';
import { View } from 'react-native';

import { useCreateOrUpdateBoard } from '../../hooks/useBoardStorage';
import { getContents, useCreateOrUpdatePage } from '../../hooks/useNoteStorage';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';
import { useUsageMode } from '../../hooks/useUsageMode';
import { diffToSnapshot } from '../../screens/main/NoteItemSections';
import { OptionButton } from '../../screens/main/home/ConfigSection';
import { updatedFullFormat } from '../../screens/main/home/ContentGroupSection';

export const ExportButton = ({ title, id }: { title: string; id: number }) => {
  const { lang } = useLangContext();
  const mdfs = markdownFs();
  const { auth } = useAuthContext();
  const handleExportHistory = async () => {
    const history = await getContents({
      isOnline: !auth.isLocal,
      types: ['SNAPSHOT', 'DELTA'],
      parentId: id,
    });
    const exportData = history.map((h) => {
      let description = h.description || '';

      // Delta 타입인 경우 참조하는 Snapshot을 찾아 복원
      if (h.type === 'DELTA' && h.option.SNAPSHOT_ID) {
        const snapshot = history.find((s) => s.id === h.option.SNAPSHOT_ID);
        if (snapshot?.description) {
          description = diffToSnapshot(snapshot.description, description);
        }
      }

      return {
        ...h,
        title: `${h.title}_${updatedFullFormat(h.updated).replace(/[:.]/g, '-')}`,
        description,
      };
    });

    mdfs.export(exportData, [], title);
  };

  return (
    <TextButton
      title={'💾 ' + lang('Export')}
      onPress={handleExportHistory}
      style={{ paddingRight: 0 }}
    />
  );
};

export default () => {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const { auth } = useAuthContext();
  const mutation = useCreateOrUpdatePage();
  const boardMutation = useCreateOrUpdateBoard();
  const mdfs = markdownFs();
  const { usageMode, notebook } = useUsageMode();
  return (
    <View style={commonStyles.card}>
      <ConfigSection title={lang('* Archive')}>
        <View style={{ flexDirection: 'row' }}>
          <OptionButton
            title={lang('Export')}
            onPress={() =>
              getContents({
                isOnline: !auth.isLocal,
                types: ['NOTE', 'BOARD'],
                parentId: notebook?.id || 0,
              }).then((allContents) => {
                const notes = allContents.filter((c) => c.type !== 'BOARD');
                const boards = allContents
                  .filter((c) => c.type === 'BOARD')
                  .map((c) => ({ title: c.title, data: c.option }));
                mdfs.export(
                  notes,
                  boards,
                  usageMode === 'NOTEBOOK' && notebook ? notebook.title : 'notebook'
                );
              })
            }
            active={false}
          />
          <OptionButton
            title={lang('Import')}
            onPress={async () => {
              try {
                const { contents, jsons } = await mdfs.import();
                for (let i = 0; i < contents.length; i++) {
                  const note = contents[i];
                  await mutation.mutateAsync({
                    ...note,
                    isLast: i + 1 === contents.length && jsons.length === 0,
                    newParentId: notebook?.id || 0,
                  });
                }
                for (let i = 0; i < jsons.length; i++) {
                  const board = jsons[i];
                  await boardMutation.mutateAsync({
                    title: board.title,
                    description: '',
                    option: { BOARD_HEADER_LEVEL: 3, ...board.data },
                    newParentId: notebook?.id || 0,
                  });
                }
              } catch (err) {
                console.error('Import failed:', err);
              }
            }}
            active={false}
          />
        </View>
      </ConfigSection>
    </View>
  );
};
