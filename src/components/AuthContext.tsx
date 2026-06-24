import { createContext, useContext } from 'react';
import type { UserProfile } from '../modules/auth';

export const AuthContext = createContext<UserProfile | null>(null);

export function useAuth(): UserProfile {
  const user = useContext(AuthContext);
  if (!user) throw new Error('useAuth must be used within authenticated app');
  return user;
}
