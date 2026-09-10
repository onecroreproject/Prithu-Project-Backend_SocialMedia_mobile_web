export const authMiddleware = async (req, res, next) => {
  const sid = req.cookies.sessionId;
  if (!sid) return res.status(401).json({ message: "No session" });
  const user = await User.findOne({ activeSession: sid });
  if (!user) return res.status(401).json({ message: "Invalid session" });
  req.user = user;
  next();
};