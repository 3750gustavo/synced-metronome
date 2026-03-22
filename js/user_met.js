const tempoDisplay = document.querySelector('.tempo');
const tempoText = document.querySelector('.tempo-text');
const dot = document.querySelector('.dot');
const enterBtn = document.querySelector('.join-btn');
const codeInput = document.querySelector('.form-control');
const videoPlayer = document.querySelector('#videoPlayer');
const videoVolumeSlider = document.querySelector('#videoVolume');
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

// Video volume control for client
videoVolumeSlider.addEventListener('input', () => {
    videoPlayer.volume = videoVolumeSlider.value;
    videoPlayer.muted = false; // Unmute when volume is adjusted
});

// Set initial volume
videoPlayer.volume = videoVolumeSlider.value;

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

// Cliente carrega vídeo via HTTP e sincroniza com comandos do host
socket.on('play_video', (msg) => {
    videoPlayer.src = `/video/${encodeURIComponent(msg.videoPath)}`;
    videoPlayer.currentTime = 0;
    console.log('Video loaded:', msg.videoPath);
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
                // Subtract offset to account for network latency
                const timeOffset = (Date.now() - msg.serverTime) / 1000;
                const adjustedTime = msg.currentTime - timeOffset;

                // Set current time and play
                videoPlayer.currentTime = adjustedTime;
                videoPlayer.muted = false; // Ensure audio is enabled
                videoPlayer.play().catch(console.error);
                break;

            case 'pause':
                videoPlayer.pause();
                videoPlayer.currentTime = msg.currentTime;
                break;

            case 'seek':
                videoPlayer.currentTime = msg.currentTime;
                // Force playback after seek to prevent freezing
                setTimeout(() => {
                    if (!videoPlayer.paused) {
                        videoPlayer.play().catch(console.error);
                    }
                }, 100);
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

// Prevent clients from controlling video directly
videoPlayer.addEventListener('play', (e) => {
    if (!isHandlingServerEvent) {
        e.preventDefault();
        videoPlayer.pause();
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

