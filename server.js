const express = require('express');
const timesyncServer = require('timesync/server');
const app = express();
const path = require('path');
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const fs = require('fs');
const cors = require('cors');
const ffmpeg = require('fluent-ffmpeg');

const CONFIG_PATH = path.join(__dirname, 'config', 'video_paths.json');

// Estado do vídeo no servidor
let currentVideoPath = null;
let isPlaying = false;
let currentTime = 0;
let videoDuration = 0;
let hostSocketId = null; // ID do socket do host

// Add video-related functions
function loadVideoPaths() {
    try {
        const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        return config.paths.map(p => path.normalize(p));
    } catch (err) {
        console.error('Error loading video paths:', err);
        return [];
    }
}

function getVideosInDirectory(directory) {
    const videos = [];
    const files = fs.readdirSync(directory);

    files.forEach(file => {
        const filePath = path.join(directory, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            videos.push(...getVideosInDirectory(filePath));
        } else if (file.match(/\.(mp4|webm|mkv)$/i)) {
            videos.push(filePath);
        }
    });

    return videos;
}

function getVideosWithStructure(directories) {
    const structure = {
        videos: []
    };

    directories.forEach(baseDir => {
        function processDirectory(dir) {
            const files = fs.readdirSync(dir);

            files.forEach(file => {
                const fullPath = path.join(dir, file);
                const stat = fs.statSync(fullPath);

                if (stat.isDirectory()) {
                    processDirectory(fullPath);
                } else if (file.match(/\.(mp4|webm|mkv)$/i)) {
                    structure.videos.push({
                        path: fullPath,
                        name: file
                    });
                }
            });
        }

        processDirectory(baseDir);
    });

    return structure;
}

app.use('/timesync/', express.static(path.join(__dirname, '/../../../dist')));
app.use(cors()); // Permitir CORS durante o desenvolvimento

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});
app.use(express.static(__dirname + '/'));

app.use('/timesync', timesyncServer.requestHandler);


io.on('connection', (socket) => {
  //console.log('a user connected');
  
  socket.on('master_start', (msg) => {
    io.to(msg.roomID).emit('user_start', msg.start);
  });
  socket.on('master_stop', (msg) => {
    io.to(msg.roomID).emit('user_stop', msg)
  });
  socket.on('server_bpm', (msg) => {
    console.log(msg.roomID)
    console.log(msg.BPM)
    io.to(msg.roomID).emit('user_bpm', msg.BPM)
  });
  socket.on('join_room', (msg) => {
    if(io.sockets.adapter.rooms.has(msg.roomID))
    {
      console.log("joined room " + msg.roomID)
      io.to(msg.socketID).emit("joined", msg)
      socket.join(msg.roomID);
      setTimeout(function(){
        io.to(msg.socketID).emit('user_stop', msg)
      }, 100)
      // interval = setInterval(() => {
      //   const start = Date.now();

      //   io.to(msg.id).emit("ping", start)
      // }, 10);
    }
    else{
      console.log(msg)
      console.log("room " + msg.roomID + " not found")
      io.to(msg.socketID).emit("not found", msg)
    }

  })

  socket.on('leave_room', (msg)=>{
    console.log(msg, " has disconnected from their room");
    socket.leave(msg);
  })

  socket.on('create_room', (msg) => {
    if(io.sockets.adapter.rooms.has(msg.roomID))
    {
      io.to(msg.socketID).emit('room taken', msg)
    }
    else
    {
      console.log("created room: " + msg)
      socket.join(msg.roomID);
    }

  })

  // socket.on('ping', (msg) => {
  //   let delay = Date.now() - msg.start
  //   console.log(delay);
  //   counter++
  //   total += delay;
  //   if(counter > 100)
  //   {
  //     io.to(msg.id).emit("result", total/counter)
  //     counter = 0;
  //     total = 0;
  //     clearInterval(interval)
  //   }
  // })
  socket.on('timesync', function (data) {
    socket.emit('timesync', {
      id: data && 'id' in data ? data.id : null,
      result: Date.now()
    });
  });

  socket.on('request_videos', () => {
    const videoPaths = loadVideoPaths();
    const videoStructure = getVideosWithStructure(videoPaths);
    socket.emit('video_structure', videoStructure);
  });

  socket.on('select_video', (msg) => {
    const videoPath = msg.videoPath;
    
    // Validar caminho
    const videoPaths = loadVideoPaths();
    const isValidPath = videoPaths.some(basePath =>
        videoPath.startsWith(path.normalize(basePath))
    );

    if (!isValidPath) {
        socket.emit('error', { message: 'Invalid video path' });
        return;
    }

    // Obter duração do vídeo
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (!err) {
            videoDuration = metadata.format.duration;
            currentVideoPath = videoPath;
            currentTime = 0;
            isPlaying = false;
            hostSocketId = socket.id;
            console.log('Video selected:', videoPath, 'Duration:', videoDuration);
        }
    });

    // Notificar todos na sala para carregar o vídeo via HTTP
    if (io.sockets.adapter.rooms.has(msg.roomID)) {
        io.to(msg.roomID).emit('play_video', {
            videoPath: videoPath,
            serverTime: Date.now()
        });
    }
  });

  socket.on('video_control', (msg) => {
    const roomID = msg.roomID;
    
    if (!io.sockets.adapter.rooms.has(roomID)) {
        return;
    }

    // Atualizar estado do servidor
    switch(msg.action) {
        case 'play':
            isPlaying = true;
            currentTime = msg.currentTime;
            break;
        case 'pause':
            isPlaying = false;
            currentTime = msg.currentTime;
            break;
        case 'seek':
            currentTime = msg.currentTime;
            break;
    }

    // Broadcast comando para todos os clientes (exceto host)
    socket.to(roomID).emit('video_state_change', {
        action: msg.action,
        currentTime: msg.currentTime,
        serverTime: Date.now()
    });
  });

});

// Keep only the necessary routes
app.get('/video/:filename', (req, res) => {
  try {
    const videoPath = decodeURIComponent(req.params.filename);
    const videoPaths = loadVideoPaths();

    // Validate video path
    const isValidPath = videoPaths.some(basePath =>
      videoPath.startsWith(path.normalize(basePath))
    );

    if (!isValidPath) {
      return res.status(403).send('Access denied');
    }

    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize-1;
      const chunksize = (end-start)+1;
      const file = fs.createReadStream(videoPath, {start, end});
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
      };
      res.writeHead(200, head);
      fs.createReadStream(videoPath).pipe(res);
    }
  } catch (error) {
    console.error('Invalid URI in filename parameter:', error);
    res.status(400).send('Invalid filename format');
  }
});

// app.post('/timesync', function (req, res) {
//   var data = {
//     id: (req.body && 'id' in req.body) ? req.body.id : null,
//     result: Date.now()
//   };
//   res.json(data);
// });

let port = process.env.PORT;
if (port == null || port == "") {
  port = 3000;
}

server.listen(port, () => {
  console.log('listening on *:' + port);
});