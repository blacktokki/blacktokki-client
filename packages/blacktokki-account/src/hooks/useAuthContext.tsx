import React, {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useMemo,
  Dispatch,
  useState,
} from 'react';

import { checkLogin, getLocal, login, logout, setLocal } from '../services/account';
import { User } from '../types';

type AuthAction = {
  type: string;
  username?: string;
  password?: string;
  user?: User | null;
  useLocal?: boolean;
};

type GuestType = 'account' | 'local';

export type Auth = (
  | { user: User | null; isLogin: boolean; isLocal: boolean }
  | { user?: undefined; isLogin?: undefined; isLocal?: undefined }
) & {
  guestType?: GuestType;
};
type AuthState = {
  user?: User | null;
  request?:
    | { username: string; password: string }
    | { username?: undefined; useLocal: boolean }
    | null;
  useLocal?: boolean;
};

const AuthContext = createContext<{ auth: Auth; error?: string; dispatch: Dispatch<AuthAction> }>({
  auth: {},
  dispatch: () => {},
});

const authReducer = (initialState: AuthState, action: AuthAction) => {
  switch (action.type) {
    case 'LOGIN_REQUEST':
      return {
        ...initialState,
        request: { username: action.username, password: action.password },
      } as AuthState;
    case 'LOGIN_GUEST':
      return {
        ...initialState,
        request: { username: 'guest', password: 'guest' },
      } as AuthState;
    case 'LOGIN_LOCAL':
      return {
        ...initialState,
        request: { useLocal: true },
      };
    case 'LOGIN_SUCCESS':
      return {
        ...initialState,
        user: action.user,
        request: undefined,
      };
    case 'LOGIN_FAILED':
      return {
        ...initialState,
        request: undefined,
      };
    case 'LOCAL_SUCCESS':
      return {
        ...initialState,
        useLocal: action.useLocal,
        request: undefined,
      };
    case 'LOGOUT_REQUEST':
      return {
        ...initialState,
        request: null,
      };
    case 'LOGOUT_LOCAL':
      return {
        ...initialState,
        request: { useLocal: false },
      };
    case 'LOGOUT_SUCCESS':
      return {
        ...initialState,
        user: null,
        request: undefined,
      };
    case 'REFRESH':
      return {
        ...initialState,
        user: undefined,
      };
    default:
      throw new Error(`Unhandled action type: ${action.type}`);
  }
};

export const AuthProvider = ({
  children,
  guestType,
}: {
  children: React.ReactNode;
  guestType?: GuestType;
}) => {
  const [authState, dispatch] = useReducer(authReducer, {});
  const [error, setError] = useState<string>();
  const auth = useMemo(
    () =>
      ({
        user: authState.user,
        isLogin:
          authState.user !== undefined ? authState.user !== null || authState.useLocal : undefined,
        isLocal: authState.useLocal,
        guestType,
      } as Auth),
    [authState]
  );
  useEffect(() => {
    if (authState.useLocal === undefined) {
      getLocal().then((useLocal) => {
        dispatch({ type: 'LOCAL_SUCCESS', useLocal });
      });
    } else if (authState.user === undefined) {
      checkLogin()
        .then((user) => {
          dispatch({ type: 'LOGIN_SUCCESS', user });
        })
        .catch((e) => {
          console.log(e);
          dispatch({ type: 'LOGOUT_SUCCESS' });
        });
    } else if (authState.user !== undefined && authState.request) {
      if (authState.request.username !== undefined) {
        login(authState.request.username, authState.request.password)
          .then((user) => {
            dispatch({ type: 'LOGIN_SUCCESS', user });
          })
          .catch((data) => {
            dispatch({ type: 'LOGIN_FAILED' });
            setError(data.response?.data?.message);
          });
      } else {
        const useLocal = authState.request.useLocal;
        setLocal(useLocal).then(() => {
          dispatch({ type: 'LOCAL_SUCCESS', useLocal });
        });
      }
    } else if (authState.user && authState.request === null) {
      logout().then(() => dispatch({ type: 'LOGOUT_SUCCESS' }));
    }
  }, [authState]);
  return <AuthContext.Provider value={{ auth, error, dispatch }}>{children}</AuthContext.Provider>;
};

export default () => {
  const authContext = useContext(AuthContext);
  return authContext;
};
