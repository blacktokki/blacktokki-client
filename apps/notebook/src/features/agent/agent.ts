import { axiosCreate } from '@blacktokki/account';

const axios = axiosCreate('agent');

type SearchResult = {
  id: number;
  distance: number;
  title: string;
  paragraph?: string;
  link?: { origin: string; url: string; text: string };
  description: string;
};

export const search = async (
  query: string,
  page: number,
  withHidden: boolean,
  exact?: boolean,
  withExternal?: boolean
) => {
  const exactParam = exact ? `&exact=true` : '';
  const withExternalParam = withExternal ? `&withExternal=true` : '';
  return (
    (
      await axios.get(
        `/search?query=${query}&page=${page}&size=20&withHidden=${withHidden}${exactParam}${withExternalParam}`
      )
    ).data as any[]
  ).map((v) => {
    let paragraph: string | undefined = undefined;
    for (const h of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
      if (!v.metadata.with_external && v.metadata[h]) {
        paragraph = v.metadata[h];
      }
    }
    return {
      id: v.metadata.original_id,
      distance: v.distance,
      title: v.metadata.title,
      paragraph,
      link: v.metadata.with_external ? JSON.parse(v.metadata.links)[0] : undefined,
      description: (v.document as string).substring((v.metadata.prefix as string).length),
    } as SearchResult;
  });
};
