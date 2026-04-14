// server.js - Proxy para Bac Bo Live (adaptado para Railway)
const express = require('express');
const axios = require('axios');
const app = express();

// Railway define a porta automaticamente
const PORT = process.env.PORT || 3000;

// Headers que o servidor espera
const HEADERS = {
    'Referer': 'https://www.casino.org/',
    'Origin': 'https://www.casino.org',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36 Edg/146.0.0.0',
    'Accept': '*/*',
    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'cross-site'
};

const STREAM_BASE = 'https://live101.egprom.com/app/30/amlst:bacbor1_bi_auto/';

// Proxy do arquivo .m3u8
app.get('/playlist.m3u8', async (req, res) => {
    console.log('📡 Solicitando playlist...');
    
    try {
        const response = await axios.get(STREAM_BASE + 'playlist.m3u8', {
            headers: HEADERS,
            responseType: 'text'
        });
        
        let playlist = response.data;
        
        // Reescreve as URLs dos segmentos .ts para passar pelo proxy
        const baseUrl = `https://${req.get('host')}`;
        playlist = playlist.replace(/([a-zA-Z0-9_\-]+\.ts)/g, (match) => {
            console.log(`  ↳ Segmento encontrado: ${match}`);
            return `${baseUrl}/segmento/${match}`;
        });
        
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.send(playlist);
        console.log('✅ Playlist enviada');
        
    } catch (error) {
        console.error('❌ Erro na playlist:', error.message);
        res.status(500).send('Erro ao carregar playlist');
    }
});

// Proxy dos segmentos .ts
app.get('/segmento/:nome', async (req, res) => {
    const segmentoNome = req.params.nome;
    const segmentoUrl = STREAM_BASE + segmentoNome;
    
    console.log(`🎬 Baixando segmento: ${segmentoNome}`);
    
    try {
        const response = await axios({
            method: 'get',
            url: segmentoUrl,
            headers: HEADERS,
            responseType: 'stream',
            timeout: 10000
        });
        
        res.setHeader('Content-Type', 'video/mp2t');
        response.data.pipe(res);
        
    } catch (error) {
        console.error(`❌ Erro no segmento ${segmentoNome}:`, error.message);
        res.status(500).send('Erro no segmento');
    }
});

// Página principal
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Bac Bo Live</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            background: #0a0a0a;
            font-family: 'Segoe UI', Arial, sans-serif;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        .container {
            width: 100%;
            max-width: 1280px;
            background: #000;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 0 30px rgba(0,0,0,0.5);
            margin: 20px;
        }
        .player-wrapper {
            position: relative;
            background: #000;
        }
        video {
            width: 100%;
            height: auto;
            display: block;
        }
        .info {
            position: absolute;
            bottom: 20px;
            left: 20px;
            background: rgba(0,0,0,0.8);
            color: #0f0;
            padding: 8px 16px;
            border-radius: 8px;
            font-family: monospace;
            font-size: 13px;
            z-index: 10;
            backdrop-filter: blur(5px);
            pointer-events: none;
        }
        .status-dot {
            display: inline-block;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background-color: #0f0;
            animation: pulse 1.5s infinite;
            margin-right: 8px;
        }
        @keyframes pulse {
            0% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(1.2); }
            100% { opacity: 1; transform: scale(1); }
        }
        .controls {
            padding: 12px;
            background: #1a1a1a;
            display: flex;
            gap: 10px;
            justify-content: center;
            flex-wrap: wrap;
        }
        button {
            background: #333;
            color: white;
            border: none;
            padding: 10px 24px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s;
            font-weight: bold;
        }
        button:hover {
            background: #555;
            transform: scale(1.02);
        }
        button.primary {
            background: #4CAF50;
        }
        button.primary:hover {
            background: #45a049;
        }
        .footer {
            text-align: center;
            padding: 12px;
            background: #111;
            color: #666;
            font-size: 12px;
            border-top: 1px solid #222;
        }
        .footer a {
            color: #4CAF50;
            text-decoration: none;
        }
        @media (max-width: 768px) {
            button { padding: 8px 16px; font-size: 12px; }
            .info { font-size: 10px; bottom: 10px; left: 10px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="player-wrapper">
            <video id="video" controls autoplay playsinline></video>
            <div class="info">
                <span class="status-dot"></span>
                <span id="statusText">Conectando...</span>
            </div>
        </div>
        <div class="controls">
            <button onclick="document.getElementById('video').play()">▶️ Play</button>
            <button onclick="document.getElementById('video').pause()">⏸️ Pause</button>
            <button onclick="recarregar()" class="primary">🔄 Recarregar</button>
        </div>
        <div class="footer">
            🎲 Bac Bo Live | Stream via Proxy
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    <script>
        const video = document.getElementById('video');
        const statusText = document.getElementById('statusText');
        let reconnectAttempts = 0;
        
        function recarregar() {
            statusText.innerHTML = '🔄 Recarregando...';
            reconnectAttempts = 0;
            carregarStream();
        }
        
        function carregarStream() {
            const streamUrl = '/playlist.m3u8';
            
            if (Hls.isSupported()) {
                if (window.hls) {
                    window.hls.destroy();
                }
                
                const hls = new Hls({
                    debug: false,
                    enableWorker: true,
                    lowLatencyMode: true,
                    manifestLoadingTimeOut: 15000,
                    manifestLoadingMaxRetry: 4,
                    manifestLoadingRetryDelay: 1000,
                    levelLoadingTimeOut: 15000,
                    levelLoadingMaxRetry: 4,
                    levelLoadingRetryDelay: 1000
                });
                
                hls.loadSource(streamUrl);
                hls.attachMedia(video);
                
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    statusText.innerHTML = '▶️ AO VIVO';
                    reconnectAttempts = 0;
                    video.play().catch(e => console.log('Auto-play bloqueado:', e));
                });
                
                hls.on(Hls.Events.ERROR, (event, data) => {
                    console.error('HLS Error:', data);
                    if (data.fatal) {
                        reconnectAttempts++;
                        const delay = Math.min(5000, reconnectAttempts * 1000);
                        statusText.innerHTML = \`⚠️ Reconectando em \${delay/1000}s...\`;
                        setTimeout(() => {
                            carregarStream();
                        }, delay);
                    }
                });
                
                window.hls = hls;
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = streamUrl;
                statusText.innerHTML = '▶️ AO VIVO (Safari)';
            } else {
                statusText.innerHTML = '❌ Navegador não suporta HLS';
            }
        }
        
        video.addEventListener('playing', () => {
            statusText.innerHTML = '▶️ AO VIVO';
        });
        
        video.addEventListener('pause', () => {
            statusText.innerHTML = '⏸️ Pausado';
        });
        
        video.addEventListener('waiting', () => {
            statusText.innerHTML = '⏳ Carregando...';
        });
        
        // Inicia
        carregarStream();
    </script>
</body>
</html>
    `);
});

// Health check endpoint para Railway
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Inicia o servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔═══════════════════════════════════════════════════╗
║     🎲 BAC BO LIVE - PROXY RODANDO NO RAILWAY     ║
╠═══════════════════════════════════════════════════╣
║   📡 Servidor rodando na porta: ${PORT}              ║
║   ✅ Proxy ativo e pronto para uso                ║
╚═══════════════════════════════════════════════════╝
    `);
});
