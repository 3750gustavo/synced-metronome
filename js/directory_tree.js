class DirectoryTree {
    constructor(directoryTreeElement, videoGridElement) {
        this.directoryTreeElement = directoryTreeElement;
        this.videoGridElement = videoGridElement;
    }

    createVideoElement(video) {
        const div = document.createElement('div');
        div.className = 'video-item';
        div.textContent = video.name;

        div.addEventListener('click', () => {
            if (typeof socket !== 'undefined' && typeof roomID !== 'undefined') {
                socket.emit('select_video', {
                    roomID: roomID,
                    videoPath: video.path
                });
                const modal = document.querySelector('#videoSelectModal');
                if (modal) {
                    modal.style.display = 'none';
                }
            }
        });

        return div;
    }

    renderVideoGrid(videos) {
        this.videoGridElement.innerHTML = '';
        videos.forEach(video => {
            this.videoGridElement.appendChild(this.createVideoElement(video));
        });
    }

    initialize(structure) {
        this.videoGridElement.innerHTML = '';
        this.renderVideoGrid(structure.videos);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const directoryTree = new DirectoryTree(
        document.querySelector('.directory-tree'),
        document.querySelector('.video-grid')
    );

    if (typeof socket !== 'undefined') {
        socket.on('video_structure', (structure) => {
            directoryTree.initialize(structure);
        });
    }
});
