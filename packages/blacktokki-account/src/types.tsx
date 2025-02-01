type BaseUser = {
  is_staff: boolean;
  is_guest: boolean;
  name: string;
  username: string;
  imageUrl?: string;
};

export type User = BaseUser & {
  id: number;
};

export type CreateUser = BaseUser & {
  password: string;
  inviteGroupId: number;
};

export type Membership = {
  id?: number;
  root_group_id?: number;
  image_url?: string;
  groupname: string;
  group: number;
};

export type AccountService = {
  checkLogin: () => Promise<User | null>;
  login: (username: string, password: string) => Promise<User | null | undefined>;
  logout: () => Promise<any>;
};
