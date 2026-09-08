import { lookup } from "node:dns/promises";
import { createServer, request, type OutgoingHttpHeaders } from "node:http";
import { connect, type Socket } from "node:net";
import ipaddr from "ipaddr.js";

const hostname = (url: URL) => url.hostname.replace(/^\[|\]$/g, "");
const port = (url: URL) => Number(url.port || (url.protocol === "https:" ? 443 : 80));
export function publicAddress(address: string) {
  if (address.includes("%") || !ipaddr.isValid(address)) return false;
  return ipaddr.process(address).range() === "unicast";
}
export async function checkedRenderAddress(
  url: URL,
  target: URL,
  resolve: (host: string) => Promise<Array<{ address: string }>> = (host) => lookup(host, { all: true }),
) {
  const host = hostname(url);
  const addresses = ipaddr.isValid(host) ? [{ address: host }] : await resolve(host);
  const explicitLocal = ipaddr.isValid(hostname(target)) && host === hostname(target) && port(url) === port(target);
  if (!addresses.length || (!explicitLocal && addresses.some(({ address }) => !publicAddress(address))))
    throw new Error("Network destination blocked");
  return addresses[0]!.address;
}
export async function startRenderNetwork(target: string) {
  const permitted = new URL(target);
  const sockets = new Set<Socket>();
  let blockedRequests = 0;
  let attempts = 0;
  let closed = false;
  const destination = async (url: URL) => {
    try {
      if (++attempts > 1500) throw new Error("Connection budget exceeded");
      const address = await checkedRenderAddress(url, permitted);
      if (closed) throw new Error("Network closed");
      return address;
    } catch (error) {
      blockedRequests++;
      throw error;
    }
  };
  const track = (socket: Socket) => {
    sockets.add(socket);
    socket.setTimeout(60000, () => socket.destroy());
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => socket.destroy());
    return socket;
  };
  // CONNECT needs raw sockets; pin the validated IP at the socket, never resolve it again.
  const server = createServer(async (incoming, outgoing) => {
    try {
      const url = new URL(incoming.url!);
      if (url.protocol !== "http:" || url.username || url.password || !["GET", "HEAD"].includes(incoming.method!))
        throw new Error("Invalid proxy request");
      const address = await destination(url);
      const headers: OutgoingHttpHeaders = { ...incoming.headers, host: url.host };
      delete headers["proxy-connection"];
      delete headers["proxy-authorization"];
      const upstream = request(
        {
          hostname: address,
          port: port(url),
          path: url.pathname + url.search,
          method: incoming.method,
          headers,
          agent: false,
        },
        (response) => {
          outgoing.writeHead(response.statusCode!, response.headers);
          response.pipe(outgoing);
        },
      );
      upstream.on("socket", track);
      upstream.on("error", () => {
        outgoing.destroy();
      });
      outgoing.on("close", () => upstream.destroy());
      incoming.pipe(upstream);
    } catch {
      outgoing.writeHead(403).end();
    }
  });
  server.maxConnections = 256;
  server.on("connection", track);
  server.on("connect", async (incoming, client, head) => {
    try {
      const url = new URL(`https://${incoming.url}`);
      if (url.username || url.password || url.pathname !== "/" || url.search || url.hash)
        throw new Error("Invalid tunnel");
      const address = await destination(url);
      const upstream = track(connect({ host: address, port: port(url) }));
      upstream.once("connect", () => {
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) upstream.write(head);
        client.pipe(upstream);
        upstream.pipe(client);
      });
      client.on("close", () => upstream.destroy());
      upstream.on("close", () => client.destroy());
    } catch {
      client.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as { port: number };
  return {
    proxy: `http://127.0.0.1:${address.port}`,
    get blockedRequests() {
      return blockedRequests;
    },
    async close() {
      closed = true;
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
