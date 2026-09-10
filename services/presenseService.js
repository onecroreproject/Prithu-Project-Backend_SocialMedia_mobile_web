exports.makePresenceService = (redisClient, UserModel, io) => {
  const userSocketsKey = (userId) => `user:sockets:${userId}`;
  const onlineUsersKey = () => `online:users`;
  const lastSeenKey = (userId) => `lastseen:${userId}`;
  const deviceKey = (userId, socketId) => `user:device:${userId}:${socketId}`;

  // Add socket + device info
  async function addSocket(userId, socketId, deviceInfo = {}) {
    await redisClient.sAdd(userSocketsKey(userId), socketId);
    await redisClient.sAdd(onlineUsersKey(), userId);
    await redisClient.set(lastSeenKey(userId), Date.now().toString());

    // Save device info per socket
    await redisClient.hSet(deviceKey(userId, socketId), deviceInfo);

    // Persist online status to Mongo
    await UserModel.findByIdAndUpdate(userId, { isOnline: true, lastSeenAt: new Date() }).catch(() => {});

    io.to("admins").emit("user:online", { userId, lastSeenAt: new Date(), deviceInfo });
  }

  // Remove socket + device info
  async function removeSocket(userId, socketId) {
    await redisClient.sRem(userSocketsKey(userId), socketId);
    await redisClient.del(deviceKey(userId, socketId));

    const remaining = await redisClient.sCard(userSocketsKey(userId));
    if (remaining === 0) {
      await redisClient.sRem(onlineUsersKey(), userId);
      const last = new Date();
      await redisClient.set(lastSeenKey(userId), last.getTime().toString());
      await UserModel.findByIdAndUpdate(userId, { isOnline: false, lastSeenAt: last }).catch(() => {});
      io.to("admins").emit("user:offline", { userId, lastSeenAt: last });
    } else {
      // still online from other sockets
      await redisClient.set(lastSeenKey(userId), Date.now().toString());
      io.to("admins").emit("user:still-online", { userId, connections: remaining });
    }
  }

  async function listOnlineUsers() {
    return await redisClient.sMembers(onlineUsersKey());
  }

  async function getUserSocketCount(userId) {
    return await redisClient.sCard(userSocketsKey(userId));
  }

  // Get all devices for a user
  async function getUserDevices(userId) {
    const sockets = await redisClient.sMembers(userSocketsKey(userId));
    const devices = [];
    for (const socketId of sockets) {
      const device = await redisClient.hGetAll(deviceKey(userId, socketId));
      if (Object.keys(device).length > 0) devices.push(device);
    }
    return devices;
  }

  return { addSocket, removeSocket, listOnlineUsers, getUserSocketCount, getUserDevices };
};
