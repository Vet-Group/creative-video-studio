import { describe, expect, it } from 'vitest';
import { optimizerImageSize } from './optimizer-image-size';

function webp(tag: string, payload: number[]) {
  const b = new Uint8Array(20 + payload.length + (payload.length & 1));
  b.set([... 'RIFF'].map(c => c.charCodeAt(0))); b.set([... 'WEBP'].map(c => c.charCodeAt(0)), 8);
  b.set([...tag].map(c => c.charCodeAt(0)), 12); b.set(payload, 20);
  const v = new DataView(b.buffer); v.setUint32(4, b.length - 8, true); v.setUint32(16, payload.length, true);
  return b;
}
const jpeg = new Uint8Array([255,216,255,224,0,4,0,0,255,192,0,11,8,0,20,0,30,1,1,17,0]);

describe('bounded optimizer header dimensions', () => {
  it('reads JPEG dimensions after a bounded application segment', () => {
    expect(optimizerImageSize(jpeg, 'image/jpeg')).toEqual({ width: 30, height: 20 });
    const fill = new Uint8Array([255,216,255,...jpeg.slice(2)]);
    expect(optimizerImageSize(fill, 'image/jpeg')).toEqual({ width: 30, height: 20 });
  });
  it('rejects JPEG truncation, short segments, missing SOF and component bounds', () => {
    for (let n = 0; n < jpeg.length; n++) expect(optimizerImageSize(jpeg.slice(0,n), 'image/jpeg')).toBeUndefined();
    for (const length of [0,1,65535]) { const b=jpeg.slice();new DataView(b.buffer).setUint16(4,length);expect(optimizerImageSize(b,'image/jpeg')).toBeUndefined(); }
    const bad=jpeg.slice();bad[17]=2;expect(optimizerImageSize(bad,'image/jpeg')).toBeUndefined();
    expect(optimizerImageSize(new Uint8Array([255,216,255,218,0,2]),'image/jpeg')).toBeUndefined();
  });
  it('reads all three WebP header variants including padded VP8L', () => {
    expect(optimizerImageSize(webp('VP8X',[0,0,0,0,29,0,0,19,0,0]),'image/webp')).toEqual({width:30,height:20});
    const bits=29 | (19<<14);const lossless=[47,bits&255,(bits>>>8)&255,(bits>>>16)&255,(bits>>>24)&255];
    expect(optimizerImageSize(webp('VP8L',lossless),'image/webp')).toEqual({width:30,height:20});
    expect(optimizerImageSize(webp('VP8 ',[0,0,0,157,1,42,30,0,20,0]),'image/webp')).toEqual({width:30,height:20});
    expect(optimizerImageSize(webp('VP8X',[2,0,0,0,29,0,0,19,0,0]),'image/webp')).toEqual({width:30,height:20});
  });
  it('rejects truncated WebP, RIFF/chunk bounds, invalid codec signatures and versions', () => {
    const valid=webp('VP8 ',[0,0,0,157,1,42,30,0,20,0]);
    for(let n=0;n<valid.length;n++)expect(optimizerImageSize(valid.slice(0,n),'image/webp')).toBeUndefined();
    const bad=valid.slice();new DataView(bad.buffer).setUint32(16,0xffffffff,true);expect(optimizerImageSize(bad,'image/webp')).toBeUndefined();
    expect(optimizerImageSize(webp('VP8 ',[0,0,0,0,1,42,30,0,20,0]),'image/webp')).toBeUndefined();
    expect(optimizerImageSize(webp('VP8L',[47,0,0,0,224]),'image/webp')).toBeUndefined();
    expect(optimizerImageSize(webp('VP8X',[1,0,0,0,0,0,0,0,0,0]),'image/webp')).toBeUndefined();
  });
  it('requires PNG IHDR with correct length and complete header', () => {
    const b=new Uint8Array(33);b.set([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);const v=new DataView(b.buffer);v.setUint32(16,30);v.setUint32(20,20);
    expect(optimizerImageSize(b,'image/png')).toEqual({width:30,height:20});
    for(let n=0;n<33;n++)expect(optimizerImageSize(b.slice(0,n),'image/png')).toBeUndefined();
    b[15]=0;expect(optimizerImageSize(b,'image/png')).toBeUndefined();
  });
});
