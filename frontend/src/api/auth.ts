// src/api/auth.ts
import type { TokenPair } from "../types";
import axios from './axios';

export const loginUser = async (username: string, password: string): Promise<TokenPair> => {
  const response = await axios.post<TokenPair>('/auth/jwt/create/', {
    username,
    password,
  });
  return response.data;
};
