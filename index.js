const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: [
      "http://localhost:5173",
      "https://preraku.github.io",
      "https://preraku.github.io/cryptogrammer/",
    ],
    methods: ["GET", "POST"],
  },
});

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://preraku.github.io",
      "https://preraku.github.io/cryptogrammer/",
    ],
  })
);

const games = {};
const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes

io.on("connection", (socket) => {
  console.log("New client connected");

  // Send initial game state to the new client
  socket.on("createGame", () => {
    const gameId = Math.floor(Math.random() * 1000000);
    games[gameId] = {
      inputSentence: "THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG",
      modifications: [{ originalChar: "", replacementChar: "", locked: false }],
      origColor: "#FFA500",
      modColor: "#008000",
      lastActivity: Date.now(),
    };
    socket.join(gameId);
    socket.emit("gameCreated", gameId);
    socket.emit("gameState", games[gameId]);
    console.log(
      "Game created with ID: ",
      gameId,
      ". There are ",
      Object.keys(games).length,
      " active games."
    );
  });

  socket.on("joinGame", (gameId) => {
    if (games[gameId]) {
      games[gameId].lastActivity = Date.now();
      socket.join(gameId);
      // socket.emit("gameState", games[gameId]);
      socket.emit("gameJoined", gameId);
    } else {
      socket.emit("error", "gameNotFound");
    }
  });

  // Handle input sentence change
  socket.on("updateInputSentence", ({ gameId, newSentence }) => {
    if (!games[gameId]) {
      return;
    }
    games[gameId].inputSentence = newSentence;
    games[gameId].lastActivity = Date.now();
    io.emit("gameState", games[gameId]);
    console.log("Input sentence updated to: ", newSentence);
  });

  // Handle color changes
  socket.on("updateColors", ({ gameId, colors }) => {
    if (!games[gameId]) {
      return;
    }
    games[gameId].origColor = colors.origColor;
    games[gameId].modColor = colors.modColor;
    games[gameId].lastActivity = Date.now();
    io.emit("gameState", games[gameId]);
    console.log("Colors updated to: ", colors);
  });

  socket.on("updateModifications", ({ gameId, newModifications }) => {
    if (!games[gameId]) {
      return;
    }
    games[gameId].modifications = newModifications;
    games[gameId].lastActivity = Date.now();
    io.emit("gameState", games[gameId]);
    console.log("Modifications updated to: ", newModifications);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

setInterval(() => {
  const now = Date.now();
  for (const gameId in games) {
    if (games.hasOwnProperty(gameId)) {
      if (now - games[gameId].lastActivity > INACTIVITY_TIMEOUT) {
        delete games[gameId];
        io.to(gameId).emit("gameDeleted");
        console.log("Purged inactive game: ", gameId);
      }
    }
  }
}, 60 * 1000); // Check every minute

const port = process.env.PORT || 8080;
server.listen(port, () => console.log("Server is running on port " + port));
