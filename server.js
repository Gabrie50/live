const express = require('express');
const axios = require('axios');
const app = express();

// IMPORTANTE: Railway usa IPv6 internamente
const PORT = process.env.PORT || 8080;
const HOST = '::';  // IPv6 para Railway

const HEADERS = {
    'Referer': 'https://www.casino.org/',
    'Origin': 'https://www.casino.org',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
};

const STREAM_BASE = 'https://live101.egprom.com/app/30/';

// Proxy endpoints (mesmo código anterior)
app.get('/playlist.m3u8', async (req, res) => {
    try {
        const response = await axios.get(STREAM_BASE + 'amlst:bacbor1_bi_auto/playlist.m3u8', {
            headers: HEADERS,
            responseType: 'text'
        });
        let playlist = response.data;
        playlist = playlist.replace(/([a-zA-Z0-9_\/\-]+\.m3u8\?[^\s]+)/g, (match) => {
            return `/playlist?url=${encodeURIComponent(match)}`;
        });
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.send(playlist);
    } catch (error) {
        res.status(500).send('Erro');
    }
});

app.get('/playlist', async (req, res) => {
    const encoded = req.query.url;
    if (!encoded) return res.status(400).send('No url');
    let decoded = decodeURIComponent(encoded);
    decoded = decoded.replace(/^com\/app\/30\//, '');
    const fullUrl = STREAM_BASE + decoded;
    try {
        const response = await axios.get(fullUrl, { headers: HEADERS, responseType: 'text' });
        let playlist = response.data;
        playlist = playlist.replace(/([a-zA-Z0-9_\-]+\.ts)/g, (match) => {
            return `/segment?url=${encodeURIComponent(match)}`;
        });
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.send(playlist);
    } catch (error) {
        res.status(502).send('Error');
    }
});

app.get('/segment', async (req, res) => {
    const segment = req.query.url;
    const fullUrl = `${STREAM_BASE}amlst:bacbor1_bi_auto/${segment}`;
    try {
        const response = await axios({ url: fullUrl, headers: HEADERS, responseType: 'stream' });
        response.data.pipe(res);
    } catch(e) {
        res.status(404).send('Not found');
    }
});

// HTML igual ao anterior
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html>
<head><title>Bac Bo Live</title>
<style>body{margin:0;background:#000;}video{width:100%;height:auto;}</style>
</head>
<body>
<video id="video" controls autoplay></video>
<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
<script>
const video=document.getElementById('video');
if(Hls.isSupported()){
const hls=new Hls({debug:false});
hls.loadSource('/playlist.m3u8');
hls.attachMedia(video);
hls.on(Hls.Events.MANIFEST_PARSED,()=>video.play());
}
</script>
</body>
</html>`);
});

// Ouvindo em IPv6 (obrigatório para Railway)
app.listen(PORT, HOST, () => {
    console.log(`✅ Servidor rodando em ${HOST}:${PORT}`);
});
