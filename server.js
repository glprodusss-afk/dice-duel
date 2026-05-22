const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = new Map();

io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  socket.on('create_room', (callback) => {
    const roomId = uuidv4().slice(0, 6);
    rooms.set(roomId, {
      players: [socket.id],
      dice: { [socket.id]: [] },
      currentTurn: 0,
      gameStarted: false,
    });
    socket.join(roomId);
    callback({ roomId });
  });

  socket.on('join_room', (roomId, callback) => {
    const room = rooms.get(roomId);
    if (!room) return callback({ error: 'Room not found' });
    if (room.players.length >= 2) return callback({ error: 'Room full' });

    room.players.push(socket.id);
    room.dice[socket.id] = [];
    room.gameStarted = true;
    socket.join(roomId);
    callback({ success: true });

    io.to(roomId).emit('player_joined');
    io.to(roomId).emit('game_started', {
      currentTurn: room.players[room.currentTurn],
    });
    io.to(room.players[0]).emit('your_turn');
    io.to(room.players[1]).emit('opponent_turn');
  });

  socket.on('roll_dice', (roomId) => {
    const room = rooms.get(roomId);
    if (!room || !room.gameStarted) return;

    const playerIndex = room.players.indexOf(socket.id);
    if (playerIndex !== room.currentTurn) {
      return socket.emit('error_message', 'Not your turn');
    }
    if (room.dice[socket.id].length >= 3) {
      return socket.emit('error_message', 'You already rolled 3 times');
    }

    const roll = Math.floor(Math.random() * 6) + 1;
    room.dice[socket.id].push(roll);

    io.to(roomId).emit('dice_rolled', {
      player: socket.id,
      roll,
      dice: room.dice[socket.id],
    });

    const allRolled = room.players.every((pid) => room.dice[pid].length === 3);
    if (allRolled) {
      const sums = {};
      for (const pid of room.players) {
        sums[pid] = room.dice[pid].reduce((a, b) => a + b, 0);
      }
      const [p1, p2] = room.players;
      let winner = null;
      if (sums[p1] > sums[p2]) winner = p1;
      else if (sums[p2] > sums[p1]) winner = p2;

      const happyGifs = [
        'https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif',
        'https://media.giphy.com/media/l0HlBO7eyXz5W4tHi/giphy.gif',
        'https://media.giphy.com/media/3o6Zt6KHxJTbCOYqCQ/giphy.gif',
        'https://media.giphy.com/media/xT0xeJpnbqOAsnW278/giphy.gif',
      ];
      const sadGifs = [
        'https://media.giphy.com/media/3o7TKz9V9y3zMwI5DG/giphy.gif',
        'https://media.giphy.com/media/d2lcHJTG5Tscg/giphy.gif',
        'https://media.giphy.com/media/l0HlNQqoXdLqFvZGU/giphy.gif',
        'https://media.giphy.com/media/26BRv0ThB8aE82w0g/giphy.gif',
      ];
      const drawGifs = [
        'https://media.giphy.com/media/l0HlA1wFG4hIM2YXG/giphy.gif',
        'https://media.giphy.com/media/xT0xeMA62E1XIlQq0o/giphy.gif',
      ];

      const randomHappy = happyGifs[Math.floor(Math.random() * happyGifs.length)];
      const randomSad = sadGifs[Math.floor(Math.random() * sadGifs.length)];
      const randomDraw = drawGifs[Math.floor(Math.random() * drawGifs.length)];

      io.to(roomId).emit('game_over', {
        winner,
        p1: { id: p1, sum: sums[p1], dice: room.dice[p1] },
        p2: { id: p2, sum: sums[p2], dice: room.dice[p2] },
        gifs: {
          [p1]: winner === p1 ? randomHappy : winner === p2 ? randomSad : randomDraw,
          [p2]: winner === p2 ? randomHappy : winner === p1 ? randomSad : randomDraw,
        },
      });

      rooms.set(roomId, {
        players: [p1, p2],
        dice: { [p1]: [], [p2]: [] },
        currentTurn: 0,
        gameStarted: true,
      });
    } else {
      room.currentTurn = (room.currentTurn + 1) % 2;
      const nextPlayer = room.players[room.currentTurn];
      io.to(nextPlayer).emit('your_turn');
      io.to(room.players[1 - room.currentTurn]).emit('opponent_turn');
    }
  });

  socket.on('play_again', (roomId) => {
    const room = rooms.get(roomId);
    if (!room) return;
    room.dice[room.players[0]] = [];
    room.dice[room.players[1]] = [];
    room.currentTurn = 0;
    io.to(roomId).emit('game_reset');
    io.to(room.players[0]).emit('your_turn');
    io.to(room.players[1]).emit('opponent_turn');
  });

  socket.on('disconnect', () => {
    console.log('Disconnected:', socket.id);
    for (const [roomId, room] of rooms.entries()) {
      if (room.players.includes(socket.id)) {
        io.to(roomId).emit('player_left');
        rooms.delete(roomId);
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});