import { useLangContext, useResizeContext, View } from '@blacktokki/core';
import { navigate, push } from '@blacktokki/navigation';
import React, { useRef } from 'react';
import { List, TouchableRipple, Badge } from 'react-native-paper';

import { useLastBoard } from '../../../hooks/useBoardStorage';
import {
  useRecentPages,
  useNotePages,
  useDeleteRecentPage,
  useLastPage,
  useAddRecentPage,
  useCurrentPage,
} from '../../../hooks/useNoteStorage';
import useProblem, { getSplitTitle } from '../../../hooks/useProblem';
import useTimeLine from '../../../hooks/useTimeLine';
import { Content } from '../../../types';

const getItemPadding = (isLandscape: boolean) => {
  return isLandscape ? 5 : 8;
};

export const TimeLineButton = () => {
  const { lang } = useLangContext();
  const { data } = useTimeLine();
  return (
    <List.Item
      left={(_props) => <List.Icon {..._props} icon={'calendar'} />}
      right={(_props) => (
        <View style={{ alignSelf: 'center', backgroundColor: 'transparent' }}>
          {data.length > 0 && <Badge>{data.length}</Badge>}
        </View>
      )}
      title={lang('Timeline')}
      onPress={() => navigate('TimeLine')}
    />
  );
};

export const ProblemButton = () => {
  const { lang } = useLangContext();
  const { data } = useProblem();
  return (
    <List.Item
      left={(_props) => <List.Icon {..._props} icon={'note-alert'} />}
      right={(_props) => (
        <View style={{ alignSelf: 'center', backgroundColor: 'transparent' }}>
          {data.length > 0 && <Badge>{data.length}</Badge>}
        </View>
      )}
      title={lang('Edit Suggestions')}
      onPress={() => push('Problem')}
    />
  );
};

export const toRecentContents = (data: Content[]) =>
  data
    .filter((v) => v.description)
    .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());

const ContentGroupSection = (
  props: { type: 'PAGE' | 'LAST' | 'SUBNOTE' } | { type: 'NOTE'; noteCount: number }
) => {
  const { lang } = useLangContext();
  const notes = useNotePages();
  const pages = useRecentPages();
  const { data: lastPage } = useLastPage();
  const { data: lastBoard } = useLastBoard();
  const currentPage = useCurrentPage(lastPage);
  const currentSplitTitle = currentPage ? getSplitTitle(currentPage.title) : undefined;
  const tabRef = useRef<NodeJS.Timeout>();
  const addRecentPage = useAddRecentPage();
  const deleteRecentPage = useDeleteRecentPage();
  const data =
    props.type === 'NOTE'
      ? notes.data
        ? toRecentContents(notes.data)
        : []
      : props.type === 'SUBNOTE'
      ? currentPage && notes.data
        ? toRecentContents(notes.data.filter((v) => v.title.startsWith(currentPage.title + '/')))
        : []
      : pages.data;
  const lastPageExists = lastPage && data?.find((v) => v.id === lastPage.id) === undefined;
  const window = useResizeContext();
  const itemPadding = getItemPadding(window === 'landscape');
  const noteOnPress = (title: string) => {
    if (title === lastPage?.title) {
      if (tabRef.current) {
        clearTimeout(tabRef.current);
        tabRef.current = undefined;
        addRecentPage.mutate({ title });
      } else {
        tabRef.current = setTimeout(() => {
          tabRef.current = undefined;
        }, 500);
      }
    }
    navigate('NotePage', { title });
  };
  const noteOnLongPress = (title: string) => {
    if (tabRef.current) {
      clearTimeout(tabRef.current);
      tabRef.current = undefined;
    }
    if (pages.data?.find((v) => v.title === title) === undefined) {
      addRecentPage.mutate({ title, direct: true });
    } else {
      deleteRecentPage.mutate(title);
    }
  };
  return (
    (props.type !== 'LAST' || lastPageExists || lastBoard) && (
      <List.Section>
        {data &&
          (props.type === 'LAST' ? (
            <>
              {lastBoard && (
                <List.Item
                  left={(_props) => <List.Icon {..._props} icon={'view-dashboard'} />}
                  title={lastBoard.title}
                  onPress={() => navigate('KanbanPage', { title: lastBoard.title })}
                  style={{ padding: itemPadding }}
                  titleStyle={{ fontStyle: 'italic' }}
                />
              )}
              {lastPageExists && (
                <List.Item
                  left={(_props) => <List.Icon {..._props} icon={'file-document'} />}
                  title={lastPage.title}
                  onPress={() => noteOnPress(lastPage.title)}
                  onLongPress={() => noteOnLongPress(lastPage.title)}
                  style={{ padding: itemPadding }}
                  titleStyle={{ fontStyle: 'italic' }}
                />
              )}
            </>
          ) : props.type === 'NOTE' || props.type === 'SUBNOTE' ? (
            <>
              {props.type === 'SUBNOTE' && currentSplitTitle?.length === 2 && (
                <>
                  <List.Item
                    key={currentSplitTitle[0]}
                    left={(_props) => (
                      <List.Icon
                        {..._props}
                        color="#888B"
                        icon={
                          pages.data?.find((v2) => v2.title === currentSplitTitle[0]) === undefined
                            ? 'notebook'
                            : 'notebook-edit'
                        }
                      />
                    )}
                    title={currentSplitTitle[0]}
                    titleStyle={{ color: '#888B' }}
                    onPress={() => noteOnPress(currentSplitTitle[0])}
                    onLongPress={() => noteOnLongPress(currentSplitTitle[0])}
                    style={{ padding: itemPadding }}
                  />
                  <View
                    style={{
                      height: 1,
                      backgroundColor: 'gray',
                      marginHorizontal: 16,
                      marginVertical: 4,
                      opacity: 0.3,
                    }}
                  />
                </>
              )}
              {data.slice(0, props.type === 'NOTE' ? props.noteCount : undefined).map((v) => (
                <List.Item
                  key={v.title}
                  left={(_props) => (
                    <List.Icon
                      {..._props}
                      icon={
                        pages.data?.find((v2) => v2.title === v.title) === undefined
                          ? 'notebook'
                          : 'notebook-edit'
                      }
                    />
                  )}
                  title={v.title}
                  onPress={() => noteOnPress(v.title)}
                  onLongPress={() => noteOnLongPress(v.title)}
                  style={{ padding: itemPadding }}
                />
              ))}
              <List.Item
                left={(_props) => <List.Icon {..._props} icon={'notebook-multiple'} />}
                title={lang('more...')}
                onPress={() =>
                  props.type === 'NOTE'
                    ? push('RecentPages')
                    : push('RecentPages', { prefix: currentPage?.title + '/' })
                }
                style={{ padding: itemPadding }}
              />
            </>
          ) : (
            data.map((v) => (
              <List.Item
                key={v.title}
                left={(_props) => <List.Icon {..._props} icon={'file-document-edit'} />}
                right={(_props) => (
                  <TouchableRipple
                    style={{
                      justifyContent: 'center',
                      borderRadius: itemPadding,
                      width: 40 + itemPadding * 2,
                      height: 40 + itemPadding * 2,
                      margin: -itemPadding,
                    }}
                    onPress={() => deleteRecentPage.mutate(v.title)}
                  >
                    <List.Icon style={{ left: itemPadding - 7 }} icon={'close'} />
                  </TouchableRipple>
                )}
                title={v.title}
                onPress={() => navigate('NotePage', { title: v.title })}
                style={{ padding: itemPadding }}
              />
            ))
          ))}
      </List.Section>
    )
  );
};

export default ContentGroupSection;
