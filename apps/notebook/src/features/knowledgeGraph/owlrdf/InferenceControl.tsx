import { Text } from '@blacktokki/core';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

import type { InferredKnowledgeGraphEdge } from './inference';
import type { KnowledgeGraphEdge } from '../types';

export const useOwlRdfInferenceView = (
  edges: KnowledgeGraphEdge[],
  inferredEdges: InferredKnowledgeGraphEdge[] | undefined,
  translate: (key: string) => string
) => {
  const [active, setActive] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const count = inferredEdges?.length || 0;
  const toggle = useCallback(() => {
    if (count === 0) {
      setNotice(translate('No inferred relations found'));
      return;
    }
    setNotice(null);
    setActive((current) => !current);
  }, [count, translate]);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(timeout);
  }, [notice]);
  const visibleEdges = useMemo(
    () => (active && count > 0 ? [...edges, ...(inferredEdges || [])] : edges),
    [active, count, edges, inferredEdges]
  );
  return { active, count, notice, toggle, visibleEdges };
};

interface InferenceControlProps {
  active: boolean;
  count: number;
  notice: string | null;
  onToggle: () => void;
  isDark: boolean;
  textColor?: string;
  translate: (key: string) => string;
}

export const OwlRdfInferenceControl: React.FC<InferenceControlProps> = ({
  active,
  count,
  notice,
  onToggle,
  isDark,
  textColor,
  translate,
}) => (
  <>
    <TouchableOpacity
      style={[
        styles.toggle,
        {
          backgroundColor: active
            ? isDark
              ? '#5B2C6F'
              : '#BB8FCE'
            : isDark
            ? 'rgba(255,255,255,0.08)'
            : 'rgba(0,0,0,0.06)',
          borderColor: active ? (isDark ? '#BB8FCE' : '#8E44AD') : 'transparent',
        },
      ]}
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={`${translate('Inferred')} (${count})`}
    >
      <Icon name={active ? 'eye' : 'eye-slash'} size={11} color={active ? '#FFFFFF' : textColor} />
      <Text style={[styles.label, { color: active ? '#FFFFFF' : textColor }]}>
        {translate('Inferred')} ({count})
      </Text>
    </TouchableOpacity>
    {notice && (
      <View style={[styles.notice, { backgroundColor: isDark ? '#392849' : '#F2E6F8' }]}>
        <Text style={[styles.label, { color: textColor }]}>{notice}</Text>
      </View>
    )}
  </>
);

const styles = StyleSheet.create({
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9.5,
    paddingVertical: 5.5,
    borderRadius: 14,
    borderWidth: 1,
  },
  label: { fontSize: 11, fontWeight: '600' },
  notice: { paddingHorizontal: 9.5, paddingVertical: 5.5, borderRadius: 14 },
});
