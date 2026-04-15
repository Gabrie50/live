const express = require('express');
const axios = require('axios');
const app = express();

const PORT = process.env.PORT || 8080;

const HEADERS = {
    'Referer': 'https://www.casino.org/',
    'Origin': 'https://www.casino.org',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'
};

// Base URL do stream - VOCÊ PRECISA PEGAR O SID CORRETO!
// O sid muda, então você precisa atualizar ou fazer auto-detecção
const SID = '689da710046e2f0_739425'; // Use o sid que você encontrou
const STREAM_BASE = `https://live101.egprom.com/app/30/bacbor1_bi_med/`;

// Cache do último segmento para detectar resultados
let ultimoSegmento = null;
let ultimoTimestamp = null;

app.get('/ping', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

// Playlist principal M3U8
app.get('/stream.m3u8', async (req, res) => {
    console.log(`[${new Date().toISOString()}] 📡 Playlist solicitada`);
    
    try {
        const url = `${STREAM_BASE}media.m3u8?sid=${SID}`;
        console.log(`   URL: ${url}`);
        
        const response = await axios.get(url, {
            headers: HEADERS,
            responseType: 'text',
            timeout: 10000
        });
        
        let playlist = response.data;
        console.log(`   Playlist recebida: ${playlist.length} bytes`);
        
        // Reescreve as URLs dos segmentos .mp4
        playlist = playlist.replace(/(media\.\d+\.mp4\?[^\s]+)/g, (match) => {
            console.log(`   ↳ Segmento encontrado: ${match.substring(0, 40)}...`);
            return `/segment?url=${encodeURIComponent(match)}`;
        });
        
        // Adiciona headers CORS e cache control
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.send(playlist);
        console.log('✅ Playlist enviada');
        
    } catch (error) {
        console.error('❌ Erro:', error.message);
        res.status(500).send('Erro ao carregar stream');
    }
});

// Segmentos de vídeo
app.get('/segment', async (req, res) => {
    const segmentName = req.query.url;
    if (!segmentName) {
        return res.status(400).send('Segmento não fornecido');
    }
    
    const fullUrl = `${STREAM_BASE}${segmentName}&sid=${SID}`;
    console.log(`[${new Date().toISOString()}] 🎬 Segmento: ${segmentName.substring(0, 50)}...`);
    
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
        res.status(502).send('Erro ao carregar segmento');
    }
});

