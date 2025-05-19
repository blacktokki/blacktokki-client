import AsyncStorage from '@react-native-async-storage/async-storage';
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

const API_URL = 'https://blacktokki.com';

const needRefresh = (response: AxiosResponse<any, any>) => {
  return (
    (response.config.url === '/api/v1/user/?self=true' &&
      response.request.responseURL.endsWith('account/login')) ||
    response.status === 401
  );
};

const allAxios: AxiosInstance[] = [];

export const axiosCreate = (service: string) => {
  const baseURL = `${API_URL}/${service}/`;
  const defaultOption: AxiosRequestConfig = {
    baseURL,
    withCredentials: true,
    headers: {},
  };
  const _axios = axios.create(defaultOption);
  _axios.interceptors.response.use(
    async (response: AxiosResponse<any, any>) => {
      if (needRefresh(response)) {
        await refreshToken();
        // eslint-disable-next-line no-throw-literal
        throw { response };
      }
      return response;
    },
    async (error: any) => {
      if (needRefresh(error.response) || error.response.status === 403) {
        await refreshToken();
      }
      return Promise.reject(error);
    }
  );
  allAxios.push(_axios);
  return _axios;
};

const account = axiosCreate('account');

const refreshToken = async () => {
  return getToken().then(async (token) => {
    if (token) {
      const r = await account.post(
        '/api/v1/user/token/refresh/',
        { token },
        { headers: { Authorization: '' } }
      );
      if (r.status === 200 && r.data !== '') {
        await setToken(r.data);
      }
    }
  });
};

export const setToken = async (token: string | null) => {
  allAxios.forEach((_axios) => {
    _axios.defaults.headers['Authorization'] = `JWT ${token}`;
  });
  if (token) await AsyncStorage.setItem('Authorization', token);
  else AsyncStorage.removeItem('Authorization');
};

export const getToken = async () => {
  const token = await AsyncStorage.getItem('Authorization');
  allAxios.forEach((_axios) => {
    _axios.defaults.headers['Authorization'] = token ? `JWT ${token}` : null;
  });
  return token;
};

export const setLocal = async (isLocal: boolean) => {
  await AsyncStorage.setItem('Authorization:Local', isLocal ? 'true' : 'false');
};

export const getLocal = async () => {
  const isLocal = await AsyncStorage.getItem('Authorization:Local');
  return isLocal !== 'false';
};

export default account;
