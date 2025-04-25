import React, { useState, useEffect, createContext, useContext } from 'react';
import { Dimensions } from 'react-native';
//@ts-ignore
import useMobileDetect from 'use-mobile-detect-hook';

type WindowType = 'portrait' | 'landscape';

const getWindowType = (window: { width: number; height: number }) =>
  window.height >= window.width ? 'portrait' : ('landscape' as WindowType);

const ResizeContextContext = createContext<WindowType>(getWindowType(Dimensions.get('window')));

export const ResizeContextProvider = ({ children }: { children: React.ReactNode }) => {
  const detectMobile = useMobileDetect();
  const [windowType, setWindowType] = useState(getWindowType(Dimensions.get('window')));
  useEffect(() => {
    const listener = Dimensions.addEventListener('change', ({ window }) => {
      const newWindowType = getWindowType(window);
      windowType !== newWindowType && setWindowType(newWindowType);
    });
    return () => listener.remove();
  }, [windowType]);
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
