let pendingsync = null;
let isSyncing = false;
let player;
let networkactiontimer = null;
const roomId = window.location.pathname.split('/')[2];
const socket = io({ transports: ['websocket', 'polling'] });
const messageinput = document.getElementById('chatInput');
const messagesend = document.getElementById('sendBtn');
const chat_window = document.getElementById('chatMessages');
const startBtn = document.getElementById('startBtn');
const joinOverlay = document.getElementById('joinOverlay');
const username = localStorage.getItem('username');
const shareBtn = document.getElementById('shareBtn');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const searchResults = document.getElementById('searchResults');
if (!username) {
    localStorage.setItem('pendingroom', roomId);
    window.location.href = '/';

}
if (roomId) {
    document.getElementById('roomBadge').textContent = roomId;
}

socket.on('connect', () => {
    socket.emit('joinroom', { roomid: roomId, username });
})
socket.on('error', (msg) => {
    alert(msg);
    localStorage.removeItem('pendingroom');
    window.location.href = '/';

})
socket.on('room-state', (roomdata) => {
    pendingsync = roomdata;
    if (player && typeof player.loadVideoById === 'function') applyRoomState(roomdata);
})

socket.on('play', (timestamp) => {
    locknetwork();
    if (Math.abs(player.getCurrentTime() - timestamp) > 1) {
        player.seekTo(timestamp, true);
    }
    try { player.playVideo(); }
    catch (error) { }
})

socket.on('pause', (timestamp) => {
    locknetwork();
    player.seekTo(timestamp, true);
    player.pauseVideo();
})

socket.on('load-video', (url) => {
    locknetwork(1200);
    const videoid = extractVideoId(url);
    player.loadVideoById({
        videoId: videoid,
        suggestedQuality: 'default'
    });
})

socket.on('user-count', (count) => {
    document.getElementById('participantCount').textContent = count + ' online';
})

socket.on('chat', (chatobj) => {
    const msgDiv = document.createElement('div');
    const me = chatobj.socketid === socket.id;
    msgDiv.classList.add('message', me ? 'my-message' : 'other-message');
    msgDiv.style.padding = '5px 10px';
    msgDiv.innerHTML = `
        <span class='msg-username'>${chatobj.username}</span>
        <span class='msg-text'>${chatobj.text}
        <small class='msg-time'>${chatobj.time}</small></span>
    `
    chat_window.appendChild(msgDiv);
    chat_window.scrollTop = chat_window.scrollHeight;
})
socket.on('playbackspeed', (speed) => {
    locknetwork(200);
    player.setPlaybackRate(speed);
})
window.onYouTubeIframeAPIReady = function () {
    player = new YT.Player('player', {
        height: '100%',
        width: '100%',
        host: 'https://www.youtube.com',
        playerVars: {
            'controls': 1,
            'rel': 0,
            'origin': window.location.origin,
            'enablejsapi': 1,
            'widget_referrer': window.location.href,
            'playsinline': 1
        },
        events: {
            onReady: onPlayerReady,
            onStateChange: onPlayerStateChange,
            onError: onPlayerError,
            onPlaybackRateChange: onPlaybackRateChange
        }

    })
}
function locknetwork(duration = 800) {
    isSyncing = true;
    clearTimeout(networkactiontimer);
    networkactiontimer = setTimeout(() => {
        isSyncing = false;
    }, duration);
}
function onPlayerError(event) {
    if (event.data === 101 || event.data === 150) {
        alert('Embedding is disabled for this video . Please try a different video..!');
    }
}
function extractVideoId(url) {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[7].length === 11) ? match[7] : url;
}

function onPlayerReady() {
    if (pendingsync && pendingsync.url) {
        applyRoomState(pendingsync);
    }
}
function applyRoomState(state) {
    if (!state || !state.url) return;
    locknetwork(1200);
    const videoId = extractVideoId(state.url);
    let target_timestamp = Math.max(0, state.timestamp);
    const duration = player.getDuration();
    if (duration && duration > 0) {
        target_timestamp = Math.min(target_timestamp, duration - 2);
    }
    let currenturl = '';
    try { currenturl = player.getVideoUrl(); }
    catch (e) { }
    if (currenturl && currenturl.includes(videoId)) {
        if (Math.abs(player.getCurrentTime() - target_timestamp) > 1) player.seekTo(target_timestamp, true);
        if (state.isplaying) {
            try { player.playVideo(); }
            catch (e) { }
        }
        else player.pauseVideo();
    }
    else {
        if (state.isplaying) {
            player.loadVideoById({
                videoId: videoId,
                startSeconds: target_timestamp,
            })
        }
        else {
            player.cueVideoById({
                videoId: videoId,
                startSeconds: target_timestamp
            })
        }
    }

}
function onPlayerStateChange(event) {
    if (event.data === 1 || event.data === 2) {
        if (isSyncing) {
            return;
        }
        if (event.data === 1) socket.emit('play', player.getCurrentTime());
        else if (event.data === 2) socket.emit('pause', player.getCurrentTime());

    }

}
function onPlaybackRateChange(event) {
    if (isSyncing) return;
    else {
        socket.emit('playbackspeed', event.data);
    }
}
shareBtn.addEventListener('click', async () => {
    if (navigator.share) {
        await navigator.share({
            title: 'Join my OrbitTube room',
            text: 'Join my OrbitTube room',
            url: window.location.href
        });
    }
    else {
        navigator.clipboard.writeText(window.location.href);
        alert('link copied');
    }

})
startBtn.addEventListener('click', () => {
    joinOverlay.style.display = 'none';
    const iframeapi_tag = document.createElement('script');
    iframeapi_tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(iframeapi_tag, firstScriptTag);
})

messagesend.addEventListener('click', () => {
    const text = messageinput.value.trim();
    if (text) {
        socket.emit('chat', text);
        messageinput.value = '';
    }
})
messageinput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') messagesend.click();
})
searchBtn.addEventListener('click', async () => {
    const query = searchInput.value.trim();
    if (!query) return;
    const possibleId = extractVideoId(query);
    if (possibleId !== query) {
        socket.emit('load-video', query);
        searchInput.value = '';
        searchResults.style.display = none;
        return;
    }
    searchResults.innerHTML = '<div style="padding:8px;color:#aaa">Searching...</div>';
    searchResults.style.display = 'block';

    const res = await fetch(`/search?q=${encodeURIComponent(query)}`);
    const videos = await res.json();

    searchResults.innerHTML = '';
    videos.forEach(v => {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        item.innerHTML = `
            <img src="${v.thumbnail}" width="80" style="border-radius:4px;flex-shrink:0">
            <div style="overflow:hidden">
                <div style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${v.title}</div>
                <div style="font-size:11px;color:#aaa">${v.duration}</div>
            </div>
        `;
        item.style.cssText = 'display:flex;gap:10px;padding:8px;cursor:pointer;align-items:center;border-bottom:1px solid #333';
        item.addEventListener('click', () => {
            socket.emit('load-video', `https://www.youtube.com/watch?v=${v.id}`);
            searchResults.style.display = 'none';
            searchInput.value = '';
        });
        searchResults.appendChild(item);
    });
});

searchInput.addEventListener('keypress', e => {
    if (e.key === 'Enter') searchBtn.click();
});

document.addEventListener('click', e => {
    if (!searchResults.contains(e.target) && e.target !== searchInput && e.target !== searchBtn) {
        searchResults.style.display = 'none';
    }
});