

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const rooms = new Map();

app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  socket.on("join-room", ({ roomId, name }) => {
    if (!roomId || !name) return;

    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Map());
    }

    const room = rooms.get(roomId);

    if (room.size >= 8) {
      socket.emit("join-error", "الغرفة ممتلئة!");
      return;
    }

    const existing = [...room.keys()];

    room.set(socket.id, {
      id: socket.id,
      name: String(name).slice(0, 24),
      muted: false
    });

    socket.join(roomId);
    socket.data.roomId = roomId;

    socket.emit("joined", { peers: existing });

    socket.to(roomId).emit("peer-joined", {
      id: socket.id
    });

    io.to(roomId).emit("users", [...room.values()]);
  });

  socket.on("signal", ({ to, data }) => {
    io.to(to).emit("signal", {
      from: socket.id,
      data
    });
  });

  socket.on("mute-state", (muted) => {
    const room = rooms.get(socket.data.roomId);
    if (!room || !room.has(socket.id)) return;

    room.get(socket.id).muted = !!muted;

    io.to(socket.data.roomId).emit(
      "users",
      [...room.values()]
    );
  });

  socket.on("chat", ({ text }) => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);

    if (!room || !text) return;

    const user = room.get(socket.id);

    io.to(roomId).emit("chat", {
      name: user.name,
      text: String(text).slice(0, 500)
    });
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);

    if (!room) return;

    room.delete(socket.id);

    socket.to(roomId).emit("peer-left", {
      id: socket.id
    });

    io.to(roomId).emit("users", [...room.values()]);

    if (room.size === 0) {
      rooms.delete(roomId);
    }

    console.log("Player disconnected:", socket.id);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("NEXORA server running on port " + PORT);
});
