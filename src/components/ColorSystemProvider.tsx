import React from 'react';
import { useColorSystem } from '../hooks/useColorSystem';

interface ColorSystemProviderProps {
  children: React.ReactNode;
}

const ColorSystemProvider: React.FC<ColorSystemProviderProps> = ({ children }) => {
  useColorSystem();
  return <>{children}</>;
};

export default ColorSystemProvider;