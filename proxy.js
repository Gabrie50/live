const express = require('express');
const https = require('https');
const http = require('http');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static('.'));

// 🔴 PROXY STREAM PRINCIPAL
app.get('/stream.m3u8', (req, res) => {
    const url = 'https://live101.egprom.com/app/30/amlst:bacbor1_bi_auto/playlist.m3u8';
    
    const options = {
        hostname: 'live101.egprom.com',
        path: '/app/30/amlst:bacbor1_bi_auto/playlist.m3u8',
        method: 'GET',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://www.casino.org/',
            'Origin': 'https://www.casino.org'
        }
    };

    https.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
    }).on('error', (err) => {
        console.error('Stream error:', err);
        // FALLBACK 1: Cloudfront
        res.redirect('https://d2ziijpvlodb0w.cloudfront.net/bac-bo.m3u8');
    }).end();
});

// 🔴 PLAYER PRONTO
app.get('/live', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('*', (req, res) => {
    res.redirect('/live');
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`🚀 Bac Bo Live rodando em porta ${port}`);
});
