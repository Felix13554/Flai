export type ContentType = 'text' | 'image' | 'color';
export const detectContentType = (value: string): ContentType => {
  const trimmedValue = value.trim();
  if (!trimmedValue) return 'text';
  const colorHexPattern = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
  if (colorHexPattern.test(trimmedValue)) {
    return 'color';
  }
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.avif'];
  const urlPattern = /^(https?:\/\/|\/)/i;
  if (urlPattern.test(trimmedValue)) {
    const lowerValue = trimmedValue.toLowerCase();
    if (imageExtensions.some(ext => lowerValue.includes(ext))) {
      return 'image';
    }
  }
  return 'text';
};
export const inferCategoryFromKey = (key: string): string => {
  const parts = key.split('-');
  const firstPart = parts[0];
  const categoryMapping: Record<string, string> = {
    hero: 'hero',
    drone: 'about',
    about: 'about',
    cta: 'cta',
    contact: 'contact',
    footer: 'footer',
    admin: 'admin',
    login: 'login',
    search: 'search',
    newsletter: 'newsletter',
    faq: 'contact',
    services: 'services',
    primary: 'colors',
    secondary: 'colors',
    success: 'colors',
    error: 'colors',
    warning: 'colors',
    accent: 'colors',
  };
  return categoryMapping[firstPart] || 'general';
};
export const generateDescription = (key: string): string => {
  return key
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};
export const inferContentDefaults = (key: string, value: string) => {
  return {
    type: detectContentType(value),
    category: inferCategoryFromKey(key),
    description: generateDescription(key),
  };
};