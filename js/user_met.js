const tempoDisplay = document.querySelector('.tempo');
const tempoText = document.querySelector('.tempo-text');
const dot = document.querySelector('.dot');
const enterBtn = document.querySelector('.join-btn');
const codeInput = document.querySelector('.form-control');
const videoPlayer = document.querySelector('#videoPlayer');
let isHandlingServerEvent = false;

var metronome = new Metronome(dot);
let bpm = 140;
let tempoTextString = 'Medium';

var socket = io();
var kickCounter = 0;
var socketRoom;

var ts = timesync.create({
    server: socket,
    interval: 5000
});

socket.on('user_start', function(msg) {
    console.log(msg - ts.now())
    let offset = msg-ts.now();
    if (offset < 500 && offset > 0){
        setTimeout(function(){
            metronome.start()
        }, msg - ts.now())
    }else{
        if (kickCounter > 2){
            socket.emit("leave_room", socket.id);
        }
        console.warn("going out of sync for some reason.")
        console.log(socketRoom);
        setTimeout(()=>{
            socket.emit("master_stop", {roomID: socketRoom, error: "outOfSync"});
        }, 500)
        kickCounter++;

    }

});

socket.on('user_stop', function(msg) {
    metronome.stop();
});


socket.on('user_bpm', function(msg) {
    bpm = parseInt(msg);
    updateMetronome();
});

socket.on('joined', function(msg){
    enterBtn.innerHTML = 'Joined!';
    socketRoom = msg.roomID;
})

socket.on('timesync', function (data) {
    //console.log('receive', data);
    ts.receive(null, data);
  });

// socket.on('ping' , (msg) => {
//     socket.emit('ping', {start: msg, id: socket.id})
// })

// socket.on('result', (msg) =>{
//     console.log(msg);
// })
socket.on('not found', function(msg) {
    enterBtn.innerHTML = 'Not found!';
    setTimeout(function(){
        enterBtn.innerHTML = 'JOIN';
      }, 1000)
})



ts.on('sync', function (state) {
    console.log('sync ' + state + '');
});

ts.on('change', function (offset) {
    console.log('changed offset: ' + offset + ' ms');
});

ts.send = function (socket, data, timeout) {
    //console.log('send', data);
    return new Promise(function (resolve, reject) {
      var timeoutFn = setTimeout(reject, timeout);

      socket.emit('timesync', data, function () {
        clearTimeout(timeoutFn);
        resolve();
      });
    });
  };


enterBtn.addEventListener('click', () => {
    var txt = codeInput.value
    socket.emit('join_room', { roomID: txt , socketID: socket.id});
    metronome.start();
    setTimeout(function(){
      metronome.stop();
    }, 500)
});

function updateMetronome() {
    tempoDisplay.textContent = bpm;
    metronome.tempo = bpm;
    if (bpm <= 40) { tempoTextString = "Grave" };
    if (bpm > 40 && bpm <= 45) { tempoTextString = "Lento" };
    if (bpm > 45 && bpm <= 55) { tempoTextString = "Largo" };
    if (bpm > 55 && bpm <= 65) { tempoTextString = "Adagio" };
    if (bpm > 65 && bpm <= 69) { tempoTextString = "Adagietto" };
    if (bpm > 69 && bpm <= 77) { tempoTextString = "Andante" };
    if (bpm > 77 && bpm <= 97) { tempoTextString = "Moderato" };
    if (bpm > 97 && bpm <= 109) { tempoTextString = "Allegretto" };
    if (bpm > 109 && bpm <= 132) { tempoTextString = "Allegro" };
    if (bpm > 132 && bpm <= 154) { tempoTextString = "Vivace" };
    if (bpm > 154 && bpm <= 177) { tempoTextString = "Presto" };
    if (bpm > 178) { tempoTextString = "Prestissimo" };

    tempoText.textContent = tempoTextString;
}

// Add this event handler for receiving video paths
socket.on('play_video', (msg) => {
    videoPlayer.src = `/video/${encodeURIComponent(msg.videoPath)}`;
    videoPlayer.currentTime = 0;
    videoPlayer.play().catch(err => console.error('Video play error:', err));
});

// Handle video state changes from server
socket.on('video_state_change', (msg) => {
    if (isHandlingServerEvent) return;
    isHandlingServerEvent = true;

    console.log('Video state change from server:', msg.action);

    try {
        switch(msg.action) {
            case 'play':
                // Calculate time difference and adjust for network delay
                const timeOffset = (Date.now() - msg.serverTime) / 1000;
                const adjustedTime = msg.currentTime + timeOffset;

                // Set current time and play
                videoPlayer.currentTime = adjustedTime;
                videoPlayer.play().catch(console.error);
                break;

            case 'pause':
                videoPlayer.pause();
                videoPlayer.currentTime = msg.currentTime;
                break;

            case 'seek':
                videoPlayer.currentTime = msg.currentTime;
                break;
        }
    } catch (error) {
        console.error('Error handling video sync:', error);
    } finally {
        setTimeout(() => {
            isHandlingServerEvent = false;
        }, 100);
    }
});

// Add periodic sync check
setInterval(() => {
    if (videoPlayer.duration > 0 && !videoPlayer.paused) {
        socket.emit('check_sync', {
            roomID: socketRoom,
            currentTime: videoPlayer.currentTime,
            timestamp: Date.now()
        });
    }
}, 10000); // Check every 10 seconds

// Handle sync response
socket.on('sync_check_response', (msg) => {
    const hostTime = msg.currentTime;
    const currentTime = videoPlayer.currentTime;
    const diff = Math.abs(hostTime - currentTime);

    if (diff > 0.5) {  // If more than 500ms off
        isHandlingServerEvent = true;
        videoPlayer.currentTime = hostTime;
        setTimeout(() => {
            isHandlingServerEvent = false;
        }, 100);
    }
});

// Prevent clients from controlling video directly
videoPlayer.addEventListener('play', (e) => {
    if (!isHandlingServerEvent) {
        e.preventDefault();
        videoPlayer.pause();

        // Request sync from server
        socket.emit('request_sync', {
            roomID: socketRoom
        });
    }
});

videoPlayer.addEventListener('pause', (e) => {
    if (!isHandlingServerEvent) {
        e.preventDefault();
    }
});

videoPlayer.addEventListener('seeked', (e) => {
    if (!isHandlingServerEvent) {
        e.preventDefault();
        // Revert to previous position if available
        if (videoPlayer.lastTime !== undefined) {
            videoPlayer.currentTime = videoPlayer.lastTime;
        }
    }
});

// Store last time before seeking
videoPlayer.addEventListener('seeking', () => {
    if (!isHandlingServerEvent) {
        videoPlayer.lastTime = videoPlayer.currentTime;
    }
});

// Add to user_met.js
socket.on('sync_adjustment', (msg) => {
    if (isHandlingServerEvent) return;

    const roundTripTime = Date.now() - msg.clientTime;
    const oneWayLatency = roundTripTime / 2;
    const hostTime = msg.currentTime + (oneWayLatency / 1000);
    const currentTime = videoPlayer.currentTime;
    const timeDiff = Math.abs(hostTime - currentTime);

    // If more than 0.5 seconds off, adjust
    if (timeDiff > 0.5) {
        isHandlingServerEvent = true;
        console.log(`Adjusting video time from ${currentTime} to ${hostTime}`);
        videoPlayer.currentTime = hostTime;

        setTimeout(() => {
            isHandlingServerEvent = false;
        }, 100);
    }
});
