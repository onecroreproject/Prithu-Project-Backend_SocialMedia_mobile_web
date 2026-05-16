// utils/templateMailer.js
const fs = require("fs");
const path = require("path");
const { sendMailSafeSafe } = require("./sendMail");

/**
 * Send email using a template.
 * @param {Object} opts
 * @param {string} opts.templateName - filename in /templates
 * @param {string} opts.to
 * @param {string} opts.subject
 * @param {Object} [opts.placeholders] - {key: value} replaced as {key}
 * @param {boolean} [opts.embedLogo] - if true attaches ./assets/logo.png as cid:prithu-logo and sets {logoCid} to that cid
 * @param {Array} [opts.attachments] - additional nodemailer attachments
 */
const sendTemplateEmail = async ({
  templateName,
  to,
  subject,
  placeholders = {},
  embedLogo = false,
  attachments = [],
}) => {
  try {
    const templatePath = path.join(__dirname, "../utils/templates", templateName);
    let html = await fs.promises.readFile(templatePath, "utf-8");

    // If embedLogo requested, attach local logo and set logoCid placeholder
    if (embedLogo) {
      // adjust path to your logo file
      const logoPath = path.join(__dirname, "./prithu.png");
      const logoAttachment = {
        filename: "prithu.png",
        path: logoPath,
        cid: "prithu-logo", // use in template as src="cid:prithu-logo"
      };

      attachments = Array.isArray(attachments) ? attachments.concat(logoAttachment) : [logoAttachment];
      // provide placeholder so templates can use either {logoCid} or hard-coded cid
      placeholders.logoCid = "cid:prithu-logo";
    }

    // Replace placeholders like {username}, {otp}, {logoCid} etc.
    for (const key in placeholders) {
      const value = placeholders[key] != null ? String(placeholders[key]) : "";
      const regex = new RegExp(`{${key}}`, "g");
      html = html.replace(regex, value);
    }

    // Finally send
    await sendMailSafeSafe({ to, subject, html, attachments });

  } catch (err) {
    console.error(`Failed to send template email "${templateName}" to ${to}:`, err);
    throw err;
  }
};

module.exports = { sendTemplateEmail };
