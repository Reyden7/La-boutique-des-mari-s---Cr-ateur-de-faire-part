// Code-native raster exports of the existing favicon's envelope geometry/colors.
// No external image, font or dependency; opaque background is maskable-safe.
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

function chunk(name, data) {
  const type=Buffer.from(name), all=Buffer.concat([type,data]); let crc=0xffffffff;
  for(const byte of all) { crc^=byte; for(let bit=0;bit<8;bit++) crc=(crc>>>1)^(crc&1?0xedb88320:0); }
  const length=Buffer.alloc(4), sum=Buffer.alloc(4); length.writeUInt32BE(data.length); sum.writeUInt32BE((crc^0xffffffff)>>>0);
  return Buffer.concat([length,all,sum]);
}
const inPolygon=(x,y,points)=>{
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++) {
    const [a,b]=points[i],[c,d]=points[j];
    if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a) inside=!inside;
  }
  return inside;
};
export function makePwaIcon(size) {
  const stride=size*4, raw=Buffer.alloc((stride+1)*size);
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const rgb=[0,0,0];
    for(let sy=0;sy<2;sy++) for(let sx=0;sx<2;sx++) {
      const px=(x+(sx+.5)/2)*64/size, py=(y+(sy+.5)/2)*64/size;
      let color=[47,51,46];
      if(inPolygon(px,py,[[16,26],[32,38],[48,26],[48,48],[16,48]])) color=[246,240,232];
      if(inPolygon(px,py,[[16,26],[32,39],[48,26],[32,17]])) color=[197,154,114];
      if((px-32)**2+(py-37)**2<=16) color=[154,79,75];
      for(let c=0;c<3;c++) rgb[c]+=color[c];
    }
    const offset=y*(stride+1)+1+x*4;
    for(let c=0;c<3;c++) raw[offset+c]=Math.round(rgb[c]/4);
    raw[offset+3]=255;
  }
  const header=Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size,4); header[8]=8; header[9]=6;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const output=new URL('../public/icons/',import.meta.url); mkdirSync(output,{recursive:true});
  for(const [name,size] of [['icon-192',192],['icon-512',512],['icon-maskable-512',512],['apple-touch-icon',180]]) {
    writeFileSync(new URL(`${name}.png`,output),makePwaIcon(size));
    console.log(`Generated ${name}.png (${size} × ${size})`);
  }
}
