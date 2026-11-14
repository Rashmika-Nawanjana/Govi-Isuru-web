import dns from "node:dns";
import mongoose from "mongoose";
import { env } from "./env";

// Bun/Node on some Windows networks refuse SRV lookups via the router DNS.
// Prefer public resolvers so mongodb+srv:// works reliably.
try {
  dns.setServers(["8.8.8.8", "1.1.1.1", "192.168.8.1"]);
  dns.setDefaultResultOrder("ipv4first");
} catch {
  /* ignore */
}

let connected = false;
let connecting: Promise<void> | null = null;

export async function connectDb() {
  if (connected) return;
  if (connecting) return connecting;

  connecting = (async () => {
    mongoose.set("strictQuery", true);
    await mongoose.connect(env.mongoUri, {
      serverSelectionTimeoutMS: 12_000,
    });
    connected = true;
    console.log(`[db] MongoDB connected (${mongoose.connection.name})`);
  })().finally(() => {
    connecting = null;
  });

  return connecting;
}

export function isDbConnected() {
  return connected;
}
