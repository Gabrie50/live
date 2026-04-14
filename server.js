const express = require('express');
const axios = require('axios');
const app = express();

const PORT = process.env.PORT || 3000;

const HEADERS = {
    'Referer': 'https://www.casino.org/',
    'Origin': 'https://www.casino.org',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    'Connection': 'keep-alive'
};

const STREAM_BASE = 'https://live101.egprom.com/app/30/';

// FUNÇÃO CORRIGIDA para decodificar URL
function decodeStreamUrl(encodedUrl) {
    let decoded = decodeURIComponent(encodedUrl);
    console.log(`  Decodificando: ${decoded.substring(0, 80)}...`);
    
    // Remove prefixo "com/app/30/" se existir
    if (decoded.includes('com/app/30/')) {
        decoded = decoded.replace(/.*com\/app\/30\//, '');
    }
    
    // Se não começar com https, adiciona
    if (!decoded.startsWith('https://')) {
        return STREAM_BASE + decoded;
    }
    
    return decoded;
}

// Proxy da playlist principal
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
            return `/playlist?url=${encoded}`;
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

// Proxy para playlists secundárias (CORRIGIDO)
app.get('/playlist', async (req, res) => {
    const encodedUrl = req.query.url;
    if (!encodedUrl) {
        return res.status(400).send('URL não fornecida');
    }
    
    const fullUrl = decodeStreamUrl(encodedUrl);
    console.log(`📡 Playlist secundária: ${fullUrl}`);
    
    try {
        const response = await axios.get(fullUrl, {
            headers: HEADERS,
            responseType: 'text',
            timeout: 10000
        });
        
        let playlist = response.data;
        
        // Reescreve os segmentos .ts
        playlist = playlist.replace(/([a-zA-Z0-9_\-]+\.ts)/g, (match) => {
            return `/segment?url=${encodeURIComponent(match)}`;
        });
        
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.send(playlist);
        console.log(`  ✅ Enviado (${playlist.length} bytes)`);
        
    } catch (error) {
        console.error(`❌ Erro:`, error.message);
        res.status(502).send(`Erro: ${error.message}`);
    }
});

// Proxy para segmentos .ts
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
            // Continua
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
        .info { position: fixed; bottom: 10px; left: 10px; background: rgba(0,0,0,0.7); color: #0f0; padding: 5px 10px; border-radius: 5px; font-family: monospace; font-size: 12px; z-index: 100; }
        .error { position: fixed; top: 10px; right: 10px; background: rgba(255,0,0,0.7); color: white; padding: 5px 10px; border-radius: 5px; font-family: monospace; font-size: 11px; z-index: 100; display: none; }
    </style>
</head>
<body>
    <div class="player">
        <video id="video" controls autoplay playsinline></video>
        <div class="info">🎲 Bac Bo Live | Proxy</div>
        <div class="error" id="errorMsg"></div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    <script>
        const video = document.getElementById('video');
        const errorDiv = document.getElementById('errorMsg');
        
        function showError(msg) {
            errorDiv.innerHTML = msg;
            errorDiv.style.display = 'block';
            setTimeout(() => { errorDiv.style.display = 'none'; }, 5000);
        }
        
        if (Hls.isSupported()) {
            const hls = new Hls({
                debug: false,
                enableWorker: false,
                lowLatencyMode: true
            });
            
            hls.loadSource('/playlist.m3u8');
            hls.attachMedia(video);
            
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                console.log('✅ Stream carregado');
                video.play().catch(e => console.log('Auto-play:', e));
            });
            
            hls.on(Hls.Events.ERROR, (event, data) => {
                console.error('HLS Error:', data.type, data.details);
                if (data.fatal && data.type === 'networkError') {
                    showError('Erro de rede, reconectando...');
                    setTimeout(() => hls.loadSource('/playlist.m3u8'), 3000);
                }
            });
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
║   ✅ Proxy interceptando todas as requisições     ║
║   🔗 Acesse: https://live-production-9fc7.up.railway.app   ║
╚═══════════════════════════════════════════════════╝
    `);
});
