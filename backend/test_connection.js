const net = require('net');
const socket = net.connect(22, '10.147.19.249', () => {
    console.log('З\'ЄДНАННЯ Є! Мережа бачить порт.');
    socket.destroy();
});
socket.on('error', (err) => {
    console.log('NODE НЕ БАЧИТЬ МЕРЕЖУ:', err.message);
});