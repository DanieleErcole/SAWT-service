import { createServer } from "node:http";
import { Server } from "socket.io";
import { 
    check_token, 
    user, 
    room_users, 
    disconnect_user, 
    assign_leader, 
    remove_leader, 
    get_leader, 
    assign_leader_random 
} from "./db/user_functions"

const port = 3030;

const server = createServer();
const io = new Server(server);

//const usr_manager = new UserManager();

io.on("connection", (socket) => {

    // ---- User events

    socket.on("joined", async (token) => {
        let user = await user(token);
        // Controllo di user
        if(!user) return; // Fare refactor e inviare al client un errore
        socket.data.user = user;
        
        let room_id = user.room_id;
        socket.join(room_id);

        let users = await room_users(io, room_id);
        io.in(room_id).emit("update_user_list", users);
        // Mando la coda di video all'utente appena collegato
    });

    socket.on("disconnect", async (token) => {
        check_token(socket, token);

        let user = socket.data.user;
        let room_id = socket.data.user.room_id;
        socket.data.user = null;

        socket.leave(room_id);
        await disconnect_user(user);

        let room_usrs = await room_users(io, room_id);
        if(room_usrs.length == 0) return; // Se non ci sono più utenti nella stanza, non faccio niente

        let leader = await get_leader(room_id); 
        if(!leader)
            assign_leader_random(room_id);

        let users = await room_users(room_id);
        io.in(room_id).emit("update_user_list", users);
    });

    socket.on("set_leader" , async (token, new_id) => {
        check_token(socket, token);

        // Solo chi è leader trasferire il proprio ruolo
        let room_id = socket.data.user.room_id;
        let old_leader = socket.data.user;
        if(old_leader.id != await get_leader(room_id).id) return; // Qui qualcuno ha cercato di fare il furbo, gestire l'errore

        await remove_leader(old_leader);
        let new_leader = await user_by_id(io, new_id);
        await assign_leader(new_leader);

        const users = await room_users(room_id);
        io.in(room_id).emit("update_user_list", users);
    });

    // ---- Video events

    socket.on("resume", async (token) => {
        check_token(socket, token);
        socket.broadcast.to(room_id).emit("resume");
    });

    socket.on("pause", async (token) => {
        check_token(socket, token);
        socket.broadcast.to(room_id).emit("play");
    });

    socket.on("seek", async (token, position) => {
        check_token(socket, token);
        socket.broadcast.to(room_id).emit("seek", position);
    });

    // ---- Mod events ??? non so se vanno qua

});

server.listen(port, () => {
    console.log("Server is running on port: ${port}");
});