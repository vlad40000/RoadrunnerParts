// Mock Firebase library to satisfy typecheck after removal
export const auth = {
  signOut: () => {},
  currentUser: null,
} as any;

export const db = {} as any;

export const signIn = async () => {
  console.warn("Firebase signIn called but Firebase is gone.");
  return null;
};

export const signOut = () => {
  console.warn("Firebase signOut called but Firebase is gone.");
};
