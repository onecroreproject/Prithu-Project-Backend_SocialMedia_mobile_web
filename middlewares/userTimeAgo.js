exports. timeAgo=(timestamp)=> {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`; // < 30 days
  if (seconds < 31536000) return `${Math.floor(seconds / 2592000)}mo ago`; // < 12 months
  return `${Math.floor(seconds / 31536000)}y ago`; // >= 1 year
}
