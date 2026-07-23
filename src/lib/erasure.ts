// Galois Field GF(2^8) arithmetic
const GF_POLY = 0x11D;
const exp = new Uint8Array(512);
const log = new Uint8Array(256);

let x = 1;
for (let i = 0; i < 255; i++) {
  exp[i] = x;
  exp[i + 255] = x;
  log[x] = i;
  x <<= 1;
  if (x & 0x100) x ^= GF_POLY;
}

function gfAdd(a: number, b: number): number {
  return a ^ b;
}

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return exp[log[a] + log[b]];
}

function gfDiv(a: number, b: number): number {
  if (b === 0) throw new Error("Division by zero");
  if (a === 0) return 0;
  return exp[log[a] + 255 - log[b]];
}

/**
 * Encodes a buffer into N shards, where any K can reconstruct.
 * @param data The input data (Uint8Array)
 * @param n Total number of shards (e.g., 5)
 * @param k Number of shards required to reconstruct (e.g., 3)
 */
export function encodeErasureShards(data: Uint8Array, n: number, k: number): Uint8Array[] {
  const paddedLength = Math.ceil(data.length / k) * k;
  const paddedData = new Uint8Array(paddedLength);
  paddedData.set(data);
  const shardSize = paddedLength / k;

  const shards = Array.from({ length: n }, () => new Uint8Array(shardSize));

  for (let i = 0; i < shardSize; i++) {
    const poly = new Uint8Array(k);
    for (let j = 0; j < k; j++) {
      poly[j] = paddedData[i * k + j];
    }

    for (let shardIdx = 0; shardIdx < n; shardIdx++) {
      const x = shardIdx + 1; 
      let y = 0;
      for (let j = k - 1; j >= 0; j--) {
        y = gfAdd(gfMul(y, x), poly[j]);
      }
      shards[shardIdx][i] = y;
    }
  }

  return shards;
}

/**
 * Reconstructs the original data from at least K shards.
 */
export function decodeErasureShards(shards: Uint8Array[], shardIndices: number[], k: number, originalLength: number): Uint8Array {
  if (shards.length < k || shardIndices.length < k) {
    throw new Error(`Need at least ${k} shards to reconstruct`);
  }

  const shardSize = shards[0].length;
  const decodedLength = shardSize * k;
  const decoded = new Uint8Array(decodedLength);

  const xCoords = shardIndices.map(i => i + 1);

  // Build the KxK Vandermonde matrix
  const matrix = Array.from({ length: k }, (_, row) => {
     const x = xCoords[row];
     const rowData = new Uint8Array(k);
     let x_pow = 1;
     for (let col = 0; col < k; col++) {
       rowData[col] = x_pow;
       x_pow = gfMul(x_pow, x);
     }
     return rowData;
  });

  // Create Identity matrix for inverse
  const inverse = Array.from({ length: k }, (_, r) => {
      const row = new Uint8Array(k);
      row[r] = 1;
      return row;
  });

  // Gaussian elimination to find inverse matrix
  for (let r = 0; r < k; r++) {
     if (matrix[r][r] === 0) {
       for (let pivotRow = r + 1; pivotRow < k; pivotRow++) {
         if (matrix[pivotRow][r] !== 0) {
           const tempRow = matrix[r]; matrix[r] = matrix[pivotRow]; matrix[pivotRow] = tempRow;
           const tempInv = inverse[r]; inverse[r] = inverse[pivotRow]; inverse[pivotRow] = tempInv;
           break;
         }
       }
     }
     
     const pivotInv = gfDiv(1, matrix[r][r]);
     for (let c = 0; c < k; c++) {
       matrix[r][c] = gfMul(matrix[r][c], pivotInv);
       inverse[r][c] = gfMul(inverse[r][c], pivotInv);
     }

     for (let elimRow = 0; elimRow < k; elimRow++) {
       if (elimRow !== r) {
         const factor = matrix[elimRow][r];
         for (let c = 0; c < k; c++) {
           matrix[elimRow][c] = gfAdd(matrix[elimRow][c], gfMul(factor, matrix[r][c]));
           inverse[elimRow][c] = gfAdd(inverse[elimRow][c], gfMul(factor, inverse[r][c]));
         }
       }
     }
  }

  // Now apply inverse matrix to all bytes (O(K^2) per byte instead of O(K^3))
  for (let i = 0; i < shardSize; i++) {
     for (let row = 0; row < k; row++) {
        let val = 0;
        for (let col = 0; col < k; col++) {
           val = gfAdd(val, gfMul(inverse[row][col], shards[col][i]));
        }
        decoded[i * k + row] = val;
     }
  }

  return decoded.slice(0, originalLength);
}
