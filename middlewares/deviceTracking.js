const UAParser =require("ua-parser-js");
const useragent =require( "useragent");
const requestIp =require( "request-ip");
const geoip = ("geoip-lite");

exports.extractDeviceInfo = (req) => {
  const uaString = req.headers["user-agent"] || "";
  const parser = new UAParser(uaString);
  const uaResult = parser.getResult();
  const agent = useragent.parse(uaString);

  // Get client IP
  const ip = requestIp.getClientIp(req) || "0.0.0.0";

  // Geo location
  let locationHint = null;
  if (ip && ip !== "::1") {
    const geo = geoip.lookup(ip);
    if (geo) {
      locationHint = `${geo.city || ""}, ${geo.country || ""}`.trim();
    }
  }

  // Device information
  const deviceName =
    uaResult.device.model ||
    uaResult.os.name ||
    agent.device.toString() ||
    "Unknown Device";

  const deviceType =
    uaResult.device.type ||
    agent.device.family ||
    "desktop";

  const os =
    `${uaResult.os.name || agent.os.family || "Unknown"} ${uaResult.os.version || agent.os.toVersion() || ""}`.trim();

  const browser =
    `${uaResult.browser.name || agent.family || "Unknown"} ${uaResult.browser.version || agent.toVersion() || ""}`.trim();

  return {
    deviceId: `${deviceType}-${ip}-${os}-${browser}`, // optional: create a simple device identifier
    deviceName,
    deviceType,
    os,
    browser,
    ip,
    locationHint,
  };
};

