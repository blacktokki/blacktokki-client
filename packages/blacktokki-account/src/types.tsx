type BaseUser = {
  is_staff: boolean;
  is_guest: boolean;
  name: string;
  username: string;
  imageUrl?: string;
};

export type User = BaseUser & {
  id: number;
  otpDeletionRequested?: boolean;
};

export type CreateUser = BaseUser & {
  password: string;
};

export type OtpResponse =
  | {
      secretKey: string;
      otpAuthUrl: string;
    }
  | {
      secretKey?: undefined;
    };
