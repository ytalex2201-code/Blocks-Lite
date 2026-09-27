// Blocks Lite Multiplayer Server v0.8
// Blocky Hills - 20 players per room

export class BlockyHillsServer {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.players = new Map();
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Blocky Hills multiplayer room");
    }

    if (this.players.size >= 20) {
      return new Response("Server Full", { status: 503 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    server.accept();

    const id = crypto.randomUUID();

    const player = {
      id,
      socket: server,
      name: "Player",
      x: 0,
      y: 3,
      z: 0,
      rotation: 0
    };

    this.players.set(id, player);

    // Tell new player who they are and who is already here.
    server.send(JSON.stringify({
      type: "welcome",
      id,
      maxPlayers: 20,
      players: this.playerList()
    }));

    // Tell everybody else that someone joined.
    this.broadcast({
      type: "join",
      player: this.publicPlayer(player)
    }, id);

    server.addEventListener("message", event => {
      let msg;

      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      const current = this.players.get(id);
      if (!current) return;

      if (msg.type === "hello") {
        if (typeof msg.name === "string") {
          current.name = msg.name
            .replace(/[<>]/g, "")
            .trim()
            .slice(0, 24) || "Player";
        }

        this.broadcast({
          type: "update",
          player: this.publicPlayer(current)
        });

        return;
      }

      if (msg.type === "move") {
        const x = Number(msg.x);
        const y = Number(msg.y);
        const z = Number(msg.z);
        const rotation = Number(msg.rotation);

        if (
          !Number.isFinite(x) ||
          !Number.isFinite(y) ||
          !Number.isFinite(z) ||
          !Number.isFinite(rotation)
        ) {
          return;
        }

        // Basic world boundary validation.
        if (
          Math.abs(x) > 1000 ||
          Math.abs(z) > 1000 ||
          y < -100 ||
          y > 1000
        ) {
          return;
        }

        current.x = x;
        current.y = y;
        current.z = z;
        current.rotation = rotation;

        this.broadcast({
          type: "move",
          id,
          x,
          y,
          z,
          rotation,
          walking: Boolean(msg.walking)
        }, id);

        return;
      }

      if (msg.type === "chat") {
        if (typeof msg.text !== "string") return;

        let text = msg.text
          .replace(/[<>]/g, "")
          .trim()
          .slice(0, 150);

        if (!text) return;

        this.broadcast({
          type: "chat",
          id,
          name: current.name,
          text
        });
      }
    });

    const remove = () => {
      if (!this.players.has(id)) return;

      this.players.delete(id);

      this.broadcast({
        type: "leave",
        id
      });
    };

    server.addEventListener("close", remove);
    server.addEventListener("error", remove);

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  publicPlayer(player) {
    return {
      id: player.id,
      name: player.name,
      x: player.x,
      y: player.y,
      z: player.z,
      rotation: player.rotation
    };
  }

  playerList() {
    return Array.from(this.players.values()).map(player =>
      this.publicPlayer(player)
    );
  }

  broadcast(message, exceptId = null) {
    const data = JSON.stringify(message);

    for (const [id, player] of this.players) {
      if (id === exceptId) continue;

      try {
        player.socket.send(data);
      } catch {
        // Closed connections will be cleaned up.
      }
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Opening the Worker normally shows server status.
    if (url.pathname === "/") {
      return new Response(
        "Blocks Lite Multiplayer Server ONLINE",
        {
          headers: {
            "Content-Type": "text/plain"
          }
        }
      );
    }

    // Multiplayer WebSocket endpoint.
    if (url.pathname === "/blocky-hills") {
      const roomName =
        url.searchParams.get("server") || "server-1";

      const id =
        env.BLOCKY_HILLS.idFromName(roomName);

      const room =
        env.BLOCKY_HILLS.get(id);

      return room.fetch(request);
    }

    return new Response("Not Found", {
      status: 404
    });
  }
};
