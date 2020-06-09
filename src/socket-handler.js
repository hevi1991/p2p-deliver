const logger = require("./logger");

function handler(io) {
  io.on("connection", socket => {
    logger.info(`Socket ID: ${socket.id} has connected.`);

    /**
     * create a new room
     */
    socket.on("new", () => {
      let roomId = Date.now();
      while (io.sockets.adapter.rooms[roomId]) {
        roomId = Date.now();
      }
      socket.join(roomId);
      socket.emit("joined", roomId, Object.keys(io.sockets.adapter.rooms[roomId].sockets));
      logger.info(`Socket ID: ${socket.id} created room(${roomId}).`);
    });

    socket.on("join", roomId => {
      if (!roomId || roomId === "") {
        socket.emit("refuse", `Room ID: ${roomId} is not existed`);
        return;
      }
      socket.join(roomId);
      const room = io.sockets.adapter.rooms[roomId];
      const roomCount = Object.keys(room.sockets).length;
      if (roomCount < 3) {
        const roomSocketIds = Object.keys(io.sockets.adapter.rooms[roomId].sockets);
        socket.emit("joined", roomId, roomSocketIds);
        if (roomCount > 1) {
          // talk others who in the room, this socket is in now.
          socket.to(roomId).emit("otherjoined", roomId, roomSocketIds);
        }
      } else {
        socket.leave(room);
        socket.emit("full", roomId);
      }
    });

    /// p2p send message
    socket.on("message", (roomId, data) => {
      if (socket.rooms[roomId] !== undefined) {
        socket.to(roomId).emit("message", roomId, data);
      } else {
        socket.emit("refuse", roomId);
      }
    });

    /**
     * leave room
     */
    socket.on("leave", (roomId) => {
      if (roomId !== null) {
        socket.leave(roomId);
        if (io.sockets.adapter.rooms[roomId]) {
          socket.to(roomId).emit("bye", roomId, Object.keys(io.sockets.adapter.rooms[roomId].sockets));
        }
        socket.emit("leave", roomId);
        logger.info(`Socket ID: ${socket.id} left room(${roomId}).`);
      }
    });

    // socket disconnect
    socket.on("disconnect", () => {
      logger.info(`Socket ID: ${socket.id} disconnect.`);
    });
  });
}

module.exports = handler;
