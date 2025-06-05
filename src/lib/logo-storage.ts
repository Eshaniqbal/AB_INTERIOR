// Function to save logo to localStorage
export const saveLogo = (logoData: string) => {
  try {
    localStorage.setItem('companyLogo', logoData);
  } catch (error) {
    console.error('Error saving logo:', error);
  }
};

// Function to get logo from localStorage
export const getLogo = (): string | null => {
  try {
    return localStorage.getItem('companyLogo');
  } catch (error) {
    console.error('Error getting logo:', error);
    return null;
  }
};

// Function to remove logo from localStorage
export const removeLogo = () => {
  try {
    localStorage.removeItem('companyLogo');
  } catch (error) {
    console.error('Error removing logo:', error);
  }
}; 