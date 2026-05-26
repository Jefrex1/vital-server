const net = require('net');
const socket = net.connect(22, '10.147.19.249', () => {
    socket.destroy();
});
socket.on('error', (err) => {
    console.log(err.message);
});