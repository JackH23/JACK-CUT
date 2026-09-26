export type User = {
  id: string;
  name: string;
  email: string;
};

export type RegisterInput = {
  name: string;
  email: string;
  password: string;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type AuthResponse = {
  token: string;
  refreshToken: string;
  user: User;
};

export type MeResponse = {
  user: User;
};