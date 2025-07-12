import { Text, useColorScheme } from '@blacktokki/core';
import { TouchableOpacity, View, FlatList, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

import { createCommonStyles } from '../styles';

export interface Paragraph {
  path: string;
  autoSection?: string;
  title: string;
  level: number;
  header: string;
  description: string;
}

export function parseHtmlToParagraphs(html: string): Paragraph[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const result: Paragraph[] = [{ path: '', title: '', header: '', level: 0, description: '' }];

  const headings: string[] = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'];
  const headerStack: { level: number; title: string }[] = [];
  const titleSet = new Set<string>();
  const titleDuplicate = new Set<string>();

  let current: Paragraph | null = null;
  let cursor = doc.body.firstChild;

  const flushCurrent = () => {
    if (current) {
      result.push(current);
      current = null;
    }
  };

  while (cursor) {
    if (cursor.nodeType === Node.ELEMENT_NODE) {
      const el = cursor as HTMLElement;
      if (headings.includes(el.tagName)) {
        flushCurrent();

        const level = parseInt(el.tagName.substring(1), 10);
        const title = el.textContent?.trim() || '';

        // 헤더 스택 업데이트
        while (headerStack.length > 0 && headerStack[headerStack.length - 1].level >= level) {
          headerStack.pop();
        }
        headerStack.push({ level, title });

        const path = headerStack.map((h) => btoa(encodeURIComponent(h.title))).join(',');

        if (!titleSet.has(title)) {
          titleSet.add(title);
        } else if (!titleDuplicate.has(title)) {
          titleDuplicate.add(title);
        }

        current = {
          path,
          title,
          level,
          header: el.outerHTML,
          description: '',
        };
      } else if (current) {
        current.description += el.outerHTML;
      } else {
        // 헤더 밖의 내용 처리
        result[0].description += el.outerHTML;
      }
    } else if (cursor.nodeType === Node.TEXT_NODE && current) {
      current.description += cursor.textContent || '';
    }

    cursor = cursor.nextSibling;
  }

  flushCurrent();
  titleDuplicate.forEach((title) => {
    let parentDuplicate: Set<string | undefined> | undefined;
    let level = 1;
    while ((parentDuplicate === undefined || parentDuplicate.size > 0) && level < 6) {
      const targets = result.filter(
        (v) =>
          v.title === title && (v.autoSection === undefined || parentDuplicate?.has(v.autoSection))
      );
      const parentSet = new Set<string>();
      parentDuplicate = new Set<string>();
      targets.forEach((v) => {
        const pathReverse = v.path.split(',').reverse();
        if (pathReverse.length <= level) {
          return;
        }
        v.autoSection = atob(decodeURIComponent(pathReverse[level]));
        if (!parentSet.has(v.autoSection)) {
          parentSet.add(v.autoSection);
        } else if (!parentDuplicate?.has(v.autoSection)) {
          parentDuplicate?.add(v.autoSection);
        }
      });
      level += 1;
    }
  });
  return result;
}

export default function HeaderSelectBar(props: {
  root: string;
  path: string;
  onPress: (item: Paragraph) => void;
  data: Paragraph[];
}) {
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const renderItem = (item: Paragraph) => (
    <TouchableOpacity style={styles.resultItem} onPress={() => props.onPress(item)}>
      {item.level === 0 && <Icon name="file-text-o" size={18} color="#FFFFFF" />}
      <Text
        style={[
          props.path === item.path
            ? [commonStyles.title, { marginBottom: 5, marginTop: 3 }]
            : commonStyles.text,
          styles.resultText,
          { left: item.level * 10 + 10 },
        ]}
      >
        {item.level === 0 ? props.root : item.title}
      </Text>
    </TouchableOpacity>
  );
  return (
    <View
      style={[styles.resultsContainer, theme === 'dark' ? styles.darkResults : styles.lightResults]}
    >
      <FlatList
        data={props.data}
        keyExtractor={(item) => item.path}
        renderItem={({ item }) => renderItem(item)}
        ItemSeparatorComponent={() => <View style={commonStyles.resultSeparator} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  backButton: {
    padding: 8,
  },
  resultItem: {
    padding: 10,
    flexDirection: 'row',
  },
  resultText: {
    fontSize: 14,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  resultsContainer: {
    borderWidth: 1,
    borderRadius: 4,
  },
  lightResults: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CCCCCC',
  },
  darkResults: {
    backgroundColor: '#222222',
    borderColor: '#444444',
  },
});
