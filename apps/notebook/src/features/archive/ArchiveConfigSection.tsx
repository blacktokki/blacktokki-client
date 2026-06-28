import { useAuthContext } from '@blacktokki/account';
import { TextButton, useLangContext } from '@blacktokki/core';
import { markdownFs } from '@blacktokki/editor';
import { ConfigSection } from '@blacktokki/navigation';
import { View } from 'react-native';

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

    mdfs.export(exportData, title);
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
                types: ['NOTE'],
                parentId: notebook?.id || 0,
              }).then((contents) =>
                mdfs.export(
                  contents,
                  usageMode === 'NOTEBOOK' && notebook ? notebook.title : 'notebook'
                )
              )
            }
            active={false}
          />
          <OptionButton
            title={lang('Import')}
            onPress={() =>
              mdfs.import().then((v) =>
                v.forEach((v2, i) =>
                  mutation.mutate({
                    ...v2,
                    isLast: i + 1 === v.length,
                    newParentId: notebook?.id || 0,
                  })
                )
              )
            }
            active={false}
          />
        </View>
      </ConfigSection>
    </View>
  );
};
