import { createContext } from 'react';

/* The context object on its own, so a component that only wants to know who is
   signed in doesn't pull in the provider and its API calls. */
export const AuthContext = createContext();
