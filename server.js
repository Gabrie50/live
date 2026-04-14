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

// Função para decodificar a URL corretamente
function decodeStreamUrl(encodedUrl) {
    // A URL vem como "com%2Fapp%2F30%2Fbacbor1_bi_med%2Fmedia.m3u8%3Fsid%3Dxxx"
    // Precisa ser decodificada e ter o domínio adicionado
    const decoded = decodeURIComponent(encodedUrl);
    // Remove o "com/app/30/" duplicado se existir
    const cleanUrl = decoded.replace(/^com\/app\/30\//, '');
    return STREAM_BASE + cleanUrl;
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
            const newUrl = `/playlist?url=${encoded}`;
            console.log(`  ↳ Playlist: ${match.substring(0, 50)}... → ${newUrl.substring(0, 50)}...`);
            return newUrl;
        });
        
        // Reescreve URLs dos segmentos .ts
        playlist = playlist.replace(/([a-zA-Z0-9_\-]+\.ts)/g, (match) => {
            const newUrl = `/segment?url=${encodeURIComponent(match)}`;
            console.log(`  ↳ Segmento: ${match} → ${newUrl}`);
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

// Proxy para playlists secundárias (CORRIGIDO)
app.get('/playlist', async (req, res) => {
    const encodedUrl = req.query.url;
    if (!encodedUrl) {
        return res.status(400).send('URL não fornecida');
    }
    
    // Constrói a URL completa corretamente
    const fullUrl = decodeStreamUrl(encodedUrl);
    console.log(`📡 Playlist secundária: ${fullUrl}`);
    
    try {
        const response = await axios.get(fullUrl, {
            headers: HEADERS,
            responseType: 'text',
            timeout: 10000
        });
        
        let playlist = response.data;
        
        // Reescreve os segmentos .ts dentro da playlist secundária
        playlist = playlist.replace(/([a-zA-Z0-9_\-]+\.ts)/g, (match) => {
            return `/segment?url=${encodeURIComponent(match)}`;
        });
        
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.send(playlist);
        console.log(`  ✅ Playlist secundária enviada (${playlist.length} bytes)`);
        
    } catch (error) {
        console.error(`❌ Erro na playlist:`, error.message);
        if (error.response) {
            console.error(`  Status: ${error.response.status}`);
        }
        res.status(500).send('Erro na playlist secundária');
    }
});

// Proxy para segmentos .ts
app.get('/segment', async (req, res) => {
    const segmentName = req.query.url;
    if (!segmentName) {
        return res.status(400).send('Nome do segmento não fornecido');
    }
    
    // Tenta encontrar o segmento em diferentes paths
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
            console.log(`  ✅ Segmento encontrado: ${path}`);
            return;
            
        } catch (error) {
            // Tenta o próximo path
            if (error.response?.status !== 404) {
                console.log(`  ⚠️ Erro em ${path}: ${error.message}`);
            }
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
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #000; display: flex; justify-content: center; align-items: center; min-height: 100vh; font-family: monospace; }
        .container { width: 100%; max-width: 1200px; background: #000; position: relative; }
        video { width: 100%; height: auto; background: #000; }
        .info { position: fixed; bottom: 15px; left: 15px; background: rgba(0,0,0,0.8); color: #0f0; padding: 8px 15px; border-radius: 8px; font-size: 12px; z-index: 100; backdrop-filter: blur(5px); }
        .status { position: fixed; bottom: 15px; right: 15px; background: rgba(0,0,0,0.8); color: #ff0; padding: 8px 15px; border-radius: 8px; font-size: 12px; font-family: monospace; z-index: 100; }
        button { position: fixed; top: 15px; right: 15px; background: #4CAF50; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; z-index: 100; font-weight: bold; }
        button:hover { background: #45a049; }
    </style>
</head>
<body>
    <div class="container">
        <video id="video" controls autoplay playsinline></video>
        <div class="info">🎲 Bac Bo Live Proxy</div>
        <div class="status" id="status">🔌 Conectando...</div>
        <button onclick="location.reload()">🔄 Recarregar</button>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    <script>
        const video = document.getElementById('video');
        const statusEl = document.getElementById('status');
        const streamUrl = '/playlist.m3u8';
        
        function updateStatus(msg, isError = false) {
            statusEl.innerHTML = msg;
            statusEl.style.color = isError ? '#f00' : '#0f0';
            console.log('[Status]', msg);
        }
        
        if (Hls.isSupported()) {
            updateStatus('🟡 Carregando stream...');
            
            const hls = new Hls({
                debug: false,
                enableWorker: false,
                lowLatencyMode: true,
                manifestLoadingTimeOut: 20000,
                manifestLoadingMaxRetry: 5,
                manifestLoadingRetryDelay: 1000,
                levelLoadingTimeOut: 20000,
                levelLoadingMaxRetry: 5,
                levelLoadingRetryDelay: 1000
            });
            
            hls.loadSource(streamUrl);
            hls.attachMedia(video);
            
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                updateStatus('▶️ AO VIVO');
                video.play().catch(e => console.log('Auto-play:', e));
            });
            
            hls.on(Hls.Events.ERROR, (event, data) => {
                console.error('HLS Error:', data.type, data.details, data.response?.code);
                
                if (data.fatal) {
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            updateStatus('⚠️ Erro de rede, reconectando...', true);
                            setTimeout(() => hls.loadSource(streamUrl), 3000);
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            updateStatus('⚠️ Erro de mídia, recuperando...', true);
                            hls.recoverMediaError();
                            break;
                        default:
                            updateStatus('❌ Erro fatal', true);
                            break;
                    }
                }
            });
            
            window.hls = hls;
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = streamUrl;
            updateStatus('▶️ AO VIVO (Safari)');
        } else {
            updateStatus('❌ Navegador não suporta HLS', true);
        }
        
        video.addEventListener('playing', () => updateStatus('▶️ AO VIVO'));
        video.addEventListener('pause', () => updateStatus('⏸️ Pausado'));
        video.addEventListener('waiting', () => updateStatus('⏳ Carregando...'));
        video.addEventListener('error', (e) => updateStatus('❌ Erro no vídeo', true));
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
║   🔗 Acesse: https://seu-projeto.up.railway.app   ║
╚═══════════════════════════════════════════════════╝
    `);
});
