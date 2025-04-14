import React, { useState, useEffect, useRef } from 'react';
import { View, TextInput, FlatList, TouchableOpacity, Text, StyleSheet, Keyboard } from 'react-native';
import { useWikiPages } from '../hooks/useWikiStorage';
import { useColorScheme } from '@blacktokki/core';

type AutocompleteInputProps = {
  value: string;
  onChangeText: (text: string) => void;
  multiline?: boolean;
  style?: any;
  placeholder?: string;
};

export const AutocompleteInput: React.FC<AutocompleteInputProps> = ({
  value,
  onChangeText,
  multiline = true,
  style,
  placeholder,
}) => {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  // const [currentWord, setCurrentWord] = useState('');
  const inputRef = useRef<TextInput>(null);
  const theme = useColorScheme();
  
  const { data: pages = [] } = useWikiPages();

  useEffect(() => {
    const text = value;
    const position = cursorPosition;
    
    // Find the current word being typed
    if (position <= text.length) {
      let startPos = position;
      while (startPos > 0 && text[startPos - 1] !== ' ' && text[startPos - 1] !== '\n') {
        startPos--;
      }
      
      const word = text.substring(startPos, position);
      // setCurrentWord(word);
      
      if (word.length >= 1) {
        const filtered = pages.map(page => page.title).filter(title => 
          title.toLowerCase().includes(word.toLowerCase())
        ).slice(0, 5);
        
        setSuggestions(filtered);
        setShowSuggestions(filtered.length > 0);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }
  }, [value, cursorPosition, pages]);
  
  const handleSelectionChange = (event: any) => {
    setCursorPosition(event.nativeEvent.selection.start);
  };

  const handleSuggestionPress = (suggestion: string) => {
    const text = value;
    const position = cursorPosition;
    
    // Find the start position of the current word
    let startPos = position;
    while (startPos > 0 && text[startPos - 1] !== ' ' && text[startPos - 1] !== '\n') {
      startPos--;
    }
    
    // Replace the current word with the suggestion
    const newText = text.substring(0, startPos) + suggestion + text.substring(position);
    onChangeText(newText);
    
    // Move cursor to the end of the inserted suggestion
    setTimeout(() => {
      const newPosition = startPos + suggestion.length;
      inputRef.current?.setNativeProps({
        selection: { start: newPosition, end: newPosition }
      });
      setCursorPosition(newPosition);
    }, 0);
    
    setShowSuggestions(false);
    Keyboard.dismiss();
  };

  return (
    <View style={styles.container}>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        onSelectionChange={handleSelectionChange}
        multiline={multiline}
        style={[
          styles.input,
          theme === 'dark' ? styles.darkInput : styles.lightInput,
          style
        ]}
        placeholder={placeholder}
        placeholderTextColor={theme === 'dark' ? '#777777' : '#999999'}
      />
      
      {showSuggestions && (
        <View style={[
          styles.suggestionsContainer,
          theme === 'dark' ? styles.darkSuggestionsContainer : styles.lightSuggestionsContainer
        ]}>
          <FlatList
            data={suggestions}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.suggestionItem,
                  theme === 'dark' ? styles.darkSuggestionItem : styles.lightSuggestionItem
                ]}
                onPress={() => handleSuggestionPress(item)}
              >
                <Text 
                  style={theme === 'dark' ? styles.darkSuggestionText : styles.lightSuggestionText}
                >
                  {item}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    width: '100%',
  },
  input: {
    minHeight: 100,
    borderWidth: 1,
    borderRadius: 4,
    padding: 10,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  lightInput: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CCCCCC',
    color: '#333333',
  },
  darkInput: {
    backgroundColor: '#222222',
    borderColor: '#444444',
    color: '#E4E4E4',
  },
  suggestionsContainer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    maxHeight: 150,
    borderWidth: 1,
    borderRadius: 4,
    zIndex: 999,
    elevation: 3,
  },
  lightSuggestionsContainer: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CCCCCC',
  },
  darkSuggestionsContainer: {
    backgroundColor: '#222222',
    borderColor: '#444444',
  },
  suggestionItem: {
    padding: 10,
    borderBottomWidth: 1,
  },
  lightSuggestionItem: {
    borderBottomColor: '#EEEEEE',
  },
  darkSuggestionItem: {
    borderBottomColor: '#333333',
  },
  lightSuggestionText: {
    fontSize: 16,
    color: '#333333',
  },
  darkSuggestionText: {
    fontSize: 16,
    color: '#E4E4E4',
  },
});