/**
 * Kademlia-based Distributed Hash Table (DHT) Module
 * Implements a 256-bit Node/Content space with a mathematically real XOR Distance Metric.
 * Provides smart shard placement and iterative routing (multi-hop) across the P2P mesh.
 */

/**
 * Converts any string (Peer ID or Hex Hash) to a 256-bit (32-byte) space.
 * If the input is already a 64-char Hex string (SHA-256), parses it directly.
 * Otherwise, hashes the string using a stable 32-bit FNV-1a cascade to generate a unique 32-byte ID.
 */
export function stringTo256Bit(input: string): Uint8Array {
  const result = new Uint8Array(32);
  
  // If it's already a 64-char hex string, parse it
  const cleanHex = input.replace(/^0x/, '').toLowerCase();
  if (/^[0-9a-f]{64}$/.test(cleanHex)) {
    for (let i = 0; i < 32; i++) {
      result[i] = parseInt(cleanHex.substring(i * 2, i * 2 + 2), 16);
    }
    return result;
  }

  // Stable hashing (FNV-1a variant cascade) to spread out text peer IDs uniformly in 256-bit space
  let hash1 = 2166136261;
  let hash2 = 3432918353;
  let hash3 = 1178239013;
  let hash4 = 2991032339;

  for (let i = 0; i < input.length; i++) {
    const charCode = input.charCodeAt(i);
    hash1 = Math.imul(hash1 ^ charCode, 16777619);
    hash2 = Math.imul(hash2 ^ (charCode * 7), 16777619);
    hash3 = Math.imul(hash3 ^ (charCode * 13), 16777619);
    hash4 = Math.imul(hash4 ^ (charCode * 17), 16777619);
  }

  // Populate 32 bytes with the cascaded hashes
  for (let i = 0; i < 8; i++) {
    const shift = i * 4;
    result[i] = (hash1 >> shift) & 0xff;
    result[i + 8] = (hash2 >> shift) & 0xff;
    result[i + 16] = (hash3 >> shift) & 0xff;
    result[i + 24] = (hash4 >> shift) & 0xff;
  }

  return result;
}

/**
 * Computes the XOR distance between two 256-bit identifiers.
 * XOR distance is a true mathematical metric satisfying the triangle inequality.
 */
export function xorDistance(a: Uint8Array, b: Uint8Array): Uint8Array {
  const distance = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    distance[i] = a[i] ^ b[i];
  }
  return distance;
}

/**
 * Compares two XOR distances.
 * Returns -1 if distA < distB, 1 if distA > distB, 0 if distA === distB.
 */
export function compareDistances(distA: Uint8Array, distB: Uint8Array): number {
  for (let i = 0; i < 32; i++) {
    if (distA[i] < distB[i]) return -1;
    if (distA[i] > distB[i]) return 1;
  }
  return 0;
}

/**
 * Interface representing a routing contact in the DHT.
 */
export interface dhtContact {
  peerId: string;
  nodeId256: Uint8Array;
}

/**
 * Find the closest peers to a target CID (or target node ID) using XOR metric.
 * Returns the closest contacts, sorted by distance.
 */
export function findClosestPeers(
  targetCID: string,
  peers: string[],
  k: number = 3
): { peerId: string; distanceHex: string }[] {
  const targetBytes = stringTo256Bit(targetCID);
  
  const mapped = peers.map(peerId => {
    const peerBytes = stringTo256Bit(peerId);
    const dist = xorDistance(targetBytes, peerBytes);
    
    // Format distance to hex for clean debugging/visuals
    const distanceHex = Array.from(dist)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .substring(0, 16) + '...'; // truncate for display

    return {
      peerId,
      distanceBytes: dist,
      distanceHex
    };
  });

  // Sort by distance ascending
  mapped.sort((a, b) => compareDistances(a.distanceBytes, b.distanceBytes));

  return mapped.slice(0, k).map(m => ({
    peerId: m.peerId,
    distanceHex: m.distanceHex
  }));
}

/**
 * Simple record to track hops in the DHT shard find route
 */
export interface DhtRouteHop {
  nodeId: string;
  action: 'query' | 'forward' | 'found' | 'not_found';
  distanceHex: string;
  timestamp: number;
}

/**
 * Traces a simulation of Kademlia lookup hops across the known network graph.
 * Shows how requests are routed through nodes closer and closer to the target CID.
 */
export function traceDhtLookupRoute(
  targetCID: string,
  currentNodeId: string,
  allKnownPeers: string[],
  onNodeHasShard: (nodeId: string, cid: string) => boolean,
  maxHops: number = 4
): DhtRouteHop[] {
  const hops: DhtRouteHop[] = [];
  const visited = new Set<string>();
  let currentSearcher = currentNodeId;
  
  const targetBytes = stringTo256Bit(targetCID);

  for (let hop = 0; hop < maxHops; hop++) {
    visited.add(currentSearcher);
    
    const currBytes = stringTo256Bit(currentSearcher);
    const currDist = xorDistance(targetBytes, currBytes);
    const distHex = Array.from(currDist).map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 8);

    // If this node actually hosts the shard
    if (onNodeHasShard(currentSearcher, targetCID)) {
      hops.push({
        nodeId: currentSearcher,
        action: 'found',
        distanceHex: distHex,
        timestamp: Date.now()
      });
      break;
    }

    hops.push({
      nodeId: currentSearcher,
      action: hop === 0 ? 'query' : 'forward',
      distanceHex: distHex,
      timestamp: Date.now()
    });

    // Find the next closest peer to target that we haven't visited yet
    const candidates = allKnownPeers.filter(p => !visited.has(p));
    if (candidates.length === 0) {
      hops.push({
        nodeId: currentSearcher,
        action: 'not_found',
        distanceHex: distHex,
        timestamp: Date.now()
      });
      break;
    }

    const closest = findClosestPeers(targetCID, candidates, 1)[0];
    if (!closest) {
      hops.push({
        nodeId: currentSearcher,
        action: 'not_found',
        distanceHex: distHex,
        timestamp: Date.now()
      });
      break;
    }

    // Move to next peer
    currentSearcher = closest.peerId;
  }

  return hops;
}
