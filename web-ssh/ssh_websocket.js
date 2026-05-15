const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 }); // Create a server on port 8080

wss.on('connection', ws => {
  console.log('Client connected');

  ws.on('message', message => {
    console.log(`Received message: ${message}`);
    ws.send(`Server received: ${message}`); // Send a message back to the client
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });

  // Send a welcome message to the client upon connection
  ws.send('Welcome to the WebSocket server!');
});

console.log('WebSocket server running on port 8080');
