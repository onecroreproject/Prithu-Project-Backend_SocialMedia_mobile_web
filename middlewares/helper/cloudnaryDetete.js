// utils/cloudinary.js
function extractPublicId(url) {
  if (!url || typeof url !== "string") return null;
  try {
    // Examples:
    // https://res.cloudinary.com/yourcloud/image/upload/v162.../folder/name.jpg
    // https://res.cloudinary.com/yourcloud/video/upload/v162.../folder/name.mp4
    const parts = url.split("/");
    // public id usually is the path after 'upload' (minus extension)
    const uploadIndex = parts.findIndex((p) => p === "upload");
    if (uploadIndex === -1) {
      // fallback: last part without extension
      const last = parts[parts.length - 1].split(".")[0];
      return last;
    }
    const publicPathParts = parts.slice(uploadIndex + 1);
    const filename = publicPathParts.join("/"); // includes version and folders
    // remove any transformations and version prefix (v123456)
    const withoutTransform = filename.replace(/^([^/]+\/)?v\d+\//, "");
    // remove extension
    const noExt = withoutTransform.replace(/\.[^/.]+$/, "");
    return noExt;
  } catch (err) {
    return null;
  }
}

module.exports = { extractPublicId };
