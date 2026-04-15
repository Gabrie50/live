const express = require('express');
const axios = require('axios');
const app = express();

const PORT = process.env.PORT || 8080;

const HEADERS = {
    'Referer': 'https://www.casino.org/',
    'Origin': 'https://www.casino.org',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
};

const STREAM_BASE = 'https://live101.egprom.com/app/30/';

// ROTA DE TESTE (verifica se o servidor está rodando)
app.get('/ping', (req, res) => {
    console.log('🏓 Ping recebido');
    res.json({ status: 'ok', timestamp: Date.now() });
});

// Playlist principal
app.get('/playlist.m3u8', async (req, res) => {
    console.log('📡 Playlist principal solicitada');
    try {
        const response = await axios.get(STREAM_BASE + 'amlst:bacbor1_bi_auto/playlist.m3u8', {
            headers: HEADERS,
            responseType: 'text',
            timeout: 10000
        });
        
        let playlist = response.data;
        console.log(`  Playlist recebida: ${playlist.length} bytes`);
        
        // Reescreve URLs das playlists secundárias
        playlist = playlist.replace(/([a-zA-Z0-9_\/\-]+\.m3u8\?[^\s]+)/g, (match) => {
            const encoded = encodeURIComponent(match);
            console.log(`  ↳ Playlist encontrada: ${match.substring(0, 50)}...`);
            return `/playlist?url=${encoded}`;
        });
        
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.send(playlist);
        console.log('✅ Playlist principal enviada');
        
    } catch (error) {
        console.error('❌ Erro na playlist principal:', error.message);
        res.status(500).send('Erro ao carregar playlist');
    }
});

// Playlist secundária
app.get('/playlist', async (req, res) => {
    const encodedUrl = req.query.url;
    console.log(`📡 Playlist secundária solicitada: ${encodedUrl?.substring(0, 60)}...`);
    
    if (!encodedUrl) {
        return res.status(400).send('URL não fornecida');
    }
    
    try {
        // Decodifica e limpa a URL
        let decoded = decodeURIComponent(encodedUrl);
        console.log(`  Decodificado: ${decoded.substring(0, 80)}`);
        
        // Remove prefixo se existir
        if (decoded.includes('com/app/30/')) {
            decoded = decoded.split('com/app/30/')[1];
        }
        
        const fullUrl = STREAM_BASE + decoded;
        console.log(`  URL completa: ${fullUrl.substring(0, 100)}`);
        
        const response = await axios.get(fullUrl, {
            headers: HEADERS,
            responseType: 'text',
            timeout: 10000
        });
        
        console.log(`  Resposta recebida: ${response.data.length} bytes`);
        
        let playlist = response.data;
        
        // Reescreve os segmentos .ts
        playlist = playlist.replace(/([a-zA-Z0-9_\-]+\.ts)/g, (match) => {
            return `/segment?url=${encodeURIComponent(match)}`;
        });
        
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.send(playlist);
        console.log('✅ Playlist secundária enviada');
        
    } catch (error) {
        console.error(`❌ Erro na playlist secundária: ${error.message}`);
        if (error.response) {
            console.error(`  Status: ${error.response.status}`);
        }
        res.status(502).send(`Erro: ${error.message}`);
    }
});

// Segmentos .ts
app.get('/segment', async (req, res) => {
    const segmentName = req.query.url;
    if (!segmentName) {
        return res.status(400).send('Segmento não fornecido');
    }
    
    const possiblePaths = [
        `amlst:bacbor1_bi_auto/${segmentName}`,
        `bacbor1_bi_hi/${segmentName}`,
        `bacbor1_bi_med/${segmentName}`,
        `bacbor1_bi_low/${segmentName}`
    ];
    
    for (const path of possiblePaths) {
        const fullUrl = STREAM_BASE + path;
        
        try {
            const response = await axios({
                method: 'get',
                url: fullUrl,
                headers: HEADERS,
                responseType: 'stream',
                timeout: 10000
            });
            
            res.setHeader('Content-Type', 'video/mp2t');
            res.setHeader('Access-Control-Allow-Origin', '*');
            response.data.pipe(res);
            console.log(`✅ Segmento encontrado: ${path.substring(0, 50)}`);
            return;
        } catch (error) {
            // Tenta o próximo path
        }
    }
    
    console.error(`❌ Segmento não encontrado: ${segmentName}`);
    res.status(404).send('Segmento não encontrado');
});

// Página HTML
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html>
<head>
    <title>Bac Bo Live</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #000; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
        video { width: 100%; max-width: 1200px; height: auto; }
        .info { position: fixed; bottom: 15px; left: 15px; background: rgba(0,0,0,0.7); color: #0f0; padding: 8px 15px; border-radius: 8px; font-family: monospace; font-size: 12px; z-index: 100; backdrop-filter: blur(5px); }
        .status { position: fixed; bottom: 15px; right: 15px; background: rgba(0,0,0,0.7); color: #ff0; padding: 8px 15px; border-radius: 8px; font-family: monospace; font-size: 11px; z-index: 100; }
    </style>
</head>
<body>
    <video id="video" controls autoplay playsinline></video>
    <div class="info">🎲 Bac Bo Live | Railway Proxy</div>
    <div class="status" id="status">🟡 Conectando...</div>

    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    <script>
        const video = document.getElementById('video');
        const statusEl = document.getElementById('status');
        
        function updateStatus(msg, isError = false) {
            statusEl.innerHTML = msg;
            statusEl.style.color = isError ? '#f66' : '#0f0';
            console.log('[Status]', msg);
        }
        
        if (Hls.isSupported()) {
            updateStatus('🟡 Carregando stream...');
            
            const hls = new Hls({
                debug: false,
                enableWorker: false,
                lowLatencyMode: true,
                manifestLoadingTimeOut: 15000,
                manifestLoadingMaxRetry: 3
            });
            
            hls.loadSource('/playlist.m3u8');
            hls.attachMedia(video);
            
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                updateStatus('▶️ AO VIVO');
                video.play().catch(e => console.log('Auto-play:', e));
            });
            
            hls.on(Hls.Events.ERROR, (event, data) => {
                console.error('HLS Error:', data.type, data.details);
                if (data.fatal && data.type === 'networkError') {
                    updateStatus('⚠️ Erro, reconectando...', true);
                    setTimeout(() => hls.loadSource('/playlist.m3u8'), 3000);
                }
            });
        } else {
            video.src = '/playlist.m3u8';
            updateStatus('▶️ AO VIVO (Native)');
        }
    </script>
</body>
</html>`);
});

// Inicia o servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔═══════════════════════════════════════════════════╗
║     🎲 BAC BO PROXY - RAILWAY EDITION             ║
╠═══════════════════════════════════════════════════╣
║   📡 Porta: ${PORT}                                 ║
║   🔗 URL: https://live-production-00fb.up.railway.app ║
║   ✅ Servidor rodando e pronto!                   ║
╚═══════════════════════════════════════════════════╝
    `);
});
