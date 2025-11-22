import { User } from '../types';
import account, { getToken, setToken } from './axios';
export { getLocal, setLocal } from './axios';

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
  await setToken(null);
  await account.get('/logout');
}

export async function oauthLogin(token: string) {
  const r = await account.post('/api/v1/user/google', { token });
  if (r.status === 200 && r.data !== '') {
    setToken(r.data);
    return await checkLogin();
  }
}

export const patchUser = async (user: {
  id: number;
  name: string;
  is_guest?: boolean;
  username?: string;
  password?: string;
}) => {
  await account.patch(`/api/v1/user/`, {
    ids: [user.id],
    updated: {
      name: user.name,
      isGuest: user.is_guest,
      username: user.username,
      password: user.password,
    },
  });
};
