import LoginScreen from './login/LoginScreen';

export { default as HomeSection } from './main/HomeScreen/HomeSection';
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
