import React, {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useMemo,
  Dispatch,
  useState,
} from 'react';

import {
  checkLogin,
  createOtp,
  getLocal,
  login,
  logout,
  oauthLogin,
  setLocal,
  verifyOtp,
} from '../services/account';
import { User, OtpVerify, OtpResponse } from '../types';

type AuthAction = {
  type: string;
  username?: string;
  password?: string;
  oauth?: string;
  otpSecretKey?: string;
  otpCode?: number;
  resetOtp?: boolean;
  user?: User | null;
};

type GuestType = 'account' | 'local';

export type Auth = (
  | { user: User | null; isLogin: boolean; isLocal: boolean }
  | { user?: undefined; isLogin?: undefined; isLocal?: undefined }
) & {
  useOtp?: boolean | null;
  guestType?: GuestType;
  isLoading?: boolean;
};
type AuthState = {
  user?: User | null;
  otpRequest?: OtpVerify;
  request?:
    | { type: 'login'; username: string; password: string }
    | { type: 'oauth'; oauth: string }
    | { type: 'logout'; resetOtp?: boolean };
  useLocal?: boolean;
};

const AuthContext = createContext<{
  auth: Auth;
  error?: string;
  dispatch: Dispatch<AuthAction>;
  otp?: {
    create: () => Promise<OtpResponse>;
    verify: (code: number) => Promise<boolean>;
  };
}>({
  auth: {},
  dispatch: () => {},
});

const authReducer = (initialState: AuthState, action: AuthAction) => {
  switch (action.type) {
    case 'LOGIN_REQUEST':
      return {
        ...initialState,
        request: { type: 'login', username: action.username, password: action.password },
      } as AuthState;
    case 'OAUTH_REQUEST':
      return {
        ...initialState,
        request: { type: 'oauth', oauth: action.oauth },
      } as AuthState;
    case 'LOGIN_GUEST':
      return {
        ...initialState,
        request: { type: 'login', username: 'guest', password: 'guest' },
      } as AuthState;
    case 'LOGIN_LOCAL':
      return {
        ...initialState,
        useLocal: true,
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
    case 'OTP_REQUEST':
      return {
        ...initialState,
        otpRequest: { secretKey: action.otpSecretKey, code: action.otpCode },
      } as AuthState;
    case 'OTP_SUCCESS':
      return {
        ...initialState,
        user: action.user,
        otpRequest: undefined,
      };
    case 'LOGOUT_REQUEST':
      return {
        ...initialState,
        request: { type: 'logout', resetOtp: action.resetOtp },
      } as AuthState;
    case 'LOGOUT_LOCAL':
      return {
        ...initialState,
        useLocal: false,
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
        useOtp:
          authState.user && !authState.useLocal
            ? authState.user.otpDeletionRequested !== undefined
            : authState.otpRequest
            ? null
            : undefined,
        guestType,
        isLoading:
          authState.request !== undefined ||
          (authState.user === undefined && authState.useLocal !== undefined),
      } as Auth),
    [authState]
  );
  const otp = useMemo(() => {
    if (authState.user && !authState.useLocal) {
      return {
        create: createOtp,
        verify: (code: number) => verifyOtp({ code }),
      };
    }
  }, [authState]);
  useEffect(() => {
    if (authState.useLocal === undefined) {
      getLocal().then((useLocal) => {
        dispatch({ type: useLocal ? 'LOGIN_LOCAL' : 'LOGOUT_LOCAL' });
      });
    } else {
      if (authState.user === undefined) {
        checkLogin()
          .then((user) => {
            dispatch({ type: 'LOGIN_SUCCESS', user });
          })
          .catch((e) => {
            console.log(e);
            dispatch({ type: 'LOGOUT_SUCCESS' });
          });
      } else if (
        authState.user !== undefined &&
        authState.request &&
        authState.request.type !== 'logout'
      ) {
        (authState.request.type === 'oauth'
          ? oauthLogin(authState.request.oauth)
          : login(authState.request.username, authState.request.password)
        )
          .then((user) => {
            dispatch({ type: 'LOGIN_SUCCESS', user });
          })
          .catch((data) => {
            dispatch({ type: 'LOGIN_FAILED' });
            setError(data.response?.data?.message);
          });
      } else if (authState.user && authState.request?.type === 'logout') {
        logout(authState.request.resetOtp).then((success) =>
          success ? dispatch({ type: 'LOGOUT_SUCCESS' }) : undefined
        );
      } else if (authState.user && authState.otpRequest) {
        const user = authState.user;
        verifyOtp(authState.otpRequest).then((isSuccess) => {
          dispatch({
            type: 'OTP_SUCCESS',
            user: { ...user, otpDeletionRequested: isSuccess ? false : undefined },
          });
        });
      }
      setLocal(authState.useLocal);
    }
  }, [authState]);
  return (
    <AuthContext.Provider value={{ auth, error, dispatch, otp }}>{children}</AuthContext.Provider>
  );
};

export default () => {
  const authContext = useContext(AuthContext);
  return authContext;
};
