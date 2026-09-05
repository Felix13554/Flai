import React, { Suspense, lazy } from 'react';
import EditableContent from '../components/EditableContent';
import SEO from '../components/SEO';
import { useData } from '../contexts/DataContext';

// Lazy loading the component to work with <Suspense />
const GoogleReviews = lazy(() => import('../components/GoogleReviews'));

const RatingsPage: React.FC = () => {
  const { getContent } = useData();

  return (
    <div className="pt-20 pb-16 bg-neutral-900">
      <SEO
        title={getContent('ratings-page-title', "Alle Anmeldelser")}
        description="Se hvad vores kunder siger om Flai droneservice. Læs anmeldelser og bedømmelser fra tidligere kunder."
        canonical="/ratings"
      />
      
      {/* Header Section */}
      <div className="bg-primary/10 py-12 mb-12">
        <div className="container">
          <EditableContent
            contentKey="ratings-page-title"
            as="h1"
            className="text-3xl md:text-4xl font-bold text-center mb-4"
            fallback="Alle Anmeldelser"
          />
          <EditableContent
            contentKey="ratings-page-subtitle"
            as="p"
            className="text-center text-lg text-neutral-300 max-w-2xl mx-auto"
            fallback="Hvad siger vores kunder. Vi er stolte af vores anmeldelser og arbejder altid på at levere det bedste resultat."
          />
        </div>
      </div>

      {/* Reviews Section */}
      <div className="container">
        <Suspense fallback={<div className="text-center py-10 text-white"><EditableContent contentKey="ratings-page-indlaeser-anmeldelser" fallback="Indlæser anmeldelser..." /></div>}>
          <GoogleReviews />
        </Suspense>
      </div>
    </div>
  );
};

export default RatingsPage;
