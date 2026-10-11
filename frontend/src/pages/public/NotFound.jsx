import { Link, useNavigate } from 'react-router-dom';
import { HiOutlineArrowLeft, HiOutlineHome, HiOutlineTruck } from 'react-icons/hi';
import { useState } from 'react';

const createReferenceId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `SP-${crypto.randomUUID()}`;
  }

  const randomPart = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `SP-${Date.now().toString(36).toUpperCase()}-${randomPart}`;
};

const NotFound = () => {
  const navigate = useNavigate();
  const [referenceId] = useState(createReferenceId);

  const handleBack = () => {
    // React Router stores its own index in history.state. A positive index means
    // there is an earlier entry created inside this SPA; a direct visit starts at 0.
    const historyIndex = window.history.state?.idx;

    if (typeof historyIndex === 'number' && historyIndex > 0) {
      navigate(-1);
      return;
    }

    navigate('/');
  };

  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12 sm:px-6" aria-labelledby="not-found-title">
      <section className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-lg dark:border-dark-border dark:bg-dark-card sm:p-10">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300" aria-hidden="true">
          <HiOutlineTruck size={36} />
        </div>

        <p className="text-6xl font-extrabold tracking-tight text-primary-600 sm:text-8xl">404</p>
        <h1 id="not-found-title" className="mt-4 text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">
          Oops! This Page Doesn&apos;t Exist
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-gray-600 dark:text-gray-300 sm:text-base">
          The page you requested may have moved, been removed, or the address may be incorrect.
        </p>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to="/" className="btn-primary inline-flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-card">
            <HiOutlineHome size={18} aria-hidden="true" />
            Return Home
          </Link>
          <button
            type="button"
            onClick={handleBack}
            className="btn-secondary inline-flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-card"
          >
            <HiOutlineArrowLeft size={18} aria-hidden="true" />
            Go Back
          </button>
        </div>

        <p className="mt-8 text-xs text-gray-500 dark:text-gray-400">
          Support reference: <span className="font-mono text-gray-600 dark:text-gray-300">{referenceId}</span>
        </p>
      </section>
    </main>
  );
};

export default NotFound;
