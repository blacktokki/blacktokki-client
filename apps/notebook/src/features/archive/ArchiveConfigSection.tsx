import { useAuthContext } from '@blacktokki/account';
import { TextButton, useColorScheme, useLangContext } from '@blacktokki/core';
import { markdownFs } from '@blacktokki/editor';
import { ConfigSection } from '@blacktokki/navigation';
import { View } from 'react-native';

import { getContents, useCreateOrUpdatePage } from '../../hooks/useNoteStorage';
import { usePrivate } from '../../hooks/usePrivate';
import { diffToSnapshot } from '../../screens/main/NoteItemSections';
import { OptionButton } from '../../screens/main/home/ConfigSection';
import { createCommonStyles } from '../../styles';

export const ExportButton = ({ title, id }: { title: string; id: number }) => {
  const { lang } = useLangContext();
  const mdfs = markdownFs();
  const { auth } = useAuthContext();
  const { data: privateConfig } = usePrivate();
  const handleExportHistory = async () => {
    // 2. 해당 노트의 모든 Snapshot 및 Delta 내역 조회
    const history = await getContents({
      isOnline: !auth.isLocal,
      types: ['SNAPSHOT', 'DELTA'],
      withHidden: privateConfig.enabled,
      parentId: id,
    });

    // 3. 내역을 순회하며 본문 복원 및 파일명(타이틀) 정의
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
        // 파일명이 중복되지 않도록 타임스탬프를 포함
        title: `${h.title}_${h.updated.replace(/[:.]/g, '-')}`,
        description,
      };
    });

    // 4. 마크다운 내보내기 실행
    mdfs.export(exportData, `${title}_history`);
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
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const { auth } = useAuthContext();
  const { data: privateConfig } = usePrivate();
  const mutation = useCreateOrUpdatePage();
  const mdfs = markdownFs();
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
                withHidden: privateConfig.enabled,
              }).then((contents) => mdfs.export(contents, 'notebook'))
            }
            active={false}
          />
          <OptionButton
            title={lang('Import')}
            onPress={() =>
              mdfs
                .import()
                .then((v) =>
                  v.forEach((v2, i) => mutation.mutate({ ...v2, isLast: i + 1 === v.length }))
                )
            }
            active={false}
          />
        </View>
      </ConfigSection>
    </View>
  );
};
