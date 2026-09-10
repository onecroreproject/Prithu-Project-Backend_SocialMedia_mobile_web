const buildDateFilter = ({ field, dateKey, startDate, endDate }) => {
  const filter = {};

  

  // Date filter
  if (startDate || endDate) {
    if (dateKey) {
      // For nested arrays: e.g., likedFeeds.likedAt
      filter[`${field}.${dateKey}`] = {};
      if (startDate) filter[`${field}.${dateKey}`].$gte = new Date(startDate);
      if (endDate) filter[`${field}.${dateKey}`].$lte = new Date(endDate);
    } else {
      // For top-level fields: e.g., Feed.createdAt
      filter[field] = {};
      if (startDate) filter[field].$gte = new Date(startDate);
      if (endDate) filter[field].$lte = new Date(endDate);
    }
  }

  return filter;
};

module.exports = { buildDateFilter };