exports.broadcastAll = (event, data) => {
  if (!io) return;
  io.emit(event, data);
};
