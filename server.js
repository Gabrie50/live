const express = require('express');
const axios = require('axios');
const app = express();

const PORT = process.env.PORT || 3000;

const HEADERS = {
    'Referer': 'https://www.casino.org/',
    'Origin': 'https://www.casino.org',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
};

const STREAM_BASE = 'https://live101.egprom.com/app/30/';

// FUNÇÃO CORRIGIDA para montar URL completa
function buildFullUrl(encodedUrl) {
    // Decodifica a URL
    let decoded = decodeURIComponent(encodedUrl);
    console.log(`  🔍 Decodificando: ${decoded.substring(0, 80)}...`);
    
    // Remove "com/app/30/" do início se existir
    if (decoded.startsWith('com/app/30/')) {
        decoded = decoded.substring('com/app/30/'.length);
    }
    
    // Se já tem https, retorna direto
    if (decoded.startsWith('https://')) {
        return decoded;
    }
    
    // Constrói URL completa
    const fullUrl = STREAM_BASE + decoded;
    console.log(`  ✅ URL final: ${fullUrl.substring(0, 100)}...`);
    return fullUrl;
}

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
        
        // Reescreve URLs das playlists secundárias
        playlist = playlist.replace(/([a-zA-Z0-9_\/\-]+\.m3u8\?[^\s]+)/g, (match) => {
            const encoded = encodeURIComponent(match);
            const newUrl = `/playlist?url=${encoded}`;
            console.log(`  ↳ Playlist: ${match.substring(0, 50)}... → ${newUrl.substring(0, 50)}...`);
            return newUrl;
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

// Playlist secundária - VERSÃO CORRIGIDA
app.get('/playlist', async (req, res) => {
    const encodedUrl = req.query.url;
    if (!encodedUrl) {
        console.error('❌ URL não fornecida');
        return res.status(400).send('URL não fornecida');
    }
    
    const fullUrl = buildFullUrl(encodedUrl);
    console.log(`📡 Playlist secundária solicitada`);
    
    try {
        const response = await axios.get(fullUrl, {
            headers: HEADERS,
            responseType: 'text',
            timeout: 10000
        });
        
        console.log(`  ✅ Resposta recebida (${response.data.length} bytes)`);
        
        let playlist = response.data;
        
        // Reescreve segmentos .ts
        playlist = playlist.replace(/([a-zA-Z0-9_\-]+\.ts)/g, (match) => {
            return `/segment?url=${encodeURIComponent(match)}`;
        });
        
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.send(playlist);
        
    } catch (error) {
        console.error(`❌ Erro na playlist:`, error.message);
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
        return res.status(400).send('Nome do segmento não fornecido');
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
                timeout: 15000
            });
            
            res.setHeader('Content-Type', 'video/mp2t');
            res.setHeader('Access-Control-Allow-Origin', '*');
            response.data.pipe(res);
            console.log(`  ✅ Segmento: ${path}`);
            return;
        } catch (error) {
            // Tenta próximo
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
        video { width: 100%; max-width: 1200px; height: auto; }
        .info { position: fixed; bottom: 10px; left: 10px; background: rgba(0,0,0,0.7); color: #0f0; padding: 5px 10px; border-radius: 5px; font-family: monospace; font-size: 12px; }
    </style>
</head>
<body>
    <video id="video" controls autoplay playsinline></video>
    <div class="info">🎲 Bac Bo Live</div>

    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    <script>
        const video = document.getElementById('video');
        
        if (Hls.isSupported()) {
            const hls = new Hls({ debug: false, enableWorker: false, lowLatencyMode: true });
            hls.loadSource('/playlist.m3u8');
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => video.play());
            hls.on(Hls.Events.ERROR, (e, d) => console.error('HLS Error:', d));
        } else {
            video.src = '/playlist.m3u8';
        }
    </script>
</body>
</html>
    `);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔═══════════════════════════════════════════════════╗
║     🎲 BAC BO PROXY CORRIGIDO - RODANDO           ║
╠═══════════════════════════════════════════════════╣
║   📡 Porta: ${PORT}                                 ║
║   🔗 Acesse: https://live-production-9fc7.up.railway.app ║
╚═══════════════════════════════════════════════════╝
    `);
});
