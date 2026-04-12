import { useResizeContext } from '@blacktokki/core';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/core';
import { StackNavigationProp } from '@react-navigation/stack';
import React from 'react';

import { RecentPagesSection } from './RecentPageSection';
import { ResponsiveSearchBar } from '../../components/SearchBar';
import { NavigationParamList } from '../../types';

type RecentPagesScreenRouteProp = RouteProp<NavigationParamList, 'RecentPages'>;

export const RecentPagesScreen: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const route = useRoute<RecentPagesScreenRouteProp>();
  const window = useResizeContext();
  return (
    <>
      <ResponsiveSearchBar />
      <RecentPagesSection
        title={route.params?.title}
        setTitle={(title) =>
          title === undefined && window === 'portrait'
            ? navigation.navigate('Home', { tab: 1 } as any)
            : navigation.navigate('RecentPages', { title })
        }
      />
    </>
  );
};
