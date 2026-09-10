// controllers/feedMetrics.js
const mongoose = require('mongoose');
const Feed = require('../../models/feedModel'); // adjust path
const UserFeedActions = require('../../models/userFeedInterSectionModel'); // adjust path

// helpers
function safeBool(val) {
  if (val === undefined) return false;
  if (typeof val === 'boolean') return val;
  try {
    return JSON.parse(String(val).toLowerCase());
  } catch {
    return Boolean(val);
  }
}

function buildDateArray(startDate, endDate, granularity) {
  const arr = [];
  const cur = new Date(startDate);
  const end = new Date(endDate);
  cur.setHours(0,0,0,0);
  end.setHours(0,0,0,0);

  if (granularity === 'daily') {
    while (cur <= end) {
      arr.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return arr;
  }

  if (granularity === 'weekly') {
    const getWeekStart = (d) => {
      const x = new Date(d);
      const day = x.getDay(); // 0 Sun .. 6 Sat
      const diff = (day === 0 ? -6 : 1 - day); // Monday start
      x.setDate(x.getDate() + diff);
      x.setHours(0,0,0,0);
      return x;
    };
    const s = getWeekStart(startDate);
    const e = getWeekStart(endDate);
    const curW = new Date(s);
    while (curW <= e) {
      arr.push(new Date(curW));
      curW.setDate(curW.getDate() + 7);
    }
    return arr;
  }

  if (granularity === 'monthly') {
    const s = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const e = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
    const curM = new Date(s);
    while (curM <= e) {
      arr.push(new Date(curM));
      curM.setMonth(curM.getMonth() + 1);
    }
    return arr;
  }

  return arr;
}

// Utility: build feed match used for Feed aggregation and Feed lookup in actions
function buildFeedMatchFromQuery(q) {
  const { userId, category, language, status, includeScheduled } = q;
  const match = {};

  if (q.start || q.end) {
    const start = q.start ? new Date(q.start) : undefined;
    const end = q.end ? new Date(q.end) : undefined;
    if (start && end) match.createdAt = { $gte: start, $lte: end };
    else if (start) match.createdAt = { $gte: start };
    else if (end) match.createdAt = { $lte: end };
  }

  // Exclude scheduled posts by default
  if (!safeBool(includeScheduled)) {
    match.isScheduled = { $ne: true };
  }

  // Default status filter: Published (unless user passed a specific status)
  if (status) match.status = status;
  else match.status = "Published";

  if (userId) {
    try { match.createdByAccount = mongoose.Types.ObjectId(userId); }
    catch (e) { /* ignore invalid id */ }
  }

  if (category) {
    try { match.category = mongoose.Types.ObjectId(category); }
    catch (e) { /* ignore invalid id */ }
  }

  if (language) match.language = language;

  return match;
}

/**
 * DAILY - postCount + likes/saves/shares per day
 * Query params: start, end, userId, category, language, status, includeScheduled
 */
exports.getPostVolumeDaily = async (req, res) => {
  try {
    const { start, end } = req.query;
    const endDate = end ? new Date(end) : new Date();
    const startDate = start ? new Date(start) : new Date(endDate.getTime() - 29*24*60*60*1000); // last 30 days

    // Build feed match for feeds (we count feeds created in the period)
    const feedMatch = buildFeedMatchFromQuery({ ...req.query, start: startDate, end: endDate });

    // 1) Feed counts grouped by day (YYYY-MM-DD)
    const feedAgg = [
      { $match: feedMatch },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          postCount: { $sum: 1 }
        }
      },
      { $sort: { "_id": 1 } }
    ];

    const feedsByDay = await Feed.aggregate(feedAgg).allowDiskUse(true);

    // 2) Engagements: likes, saves, shares
    // We'll aggregate each action type separately from UserFeedActions and join/filter by Feed fields via $lookup
    // Helper to build pipelines for an action array field (e.g., "likedFeeds", dateField e.g., "likedAt")
    const buildActionAgg = (arrayField, dateField) => ([
      { $unwind: `$${arrayField}` },
      // Project feedId and actionDate
      { $project: { feedId: `$${arrayField}.feedId`, actionDate: `$${arrayField}.${dateField}` } },
      // Lookup feed to apply same feed filters (category/status/etc)
      {
        $lookup: {
          from: Feed.collection.name,
          localField: "feedId",
          foreignField: "_id",
          as: "feed"
        }
      },
      { $unwind: "$feed" },
      // Apply feed-level filters (category/status/language/isScheduled/createdByAccount)
      { $match: (() => {
          const m = {};
          if (feedMatch.category) m["feed.category"] = feedMatch.category;
          if (feedMatch.status) m["feed.status"] = feedMatch.status;
          if (feedMatch.language) m["feed.language"] = feedMatch.language;
          if (feedMatch.createdByAccount) m["feed.createdByAccount"] = feedMatch.createdByAccount;
          if (feedMatch.isScheduled && feedMatch.isScheduled.$ne !== undefined) {
            // If we excluded scheduleds, ensure feed.isScheduled != true
            m["feed.isScheduled"] = { $ne: true };
          }
          return m;
        })() },
      // filter actionDate in range
      { $match: { actionDate: { $gte: startDate, $lte: endDate } } },
      // group by action day
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$actionDate" } },
          count: { $sum: 1 }
        }
      },
      { $sort: { "_id": 1 } }
    ]);

    // Run three aggregations in parallel
    const [likesRaw, savesRaw, sharesRaw, feedsRaw] = await Promise.all([
      UserFeedActions.aggregate(buildActionAgg("likedFeeds", "likedAt")).allowDiskUse(true),
      UserFeedActions.aggregate(buildActionAgg("savedFeeds", "savedAt")).allowDiskUse(true),
      UserFeedActions.aggregate(buildActionAgg("sharedFeeds", "sharedAt")).allowDiskUse(true),
      Feed.aggregate(feedAgg).allowDiskUse(true) // duplicate of feedsByDay but kept for parallelism
    ]);

    // normalize maps
    const feedMap = new Map(feedsRaw.map(r => [r._id, r.postCount]));
    const likesMap = new Map(likesRaw.map(r => [r._id, r.count]));
    const savesMap = new Map(savesRaw.map(r => [r._id, r.count]));
    const sharesMap = new Map(sharesRaw.map(r => [r._id, r.count]));

    const dateArray = buildDateArray(startDate, endDate, 'daily');

    const result = dateArray.map(d => {
      const key = d.toISOString().slice(0,10);
      return {
        date: key,
        postCount: feedMap.get(key) || 0,
        likes: likesMap.get(key) || 0,
        saves: savesMap.get(key) || 0,
        shares: sharesMap.get(key) || 0
      };
    });

    return res.status(200).json({
      success: true,
      granularity: 'daily',
      start: startDate,
      end: endDate,
      data: result
    });
  } catch (err) {
    console.error('getPostVolumeDaily error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * WEEKLY - postCount + likes/saves/shares per ISO week
 * Defaults to last 12 weeks
 */
exports.getPostVolumeWeekly = async (req, res) => {
  try {
    const { start, end } = req.query;
    const endDate = end ? new Date(end) : new Date();
    const startDate = start ? new Date(start) : new Date(endDate.getTime() - 12*7*24*60*60*1000); // last 12 weeks

    const feedMatch = buildFeedMatchFromQuery({ ...req.query, start: startDate, end: endDate });

    // Feeds aggregated by isoWeekYear + isoWeek
    const feedAgg = [
      { $match: feedMatch },
      {
        $group: {
          _id: {
            isoWeekYear: { $isoWeekYear: "$createdAt" },
            isoWeek: { $isoWeek: "$createdAt" }
          },
          postCount: { $sum: 1 },
          firstCreatedAt: { $min: "$createdAt" }
        }
      },
      {
        $project: {
          weekId: { $concat: [ { $toString: "$_id.isoWeekYear" }, "-W", { $toString: "$_id.isoWeek" } ] },
          isoWeekYear: "$_id.isoWeekYear",
          isoWeek: "$_id.isoWeek",
          postCount: 1,
          firstCreatedAt: 1
        }
      },
      { $sort: { isoWeekYear: 1, isoWeek: 1 } }
    ];

    // Action aggregator helper for weekly (group by isoWeekYear + isoWeek of action date)
    const buildActionAggWeekly = (arrayField, dateField) => ([
      { $unwind: `$${arrayField}` },
      { $project: { feedId: `$${arrayField}.feedId`, actionDate: `$${arrayField}.${dateField}` } },
      {
        $lookup: {
          from: Feed.collection.name,
          localField: "feedId",
          foreignField: "_id",
          as: "feed"
        }
      },
      { $unwind: "$feed" },
      { $match: (() => {
          const m = {};
          if (feedMatch.category) m["feed.category"] = feedMatch.category;
          if (feedMatch.status) m["feed.status"] = feedMatch.status;
          if (feedMatch.language) m["feed.language"] = feedMatch.language;
          if (feedMatch.createdByAccount) m["feed.createdByAccount"] = feedMatch.createdByAccount;
          if (feedMatch.isScheduled && feedMatch.isScheduled.$ne !== undefined) m["feed.isScheduled"] = { $ne: true };
          return m;
        })() },
      { $match: { actionDate: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: { isoWeekYear: { $isoWeekYear: "$actionDate" }, isoWeek: { $isoWeek: "$actionDate" } },
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          weekId: { $concat: [ { $toString: "$_id.isoWeekYear" }, "-W", { $toString: "$_id.isoWeek" } ] },
          count: 1
        }
      },
      { $sort: { weekId: 1 } }
    ]);

    const [feedsRaw, likesRaw, savesRaw, sharesRaw] = await Promise.all([
      Feed.aggregate(feedAgg).allowDiskUse(true),
      UserFeedActions.aggregate(buildActionAggWeekly("likedFeeds", "likedAt")).allowDiskUse(true),
      UserFeedActions.aggregate(buildActionAggWeekly("savedFeeds", "savedAt")).allowDiskUse(true),
      UserFeedActions.aggregate(buildActionAggWeekly("sharedFeeds", "sharedAt")).allowDiskUse(true)
    ]);

    const feedMap = new Map(feedsRaw.map(r => [r.weekId, r.postCount]));
    const likesMap = new Map(likesRaw.map(r => [r.weekId, r.count]));
    const savesMap = new Map(savesRaw.map(r => [r.weekId, r.count]));
    const sharesMap = new Map(sharesRaw.map(r => [r.weekId, r.count]));

    const weekStarts = buildDateArray(startDate, endDate, 'weekly'); // Mondays

    const result = weekStarts.map(d => {
      // compute ISO week/year for date d
      const tmp = new Date(d);
      const day = tmp.getDay() || 7; // Mon=1..Sun=7
      tmp.setDate(tmp.getDate() + (4 - day)); // nearest Thursday
      const yearStart = new Date(tmp.getFullYear(),0,1);
      const weekNo = Math.ceil((((tmp - yearStart)/86400000) + 1)/7);
      const weekId = `${tmp.getFullYear()}-W${weekNo}`;
      return {
        weekId,
        weekStart: d.toISOString().slice(0,10),
        postCount: feedMap.get(weekId) || 0,
        likes: likesMap.get(weekId) || 0,
        saves: savesMap.get(weekId) || 0,
        shares: sharesMap.get(weekId) || 0
      };
    });

    return res.status(200).json({
      success: true,
      granularity: 'weekly',
      start: startDate,
      end: endDate,
      data: result
    });
  } catch (err) {
    console.error('getPostVolumeWeekly error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * MONTHLY - postCount + likes/saves/shares per month (YYYY-MM)
 * Defaults to last 12 months
 */
exports.getPostVolumeMonthly = async (req, res) => {
  try {
    const { start, end } = req.query;
    const endDate = end ? new Date(end) : new Date();
    const startDate = start ? new Date(start) : new Date(endDate.getFullYear(), endDate.getMonth() - 11, 1); // last 12 months

    const feedMatch = buildFeedMatchFromQuery({ ...req.query, start: startDate, end: endDate });

    const feedAgg = [
      { $match: feedMatch },
      {
        $group: {
          _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
          postCount: { $sum: 1 }
        }
      },
      {
        $project: {
          year: "$_id.year",
          month: "$_id.month",
          monthId: { $concat: [{ $toString: "$_id.year" }, "-", { $toString: "$_id.month" }] },
          postCount: 1
        }
      },
      { $sort: { year: 1, month: 1 } }
    ];

    const buildActionAggMonthly = (arrayField, dateField) => ([
      { $unwind: `$${arrayField}` },
      { $project: { feedId: `$${arrayField}.feedId`, actionDate: `$${arrayField}.${dateField}` } },
      {
        $lookup: {
          from: Feed.collection.name,
          localField: "feedId",
          foreignField: "_id",
          as: "feed"
        }
      },
      { $unwind: "$feed" },
      { $match: (() => {
          const m = {};
          if (feedMatch.category) m["feed.category"] = feedMatch.category;
          if (feedMatch.status) m["feed.status"] = feedMatch.status;
          if (feedMatch.language) m["feed.language"] = feedMatch.language;
          if (feedMatch.createdByAccount) m["feed.createdByAccount"] = feedMatch.createdByAccount;
          if (feedMatch.isScheduled && feedMatch.isScheduled.$ne !== undefined) m["feed.isScheduled"] = { $ne: true };
          return m;
        })() },
      { $match: { actionDate: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: { year: { $year: "$actionDate" }, month: { $month: "$actionDate" } },
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          monthId: { $concat: [{ $toString: "$_id.year" }, "-", { $toString: "$_id.month" }] },
          count: 1
        }
      },
      { $sort: { monthId: 1 } }
    ]);

    const [feedsRaw, likesRaw, savesRaw, sharesRaw] = await Promise.all([
      Feed.aggregate(feedAgg).allowDiskUse(true),
      UserFeedActions.aggregate(buildActionAggMonthly("likedFeeds", "likedAt")).allowDiskUse(true),
      UserFeedActions.aggregate(buildActionAggMonthly("savedFeeds", "savedAt")).allowDiskUse(true),
      UserFeedActions.aggregate(buildActionAggMonthly("sharedFeeds", "sharedAt")).allowDiskUse(true)
    ]);

    const feedMap = new Map(feedsRaw.map(r => [ `${r.year}-${r.month.toString().padStart(2,'0')}`, r.postCount ]));
    const likesMap = new Map(likesRaw.map(r => [ r.monthId.replace('-','-'), r.count ]));
    const savesMap = new Map(savesRaw.map(r => [ r.monthId.replace('-','-'), r.count ]));
    const sharesMap = new Map(sharesRaw.map(r => [ r.monthId.replace('-','-'), r.count ]));

    const months = buildDateArray(startDate, endDate, 'monthly');

    const result = months.map(d => {
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; // YYYY-MM
      return {
        month: key,
        postCount: feedMap.get(key) || 0,
        likes: likesMap.get(key) || 0,
        saves: savesMap.get(key) || 0,
        shares: sharesMap.get(key) || 0
      };
    });

    return res.status(200).json({
      success: true,
      granularity: 'monthly',
      start: startDate,
      end: endDate,
      data: result
    });
  } catch (err) {
    console.error('getPostVolumeMonthly error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
