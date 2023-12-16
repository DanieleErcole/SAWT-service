import { createServer } from 'node:http';
import { Server } from 'socket.io';

const port = 3030;

const server = createServer();
const socket_srv = new Server(server);

socket_srv.on('connection', (socket) => {

});

server.listen(port, () => {
    console.log('Server is running on port: {port}');
});