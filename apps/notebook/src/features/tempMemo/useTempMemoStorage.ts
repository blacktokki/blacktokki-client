import { useAuthContext } from '@blacktokki/account';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from 'react-query';

import { MemoTabs, checksumMemoContent } from './memoTabs';
import { loadMemoTabs, memoStorageKey, saveMemoTabs } from './storage';
import { usePrivate } from '../../hooks/usePrivate';
import { useUsageMode } from '../../hooks/useUsageMode';

export const useTempMemoTabs = () => {
  const { auth } = useAuthContext();
  const { data: privateConfig } = usePrivate();
  const { notebook, usageMode } = useUsageMode();
  const queryClient = useQueryClient();
  const [writeError, setWriteError] = useState<string>();
  const [checksumError, setChecksumError] = useState<string>();
  const pendingChecksums = useRef(new Map<string, { content: string }>());
  const subkey = auth.isLocal ? '' : `${auth.user?.id}`;
  const key = memoStorageKey(
    auth.isLocal ? 'local' : subkey,
    notebook?.id || 0,
    privateConfig.enabled
  );
  const query = useQuery({
    queryKey: ['temporaryMemoTabs', key],
    queryFn: () => loadMemoTabs(key),
    enabled: usageMode !== undefined && auth.isLocal !== undefined,
    staleTime: Infinity,
    cacheTime: Infinity,
  });

  const update = useCallback(
    (updater: (state: MemoTabs) => MemoTabs) => {
      const current = queryClient.getQueryData<MemoTabs>(['temporaryMemoTabs', key]);
      if (!current) return;
      const next = updater(current);
      if (next === current) return;
      queryClient.setQueryData(['temporaryMemoTabs', key], next);
      saveMemoTabs(key, next).then(
        () => setWriteError((failedKey) => (failedKey === key ? undefined : failedKey)),
        () => setWriteError(key)
      );
    },
    [key, queryClient]
  );

  useEffect(() => {
    for (const tab of query.data?.tabs || []) {
      if (tab.contentChecksum !== undefined) continue;
      const content = tab.content || '';
      const jobKey = JSON.stringify([key, tab.id]);
      if (pendingChecksums.current.get(jobKey)?.content === content) continue;
      const job = { content };
      const jobs = pendingChecksums.current;
      jobs.set(jobKey, job);
      checksumMemoContent(content)
        .then((contentChecksum) => {
          update((current) => {
            const latest = current.tabs.find((item) => item.id === tab.id);
            if (
              !latest ||
              (latest.content || '') !== content ||
              latest.contentChecksum !== undefined
            )
              return current;
            return {
              ...current,
              tabs: current.tabs.map((item) =>
                item.id === tab.id
                  ? {
                      ...item,
                      originalChecksum: item.originalChecksum ?? contentChecksum,
                      contentChecksum,
                    }
                  : item
              ),
            };
          });
          setChecksumError((failedKey) => (failedKey === key ? undefined : failedKey));
        })
        .catch(() => setChecksumError(key))
        .finally(() => {
          if (jobs.get(jobKey) === job) jobs.delete(jobKey);
        });
    }
  }, [key, query.data, update]);

  return {
    ...query,
    scope: key,
    update,
    writeError: writeError === key || checksumError === key,
  };
};
