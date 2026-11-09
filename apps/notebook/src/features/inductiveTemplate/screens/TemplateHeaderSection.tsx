import { useLangContext, useResizeContext } from '@blacktokki/core';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { useNotebookTheme } from '../../../hooks/useNotebookTheme';
import {
  getPageSectionStyle,
  HeaderIconButton,
  NotePageHeader,
  pageStyles,
} from '../../../screens/main/NoteItemSections';
import { templateStyles as styles } from '../styles';

/** Share catalog navigation, titles and optional actions across template stages. */
export const TemplateHeaderSection = ({
  templateName,
  canWrite,
  onSources,
  onWriting,
  onCatalog,
  onTitlePress,
  titleSuffix,
  groupPath = '',
  onGroupPress,
  actions,
}: {
  templateName: string;
  canWrite?: boolean;
  onSources?: () => void;
  onWriting?: () => void;
  onCatalog?: () => void;
  onTitlePress?: () => void;
  titleSuffix?: string;
  groupPath?: string;
  onGroupPress?: (path: string) => void;
  actions?: React.ReactNode;
}) => {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const headerStyle = getPageSectionStyle(
    useResizeContext() === 'portrait',
    commonStyles.container.paddingHorizontal
  );
  const [catalogHovered, setCatalogHovered] = useState(false);
  const [catalogFocused, setCatalogFocused] = useState(false);
  const groups = groupPath.split('/').filter(Boolean);
  const title = [templateName + (titleSuffix ? ' - ' + titleSuffix : ''), ...groups].join('/');
  return (
    <View style={[commonStyles.header, pageStyles.header, headerStyle]}>
      <View style={[styles.grow, styles.headerPath]}>
        {onCatalog && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={lang('Back to templates')}
            onPress={onCatalog}
            onHoverIn={() => setCatalogHovered(true)}
            onHoverOut={() => setCatalogHovered(false)}
            onFocus={() => setCatalogFocused(true)}
            onBlur={() => setCatalogFocused(false)}
            style={({ pressed }) => [
              commonStyles.title,
              commonStyles.navButton,
              styles.headerCatalog,
              { borderColor: commonStyles.input.borderColor },
              catalogHovered && { borderColor: commonStyles.icon.color },
              catalogFocused && commonStyles.focusedBorder,
              pressed && styles.pressed,
            ]}
          >
            <Icon
              name="file-document-multiple-outline"
              size={pageStyles.title.fontSize}
              color={commonStyles.icon.color}
            />
          </Pressable>
        )}
        <NotePageHeader
          title={title}
          onPress={(_, hasChild) => {
            if (groups.length) {
              onGroupPress?.((hasChild ? groups.slice(0, -1) : groups).join('/'));
            } else onTitlePress?.();
          }}
        />
      </View>
      {(actions || onSources || onWriting) && (
        <View style={[pageStyles.actionButtons, styles.headerActions]}>
          {actions || (onSources && <HeaderIconButton name="th-large" onPress={onSources} />)}
          {onWriting && (
            <HeaderIconButton
              name="pencil"
              color={canWrite ? undefined : commonStyles.smallText.color}
              onPress={() => {
                if (canWrite) onWriting();
              }}
            />
          )}
        </View>
      )}
    </View>
  );
};
