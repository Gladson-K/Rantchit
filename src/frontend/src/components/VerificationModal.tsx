import React from 'react';

export function VerificationModal({ sasCode, onClose }: { sasCode: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-sm">
        <h3 className="text-lg font-semibold mb-4">Verify your peer</h3>
        <p className="mb-4">Compare this code with your peer. They should see the same code.</p>
        <div className="text-2xl font-mono text-center bg-gray-100 dark:bg-gray-700 p-3 rounded">
          {sasCode}
        </div>
        <button
          onClick={onClose}
          className="mt-4 w-full bg-indigo-600 text-white py-2 rounded hover:bg-indigo-700"
        >
          Verified
        </button>
      </div>
    </div>
  );
}