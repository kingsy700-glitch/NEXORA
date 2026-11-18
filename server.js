const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

const rooms = new Map();

function roomUsers(roomId) {
  const room = rooms.get(roomId);
  return room ? [...room.values()].map(u => ({ id: u.id, name: u.name, muted: u.muted })) : [];
}
function sendUsers(roomId) {
  io.to(roomId).emit("users", roomUsers(roomId));
}

io.on("connection", socket => {
  socket.on("join-room", ({ roomId, name }) => {
    roomId = String(roomId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
    name = String(name || "ضيف").trim().slice(0, 24) || "ضيف";
    if (!roomId) return socket.emit("join-error", "رابط الغرفة غير صالح.");
    if (!rooms.has(roomId)) rooms.set(roomId, new Map());
    const room = rooms.get(roomId);
    if (room.size >= 8) return socket.emit("join-error", "الغرفة ممتلئة (الحد الأقصى 8 أشخاص).");
    const existing = [...room.keys()];
    socket.join(roomId);
    room.set(socket.id, { id: socket.id, name, muted: false });
    socket.data.roomId = roomId;
    socket.emit("joined", { roomId, peers: existing });
    socket.to(roomId).emit("peer-joined", { id: socket.id, name });
    sendUsers(roomId);
  });

  socket.on("signal", ({ to, data }) => {
    if (to && data) io.to(to).emit("signal", { from: socket.id, data });
  });

  socket.on("chat", ({ text }) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const clean = String(text || "").trim().slice(0, 500);
    if (clean) io.to(roomId).emit("chat", { name: rooms.get(roomId)?.get(socket.id)?.name || "ضيف", text: clean, time: new Date().toISOString() });
  });

  socket.on("mute-state", muted => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId)) return;
    const user = rooms.get(roomId).get(socket.id);
    if (user) { user.muted = !!muted; sendUsers(roomId); }
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId)) return;
    rooms.get(roomId).delete(socket.id);
    socket.to(roomId).emit("peer-left", { id: socket.id });
    if (rooms.get(roomId).size === 0) rooms.delete(roomId);
    else sendUsers(roomId);
  });
});

server.listen(PORT, () => console.log(`NEXORA running on ${PORT}`));