// server.js - Proxy COMPLETO que intercepta todas as requisições
const express = require('express');
const axios = require('axios');
const app = express();

const PORT = process.env.PORT || 3000;

// Headers que o servidor espera
const HEADERS = {
    'Referer': 'https://www.casino.org/',
    'Origin': 'https://www.casino.org',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    'Connection': 'keep-alive',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'cross-site'
};

const STREAM_BASE = 'https://live101.egprom.com/app/30/';

// Proxy principal - retorna a playlist inicial
app.get('/bacbo/playlist.m3u8', async (req, res) => {
    console.log('📡 Playlist principal solicitada');
    
    try {
        const response = await axios.get(STREAM_BASE + 'amlst:bacbor1_bi_auto/playlist.m3u8', {
            headers: HEADERS,
            responseType: 'text',
            timeout: 10000
        });
        
        let playlist = response.data;
        
        // Reescreve TODAS as URLs .m3u8 e .ts para passar pelo proxy
        // Exemplo: "bacbor1_bi_hi/media.m3u8?sid=xxx" → "/bacbo/segment?url=..."
        playlist = playlist.replace(/([a-zA-Z0-9_\/\-]+\.m3u8\?[^\s]+)/g, (match) => {
            const encoded = encodeURIComponent(match);
            console.log(`  ↳ Playlist secundária encontrada: ${match.substring(0, 50)}...`);
            return `/bacbo/playlist?url=${encoded}`;
        });
        
        playlist = playlist.replace(/([a-zA-Z0-9_\-]+\.ts)/g, (match) => {
            console.log(`  ↳ Segmento TS encontrado: ${match}`);
            return `/bacbo/segment?url=${encodeURIComponent(match)}`;
        });
        
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.send(playlist);
        console.log('✅ Playlist principal enviada');
        
    } catch (error) {
        console.error('❌ Erro:', error.message);
        res.status(500).send('Erro ao carregar playlist');
    }
});

// Proxy para playlists secundárias (media.m3u8)
app.get('/bacbo/playlist', async (req, res) => {
    const originalUrl = req.query.url;
    if (!originalUrl) {
        return res.status(400).send('URL não fornecida');
    }
    
    const fullUrl = STREAM_BASE + originalUrl;
    console.log(`📡 Playlist secundária: ${originalUrl.substring(0, 60)}...`);
    
    try {
        const response = await axios.get(fullUrl, {
            headers: HEADERS,
            responseType: 'text',
            timeout: 10000
        });
        
        let playlist = response.data;
        
        // Reescreve os segmentos .ts
        playlist = playlist.replace(/([a-zA-Z0-9_\-]+\.ts)/g, (match) => {
            return `/bacbo/segment?url=${encodeURIComponent(match)}`;
        });
        
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.send(playlist);
        
    } catch (error) {
        console.error(`❌ Erro na playlist secundária:`, error.message);
        res.status(500).send('Erro na playlist secundária');
    }
});

// Proxy para segmentos .ts
app.get('/bacbo/segment', async (req, res) => {
    const segmentName = req.query.url;
    if (!segmentName) {
        return res.status(400).send('Nome do segmento não fornecido');
    }
    
    // Tenta encontrar a playlist pai para construir o caminho correto
    const possiblePaths = [
        `amlst:bacbor1_bi_auto/${segmentName}`,
        `bacbor1_bi_hi/${segmentName}`,
        `bacbor1_bi_med/${segmentName}`,
        `bacbor1_bi_low/${segmentName}`
    ];
    
    for (const path of possiblePaths) {
        const fullUrl = STREAM_BASE + path;
        console.log(`🎬 Tentando segmento: ${path}`);
        
        try {
            const response = await axios({
                method: 'get',
                url: fullUrl,
                headers: HEADERS,
                responseType: 'stream',
                timeout: 15000
            });
            
            res.setHeader('Content-Type', 'video/mp2t');
            res.setHeader('Access-Control-Allow-Origin', '*');
            response.data.pipe(res);
            console.log(`  ✅ Segmento encontrado: ${path}`);
            return;
            
        } catch (error) {
            if (error.response?.status !== 404) {
                console.log(`  ⚠️ Erro em ${path}: ${error.message}`);
            }
            // Continua tentando outros paths
        }
    }
    
    console.error(`❌ Segmento não encontrado: ${segmentName}`);
    res.status(404).send('Segmento não encontrado');
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
        body { margin: 0; background: #000; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
        .player { width: 100%; max-width: 1200px; background: #000; }
        video { width: 100%; height: auto; }
        .info { position: fixed; bottom: 10px; left: 10px; background: rgba(0,0,0,0.7); color: #0f0; padding: 5px 10px; border-radius: 5px; font-family: monospace; font-size: 12px; }
    </style>
</head>
<body>
    <div class="player">
        <video id="video" controls autoplay playsinline></video>
        <div class="info">🎲 Bac Bo Live | Proxy Ativo</div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    <script>
        const video = document.getElementById('video');
        const streamUrl = '/bacbo/playlist.m3u8';
        
        if (Hls.isSupported()) {
            const hls = new Hls({
                debug: false,
                enableWorker: false,
                lowLatencyMode: true,
                manifestLoadingTimeOut: 15000,
                manifestLoadingMaxRetry: 5,
                levelLoadingTimeOut: 15000,
                levelLoadingMaxRetry: 5
            });
            
            hls.loadSource(streamUrl);
            hls.attachMedia(video);
            
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                console.log('✅ Stream carregado');
                video.play().catch(e => console.log('Auto-play:', e));
            });
            
            hls.on(Hls.Events.ERROR, (event, data) => {
                console.error('HLS Error:', data.type, data.details);
                if (data.fatal && data.type === 'networkError') {
                    console.log('🔄 Tentando reconectar...');
                    setTimeout(() => hls.loadSource(streamUrl), 3000);
                }
            });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = streamUrl;
        }
    </script>
</body>
</html>
    `);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔═══════════════════════════════════════════════════╗
║     🎲 BAC BO PROXY COMPLETO - RODANDO            ║
╠═══════════════════════════════════════════════════╣
║   📡 Porta: ${PORT}                                 ║
║   ✅ Proxy interceptando TODAS as requisições     ║
║   🔗 Acesse: http://localhost:${PORT}               ║
╚═══════════════════════════════════════════════════╝
    `);
});
