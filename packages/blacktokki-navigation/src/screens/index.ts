import LoginScreen from './login/LoginScreen';

export { default as HomeSection } from './main/HomeScreen/HomeSection';
export { default as AccountEditSection, accountEditStyles } from './main/AccountEditSection';
export {
  ConfigSection,
  LanguageConfigSection,
  SkinConfigSection,
} from './main/HomeScreen/ConfigSections';

export const login = {
  LoginScreen: {
    path: 'login',
    title: 'Sign in',
    component: LoginScreen,
  },
};
