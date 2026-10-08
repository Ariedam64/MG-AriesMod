// A minimal zip writer for the debug menu's sprite export: files are stored
// as they are, without compression, which every unzip tool reads.

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;
const ZIP_VERSION = 20;
const ZIP_FLAGS = 0;
const ZIP_METHOD_STORE = 0;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = ~0;
  for (let i = 0; i < bytes.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xff];
  return ~crc >>> 0;
}

/** Writes little-endian fields one after the other into a fixed-size record. */
function record(size: number, write: (put16: (v: number) => void, put32: (v: number) => void) => void): Uint8Array {
  const view = new DataView(new ArrayBuffer(size));
  let pos = 0;
  write(
    (v) => { view.setUint16(pos, v, true); pos += 2; },
    (v) => { view.setUint32(pos, v >>> 0, true); pos += 4; },
  );
  return new Uint8Array(view.buffer);
}

function withName(head: Uint8Array, nameBytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(head.length + nameBytes.length);
  out.set(head);
  out.set(nameBytes, head.length);
  return out;
}

function localHeader(nameBytes: Uint8Array, size: number, crc: number): Uint8Array {
  return withName(
    record(30, (put16, put32) => {
      put32(LOCAL_HEADER_SIGNATURE);
      put16(ZIP_VERSION);
      put16(ZIP_FLAGS);
      put16(ZIP_METHOD_STORE);
      put16(0); // modification time
      put16(0); // modification date
      put32(crc);
      put32(size); // compressed size
      put32(size); // uncompressed size
      put16(nameBytes.length);
      put16(0); // extra field length
    }),
    nameBytes,
  );
}

function centralDirectoryEntry(nameBytes: Uint8Array, size: number, crc: number, offset: number): Uint8Array {
  return withName(
    record(46, (put16, put32) => {
      put32(CENTRAL_DIR_SIGNATURE);
      put16(ZIP_VERSION); // made by
      put16(ZIP_VERSION); // needed to extract
      put16(ZIP_FLAGS);
      put16(ZIP_METHOD_STORE);
      put16(0); // modification time
      put16(0); // modification date
      put32(crc);
      put32(size);
      put32(size);
      put16(nameBytes.length);
      put16(0); // extra field length
      put16(0); // comment length
      put16(0); // disk number
      put16(0); // internal attributes
      put32(0); // external attributes
      put32(offset);
    }),
    nameBytes,
  );
}

function endRecord(fileCount: number, centralSize: number, centralOffset: number): Uint8Array {
  return record(22, (put16, put32) => {
    put32(END_SIGNATURE);
    put16(0); // disk number
    put16(0); // disk holding the central directory
    put16(fileCount);
    put16(fileCount);
    put32(centralSize);
    put32(centralOffset);
    put16(0); // comment length
  });
}

export function packFilesToZip(files: Array<{ name: string; bytes: Uint8Array }>): Blob {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const crc = crc32(file.bytes);
    const header = localHeader(nameBytes, file.bytes.length, crc);
    central.push(centralDirectoryEntry(nameBytes, file.bytes.length, crc, offset));
    chunks.push(header, file.bytes);
    offset += header.length + file.bytes.length;
  }

  const centralSize = central.reduce((sum, entry) => sum + entry.length, 0);
  const parts = [...chunks, ...central, endRecord(files.length, centralSize, offset)];
  return new Blob(parts.map((part) => part.slice()), { type: "application/zip" });
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
