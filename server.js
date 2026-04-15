const express = require('express');
const axios = require('axios');
const app = express();

const PORT = process.env.PORT || 3000;

// Lista de User-Agents reais (rotativos)
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36'
];

// Função para pegar User-Agent aleatório
function getRandomUA() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// Headers base
function getHeaders() {
    return {
        'Referer': 'https://www.casino.org/',
        'Origin': 'https://www.casino.org',
        'User-Agent': getRandomUA(),
        'Accept': '*/*',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site',
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache'
    };
}

const STREAM_BASE = 'https://live101.egprom.com/app/30/';

// Delay aleatório entre requisições (evita detecção)
function randomDelay() {
    return new Promise(resolve => setTimeout(resolve, Math.random() * 500));
}

// Playlist principal
app.get('/playlist.m3u8', async (req, res) => {
    console.log('📡 Playlist principal solicitada');
    await randomDelay();
    
    try {
        const response = await axios.get(STREAM_BASE + 'amlst:bacbor1_bi_auto/playlist.m3u8', {
            headers: getHeaders(),
            responseType: 'text',
            timeout: 15000
        });
        
        let playlist = response.data;
        
        // Reescreve URLs
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
        if (error.response?.status === 418) {
            console.log('  ⚠️ Bloqueado! Tentando novamente com outro User-Agent...');
        }
        res.status(500).send('Erro ao carregar playlist');
    }
});

// Playlist secundária
app.get('/playlist', async (req, res) => {
    const encodedUrl = req.query.url;
    if (!encodedUrl) {
        return res.status(400).send('URL não fornecida');
    }
    
    await randomDelay();
    
    let decoded = decodeURIComponent(encodedUrl);
    decoded = decoded.replace(/^com\/app\/30\//, '');
    const fullUrl = STREAM_BASE + decoded;
    
    console.log(`📡 Playlist: ${fullUrl.substring(0, 80)}...`);
    
    try {
        const response = await axios.get(fullUrl, {
            headers: getHeaders(),
            responseType: 'text',
            timeout: 15000
        });
        
        let playlist = response.data;
        playlist = playlist.replace(/([a-zA-Z0-9_\-]+\.ts)/g, (match) => {
            return `/segment?url=${encodeURIComponent(match)}`;
        });
        
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.send(playlist);
        console.log(`  ✅ Enviado (${playlist.length} bytes)`);
        
    } catch (error) {
        console.error(`❌ Erro:`, error.message);
        if (error.response?.status === 418) {
            console.log('  ⚠️ Servidor bloqueou esta requisição');
        }
        res.status(502).send('Erro');
    }
});

// Segmentos .ts
app.get('/segment', async (req, res) => {
    const segmentName = req.query.url;
    if (!segmentName) return res.status(400).send('No segment');
    
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
                headers: getHeaders(),
                responseType: 'stream',
                timeout: 10000
            });
            
            res.setHeader('Content-Type', 'video/mp2t');
            res.setHeader('Access-Control-Allow-Origin', '*');
            response.data.pipe(res);
            console.log(`  ✅ Segmento: ${path.substring(0, 50)}`);
            return;
        } catch(e) {}
    }
    
    console.error(`❌ Segmento não encontrado: ${segmentName}`);
    res.status(404).send('Not found');
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
        video { width: 100%; max-width: 1200px; height: auto; background: #000; }
        .info { position: fixed; bottom: 10px; left: 10px; background: rgba(0,0,0,0.7); color: #0f0; padding: 5px 10px; border-radius: 5px; font-family: monospace; font-size: 12px; z-index: 100; }
        .error { position: fixed; top: 10px; right: 10px; background: rgba(255,0,0,0.7); color: white; padding: 5px 10px; border-radius: 5px; font-family: monospace; font-size: 11px; display: none; z-index: 100; }
    </style>
</head>
<body>
    <video id="video" controls autoplay playsinline></video>
    <div class="info">🎲 Bac Bo Live | Railway Proxy</div>
    <div class="error" id="errorMsg"></div>

    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    <script>
        const video = document.getElementById('video');
        const errorDiv = document.getElementById('errorMsg');
        let retryCount = 0;
        
        function showError(msg) {
            errorDiv.innerHTML = msg;
            errorDiv.style.display = 'block';
            setTimeout(() => { errorDiv.style.display = 'none'; }, 4000);
        }
        
        function loadStream() {
            if (Hls.isSupported()) {
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
                    console.log('✅ Stream loaded');
                    video.play().catch(e => console.log('Auto-play:', e));
                    retryCount = 0;
                });
                
                hls.on(Hls.Events.ERROR, (event, data) => {
                    console.error('HLS Error:', data.type, data.details);
                    if (data.fatal && data.type === 'networkError') {
                        retryCount++;
                        const delay = Math.min(5000, retryCount * 1000);
                        showError(\`Reconectando em \${delay/1000}s...\`);
                        setTimeout(() => loadStream(), delay);
                    }
                });
                
                window.hls = hls;
            } else {
                video.src = '/playlist.m3u8';
            }
        }
        
        loadStream();
    </script>
</body>
</html>
    `);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔═══════════════════════════════════════════════════╗
║     🎲 BAC BO PROXY - RAILWAY EDITION             ║
╠═══════════════════════════════════════════════════╣
║   📡 Porta: ${PORT}                                 ║
║   🔄 User-Agent rotativo ativo                    ║
║   🔗 Acesse: https://live-production-9fc7.up.railway.app ║
╚═══════════════════════════════════════════════════╝
    `);
});
