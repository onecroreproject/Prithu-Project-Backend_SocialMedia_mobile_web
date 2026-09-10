const fs = require("fs");
const path = require("path");
const { removeBackground } = require("@imgly/background-removal-node");

async function removeImageBackground(imageSource, userId) {
  try {
    const targetDir = userId
      ? path.join(__dirname, "../../media/user", userId.toString(), "modify")
      : path.join(__dirname, "../../media/user/modify");

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const ext = ".png"; // background removal usually returns PNG
    const filename = `modify_${Date.now()}${ext}`;
    const targetPath = path.join(targetDir, filename);

    const imageBuffer = fs.readFileSync(imageSource);

    // ✅ If your input is PNG change type to "image/png"
    const imageBlob = new Blob([imageBuffer], { type: "image/jpeg" });

    const resultBlob = await removeBackground(imageBlob);

    const arrayBuffer = await resultBlob.arrayBuffer();
    const outputBuffer = Buffer.from(arrayBuffer);

    fs.writeFileSync(targetPath, outputBuffer);

    // ✅ Use centralized getMediaUrl to ensure correct domain and format
    const { getMediaUrl } = require("../../utils/storageEngine");

    // Construct the DB path (relative path starting with /media)
    const relativeUrl = userId
      ? `/media/user/${userId}/modify/${filename}`
      : `/media/user/modify/${filename}`;

    return {
      secure_url: getMediaUrl(relativeUrl),
      public_id: filename,
      localPath: targetPath,
    };
  } catch (error) {
    throw error;
  }
}

module.exports = { removeImageBackground };
