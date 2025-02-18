import { User } from '../types';
import account, { getToken, setToken } from './axios';

const checkLoginToken = async () => {
  const value = (await account.get('/api/v1/user/?self=true'))?.data?.value;
  if (value) {
    return value[0] as User;
  }
  return null;
};

export async function checkLogin() {
  const token = await getToken();
  if (token === null) return null;
  try {
    return await checkLoginToken();
  } catch (e: any) {
    let error = e;
    try {
      return await checkLoginToken();
    } catch (e2) {
      error = e2;
    }
    const isOffline =
      (error as any).code === 'ERR_NETWORK' ||
      ((error as any).message && ((error as any).message as string).startsWith('Cannot read'));
    // eslint-disable-next-line no-throw-literal
    throw { error, isOffline };
  }
}

export async function login(username: string, password: string) {
  if (username.endsWith('.guest') && password.length === 0) password = 'guest';
  const formData = new FormData();
  formData.append('username', username);
  formData.append('password', password);
  const r = await account.post('/login', formData);
  const token: string = r.headers['authorization'];
  if (r.status === 200 && token) {
    await setToken(token.split(' ')[1]);
    return await checkLogin();
  }
}
export async function logout() {
  throw new Error('Function not implemented.');
}
