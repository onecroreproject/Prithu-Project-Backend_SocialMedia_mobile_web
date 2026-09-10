async function updateActivity(req, res, next) {
  if (req.user) {
    await Session.findOneAndUpdate(
      { userId: req.user.userId, refreshToken: req.refreshToken },
      { lastActiveAt: new Date(), isOnline: true }
    );
    await User.findByIdAndUpdate(req.user.userId, { isOnline: true });
  }
  next();
}
module.exports = updateActivity;