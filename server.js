const express = require('express');
const axios = require('axios');
const app = express();

const PORT = process.env.PORT || 8080;

const HEADERS = {
    'Referer': 'https://www.casino.org/',
    'Origin': 'https://www.casino.org',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36 Edg/147.0.0.0'
};

const SID = '689da710046e2f0_739425';
const STREAM_BASE = `https://live101.egprom.com/app/30/bacbor1_bi_med/`;

app.get('/ping', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

// Playlist principal
app.get('/stream.m3u8', async (req, res) => {
    console.log(`[${new Date().toISOString()}] 📡 Playlist solicitada`);
    
    try {
        const url = `${STREAM_BASE}media.m3u8?sid=${SID}`;
        const response = await axios.get(url, {
            headers: HEADERS,
            responseType: 'text',
            timeout: 10000
        });
        
        let playlist = response.data;
        
        // Substitui URLs dos segmentos .mp4
        playlist = playlist.replace(/(media\.\d+\.mp4\?[^\s]+)/g, (match) => {
            return `/segment?url=${encodeURIComponent(match)}`;
        });
        
        // Substitui URLs dos media-init
        playlist = playlist.replace(/(media-init\.[^?]+\.[^?\s]+\.mp4\?[^\s]+)/g, (match) => {
            return `/init?url=${encodeURIComponent(match)}`;
        });
        
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-cache');
        res.send(playlist);
        
    } catch (error) {
        console.error('❌ Erro:', error.message);
        res.status(500).send('Erro ao carregar stream');
    }
});

// Segmentos de vídeo normais
app.get('/segment', async (req, res) => {
    const segmentName = req.query.url;
    if (!segmentName) return res.status(400).send('Segmento não fornecido');
    
    const fullUrl = `${STREAM_BASE}${segmentName}&sid=${SID}`;
    
    try {
        const response = await axios({
            method: 'get',
            url: fullUrl,
            headers: HEADERS,
            responseType: 'stream',
            timeout: 10000
        });
        
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Access-Control-Allow-Origin', '*');
        response.data.pipe(res);
        
    } catch (error) {
        console.error(`❌ Erro no segmento: ${error.message}`);
        res.status(502).send('Erro');
    }
});

// Segmentos init (primeiro frame)
app.get('/init', async (req, res) => {
    const initName = req.query.url;
    if (!initName) return res.status(400).send('Init não fornecido');
    
    const fullUrl = `${STREAM_BASE}${initName}&sid=${SID}`;
    
    try {
        const response = await axios({
            method: 'get',
            url: fullUrl,
            headers: HEADERS,
            responseType: 'stream',
            timeout: 10000
        });
        
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Access-Control-Allow-Origin', '*');
        response.data.pipe(res);
        
    } catch (error) {
        console.error(`❌ Erro no init: ${error.message}`);
        res.status(502).send('Erro');
    }
});

// API para resultados
app.get('/api/latest', async (req, res) => {
    try {
        const apiUrl = 'https://api-cs.casino.org/svc-evolution-game-events/api/bacbo/latest';
        const response = await axios.get(apiUrl, {
            headers: {
                'origin': 'https://in.casino.org',
                'referer': 'https://in.casino.org/',
                'user-agent': HEADERS['User-Agent']
            },
            timeout: 5000
        });
        
        const data = response.data;
        const result = data.data.result;
        
        res.json({
            success: true,
            player: { dice: result.playerDice.dice, score: result.playerDice.score },
            banker: { dice: result.bankerDice.dice, score: result.bankerDice.score },
            outcome: result.outcome,
            settledAt: data.data.settledAt
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Página HTML
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Bac Bo Live</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #000; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
        video { width: 100%; max-width: 1200px; height: auto; }
        .info { position: fixed; bottom: 15px; left: 15px; background: rgba(0,0,0,0.7); color: #0f0; padding: 8px 15px; border-radius: 8px; font-family: monospace; font-size: 12px; }
        .status { position: fixed; bottom: 15px; right: 15px; background: rgba(0,0,0,0.7); color: #ff0; padding: 8px 15px; border-radius: 8px; font-family: monospace; font-size: 11px; }
    </style>
</head>
<body>
    <video id="video" controls autoplay playsinline></video>
    <div class="info">🎲 Bac Bo Live | Proxy</div>
    <div class="status" id="status">🟡 Conectando...</div>

    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    <script>
        const video = document.getElementById('video');
        const statusEl = document.getElementById('status');
        
        if (Hls.isSupported()) {
            const hls = new Hls({ debug: false, enableWorker: false, lowLatencyMode: true });
            hls.loadSource('/stream.m3u8');
            hls.attachMedia(video);
            
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                statusEl.innerHTML = '▶️ AO VIVO';
                statusEl.style.color = '#0f0';
                video.play().catch(e => console.log(e));
            });
            
            hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    statusEl.innerHTML = '⚠️ Reconectando...';
                    setTimeout(() => hls.loadSource('/stream.m3u8'), 3000);
                }
            });
        } else {
            video.src = '/stream.m3u8';
            statusEl.innerHTML = '▶️ AO VIVO';
        }
    </script>
</body>
</html>
    `);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
});
