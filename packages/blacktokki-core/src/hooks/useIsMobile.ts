import { Platform } from 'react-native';
//@ts-ignore
import useMobileDetect from 'use-mobile-detect-hook';

export default () => {
  const detectMobile = useMobileDetect();
  return (detectMobile.isMobile() || Platform.OS === 'android' || Platform.OS === 'ios') as boolean;
};
