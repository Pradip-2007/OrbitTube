const { time } = require('console');
const { randomUUID } = require('crypto');
const Express = require('express');
const app = Express();
const port = 3000;
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);
const rooms = {};
const roomUsers = {};
const youtubesearchapi = require('youtube-search-api');

app.get('/search', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: 'No query provided' });
    try {
        const results = await youtubesearchapi.GetListByKeyword(query, false, 8, [{ type: 'video' }]);
        const videos = results.items.map(v => ({
            id: v.id,
            title: v.title,
            thumbnail: v.thumbnail?.thumbnails?.at(-1)?.url ?? '',
            duration: v.length?.simpleText ?? ''
        }));
        res.json(videos);
    } catch (err) {
        res.status(500).json({ error: 'Search failed' });
    }
});
app.use(Express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});
app.get('/create-room', (req, res) => {
    const roomId = randomUUID().slice(0, 8)
    rooms[roomId] = {
        participants: [],
        url: null,
        timestamp: 0,
        isplaying: false,
        last_played_at: null
    }
    res.redirect(`/room/${roomId}`);
})

app.get('/room/:roomId', (req, res) => {
    res.sendFile(__dirname + '/public/room.html');
})

io.on('connection', (socket) => {
    let currentroom = '';
    socket.on('disconnect', () => {
        if (!currentroom || !rooms[currentroom]) return;
        const room = rooms[currentroom];
        room.participants = room.participants.filter(p => p.id !== socket.id);
        io.to(currentroom).emit('user-count', room.participants.length);
        if (room.participants.length === 0) delete rooms[currentroom];
    })

    socket.on('chat', (msg) => {
        const room = rooms[currentroom];
        const participant = room.participants.find(p => p.id === socket.id);
        const chatobj = {
            text: msg,
            username: participant.username,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            socketid: socket.id
        }
        io.to(currentroom).emit('chat', chatobj);
    })

    socket.on('joinroom', ({ roomid, username }) => {
        if (!username || username.trim() === '') {
            socket.emit('error', 'Username is required');
            return;
        }
        const room = rooms[roomid];
        if (!room) {
            socket.emit('error', 'Room not found');
            return;
        }
        currentroom = roomid;
        socket.join(roomid);
        let effectiveTimestamp = room.timestamp;
        if (room.isplaying && room.last_played_at) {
            effectiveTimestamp += (Date.now() - room.last_played_at) / 1000;
        }
        room.participants.push({ id: socket.id, username: username });
        io.to(currentroom).emit('user-count', room.participants.length);
        socket.emit('room-state', {
            ...rooms[currentroom],
            timestamp: effectiveTimestamp,
            last_played_at: null
        });
    })

    socket.on('load-video', (videourl) => {
        rooms[currentroom].url = videourl;
        io.to(currentroom).emit('load-video', videourl);
    })

    socket.on('play', (timestamp) => {
        if (currentroom && rooms[currentroom]) {
            rooms[currentroom]['isplaying'] = true;
            rooms[currentroom]['timestamp'] = timestamp;
            rooms[currentroom]['last_played_at'] = Date.now();
            socket.broadcast.to(currentroom).emit('play', timestamp);
        }
    })

    socket.on('pause', (timestamp) => {
        if (currentroom && rooms[currentroom]) {
            rooms[currentroom]['isplaying'] = false;
            rooms[currentroom]['timestamp'] = timestamp;
            rooms[currentroom]['last_played_at'] = null;
            socket.broadcast.to(currentroom).emit('pause', timestamp);
        }
    })
    socket.on('playbackspeed', (speed) => {
        if (currentroom && rooms[currentroom]) {
            rooms[currentroom]['speed'] = speed;
            socket.broadcast.to(currentroom).emit('playbackspeed', speed);
        }
    });
})

server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
})
