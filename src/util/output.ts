export interface OutputSink { stdout: NodeJS.WritableStream; stderr: NodeJS.WritableStream }

import { Writable } from 'node:stream';

export class TailBuffer extends Writable {
  private buf = Buffer.alloc(0);
  dropped = 0;
  constructor(private readonly maxBytes = 20_000) { super(); }
  override _write(chunk: Buffer, _enc: BufferEncoding, cb: (err?: Error | null) => void) {
    this.buf = Buffer.concat([this.buf, chunk]);
    if (this.buf.length > this.maxBytes) {
      this.dropped += this.buf.length - this.maxBytes;
      this.buf = this.buf.subarray(this.buf.length - this.maxBytes);
    }
    cb();
  }
  text(): string {
    return this.buf.toString('utf8');
  }
}
