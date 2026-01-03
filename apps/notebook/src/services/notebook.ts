import { axiosCreate } from '@blacktokki/account';

import { Content, PostContent, Link, Pat, FetchPrivacyConfig } from '../types';

const axios = axiosCreate('notebook');

export const getContentOne = async (id: number) => {
  return (await axios.get(`/api/v1/content/${id}`)).data as Content;
};

export const getContentList = async (
  parentId?: number,
  types?: Content['type'][],
  page?: number
) => {
  const parentIdParam = parentId !== undefined ? `&parentId=${parentId}` : '';
  const typeParam = types !== undefined ? `&types=${types.join(',')}` : '';
  const pageParam = page !== undefined ? `&size=20&page=${page}` : '&size=256';
  return (await axios.get(`/api/v1/content?sort=id,DESC${parentIdParam}${typeParam}${pageParam}`))
    .data.value as Content[];
};

export const getPrivacyConfigs = async () => {
  const configs = (await axios.get('/api/v1/content?types=CONFIG&size=256')).data
    .value as Content[];
  return Object.fromEntries(
    configs
      .filter((v) => v.title.startsWith('privacy.'))
      .map((v) => [v.title.substring(8), [v.id, v.description === 'true']])
  ) as FetchPrivacyConfig;
};

export const postContent = async (postContent: PostContent, token?: string) => {
  let config = undefined;
  if (token) {
    config = { headers: { Authorization: `JWT ${token}` } };
  }
  return ((await axios.post(`/api/v1/content`, postContent, config)).data as Content).id;
};

export const patchContent = async (id: number, updated: PostContent, token?: string) => {
  let config = undefined;
  if (token) {
    config = { headers: { Authorization: `JWT ${token}` } };
  }
  await axios.patch(`/api/v1/content`, { ids: [id], updated }, config);
};

export const deleteContent = async (id: number) => {
  await axios.delete(`/api/v1/content/${id}`);
};

export const previewUrl = async (preview: { query: string }) => {
  return (await axios.get(`/api/v1/preview/autocomplete?query=${preview.query}`)).data as Link;
};

export const postPat = async () => {
  return (await axios.post(`/api/v1/pat`)).data as string;
};

export const getPatList = async () => {
  return (await axios.get(`/api/v1/pat`)).data as Pat[];
};

export const deletePat = async (id: number) => {
  await axios.delete(`/api/v1/pat/${id}`);
};
