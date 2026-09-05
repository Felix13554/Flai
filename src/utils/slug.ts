export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function generateUniqueSlug(
  baseSlug: string,
  checkExists: (slug: string) => Promise<boolean>,
  maxAttempts: number = 10
): Promise<string> {
  let slug = baseSlug;
  let attempt = 1;

  while (attempt <= maxAttempts) {
    const exists = await checkExists(slug);
    if (!exists) {
      return slug;
    }
    slug = `${baseSlug}-${attempt}`;
    attempt++;
  }

  throw new Error(`Could not generate unique slug for "${baseSlug}"`);
}
