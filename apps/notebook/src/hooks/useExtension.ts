import { useAuthContext } from '@blacktokki/account';
import { NavigationConfig } from '@blacktokki/navigation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery, useQueryClient } from 'react-query';

import { Paragraph } from '../components/HeaderSelectBar';

export type SearchFeature = (item: any) =>
  | {
      screen: string;
      params: any;
    }
  | undefined;

export type NoteSectionProps = {
  title: string;
  path?: string;
  fullParagraph: boolean;
  paragraphs: Paragraph[];
};

type FeatureInfo = {
  title: string;
  description: string;
  isDefault: boolean;
  screens: NavigationConfig['main'];
};

type Feature = {
  search?: SearchFeature;
  buttons: React.JSX.Element[];
  NoteSections: ((props: NoteSectionProps) => React.JSX.Element)[];
  configs: React.JSX.Element[];
};

export const features: Record<string, FeatureInfo & Feature> = {};

const getDefaultConfig = () => {
  return Object.keys(features).filter((k) => features[k].isDefault);
};

const getExtension = (config: string[]) => {
  return {
    info: Object.entries(features).map(([k, v]) => ({
      key: k,
      title: v.title,
      description: v.description,
      active: !!config.find((k2) => k === k2),
    })),
    feature: config.reduce(
      (prev, curr) => {
        const feat = features[curr as keyof typeof features];
        const _search = prev.search;
        prev.search = 'search' in feat ? (item) => _search?.(item) || feat.search?.(item) : _search;
        prev.buttons = [...prev.buttons, ...feat.buttons];
        prev.NoteSections = [...prev.NoteSections, ...feat.NoteSections];
        prev.configs = [...prev.configs, ...feat.configs];
        return prev;
      },
      { buttons: [], NoteSections: [], configs: [] } as Feature
    ),
  };
};

const EXTENSION_KEY = '@blacktokki:notebook:extension:';

const getExtensionConfig = async (subkey: string): Promise<string[]> => {
  const defaultConfig = getDefaultConfig();
  try {
    const jsonValue = await AsyncStorage.getItem(`${EXTENSION_KEY}${subkey}`);
    return jsonValue ? JSON.parse(jsonValue) : defaultConfig;
  } catch (e) {
    console.error('Error loading local private data', e);
    return defaultConfig;
  }
};

const saveExtensionConfig = async (subkey: string, config: string[]): Promise<void> => {
  try {
    const jsonValue = JSON.stringify(config);
    await AsyncStorage.setItem(EXTENSION_KEY + subkey, jsonValue);
  } catch (e) {
    console.error('Error saving private mode', e);
  }
};

export const useExtension = () => {
  const { auth } = useAuthContext();
  const subkey = auth.isLocal ? '' : `${auth.user?.id}`;

  const query = useQuery({
    queryKey: ['extension', subkey],
    queryFn: () => getExtensionConfig(subkey).then(getExtension),
  });
  return { ...query, data: query.data || getExtension(getDefaultConfig()) };
};

export const useSetExtensionConfig = () => {
  const queryClient = useQueryClient();
  const { auth } = useAuthContext();
  const subkey = auth.isLocal ? '' : `${auth.user?.id}`;

  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: boolean }) => {
      const config = await getExtensionConfig(subkey);
      const newConfig = Object.keys(features).filter((k) => {
        const exists = !!config.find((k2) => k === k2);
        if (value) {
          return exists || key === k;
        } else {
          return exists && key !== k;
        }
      });
      await saveExtensionConfig(subkey, newConfig);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['extension', subkey] });
    },
  });
};
