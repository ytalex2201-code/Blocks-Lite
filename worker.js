// Blocks Lite™ Multiplayer Worker
// V0.8 - Blocky Hills
// Maximum: 20 players per server

export class BlockyHillsServer {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.players = new Map();
  }

  async fetch(request) {
    const upgrade = request.headers.get("Upgrade");

    if (!upgrade || upgrade.toLowerCase() !== "websocket") {
      return new Response("Blocks Lite Multiplayer Server", {
        status: 200,
        headers: corsHeaders()
      });
    }

    if (this.players.size >= 20) {
      return new Response("Server Full", {
        status: 503,
        headers: corsHeaders()
      });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    server.accept();

    const id = crypto.randomUUID();

    const player = {
      id,
      socket: server,
      username: "Player",
      displayName: "Player",
      x: 0,
      y: 3,
      z: 0,
      rotation: 0
    };

    this.players.set(id, player);

    server.send(JSON.stringify({
      type: "welcome",
      id,
      maxPlayers: 20,
      players: this.getPlayerList()
    }));

    this.broadcast({
      type: "playerJoined",
      player: this.publicPlayer(player)
    }, id);

    server.addEventListener("message", event => {
      this.handleMessage(id, event.data);
    });

    server.addEventListener("close", () => {
      this.removePlayer(id);
    });

    server.addEventListener("error", () => {
      this.removePlayer(id);
    });

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  handleMessage(id, raw) {
    const player = this.players.get(id);
    if (!player) return;

    let message;

    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    // Player introduces itself after connecting.
    if (message.type === "hello") {
      player.username =
        cleanName(message.username) || "Player";

      player.displayName =
        cleanName(message.displayName) ||
        player.username;

      this.broadcast({
        type: "playerUpdated",
        player: this.publicPlayer(player)
      });

      return;
    }

    // Movement synchronization.
    if (message.type === "move") {
      const x = Number(message.x);
      const y = Number(message.y);
      const z = Number(message.z);
      const rotation = Number(message.rotation);

      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        !Number.isFinite(z) ||
        !Number.isFinite(rotation)
      ) {
        return;
      }

      // Basic anti-abuse world bounds.
      if (
        Math.abs(x) > 1000 ||
        y < -100 ||
        y > 1000 ||
        Math.abs(z) > 1000
      ) {
        return;
      }

      player.x = x;
      player.y = y;
      player.z = z;
      player.rotation = rotation;

      this.broadcast({
        type: "move",
        id,
        x,
        y,
        z,
        rotation,
        walking: Boolean(message.walking)
      }, id);

      return;
    }

    // Prototype server chat.
    if (message.type === "chat") {
      const text = cleanChat(message.text);

      if (!text) return;

      this.broadcast({
        type: "chat",
        id,
        displayName: player.displayName,
        text
      });
    }
  }

  publicPlayer(player) {
    return {
      id: player.id,
      username: player.username,
      displayName: player.displayName,
      x: player.x,
      y: player.y,
      z: player.z,
      rotation: player.rotation
    };
  }

  getPlayerList() {
    return Array.from(this.players.values())
      .map(player => this.publicPlayer(player));
  }

  broadcast(message, exceptId = null) {
    const data = JSON.stringify(message);

    for (const [id, player] of this.players) {
      if (id === exceptId) continue;

      try {
        player.socket.send(data);
      } catch {
        this.removePlayer(id);
      }
    }
  }

  removePlayer(id) {
    if (!this.players.has(id)) return;

    this.players.delete(id);

    this.broadcast({
      type: "playerLeft",
      id
    });
  }
}

function cleanName(value) {
  if (typeof value !== "string") return "";

  return value
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, 24);
}

function cleanChat(value) {
  if (typeof value !== "string") return "";

  let text = value
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, 150);

  // Only a temporary first-layer filter.
  // We'll replace this with proper server moderation.
  const blocked = [
    "fuck",
    "shit",
    "bitch"
  ];

  for (const word of blocked) {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    text = text.replace(regex, "####");
  }

  return text;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin":
      "https://ytalex2201-code.github.io",
    "Access-Control-Allow-Methods": "GET, OPTIONS"
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return new Response(
        "Blocks Lite™ Multiplayer Server — ONLINE",
        {
          headers: {
            "content-type": "text/plain;charset=UTF-8",
            ...corsHeaders()
          }
        }
      );
    }

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
      status: 404,
      headers: corsHeaders()
    });
  
