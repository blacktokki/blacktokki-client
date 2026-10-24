import { useLangContext } from '@blacktokki/core';
import React, { useEffect, useId, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, Pressable, Text, View } from 'react-native';
import { Icon } from 'react-native-paper';

import { useNotebookTheme } from '../../../../hooks/useNotebookTheme';
import { uniqueRelationEvidence } from '../relationPresentation';
import type { RelationEvidence } from '../relationResults';
import { relationAssociationRank } from '../relationResults';
import { relationAnalysisStyles as styles } from '../styles';

/** Keep navigation links beside, rather than inside, the full-header disclosure button. */
export function RelationAccordion({
  title,
  titleLabel,
  titleInteractive = false,
  summary,
  expanded,
  onToggle,
  renderContent,
  variant = 'branch',
  testID,
  toggleLabel,
}: {
  title: React.ReactNode;
  titleLabel: string;
  titleInteractive?: boolean;
  summary?: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  renderContent: () => React.ReactNode;
  variant?: 'pair' | 'branch' | 'evidence';
  testID?: string;
  toggleLabel?: string;
}) {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const bodyId = useId();
  const header = useRef<View>(null);
  const wasExpanded = useRef(expanded);
  const restoreHeader = useRef(false);
  const motion = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  const [reducedMotion, setReducedMotion] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(
      (value) => active && setReducedMotion(value),
      () => {}
    );
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReducedMotion
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  useEffect(() => {
    const animation = Animated.timing(motion, {
      toValue: expanded ? 1 : 0,
      duration: reducedMotion ? 0 : 160,
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start();
    return () => animation.stop();
  }, [expanded, motion, reducedMotion]);
  useEffect(() => {
    const collapsed = wasExpanded.current && !expanded && restoreHeader.current;
    wasExpanded.current = expanded;
    restoreHeader.current = false;
    // The web ScrollView owns scrolling; nearest alignment also preserves nested scroll containers.
    const node = header.current as unknown as { scrollIntoView?: (options: object) => void };
    if (collapsed && Platform.OS === 'web' && node?.scrollIntoView) {
      const frame = requestAnimationFrame(() =>
        node.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
      );
      return () => cancelAnimationFrame(frame);
    }
  }, [expanded]);
  return (
    <View
      testID={testID}
      style={
        variant === 'pair'
          ? [commonStyles.card, styles.accordionCard]
          : [styles.accordionBranch, { borderColor: commonStyles.card.borderColor }]
      }
    >
      <View ref={header} style={styles.accordionHeader}>
        <Pressable
          testID="relation-accordion-toggle"
          accessibilityRole="button"
          accessibilityLabel={lang(toggleLabel ?? (expanded ? 'Collapse' : 'Expand'))}
          accessibilityHint={titleLabel}
          accessibilityState={{ expanded }}
          aria-expanded={expanded}
          aria-label={`${lang(toggleLabel ?? (expanded ? 'Collapse' : 'Expand'))}: ${titleLabel}`}
          aria-controls={bodyId}
          onPress={() => {
            restoreHeader.current = expanded;
            onToggle();
          }}
          onHoverIn={() => setHovered(true)}
          onHoverOut={() => setHovered(false)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[
            styles.accordionHitArea,
            (hovered || expanded) && {
              backgroundColor: commonStyles.resultsContainer.backgroundColor,
            },
            focused && [styles.accordionFocus, { borderColor: commonStyles.activeTab.color }],
          ]}
        />
        <View style={[styles.passThrough, styles.accordionHeading]}>
          <View style={[styles.passThrough, styles.grow]}>
            <View style={titleInteractive ? styles.passThrough : styles.nonInteractive}>
              {title}
            </View>
            {summary && <View style={styles.nonInteractive}>{summary}</View>}
          </View>
          <Animated.View
            style={[
              styles.nonInteractive,
              styles.accordionChevron,
              {
                transform: [
                  {
                    rotate: motion.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', '90deg'],
                    }),
                  },
                ],
              },
            ]}
          >
            <Icon source="chevron-right" size={20} color={commonStyles.text.color} />
          </Animated.View>
        </View>
      </View>
      <Animated.View
        nativeID={bodyId}
        accessibilityElementsHidden={!expanded}
        aria-hidden={!expanded}
        importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}
        style={[
          styles.accordionContent,
          variant !== 'evidence' && [
            styles.accordionGuide,
            { borderColor: commonStyles.card.borderColor },
          ],
          { opacity: motion },
          !expanded && styles.accordionHidden,
        ]}
      >
        {expanded && renderContent()}
      </Animated.View>
    </View>
  );
}

/** Summaries use all scoped evidence, independently of the currently visible evidence page. */
export function RelationEvidenceSummary({
  items,
  evidenceCount = items.length,
}: {
  items: RelationEvidence[];
  evidenceCount?: number;
}) {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const rank = relationAssociationRank(
    uniqueRelationEvidence(items).map((item) => item.measurement)
  );
  const sourceCount = new Set(items.map((item) => item.observation.noteTitle)).size;
  return (
    <View style={styles.accordionSummary}>
      <Text style={[commonStyles.smallText, styles.accordionMeta]}>
        {lang('Association evidence')}: {evidenceCount}
      </Text>
      <Text style={[commonStyles.smallText, styles.accordionMeta]}>
        {lang('Source Notes')}: {sourceCount}
      </Text>
      {!!rank.evidenceCount && (
        <Text style={[commonStyles.smallText, styles.accordionMeta, styles.accordionScore]}>
          {lang('Association score')}: {(rank.score * 100).toFixed(1)}
        </Text>
      )}
    </View>
  );
}
