export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
  }).format(amount);
};

export const formatDate = (date) => {
  return new Date(date).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

export const formatDateTime = (date) => {
  return new Date(date).toLocaleString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatTime = (date) => {
  return new Date(date).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const getStatusColor = (status) => {
  const colors = {
    available: 'bg-green-500',
    reserved: 'bg-yellow-500',
    occupied: 'bg-red-500',
    confirmed: 'bg-blue-500',
    active: 'bg-green-500',
    completed: 'bg-gray-500',
    cancelled: 'bg-red-500',
    expired: 'bg-orange-500',
    pending: 'bg-yellow-500',
    success: 'bg-green-500',
    failed: 'bg-red-500',
    cancelled: 'bg-gray-500',
    manual_review: 'bg-orange-500',
    refunded: 'bg-orange-500',
  };
  return colors[status] || 'bg-gray-500';
};

export const getStatusBadge = (status) => {
  const badges = {
    available: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    reserved: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    occupied: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    confirmed: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    completed: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    cancelled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    expired: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
    pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    success: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    manual_review: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
    refunded: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  };
  return badges[status] || 'bg-gray-100 text-gray-800';
};

export const calculateDuration = (start, end) => {
  const diffMs = new Date(end) - new Date(start);
  const hours = Math.ceil(diffMs / (1000 * 60 * 60));
  return Math.max(1, hours);
};
