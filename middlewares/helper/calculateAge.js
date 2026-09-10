// helper/utils.js
function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  return Math.floor(
    (Date.now() - new Date(dateOfBirth).getTime()) /
      (365.25 * 24 * 60 * 60 * 1000)
  );
}
module.exports = { calculateAge };
