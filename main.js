import { createServer } from "node:http";
import { Server } from "socket.io";
import { 
    room_users, 
    disconnect_user,  
    get_leader, 
    assign_new_leader,
    get_user
} from "./db/user_functions.js"

const port = 3030;

const server = createServer();
const io = new Server(server, {
    cors: {
        origin: 'http://localhost'
    }
});

// Authentication middleware
// Checks if the user is authenticated and saves it in the socket, if it has just connected it searches for it in the db and caches it in the socket data
io.use(async (socket, next) => {
    let token = socket.handshake.auth.token;
    
    if(!socket.data.user) {
        let user = await get_user(token);
        if(!user) return next(new Error("Authentication error"));
        socket.data.user = user;
        return next();
    }

    if(socket.data.user.video_token !== token) 
        return next(new Error("Authentication error"));
    next();
});

io.on("connection", (socket) => {
    // ---- User events

    socket.on("joined", async () => {
        let user = socket.data.user;
        let room_id = user.room_id;
        console.log(`User joined in room ${room_id}`);
        socket.join(room_id);

        let users = await room_users(io, room_id);
        io.in(room_id).emit("update_user_list", users);
        // Send the video queue to the new user
    });

    socket.on("disconnect", async () => {
        let user = socket.data.user;
        let room_id = user.room_id;
        console.log(`User disconnected from room ${room_id}`);
        socket.data.user = null;

        socket.leave(room_id);
        await disconnect_user(user);

        let room_usrs = await room_users(io, room_id);
        if(room_usrs.length == 0) return; // The room is empty, I don't need to do anything

        if(!await get_leader(io, room_id)) {
            // Assign a new random leader if the previous one left
            if(!await assign_new_leader(io, user)) return;
        }

        let users = await room_users(io, room_id);
        io.in(room_id).emit("update_user_list", users);
    });

    socket.on("set_leader" , async (new_id) => {
        let room_id = socket.data.user.room_id;
        let old_leader = socket.data.user;
        if(!old_leader.is_leader) {
            // Here someone tried to impersonate the old leader, handle this case
            socket.emit("error", {message: "Only the room leader can transfer its role"});
            return;
        }

        let new_leader = await user_by_id(io, new_id);
        if(!await assign_new_leader(io, old_leader, new_leader)) {
            socket.emit("error", {message: "Cannot assign the user as leader"});
            return;
        }

        // Here the leader will always be present
        const users = await room_users(io, room_id);
        get_leader(io, room_id).emit("leader_assigned", users);
        socket.broadcast.in(room_id).emit("update_user_list", users);
    });

    // ---- Video events

    socket.on("add", (url) => {
        let user = socket.data.user;
        // Aggiungere il video nel db
    });

    socket.on("remove", (id) => {
        let user = socket.data.user;
        // Rimuovere il video nel db
    });

    socket.on("resume", () => {
        if (!socket.data.user.is_leader) return;
        let room_id = socket.data.user.room_id;
        socket.broadcast.to(room_id).emit("resume");
    });

    socket.on("pause", () => {
        if (!socket.data.user.is_leader) return;
        let room_id = socket.data.user.room_id;
        socket.broadcast.to(room_id).emit("play");
    });

    socket.on("seek", (position) => {
        if (!socket.data.user.is_leader) return;
        let room_id = socket.data.user.room_id;
        socket.broadcast.to(room_id).emit("seek", position);
    });

    // ---- Mod events ??? non so se vanno qua

});

server.listen(port, () => {
    console.log(`Server is running on port: ${port}`);
});