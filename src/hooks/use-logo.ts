import { useLogoStore } from '@/lib/store';

export const useLogo = () => {
  const { logo } = useLogoStore();
  return logo;
}; 