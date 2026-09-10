const extractPublicId =require("../../middlewares/helper/cloudnaryDetete");

function gatherFeedPublicIds(feedDoc) {
  const ids = [];
  if (!feedDoc) return ids;

  // Example shapes: feed.media = [{ url }, { url }], or mediaUrls: [], videoUrl, imageUrl etc.
  if (Array.isArray(feedDoc.media)) {
    feedDoc.media.forEach((m) => {
      if (m.url) {
        const pid = extractPublicId(m.url);
        if (pid) ids.push(pid);
      }
    });
  }
  // common single fields:
  ["imageUrl", "videoUrl", "thumbnail", "mediaUrl"].forEach((f) => {
    if (feedDoc[f]) {
      const pid = extractPublicId(feedDoc[f]);
      if (pid) ids.push(pid);
    }
  });

  // if feedDoc has nested attachments
  if (Array.isArray(feedDoc.attachments)) {
    feedDoc.attachments.forEach((a) => {
      if (a.url) {
        const pid = extractPublicId(a.url);
        if (pid) ids.push(pid);
      }
    });
  }

  return ids;
}


async function deleteCloudinaryBatch(publicIds = [], batchSize = 10) {
  const deleted = [];
  for (let i = 0; i < publicIds.length; i += batchSize) {
    const slice = publicIds.slice(i, i + batchSize);
    try {
      // cloudinary.uploader.destroy accepts public_id; for multiple use destroy in parallel
      await Promise.all(
        slice.map((pid) =>
          cloudinary.uploader.destroy(pid).then((res) => {
            deleted.push({ pid, res });
          }).catch((err) => {
            // log and continue
            console.error("Cloudinary delete error for", pid, err);
            deleted.push({ pid, err });
          })
        )
      );
    } catch (err) {
      console.error("Batch cloudinary delete error:", err);
    }
  }
  return deleted;
}

module.exports={gatherFeedPublicIds,deleteCloudinaryBatch}