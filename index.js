const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: true, // Allow all origins
    methods: ["GET", "POST"],
  },
});

const DEBUG = false;

const debug = (message, ...args) => {
  if (DEBUG) {
    console.log(message, ...args);
  }
};

const info = (message, ...args) => {
  console.log(message, ...args);
};

const error = (message, ...args) => {
  console.error(message, ...args);
};
if (DEBUG) {
  console.log("Debug mode is enabled.");

  io.use((socket, next) => {
    const originalEmit = socket.emit;

    socket.emit = function (event, ...args) {
      debug(`Sending event '${event}' to client ${socket.id}`);
      return originalEmit.apply(socket, [event, ...args]);
    };

    next();
  });

  // Extend io.emit and io.to(roomId).emit to log messages
  const originalIoEmit = io.emit;

  io.emit = function (event, ...args) {
    debug(`Broadcasting event '${event}' to all connected clients.`);
    return originalIoEmit.apply(io, [event, ...args]);
  };

  // Extend io.to(roomId).emit to log messages
  io.to = (function (originalTo) {
    return function (roomId) {
      const roomEmit = originalTo.call(io, roomId);
      const originalRoomEmit = roomEmit.emit;

      roomEmit.emit = function (event, ...args) {
        const clients = io.sockets.adapter.rooms.get(roomId);
        if (clients) {
          debug(
            `Broadcasting event '${event}' to room ${roomId}, clients:`,
            Array.from(clients)
          );
        } else {
          debug(`Room ${roomId} does not exist or is empty.`);
        }
        return originalRoomEmit.apply(roomEmit, [event, ...args]);
      };

      return roomEmit;
    };
  })(io.to.bind(io));
}

app.use(cors({ origin: true }));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/ssl", (req, res) => {
  res.sendFile(path.join(__dirname, "ssl.html"));
});

app.get("/socket", (req, res) => {
  res.sendFile(path.join(__dirname, "socket.html"));
});

const games = {};
const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes

io.on("connection", (socket) => {
  debug("New client connected. ID:", socket.id);

  function logRoomClients(gameId) {
    const room = io.sockets.adapter.rooms.get(gameId);
    debug(
      `Clients in room ${gameId}:`,
      room ? Array.from(room) : "Room not found"
    );
  }

  // Send initial game state to the new client
  socket.on("createGame", () => {
    debug("--- createGame --- currentGameId:", socket.currentGameId);
    const gameId = Math.floor(Math.random() * 1000000).toString();
    if (socket.currentGameId) {
      const oldGameId = socket.currentGameId;
      socket.leave(oldGameId);
      io.to(oldGameId).emit("userDisconnected", socket.id);
      debug(
        "Socket ${socket.id} left game ${oldGameId} to create new game ${gameId}"
      );
    }
    games[gameId] = {
      inputSentence: "THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG",
      modifications: [{ originalChar: "", replacementChar: "", locked: false }],
      origColor: "#FFA500",
      modColor: "#008000",
      lastActivity: Date.now(),
    };
    socket.join(gameId);
    socket.currentGameId = gameId;
    io.to(gameId).emit("gameCreated", gameId);
    io.to(gameId).emit("gameState", games[gameId]);
    debug(
      `Socket ${socket.id} created game ${gameId}. There are ${
        Object.keys(games).length
      } active games. Game state:`,
      games[gameId]
    );
    logRoomClients(gameId);
  });

  socket.on("disconnect", () => {
    info("Client disconnected. ID:", socket.id);
    if (socket.currentGameId) {
      const gameId = socket.currentGameId;
      socket.leave(gameId);
      io.to(gameId).emit("userDisconnected", socket.id);
      console.log(`Socket ${socket.id} disconnected from game ${gameId}`);
    }
  });

  socket.on("joinGame", (gameId) => {
    debug("--- joinGame --- currentGameId:", socket.currentGameId);
    if (!games[gameId]) {
      error("error: Game not found for joinGame: ", gameId);
      socket.emit("error", "gameNotFound");
      return;
    }
    if (socket.currentGameId && socket.currentGameId !== gameId) {
      const oldGameId = socket.currentGameId;
      socket.leave(oldGameId);
      io.to(oldGameId).emit("userDisconnected", socket.id);
      debug(
        `Socket ${socket.id} left game ${oldGameId} to join game ${gameId}`
      );
    }
    games[gameId].lastActivity = Date.now();
    debug("GameId:", gameId, "clients before join:");
    logRoomClients(gameId);
    socket.join(gameId);
    socket.currentGameId = gameId;
    io.to(gameId).emit("gameJoined", {
      gameId: gameId,
      gameState: games[gameId],
    });
    debug(`Socket ${socket.id} joined game ${gameId}`);
    debug("GameId:", gameId, "clients after join:");
    logRoomClients(gameId);
  });

  // Handle input sentence change
  socket.on("updateInputSentence", ({ gameId, newSentence }) => {
    debug("--- updateInputSentence --- currentGameId:", socket.currentGameId);
    if (!games[gameId]) {
      error("error: Game not found for updateInputSentence: ", gameId);
      return;
    }
    logRoomClients(gameId);
    games[gameId].inputSentence = newSentence;
    games[gameId].lastActivity = Date.now();
    debug("Updated input sentence for game:", gameId);
    io.to(gameId).emit("gameState", games[gameId]);
    debug("Game state: ", games[gameId]);
    logRoomClients(gameId);
  });

  // Handle color changes
  socket.on("updateColors", ({ gameId, colors }) => {
    debug("--- updateColors --- currentGameId:", socket.currentGameId);
    if (!games[gameId]) {
      return;
    }
    games[gameId].origColor = colors.origColor;
    games[gameId].modColor = colors.modColor;
    games[gameId].lastActivity = Date.now();
    io.to(gameId).emit("gameState", games[gameId]);
    debug("Colors updated to: ", colors);
    logRoomClients(gameId);
  });

  socket.on("updateModifications", ({ gameId, newModifications }) => {
    debug("--- updateModifications --- currentGameId:", socket.currentGameId);
    if (!games[gameId]) {
      return;
    }
    logRoomClients(gameId);
    games[gameId].modifications = newModifications;
    games[gameId].lastActivity = Date.now();
    io.to(gameId).emit("gameState", games[gameId]);
    debug("Modifications updated to: ", newModifications);
    logRoomClients(gameId);
  });

  socket.on("disconnect", () => {
    debug("Client disconnected");
  });
});

setInterval(() => {
  const now = Date.now();
  for (const gameId in games) {
    if (games.hasOwnProperty(gameId)) {
      if (now - games[gameId].lastActivity > INACTIVITY_TIMEOUT) {
        delete games[gameId];
        io.to(gameId).emit("gameDeleted");
        info("Purged inactive game: ", gameId);
      }
    }
  }
}, 60 * 1000); // Check every minute

const port = process.env.PORT || 8080;
server.listen(port, () => info("Server is running on port " + port));
