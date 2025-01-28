import React, { useState, useEffect, createContext, useContext } from 'react';
import { Dimensions, useWindowDimensions } from 'react-native';
//@ts-ignore
import useMobileDetect from 'use-mobile-detect-hook';

type WindowType = 'portrait' | 'landscape';

const getWindowType = (window: { width: number; height: number }) =>
  window.height >= window.width ? 'portrait' : ('landscape' as WindowType);

const ResizeContextContext = createContext<WindowType>(getWindowType(Dimensions.get('window')));

export const ResizeContextProvider = ({ children }: { children: React.ReactNode }) => {
  const detectMobile = useMobileDetect();
  const { width, height } = useWindowDimensions();
  const [windowType, setWindowType] = useState(getWindowType({ width, height }));
  useEffect(() => {
    setWindowType(getWindowType({ width, height }));
  }, [width, height]);
  return (
    <ResizeContextContext.Provider value={detectMobile.isMobile() ? 'portrait' : windowType}>
      {children}
    </ResizeContextContext.Provider>
  );
};

export default function useResizeContext() {
  const windowType = useContext(ResizeContextContext);
  return windowType;
}
