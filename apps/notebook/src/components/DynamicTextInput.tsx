import React, { useState } from "react";
import { TextInput } from "react-native";

// 동적 높이 TextInput 컴포넌트
export default ({
    value,
    onChangeText,
    style,
    placeholder,
    autoCapitalize = 'none',
    autoCorrect = false,
    minHeight = 40,
  }: {
    value: string;
    onChangeText: (text: string) => void;
    style?: any;
    placeholder?: string;
    autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
    autoCorrect?: boolean;
    minHeight?: number;
    maxHeight?: number;
  }) => {
    const [height, setHeight] = useState(minHeight);
  
    const handleContentSizeChange = (event: any) => {
      const contentHeight = event.nativeEvent.contentSize.height;
      
      // 높이를 minHeight와 maxHeight 사이로 제한
      const newHeight = Math.max(
        minHeight, 
        contentHeight
      );
  
      setHeight(newHeight);
    };
  
    return (
      <TextInput
        multiline
        value={value}
        onChangeText={onChangeText}
        onContentSizeChange={handleContentSizeChange}
        style={[
          style, 
          { 
            height: height,
            textAlignVertical: 'top',
          }
        ]}
        placeholder={placeholder}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
      />
    );
  };