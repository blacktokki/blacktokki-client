import { useAuthContext } from '@blacktokki/account';
import { useIsFocused } from '@react-navigation/core';
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';

import { focusListener, getContents, saveContents } from './useNoteStorage';
import { BoardOption, Content, PostContent } from '../types';
import { isHiddenTitle, usePrivacy } from './usePrivacy';

export const useBoardPages = () => {
  const { auth } = useAuthContext();
  const { isPrivacyMode } = usePrivacy();

  return useQuery({
    queryKey: ['boardContents', !auth.isLocal, isPrivacyMode],
    queryFn: async () =>
      (await getContents({ isOnline: !auth.isLocal, types: ['BOARD'] }))
        .filter((v) => isPrivacyMode || !isHiddenTitle(v.title))
        .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime()),
  });
};

export const useBoardPage = (title: string) => {
  const queryClient = useQueryClient();
  const isFocused = useIsFocused();
  const { isPrivacyMode } = usePrivacy();
  const { auth } = useAuthContext();
  const subkey = auth.isLocal ? '' : `${auth.user?.id}`;
  const { data: contents = [], isFetching } = useBoardPages();

  const query = useQuery({
    queryKey: ['boardContent', title],
    queryFn: async () => {
      const page = contents.find((c) => c.title === title);
      return page;
    },
    enabled: !isFetching,
  });

  useEffect(() => {
    const id = query.data?.id;
    if (id && isFocused) {
      focusListener.forEach((f) => f(queryClient, isPrivacyMode, id));
    }
  }, [query.data, isFocused, subkey, queryClient]);

  return query;
};

export const useCreateOrUpdateBoard = () => {
  const queryClient = useQueryClient();
  const { auth } = useAuthContext();
  const { data: contents = [] } = useBoardPages();
  return useMutation({
    mutationFn: async ({
      id,
      title,
      description,
      option,
    }: {
      id?: number;
      title: string;
      description: string;
      option: BoardOption;
    }) => {
      const page = contents.find((c) => c.id === id);
      let updatedContents: (Content | PostContent)[];
      const updated = auth.isLocal ? new Date().toISOString() : undefined;
      if (page) {
        updatedContents = contents.map((c, i) =>
          c.id === page.id ? ({ ...c, title, description, updated, option } as PostContent) : c
        );
      } else {
        const newPage = {
          title,
          description,
          input: title,
          userId: auth.user?.id || 0,
          parentId: 0,
          type: 'BOARD',
          order: 0,
          updated,
          option,
        } as PostContent;
        updatedContents = [...contents, newPage];
      }
      await saveContents(!auth.isLocal, 'BOARD', updatedContents, page?.id);
      return { id };
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ['lastTab'] });
      await queryClient.invalidateQueries({ queryKey: ['boardContent'] });
      await queryClient.invalidateQueries({ queryKey: ['boardContents'] });
    },
  });
};

export const useDeleteBoard = () => {
  const queryClient = useQueryClient();
  const { auth } = useAuthContext();
  const { data: contents = [] } = useBoardPages();
  return useMutation({
    mutationFn: async (id: number) => {
      const updatedContents = contents.filter((c) => c.id !== id);
      await saveContents(!auth.isLocal, 'BOARD', updatedContents, id);
      return { id };
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ['lastTab'] });
      await queryClient.invalidateQueries({ queryKey: ['boardContent'] });
      await queryClient.invalidateQueries({ queryKey: ['boardContents'] });
    },
  });
};
