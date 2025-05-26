import { useLangContext, useResizeContext, View } from '@blacktokki/core';
import { navigate, push } from '@blacktokki/navigation';
import React, { useRef } from 'react';
import { List, TouchableRipple, Badge } from 'react-native-paper';

import {
  useRecentPages,
  useNotePages,
  useDeleteRecentPage,
  useLastPage,
  useAddRecentPage,
} from '../../../hooks/useNoteStorage';
import useProblem from '../../../hooks/useProblem';
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
      title={lang('TimeLine')}
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
      title={lang('Problems')}
      onPress={() => push('Problem')}
    />
  );
};

export const toRecentContents = (data: Content[]) =>
  data
    .filter((v) => v.description)
    .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());

const ContentGroupSection = (
  props: { type: 'PAGE' | 'LAST' } | { type: 'NOTE'; noteCount: number }
) => {
  const { lang } = useLangContext();
  const notes = useNotePages();
  const pages = useRecentPages();
  const { data: lastPage } = useLastPage();
  const tabRef = useRef<NodeJS.Timeout>();
  const addRecentPage = useAddRecentPage();
  const deleteRecentPage = useDeleteRecentPage();
  const data =
    props.type === 'NOTE' ? (notes.data ? toRecentContents(notes.data) : []) : pages.data;
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
    (props.type !== 'LAST' || lastPageExists) && (
      <List.Section>
        {data &&
          (props.type === 'LAST' ? (
            lastPageExists && (
              <List.Item
                left={(_props) => <List.Icon {..._props} icon={'file-document'} />}
                title={lastPage.title}
                onPress={() => noteOnPress(lastPage.title)}
                onLongPress={() => noteOnLongPress(lastPage.title)}
                style={{ padding: itemPadding }}
                titleStyle={{ fontStyle: 'italic' }}
              />
            )
          ) : props.type === 'NOTE' ? (
            <>
              {data.slice(0, props.noteCount).map((v) => (
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
                onPress={() => push('RecentPages')}
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
