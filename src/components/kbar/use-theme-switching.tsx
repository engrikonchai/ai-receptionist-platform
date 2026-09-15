import { useRegisterActions } from 'kbar';
import { useTheme } from 'next-themes';

// Zen is the platform's only visual style, so this only registers
// light/dark/system actions — there is no theme preset to switch between.
const useThemeSwitching = () => {
  const { theme, setTheme } = useTheme();

  const toggleDarkLight = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  const themeActions = [
    {
      id: 'toggleDarkLight',
      name: 'Toggle Dark/Light Mode',
      shortcut: ['d', 'd'],
      section: 'Theme',
      perform: toggleDarkLight
    },
    {
      id: 'setLightTheme',
      name: 'Set Light Theme',
      section: 'Theme',
      perform: () => setTheme('light')
    },
    {
      id: 'setDarkTheme',
      name: 'Set Dark Theme',
      section: 'Theme',
      perform: () => setTheme('dark')
    }
  ];

  useRegisterActions(themeActions, [theme]);
};

export default useThemeSwitching;
