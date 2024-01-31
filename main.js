import { createServer } from "node:http";
import { Server } from "socket.io";
import { 
    room_users, 
    disconnect_user,  
    get_leader, 
    assign_new_leader,
    get_user,
    user_by_id,
    room_sockets,
} from "./users/users.js"
import {
    is_mod,
    assign_mod,
    remove_mod,
    is_room_owner
} from "./users/moderators.js"
import {
    get_playing_video,
    get_room_videos, 
    add_video,
    remove_video,
    video_finished,
    is_valid
} from "./videos/videos.js"

const delay = ms => new Promise(res => setTimeout(res, ms));

const port = 3030;

const server = createServer();
const io = new Server(server, {
    cors: {
        origin: ['http://localhost', 'http://saw21.dibris.unige.it']
    }
});

// Authentication middleware
// Controlla se l'utente è autenticato salvandolo nel socket, se si è appena connesso lo cerca nel db e lo salva nel campo data del socket
io.use(async (socket, next) => {
    let token = socket.handshake.auth.token;

    if(!socket.data.user) {
        let user = await get_user(token);
        if(!user) return next(new Error("Authentication error"));
        user.is_mod = await is_mod(user.room_id, user.id);
        user.is_owner = await is_room_owner(user.room_id, user.id);

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

        let sockets = await room_sockets(io, room_id);
        let same_user = sockets.find(u => u.id === user.id);
        if(same_user) { // Non ci entra mai, anche se prima di scrivere tutta sta parte era entrato 2 volte, boh io lo lascio per sicurezza
            console.log("Same user 2 times in the room, removing the old one");
            same_user.leave(room_id);
        }

        socket.emit("id", user.id);
        // Room previously empty
        if(user.is_leader)
            socket.emit("leader_assigned");
        io.in(room_id).emit("update_user_list", await room_users(io, room_id));

        // Mandare la coda dei video all'utente appena entrato
        let videos = await get_room_videos(room_id);
        socket.emit("update_video_list", videos);

        if(user.is_leader) // Primo utente, riproduco il video
            socket.emit("play", 0);
        else {
            let leader = await get_leader(io, room_id);
            // Forse non più necessario, per ora lascio per sicurezza
            if(!leader) {
                console.log("No leader found");
                socket.disconnect();
                return;
            }

            leader.once("video_state", (position, _) => {
                socket.emit("play", position);
            });
            leader.emit("state_request");
        }
    });

    socket.on("disconnect", async () => {
        let user = socket.data.user;
        let room_id = user.room_id;
        console.log(`User disconnected from room ${room_id}`);
        socket.data.user = null;

        socket.leave(room_id);
        await disconnect_user(user);

        let room_usrs = await room_users(io, room_id);
        if(room_usrs.length == 0) return; // Stanza vuota, non faccio nulla

        if(!await get_leader(io, room_id)) {
            // Assegno un leader a caso
            if(!await assign_new_leader(io, user)) return;
            let leader = await get_leader(io, room_id);
            leader.emit("leader_assigned");
        }

        let users = await room_users(io, room_id);
        io.in(room_id).emit("update_user_list", users);
    });

    socket.on("set_leader" , async (new_id) => {
        let room_id = socket.data.user.room_id;
        let old_leader = socket.data.user;
        if(!old_leader.is_leader) {
            // Qui qualcuno ha provato a fare il furbo cercando di impersonare il leader
            socket.emit("error", {message: "Only the room leader or the room owner can transfer this role"});
            return;
        }

        let new_leader = await user_by_id(io, new_id);
        if(!new_leader || !await assign_new_leader(io, old_leader, new_leader)) {
            socket.emit("error", {message: "Cannot assign the user as leader"});
            return;
        }

        // Il leader qui sarà sempre assegnato
        new_leader.emit("leader_assigned");
        const users = await room_users(io, room_id);
        io.in(room_id).emit("update_user_list", users);
    });

    // ---- Video events

    socket.on("add", async (url) => {
        if(!is_valid(url)) {
            socket.emit("error", {message: "URL is not valid"});
            return;
        }

        let user = socket.data.user;
        console.log(`Added video to room ${user.room_id}`);

        let is_first = await get_playing_video(user.room_id) ? false : true;
        // Aggiungere il video nel db
        if(!await add_video(user.room_id, url, is_first)) {
            socket.emit("error", {message: "Error adding the video to the room queue"});
            return;
        }

        let videos = await get_room_videos(user.room_id);
        io.in(user.room_id).emit("update_video_list", videos);
        if(is_first)
            io.in(user.room_id).emit("play", 0);
    });

    socket.on("remove", async (id) => {
        // Nella query oltre all'ID nel where fare il check della room_id, altrimenti un utente può rimuovere un video in un'altra stanza dove lui non è presente
        let user = socket.data.user;
        // Rimuovere il video nel db
        let cur = await get_playing_video(user.room_id);
        let is_current_video = cur.id === id;
        if(is_current_video) {
            if(!await video_finished(user.room_id)) {
                socket.emit("error", {message: "Error removing the video from the room queue"});
                return;
            }
        }

        if(!await remove_video(user.room_id, id)) {
            socket.emit("error", {message: "Error removing the video from the room queue"});
            return;
        }
        // prendersi la lista video aggiornata
        let videos = await get_room_videos(user.room_id);
        io.in(user.room_id).emit("update_video_list", videos);
        if(is_current_video)
            io.in(user.room_id).emit("play", 0);
    });

    socket.on("ended", async () => {
        if(!socket.data.user.is_leader) {
            socket.emit("error", {message: "Sorry, only the leader can skip the video"});
            return;
        }

        let room_id = socket.data.user.room_id;
        if(!await video_finished(socket.data.user.room_id)) {
            socket.emit("error", {message: "Error retrieving the next video from the queue"});
            return;
        }

        let videos = await get_room_videos(room_id);
        io.in(room_id).emit("update_video_list", videos);
        io.in(room_id).emit("play", 0);
    });

    // ---- Player events

    socket.on("resume", async (position) => {
        let room_id = socket.data.user.room_id;
        if(!socket.data.user.is_leader) {
            let leader = await get_leader(io, room_id);
            leader.once("video_state", (pos, paused) => {
                if(paused) socket.emit("pause", pos);
            });
            leader.emit("state_request");
            return;
        }
        socket.broadcast.to(room_id).emit("resume", position);
    });

    socket.on("pause", async (position) => {
        let room_id = socket.data.user.room_id;
        if(!socket.data.user.is_leader) {
            let leader = await get_leader(io, room_id);
            leader.once("video_state", (pos, paused) => {
                if(!paused) socket.emit("resume", pos);
            });
            leader.emit("state_request");
            return;
        }
        socket.broadcast.to(room_id).emit("pause", position);
    });

    socket.on("seek", async (position) => {
        let room_id = socket.data.user.room_id;
        if(!socket.data.user.is_leader) {
            let leader = await get_leader(io, room_id);
            leader.once("video_state", (pos, _) => {
                if(pos != position) socket.emit("seek", pos);
            });
            leader.emit("state_request");
            return;
        }
        socket.broadcast.to(room_id).emit("seek", position);
    });

    // ---- Mod events

    socket.on("assign_mod", async (id) => {
        let user = socket.data.user;
        if(!user.is_owner) {
            socket.emit("error", {message: "Only the room owner can assign moderators"});
            return;
        }

        let user_to_assign = await user_by_id(io, id);
        if(!user_to_assign || user_to_assign.data.user.is_mod || !await assign_mod(user.room_id, user_to_assign.data.user)) {
            socket.emit("error", {message: "Error assigning the moderator"});
            return;
        }

        user_to_assign.emit("notification", "You have been assigned as moderator");
        io.in(user.room_id).emit("update_user_list", await room_users(io, user.room_id));
    });

    socket.on("remove_mod", async (id) => {
        let user = socket.data.user;
        if(!user.is_owner) {
            socket.emit("error", {message: "Only the room owner can remove moderators"});
            return;
        }

        let user_to_remove = await user_by_id(io, id);
        if(!user_to_remove || !user_to_remove.data.user.is_mod || user_to_remove.data.user.is_owner || !await remove_mod(user.room_id, user_to_remove.data.user)) {
            socket.emit("error", {message: "Error removing the moderator"});
            return;
        }

        user_to_remove.emit("notification", "You have been removed from the moderators");
        io.in(user.room_id).emit("update_user_list", await room_users(io, user.room_id));
    });

    socket.on("kick", async (id) => {
        let user = socket.data.user;
        if(!user.is_mod) {
            socket.emit("error", {message: "Only the moderators can kick users from the room"});
            return;
        }

        //TODO: forse controllare che l'utente sia effettivamente nella stanza
        let user_to_kick = await user_by_id(io, id);
        if(!user_to_kick) {
            socket.emit("error", {message: "User not found"});
            return;
        }
        let username = `${user_to_kick.data.user.firstname} ${user_to_kick.data.user.lastname}`;

        user_to_kick.emit("notification", "You'll be kicked from the room in 3 seconds");
        user_to_kick.leave(user.room_id);
        delay(3000).then(async () => {
            user_to_kick.disconnect();
            io.in(user.room_id).emit("notification", `${username} has been kicked from the room`);
            io.in(user.room_id).emit("update_user_list", await room_users(io, user.room_id));
        });
    });

});

server.listen(port, () => {
    console.log(`Server is running on port: ${port}`);
});