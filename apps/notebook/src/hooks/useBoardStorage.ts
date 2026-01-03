import { useAuthContext } from '@blacktokki/account';
import { useIsFocused } from '@react-navigation/core';
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';

import { focusListener, getContents, saveContents } from './useNoteStorage';
import { BoardOption, Content, PostContent } from '../types';
import { usePrivacy } from './usePrivacy';

export const useBoardPages = () => {
  const { auth } = useAuthContext();
  const { data: privacy } = usePrivacy();

  return useQuery({
    queryKey: ['boardContents', !auth.isLocal, privacy.enabled],
    queryFn: async () =>
      (await getContents({ isOnline: !auth.isLocal, types: ['BOARD'] })).sort(
        (a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime()
      ),
  });
};

export const useBoardPage = (title: string) => {
  const queryClient = useQueryClient();
  const isFocused = useIsFocused();
  const { data: privacy } = usePrivacy();
  const { auth } = useAuthContext();
  const subkey = auth.isLocal ? '' : `${auth.user?.id}`;
  const { data: contents = [], isFetching } = useBoardPages();

  const query = useQuery({
    queryKey: ['boardContent', title, privacy.enabled],
    queryFn: async () => {
      const page = contents.find((c) => c.title === title);
      return page;
    },
    enabled: !isFetching,
  });

  useEffect(() => {
    const id = query.data?.id;
    if (id && isFocused) {
      (async () => {
        for (const f of focusListener) {
          await f(queryClient, id);
        }
      })();
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
      let updatedContent: Content | PostContent;
      const updated = auth.isLocal ? new Date().toISOString() : undefined;
      if (page) {
        updatedContent = { ...page, title, description, updated, option } as PostContent;
      } else {
        updatedContent = {
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
      }
      await saveContents(!auth.isLocal, 'BOARD', [updatedContent], page?.id);
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
  return useMutation({
    mutationFn: async (id: number) => {
      await saveContents(!auth.isLocal, 'BOARD', [], id);
      return { id };
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ['lastTab'] });
      await queryClient.invalidateQueries({ queryKey: ['boardContent'] });
      await queryClient.invalidateQueries({ queryKey: ['boardContents'] });
    },
  });
};
