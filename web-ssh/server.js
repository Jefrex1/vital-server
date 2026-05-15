const express = require('express');
const cors = require('cors');
const { Client } = require('ssh2');

const app = express();
app.use(express.json());
app.use(cors());

app.post('/run', (req, res) => {
    const { host, username, password, command } = req.body;

    const conn = new Client();
    
    conn.on('ready', () => {
        console.log('SSH Ready');
        conn.exec(command || 'ls', (err, stream) => {
            if (err) return res.status(500).send(err.message);
            
            let stdout = '';
            let stderr = '';

            stream.on('close', (code, signal) => {
                conn.end();
                res.json({ stdout, stderr, code });
            }).on('data', (data) => {
                stdout += data.toString();
            }).stderr.on('data', (data) => {
                stderr += data.toString();
            });
        });
    }).on('error', (err) => {
        console.error('Connection error:', err);
        res.status(500).json({ error: err.message });
    }).connect({
        host: host || '127.0.0.1',
        port: 22,
        username: username || 'orestjefrex',
        password: password || '78720710',
        readyTimeout: 10000
    });
});

app.listen(3001, () => console.log('Backend on port 3001'));