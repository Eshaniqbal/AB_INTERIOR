import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface LogoState {
  logo: string | null;
  setLogo: (logo: string | null) => void;
}

export const useLogoStore = create<LogoState>()(
  persist(
    (set) => ({
      logo: null,
      setLogo: (logo) => set({ logo }),
    }),
    {
      name: 'logo-storage',
    }
  )
); 