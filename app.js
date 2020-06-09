const express = require("express");
const app = express();
const http = require("http").createServer(app);
const path = require("path");
const logger = require("./src/logger");
const io = require("socket.io")(http);
const socketHandler = require("./src/socket-handler");

// static asset
app.use(express.static("web"));

// router
app.get("/", (req, res) => {
  res.sendFile(path.resolve(__dirname, "web/index.html"));
});

// socket io
socketHandler(io);

http.listen(3000, () => {
  logger.info("Server listening on *:3000");
});

// STUN and TURN server
const Turn = require("node-turn");
const server = new Turn({
  credentials: {
    bbb: "1234"
  }
});
server.start();
