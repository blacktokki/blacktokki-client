import React, {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useMemo,
  Dispatch,
  useState,
} from 'react';

import { checkLogin, login, logout } from '../services/account';
import { User } from '../types';

type AuthAction = {
  type: string;
  username?: string;
  password?: string;
  user?: User | null;
};

export type Auth = { user?: User | null };

type AuthState = {
  user?: User | null;
  request?: { username: string; password: string } | null;
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
    case 'LOGOUT_REQUEST':
      return {
        ...initialState,
        request: null,
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

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [authState, dispatch] = useReducer(authReducer, {} as Auth);
  const [error, setError] = useState<string>();
  const auth = useMemo(
    () => ({
      user: authState.user,
    }),
    [authState]
  );
  useEffect(() => {
    if (authState.user === undefined) {
      checkLogin()
        .then((user) => {
          dispatch({ type: 'LOGIN_SUCCESS', user });
        })
        .catch((e) => {
          console.log(e);
          dispatch({ type: 'LOGOUT_SUCCESS' });
        });
    } else if (authState.user !== undefined && authState.request) {
      login(authState.request.username, authState.request.password)
        .then((user) => {
          dispatch({ type: 'LOGIN_SUCCESS', user });
        })
        .catch((data) => {
          dispatch({ type: 'LOGIN_FAILED' });
          setError(data.response?.data?.message);
        });
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
