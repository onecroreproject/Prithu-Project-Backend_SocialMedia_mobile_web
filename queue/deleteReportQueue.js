const { v2: cloudinary } = require("cloudinary");
const Report = require("../models/feedReportModel");
const Feed = require("../models/feedModel");
const {sendMailSafesafe} = require("../utils/sendMail");
const createQueue =require("../queue.js")


const deleteQueue = createQueue("delete-reports")


const extractPublicId = (url) => {
  if (!url) return null;
  try {
    const parts = url.split("/");
    const file = parts.pop();
    return file.split(".")[0];
  } catch {
    return null;
  }
};

const deleteCloudinaryMedia = async (feed) => {
  const ids = new Set();
  if (feed.thumbnail) ids.add(extractPublicId(feed.thumbnail));
  if (Array.isArray(feed.media)) feed.media.forEach(m => ids.add(extractPublicId(m.url)));
  if (ids.size) await cloudinary.api.delete_resources([...ids]);
};

deleteQueue.process(async (job) => {
  console.log("⏰ Running report cleanup job...", new Date().toISOString());
  const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  const reports = await Report.find({ status: "Action Taken", targetType: "Feed", actionDate: { $lte: tenDaysAgo } });

  for (const report of reports) {
    const feed = await Feed.findById(report.targetId).populate("createdBy", "email userName");
    if (!feed) continue;

    await deleteCloudinaryMedia(feed);
    await Feed.deleteOne({ _id: feed._id });

    if (feed.createdBy?.email) {
      await sendMailSafesafe({
        to: feed.createdBy.email,
        subject: "Feed Automatically Removed After Report",
        html: `Hello ${feed.createdBy.userName || "User"},\n\nYour feed "${feed.title}" was removed after 10 days.\n\nThank you.`
      });
    }

    await Report.findByIdAndUpdate(report._id, {
      $set: { status: "Auto Deleted", actionTaken: "Feed removed automatically", actionDate: new Date() }
    });
  }

  console.log("✅ Report cleanup completed");
});

deleteQueue.on("completed", (job) => console.log(`✅ Job completed: ${job.id}`));
deleteQueue.on("failed", (job, err) => console.error(`❌ Job failed: ${job.id}`, err));

module.exports = deleteQueue;
