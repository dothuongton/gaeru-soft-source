import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildPushPayload} from '@block65/webcrypto-web-push';

test('real Web Push signs a valid VAPID JWT and encrypts the notification with generated P-256 keys',async()=>{
 const vapid=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const receiver=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const publicKey=Buffer.from(await crypto.subtle.exportKey('raw',vapid.publicKey)).toString('base64url');
 const privateKey=(await crypto.subtle.exportKey('jwk',vapid.privateKey)).d;
 const endpoint='https://web.push.apple.com/test';
 const result=await buildPushPayload({data:JSON.stringify({title:'Test',body:'Private test content'}),options:{ttl:60}},
  {endpoint,expirationTime:null,keys:{p256dh:Buffer.from(await crypto.subtle.exportKey('raw',receiver.publicKey)).toString('base64url'),auth:Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url')}},
  {publicKey,privateKey,subject:'mailto:test@example.com'});
 const jwt=result.headers.authorization.match(/^vapid t=(.*), k=/)[1],parts=jwt.split('.');
 assert.equal(JSON.parse(Buffer.from(parts[1],'base64url').toString()).aud,new URL(endpoint).origin);
 assert.equal(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},vapid.publicKey,Buffer.from(parts[2],'base64url'),new TextEncoder().encode(parts[0]+'.'+parts[1])),true);
 assert.equal(result.headers['content-encoding'],'aes128gcm');
 assert.ok(result.body.byteLength<=4096);
 assert.equal(Buffer.from(result.body).includes(Buffer.from('Private test content')),false);
});
