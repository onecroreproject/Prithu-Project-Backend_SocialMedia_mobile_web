

exports.generateReferralCode=function(username) {
  const prefix = username.substring(0, 3).toUpperCase();
  const randomNumber = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}${randomNumber}`;
};
