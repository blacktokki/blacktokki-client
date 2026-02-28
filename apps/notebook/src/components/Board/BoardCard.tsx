import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  PanResponder,
  Platform,
  LayoutChangeEvent,
} from 'react-native';

type BoardCardProps<T> = {
  item: T;
  renderItem: (item: T) => React.JSX.Element;
  onStart: () => void;
  onActive: (position: { x: number; y: number }) => void;
  onEnd: (position: { x: number; y: number }) => boolean;
  onLayout: (event: LayoutChangeEvent) => void;
};

export default <T,>({
  item,
  renderItem,
  onStart,
  onActive,
  onEnd,
  onLayout,
}: BoardCardProps<T>) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const zIndexAnim = useRef(new Animated.Value(0)).current;

  const contextRef = useRef({
    translateX: 0,
    translateY: 0,
    startX: 0,
    startY: 0,
    onEnd,
  });
  contextRef.current.onEnd = onEnd;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5;
      },
      onPanResponderGrant: (event) => {
        const { locationX, locationY } = event.nativeEvent;

        contextRef.current.translateX = (translateX as any)._value;
        contextRef.current.translateY = (translateY as any)._value;
        contextRef.current.startX = locationX;
        contextRef.current.startY = locationY;

        onStart();
        Animated.timing(zIndexAnim, {
          toValue: 100,
          duration: 1,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderMove: (event, gestureState) => {
        const { dx, dy } = gestureState;
        const context = contextRef.current;

        const newX = dx + context.translateX;
        const newY = dy + context.translateY;

        translateX.setValue(newX);
        translateY.setValue(newY);

        onActive({
          x: dx + context.startX,
          y: dy + context.startY,
        });
      },
      onPanResponderRelease: (event, gestureState) => {
        const { dx, dy } = gestureState;
        const context = contextRef.current;

        const finalX = dx + context.startX;
        const finalY = dy + context.startY;

        const shouldKeepPosition = contextRef.current.onEnd({ x: finalX, y: finalY });

        if (!shouldKeepPosition) {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();

          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
          Animated.timing(zIndexAnim, {
            toValue: 0,
            duration: 1,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;
  useEffect(() => {
    translateX.setValue(0);
    translateY.setValue(0);
    zIndexAnim.setValue(0);
  }, [item]);

  return (
    <Animated.View style={[styles.container, { zIndex: zIndexAnim }]} onLayout={onLayout}>
      <View style={styles.dropzone}>
        <Animated.View
          {...panResponder.panHandlers}
          style={{
            transform: [{ translateX }, { translateY }],
          }}
        >
          {renderItem(item)}
        </Animated.View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: {
        userSelect: 'none',
        touchAction: 'none',
      } as any,
    }),
  },
  dropzone: {
    backgroundColor: 'transparent',
    width: '100%',
    height: '100%',
  },
});
