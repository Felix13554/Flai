import EditableContent from '../components/EditableContent';
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';

const EmailConfirmedPage = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate('/');
      toast.success('Din email er blevet bekræftet!');
    }, 3000);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="pt-24 pb-16 min-h-screen bg-neutral-900">
      <div className="container max-w-md mx-auto">
        <div className="bg-neutral-800 rounded-xl shadow-md p-8 text-center">
          <CheckCircle size={64} className="text-success mx-auto mb-6" />
          <h1 className="text-2xl font-bold text-white mb-4">
            <EditableContent contentKey="email-confirmed-page-email-bekraeftet" fallback="Email Bekræftet!" />
          </h1>
          <p className="text-neutral-300 mb-8">
            <EditableContent contentKey="email-confirmed-page-din-email-adresse-er-nu" fallback="Din email-adresse er nu bekræftet. Du bliver automatisk omdirigeret til forsiden..." />
          </p>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
        </div>
      </div>
    </div>
  );
};

export default EmailConfirmedPage;