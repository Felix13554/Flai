/**
 * HomeSectionCard.tsx
 *
 * Shared renderer for a single standard home section.
 * Used by:
 *   - HomePage (live site)
 *   - HomeSectionsManager section preview
 *   - VisualSectionEditor standard-mode preview
 *
 * Props:
 *   section   — the section data object
 *   index     — position in the list (0-based), used to alternate image side
 *   isPreview — optional, renders without the outer <section> bg wrapper
 *               so the editor can control its own container
 */

import React from 'react';

export interface StandardSection {
  id: string;
  title: string;
  description: string;
  image_url?: string | null;
  image_url_2?: string | null;
  image_url_3?: string | null;
  order_index: number;
  is_active: boolean;
  section_type: string;
}

export const descriptionClasses = `
  text-neutral-300 text-base font-sans leading-relaxed
  [&_*]:!font-sans [&_*]:!text-base [&_*]:!leading-relaxed [&_*]:!font-normal
  [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2
  [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2
  [&_li]:my-1
  [&_p]:mb-3
  [&_b]:!font-bold [&_strong]:!font-bold
  [&_i]:!italic [&_em]:!italic
  [&_h1]:!text-base [&_h1]:!font-bold [&_h1]:mb-2
  [&_h2]:!text-base [&_h2]:!font-bold [&_h2]:mb-2
  [&_h3]:!text-base [&_h3]:!font-bold [&_h3]:mb-2
  [&_h4]:!text-base [&_h4]:!font-bold [&_h4]:mb-2
  [&_h5]:!text-base [&_h5]:!font-bold [&_h5]:mb-2
  [&_h6]:!text-base [&_h6]:!font-bold [&_h6]:mb-2
  [&_span]:!font-sans [&_span]:!text-base
  [&_div]:!font-sans [&_div]:!text-base
`.trim();

interface HomeSectionCardProps {
  section: StandardSection;
  /** 0-based position in the rendered list — controls which side the image appears */
  index: number;
  /** When true, omits the outer section/py-20 wrapper (used in manager preview) */
  isPreview?: boolean;
}

const HomeSectionCardInner: React.FC<{ section: StandardSection; index: number }> = ({ section, index }) => {
  const extras = [section.image_url_2, section.image_url_3].filter(Boolean) as string[];
  const hasExtras = extras.length > 0;
  const isReversed = index % 2 === 1;

  if (!hasExtras) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-start">
        <div className={isReversed ? 'md:order-2' : 'md:order-1'}>
          <h2 className="text-3xl font-bold mb-6 text-white">{section.title}</h2>
          <div
            className={`mb-8 ${descriptionClasses}`}
            dangerouslySetInnerHTML={{ __html: section.description ?? '' }}
          />
        </div>
        <div className={isReversed ? 'md:order-1' : 'md:order-2'}>
          {section.image_url && (
            <img
              src={section.image_url}
              alt={section.title}
              loading="lazy"
              className="rounded-lg shadow-xl w-full h-auto aspect-video object-cover"
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-start">
      <div className={isReversed ? 'md:order-2' : 'md:order-1'}>
        <h2 className="text-3xl font-bold mb-6 text-white">{section.title}</h2>
        {/* Mobile: text + extra images side-by-side */}
        <div className="flex gap-3 items-start md:hidden">
          <div
            className={`flex-1 min-w-0 mb-8 ${descriptionClasses}`}
            dangerouslySetInnerHTML={{ __html: section.description ?? '' }}
          />
          <div
            className="flex-shrink-0 flex flex-col gap-2"
            style={{ width: 'clamp(110px, 38%, 210px)' }}
          >
            {extras.map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`${section.title} – billede ${i + 2}`}
                loading="lazy"
                className="rounded-lg shadow-md object-cover w-full aspect-[4/3]"
              />
            ))}
          </div>
        </div>
        {/* Desktop: text then extra images below */}
        <div className="hidden md:block">
          <div
            className={`mb-6 ${descriptionClasses}`}
            dangerouslySetInnerHTML={{ __html: section.description ?? '' }}
          />
          <div
            className={`grid gap-3 ${extras.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}
            style={{ maxWidth: extras.length === 1 ? '256px' : '100%' }}
          >
            {extras.map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`${section.title} – billede ${i + 2}`}
                loading="lazy"
                className="rounded-lg shadow-md object-cover w-full aspect-[4/3]"
              />
            ))}
          </div>
        </div>
      </div>
      <div className={isReversed ? 'md:order-1' : 'md:order-2'}>
        {section.image_url && (
          <img
            src={section.image_url}
            alt={section.title}
            loading="lazy"
            className="rounded-lg shadow-xl w-full h-auto aspect-video object-cover"
          />
        )}
      </div>
    </div>
  );
};

const HomeSectionCard: React.FC<HomeSectionCardProps> = ({ section, index, isPreview = false }) => {
  if (isPreview) {
    return (
      <div className="bg-neutral-800 py-10 px-4">
        <div className="container mx-auto max-w-6xl">
          <HomeSectionCardInner section={section} index={index} />
        </div>
      </div>
    );
  }

  return (
    <section className="bg-neutral-800 border-0 outline-none py-10 md:py-20">
      <div className="container">
        <HomeSectionCardInner section={section} index={index} />
      </div>
    </section>
  );
};

export default HomeSectionCard;
