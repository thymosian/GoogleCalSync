import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { TaskAccessInterface } from '@/components/TaskAccessInterface';

export default function TaskAccess() {
  const [location] = useLocation();
  const searchParams = new URLSearchParams(location.split('?')[1] || '');
  const meetingId = searchParams.get('meetingId');
  const magicToken = searchParams.get('token');
  const email = searchParams.get('email');

  const [isValidAccess, setIsValidAccess] = useState<boolean | null>(null);

  useEffect(() => {
    // Validate magic link access
    if (meetingId && magicToken && email) {
      // In a real implementation, you would validate the token with your backend
      // For now, we'll assume it's valid if all parameters are present
      setIsValidAccess(true);
    } else {
      setIsValidAccess(false);
    }
  }, [meetingId, magicToken, email]);

  const handleBackToDashboard = () => {
    window.location.href = '/';
  };

  const handleTaskUpdate = async (taskId: string, status: 'pending' | 'in_progress' | 'completed') => {
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ status })
      });

      if (!response.ok) {
        throw new Error('Failed to update task');
      }

      console.log('Task updated successfully:', taskId, status);
    } catch (error) {
      console.error('Error updating task:', error);
      throw error;
    }
  };

  if (isValidAccess === null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Validating access...</p>
        </div>
      </div>
    );
  }

  if (!isValidAccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="text-red-500 mb-4">
            <svg className="h-16 w-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Invalid Access Link</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            The link you used is invalid or has expired. Please contact the meeting organizer for a new link.
          </p>
          <button
            onClick={handleBackToDashboard}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <TaskAccessInterface
      meetingId={meetingId!}
      magicToken={magicToken!}
      onTaskUpdate={handleTaskUpdate}
      onBackToDashboard={handleBackToDashboard}
    />
  );
}