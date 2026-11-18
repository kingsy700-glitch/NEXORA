
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

const io = new Server(server);

const PORT = process.env.PORT || 3000;

// عرض ملفات المشروع الموجودة داخل مجلد code
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// الاتصال باللاعبين
io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  socket.on("join-room", (room) => {
    socket.join(room);
    socket.to(room).emit("player-joined", socket.id);
  });

  socket.on("game-move", (data) => {
    socket.to(data.room).emit("game-move", data);
  });

  socket.on("chat-message", (data) => {
    io.to(data.room).emit("chat-message", data);
  });

  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("NEXORA server running on port " + PORT);
});