// API para obter o resultado atual (OCR simplificado via API original)
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
            player: {
                dice: result.playerDice.dice,
                score: result.playerDice.score
            },
            banker: {
                dice: result.bankerDice.dice,
                score: result.bankerDice.score
            },
            outcome: result.outcome,
            settledAt: data.data.settledAt
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Página HTML com player
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Bac Bo Live - Proxy</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%); 
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        .container { 
            width: 100%; 
            max-width: 1280px; 
            margin: 20px;
            background: #000;
            border-radius: 20px;
            overflow: hidden;
            box-shadow: 0 20px 40px rgba(0,0,0,0.5);
        }
        .video-container {
            position: relative;
            background: #000;
        }
        video { 
            width: 100%; 
            height: auto; 
            display: block;
        }
        .info-panel {
            background: linear-gradient(135deg, #1a1a2e, #16213e);
            padding: 15px 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-top: 1px solid #333;
        }
        .status {
            display: flex;
            align-items: center;
            gap: 10px;
            font-family: monospace;
            font-size: 14px;
        }
        .status-led {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: #f00;
            animation: pulse 1.5s infinite;
        }
        .status-led.live { background: #0f0; }
        @keyframes pulse {
            0% { opacity: 1; transform: scale(1); }
            100% { opacity: 0.3; transform: scale(0.8); }
        }
        .result {
            display: flex;
            gap: 30px;
            font-family: monospace;
            font-size: 18px;
            font-weight: bold;
        }
        .player { color: #4fc3f7; }
        .banker { color: #ff7043; }
        .tie { color: #ffd54f; }
        .prediction {
            background: rgba(0,0,0,0.8);
            padding: 8px 15px;
            border-radius: 30px;
            font-family: monospace;
            font-size: 14px;
            border-left: 3px solid #ffd700;
        }
        .info-text {
            position: fixed;
            bottom: 10px;
            right: 10px;
            background: rgba(0,0,0,0.6);
            color: #888;
            padding: 5px 10px;
            border-radius: 8px;
            font-size: 10px;
            font-family: monospace;
            z-index: 100;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="video-container">
            <video id="video" controls autoplay playsinline></video>
        </div>
        <div class="info-panel">
            <div class="status">
                <div class="status-led" id="led"></div>
                <span id="statusText">Carregando...</span>
            </div>
            <div class="result" id="result">
                <span>🎲 Aguardando...</span>
            </div>
            <div class="prediction" id="prediction">
                🔮 Aguardando...
            </div>
        </div>
    </div>
    <div class="info-text">
        🎲 Bac Bo Live Proxy | Railway
    </div>

    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    <script>
        const video = document.getElementById('video');
        const led = document.getElementById('led');
        const statusText = document.getElementById('statusText');
        const resultDiv = document.getElementById('result');
        const predictionDiv = document.getElementById('prediction');
        
        let ultimoResultado = null;
        
        function updateStatus(msg, isLive = false) {
            statusText.textContent = msg;
            if (isLive) {
                led.className = 'status-led live';
            } else {
                led.className = 'status-led';
            }
        }
        
        async function buscarResultado() {
            try {
                const resp = await fetch('/api/latest');
                const data = await resp.json();
                
                if (data.success) {
                    const pDice = data.player.dice.join('+');
                    const bDice = data.banker.dice.join('+');
                    const outcome = data.outcome === 'PlayerWon' ? 'PLAYER' : 
                                   data.outcome === 'BankerWon' ? 'BANKER' : 'TIE';
                    
                    const resultadoHtml = \`
                        <span class="player">🎲 P: \${pDice}=\${data.player.score}</span>
                        <span class="banker">🎲 B: \${bDice}=\${data.banker.score}</span>
                        <span class="\${outcome.toLowerCase()}">🏆 \${outcome}</span>
                    \`;
                    resultDiv.innerHTML = resultadoHtml;
                    ultimoResultado = { player: data.player.score, banker: data.banker.score, outcome };
                }
            } catch (e) {
                console.error('Erro ao buscar resultado:', e);
            }
        }
        
        // Configura o player HLS
        if (Hls.isSupported()) {
            updateStatus('Conectando ao stream...');
            
            const hls = new Hls({
                debug: false,
                enableWorker: false,
                lowLatencyMode: true,
                manifestLoadingTimeOut: 15000,
                manifestLoadingMaxRetry: 3
            });
            
            hls.loadSource('/stream.m3u8');
            hls.attachMedia(video);
            
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                updateStatus('AO VIVO', true);
                video.play().catch(e => console.log('Auto-play:', e));
            });
            
            hls.on(Hls.Events.ERROR, (event, data) => {
                console.error('HLS Error:', data.type, data.details);
                if (data.fatal) {
                    updateStatus('Erro, reconectando...');
                    setTimeout(() => hls.loadSource('/stream.m3u8'), 3000);
                }
            });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = '/stream.m3u8';
            updateStatus('AO VIVO', true);
        }
        
        // Busca resultados a cada 2 segundos
        buscarResultado();
        setInterval(buscarResultado, 2000);
    </script>
</body>
</html>
    `);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    🎲 BAC BO LIVE PROXY                       ║
╠═══════════════════════════════════════════════════════════════╣
║   📡 Porta: ${PORT}                                             ║
║   🔑 SID: ${SID}                                               ║
║   ✅ Servidor rodando!                                        ║
║   🌐 Acesse: https://live-production-00fb.up.railway.app     ║
╚═══════════════════════════════════════════════════════════════╝
    `);
});
